/**
 * Buyer network — the OWN ace. Your investors and what each one buys, matched
 * against every property the engines score. Pure functions; storage lives in
 * re-desk-store.ts. A match never sends anything: the desk drafts a deal
 * sheet and you send it yourself.
 */
import type { Intel, PropertyRecord, StrategyKey } from "./re-intel.ts";

export type PropType = "sfr" | "multi_2_4" | "multi_5" | "condo_town" | "land";
export const PROP_TYPE_LABELS: Record<PropType, string> = {
  sfr: "Single-family",
  multi_2_4: "2–4 units",
  multi_5: "5+ units",
  condo_town: "Condo / townhome",
  land: "Land / lot",
};
export const BUYER_STRATEGIES: StrategyKey[] = ["wholesale", "flip", "rental", "brrrr", "mf_conversion", "development", "land"];

export interface Buyer {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  /** ZIPs they buy in; empty = no ZIP limit (then counties apply). */
  zips: string[];
  counties: string[];
  types: PropType[];
  strategies: StrategyKey[];
  minPrice?: number | null;
  maxPrice?: number | null;
  maxRehab?: number | null;
  minBeds?: number | null;
  cash: boolean;
  pofVerified: boolean;
  closeDays?: number | null;
  dealsClosed?: number;
  notes?: string;
  active: boolean;
  example?: boolean;
  updatedAt: string;
}

export function propType(p: PropertyRecord): PropType {
  const u = p.existingUnits ?? 1;
  if (u >= 5) return "multi_5";
  if (u >= 2) return "multi_2_4";
  if (/vacant|land|lot/i.test(p.landUse ?? "") || (!p.sqft && !p.yearBuilt)) return "land";
  if (/condo|town/i.test(p.landUse ?? "")) return "condo_town";
  return "sfr";
}

const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

/**
 * What this buyer would pay: fix-and-flip / wholesale / BRRRR buyers price off
 * ARV × 70% − rehab; rental buyers off as-is value; builders off land value.
 */
export function buyerPrice(i: Intel, b: Buyer): { price: number | null; basis: string } {
  const flipper = b.strategies.some((s) => s === "flip" || s === "wholesale" || s === "brrrr");
  if (flipper && i.value.arv != null && i.rehab.value != null)
    return { price: Math.max(0, Math.round(i.value.arv * 0.7 - i.rehab.value)), basis: `ARV ${money(i.value.arv)} × 70% − ${i.rehab.fromWalkthrough ? "walk-through" : i.rehab.tier} rehab ${money(i.rehab.value)}` };
  if (b.strategies.some((s) => s === "development" || s === "land") && i.p.landValue != null)
    return { price: i.p.landValue, basis: "County land value" };
  if (i.value.current != null) return { price: i.value.current, basis: "Estimated as-is value" };
  return { price: null, basis: "No value on file" };
}

export interface BuyerMatch {
  buyer: Buyer;
  fit: number;
  price: number | null;
  priceBasis: string;
  why: string[];
  misses: string[];
}

export function matchBuyer(i: Intel, b: Buyer): BuyerMatch {
  const p = i.p;
  const why: string[] = [];
  const misses: string[] = [];
  const { price, basis } = buyerPrice(i, b);

  if (b.zips.length) {
    if (p.zip && b.zips.includes(p.zip)) why.push(`buys in ${p.zip}`);
    else misses.push(`outside their ZIPs (${p.zip ?? "no ZIP"})`);
  } else if (b.counties.length) {
    if (p.county && b.counties.some((c) => c.toLowerCase() === p.county!.toLowerCase())) why.push(`buys in ${p.county} County`);
    else misses.push(`outside their counties (${p.county ?? "?"})`);
  }
  const t = propType(p);
  if (b.types.length) {
    if (b.types.includes(t)) why.push(PROP_TYPE_LABELS[t]);
    else misses.push(`not a property type they buy (${PROP_TYPE_LABELS[t]})`);
  }
  if (price != null) {
    if (b.minPrice != null && price < b.minPrice) misses.push(`${money(b.minPrice - price)} under their minimum`);
    else if (b.maxPrice != null && price > b.maxPrice) misses.push(`${money(price - b.maxPrice)} over their maximum`);
    else if (b.minPrice != null || b.maxPrice != null) why.push(`their price ${money(price)} fits`);
  }
  if (b.maxRehab != null && i.rehab.value != null) {
    if (i.rehab.value > b.maxRehab) misses.push(`rehab ${money(i.rehab.value)} over their ${money(b.maxRehab)} limit`);
    else why.push("rehab within limit");
  }
  if (b.minBeds != null && p.beds != null && p.beds < b.minBeds) misses.push(`${p.beds} bd, they want ${b.minBeds}+`);

  const strat = b.strategies.length ? Math.max(0, ...i.strategies.filter((s) => b.strategies.includes(s.key)).map((s) => s.fit)) : 50;
  const bestStrat = i.strategies.find((s) => b.strategies.includes(s.key));
  if (bestStrat && bestStrat.fit >= 50) why.push(`${bestStrat.key.replace("_", " ")} fits ${bestStrat.fit}`);
  if (b.pofVerified) why.push("proof of funds on file");
  else if (b.cash) why.push("cash buyer");
  if (b.closeDays != null && b.closeDays <= 14) why.push(`closes in ${b.closeDays} days`);
  if (b.dealsClosed) why.push(`${b.dealsClosed} deal${b.dealsClosed > 1 ? "s" : ""} closed with you`);

  const fit = Math.round(
    Math.min(100, 35 + 0.35 * strat + (b.pofVerified ? 12 : b.cash ? 6 : 0) + (b.closeDays != null && b.closeDays <= 14 ? 6 : 0) + Math.min(12, 4 * (b.dealsClosed ?? 0))),
  );
  return { buyer: b, fit, price, priceBasis: basis, why, misses };
}

/** Full matches (no misses) by fit, plus near misses (exactly one miss) worth a call anyway. */
export function matchBuyers(i: Intel, buyers: Buyer[]): { matches: BuyerMatch[]; nearMisses: BuyerMatch[] } {
  const all = buyers.filter((b) => b.active).map((b) => matchBuyer(i, b));
  return {
    matches: all.filter((m) => !m.misses.length).sort((a, b) => b.fit - a.fit),
    nearMisses: all.filter((m) => m.misses.length === 1).sort((a, b) => b.fit - a.fit),
  };
}

// ─── Deal sheet (what you send a buyer) ─────────────────────────────────────

export function dealSheet(i: Intel, m: BuyerMatch | null): string {
  const p = i.p;
  const best = i.strategies.find((s) => s.key !== "no_go");
  const comps = i.comps?.renovated ?? [];
  return [
    `DEAL: ${p.address}${p.city ? `, ${p.city}` : ""} ${p.zip ?? ""}`.trim(),
    [p.beds != null && `${p.beds} bd`, p.baths != null && `${p.baths} ba`, p.sqft && `${p.sqft.toLocaleString()} sq ft`, p.yearBuilt && `built ${p.yearBuilt}`, p.lotSqft && `lot ${p.lotSqft.toLocaleString()} sq ft`, p.zoning && `zoned ${p.zoning}`].filter(Boolean).join(" · "),
    "",
    `Price: [your price]${m?.price != null ? `  (your numbers support up to ~${money(m.price)}: ${m.priceBasis})` : ""}`,
    i.value.arv != null ? `ARV: ${money(i.value.arv)} (${i.value.arvBasis})` : "ARV: [confirm]",
    i.rehab.value != null ? `Rehab estimate: ${money(i.rehab.value)} (${i.rehab.fromWalkthrough ? "line-item scope from our walk-through" : `${i.rehab.tier} scope, screen only — walk it`})` : "Rehab: [walk-through]",
    best ? `Best exit: ${best.key.replace("_", " ")} — ${best.economics}` : "",
    comps.length ? `Renovated comps:\n${comps.map((c) => `  • ${c.address} — ${money(c.price)} (${money(c.ppsf)}/sq ft), ${c.miles} mi, ${c.saleDate.slice(0, 10)}`).join("\n")}` : "",
    "",
    "Access: [lockbox / showing times]   Close by: [date]   EMD: [amount]",
    "Sold as-is. Buyer to verify all information.",
    "[Your name] · [Your phone]",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

// ─── CSV import ─────────────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f); f = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f);
  if (row.some((x) => x.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return body.map((r) => Object.fromEntries(keys.map((k, n) => [k, (r[n] ?? "").trim()])));
}

const list = (s?: string) => (s ?? "").split(/[;,|/\s]+/).map((x) => x.trim()).filter(Boolean);
const num = (s?: string) => {
  if (!s) return null;
  const m = s.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([km])?$/i);
  if (!m) return null;
  return Number(m[1]) * (m[2]?.toLowerCase() === "k" ? 1e3 : m[2]?.toLowerCase() === "m" ? 1e6 : 1);
};
const yes = (s?: string) => /^(y|yes|true|1|x)$/i.test(s ?? "");

const TYPE_WORDS: [RegExp, PropType][] = [
  [/sfr|single|house|sfh/i, "sfr"],
  [/2-?4|duplex|triplex|quad|small multi/i, "multi_2_4"],
  [/5\+|apartment|large multi|multifamily/i, "multi_5"],
  [/condo|town/i, "condo_town"],
  [/land|lot/i, "land"],
];
const STRAT_WORDS: [RegExp, StrategyKey][] = [
  [/wholesale|assign/i, "wholesale"],
  [/flip|fix/i, "flip"],
  [/rental|hold|landlord|buy.?and.?hold/i, "rental"],
  [/brrrr/i, "brrrr"],
  [/convers|mf|multi/i, "mf_conversion"],
  [/develop|build|infill/i, "development"],
  [/land/i, "land"],
];

/** Paste from a spreadsheet: name, company, phone, email, zips, counties, types, strategies, min/max price, max rehab, cash, pof, close days, notes. */
export function importBuyersCsv(text: string, now: Date): { buyers: Buyer[]; errors: string[] } {
  const errors: string[] = [];
  const buyers: Buyer[] = [];
  parseCsv(text).forEach((r, n) => {
    const name = r.name || r.buyer || r.contact;
    if (!name) {
      errors.push(`Row ${n + 2}: no name`);
      return;
    }
    const types = [...new Set(list(r.types || r.type || r.propertytypes).flatMap((w) => TYPE_WORDS.filter(([re]) => re.test(w)).map(([, t]) => t)))];
    const strategies = [...new Set(list(r.strategies || r.strategy || r.exits).flatMap((w) => STRAT_WORDS.filter(([re]) => re.test(w)).map(([, t]) => t)))];
    buyers.push({
      id: `b-${now.getTime().toString(36)}-${n}`,
      name,
      company: r.company || undefined,
      phone: r.phone || undefined,
      email: r.email || undefined,
      zips: list(r.zips || r.zip || r.zipcodes).filter((z) => /^\d{5}$/.test(z)),
      counties: list(r.counties || r.county).map((c) => c.replace(/county/i, "").trim()).filter(Boolean),
      types,
      strategies,
      minPrice: num(r.minprice || r.min),
      maxPrice: num(r.maxprice || r.max),
      maxRehab: num(r.maxrehab || r.rehab),
      minBeds: num(r.minbeds || r.beds),
      cash: yes(r.cash),
      pofVerified: yes(r.pof || r.proofoffunds || r.pofverified),
      closeDays: num(r.closedays || r.close),
      notes: r.notes || undefined,
      active: true,
      updatedAt: now.toISOString(),
    });
  });
  return { buyers, errors };
}
