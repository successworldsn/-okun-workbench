/**
 * Atlanta public-record rows → PropertyRecord (lib/re-intel.ts).
 *
 * Pure mapping used by tools/atlanta-intel/atlanta-feed.mjs. ArcGIS layers
 * rename fields between releases, so every field is found by a list of
 * candidate names (case- and punctuation-insensitive) and the feed reports
 * what it could not map instead of silently dropping it.
 */
import type { CodeCase, MarketContext, Mortgage, Permit, PermitCategory, PropertyRecord, SourceId, Transfer } from "./re-intel.ts";

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
const yes = (v: unknown) => /^(y|yes|true|1|x|checked)$/i.test(String(v ?? "").trim());

/** Parcel ids are written with and without spaces/dashes across layers. */
export const parcelKey = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");

export const FIELDS = {
  parcelId: ["PARCELID", "PARCEL_NO", "PARID", "PIN_NUM", "PARCELNUMB", "PARCEL_ID", "PIN", "ParcelNumber", "PARCEL", "Parcel_No", "LOWPARCELID", "APN"],
  address: ["SITEADDRESS", "SITUS_ADDR", "SITUSADDR", "LOCADDR", "LOCATION_ADDRESS", "PROP_ADDR", "SITUS", "SITUS_ADDRESS", "Address", "ADDRESS", "FULLADDR", "SiteAddr", "PROPERTY_ADDRESS", "LOCATION"],
  city: ["SITECITY", "SITUS_CITY", "LOCCITY", "CITY", "PROP_CITY"],
  zip: ["SITEZIP", "ZIP", "ZIPCODE", "ZIP_CODE", "SitusZip"],
  owner: ["OWNERNME1", "OWNER_NAM1", "OWNNAME", "OWNER1_NAME", "OWN1", "OWNER", "OWNER_NAME", "Owner1", "OWNERNAME"],
  ownerMail1: ["PSTLADDRESS", "OWNER_ADDR1", "MAIL_ADDRESS", "OWNADDR1", "MAILADDR1", "MAILADDR", "MAILING_ADDRESS", "OWNER_ADDRESS", "OwnerAddr1", "MAIL_ADDR1"],
  ownerMailCity: ["PSTLCITY", "OWNER_CITY1", "OWNCITY", "MAILCITY1", "MAILCITY", "OWNER_CITY", "MAIL_CITY"],
  ownerMailState: ["PSTLSTATE", "OWNSTATE", "OWNER_ST", "MAILSTATE1", "MAILSTATE", "OWNER_STATE", "MAIL_STATE"],
  ownerMailZip: ["PSTLZIP5", "OWNZIP", "OWNER_ZIP5", "MAILZIP1", "MAILZIP", "OWNER_ZIP", "MAIL_ZIP"],
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
  appraised: ["TOT_APPR", "APPRAISED", "TOTAPR", "FMV_TOTAL", "TOTAL_FMV", "APPR_TOTAL", "TOTAL_APPRAISED", "APPRAISED_VALUE", "FAIR_MARKET_VALUE", "TotAppr", "MARKET_VALUE"],
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

/** The 2021–2023 Atlanta code layer stores each problem as its own yes/1/X column. */
const CODE_FLAGS: [string, string][] = [
  ["open_and_vacant", "open and vacant"],
  ["boarded_more_than_6_months", "boarded 6+ months"],
  ["exterior_structural", "exterior structural"],
  ["Interior_structural", "interior structural"],
  ["burnt_structure", "burnt structure"],
  ["junk_trash_debris", "junk / trash / debris"],
  ["overgrowth", "overgrowth"],
  ["vacant_lot", "vacant lot"],
  ["illegal_rooming_house", "illegal rooming house"],
  ["working_without_permit", "work without permit"],
  ["no_heat", "no heat"],
  ["no_power", "no power"],
  ["No_Water", "no water"],
  ["raw_sewage", "raw sewage"],
  ["damaged_accessory_structure", "damaged accessory structure"],
];

export function mapCodeRow(row: Row): { parcel: string | null; address: string | null; case: CodeCase } {
  const flags = CODE_FLAGS.filter(([k]) => yes(pick(row, [k]))).map(([, l]) => l);
  const desc = str(pick(row, [...FIELDS.caseType, "Case_Short_Description"]));
  const type = [desc, flags.length ? flags.join(", ") : null].filter(Boolean).join(" · ") || "Code case";
  const status = str(pick(row, [...FIELDS.caseStatus])) ?? undefined;
  // Point layer without a parcel id: rebuild "123 MAIN ST SW" from its pieces so it joins by address.
  const built = [pick(row, ["NBR", "STNUM", "HOUSE_NUMBER"]), pick(row, ["NAME", "STNAME", "STREET_NAME"]), pick(row, ["STR", "STTYPE", "STREET_TYPE"]), pick(row, ["DIR", "POSTDIR", "SUFFIX_DIR"])]
    .map((x) => str(x))
    .filter(Boolean)
    .join(" ");
  return {
    parcel: str(pick(row, [...FIELDS.parcelId])),
    address: str(pick(row, [...FIELDS.address])) ?? (built || null),
    case: {
      id: str(pick(row, [...FIELDS.caseId, "CAP__", "CAP"])) ?? "",
      source: "code_history",
      openedAt: date(pick(row, [...FIELDS.caseOpened, "Open_Date"])),
      status,
      type,
      open: status ? !CLOSED_STATUS.test(status) : undefined,
      vacant: yes(pick(row, [...FIELDS.vacant, "open_and_vacant"])) || /vacan/i.test(desc ?? ""),
      boarded: yes(pick(row, [...FIELDS.boarded, "boarded_more_than_6_months"])),
      structural: yes(pick(row, [...FIELDS.structural, "exterior_structural", "Interior_structural", "burnt_structure"])),
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
export function mapParcel(parcelRow: Row, geometry: unknown, cama: Row | undefined, pulledAt: string, where: { county: string; city?: string; source?: SourceId } = { county: "Fulton", city: "Atlanta" }): PropertyRecord {
  const parcelSrc: SourceId = where.source ?? "coa_parcels";
  const both = (k: keyof typeof FIELDS) => pick(cama ?? {}, [...FIELDS[k]]) ?? pick(parcelRow, [...FIELDS[k]]);
  const srcOf = (k: keyof typeof FIELDS): SourceId => (cama && pick(cama, [...FIELDS[k]]) != null ? "fulton_cama" : parcelSrc);
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
    city: where.city ?? (str(pick(parcelRow, [...FIELDS.city])) ?? undefined),
    zip: str(pick(parcelRow, [...FIELDS.zip]))?.slice(0, 5) ?? undefined,
    county: where.county,
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
      owner: { source: parcelSrc, asOf: pulledAt },
      ownerMailing: { source: parcelSrc, asOf: pulledAt },
      homesteadExemption: { source: srcOf("homestead"), asOf: valueAsOf },
      fairMarketValue: { source: srcOf("appraised") === "fulton_cama" || srcOf("assessed") === "fulton_cama" ? "fulton_cama" : parcelSrc, asOf: valueAsOf },
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

// ─── Deeds + security deeds (clerk's real-estate index export) ───────────────

export type DeedKind = "transfer" | "mortgage" | "satisfaction" | "other";

/** Georgia instrument names/codes → what they mean for ownership and debt. */
export function classifyInstrument(instrument: string): DeedKind {
  const t = instrument.toUpperCase();
  if (/CANC|SATISF|RELEASE|\bSAT\b|\bCAN\b/.test(t)) return "satisfaction";
  if (/SECURITY DEED|\bSD\b|\bDSD\b|MORTGAGE|DEED TO SECURE|\bDTSD\b/.test(t)) return "mortgage";
  if (/DEED|\bWD\b|\bLWD\b|\bQCD\b|\bEXD\b|\bADMD\b|\bDUP\b|\bFD\b/.test(t)) return "transfer";
  return "other";
}

export interface DeedRow {
  parcel: string | null;
  address: string | null;
  kind: DeedKind;
  instrument: string;
  date: string | null;
  amount: number | null;
  grantor: string | null;
  grantee: string | null;
  ref: string | null;
  /** For a cancellation: the book/page of the security deed it cancels, when the index gives it. */
  cancels: string | null;
}

export function mapDeedRow(row: Row): DeedRow {
  const instrument = str(pick(row, ["INSTRUMENT", "INSTRUMENT_TYPE", "DOC_TYPE", "DOCUMENT_TYPE", "TYPE", "INST_TYPE"])) ?? "";
  const book = str(pick(row, ["BOOK", "DEED_BOOK", "BK"]));
  const page = str(pick(row, ["PAGE", "DEED_PAGE", "PG"]));
  return {
    parcel: str(pick(row, [...FIELDS.parcelId])),
    address: str(pick(row, [...FIELDS.address])),
    kind: classifyInstrument(instrument),
    instrument,
    date: date(pick(row, ["RECORDED", "RECORD_DATE", "FILED", "FILE_DATE", "DATE", "INSTRUMENT_DATE"])),
    amount: num(pick(row, ["AMOUNT", "CONSIDERATION", "SALE_PRICE", "LOAN_AMOUNT", "PRICE"])),
    grantor: str(pick(row, ["GRANTOR", "SELLER", "FROM"])),
    grantee: str(pick(row, ["GRANTEE", "BUYER", "TO", "LENDER"])),
    ref: book && page ? `${book}/${page}` : str(pick(row, ["INSTRUMENT_NUMBER", "DOC_NUMBER", "REF"])),
    cancels: str(pick(row, ["CANCELS", "REFERENCE", "REF_BOOK_PAGE", "CROSS_REF"])),
  };
}

/**
 * Put a parcel's deed history on the record. Only security deeds recorded
 * since the latest transfer count as the current owner's debt; a cancellation
 * closes the security deed it names (book/page) or, failing that, the oldest
 * open one recorded before it.
 */
export function attachDeeds(p: PropertyRecord, rows: DeedRow[], checkedAt: string) {
  const sorted = rows.filter((r) => r.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const transfers: Transfer[] = sorted
    .filter((r) => r.kind === "transfer")
    .map((r) => ({ date: r.date!, price: r.amount, deedType: r.instrument, grantor: r.grantor ?? undefined, grantee: r.grantee ?? undefined, ref: r.ref ?? undefined }));
  const lastTransfer = transfers.at(-1)?.date ?? p.lastSaleDate ?? null;
  const mortgages: Mortgage[] = [];
  for (const r of sorted) {
    if (r.kind === "mortgage" && r.amount && (!lastTransfer || r.date! >= lastTransfer.slice(0, 10)))
      mortgages.push({ date: r.date!, amount: r.amount, lender: r.grantee ?? undefined, ref: r.ref ?? undefined, satisfiedAt: null });
    if (r.kind === "satisfaction") {
      const target = (r.cancels && mortgages.find((m) => !m.satisfiedAt && m.ref === r.cancels)) || mortgages.find((m) => !m.satisfiedAt && m.date <= r.date!);
      if (target) target.satisfiedAt = r.date;
    }
  }
  p.transfers = transfers.reverse();
  p.mortgages = mortgages;
  p.deedsCheckedAt = checkedAt;
  const lastPriced = p.transfers.find((t) => t.price && t.price > 100);
  if (p.transfers[0] && (!p.lastSaleDate || p.transfers[0].date > p.lastSaleDate)) {
    p.lastSaleDate = p.transfers[0].date;
    p.lastSalePrice = lastPriced?.date === p.transfers[0].date ? lastPriced.price : null;
    p.provenance = { ...p.provenance, lastSaleDate: { source: "deeds", asOf: checkedAt }, lastSalePrice: { source: "deeds", asOf: checkedAt } };
  }
}

// ─── ATL311 ─────────────────────────────────────────────────────────────────

const ATL311_RELEVANT = /vacan|abandon|board|unsecur|overgrown|high grass|junk|debris|dumping|squat|blight|structure|housing|code|rodent|trash|illegal/i;

/** One 311 service request → a code-style case, or null when it isn't about the property's condition. */
export function map311Row(row: Row): { parcel: string | null; address: string | null; case: CodeCase } | null {
  const type = str(pick(row, ["REQUEST_TYPE", "SERVICE_REQUEST_TYPE", "SR_TYPE", "TYPE", "CATEGORY", "SUBJECT", "CASE_TYPE"])) ?? "";
  const desc = str(pick(row, ["DESCRIPTION", "DETAILS", "SUB_TYPE", "SUBTYPE"])) ?? "";
  if (!ATL311_RELEVANT.test(`${type} ${desc}`)) return null;
  const status = str(pick(row, ["STATUS", "SR_STATUS", "CASE_STATUS"])) ?? undefined;
  const text = `${type} ${desc}`;
  return {
    parcel: str(pick(row, [...FIELDS.parcelId])),
    address: str(pick(row, [...FIELDS.address, "INCIDENT_ADDRESS", "STREET_ADDRESS"])),
    case: {
      id: str(pick(row, ["SR_NUMBER", "CASE_NUMBER", "REQUEST_ID", "SERVICE_REQUEST_ID", "ID", "OBJECTID"])) ?? "",
      source: "atl311",
      openedAt: date(pick(row, ["CREATED_DATE", "OPENED", "OPEN_DATE", "DATE_CREATED", "REQUESTED_DATE", "CreatedDate"])),
      status,
      type: [type, desc].filter(Boolean).join(" · "),
      open: status ? !CLOSED_STATUS.test(status) : undefined,
      vacant: /vacan|abandon|squat/i.test(text),
      boarded: /board/i.test(text),
      structural: /structur|collapse|unsafe/i.test(text),
    },
  };
}

// ─── Polygons: FEMA flood zones, Opportunity Zones ───────────────────────────

/** Even-odd ray cast over every ring, so holes in ArcGIS polygons work. */
export function pointInRings(lng: number, lat: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  return inside;
}

export interface Poly {
  rings: number[][][];
  attrs: Row;
  bbox: [number, number, number, number];
}

export function toPoly(f: { attributes: Row; geometry?: { rings?: number[][][] } | null }): Poly | null {
  const rings = f.geometry?.rings;
  if (!rings?.length) return null;
  const xs = rings.flat().map((p) => p[0]), ys = rings.flat().map((p) => p[1]);
  return { rings, attrs: f.attributes, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

export function polyAt(polys: Poly[], lng: number, lat: number): Poly | null {
  return polys.find((g) => lng >= g.bbox[0] && lng <= g.bbox[2] && lat >= g.bbox[1] && lat <= g.bbox[3] && pointInRings(lng, lat, g.rings)) ?? null;
}

/** NFHL flood hazard polygons → p.floodZone ("AE", "X", "0.2 PCT ANNUAL CHANCE" …). */
export function assignFlood(props: PropertyRecord[], polys: Poly[], asOf: string) {
  for (const p of props) {
    if (p.lat == null || p.lng == null) continue;
    const hit = polyAt(polys, p.lng, p.lat);
    p.floodZone = hit ? str(pick(hit.attrs, ["FLD_ZONE", "ZONE", "FLOOD_ZONE"])) : "X (outside mapped hazard)";
    p.provenance = { ...p.provenance, floodZone: { source: "flood", asOf } };
  }
}

export function assignOpportunityZones(props: PropertyRecord[], polys: Poly[], asOf: string) {
  for (const p of props) {
    if (p.lat == null || p.lng == null) continue;
    p.opportunityZone = !!polyAt(polys, p.lng, p.lat);
    p.provenance = { ...p.provenance, opportunityZone: { source: "opportunity_zone", asOf } };
  }
}

// ─── MARTA rail stations (GTFS stops.txt) ────────────────────────────────────

export interface Station {
  name: string;
  lat: number;
  lng: number;
}

function csvLine(line: string): string[] {
  const out: string[] = [];
  let f = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

/** Rail stations from a GTFS stops.txt: parent stations, or stops named "… STATION" (MARTA's convention), one per name. */
export function parseGtfsStations(stopsTxt: string): Station[] {
  const lines = stopsTxt.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const head = csvLine(lines[0]).map((h) => h.trim());
  const ix = (k: string) => head.indexOf(k);
  const byName = new Map<string, Station>();
  for (const l of lines.slice(1)) {
    const r = csvLine(l);
    const name = (r[ix("stop_name")] ?? "").trim();
    const lt = r[ix("location_type")] ?? "";
    if (!(lt === "1" || /\bSTATION\b/i.test(name))) continue;
    const key = name.toUpperCase().replace(/\s*(STATION).*$/, " STATION");
    const lat = Number(r[ix("stop_lat")]), lng = Number(r[ix("stop_lon")]);
    if (isFinite(lat) && isFinite(lng) && !byName.has(key)) byName.set(key, { name: key.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()), lat, lng });
  }
  return [...byName.values()];
}

const milesBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const toR = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toR(b.lat - a.lat) / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(toR(b.lng - a.lng) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
};

export function assignTransit(props: PropertyRecord[], stations: Station[]) {
  if (!stations.length) return;
  for (const p of props) {
    if (p.lat == null || p.lng == null) continue;
    let best: Station | null = null, d = Infinity;
    for (const s of stations) {
      const m = milesBetween({ lat: p.lat, lng: p.lng }, s);
      if (m < d) { d = m; best = s; }
    }
    p.transitMi = Math.round(d * 100) / 100;
    p.transitName = best!.name;
  }
}

// ─── Rents: HUD Small Area FMR (by ZIP + bedrooms), Census ACS ───────────────

/** HUD SAFMR sheet saved as CSV → ZIP → [0BR … 4BR]. Column names vary by year ("SAFMR 2BR", "safmr_2br" …). */
export function mapSafmr(rows: Row[]): Map<string, (number | null)[]> {
  const out = new Map<string, (number | null)[]>();
  for (const r of rows) {
    const zip = str(pick(r, ["ZIP Code", "ZIP", "ZCTA", "zip_code", "ZIPCODE"]))?.padStart(5, "0").slice(0, 5);
    if (!zip) continue;
    out.set(zip, [0, 1, 2, 3, 4].map((b) => num(pick(r, [`SAFMR ${b}BR`, `SAFMR_${b}BR`, `${b}BR`, `${b} BR`, `FMR_${b}`]))));
  }
  return out;
}

export function attachSafmr(props: PropertyRecord[], safmr: Map<string, (number | null)[]>, asOf: string, label = "HUD SAFMR") {
  for (const p of props) {
    const row = p.zip ? safmr.get(p.zip) : undefined;
    if (!row) continue;
    const known = p.beds != null;
    const beds = Math.max(0, Math.min(4, Math.round(p.beds ?? ((p.sqft ?? 0) > 1200 ? 3 : 2))));
    const v = row[beds];
    if (v == null) continue;
    p.rentEstimates = [...(p.rentEstimates ?? []).filter((x) => x.source !== "hud_safmr"), { value: v, source: "hud_safmr", asOf, basis: `${label} ${beds}BR, ZIP ${p.zip}${known ? "" : " (bedrooms not on record: assumed from size)"}` }];
  }
}

export interface AcsZip {
  rent: number | null;
  pop: number | null;
  income: number | null;
}

/** Census API JSON ([[header…], [row…]]) → ZCTA → figures. Census marks missing values with large negatives. */
export function parseAcs(json: unknown): Map<string, AcsZip> {
  const rows = json as string[][];
  const out = new Map<string, AcsZip>();
  if (!Array.isArray(rows) || rows.length < 2) return out;
  const h = rows[0];
  const ix = (k: string) => h.indexOf(k);
  const val = (r: string[], k: string) => {
    const n = ix(k) >= 0 ? Number(r[ix(k)]) : NaN;
    return isFinite(n) && n >= 0 ? n : null;
  };
  const zi = h.findIndex((x) => /zip code tabulation area/i.test(x));
  for (const r of rows.slice(1)) out.set(r[zi], { rent: val(r, "B25064_001E"), pop: val(r, "B01003_001E"), income: val(r, "B19013_001E") });
  return out;
}

export function attachAcs(props: PropertyRecord[], market: Record<string, MarketContext>, latest: Map<string, AcsZip>, earlier: Map<string, AcsZip>, year: number, asOf: string) {
  for (const p of props) {
    const a = p.zip ? latest.get(p.zip) : undefined;
    if (a?.rent != null)
      p.rentEstimates = [...(p.rentEstimates ?? []).filter((x) => x.source !== "census_acs"), { value: a.rent, source: "census_acs", asOf, basis: `ACS ${year} 5-yr median gross rent, ZIP ${p.zip} (all unit types)` }];
  }
  for (const [zip, m] of Object.entries(market)) {
    const a = latest.get(zip), b = earlier.get(zip);
    if (!a) continue;
    m.medianIncome = a.income;
    m.medianRent = a.rent;
    if (a.pop != null && b?.pop) m.popGrowthPct = Math.round((a.pop / b.pop - 1) * 1000) / 10;
    if (a.income != null && b?.income) m.incomeGrowthPct = Math.round((a.income / b.income - 1) * 1000) / 10;
    if (a.rent != null && b?.rent) m.rentGrowthPct = Math.round(((a.rent / b.rent) ** (1 / 5) - 1) * 1000) / 10; // per year
  }
}
