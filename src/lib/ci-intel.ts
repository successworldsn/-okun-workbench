/**
 * God's Eye — AI Infrastructure Intelligence (the Capital Desk).
 *
 * FIND THE MONEY BEFORE IT MOVES: signals → sites (power, fiber, land,
 * water, zoning) → who needs them (capital, developers, end users) → a
 * "constellation" of parties that fit together → a deal.
 *
 * Pure functions, same rules as the property engine: every score carries its
 * evidence and a freshness badge, confidence drops when facts are single-
 * sourced or assumed, and nothing pretends to know what a utility has not
 * committed (available MW is "reported" or "estimated", never promised).
 */

// ─── Sources ────────────────────────────────────────────────────────────────

export type CiSourceId =
  | "eia_860" // EIA generator inventory
  | "hifld" // HIFLD substations / transmission lines
  | "utility_irp" // utility integrated resource plan / large-load filings (GA PSC)
  | "interconnection" // interconnection / large-load queue
  | "county_parcels"
  | "county_zoning"
  | "fema"
  | "news" // press release / news report
  | "sec_filing" // EDGAR (Form D, 8-K)
  | "company" // company statement / website
  | "conversation" // what a party told you
  | "estimate" // engine assumption
  | "manual";

export const CI_SOURCES: Record<CiSourceId, { label: string; kind: "government" | "filing" | "press" | "derived" | "manual"; maxAgeDays: number }> = {
  eia_860: { label: "EIA-860 generator inventory", kind: "government", maxAgeDays: 400 },
  hifld: { label: "HIFLD substations + transmission lines", kind: "government", maxAgeDays: 730 },
  utility_irp: { label: "Utility IRP / large-load filing (GA PSC)", kind: "filing", maxAgeDays: 540 },
  interconnection: { label: "Interconnection / large-load queue", kind: "filing", maxAgeDays: 180 },
  county_parcels: { label: "County parcel records", kind: "government", maxAgeDays: 400 },
  county_zoning: { label: "County / city zoning", kind: "government", maxAgeDays: 730 },
  fema: { label: "FEMA flood hazard layer", kind: "government", maxAgeDays: 1825 },
  news: { label: "News / press release", kind: "press", maxAgeDays: 365 },
  sec_filing: { label: "SEC EDGAR filing", kind: "filing", maxAgeDays: 540 },
  company: { label: "Company statement", kind: "press", maxAgeDays: 365 },
  conversation: { label: "Your conversation", kind: "manual", maxAgeDays: 120 },
  estimate: { label: "Engine estimate (assumption)", kind: "derived", maxAgeDays: 36500 },
  manual: { label: "Entered by you", kind: "manual", maxAgeDays: 365 },
};

export type CiBadge = "VERIFIED" | "REPORTED" | "INFERRED" | "STALE";

export interface CiEvidence {
  source: CiSourceId;
  detail: string;
  observedAt: string | null;
  url?: string;
}

const DAY = 86_400_000;
const daysSince = (iso: string | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / DAY : Infinity);

/** VERIFIED = government record in date; REPORTED = filing / press / a party's word; INFERRED = our assumption; STALE = past its window. */
export function ciBadge(e: CiEvidence, now: Date): CiBadge {
  const s = CI_SOURCES[e.source];
  if (s.kind === "derived") return "INFERRED";
  if (e.observedAt && daysSince(e.observedAt, now) > s.maxAgeDays) return "STALE";
  return s.kind === "government" ? "VERIFIED" : "REPORTED";
}

// ─── Records ────────────────────────────────────────────────────────────────

export type Layer = "power" | "datacenter" | "land" | "fiber" | "energy" | "nuclear" | "water" | "capital";

export const LAYERS: { key: Layer; label: string; color: string }[] = [
  { key: "power", label: "Power", color: "#22C55E" },
  { key: "datacenter", label: "Data centers", color: "#A855F7" },
  { key: "land", label: "Land", color: "#EAB308" },
  { key: "fiber", label: "Fiber", color: "#3B82F6" },
  { key: "energy", label: "Energy assets", color: "#F97316" },
  { key: "nuclear", label: "Nuclear", color: "#F43F5E" },
  { key: "water", label: "Water", color: "#06B6D4" },
  { key: "capital", label: "Capital", color: "#F8FAFC" },
];

export type SignalKind =
  | "dc_announcement"
  | "transmission_project"
  | "substation_project"
  | "large_load_filing"
  | "zoning_change"
  | "land_sale"
  | "ppa"
  | "funding_round"
  | "plant_retirement"
  | "moratorium"
  | "fiber_build";

export interface Signal {
  id: string;
  kind: SignalKind;
  title: string;
  date: string;
  lat: number | null;
  lng: number | null;
  county?: string;
  mw?: number | null;
  amountUsd?: number | null;
  party?: string; // who (company / fund / utility) — by name as reported
  evidence: CiEvidence;
  example?: boolean;
}

export type Zoning = "industrial" | "heavy_industrial" | "agricultural" | "commercial" | "mixed" | "unknown";
export type ExistingUse = "vacant" | "farm" | "warehouse" | "industrial_plant" | "retired_plant" | "power_plant" | "substation" | "mining" | "office" | "unknown";

export interface Site {
  id: string;
  name: string;
  county: string;
  state: string;
  lat: number;
  lng: number;
  /** null for a power node from infrastructure data: the land around it isn't identified yet. */
  acres: number | null;
  zoning: Zoning;
  existingUse: ExistingUse;
  owner?: string;
  ownerType?: "private" | "corporate" | "public" | "utility" | "estate";
  askingPrice?: number | null;
  power: {
    reportedMw?: number | null; // what a utility filing / owner says is available
    estimatedMw?: number | null; // our estimate from nearby infrastructure
    substationMi?: number | null;
    substationKv?: number | null;
    transmissionMi?: number | null; // nearest ≥230 kV line
    utility?: string;
    onsiteGenerationMw?: number | null; // existing plant / interconnection rights
  };
  fiber: { longHaulMi?: number | null; carriers?: number | null };
  water: { source?: "municipal" | "river" | "aquifer" | "reclaimed" | "unknown"; mgd?: number | null };
  floodZone?: string | null;
  incentives?: string[];
  evidence: Partial<Record<"power" | "fiber" | "land" | "water" | "zoning" | "owner" | "flood" | "generation", CiEvidence>>;
  example?: boolean;
}

export type CapitalKind = "infra_fund" | "private_equity" | "family_office" | "developer" | "hyperscaler" | "utility" | "lender" | "strategic";
export type AssetType = "powered_land" | "datacenter" | "generation" | "fiber" | "land" | "stranded_power";

export interface CapitalSource {
  id: string;
  name: string;
  kind: CapitalKind;
  mandate: {
    assetTypes: AssetType[];
    minMw?: number | null;
    maxMw?: number | null;
    regions: string[]; // "GA", "Southeast", "US"
    checkMin?: number | null;
    checkMax?: number | null;
    timelineMonths?: number | null;
  };
  lastActive?: string | null;
  evidence: CiEvidence;
  notes?: string;
  example?: boolean;
}

// ─── Assumptions (screening, labeled in the UI) ─────────────────────────────

export const CI_ASSUME = {
  rawLandPerAcre: 60_000, // GA industrial land, unpowered (replace with county sales)
  poweredLandPerAcre: 350_000, // land with a credible ≥50 MW path inside 24 months (replace with comps)
  mwPerAcre: 1.5, // rule of thumb: campus MW the land can host
  minUsefulMw: 20,
  activityRadiusMi: 30,
  activityWindowDays: 540,
};

const SOUTHEAST = ["GA", "AL", "SC", "NC", "TN", "FL", "MS"];

// ─── Scoring ────────────────────────────────────────────────────────────────

export interface Factor {
  key: "power" | "fiber" | "land" | "water" | "zoning" | "activity" | "capital" | "risk";
  score: number; // 0–100
  findings: { text: string; evidence: CiEvidence[] }[];
  unknowns: string[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const has = (v: unknown): v is number => typeof v === "number" && isFinite(v);
export const fmtUsd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);

export function milesApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toR(b.lat - a.lat) / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(toR(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** MW this site can credibly offer: a reported figure beats our estimate; capped by what the land can host. */
export function deliverableMw(s: Site): { mw: number | null; basis: "reported" | "estimated" | "generation" | null } {
  if (has(s.power.reportedMw)) return { mw: s.power.reportedMw, basis: "reported" };
  if (has(s.power.onsiteGenerationMw)) return { mw: s.power.onsiteGenerationMw, basis: "generation" };
  if (has(s.power.estimatedMw)) return { mw: s.power.estimatedMw, basis: "estimated" };
  return { mw: null, basis: null };
}

function powerFactor(s: Site): Factor {
  const f: Factor["findings"] = [];
  const unknowns: string[] = [];
  const d = deliverableMw(s);
  const ev = s.evidence.power ? [s.evidence.power] : [];
  let score = 0;
  if (d.mw != null) {
    score += clamp((d.mw / 300) * 70, 0, 70);
    f.push({
      text: `${d.mw} MW ${d.basis === "reported" ? "reported available" : d.basis === "generation" ? "of on-site generation / interconnection" : "estimated from nearby infrastructure"}`,
      evidence: d.basis === "generation" && s.evidence.generation ? [s.evidence.generation] : ev.length ? ev : [{ source: "estimate", detail: "Substation capacity + distance screen", observedAt: null }],
    });
  } else unknowns.push("Available MW (ask the utility for a large-load study)");
  if (has(s.power.substationMi)) {
    const near = s.power.substationMi <= 1 ? 20 : s.power.substationMi <= 3 ? 12 : s.power.substationMi <= 6 ? 5 : 0;
    score += near;
    if (near) f.push({ text: `${s.power.substationMi} mi to a ${s.power.substationKv ?? "?"} kV substation`, evidence: ev.length ? ev : [{ source: "hifld", detail: "Substation location", observedAt: null }] });
  }
  if (has(s.power.transmissionMi) && s.power.transmissionMi <= 2) {
    score += 10;
    f.push({ text: `${s.power.transmissionMi} mi to high-voltage transmission`, evidence: [{ source: "hifld", detail: "Transmission line ≥230 kV", observedAt: null }] });
  }
  if (d.basis === "estimated") unknowns.push("Utility confirmation of the MW estimate");
  return { key: "power", score: clamp(Math.round(score)), findings: f, unknowns };
}

function fiberFactor(s: Site): Factor {
  const f: Factor["findings"] = [];
  const ev = s.evidence.fiber ? [s.evidence.fiber] : [];
  let score = 0;
  if (has(s.fiber.longHaulMi)) {
    score = s.fiber.longHaulMi <= 1 ? 80 : s.fiber.longHaulMi <= 3 ? 60 : s.fiber.longHaulMi <= 10 ? 35 : 10;
    f.push({ text: `${s.fiber.longHaulMi} mi to long-haul fiber`, evidence: ev });
  }
  if (has(s.fiber.carriers) && s.fiber.carriers >= 2) {
    score += 20;
    f.push({ text: `${s.fiber.carriers} carriers nearby (diverse paths)`, evidence: ev });
  }
  return { key: "fiber", score: clamp(score), findings: f, unknowns: has(s.fiber.longHaulMi) ? [] : ["Fiber route distance"] };
}

function landFactor(s: Site): Factor {
  const f: Factor["findings"] = [];
  const ev = s.evidence.land ? [s.evidence.land] : [];
  if (s.acres == null) return { key: "land", score: 30, findings: [], unknowns: ["Land around the node (sweep parcels within 3 mi)"] };
  const score = s.acres >= 200 ? 90 : s.acres >= 100 ? 75 : s.acres >= 50 ? 55 : s.acres >= 20 ? 30 : 10;
  f.push({ text: `${s.acres} acres (fits ~${Math.round(s.acres * CI_ASSUME.mwPerAcre)} MW of campus by the ${CI_ASSUME.mwPerAcre} MW/acre screen)`, evidence: ev });
  if (s.existingUse === "retired_plant" || s.existingUse === "industrial_plant" || s.existingUse === "power_plant")
    f.push({ text: `Existing ${s.existingUse.replace("_", " ")}: interconnection and heavy-load history on site`, evidence: ev });
  return { key: "land", score, findings: f, unknowns: s.owner ? [] : ["Owner of record"] };
}

function zoningFactor(s: Site): Factor {
  const ev = s.evidence.zoning ? [s.evidence.zoning] : [];
  const score = s.zoning === "heavy_industrial" ? 100 : s.zoning === "industrial" ? 85 : s.zoning === "mixed" ? 50 : s.zoning === "agricultural" ? 30 : s.zoning === "commercial" ? 40 : 20;
  return { key: "zoning", score, findings: [{ text: `Zoned ${s.zoning.replace("_", " ")}`, evidence: ev }], unknowns: s.zoning === "unknown" ? ["Zoning district"] : s.zoning === "agricultural" ? ["Rezoning path for a data center"] : [] };
}

function waterFactor(s: Site): Factor {
  const ev = s.evidence.water ? [s.evidence.water] : [];
  const src = s.water.source ?? "unknown";
  let score = src === "reclaimed" ? 90 : src === "municipal" ? 70 : src === "river" ? 60 : src === "aquifer" ? 45 : 20;
  if (has(s.water.mgd) && s.water.mgd >= 1) score += 10;
  return { key: "water", score: clamp(score), findings: src === "unknown" ? [] : [{ text: `Water: ${src}${has(s.water.mgd) ? `, ${s.water.mgd} MGD` : ""}`, evidence: ev }], unknowns: src === "unknown" ? ["Water source / cooling capacity"] : [] };
}

function activityFactor(s: Site, signals: Signal[], now: Date): Factor {
  const near = signals.filter((g) => g.lat != null && g.lng != null && milesApart(s, { lat: g.lat, lng: g.lng }) <= CI_ASSUME.activityRadiusMi && daysSince(g.date, now) <= CI_ASSUME.activityWindowDays);
  const w: Partial<Record<SignalKind, number>> = { dc_announcement: 25, large_load_filing: 20, transmission_project: 15, substation_project: 15, land_sale: 10, ppa: 10, zoning_change: 10, fiber_build: 8, funding_round: 5, plant_retirement: 10, moratorium: 0 };
  const findings = near.filter((g) => g.kind !== "moratorium").map((g) => ({ text: `${g.title} (${Math.round(milesApart(s, { lat: g.lat!, lng: g.lng! }))} mi, ${g.date.slice(0, 7)})`, evidence: [g.evidence] }));
  const score = clamp(near.reduce((t, g) => t + (w[g.kind] ?? 5), 0));
  return { key: "activity", score, findings, unknowns: [] };
}

function riskFactor(s: Site, signals: Signal[], now: Date): Factor {
  const f: Factor["findings"] = [];
  let score = 0;
  if (s.floodZone && /^(A|AE|V)/i.test(s.floodZone)) {
    score += 35;
    f.push({ text: `FEMA flood zone ${s.floodZone}`, evidence: s.evidence.flood ? [s.evidence.flood] : [] });
  }
  const mor = signals.filter((g) => g.kind === "moratorium" && g.lat != null && milesApart(s, { lat: g.lat, lng: g.lng! }) <= 25 && daysSince(g.date, now) <= 730);
  for (const m of mor) {
    score += 40;
    f.push({ text: m.title, evidence: [m.evidence] });
  }
  if (s.zoning === "agricultural") {
    score += 15;
    f.push({ text: "Needs a rezoning: time and community risk", evidence: s.evidence.zoning ? [s.evidence.zoning] : [] });
  }
  const d = deliverableMw(s);
  if (d.basis === "estimated" && (d.mw ?? 0) >= 100) {
    score += 10;
    f.push({ text: "Large MW figure is our estimate, not a utility commitment", evidence: [{ source: "estimate", detail: "Screen only", observedAt: null }] });
  }
  return { key: "risk", score: clamp(score), findings: f, unknowns: [] };
}

// ─── Capital matching ───────────────────────────────────────────────────────

export function siteAssetTypes(s: Site): AssetType[] {
  const t: AssetType[] = ["land"];
  const mw = deliverableMw(s).mw ?? 0;
  if (mw >= CI_ASSUME.minUsefulMw) t.push("powered_land", "datacenter");
  if (has(s.power.onsiteGenerationMw) && s.power.onsiteGenerationMw > 0) t.push("generation");
  if (s.existingUse === "retired_plant" || (s.existingUse === "industrial_plant" && mw >= 50)) t.push("stranded_power");
  if (s.existingUse === "power_plant") t.push("generation");
  return t;
}

export interface CapitalMatch {
  source: CapitalSource;
  fit: number;
  why: string[];
  misses: string[];
}

export function matchCapital(s: Site, sources: CapitalSource[], now: Date): CapitalMatch[] {
  const types = siteAssetTypes(s);
  const mw = deliverableMw(s).mw;
  return sources
    .map((c) => {
      const why: string[] = [];
      const misses: string[] = [];
      const typeHit = c.mandate.assetTypes.filter((t) => types.includes(t));
      if (typeHit.length) why.push(`invests in ${typeHit.join(", ").replace(/_/g, " ")}`);
      else misses.push("asset type outside mandate");
      const region = c.mandate.regions.some((r) => r === s.state || r === "US" || (r === "Southeast" && SOUTHEAST.includes(s.state)));
      if (region) why.push(`covers ${s.state}`);
      else misses.push("outside their regions");
      if (mw != null && (has(c.mandate.minMw) || has(c.mandate.maxMw))) {
        if (has(c.mandate.minMw) && mw < c.mandate.minMw) misses.push(`${mw} MW under their ${c.mandate.minMw} MW minimum`);
        else if (has(c.mandate.maxMw) && mw > c.mandate.maxMw) misses.push(`${mw} MW over their ${c.mandate.maxMw} MW maximum`);
        else why.push(`${mw} MW fits their range`);
      }
      const recent = c.lastActive && daysSince(c.lastActive, now) <= 365;
      if (recent) why.push(`active ${c.lastActive!.slice(0, 7)}`);
      const fit = clamp(Math.round(40 + 15 * typeHit.length + (region ? 15 : 0) + (recent ? 15 : 0) - 25 * misses.length));
      return { source: c, fit, why, misses };
    })
    .filter((m) => m.misses.length === 0)
    .sort((a, b) => b.fit - a.fit);
}

function capitalFactor(matches: CapitalMatch[]): Factor {
  return {
    key: "capital",
    score: clamp(matches.length * 20 + (matches[0]?.fit ?? 0) * 0.3),
    findings: matches.slice(0, 4).map((m) => ({ text: `${m.source.name}: ${m.why.join(" · ")}`, evidence: [m.source.evidence] })),
    unknowns: matches.length ? [] : ["A capital source whose mandate fits"],
  };
}

// ─── Constellation: the parties a deal needs ────────────────────────────────

export type Role = "landowner" | "utility" | "developer" | "capital" | "end_user";
export const ROLE_LABELS: Record<Role, string> = { landowner: "Landowner", utility: "Utility", developer: "Developer", capital: "Capital", end_user: "End user (demand)" };

export interface Constellation {
  slots: { role: Role; filledBy: string | null; basis: string }[];
  completeness: number; // 0–100
  gaps: Role[];
}

export function constellation(s: Site, matches: CapitalMatch[], signals: Signal[], now: Date): Constellation {
  const dev = matches.find((m) => m.source.kind === "developer");
  const cap = matches.find((m) => ["infra_fund", "private_equity", "family_office", "lender", "strategic"].includes(m.source.kind));
  const demand =
    matches.find((m) => m.source.kind === "hyperscaler")?.source.name ??
    signals.find((g) => g.kind === "dc_announcement" && g.lat != null && milesApart(s, { lat: g.lat, lng: g.lng! }) <= 60 && daysSince(g.date, now) <= 365)?.party ??
    null;
  const slots: Constellation["slots"] = [
    { role: "landowner", filledBy: s.owner ?? null, basis: s.owner ? "Owner of record" : "Pull the parcel owner" },
    { role: "utility", filledBy: s.power.utility ?? null, basis: s.power.utility ? "Serving utility" : "Identify the serving utility" },
    { role: "developer", filledBy: dev?.source.name ?? null, basis: dev ? `Mandate fit ${dev.fit}` : "No developer mandate on file fits" },
    { role: "capital", filledBy: cap?.source.name ?? null, basis: cap ? `Mandate fit ${cap.fit}` : "No capital mandate on file fits" },
    { role: "end_user", filledBy: demand, basis: demand ? "Active demand nearby" : "No end-user signal within 60 mi" },
  ];
  const filled = slots.filter((x) => x.filledBy).length;
  return { slots, completeness: Math.round((filled / slots.length) * 100), gaps: slots.filter((x) => !x.filledBy).map((x) => x.role) };
}

// ─── Valuation screen ───────────────────────────────────────────────────────

export interface SiteValue {
  raw: number | null;
  powered: number | null;
  uplift: number | null;
  basis: string;
}

export function valueSite(s: Site): SiteValue {
  if (s.acres == null) return { raw: null, powered: null, uplift: null, basis: "No land identified around this power node yet: sweep the parcels within a few miles, then value them." };
  const raw = Math.round(s.acres * CI_ASSUME.rawLandPerAcre);
  const mw = deliverableMw(s).mw ?? 0;
  const usableAcres = Math.min(s.acres, mw / CI_ASSUME.mwPerAcre);
  const powered = mw >= 50 ? Math.round(usableAcres * CI_ASSUME.poweredLandPerAcre + (s.acres - usableAcres) * CI_ASSUME.rawLandPerAcre) : null;
  return {
    raw,
    powered,
    uplift: powered != null ? powered - raw : null,
    basis: `Screen: ${fmtUsd(CI_ASSUME.rawLandPerAcre)}/acre raw, ${fmtUsd(CI_ASSUME.poweredLandPerAcre)}/acre on the ${Math.round(usableAcres)} acres a ${mw} MW path can serve. Replace with recorded sales and a utility letter.`,
  };
}

// ─── Opportunity ────────────────────────────────────────────────────────────

export const CI_WEIGHTS = { power: 0.3, fiber: 0.12, land: 0.13, zoning: 0.1, water: 0.08, activity: 0.14, capital: 0.13 } as const;

export type Thesis = "powered_land" | "stranded_power" | "colocation" | "datacenter_campus" | "land_bank" | "no_go";
export const THESIS_LABELS: Record<Thesis, string> = {
  powered_land: "Powered-land sale to a developer",
  stranded_power: "Stranded / underutilized power conversion",
  colocation: "Co-location next to existing generation",
  datacenter_campus: "Data-center campus (develop / JV)",
  land_bank: "Land bank: option it and wait for power",
  no_go: "No-go",
};

export interface SiteIntel {
  site: Site;
  factors: Record<Factor["key"], Factor>;
  score: number;
  confidence: number;
  stars: Record<"power" | "fiber" | "zoning" | "demand" | "capital", number>;
  matches: CapitalMatch[];
  constellation: Constellation;
  value: SiteValue;
  theses: { key: Thesis; fit: number; why: string }[];
  layers: Layer[];
  unknowns: string[];
  why: string[];
  badges: Record<CiBadge, number>;
}

export function analyzeSite(s: Site, signals: Signal[], capital: CapitalSource[], now: Date): SiteIntel {
  const matches = matchCapital(s, capital, now);
  const factors = {
    power: powerFactor(s),
    fiber: fiberFactor(s),
    land: landFactor(s),
    zoning: zoningFactor(s),
    water: waterFactor(s),
    activity: activityFactor(s, signals, now),
    capital: capitalFactor(matches),
    risk: riskFactor(s, signals, now),
  };
  const raw = (Object.keys(CI_WEIGHTS) as (keyof typeof CI_WEIGHTS)[]).reduce((t, k) => t + CI_WEIGHTS[k] * factors[k].score, 0);
  const score = clamp(Math.round(raw * 1.15 - 0.25 * factors.risk.score));

  const ev = (Object.values(factors) as Factor[]).filter((f) => f.key !== "risk").flatMap((f) => f.findings.flatMap((x) => x.evidence));
  const badges: Record<CiBadge, number> = { VERIFIED: 0, REPORTED: 0, INFERRED: 0, STALE: 0 };
  ev.forEach((e) => badges[ciBadge(e, now)]++);
  const independent = new Set(ev.filter((e) => ciBadge(e, now) !== "INFERRED").map((e) => e.source)).size;
  const unknowns = [...new Set((Object.values(factors) as Factor[]).flatMap((f) => f.unknowns))];
  const confidence = clamp(Math.round(25 + 9 * Math.min(independent, 6) + 20 * (ev.length ? badges.VERIFIED / ev.length : 0) - 5 * Math.min(unknowns.length, 4)), 5, 95);

  const star = (v: number) => Math.max(1, Math.min(5, Math.ceil(v / 20)));
  const con = constellation(s, matches, signals, now);
  const mw = deliverableMw(s).mw ?? 0;
  const thesisList: SiteIntel["theses"] = [
    { key: "powered_land", fit: clamp(Math.round(0.5 * factors.power.score + 0.2 * factors.land.score + 0.3 * factors.capital.score)), why: mw >= 50 ? (s.acres != null ? `${mw} MW path + ${s.acres} acres: sell or option to a developer` : `${mw} MW node: find the land next to it, then option it to a developer`) : "Needs a credible ≥50 MW path first" },
    { key: "colocation", fit: s.existingUse === "power_plant" ? clamp(Math.round(0.55 * factors.power.score + 0.25 * factors.capital.score + 0.2 * factors.activity.score + 15)) : 0, why: "Load next to existing generation: co-location / behind-the-meter talks with the plant owner and utility" },
    { key: "stranded_power", fit: s.existingUse === "retired_plant" || s.existingUse === "industrial_plant" ? clamp(Math.round(0.6 * factors.power.score + 0.4 * factors.activity.score + (has(s.power.onsiteGenerationMw) ? 30 : 0))) : 0, why: "Existing interconnection / generation that isn't fully used" },
    { key: "datacenter_campus", fit: clamp(Math.round(0.35 * factors.power.score + 0.2 * factors.fiber.score + 0.15 * factors.water.score + 0.15 * factors.zoning.score + 0.15 * factors.capital.score)), why: "Power + fiber + water + zoning in one place" },
    { key: "land_bank", fit: clamp(Math.round(0.5 * factors.land.score + 0.5 * factors.activity.score - 0.3 * factors.power.score + 20)), why: "Activity around it but no power yet: option the land, wait for transmission" },
    { key: "no_go", fit: clamp(factors.risk.score + (score < 35 ? 30 : 0)), why: factors.risk.findings.map((f) => f.text).join("; ") || "No red flags on record" },
  ];
  const theses = [...thesisList].sort((a, b) => b.fit - a.fit);

  const layers: Layer[] = ["land"];
  if (mw >= CI_ASSUME.minUsefulMw) layers.push("power");
  if (factors.fiber.score >= 60) layers.push("fiber");
  if (has(s.power.onsiteGenerationMw)) layers.push("energy");
  if (factors.water.score >= 70) layers.push("water");
  if (matches.length) layers.push("capital");
  if (factors.activity.findings.some((f) => /data center|campus/i.test(f.text))) layers.push("datacenter");

  const why = (Object.values(factors) as Factor[])
    .filter((f) => f.key !== "risk")
    .sort((a, b) => b.score * CI_WEIGHTS[b.key as keyof typeof CI_WEIGHTS] - a.score * CI_WEIGHTS[a.key as keyof typeof CI_WEIGHTS])
    .flatMap((f) => f.findings.slice(0, 1).map((x) => x.text))
    .slice(0, 5);

  return {
    site: s,
    factors,
    score,
    confidence,
    stars: { power: star(factors.power.score), fiber: star(factors.fiber.score), zoning: star(factors.zoning.score), demand: star(factors.activity.score), capital: star(factors.capital.score) },
    matches,
    constellation: con,
    value: valueSite(s),
    theses,
    layers,
    unknowns,
    why,
    badges,
  };
}

export function analyzeSites(sites: Site[], signals: Signal[], capital: CapitalSource[], now: Date): SiteIntel[] {
  return sites.map((s) => analyzeSite(s, signals, capital, now)).sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

/** Layer counts for the command bar (POWER ███ 87 …). */
export function layerCounts(all: SiteIntel[], signals: Signal[], capital: CapitalSource[]): Record<Layer, number> {
  const c = Object.fromEntries(LAYERS.map((l) => [l.key, 0])) as Record<Layer, number>;
  all.forEach((i) => i.layers.forEach((l) => c[l]++));
  c.datacenter += signals.filter((g) => g.kind === "dc_announcement").length;
  c.nuclear += signals.filter((g) => /nuclear/i.test(g.title)).length;
  c.energy += signals.filter((g) => g.kind === "plant_retirement" || g.kind === "ppa").length;
  c.capital = capital.length;
  return c;
}
