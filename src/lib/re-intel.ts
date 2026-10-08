/**
 * God's Eye — real-estate intelligence engine.
 *
 * FREE PUBLIC DATA → CROSS-REFERENCE → PROPERTY INTELLIGENCE → OPPORTUNITY SCORE.
 *
 * Pure functions only (no fetch, no DB) so every rule is unit-tested and the
 * feed tool, the Deal Desk page and any future job all score a property the
 * same way. Inputs are government records gathered by tools/atlanta-intel;
 * every conclusion carries the evidence behind it, a freshness badge per
 * piece of evidence, and a confidence that drops when signals are single-
 * sourced, stale, inferred, or missing. Nothing here pretends to know interior
 * condition, the owner's intent, or a payoff balance.
 */

// ─── Sources ────────────────────────────────────────────────────────────────

export type SourceId =
  | "coa_parcels"
  | "fulton_cama"
  | "code_history"
  | "building_complaints"
  | "atl311"
  | "permits"
  | "tax_delinquent"
  | "foreclosure_notice"
  | "probate"
  | "deeds"
  | "zoning"
  | "flood"
  | "opportunity_zone"
  | "transit"
  | "county_parcels"
  | "market"
  | "manual"
  | "rule";

export interface SourceInfo {
  label: string;
  kind: "government" | "derived" | "manual";
  /** A record older than this many days shows as STALE. */
  maxAgeDays: number;
  /** True when the published dataset itself stopped updating (history only). */
  historyOnly?: boolean;
}

export const SOURCES: Record<SourceId, SourceInfo> = {
  coa_parcels: { label: "City of Atlanta tax parcels", kind: "government", maxAgeDays: 120 },
  fulton_cama: { label: "Fulton County CAMA (assessor)", kind: "government", maxAgeDays: 400 },
  code_history: { label: "Atlanta code enforcement 2021–2023", kind: "government", maxAgeDays: 540, historyOnly: true },
  building_complaints: { label: "Atlanta building complaints (permit system)", kind: "government", maxAgeDays: 365 },
  atl311: { label: "ATL311 service requests", kind: "government", maxAgeDays: 365 },
  permits: { label: "Atlanta building permits", kind: "government", maxAgeDays: 3650 },
  tax_delinquent: { label: "Fulton Tax Commissioner delinquency list", kind: "government", maxAgeDays: 120 },
  foreclosure_notice: { label: "County legal-organ foreclosure notice", kind: "government", maxAgeDays: 90 },
  probate: { label: "Fulton Probate Court estate filing", kind: "government", maxAgeDays: 730 },
  deeds: { label: "Clerk deed + security-deed index", kind: "government", maxAgeDays: 36500 },
  zoning: { label: "City of Atlanta zoning", kind: "government", maxAgeDays: 730 },
  flood: { label: "FEMA flood hazard layer", kind: "government", maxAgeDays: 1825 },
  opportunity_zone: { label: "Federal Opportunity Zone tracts", kind: "government", maxAgeDays: 3650 },
  transit: { label: "MARTA GTFS rail stations", kind: "government", maxAgeDays: 730 },
  county_parcels: { label: "Metro county assessor parcels", kind: "government", maxAgeDays: 400 },
  market: { label: "Derived from public permits + assessor records", kind: "derived", maxAgeDays: 120 },
  manual: { label: "Entered by you", kind: "manual", maxAgeDays: 180 },
  rule: { label: "Engine rule (inference)", kind: "derived", maxAgeDays: 36500 },
};

export type Badge = "VERIFIED" | "INFERRED" | "STALE";

export interface Evidence {
  source: SourceId;
  detail: string;
  /** Date of the underlying record (not when we pulled it). */
  observedAt: string | null;
  ref?: string;
  /** Derived by a rule rather than read off a record. */
  inferred?: boolean;
}

const DAY = 86_400_000;
export const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / DAY);
const yearsSince = (iso: string | null | undefined, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / (365.25 * DAY) : null;

export function badge(e: Evidence, now: Date): Badge {
  const src = SOURCES[e.source];
  if (e.inferred || src.kind === "derived") return "INFERRED";
  if (src.historyOnly) return "STALE";
  if (!e.observedAt) return src.kind === "manual" ? "INFERRED" : "VERIFIED";
  return daysBetween(new Date(e.observedAt), now) > src.maxAgeDays ? "STALE" : "VERIFIED";
}

// ─── Property record (what the feed produces) ───────────────────────────────

export type PermitCategory = "renovation" | "new_construction" | "demolition" | "complaint" | "other";

export interface Permit {
  id: string;
  category: PermitCategory;
  type: string;
  status?: string;
  issuedAt: string | null;
  value?: number | null;
  description?: string;
}

export interface CodeCase {
  id: string;
  source: "code_history" | "building_complaints" | "atl311";
  openedAt: string | null;
  status?: string;
  type?: string;
  open?: boolean;
  vacant?: boolean;
  boarded?: boolean;
  structural?: boolean;
}

export interface Transfer {
  date: string;
  price?: number | null;
  deedType?: string;
  grantor?: string;
  grantee?: string;
  ref?: string;
}

export interface Mortgage {
  date: string;
  amount: number;
  lender?: string;
  ref?: string;
  /** Date a cancellation / satisfaction was recorded against it. */
  satisfiedAt?: string | null;
}

/** Deed instruments that mean the owner of record died or the house went through an estate. */
export const ESTATE_DEED = /\b(EXECUT(?:OR|RIX)'?S?|ADMINISTRAT(?:OR|RIX)'?S?|ESTATE|PERSONAL REP\w*|EXD|ADMD|HEIRS?)\b/i;
export const FORECLOSURE_DEED = /\b(DEED UNDER POWER|DUP|FORECLOSURE DEED|SHERIFF)\b/i;
export const openMortgages = (p: { mortgages?: Mortgage[] }) => (p.mortgages ?? []).filter((m) => !m.satisfiedAt);

export interface PropertyRecord {
  id: string; // parcel id
  address: string;
  city?: string;
  zip?: string;
  county?: string;
  neighborhood?: string;
  lat: number | null;
  lng: number | null;
  example?: boolean;

  owner?: string;
  ownerMailing?: string;
  ownerMailingState?: string;
  homesteadExemption?: boolean | null;

  landUse?: string;
  existingUnits?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  yearBuilt?: number | null;
  lotSqft?: number | null;
  zoning?: string;
  zoningMaxUnits?: number | null;
  cornerLot?: boolean;
  adjacentSameOwner?: number;
  transitMi?: number | null;
  transitName?: string | null;

  fairMarketValue?: number | null; // county appraised (assessed ÷ 0.40 in GA)
  landValue?: number | null;
  assessedHistory?: { year: number; value: number }[];
  valueAsOf?: string | null;

  lastSaleDate?: string | null;
  lastSalePrice?: number | null;
  transfers?: Transfer[];
  mortgages?: Mortgage[];
  /** When the deed + security-deed index was searched for this parcel (null = never). */
  deedsCheckedAt?: string | null;

  permits?: Permit[];
  codeCases?: CodeCase[];
  taxDelinquent?: { amount?: number | null; years?: number | null; asOf: string } | null;
  foreclosure?: { saleDate: string; noticeDate?: string | null; lender?: string; ref?: string } | null;
  probate?: { filedAt: string; caseNo?: string } | null;
  floodZone?: string | null;
  opportunityZone?: boolean | null;

  rentEstimate?: { value: number; source: SourceId; asOf: string | null } | null;
  /** Field → where it came from, as pulled. */
  provenance?: Record<string, { source: SourceId; asOf: string | null }>;
}

export interface MarketContext {
  key: string; // zip or neighborhood
  medianPpsf?: number | null; // county value per sq ft, typical house
  renovatedPpsf?: number | null; // recent renovated sales, per sq ft
  salesLast12?: number | null;
  salesPrior12?: number | null;
  medianRent?: number | null;
  rentGrowthPct?: number | null;
  renovationPermits12?: number | null;
  newConstructionPermits12?: number | null;
  demolitionPermits12?: number | null;
  asOf: string | null;
  source: SourceId;
}

// ─── Assumptions (screening conventions, labeled as such in the UI) ─────────

export const SCREEN = {
  rehabPpsf: { light: 25, medium: 45, heavy: 70 },
  wholesaleMaoPct: 0.7,
  flipCostPct: 0.18, // buy/sell closing + holding + financing, share of ARV
  rentToValueFloor: 0.008,
  absenteeDistanceNote: "Mailing address differs from site address",
  longOwnershipYears: 15,
  loanTermYears: 30,
  assumedRate: 0.065,
  assumedLtv: 0.8,
} as const;

/**
 * Minimum lot size by Atlanta residential district (ordinance tables, used as
 * a screen only; every development finding says "verify with zoning").
 */
export const ATL_ZONING: Record<string, { minLotSqft: number; unitsPerLot: number; multifamily?: boolean }> = {
  "R-1": { minLotSqft: 87120, unitsPerLot: 1 },
  "R-2": { minLotSqft: 28000, unitsPerLot: 1 },
  "R-2A": { minLotSqft: 15000, unitsPerLot: 1 },
  "R-3": { minLotSqft: 18000, unitsPerLot: 1 },
  "R-3A": { minLotSqft: 10000, unitsPerLot: 1 },
  "R-4": { minLotSqft: 9000, unitsPerLot: 1 },
  "R-4A": { minLotSqft: 7500, unitsPerLot: 1 },
  "R-4B": { minLotSqft: 2800, unitsPerLot: 1 },
  "R-5": { minLotSqft: 7500, unitsPerLot: 2 },
  "MR-1": { minLotSqft: 0, unitsPerLot: 0, multifamily: true },
  "MR-2": { minLotSqft: 0, unitsPerLot: 0, multifamily: true },
  "MR-3": { minLotSqft: 0, unitsPerLot: 0, multifamily: true },
  "RG-2": { minLotSqft: 0, unitsPerLot: 0, multifamily: true },
  "RG-3": { minLotSqft: 0, unitsPerLot: 0, multifamily: true },
};

// ─── Engines ────────────────────────────────────────────────────────────────

export type EngineKey = "distress" | "motivation" | "equity" | "valueGap" | "development" | "market" | "risk";

export interface Finding {
  text: string;
  points: number;
  evidence: Evidence[];
}

export interface EngineResult {
  key: EngineKey;
  score: number; // 0–100
  findings: Finding[];
  unknowns: string[];
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const has = (v: unknown): v is number => typeof v === "number" && isFinite(v);
const money = (v: number) => (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v)).toLocaleString("en-US");

function prov(p: PropertyRecord, field: string, fallback: SourceId): { source: SourceId; asOf: string | null } {
  return p.provenance?.[field] ?? { source: fallback, asOf: null };
}

function engine(key: EngineKey, findings: Finding[], unknowns: string[]): EngineResult {
  return { key, score: clamp(Math.round(findings.reduce((s, f) => s + f.points, 0))), findings, unknowns };
}

const normAddr = (s?: string) =>
  String(s ?? "")
    .toUpperCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(STREET)\b/g, "ST")
    .replace(/\b(AVENUE)\b/g, "AVE")
    .replace(/\b(ROAD)\b/g, "RD")
    .replace(/\b(DRIVE)\b/g, "DR")
    .replace(/\s+/g, " ")
    .trim();

/** Owner mailing address is somewhere other than the property itself. */
export function isAbsentee(p: PropertyRecord): boolean | null {
  if (!p.ownerMailing) return null;
  const site = normAddr(p.address);
  const mail = normAddr(p.ownerMailing);
  if (!site) return null;
  return !mail.startsWith(site);
}

export function ownershipYears(p: PropertyRecord, now: Date): number | null {
  const y = yearsSince(p.lastSaleDate ?? p.transfers?.[0]?.date ?? null, now);
  return y == null ? null : Math.floor(y);
}

function currentCodeCases(p: PropertyRecord, now: Date, source: CodeCase["source"] = "building_complaints") {
  return (p.codeCases ?? []).filter((c) => c.source === source && c.openedAt && daysBetween(new Date(c.openedAt), now) <= 548);
}

export function distressEngine(p: PropertyRecord, now: Date): EngineResult {
  const f: Finding[] = [];
  const unknowns: string[] = [];
  if (p.foreclosure) {
    const days = daysBetween(now, new Date(p.foreclosure.saleDate));
    if (days >= -1)
      f.push({
        text: `Foreclosure sale advertised for ${p.foreclosure.saleDate.slice(0, 10)}${days >= 0 ? ` (${days} days)` : ""}`,
        points: 45,
        evidence: [{ source: "foreclosure_notice", detail: `Notice of sale under power${p.foreclosure.lender ? `, ${p.foreclosure.lender}` : ""}`, observedAt: p.foreclosure.noticeDate ?? null, ref: p.foreclosure.ref }],
      });
  }
  if (p.taxDelinquent) {
    const t = p.taxDelinquent;
    f.push({
      text: `Tax delinquent${has(t.amount) ? ` (${money(t.amount)})` : ""}${has(t.years) && t.years > 1 ? `, ${t.years} years` : ""}`,
      points: 25 + (has(t.years) && t.years >= 2 ? 5 : 0),
      evidence: [{ source: "tax_delinquent", detail: "On the delinquent-account list", observedAt: t.asOf }],
    });
  } else unknowns.push("Current tax status (request the Tax Commissioner's delinquent list)");

  const current = currentCodeCases(p, now);
  if (current.length)
    f.push({
      text: `${current.length} building complaint${current.length > 1 ? "s" : ""} in the last 18 months`,
      points: Math.min(30, 15 * current.length),
      evidence: current.map((c) => ({ source: "building_complaints" as const, detail: `${c.type || "Building complaint"}${c.status ? ` · ${c.status}` : ""}`, observedAt: c.openedAt, ref: c.id })),
    });
  const sr = currentCodeCases(p, now, "atl311");
  if (sr.length)
    f.push({
      text: `${sr.length} ATL311 request${sr.length > 1 ? "s" : ""} on the address in the last 18 months`,
      points: Math.min(20, 10 * sr.length),
      evidence: sr.map((c) => ({ source: "atl311" as const, detail: `${c.type || "Service request"}${c.status ? ` · ${c.status}` : ""}`, observedAt: c.openedAt, ref: c.id })),
    });
  const hist = (p.codeCases ?? []).filter((c) => c.source === "code_history");
  if (hist.length)
    f.push({
      text: `${hist.length} code case${hist.length > 1 ? "s" : ""} on record 2021–2023`,
      points: Math.min(10, 5 * hist.length),
      evidence: hist.map((c) => ({ source: "code_history" as const, detail: `${c.type || "Code case"}${c.status ? ` · ${c.status}` : ""}`, observedAt: c.openedAt, ref: c.id })),
    });

  const vacantEv: Evidence[] = (p.codeCases ?? [])
    .filter((c) => c.vacant || c.boarded)
    .map((c) => ({ source: c.source, detail: [c.vacant && "vacant", c.boarded && "boarded"].filter(Boolean).join(" + ") + " flag on case", observedAt: c.openedAt, ref: c.id }));
  if (vacantEv.length) f.push({ text: "Vacant / boarded indicator", points: 15, evidence: vacantEv });

  const demo = (p.permits ?? []).filter((x) => x.category === "demolition");
  if (demo.length)
    f.push({
      text: "Demolition permit on the parcel",
      points: 10,
      evidence: demo.map((d) => ({ source: "permits" as const, detail: d.type, observedAt: d.issuedAt, ref: d.id })),
    });

  // Deferred maintenance is an inference: old house, nothing permitted in a decade.
  const reno = (p.permits ?? []).filter((x) => x.category === "renovation" || x.category === "new_construction");
  const lastReno = reno.map((x) => x.issuedAt).filter(Boolean).sort().pop() ?? null;
  const renoAge = yearsSince(lastReno, now);
  if (has(p.yearBuilt) && now.getFullYear() - p.yearBuilt >= 40 && (renoAge == null || renoAge >= 10))
    f.push({
      text: `Built ${p.yearBuilt}, no renovation permit ${lastReno ? `since ${lastReno.slice(0, 4)}` : "on file"}`,
      points: 5,
      evidence: [{ source: "rule", detail: "Old structure + no recent renovation permits suggests deferred maintenance", observedAt: null, inferred: true }],
    });
  unknowns.push("Interior condition (site visit)");
  return engine("distress", f, unknowns);
}

export function motivationEngine(p: PropertyRecord, now: Date): EngineResult {
  const f: Finding[] = [];
  const unknowns: string[] = [];
  const abs = isAbsentee(p);
  if (abs) {
    const ev: Evidence[] = [{ source: prov(p, "ownerMailing", "coa_parcels").source, detail: `Tax bill mails to ${p.ownerMailing}`, observedAt: prov(p, "ownerMailing", "coa_parcels").asOf }];
    if (p.homesteadExemption === false) ev.push({ source: "fulton_cama", detail: "No homestead exemption claimed", observedAt: prov(p, "homesteadExemption", "fulton_cama").asOf });
    const outOfState = p.ownerMailingState && p.ownerMailingState.toUpperCase() !== "GA";
    f.push({ text: outOfState ? `Absentee owner, out of state (${p.ownerMailingState})` : "Absentee owner", points: outOfState ? 18 : 12, evidence: ev });
  } else if (abs == null) unknowns.push("Owner mailing address");

  const yrs = ownershipYears(p, now);
  if (yrs != null && yrs >= SCREEN.longOwnershipYears)
    f.push({
      text: `Same owner ${yrs} years`,
      points: yrs >= 25 ? 18 : 12,
      evidence: [{ source: prov(p, "lastSaleDate", "deeds").source, detail: `Last transfer ${p.lastSaleDate?.slice(0, 10) ?? p.transfers?.[0]?.date.slice(0, 10)}`, observedAt: p.lastSaleDate ?? null }],
    });
  else if (yrs == null) unknowns.push("Last transfer date");

  if (p.probate)
    f.push({
      text: "Estate filed in probate",
      points: 30,
      evidence: [{ source: "probate", detail: `Estate filing${p.probate.caseNo ? ` ${p.probate.caseNo}` : ""}`, observedAt: p.probate.filedAt }],
    });
  else if ((p.transfers ?? []).some((t) => ESTATE_DEED.test(t.deedType ?? "")))
    f.push({
      text: "Last transfer was by estate / executor's deed",
      points: 15,
      evidence: (p.transfers ?? []).filter((t) => ESTATE_DEED.test(t.deedType ?? "")).map((t) => ({ source: "deeds" as const, detail: `${t.deedType}${t.grantee ? ` to ${t.grantee}` : ""}`, observedAt: t.date, ref: t.ref })),
    });
  else if (/\b(ESTATE|EST OF|HEIRS?)\b/i.test(p.owner ?? ""))
    f.push({ text: "Owner of record reads as an estate / heirs", points: 20, evidence: [{ source: "coa_parcels", detail: `Owner: ${p.owner}`, observedAt: prov(p, "owner", "coa_parcels").asOf }] });

  // Tired landlord: absentee + non-homestead + code trouble on a rental-type property.
  if (abs && p.homesteadExemption === false && (p.codeCases ?? []).length)
    f.push({
      text: "Tired-landlord pattern: absentee, non-owner-occupied, code trouble",
      points: 12,
      evidence: [{ source: "rule", detail: "Absentee + no homestead + code case", observedAt: null, inferred: true }],
    });
  unknowns.push("Owner's actual intent (conversation)");
  return engine("motivation", f, unknowns);
}

export interface ValueEstimate {
  current: number | null;
  currentBasis: string;
  arv: number | null;
  arvBasis: string;
  debt: number | null;
  debtBasis: string;
  equity: number | null;
  equityPct: number | null;
}

/** Remaining balance on a fully amortizing loan after `months` payments. */
export function remainingBalance(amount: number, rate: number, years: number, months: number): number {
  const r = rate / 12;
  const n = years * 12;
  if (months >= n) return 0;
  const pmt = (amount * r) / (1 - Math.pow(1 + r, -n));
  return amount * Math.pow(1 + r, months) - (pmt * (Math.pow(1 + r, months) - 1)) / r;
}

export function estimateValue(p: PropertyRecord, m: MarketContext | undefined, now: Date): ValueEstimate {
  const county = has(p.fairMarketValue) ? p.fairMarketValue : null;
  const comp = m && has(m.medianPpsf) && has(p.sqft) ? m.medianPpsf * p.sqft : null;
  let current: number | null = null;
  let currentBasis = "No value on file";
  if (county != null && comp != null) {
    current = Math.round((county + comp) / 2);
    currentBasis = `Average of county appraisal ${money(county)} and ${p.sqft} sq ft × ${money(m!.medianPpsf!)}/sq ft area median`;
  } else if (county != null) {
    current = county;
    currentBasis = "County appraisal";
  } else if (comp != null) {
    current = Math.round(comp);
    currentBasis = "Sq ft × area median $/sq ft";
  }
  const arv = m && has(m.renovatedPpsf) && has(p.sqft) ? Math.round(m.renovatedPpsf * p.sqft) : null;
  const arvBasis = arv != null ? `${p.sqft} sq ft × ${money(m!.renovatedPpsf!)}/sq ft renovated sales in ${m!.key}` : "No renovated-sale evidence for this area";

  let debt: number | null = null;
  let debtBasis = "Debt unknown: no mortgage records pulled";
  const open = openMortgages(p);
  if (p.deedsCheckedAt && !open.length) {
    debt = 0;
    debtBasis = (p.mortgages ?? []).length
      ? `Every recorded security deed has a cancellation on record (index searched ${p.deedsCheckedAt.slice(0, 10)})`
      : `No security deed recorded since the last transfer (index searched ${p.deedsCheckedAt.slice(0, 10)})`;
  } else if (open.length) {
    debt = Math.round(
      open.reduce((s, x) => {
        const months = Math.max(0, Math.floor(((now.getTime() - new Date(x.date).getTime()) / DAY) / 30.44));
        return s + remainingBalance(x.amount, SCREEN.assumedRate, SCREEN.loanTermYears, months);
      }, 0),
    );
    debtBasis = `${open.length} open security deed${open.length > 1 ? "s" : ""} amortized at ${(SCREEN.assumedRate * 100).toFixed(1)}% / ${SCREEN.loanTermYears} yr (estimate; payoff unknown)`;
  } else if (has(p.lastSalePrice) && p.lastSaleDate) {
    const months = Math.floor(((now.getTime() - new Date(p.lastSaleDate).getTime()) / DAY) / 30.44);
    debt = Math.round(remainingBalance(p.lastSalePrice * SCREEN.assumedLtv, SCREEN.assumedRate, SCREEN.loanTermYears, months));
    debtBasis = `Assumes an ${SCREEN.assumedLtv * 100}% loan at last sale, amortized (inference; no mortgage record)`;
  } else {
    const yrs = ownershipYears(p, now);
    if (yrs != null && yrs >= 30) {
      debt = 0;
      debtBasis = `Owned ${yrs} years: a 30-year loan from purchase would be paid off (inference)`;
    }
  }
  const equity = current != null && debt != null ? current - debt : null;
  return { current, currentBasis, arv, arvBasis, debt, debtBasis, equity, equityPct: equity != null && current ? equity / current : null };
}

export function equityEngine(p: PropertyRecord, v: ValueEstimate, now: Date): EngineResult {
  const f: Finding[] = [];
  const unknowns: string[] = [];
  if (v.current == null) unknowns.push("Current value");
  if (v.equity != null && v.equityPct != null) {
    const inferredDebt = !p.deedsCheckedAt && !openMortgages(p).length;
    const ev: Evidence[] = [
      { source: prov(p, "fairMarketValue", "fulton_cama").source, detail: `Value: ${v.currentBasis}`, observedAt: prov(p, "fairMarketValue", "fulton_cama").asOf },
      { source: inferredDebt ? "rule" : "deeds", detail: v.debtBasis, observedAt: p.deedsCheckedAt ?? null, inferred: inferredDebt },
    ];
    const pts = v.equityPct >= 0.8 ? 55 : v.equityPct >= 0.5 ? 40 : v.equityPct >= 0.3 ? 20 : 0;
    if (pts) f.push({ text: `Estimated equity ${money(v.equity)} (${Math.round(v.equityPct * 100)}%)`, points: pts, evidence: ev });
    if (inferredDebt) unknowns.push("Recorded mortgages (search the deed index)");
  } else unknowns.push("Debt: pull security deeds to estimate equity");
  const yrs = ownershipYears(p, now);
  if (yrs != null && yrs >= 20)
    f.push({ text: `${yrs} years of appreciation since last transfer`, points: 15, evidence: [{ source: prov(p, "lastSaleDate", "deeds").source, detail: `Last transfer ${p.lastSaleDate?.slice(0, 10)}`, observedAt: p.lastSaleDate ?? null }] });
  const h = [...(p.assessedHistory ?? [])].sort((a, b) => a.year - b.year);
  if (h.length >= 2) {
    const first = h[0], last = h[h.length - 1];
    const g = first.value > 0 ? last.value / first.value - 1 : 0;
    if (g >= 0.3)
      f.push({ text: `County value up ${Math.round(g * 100)}% ${first.year}→${last.year}`, points: 15, evidence: [{ source: "fulton_cama", detail: `${money(first.value)} → ${money(last.value)}`, observedAt: `${last.year}-01-01` }] });
  }
  if (has(p.lastSalePrice) && v.current != null && p.lastSalePrice > 0 && v.current / p.lastSalePrice >= 2)
    f.push({ text: `Value is ${(v.current / p.lastSalePrice).toFixed(1)}× the last sale price`, points: 15, evidence: [{ source: prov(p, "lastSalePrice", "deeds").source, detail: `Last sale ${money(p.lastSalePrice)}`, observedAt: p.lastSaleDate ?? null }] });
  return engine("equity", f, unknowns);
}

export function valueGapEngine(p: PropertyRecord, v: ValueEstimate, m: MarketContext | undefined): EngineResult {
  const f: Finding[] = [];
  const unknowns: string[] = [];
  if (v.arv == null || v.current == null) {
    unknowns.push("Renovated comps for this area");
    return engine("valueGap", f, unknowns);
  }
  const gap = v.arv - v.current;
  const gapPct = gap / v.arv;
  if (gapPct > 0.15)
    f.push({
      text: `Renovated homes nearby trade ${money(gap)} (${Math.round(gapPct * 100)}%) above this one's estimated value`,
      points: clamp(gapPct * 160, 0, 70),
      evidence: [
        { source: "market", detail: v.arvBasis, observedAt: m?.asOf ?? null, inferred: true },
        { source: prov(p, "fairMarketValue", "fulton_cama").source, detail: v.currentBasis, observedAt: prov(p, "fairMarketValue", "fulton_cama").asOf },
      ],
    });
  if (m && has(m.renovationPermits12) && m.renovationPermits12 >= 20)
    f.push({ text: `${m.renovationPermits12} renovation permits in ${m.key} in 12 months: renovation is happening around it`, points: 20, evidence: [{ source: "permits", detail: `${m.key} permit count`, observedAt: m.asOf }] });
  unknowns.push("Rehab scope (contractor walk-through)");
  return engine("valueGap", f, unknowns);
}

export interface DevelopmentRead {
  extraUnits: number;
  aduCandidate: boolean;
  splitCandidate: boolean;
}

/** The ordinance table is the City of Atlanta's; other jurisdictions reuse codes like R-4 with different rules. */
const atlZoning = (p: PropertyRecord) => (p.zoning && (!p.city || p.city.toUpperCase() === "ATLANTA") ? ATL_ZONING[p.zoning.toUpperCase()] : undefined);

export function developmentRead(p: PropertyRecord): DevelopmentRead {
  const z = atlZoning(p);
  const existing = has(p.existingUnits) ? p.existingUnits : 1;
  let allowed = has(p.zoningMaxUnits) ? p.zoningMaxUnits : null;
  let split = false;
  if (allowed == null && z && !z.multifamily && has(p.lotSqft) && z.minLotSqft > 0) {
    const lots = Math.floor(p.lotSqft / z.minLotSqft);
    split = lots >= 2;
    allowed = Math.max(1, lots) * z.unitsPerLot;
  }
  const aduCandidate = !!z && !z.multifamily && has(p.lotSqft) && p.lotSqft >= 6000 && existing <= 1;
  return { extraUnits: allowed != null ? Math.max(0, allowed - existing) : 0, aduCandidate, splitCandidate: split };
}

export function developmentEngine(p: PropertyRecord, now: Date): EngineResult {
  const f: Finding[] = [];
  const unknowns: string[] = [];
  const d = developmentRead(p);
  const zEv: Evidence = { source: has(p.zoningMaxUnits) ? prov(p, "zoningMaxUnits", "zoning").source : "rule", detail: `Zoned ${p.zoning ?? "?"}, lot ${p.lotSqft?.toLocaleString() ?? "?"} sq ft${has(p.zoningMaxUnits) ? "" : " vs ordinance minimum lot table (verify)"}`, observedAt: prov(p, "zoning", "zoning").asOf, inferred: !has(p.zoningMaxUnits) };
  if (!p.zoning) unknowns.push("Zoning district");
  if (d.extraUnits > 0) f.push({ text: `Zoning screen allows ${d.extraUnits} more unit${d.extraUnits > 1 ? "s" : ""} than exist`, points: Math.min(40, 20 * d.extraUnits), evidence: [zEv] });
  if (d.splitCandidate) f.push({ text: "Lot is at least 2× the district minimum: lot-split candidate", points: 15, evidence: [zEv] });
  if (d.aduCandidate) f.push({ text: "Lot size fits an ADU screen", points: 10, evidence: [{ ...zEv, detail: "Single-family district, lot ≥ 6,000 sq ft (verify ADU rules)", inferred: true }] });
  const zz = atlZoning(p);
  if (zz?.multifamily && (p.existingUnits ?? 1) <= 2)
    f.push({ text: `Multifamily district (${p.zoning}) holding ${p.existingUnits ?? 1} unit(s)`, points: 30, evidence: [{ source: "zoning", detail: `Zoned ${p.zoning}`, observedAt: prov(p, "zoning", "zoning").asOf }] });
  if (has(p.landValue) && has(p.fairMarketValue) && p.fairMarketValue > 0 && p.landValue / p.fairMarketValue >= 0.6)
    f.push({ text: `Land is ${Math.round((p.landValue / p.fairMarketValue) * 100)}% of the county value: the structure adds little (teardown signal)`, points: 15, evidence: [{ source: "fulton_cama", detail: `Land ${money(p.landValue)} of ${money(p.fairMarketValue)}`, observedAt: prov(p, "landValue", "fulton_cama").asOf }] });
  if (p.cornerLot) f.push({ text: "Corner lot", points: 5, evidence: [{ source: "coa_parcels", detail: "Two street frontages", observedAt: null }] });
  if (has(p.adjacentSameOwner) && p.adjacentSameOwner > 0)
    f.push({ text: `Owner holds ${p.adjacentSameOwner} adjacent parcel${p.adjacentSameOwner > 1 ? "s" : ""}: assemblage`, points: 15, evidence: [{ source: "coa_parcels", detail: "Same owner name on touching parcels", observedAt: null }] });
  if (has(p.transitMi) && p.transitMi <= 0.5)
    f.push({ text: `${p.transitMi.toFixed(2)} mi to ${p.transitName ?? "MARTA rail"}`, points: 10, evidence: [{ source: "transit", detail: `Straight-line distance to ${p.transitName ?? "nearest rail station"}`, observedAt: null }] });
  if (p.opportunityZone) f.push({ text: "Inside a federal Opportunity Zone", points: 5, evidence: [{ source: "opportunity_zone", detail: "Census tract designated", observedAt: prov(p, "opportunityZone", "opportunity_zone").asOf }] });
  const nc = (p.permits ?? []).filter((x) => x.category === "new_construction" && x.issuedAt && daysBetween(new Date(x.issuedAt), now) <= 730);
  if (nc.length) f.push({ text: "New-construction permit on this parcel in 2 years: someone is already building", points: -20, evidence: nc.map((x) => ({ source: "permits" as const, detail: x.type, observedAt: x.issuedAt, ref: x.id })) });
  if (f.length) unknowns.push("Zoning office confirmation of units / setbacks");
  return engine("development", f, unknowns);
}

export function marketEngine(m: MarketContext | undefined): EngineResult {
  const f: Finding[] = [];
  if (!m) return engine("market", f, ["Area market data"]);
  const ev = (d: string): Evidence[] => [{ source: m.source, detail: d, observedAt: m.asOf, inferred: m.source === "market" }];
  if (has(m.salesLast12) && has(m.salesPrior12) && m.salesPrior12 > 0) {
    const g = m.salesLast12 / m.salesPrior12 - 1;
    if (g > 0.05) f.push({ text: `Sales in ${m.key} up ${Math.round(g * 100)}% year over year`, points: clamp(g * 100, 0, 25), evidence: ev(`${m.salesLast12} vs ${m.salesPrior12} sales`) });
  }
  if (has(m.rentGrowthPct) && m.rentGrowthPct > 0) f.push({ text: `Rents up ${m.rentGrowthPct.toFixed(1)}% in ${m.key}`, points: clamp(m.rentGrowthPct * 4, 0, 25), evidence: ev("Rent trend") });
  const build = (m.renovationPermits12 ?? 0) + 2 * (m.newConstructionPermits12 ?? 0);
  if (build >= 15) f.push({ text: `${m.renovationPermits12 ?? 0} renovation + ${m.newConstructionPermits12 ?? 0} new-construction permits in 12 months`, points: clamp(build / 2, 0, 35), evidence: [{ source: "permits", detail: `${m.key} permit activity`, observedAt: m.asOf }] });
  if (has(m.renovatedPpsf) && has(m.medianPpsf) && m.medianPpsf > 0 && m.renovatedPpsf / m.medianPpsf >= 1.3)
    f.push({ text: `Renovated homes sell ${Math.round((m.renovatedPpsf / m.medianPpsf - 1) * 100)}% above the area median per sq ft`, points: 15, evidence: ev("Renovation premium") });
  return engine("market", f, []);
}

export function riskEngine(p: PropertyRecord, v: ValueEstimate, now: Date): EngineResult {
  const f: Finding[] = [];
  if (p.floodZone && /^(A|AE|AH|AO|V|VE)/i.test(p.floodZone))
    f.push({ text: `FEMA flood zone ${p.floodZone}: insurance and lender cost`, points: 35, evidence: [{ source: "flood", detail: `Zone ${p.floodZone}`, observedAt: prov(p, "floodZone", "flood").asOf }] });
  if ((p.codeCases ?? []).some((c) => c.structural)) f.push({ text: "Structural flag on a code case", points: 25, evidence: (p.codeCases ?? []).filter((c) => c.structural).map((c) => ({ source: c.source, detail: "Structural", observedAt: c.openedAt, ref: c.id })) });
  if (p.foreclosure) {
    const days = daysBetween(now, new Date(p.foreclosure.saleDate));
    if (days >= 0 && days <= 14) f.push({ text: `Only ${days} days to the foreclosure sale`, points: 15, evidence: [{ source: "foreclosure_notice", detail: `Sale ${p.foreclosure.saleDate.slice(0, 10)}`, observedAt: p.foreclosure.noticeDate ?? null }] });
  }
  if (v.equityPct != null && v.equityPct < 0.1) f.push({ text: "Little or no equity: owner may not be able to sell at a discount", points: 25, evidence: [{ source: "rule", detail: v.debtBasis, observedAt: null, inferred: true }] });
  const fd = (p.transfers ?? []).find((t) => FORECLOSURE_DEED.test(t.deedType ?? ""));
  if (fd) f.push({ text: "Went through foreclosure before (deed under power on record)", points: 5, evidence: [{ source: "deeds", detail: fd.deedType ?? "", observedAt: fd.date, ref: fd.ref }] });
  if (has(p.yearBuilt) && p.yearBuilt < 1978) f.push({ text: `Built ${p.yearBuilt}: lead-paint disclosure and possible asbestos`, points: 5, evidence: [{ source: prov(p, "yearBuilt", "fulton_cama").source, detail: `Year built ${p.yearBuilt}`, observedAt: null }] });
  return engine("risk", f, []);
}

// ─── Corroboration ──────────────────────────────────────────────────────────

export interface Conclusion {
  label: string;
  evidence: Evidence[];
  independentSources: number;
  corroborated: boolean;
}

function conclusion(label: string, evidence: Evidence[]): Conclusion | null {
  if (!evidence.length) return null;
  const independentSources = new Set(evidence.filter((e) => !e.inferred && e.source !== "rule").map((e) => e.source)).size;
  return { label, evidence, independentSources, corroborated: independentSources >= 2 };
}

/** The big conclusions, each with every independent piece of evidence behind it. */
export function conclusions(p: PropertyRecord, engines: Record<EngineKey, EngineResult>): Conclusion[] {
  const pick = (k: EngineKey, re: RegExp) => engines[k].findings.filter((x) => re.test(x.text)).flatMap((x) => x.evidence);
  const out = [
    conclusion("Absentee owner", pick("motivation", /Absentee|Tired-landlord/)),
    conclusion("Distress", [...engines.distress.findings.flatMap((x) => x.evidence)]),
    conclusion("Vacant", [
      ...pick("distress", /Vacant/),
      ...(p.codeCases ?? []).filter((c) => /vacant|abandon|open and vacant|unsecured/i.test(c.type ?? "")).map((c) => ({ source: c.source, detail: c.type ?? "", observedAt: c.openedAt, ref: c.id })),
    ]),
    conclusion("Equity", engines.equity.findings.flatMap((x) => x.evidence)),
    conclusion("Renovation opportunity", [...engines.valueGap.findings.flatMap((x) => x.evidence), ...pick("distress", /renovation permit/)]),
    conclusion("Development potential", engines.development.findings.filter((x) => x.points > 0).flatMap((x) => x.evidence)),
  ];
  return out.filter((c): c is Conclusion => !!c);
}

// ─── Strategies ─────────────────────────────────────────────────────────────

export type StrategyKey = "wholesale" | "flip" | "rental" | "brrrr" | "mf_conversion" | "development" | "land" | "no_go";

export const STRATEGY_LABELS: Record<StrategyKey, string> = {
  wholesale: "Wholesale",
  flip: "Flip",
  rental: "Buy & hold",
  brrrr: "BRRRR",
  mf_conversion: "Multifamily conversion",
  development: "Development",
  land: "Land play",
  no_go: "No-go",
};

export interface StrategyRead {
  key: StrategyKey;
  fit: number; // 0–100
  economics: string;
  value: number | null; // rough $ the strategy could produce
}

export function rehabEstimate(p: PropertyRecord, distress: number): { value: number | null; tier: keyof typeof SCREEN.rehabPpsf } {
  const tier = distress >= 50 ? "heavy" : distress >= 25 ? "medium" : "light";
  return { value: has(p.sqft) ? Math.round(p.sqft * SCREEN.rehabPpsf[tier]) : null, tier };
}

export function strategies(p: PropertyRecord, v: ValueEstimate, e: Record<EngineKey, EngineResult>): StrategyRead[] {
  const rehab = rehabEstimate(p, e.distress.score);
  const out: StrategyRead[] = [];
  const offerRoom = v.arv != null && rehab.value != null ? v.arv * SCREEN.wholesaleMaoPct - rehab.value : null;
  const disc = v.current != null && offerRoom != null ? offerRoom / v.current : null;
  const motivated = (e.distress.score + e.motivation.score) / 2;

  out.push({
    key: "wholesale",
    fit: clamp(Math.round(0.5 * motivated + 0.3 * e.equity.score + (disc != null ? clamp(disc * 60, 0, 30) : 0))),
    economics: offerRoom != null ? `Investor max offer ≈ ARV × 70% − rehab = ${money(offerRoom)}; your contract must land below it` : "Needs ARV evidence",
    value: offerRoom != null && v.current != null ? Math.max(0, Math.round(offerRoom * 0.12)) : null,
  });
  const flipProfit = v.arv != null && v.current != null && rehab.value != null ? v.arv * (1 - SCREEN.flipCostPct) - v.current * 0.85 - rehab.value : null;
  out.push({
    key: "flip",
    fit: clamp(Math.round(0.6 * e.valueGap.score + 0.25 * e.market.score + (flipProfit != null && flipProfit > 30000 ? 20 : 0))),
    economics: flipProfit != null ? `ARV ${money(v.arv!)} − ${SCREEN.flipCostPct * 100}% costs − purchase at 85% of value − ${rehab.tier} rehab ${money(rehab.value!)} ≈ ${money(flipProfit)}` : "Needs ARV + square footage",
    value: flipProfit,
  });
  const rent = p.rentEstimate?.value ?? null;
  const rtv = rent != null && v.current != null ? rent / (v.current + (rehab.value ?? 0)) : null;
  out.push({
    key: "rental",
    fit: clamp(Math.round((rtv != null ? clamp((rtv / SCREEN.rentToValueFloor) * 50, 0, 70) : 0) + 0.3 * e.market.score)),
    economics: rtv != null ? `Rent ${money(rent!)}/mo is ${(rtv * 100).toFixed(2)}% of price + rehab per month (screen: ${(SCREEN.rentToValueFloor * 100).toFixed(1)}%)` : "Needs a rent estimate",
    value: rent != null ? Math.round(rent * 12 * 0.55) : null,
  });
  const brrrrEq = v.arv != null && v.current != null && rehab.value != null ? v.arv - (v.current * 0.85 + rehab.value) : null;
  out.push({
    key: "brrrr",
    fit: clamp(Math.round(0.45 * e.valueGap.score + (rtv != null ? clamp((rtv / SCREEN.rentToValueFloor) * 30, 0, 40) : 0) + 0.15 * e.market.score)),
    economics: brrrrEq != null ? `Equity created ≈ ARV − (85% of value + rehab) = ${money(brrrrEq)}` : "Needs ARV + rent",
    value: brrrrEq,
  });
  const d = developmentRead(p);
  out.push({
    key: "mf_conversion",
    fit: clamp(Math.round(d.extraUnits > 0 ? 40 + 15 * Math.min(d.extraUnits, 3) + 0.2 * e.market.score : 0)),
    economics: d.extraUnits > 0 ? `${d.extraUnits} more unit(s) on the zoning screen; confirm with the zoning office before counting it` : "Zoning screen shows no extra units",
    value: d.extraUnits > 0 && rent != null ? Math.round(d.extraUnits * rent * 0.8 * 12 * 0.6) : null,
  });
  out.push({
    key: "development",
    fit: clamp(Math.round(0.8 * e.development.score + 0.2 * e.market.score)),
    economics: d.splitCandidate ? "Lot-split candidate: value as two lots to a builder" : d.extraUnits > 0 ? "Infill units on the existing lot" : "Builder lot value needs vacant-lot sales",
    value: has(p.landValue) && d.splitCandidate ? Math.round(p.landValue * 0.6) : null,
  });
  out.push({
    key: "land",
    fit: clamp(Math.round((has(p.landValue) && has(p.fairMarketValue) && p.fairMarketValue > 0 ? (p.landValue / p.fairMarketValue) * 60 : 0) + 0.4 * e.market.score)),
    economics: has(p.landValue) ? `County land value ${money(p.landValue)}` : "No land value on file",
    value: null,
  });
  const best = Math.max(...out.map((s) => s.fit));
  out.push({
    key: "no_go",
    fit: clamp(Math.round(e.risk.score + (best < 35 ? 40 : 0))),
    economics: e.risk.findings.length ? e.risk.findings.map((x) => x.text).join("; ") : "No red flags on record",
    value: null,
  });
  return out.sort((a, b) => b.fit - a.fit);
}

// ─── Opportunity ────────────────────────────────────────────────────────────

export const WEIGHTS: Record<Exclude<EngineKey, "risk">, number> = {
  distress: 0.25,
  motivation: 0.18,
  equity: 0.17,
  valueGap: 0.14,
  development: 0.14,
  market: 0.12,
};
/** No property maxes every engine; stretch the weighted mean so a strong stack can reach the 90s. */
export const STRETCH = 1.3;
export const RISK_WEIGHT = 0.2;

export type Mission = "hot" | "equity" | "distress" | "develop" | "absentee" | "new";
export const MISSIONS: { key: Mission; label: string; icon: string }[] = [
  { key: "hot", label: "Hot", icon: "🔥" },
  { key: "equity", label: "Equity", icon: "💰" },
  { key: "distress", label: "Distress", icon: "🏚" },
  { key: "develop", label: "Develop", icon: "🏗" },
  { key: "absentee", label: "Absentee", icon: "🏠" },
  { key: "new", label: "New signals", icon: "⚡" },
];

export interface Intel {
  p: PropertyRecord;
  engines: Record<EngineKey, EngineResult>;
  value: ValueEstimate;
  score: number;
  confidence: number;
  conclusions: Conclusion[];
  strategies: StrategyRead[];
  missions: Mission[];
  why: string;
  strongest: string[];
  unknowns: string[];
  nextVerification: string;
  independentSources: number;
  badges: Record<Badge, number>;
  newestSignalAt: string | null;
  primarySignal: string;
}

export function analyze(p: PropertyRecord, market: Record<string, MarketContext>, now: Date): Intel {
  const m = (p.zip && market[p.zip]) || (p.neighborhood && market[p.neighborhood]) || undefined;
  const v = estimateValue(p, m, now);
  const engines: Record<EngineKey, EngineResult> = {
    distress: distressEngine(p, now),
    motivation: motivationEngine(p, now),
    equity: equityEngine(p, v, now),
    valueGap: valueGapEngine(p, v, m),
    development: developmentEngine(p, now),
    market: marketEngine(m),
    risk: riskEngine(p, v, now),
  };
  const raw = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((s, k) => s + WEIGHTS[k] * engines[k].score, 0);
  const score = clamp(Math.round(raw * STRETCH - RISK_WEIGHT * engines.risk.score));

  const allEv = (Object.values(engines) as EngineResult[]).filter((e) => e.key !== "risk").flatMap((e) => e.findings.filter((f) => f.points > 0).flatMap((f) => f.evidence));
  const badges: Record<Badge, number> = { VERIFIED: 0, INFERRED: 0, STALE: 0 };
  allEv.forEach((e) => badges[badge(e, now)]++);
  const independentSources = new Set(allEv.filter((e) => badge(e, now) !== "INFERRED").map((e) => e.source)).size;
  const verifiedShare = allEv.length ? badges.VERIFIED / allEv.length : 0;
  const unknowns = [...new Set((Object.values(engines) as EngineResult[]).flatMap((e) => e.unknowns))];
  const critical = unknowns.filter((u) => /value|debt|mortgage|tax status|zoning district/i.test(u)).length;
  const confidence = clamp(Math.round(30 + 9 * Math.min(independentSources, 6) + 20 * verifiedShare - 4 * Math.min(critical, 4)), 5, 97);

  const ranked = (Object.values(engines) as EngineResult[]).filter((e) => e.key !== "risk").flatMap((e) => e.findings).filter((f) => f.points > 0).sort((a, b) => b.points - a.points);
  const strongest = ranked.slice(0, 4).map((f) => f.text);
  const strats = strategies(p, v, engines);

  const missions: Mission[] = [];
  if (score >= 70) missions.push("hot");
  if (engines.equity.score >= 40) missions.push("equity");
  if (engines.distress.score >= 30) missions.push("distress");
  if (engines.development.score >= 30) missions.push("develop");
  if (isAbsentee(p)) missions.push("absentee");
  // "New" means a new event on the parcel (complaint, permit, tax list, notice, filing), not a refreshed attribute.
  const EVENT_SOURCES: SourceId[] = ["building_complaints", "atl311", "permits", "tax_delinquent", "foreclosure_notice", "probate", "deeds"];
  const parcelEv = [engines.distress, engines.motivation, engines.development].flatMap((e) => e.findings.flatMap((f) => f.evidence));
  const dates = parcelEv.filter((e) => !e.inferred && e.observedAt && EVENT_SOURCES.includes(e.source)).map((e) => e.observedAt!).sort();
  const newestSignalAt = dates.length ? dates[dates.length - 1] : null;
  if (newestSignalAt && daysBetween(new Date(newestSignalAt), now) <= 30) missions.push("new");

  const nextVerification = unknowns.find((u) => /tax status/i.test(u))
    ? "Check the Tax Commissioner account"
    : unknowns.find((u) => /mortgage|debt/i.test(u))
      ? "Pull security deeds from the clerk's real-estate index"
      : engines.development.score >= 30
        ? "Call the zoning office to confirm units and setbacks"
        : "Drive-by / site inspection, then owner contact";

  const primarySignal = p.foreclosure
    ? "FORECLOSURE"
    : p.probate
      ? "PROBATE"
      : p.taxDelinquent
        ? "TAX DELINQUENT"
        : engines.development.score >= 40
          ? "DEVELOPMENT"
          : engines.equity.score >= 55
            ? "HIGH EQUITY"
            : currentCodeCases(p, now).length || currentCodeCases(p, now, "atl311").length
              ? "CODE COMPLAINT"
              : isAbsentee(p)
                ? "ABSENTEE"
                : "RESEARCH";

  return {
    p,
    engines,
    value: v,
    score,
    confidence,
    conclusions: conclusions(p, engines),
    strategies: strats,
    missions,
    why: `${allEv.length} signal${allEv.length === 1 ? "" : "s"} from ${independentSources} independent record source${independentSources === 1 ? "" : "s"}`,
    strongest,
    unknowns,
    nextVerification,
    independentSources,
    badges,
    newestSignalAt,
    primarySignal,
  };
}

export function analyzeAll(props: PropertyRecord[], market: Record<string, MarketContext>, now: Date): Intel[] {
  return props.map((p) => analyze(p, market, now)).sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}
