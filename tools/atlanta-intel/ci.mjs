#!/usr/bin/env node
/**
 * CI entry for .github/workflows/atlanta-feed.yml. Reads
 * tools/atlanta-intel/run-request.json (or workflow_dispatch inputs passed as
 * env) and runs discovery or the full feed + browser preview build, on
 * GitHub's runners where the public data servers are reachable.
 *
 *   { "mode": "discover" }
 *   { "mode": "feed", "since": 730, "zips": ["30310", "30314"], "counties": ["dekalb:30032"] }
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const req = existsSync("tools/atlanta-intel/run-request.json") ? JSON.parse(readFileSync("tools/atlanta-intel/run-request.json", "utf8")) : {};
const mode = process.env.INPUT_MODE || req.mode || "discover";
const zips = (process.env.INPUT_ZIPS || (req.zips ?? []).join(" ")).split(/[\s,]+/).filter((z) => /^\d{5}$/.test(z));
const since = Number(process.env.INPUT_SINCE || req.since || 730);
const counties = (req.counties ?? []).filter((c) => /^[a-z]+:[\d,]+$/.test(c));

const run = (args) => {
  console.log(`\n$ node ${args.join(" ")}`);
  const r = spawnSync("node", args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log(`mode=${mode} since=${since} zips=${zips.join(",") || "—"} counties=${counties.join(" ") || "—"}`);
if (mode === "discover") run(["tools/atlanta-intel/atlanta-feed.mjs", "--discover"]);
else if (mode === "feed") {
  run(["tools/atlanta-intel/atlanta-feed.mjs", "--since", String(since), ...zips.flatMap((z) => ["--zip", z]), ...counties.flatMap((c) => ["--county", c])]);
  run(["tools/godseye-preview/build.mjs", "--data", "data/atlanta-intel.json"]);
} else {
  console.error(`Unknown mode "${mode}" (discover | feed).`);
  process.exit(1);
}
