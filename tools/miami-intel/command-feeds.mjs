#!/usr/bin/env node
/**
 * Command Center feeds — Muse's intel.json v2, checked and tagged for the desk
 * (spec S260925-INTEL01, builderSide step 1).
 *
 * Reads Muse's feed, keeps only items that pass the desk's rules (the same
 * parseIntel() the /greenadvantage/command page uses, so the two can't drift),
 * and tags each with origin "muse:intel" so it can sit beside the desk's own
 * county/city pulls, which are tagged origin "direct" with geo.market
 * "miami-dade".
 *
 *   node tools/miami-intel/command-feeds.mjs            # summary + JSON to stdout
 *   node tools/miami-intel/command-feeds.mjs --out f.json
 *
 * Or from the hand-run pull:
 *   import { pullMuseIntel, mergeFeeds } from "./command-feeds.mjs";
 *   const muse = await pullMuseIntel();
 *   const all = mergeFeeds(directItems, muse.items);
 *
 * Env: INTEL_FEED_URL (default Muse's here.now feed). Needs Node >= 22.18
 * (imports the page's TypeScript rules directly, like `npm test` does).
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { parseIntel } from "../../src/lib/intel-feed.ts";

export const MUSE_ORIGIN = "muse:intel";
export const FEED_URL = process.env.INTEL_FEED_URL || "https://mystic-coral-txex.here.now/intel.json";

/** Fetch + check Muse's feed. Never throws: a failed read comes back as notReady. */
export async function pullMuseIntel(url = FEED_URL, fetchImpl = fetch) {
  let parsed;
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    parsed = parseIntel(await res.json());
  } catch (e) {
    parsed = { ...parseIntel(null), notReady: `Could not read Muse's feed (${e.message}).` };
  }
  return {
    ...parsed,
    items: parsed.items.map((i) => ({ ...i, origin: MUSE_ORIGIN })),
  };
}

/**
 * Direct pulls first; a Muse item is dropped if the desk already has the same
 * record (same source_url), so nothing shows twice.
 */
export function mergeFeeds(directItems, museItems) {
  const direct = directItems.map((i) => ({ origin: "direct", ...i, geo: i.geo ?? { state: "FL", county: "Miami-Dade", city: null, market: "miami-dade" } }));
  const seen = new Set(direct.map((i) => i.source_url));
  return [...direct, ...museItems.filter((i) => !seen.has(i.source_url))];
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const out = outIdx >= 0 ? args[outIdx + 1] : null;

  const muse = await pullMuseIntel();
  const byMarket = {};
  for (const i of muse.items) byMarket[i.geo.market] = (byMarket[i.geo.market] ?? 0) + 1;

  console.error(`muse:intel  ${FEED_URL}`);
  console.error(`  version ${muse.version ?? "?"} · generated ${muse.generatedAt ?? "?"}`);
  if (muse.notReady) console.error(`  NOT READY: ${muse.notReady}`);
  console.error(`  ${muse.items.length} items kept · ${muse.dropped.length} held back · ${muse.cards.length} cards`);
  console.error(`  by market: ${JSON.stringify(byMarket)}`);
  for (const d of muse.dropped) console.error(`  held back ${d.id}: ${d.reason}`);
  for (const s of muse.sources.filter((s) => s.status !== "live")) console.error(`  source ${s.name}: ${s.status}${s.reason ? ` — ${s.reason}` : ""}`);

  const body = JSON.stringify({ origin: MUSE_ORIGIN, version: muse.version, generated_at: muse.generatedAt, items: muse.items, cards: muse.cards, sources: muse.sources }, null, 2);
  if (out) {
    await writeFile(out, body + "\n");
    console.error(`  wrote ${out}`);
  } else {
    console.log(body);
  }
  process.exitCode = muse.notReady ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
