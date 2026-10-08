/**
 * Atlanta public-record rows → PropertyRecord (lib/re-intel.ts).
 *
 * Pure mapping used by tools/atlanta-intel/atlanta-feed.mjs. ArcGIS layers
 * rename fields between releases, so every field is found by a list of
 * candidate names (case- and punctuation-insensitive) and the feed reports
 * what it could not map instead of silently dropping it.
 */
import type { CodeCase, MarketContext, Permit, PermitCategory, PropertyRecord, SourceId } from "./re-intel.ts";

export type Row = Record<string, unknown>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** First non-empty value among candidate field names. */
export function pick(row: Row, candidates: string[]): unknown {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find((x) => norm(x) === norm(c));
    if (k != null && row[k] != null && String(row[k]).trim() !== "") return row[k];
  }
  return null;
}

export const str = (v: unknown): string | null => (v == null ? null : String(v).trim() || null);
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[$,\s]/g, ""));
  return isFinite(n) ? n : null;
}
/** ArcGIS dates arrive as epoch ms; CSV exports as strings. */
export function date(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
const yes = (v: unknown) => /^(y|yes|true|1|x)$/i.test(String(v ?? "").trim());

/** Parcel ids are written with and without spaces/dashes across layers. */
export const parcelKey = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

export const FIELDS = {
  parcelId: ["PARCELID", "PARCEL_ID", "PIN", "ParcelNumber", "PARCEL", "Parcel_No", "LOWPARCELID", "APN"],
  address: ["SITEADDRESS", "SITUS_ADDRESS", "Address", "ADDRESS", "FULLADDR", "SiteAddr", "PROPERTY_ADDRESS", "LOCATION"],
  zip: ["SITEZIP", "ZIP", "ZIPCODE", "ZIP_CODE", "SitusZip"],
  owner: ["OWNERNME1", "OWNER", "OWNER_NAME", "Owner1", "OWNERNAME"],
  ownerMail1: ["PSTLADDRESS", "MAILADDR", "MAILING_ADDRESS", "OWNER_ADDRESS", "OwnerAddr1", "MAIL_ADDR1"],
  ownerMailCity: ["PSTLCITY", "MAILCITY", "OWNER_CITY", "MAIL_CITY"],
  ownerMailState: ["PSTLSTATE", "MAILSTATE", "OWNER_STATE", "MAIL_STATE"],
  ownerMailZip: ["PSTLZIP5", "MAILZIP", "OWNER_ZIP", "MAIL_ZIP"],
  landUse: ["CLASSDSCRP", "LANDUSE", "LUC_DESC", "PROPERTY_CLASS", "USECD"],
  zoning: ["ZONING", "ZONING_CODE", "ZONECLASS", "Zoning1"],
  lotSqft: ["LOT_SQFT", "LANDSQFT", "LAND_SQFT", "LotSize", "SQFT_LAND"],
  lotAcres: ["ACRES", "CALC_ACRE", "STATEDAREA", "Acreage"],
  sqft: ["RESFLRAREA", "LIVING_AREA", "BLDG_SQFT", "SQFT", "HEATED_SQFT", "FinishedArea"],
  beds: ["BEDROOMS", "BEDS", "NUM_BEDROOMS"],
  baths: ["BATHS", "FULL_BATHS", "BATHROOMS", "NUM_BATHS"],
  yearBuilt: ["RESYRBLT", "YEAR_BUILT", "YRBUILT", "YearBuilt"],
  units: ["UNITS", "LIVING_UNITS", "NUM_UNITS", "DWELLING_UNITS"],
  assessed: ["TOT_ASSESS", "TOTAL_ASSESSED", "ASSESSED_VALUE", "CNTASSDVAL", "TotAssess"],
  appraised: ["TOT_APPR", "TOTAL_APPRAISED", "APPRAISED_VALUE", "FAIR_MARKET_VALUE", "TotAppr", "MARKET_VALUE"],
  landValue: ["LAND_APPR", "LANDVAL", "LAND_VALUE", "LndAppr"],
  homestead: ["HOMESTEAD", "EXEMPT_CODE", "HMSTD", "EXEMPTIONS"],
  saleDate: ["SALEDATE", "SALE_DATE", "LAST_SALE_DATE", "DeedDate"],
  salePrice: ["SALEPRICE", "SALE_PRICE", "LAST_SALE_PRICE", "SaleAmt"],
  taxYear: ["TAXYEAR", "TAX_YEAR", "TAXYR"],
  // permits / complaints
  permitId: ["PERMIT_NUMBER", "PermitNum", "RECORD_ID", "Record_ID", "RECORDID", "CASE_NUMBER", "PERMITNO", "OBJECTID"],
  permitType: ["RECORD_TYPE", "RecordType", "PERMIT_TYPE", "PermitType", "WORK_TYPE", "TYPE", "Record_Type"],
  permitSubtype: ["PERMIT_SUBTYPE", "SUBTYPE", "WorkClass", "WORK_CLASS", "CATEGORY"],
  permitDesc: ["DESCRIPTION", "WORK_DESCRIPTION", "PROJECT_DESCRIPTION", "Description", "PROJECT_NAME"],
  permitStatus: ["STATUS", "RECORD_STATUS", "Status", "CASE_STATUS"],
  permitDate: ["ISSUED_DATE", "ISSUE_DATE", "IssuedDate", "OPENED_DATE", "OPEN_DATE", "APPLIED_DATE", "FILE_DATE", "DATE_OPENED", "CreatedDate"],
  permitValue: ["VALUATION", "JOB_VALUE", "CONST_COST", "EstProjectCost", "VALUE"],
  // code enforcement history
  caseId: ["CASE_NUMBER", "CaseNumber", "CASE_NO", "CASE_ID", "OBJECTID"],
  caseType: ["CASE_TYPE", "CaseType", "VIOLATION_TYPE", "VIOLATION", "TYPE", "Description"],
  caseStatus: ["CASE_STATUS", "STATUS", "Status"],
  caseOpened: ["OPEN_DATE", "DATE_OPENED", "OPENED", "CASE_DATE", "CreatedDate", "InspectionDate"],
  vacant: ["VACANT", "IS_VACANT", "Vacant", "VACANT_FLAG"],
  boarded: ["BOARDED", "IS_BOARDED", "Boarded", "BOARDED_FLAG"],
  structural: ["STRUCTURAL", "Structural", "STRUCTURAL_FLAG", "UNSAFE"],
} as const;

/** Which candidate lists found nothing in this layer's first row (for the source report). */
export function unmappedFields(sample: Row | undefined, keys: (keyof typeof FIELDS)[]): string[] {
  if (!sample) return keys as string[];
  return keys.filter((k) => !Object.keys(sample).some((x) => (FIELDS[k] as readonly string[]).some((c) => norm(c) === norm(x))));
}

export function categorizePermit(type: string, subtype = "", desc = ""): PermitCategory {
  const t = `${type} ${subtype} ${desc}`.toLowerCase();
  if (/complaint/.test(t)) return "complaint";
  if (/demoli|\bdemo\b|wreck/.test(t)) return "demolition";
  if (/new (construction|building|dwelling|single|sfd|residence)|\bnew\b.*\b(sfr|sfd|duplex|townhome|home)\b|new construct/.test(t)) return "new_construction";
  if (/alter|addition|renov|remodel|repair|interior|kitchen|bath|roof|reno\b|rehab|replace|upgrade|deck|porch/.test(t)) return "renovation";
  return "other";
}

const OPEN_STATUS = /open|active|pending|in progress|issued|new|received|assigned|under (review|investigation)/i;
const CLOSED_STATUS = /closed|complete|finaled|resolved|void|cancel|withdrawn|expired|abated/i;

export interface PermitRowResult {
  parcel: string | null;
  address: string | null;
  permit?: Permit;
  complaint?: CodeCase;
}

/** One permit-system row → a permit, or (for "Building Complaint" records) a current code case. */
export function mapPermitRow(row: Row): PermitRowResult {
  const type = str(pick(row, [...FIELDS.permitType])) ?? "";
  const subtype = str(pick(row, [...FIELDS.permitSubtype])) ?? "";
  const desc = str(pick(row, [...FIELDS.permitDesc])) ?? "";
  const id = str(pick(row, [...FIELDS.permitId])) ?? "";
  const status = str(pick(row, [...FIELDS.permitStatus])) ?? undefined;
  const at = date(pick(row, [...FIELDS.permitDate]));
  const parcel = str(pick(row, [...FIELDS.parcelId]));
  const address = str(pick(row, [...FIELDS.address]));
  const cat = categorizePermit(type, subtype, desc);
  if (cat === "complaint") {
    const text = `${subtype} ${desc}`;
    return {
      parcel,
      address,
      complaint: {
        id,
        source: "building_complaints",
        openedAt: at,
        status,
        type: [type, subtype].filter(Boolean).join(" · ") || "Building complaint",
        open: status ? OPEN_STATUS.test(status) && !CLOSED_STATUS.test(status) : undefined,
        vacant: /vacan|abandon|unsecured|open (and|&) vacant/i.test(text),
        boarded: /board/i.test(text),
        structural: /structur|collapse|unsafe|dangerous/i.test(text),
      },
    };
  }
  return { parcel, address, permit: { id, category: cat, type: [type, subtype].filter(Boolean).join(" · "), status, issuedAt: at, value: num(pick(row, [...FIELDS.permitValue])), description: desc || undefined } };
}

export function mapCodeRow(row: Row): { parcel: string | null; address: string | null; case: CodeCase } {
  const type = str(pick(row, [...FIELDS.caseType])) ?? "Code case";
  const status = str(pick(row, [...FIELDS.caseStatus])) ?? undefined;
  return {
    parcel: str(pick(row, [...FIELDS.parcelId])),
    address: str(pick(row, [...FIELDS.address])),
    case: {
      id: str(pick(row, [...FIELDS.caseId])) ?? "",
      source: "code_history",
      openedAt: date(pick(row, [...FIELDS.caseOpened])),
      status,
      type,
      open: status ? !CLOSED_STATUS.test(status) : undefined,
      vacant: yes(pick(row, [...FIELDS.vacant])) || /vacan/i.test(type),
      boarded: yes(pick(row, [...FIELDS.boarded])),
      structural: yes(pick(row, [...FIELDS.structural])),
    },
  };
}

/** Polygon rings → [lng, lat] centroid (vertex average is fine at parcel scale). */
export function centroid(geom: unknown): { lat: number; lng: number } | null {
  const g = geom as { x?: number; y?: number; rings?: number[][][] } | null;
  if (!g) return null;
  if (typeof g.x === "number" && typeof g.y === "number") return { lng: g.x, lat: g.y };
  const pts = g.rings?.[0];
  if (!pts?.length) return null;
  const s = pts.reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
  return { lng: s[0] / pts.length, lat: s[1] / pts.length };
}

/** Parcel layer row (+ optional CAMA row for the same parcel) → PropertyRecord base. */
export function mapParcel(parcelRow: Row, geometry: unknown, cama: Row | undefined, pulledAt: string): PropertyRecord {
  const both = (k: keyof typeof FIELDS) => pick(cama ?? {}, [...FIELDS[k]]) ?? pick(parcelRow, [...FIELDS[k]]);
  const srcOf = (k: keyof typeof FIELDS): SourceId => (cama && pick(cama, [...FIELDS[k]]) != null ? "fulton_cama" : "coa_parcels");
  const id = parcelKey(pick(parcelRow, [...FIELDS.parcelId]));
  const c = centroid(geometry);
  const mail = [str(pick(parcelRow, [...FIELDS.ownerMail1])), str(pick(parcelRow, [...FIELDS.ownerMailCity])), str(pick(parcelRow, [...FIELDS.ownerMailState])), str(pick(parcelRow, [...FIELDS.ownerMailZip]))].filter(Boolean).join(", ");
  const appraised = num(both("appraised"));
  const assessed = num(both("assessed"));
  const lotSqft = num(both("lotSqft")) ?? (num(both("lotAcres")) != null ? Math.round(num(both("lotAcres"))! * 43560) : null);
  const hs = str(both("homestead"));
  const taxYear = num(both("taxYear"));
  const valueAsOf = taxYear ? `${taxYear}-01-01T00:00:00.000Z` : pulledAt;
  const p: PropertyRecord = {
    id,
    address: str(pick(parcelRow, [...FIELDS.address])) ?? "",
    city: "Atlanta",
    zip: str(pick(parcelRow, [...FIELDS.zip]))?.slice(0, 5) ?? undefined,
    county: "Fulton",
    lat: c?.lat ?? null,
    lng: c?.lng ?? null,
    owner: str(pick(parcelRow, [...FIELDS.owner])) ?? undefined,
    ownerMailing: mail || undefined,
    ownerMailingState: str(pick(parcelRow, [...FIELDS.ownerMailState])) ?? undefined,
    homesteadExemption: hs == null ? null : !/^(0|n|no|none)$/i.test(hs),
    landUse: str(both("landUse")) ?? undefined,
    existingUnits: num(both("units")),
    beds: num(both("beds")),
    baths: num(both("baths")),
    sqft: num(both("sqft")),
    yearBuilt: num(both("yearBuilt")),
    lotSqft,
    zoning: str(both("zoning")) ?? undefined,
    // Georgia assesses at 40% of fair market value.
    fairMarketValue: appraised ?? (assessed != null ? Math.round(assessed / 0.4) : null),
    landValue: num(both("landValue")),
    valueAsOf,
    lastSaleDate: date(both("saleDate")),
    lastSalePrice: num(both("salePrice")),
    permits: [],
    codeCases: [],
    provenance: {
      owner: { source: "coa_parcels", asOf: pulledAt },
      ownerMailing: { source: "coa_parcels", asOf: pulledAt },
      homesteadExemption: { source: srcOf("homestead"), asOf: valueAsOf },
      fairMarketValue: { source: srcOf("appraised") === "fulton_cama" || srcOf("assessed") === "fulton_cama" ? "fulton_cama" : "coa_parcels", asOf: valueAsOf },
      landValue: { source: srcOf("landValue"), asOf: valueAsOf },
      yearBuilt: { source: srcOf("yearBuilt"), asOf: valueAsOf },
      zoning: { source: srcOf("zoning"), asOf: pulledAt },
      lastSaleDate: { source: srcOf("saleDate"), asOf: pulledAt },
      lastSalePrice: { source: srcOf("salePrice"), asOf: pulledAt },
    },
  };
  return p;
}

/** Tax list / foreclosure / probate CSVs the user obtains by request, keyed by parcel or address. */
export function attachListRow(p: PropertyRecord, kind: "tax" | "foreclosure" | "probate", row: Row, asOf: string) {
  if (kind === "tax") p.taxDelinquent = { amount: num(pick(row, ["AMOUNT_DUE", "BALANCE", "AMOUNT", "TOTAL_DUE", "DUE"])), years: num(pick(row, ["YEARS", "YEARS_DELINQUENT", "TAX_YEARS"])), asOf };
  if (kind === "foreclosure") {
    const sale = date(pick(row, ["SALE_DATE", "SALEDATE", "AUCTION_DATE"]));
    if (sale) p.foreclosure = { saleDate: sale, noticeDate: date(pick(row, ["NOTICE_DATE", "PUBLISHED", "FIRST_PUBLISHED"])) ?? asOf, lender: str(pick(row, ["LENDER", "GRANTEE", "PLAINTIFF"])) ?? undefined, ref: str(pick(row, ["REF", "URL", "NOTICE_ID"])) ?? undefined };
  }
  if (kind === "probate") p.probate = { filedAt: date(pick(row, ["FILED", "FILE_DATE", "FILED_DATE", "DATE"])) ?? asOf, caseNo: str(pick(row, ["CASE", "CASE_NO", "CASE_NUMBER", "ESTATE_NO"])) ?? undefined };
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Per-ZIP market context from the public records already pulled: county value
 * per sq ft, sales counts by year, permit activity. Renovated $/sq ft comes
 * from properties that sold within 18 months of a renovation permit.
 */
export function buildMarket(props: PropertyRecord[], now: Date): Record<string, MarketContext> {
  const byZip = new Map<string, PropertyRecord[]>();
  props.forEach((p) => p.zip && byZip.set(p.zip, [...(byZip.get(p.zip) ?? []), p]));
  const yr = 365.25 * 86_400_000;
  const out: Record<string, MarketContext> = {};
  for (const [zip, ps] of byZip) {
    const age = (iso: string | null | undefined) => (iso ? (now.getTime() - new Date(iso).getTime()) / yr : Infinity);
    const permits = ps.flatMap((p) => p.permits ?? []).filter((x) => age(x.issuedAt) <= 1);
    const renoSales = ps
      .filter((p) => p.sqft && p.lastSalePrice && age(p.lastSaleDate) <= 2 && (p.permits ?? []).some((x) => (x.category === "renovation" || x.category === "new_construction") && x.issuedAt && p.lastSaleDate && Math.abs(new Date(p.lastSaleDate).getTime() - new Date(x.issuedAt).getTime()) <= 1.5 * yr))
      .map((p) => p.lastSalePrice! / p.sqft!);
    out[zip] = {
      key: zip,
      medianPpsf: median(ps.filter((p) => p.sqft && p.fairMarketValue).map((p) => p.fairMarketValue! / p.sqft!)),
      renovatedPpsf: renoSales.length >= 3 ? median(renoSales) : null,
      salesLast12: ps.filter((p) => age(p.lastSaleDate) <= 1).length,
      salesPrior12: ps.filter((p) => age(p.lastSaleDate) > 1 && age(p.lastSaleDate) <= 2).length,
      renovationPermits12: permits.filter((x) => x.category === "renovation").length,
      newConstructionPermits12: permits.filter((x) => x.category === "new_construction").length,
      demolitionPermits12: permits.filter((x) => x.category === "demolition").length,
      asOf: now.toISOString(),
      source: "market",
    };
  }
  return out;
}

/** Columns the Atlanta Deal Intelligence worksheet's CSV importer already understands. */
export function toDealIntelCsvRow(p: PropertyRecord, extra: { equityPct: number | null; yearsOwned: number | null; arv: number | null; rehab: number | null }): Record<string, string | number> {
  const flag = (b: unknown) => (b ? "yes" : "");
  return {
    address: p.address,
    city: p.city ?? "",
    zip: p.zip ?? "",
    county: p.county ?? "",
    type: (p.existingUnits ?? 1) >= 2 ? `${p.existingUnits} unit` : "single family",
    beds: p.beds ?? "",
    baths: p.baths ?? "",
    sqft: p.sqft ?? "",
    lotsqft: p.lotSqft ?? "",
    yearbuilt: p.yearBuilt ?? "",
    zoning: p.zoning ?? "",
    arv: extra.arv ?? "",
    rehab: extra.rehab ?? "",
    equitypct: extra.equityPct != null ? Math.round(extra.equityPct * 100) : "",
    yearsowned: extra.yearsOwned ?? "",
    preforeclosure: flag(p.foreclosure),
    taxdelinquent: flag(p.taxDelinquent),
    codeviolation: flag((p.codeCases ?? []).length),
    vacant: flag((p.codeCases ?? []).some((c) => c.vacant || c.boarded)),
    inherited: flag(p.probate),
    absentee: flag(p.ownerMailing && !String(p.ownerMailing).toUpperCase().startsWith(p.address.toUpperCase())),
    notes: `Parcel ${p.id}`,
  };
}
