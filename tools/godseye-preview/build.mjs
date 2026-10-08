#!/usr/bin/env node
/**
 * Builds the self-contained God's Eye browser preview: one HTML file with the
 * real Deal Desk, engines and EXAMPLE data bundled in, Tailwind compiled, and
 * Atlanta terrain tiles embedded (no tile server needed).
 *
 *   node tools/godseye-preview/build.mjs [--app realestate|capital] [--out dist/…html] [--data data/atlanta-intel.json]
 *
 * With --data the page runs on a real feed output instead of the EXAMPLE set:
 * the top 1,500 leads by score plus up to 4,000 recent sales as the comp pool.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const args = process.argv.slice(2);
const app = args.includes("--app") ? args[args.indexOf("--app") + 1] : "realestate";
const APPS = { realestate: { entry: "entry.tsx", out: "godseye-preview.html", title: "God's Eye Deal Desk" }, capital: { entry: "capital-entry.tsx", out: "capital-preview.html", title: "God's Eye Capital Desk" } };
if (!APPS[app]) throw new Error(`--app must be one of ${Object.keys(APPS).join(", ")}`);
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(root, "dist", APPS[app].out);
const dataPath = args.includes("--data") ? args[args.indexOf("--data") + 1] : null;
const MAX_LEADS = 1500, MAX_POOL = 4000;
const cache = join(root, "data", "terrain-cache");

// Atlanta box, zooms 8–12 (z12 ≈ 38 m per pixel; MapLibre over-zooms past it).
const BOUNDS = [-84.56, 33.6, -84.2, 33.86];
const MINZ = 8, MAXZ = 12;
const tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const ty = (lat, z) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

async function terrain() {
  await mkdir(cache, { recursive: true });
  const tiles = {};
  for (let z = MINZ; z <= MAXZ; z++)
    for (let x = tx(BOUNDS[0], z); x <= tx(BOUNDS[2], z); x++)
      for (let y = ty(BOUNDS[3], z); y <= ty(BOUNDS[1], z); y++) {
        const f = join(cache, `${z}-${x}-${y}.png`);
        let buf;
        try {
          await access(f);
          buf = await readFile(f);
        } catch {
          const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`);
          if (!res.ok) throw new Error(`terrain ${z}/${x}/${y}: HTTP ${res.status}`);
          buf = Buffer.from(await res.arrayBuffer());
          await writeFile(f, buf);
        }
        tiles[`${z}/${x}/${y}`] = buf.toString("base64");
      }
  return { tiles, bounds: BOUNDS, minzoom: MINZ, maxzoom: MAXZ };
}

const bin = (n) => join(root, "node_modules", ".bin", n);

/** Real feed output → the slice the page carries (leads + comp pool), analyzed with the same engine. */
async function realData() {
  if (!dataPath) return null;
  if (app === "capital") return JSON.parse(await readFile(dataPath, "utf8")); // public infra feed, carried whole
  const { analyzeAll, isUsableSale } = await import("../../src/lib/re-intel.ts");
  const j = JSON.parse(await readFile(dataPath, "utf8"));
  const now = new Date();
  const ranked = analyzeAll(j.properties, j.market ?? {}, now);
  const leadIds = new Set(ranked.slice(0, MAX_LEADS).map((i) => i.p.id));
  const pool = j.properties.filter((p) => !leadIds.has(p.id) && isUsableSale(p, now)).slice(0, MAX_POOL).map((p) => ({ ...p, compOnly: true }));
  const props = [...j.properties.filter((p) => leadIds.has(p.id)), ...pool];
  console.log(`data: ${leadIds.size} leads + ${pool.length} comp sales of ${j.properties.length} properties`);
  return { generatedAt: j.generatedAt, sources: j.sources ?? [], market: j.market ?? {}, properties: props, total: j.properties.length };
}

async function main() {
  const t = await terrain();
  const data = await realData();
  console.log(`terrain: ${Object.keys(t.tiles).length} tiles`);
  const tmp = join(root, "data", "preview-build");
  await mkdir(tmp, { recursive: true });

  execFileSync(bin("tailwindcss"), ["-c", join(root, "tailwind.config.ts"), "-i", join(here, "preview.css"), "-o", join(tmp, "app.css"), "--minify"], { cwd: root, stdio: "inherit" });

  execFileSync(
    "npx",
    [
      "--yes", "esbuild@0.24.0", join(here, APPS[app].entry),
      "--bundle", "--minify", "--format=iife", "--target=es2020", "--jsx=automatic",
      `--outfile=${join(tmp, "app.js")}`,
      `--alias:@/app/realestate/actions=${join(here, "shims", "actions.ts")}`,
      `--alias:next/link=${join(here, "shims", "link.tsx")}`,
      `--alias:next/dynamic=${join(here, "shims", "dynamic.tsx")}`,
      `--alias:@=${join(root, "src")}`,
      "--define:process.env.NODE_ENV=\"production\"",
      "--define:__TERRAIN__=globalThis.__GE_TERRAIN__",
      "--loader:.css=empty",
      "--log-level=warning",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const css = await readFile(join(tmp, "app.css"), "utf8");
  const mlcss = await readFile(join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl.css"), "utf8");
  const js = (await readFile(join(tmp, "app.js"), "utf8")).replace(/<\/script/gi, "<\\/script");
  const html = `<title>${APPS[app].title}</title>
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap">
<style>
/* Single deliberate dark look: the command-center HUD from the workbench (obsidian ground, cyan "system alive", gold actions). */
:root{color-scheme:dark;--font-display:"Space Grotesk",system-ui,sans-serif;--font-body:"Inter",system-ui,sans-serif;--font-data:"JetBrains Mono",ui-monospace,monospace}
html,body{height:100%;background:#02040A;color:#F8FAFC}
#root{height:100%}
${mlcss}
${css}
</style>
<div id="root"></div>
<script>globalThis.__GE_TERRAIN__=${JSON.stringify(t)};${data ? `globalThis.__GE_DATA__=${JSON.stringify(data).replace(/</g, "\\u003c")};` : ""}</script>
<script>${js}</script>
`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html);
  console.log(`wrote ${out} (${(html.length / 1e6).toFixed(2)} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
