/**
 * EXAMPLE data for the Deal Desk when no feed output is present. Every
 * address, owner and case number here is fictional (flagged example: true and
 * labeled in the UI); coordinates sit in real Atlanta neighborhoods so the map
 * reads correctly. Dates are relative to `now` so the demo never goes stale.
 */
import type { MarketContext, PropertyRecord } from "./re-intel.ts";

const ago = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const ahead = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

interface Seed {
  n: number;
  street: string;
  zip: string;
  hood: string;
  lat: number;
  lng: number;
  sqft: number;
  yb: number;
  lot: number;
  zoning: string;
  fmv: number;
  land: number;
  saleYearsAgo: number;
  salePrice: number | null;
  mailing: "site" | "ga" | "out";
  homestead: boolean;
  rent: number;
  extra?: (p: PropertyRecord, now: Date) => void;
}

const SEEDS: Seed[] = [
  { n: 101, street: "Example Ave SW", zip: "30310", hood: "West End", lat: 33.7351, lng: -84.4172, sqft: 1420, yb: 1925, lot: 8700, zoning: "R-4A", fmv: 168000, land: 61000, saleYearsAgo: 22, salePrice: 41000, mailing: "out", homestead: false, rent: 1650,
    extra: (p, now) => { p.taxDelinquent = { amount: 6820, years: 2, asOf: ago(now, 21) }; p.codeCases = [{ id: "EX-BC-24117", source: "building_complaints", openedAt: ago(now, 40), status: "Open", type: "Building Complaint · Open and vacant structure", vacant: true, boarded: true }, { id: "EX-311-88120", source: "atl311", openedAt: ago(now, 15), status: "Open", type: "Vacant / abandoned house · neighbors report squatters", vacant: true }, { id: "EX-CE-22-0391", source: "code_history", openedAt: ago(now, 1100), status: "Closed", type: "High grass / overgrowth" }]; p.mortgages = []; p.deedsCheckedAt = ago(now, 3); p.transitMi = 0.42; p.transitName = "West End Station"; } },
  { n: 214, street: "Sample St NW", zip: "30318", hood: "Grove Park", lat: 33.7728, lng: -84.4553, sqft: 1180, yb: 1948, lot: 19500, zoning: "R-4", fmv: 214000, land: 148000, saleYearsAgo: 31, salePrice: 28000, mailing: "ga", homestead: false, rent: 1550,
    extra: (p, now) => { p.probate = { filedAt: ago(now, 64), caseNo: "EX-EST-2026-0187" }; p.owner = "EXAMPLE OWNER 02 ESTATE"; p.transitMi = 0.4; p.transitName = "Bankhead Station"; p.deedsCheckedAt = ago(now, 3); p.mortgages = [{ date: ago(now, 30 * 365), amount: 24000, lender: "Example Savings", satisfiedAt: ago(now, 12 * 365) }]; } },
  { n: 37, street: "Placeholder Dr SE", zip: "30315", hood: "Peoplestown", lat: 33.7262, lng: -84.3853, sqft: 1050, yb: 1938, lot: 6200, zoning: "R-5", fmv: 189000, land: 92000, saleYearsAgo: 9, salePrice: 95000, mailing: "out", homestead: false, rent: 1700,
    extra: (p, now) => { p.foreclosure = { saleDate: ahead(now, 26), noticeDate: ago(now, 6), lender: "Example Mortgage Co.", ref: "EX-NOS-1123" }; p.mortgages = [{ date: ago(now, 9 * 365), amount: 90000, lender: "Example Mortgage Co." }]; p.deedsCheckedAt = ago(now, 3); p.transitMi = 0.3; p.transitName = "King Memorial Station"; } },
  { n: 880, street: "Demo Blvd NW", zip: "30314", hood: "Vine City", lat: 33.7571, lng: -84.4092, sqft: 1260, yb: 1930, lot: 5400, zoning: "MR-2", fmv: 236000, land: 151000, saleYearsAgo: 19, salePrice: 52000, mailing: "out", homestead: false, rent: 1600,
    extra: (p, now) => { p.existingUnits = 1; p.codeCases = [{ id: "EX-BC-25003", source: "building_complaints", openedAt: ago(now, 12), status: "Received", type: "Building Complaint · Unsecured structure", vacant: true }]; p.transitMi = 0.35; p.transitName = "Vine City Station"; p.opportunityZone = true; p.codeCases!.push({ id: "EX-311-90311", source: "atl311", openedAt: ago(now, 9), status: "Open", type: "Illegal dumping · debris in yard" }); } },
  { n: 52, street: "Testing Way SW", zip: "30311", hood: "Cascade Heights", lat: 33.7262, lng: -84.4697, sqft: 2240, yb: 1962, lot: 21800, zoning: "R-3", fmv: 389000, land: 121000, saleYearsAgo: 34, salePrice: 61000, mailing: "site", homestead: true, rent: 2400 },
  { n: 1290, street: "Mockingbird Ln SE", zip: "30316", hood: "East Atlanta", lat: 33.7395, lng: -84.3447, sqft: 1380, yb: 1941, lot: 10400, zoning: "R-4", fmv: 342000, land: 188000, saleYearsAgo: 26, salePrice: 74000, mailing: "ga", homestead: false, rent: 2100,
    extra: (p, now) => { p.codeCases = [{ id: "EX-CE-23-1180", source: "code_history", openedAt: ago(now, 820), status: "Open", type: "Structure in disrepair", structural: false }]; p.cornerLot = true; } },
  { n: 466, street: "Fictional Pl NW", zip: "30318", hood: "Bankhead", lat: 33.7782, lng: -84.4344, sqft: 980, yb: 1955, lot: 7800, zoning: "R-4A", fmv: 176000, land: 98000, saleYearsAgo: 2, salePrice: 150000, mailing: "out", homestead: false, rent: 1450,
    extra: (p, now) => { p.permits = [{ id: "EX-BB-2025-0441", category: "renovation", type: "Building · Residential alteration", status: "Issued", issuedAt: ago(now, 120), value: 68000 }]; p.mortgages = [{ date: ago(now, 2 * 365), amount: 140000 }]; } },
  { n: 9, street: "Specimen Ct SE", zip: "30354", hood: "Lakewood Heights", lat: 33.7046, lng: -84.3829, sqft: 1120, yb: 1951, lot: 14300, zoning: "R-4", fmv: 151000, land: 69000, saleYearsAgo: 41, salePrice: null, mailing: "site", homestead: true, rent: 1500,
    extra: (p, now) => { p.taxDelinquent = { amount: 2210, years: 1, asOf: ago(now, 21) }; } },
  { n: 3110, street: "Illustration Rd SW", zip: "30331", hood: "Ben Hill", lat: 33.6884, lng: -84.4908, sqft: 1650, yb: 1974, lot: 26100, zoning: "R-3", fmv: 238000, land: 70000, saleYearsAgo: 17, salePrice: 112000, mailing: "out", homestead: false, rent: 1850,
    extra: (p, now) => { p.floodZone = "AE"; p.transfers = [{ date: ago(now, 17 * 365), price: 112000, deedType: "Deed Under Power", grantee: "EXAMPLE OWNER 09" }]; p.codeCases = [{ id: "EX-BC-24890", source: "building_complaints", openedAt: ago(now, 300), status: "Closed", type: "Building Complaint · Roof damage" }]; } },
  { n: 75, street: "Prototype Ave NE", zip: "30317", hood: "Kirkwood", lat: 33.7539, lng: -84.3191, sqft: 1520, yb: 1922, lot: 9600, zoning: "R-4", fmv: 486000, land: 214000, saleYearsAgo: 3, salePrice: 455000, mailing: "site", homestead: true, rent: 2700,
    extra: (p, now) => { p.mortgages = [{ date: ago(now, 3 * 365), amount: 410000 }]; p.permits = [{ id: "EX-BB-2024-2201", category: "renovation", type: "Building · Kitchen + bath remodel", status: "Finaled", issuedAt: ago(now, 900) }]; } },
  { n: 618, street: "Model St SW", zip: "30310", hood: "Pittsburgh", lat: 33.7237, lng: -84.4033, sqft: 1100, yb: 1915, lot: 4300, zoning: "R-4B", fmv: 142000, land: 71000, saleYearsAgo: 15, salePrice: 33000, mailing: "out", homestead: false, rent: 1400,
    extra: (p, now) => { p.codeCases = [{ id: "EX-BC-25118", source: "building_complaints", openedAt: ago(now, 18), status: "Open", type: "Building Complaint · Abandoned house" , vacant: true }, { id: "EX-BC-24770", source: "building_complaints", openedAt: ago(now, 210), status: "Open", type: "Building Complaint · Unsafe porch", structural: true }]; p.transitMi = 0.45; } },
  { n: 2045, street: "Template Dr NW", zip: "30318", hood: "Riverside", lat: 33.7983, lng: -84.4602, sqft: 1300, yb: 1958, lot: 33500, zoning: "R-4", fmv: 298000, land: 210000, saleYearsAgo: 28, salePrice: 39000, mailing: "ga", homestead: false, rent: 1750,
    extra: (p, now) => { p.adjacentSameOwner = 2; p.transfers = [{ date: ago(now, 28 * 365), price: 39000, deedType: "Executor's Deed", grantee: "EXAMPLE OWNER 12" }]; p.deedsCheckedAt = ago(now, 3); p.mortgages = []; } },
  { n: 12, street: "Archetype Pl SE", zip: "30312", hood: "Grant Park", lat: 33.7365, lng: -84.3707, sqft: 1880, yb: 1910, lot: 7200, zoning: "R-5", fmv: 612000, land: 266000, saleYearsAgo: 36, salePrice: 58000, mailing: "out", homestead: false, rent: 3100 },
  { n: 409, street: "Exemplar Ave SW", zip: "30315", hood: "Capitol View", lat: 33.7151, lng: -84.4019, sqft: 1240, yb: 1935, lot: 6800, zoning: "R-4A", fmv: 221000, land: 98000, saleYearsAgo: 6, salePrice: 160000, mailing: "site", homestead: true, rent: 1800,
    extra: (p, now) => { p.mortgages = [{ date: ago(now, 6 * 365), amount: 152000 }]; } },
  { n: 1777, street: "Stand-in Ave NW", zip: "30314", hood: "English Avenue", lat: 33.7684, lng: -84.4128, sqft: 960, yb: 1925, lot: 5100, zoning: "R-4B", fmv: 129000, land: 84000, saleYearsAgo: 21, salePrice: 18000, mailing: "out", homestead: false, rent: 1350,
    extra: (p, now) => { p.taxDelinquent = { amount: 11400, years: 4, asOf: ago(now, 21) }; p.codeCases = [{ id: "EX-CE-21-0552", source: "code_history", openedAt: ago(now, 1600), status: "Closed", type: "Open and vacant", vacant: true, boarded: true }]; p.permits = [{ id: "EX-DM-2025-0091", category: "demolition", type: "Demolition · In-rem", status: "Pending", issuedAt: ago(now, 75) }]; } },
  { n: 300, street: "Mock Ridge Dr SW", zip: "30331", hood: "Southwest Atlanta", lat: 33.7104, lng: -84.5122, sqft: 2050, yb: 1988, lot: 18400, zoning: "R-3", fmv: 318000, land: 64000, saleYearsAgo: 12, salePrice: 189000, mailing: "site", homestead: true, rent: 2200 },
  { n: 2290, street: "Sampleton Dr", zip: "30032", hood: "Candler-McAfee (DeKalb)", lat: 33.7262, lng: -84.2721, sqft: 1350, yb: 1959, lot: 15200, zoning: "R-75", fmv: 214000, land: 52000, saleYearsAgo: 27, salePrice: 61000, mailing: "out", homestead: false, rent: 1700,
    extra: (p, now) => { p.city = "Decatur"; p.county = "DeKalb"; p.taxDelinquent = { amount: 3900, years: 1, asOf: ago(now, 21) }; p.deedsCheckedAt = ago(now, 3); p.mortgages = []; p.transitMi = 0.9; p.transitName = "Kensington Station"; p.provenance!.owner = { source: "county_parcels", asOf: ago(now, 1) }; p.provenance!.ownerMailing = { source: "county_parcels", asOf: ago(now, 1) }; } },
];

export function demoProperties(now: Date): PropertyRecord[] {
  return SEEDS.map((s, i) => {
    const address = `${s.n} ${s.street}`;
    const saleDate = ago(now, Math.round(s.saleYearsAgo * 365.25));
    const mailing = s.mailing === "site" ? `${address}, Atlanta, GA, ${s.zip}` : s.mailing === "ga" ? `${400 + i} Example Pkwy, Marietta, GA, 30060` : `${900 + i} Example Blvd, ${["Houston, TX", "Charlotte, NC", "Newark, NJ", "Chicago, IL"][i % 4]}, 00000`;
    const p: PropertyRecord = {
      id: `EX${String(14000100 + i * 37).padStart(10, "0")}`,
      address,
      city: "Atlanta",
      zip: s.zip,
      county: "Fulton",
      neighborhood: s.hood,
      lat: s.lat,
      lng: s.lng,
      example: true,
      owner: `EXAMPLE OWNER ${String(i + 1).padStart(2, "0")}`,
      ownerMailing: mailing,
      ownerMailingState: s.mailing === "out" ? ["TX", "NC", "NJ", "IL"][i % 4] : "GA",
      homesteadExemption: s.homestead,
      existingUnits: 1,
      beds: s.sqft > 1800 ? 4 : s.sqft > 1200 ? 3 : 2,
      baths: s.sqft > 1800 ? 2.5 : s.sqft > 1200 ? 2 : 1,
      sqft: s.sqft,
      yearBuilt: s.yb,
      lotSqft: s.lot,
      zoning: s.zoning,
      fairMarketValue: s.fmv,
      landValue: s.land,
      valueAsOf: ago(now, 160),
      assessedHistory: [
        { year: now.getFullYear() - 5, value: Math.round(s.fmv * 0.68) },
        { year: now.getFullYear() - 1, value: s.fmv },
      ],
      lastSaleDate: saleDate,
      lastSalePrice: s.salePrice,
      permits: [],
      codeCases: [],
      rentEstimate: { value: s.rent, source: "manual", asOf: ago(now, 30) },
      provenance: {
        owner: { source: "coa_parcels", asOf: ago(now, 1) },
        ownerMailing: { source: "coa_parcels", asOf: ago(now, 1) },
        homesteadExemption: { source: "fulton_cama", asOf: ago(now, 160) },
        fairMarketValue: { source: "fulton_cama", asOf: ago(now, 160) },
        landValue: { source: "fulton_cama", asOf: ago(now, 160) },
        zoning: { source: "zoning", asOf: ago(now, 1) },
        lastSaleDate: { source: "deeds", asOf: ago(now, 1) },
        lastSalePrice: { source: "deeds", asOf: ago(now, 1) },
      },
    };
    s.extra?.(p, now);
    return p;
  });
}

const M = (key: string, medianPpsf: number, renovatedPpsf: number, s12: number, s24: number, rentGrowthPct: number, reno: number, nc: number): MarketContext =>
  ({ key, medianPpsf, renovatedPpsf, salesLast12: s12, salesPrior12: s24, rentGrowthPct, renovationPermits12: reno, newConstructionPermits12: nc, demolitionPermits12: Math.round(nc / 3), asOf: null, source: "market", medianRent: null });

export function demoMarket(now: Date): Record<string, MarketContext> {
  const list = [
    M("30310", 128, 182, 212, 176, 4.1, 58, 22),
    M("30318", 171, 243, 340, 301, 3.6, 94, 61),
    M("30315", 150, 213, 198, 171, 3.9, 47, 19),
    M("30314", 118, 168, 121, 96, 5.2, 39, 28),
    M("30311", 160, 227, 160, 158, 2.4, 31, 9),
    M("30316", 232, 329, 280, 266, 2.9, 77, 33),
    M("30354", 120, 170, 101, 92, 3.1, 18, 7),
    M("30331", 141, 200, 233, 240, 2.2, 22, 12),
    M("30317", 298, 423, 190, 182, 2.0, 66, 18),
    M("30312", 305, 433, 176, 170, 2.3, 41, 14),
    M("30032", 140, 199, 260, 231, 3.4, 36, 15),
  ];
  return Object.fromEntries(list.map((m) => [m.key, { ...m, asOf: ago(now, 2) }]));
}
