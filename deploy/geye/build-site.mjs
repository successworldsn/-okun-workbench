#!/usr/bin/env node
/**
 * Builds deploy/geye/public for geye.successagenticlabs.com:
 *   index.html  Capital Desk on data/public/ga-infra.json (+ grid + satellite photos)
 *   deals.html  Deal Desk on the fictional EXAMPLE set
 * Never pass real Atlanta feed data here: it holds owner names and this site is public.
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "deploy", "geye", "public");
const build = join(root, "tools", "godseye-preview", "build.mjs");
const feed = join(root, "data", "public", "ga-infra.json");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const hasFeed = await stat(feed).then(() => true, () => false);
const run = (args) => execFileSync(process.execPath, [build, "--site", ...args], { cwd: root, stdio: "inherit" });
run(["--app", "capital", ...(hasFeed ? ["--data", feed] : []), "--out", join(out, "index.html")]);
run(["--app", "realestate", "--out", join(out, "deals.html")]);
console.log(`site ready in ${out}${hasFeed ? "" : " (no live feed found: Capital Desk shows EXAMPLE data)"}`);
