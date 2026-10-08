/**
 * Live infrastructure for the Capital Desk: data/public/ga-infra.json, written
 * weekly by .github/workflows/ga-infra-feed.yml from public EIA / HIFLD layers.
 * Order: CI_INFRA_URL → the file deployed with the app → the copy on GitHub.
 * Returns null when none can be read; the page then shows example data.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Site } from "./ci-intel";

export interface InfraFeed {
  version: number;
  state: string;
  generatedAt: string;
  sources: { id: string; label: string; url: string; records?: number; pulledAt?: string }[];
  counts: Record<string, number>;
  sites: Site[];
}

const RAW = "https://raw.githubusercontent.com/successworldsn/-okun-workbench/main/data/public/ga-infra.json";
let cache: { at: number; feed: InfraFeed | null } | null = null;

function valid(j: unknown): InfraFeed | null {
  const f = j as InfraFeed;
  return f && Array.isArray(f.sites) && f.sites.length && typeof f.generatedAt === "string" ? f : null;
}

export async function loadInfraFeed(): Promise<InfraFeed | null> {
  if (cache && Date.now() - cache.at < 15 * 60_000) return cache.feed;
  let feed: InfraFeed | null = null;
  const url = process.env.CI_INFRA_URL;
  if (url) feed = await fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(valid).catch(() => null);
  if (!feed) feed = await readFile(join(process.cwd(), "data", "public", "ga-infra.json"), "utf8").then((t) => valid(JSON.parse(t))).catch(() => null);
  if (!feed && process.env.CI_INFRA_GITHUB !== "off") feed = await fetch(RAW, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(valid).catch(() => null);
  cache = { at: Date.now(), feed };
  return feed;
}
