/**
 * Green Advantage intelligence — reader for Muse's intel.json (spec S260925-INTEL01).
 *
 * The desk's rule: every item links to its source and says where in Florida it
 * is. So this module only passes through v2 items that meet the spec's shape;
 * anything else is dropped (and counted) rather than shown. A v1 feed yields no
 * items at all — v1 has no source links on its cards and its counts carry no
 * windows, so nothing from it can go on the desk.
 *
 * Pure (no fetch, no React) so it can be unit-tested with node --test.
 */

export const MARKETS = ["miami-dade", "alachua", "duval", "florida-other", "statewide", "national", "out-of-state"] as const;
export type Market = (typeof MARKETS)[number];

export const FEEDS = ["city-signals", "money-found", "money-moving"] as const;
export type Feed = (typeof FEEDS)[number];

/** The desk's filter. "florida" = every Florida market (drops national + out-of-state). */
export const MARKET_FILTERS = [
  { key: "florida", label: "Florida" },
  { key: "miami-dade", label: "Miami-Dade" },
  { key: "alachua", label: "Alachua" },
  { key: "duval", label: "Duval" },
  { key: "statewide", label: "Statewide" },
  { key: "all", label: "All" },
] as const;
export type MarketFilter = (typeof MARKET_FILTERS)[number]["key"];

const FLORIDA_MARKETS: Market[] = ["miami-dade", "alachua", "duval", "florida-other", "statewide"];

export interface Geo {
  state: string | null;
  county: string | null;
  city: string | null;
  market: Market;
}

interface ItemBase {
  id: string;
  feed: Feed;
  title: string;
  source: string;
  source_url: string;
  detected_at: string; // YYYY-MM-DD
  geo: Geo;
  category: string | null;
}

export interface CitySignal extends ItemBase {
  feed: "city-signals";
  meaning: string | null;
  opportunity: string | null;
  action: string | null;
  priority: "high" | "normal";
}

export interface MoneyFound extends ItemBase {
  feed: "money-found";
  type: string | null;
  amount: string | null;
  deadline: string | null;
  eligibility_note: string | null;
  action: string | null;
}

export interface MoneyMoving extends ItemBase {
  feed: "money-moving";
  type: string | null;
  location: string | null;
  commercial_demand: string[];
}

export type IntelItem = CitySignal | MoneyFound | MoneyMoving;

export interface TranslatorCard {
  title: string;
  signal: string | null;
  meaning: string | null;
  opportunity: string | null;
  action: string | null;
  impact: string | null;
  why_now: string | null;
  whats_next: string | null;
  cites: string[];
}

export interface SourceStatus {
  name: string;
  status: string; // "live" | "stale" | "blocked" | ...
  newest_record: string | null;
  reason: string | null;
}

export interface ParsedIntel {
  version: number | null;
  generatedAt: string | null;
  items: IntelItem[];
  cards: TranslatorCard[];
  sources: SourceStatus[];
  dropped: { id: string; reason: string }[];
  /** Why nothing can be shown, when that's the case (v1 feed, bad JSON). */
  notReady: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Spec F: no phone numbers or emails anywhere in an item.
const PHONE = /\(\d{3}\)\s?\d{3}-\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}/i;
// Spec C: Broward / Palm Beach places are never Miami-Dade.
const NOT_MIAMI_DADE = /fort lauderdale|palm beach|dania|broward|boca raton|hollywood, fl|pompano/i;
// Spec G: no NIH, clinical trials or RFIs in money-found.
const NOT_CLAIMABLE = /clinical trial|^RFI\b|request for information/i;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A source_url must be the record itself: http(s), and not a bare homepage. */
export function isRecordUrl(u: unknown): u is string {
  if (typeof u !== "string") return false;
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return url.pathname.replace(/\/+$/, "") !== "" || url.search !== "";
}

export function validateItem(raw: unknown): { item: IntelItem } | { reason: string } {
  if (!isObj(raw)) return { reason: "not an object" };
  const id = str(raw.id);
  if (!id) return { reason: "no id" };
  const feed = raw.feed as Feed;
  if (!FEEDS.includes(feed)) return { reason: `unknown feed ${String(raw.feed)}` };
  const title = str(raw.title);
  if (!title) return { reason: "no title" };
  const source = str(raw.source);
  if (!source) return { reason: "no source" };
  if (!isRecordUrl(raw.source_url)) return { reason: "no record source_url" };
  const detected_at = str(raw.detected_at);
  if (!detected_at || !DATE.test(detected_at)) return { reason: "bad detected_at" };
  if (!isObj(raw.geo)) return { reason: "no geo" };
  const market = raw.geo.market as Market;
  if (!MARKETS.includes(market)) return { reason: `unknown market ${String(raw.geo.market)}` };
  const geo: Geo = { state: str(raw.geo.state), county: str(raw.geo.county), city: str(raw.geo.city), market };
  if (market === "miami-dade" && NOT_MIAMI_DADE.test(`${title} ${geo.city ?? ""} ${geo.county ?? ""}`)) {
    return { reason: "filed as miami-dade but not in Miami-Dade" };
  }
  const text = JSON.stringify(raw);
  if (PHONE.test(text) || EMAIL.test(text)) return { reason: "contains a phone number or email" };

  const base = { id, title, source, source_url: raw.source_url as string, detected_at, geo, category: str(raw.category) };
  if (feed === "city-signals") {
    return {
      item: {
        ...base,
        feed,
        meaning: str(raw.meaning),
        opportunity: str(raw.opportunity),
        action: str(raw.action),
        priority: raw.priority === "high" ? "high" : "normal",
      },
    };
  }
  if (feed === "money-found") {
    if (NOT_CLAIMABLE.test(title) || /HHS-NIH/.test(String(raw.agencyCode ?? ""))) return { reason: "not claimable money (NIH/clinical/RFI)" };
    const deadline = str(raw.deadline);
    if (deadline && !DATE.test(deadline)) return { reason: "bad deadline" };
    return {
      item: {
        ...base,
        feed,
        type: str(raw.type),
        amount: raw.amount == null ? null : String(raw.amount),
        deadline,
        eligibility_note: str(raw.eligibility_note),
        action: str(raw.action),
      },
    };
  }
  return {
    item: {
      ...base,
      feed,
      type: str(raw.type),
      location: str(raw.location),
      commercial_demand: Array.isArray(raw.commercial_demand) ? raw.commercial_demand.filter((d): d is string => typeof d === "string") : [],
    },
  };
}

export function parseIntel(json: unknown): ParsedIntel {
  const empty: ParsedIntel = { version: null, generatedAt: null, items: [], cards: [], sources: [], dropped: [], notReady: null };
  if (!isObj(json)) return { ...empty, notReady: "Feed is not a JSON object." };

  const version = typeof json.version === "number" ? json.version : 1;
  const generatedAt = str(json.generated_at) ?? str(json.generated_at_et);
  const sources: SourceStatus[] = isObj(json.feeds)
    ? Object.entries(json.feeds).map(([name, f]) => {
        const o = isObj(f) ? f : {};
        return { name, status: str(o.status) ?? "unknown", newest_record: str(o.newest_record), reason: str(o.reason) ?? str(o.note) };
      })
    : [];

  if (version < 2 || !Array.isArray(json.items)) {
    return {
      ...empty,
      version,
      generatedAt,
      sources,
      notReady: "Muse is still publishing intel.json v1. Nothing goes on the desk until v2 (a source link and a Florida market on every item) passes the S260925-INTEL01 checks.",
    };
  }

  const items: IntelItem[] = [];
  const dropped: ParsedIntel["dropped"] = [];
  const seen = new Set<string>();
  for (const raw of json.items) {
    const r = validateItem(raw);
    const rid = isObj(raw) && typeof raw.id === "string" ? raw.id : "?";
    if ("reason" in r) dropped.push({ id: rid, reason: r.reason });
    else if (seen.has(r.item.id)) dropped.push({ id: rid, reason: "duplicate id" });
    else {
      seen.add(r.item.id);
      items.push(r.item);
    }
  }

  // Spec E: a card shows only if it is marked interpretation and every cite resolves to a shown item.
  const cards: TranslatorCard[] = [];
  for (const c of Array.isArray(json.translator) ? json.translator : []) {
    if (!isObj(c) || c.interpretation !== true || !Array.isArray(c.cites) || !c.cites.length) continue;
    const cites = c.cites.filter((x): x is string => typeof x === "string");
    if (cites.length !== c.cites.length || cites.some((x) => !seen.has(x))) continue;
    const title = str(c.title);
    if (!title) continue;
    cards.push({
      title,
      signal: str(c.signal),
      meaning: str(c.meaning),
      opportunity: str(c.opportunity),
      action: str(c.action),
      impact: str(c.impact),
      why_now: str(c.why_now),
      whats_next: str(c.whats_next),
      cites,
    });
  }

  return { version, generatedAt, items, cards, sources, dropped, notReady: null };
}

export function matchesMarket(market: Market, filter: MarketFilter): boolean {
  if (filter === "all") return true;
  if (filter === "florida") return FLORIDA_MARKETS.includes(market);
  return market === filter;
}

export function toMarketFilter(v: string | string[] | undefined): MarketFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return MARKET_FILTERS.some((f) => f.key === s) ? (s as MarketFilter) : "florida";
}

/** Newest first; high-priority city signals ahead of normal ones on the same day. */
export function sortItems(items: IntelItem[]): IntelItem[] {
  const pri = (i: IntelItem) => (i.feed === "city-signals" && i.priority === "high" ? 0 : 1);
  return [...items].sort((a, b) => b.detected_at.localeCompare(a.detected_at) || pri(a) - pri(b) || a.title.localeCompare(b.title));
}

export const MARKET_LABELS: Record<Market, string> = {
  "miami-dade": "Miami-Dade",
  alachua: "Alachua",
  duval: "Duval",
  "florida-other": "Florida",
  statewide: "Statewide",
  national: "National",
  "out-of-state": "Out of state",
};
