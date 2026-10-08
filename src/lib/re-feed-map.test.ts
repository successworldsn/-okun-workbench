import { test } from "node:test";
import assert from "node:assert/strict";
import { categorizePermit, mapPermitRow, mapCodeRow, mapParcel, parcelKey, pick, centroid, buildMarket, unmappedFields } from "./re-feed-map.ts";

test("pick finds fields regardless of case and punctuation", () => {
  assert.equal(pick({ parcel_id: "14 0110 0003 019" }, ["PARCELID"]), "14 0110 0003 019");
  assert.equal(pick({ PARCELID: "" , PIN: "x" }, ["PARCELID", "PIN"]), "x");
  assert.equal(parcelKey("14 0110-0003 019"), "1401100003019");
});

test("permit categories", () => {
  assert.equal(categorizePermit("Building", "Residential Alteration"), "renovation");
  assert.equal(categorizePermit("Building", "New Construction", "New single family dwelling"), "new_construction");
  assert.equal(categorizePermit("Demolition", ""), "demolition");
  assert.equal(categorizePermit("Building Complaint", "Open and vacant"), "complaint");
  assert.equal(categorizePermit("Sign", "Wall sign"), "other");
});

test("Building Complaint rows become current code cases with flags; ArcGIS epoch dates convert", () => {
  const r = mapPermitRow({ RECORD_TYPE: "Building Complaint", SUBTYPE: "Open and vacant, boarded", RECORD_ID: "BC-1", STATUS: "Open", OPENED_DATE: Date.UTC(2026, 8, 1), PARCELID: "14 011" });
  assert.ok(r.complaint);
  assert.equal(r.complaint!.source, "building_complaints");
  assert.equal(r.complaint!.vacant, true);
  assert.equal(r.complaint!.boarded, true);
  assert.equal(r.complaint!.open, true);
  assert.equal(r.complaint!.openedAt, "2026-09-01T00:00:00.000Z");
  const p = mapPermitRow({ PermitType: "Building", WorkClass: "Addition", PermitNum: "BB-9", IssuedDate: "2026-02-03", VALUATION: "$45,000" });
  assert.equal(p.permit!.category, "renovation");
  assert.equal(p.permit!.value, 45000);
});

test("code history rows", () => {
  const r = mapCodeRow({ CASE_NUMBER: "CE-1", CASE_TYPE: "Vacant lot overgrowth", CASE_STATUS: "Closed", VACANT: "Y", STRUCTURAL: "N" });
  assert.equal(r.case.vacant, true);
  assert.equal(r.case.structural, false);
  assert.equal(r.case.open, false);
});

test("parcel + CAMA merge: assessed ÷ 0.40 when no appraised value, CAMA wins on overlap, acres → sq ft", () => {
  const p = mapParcel(
    { PARCELID: "14-0110-0003-019", SITEADDRESS: "10 Test St SW", SITEZIP: "30310-1234", OWNERNME1: "SOMEONE", PSTLADDRESS: "1 Far Rd", PSTLCITY: "Austin", PSTLSTATE: "TX", PSTLZIP5: "78701", ACRES: 0.25, ZONING: "R-3" },
    { rings: [[[-84.41, 33.73], [-84.40, 33.73], [-84.40, 33.74], [-84.41, 33.74]]] },
    { TOT_ASSESS: 80000, ZONING: "R-4", RESYRBLT: 1925, HOMESTEAD: "N", TAXYEAR: 2026 },
    "2026-10-08T00:00:00.000Z",
  );
  assert.equal(p.id, "1401100003019");
  assert.equal(p.zip, "30310");
  assert.equal(p.fairMarketValue, 200000);
  assert.equal(p.zoning, "R-4");
  assert.equal(p.lotSqft, 10890);
  assert.equal(p.homesteadExemption, false);
  assert.equal(p.ownerMailingState, "TX");
  assert.ok(Math.abs(p.lat! - 33.735) < 1e-9);
  assert.equal(p.provenance!.fairMarketValue.source, "fulton_cama");
});

test("centroid handles points and rings; unmapped report", () => {
  assert.deepEqual(centroid({ x: -84, y: 33 }), { lng: -84, lat: 33 });
  assert.equal(centroid(null), null);
  assert.deepEqual(unmappedFields({ PARCELID: 1 }, ["parcelId", "owner"]), ["owner"]);
});

test("market context needs 3 renovated sales before it reports a renovated $/sq ft", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  const mk = (i: number, reno: boolean) => ({
    id: `P${i}`, address: `${i} A St`, zip: "30310", lat: null, lng: null, sqft: 1000, fairMarketValue: 150000,
    lastSaleDate: "2026-03-01T00:00:00.000Z", lastSalePrice: 300000,
    permits: reno ? [{ id: `r${i}`, category: "renovation" as const, type: "Alteration", issuedAt: "2025-10-01T00:00:00.000Z" }] : [],
  });
  assert.equal(buildMarket([mk(1, true), mk(2, true), mk(3, false)], now)["30310"].renovatedPpsf, null);
  const m = buildMarket([mk(1, true), mk(2, true), mk(3, true)], now)["30310"];
  assert.equal(m.renovatedPpsf, 300);
  assert.equal(m.medianPpsf, 150);
  assert.equal(m.salesLast12, 3);
});

import { classifyInstrument, mapDeedRow, attachDeeds, map311Row, pointInRings, toPoly, assignFlood, parseGtfsStations, assignTransit } from "./re-feed-map.ts";
import { estimateValue, analyze, type PropertyRecord } from "./re-intel.ts";

test("deed instruments classify", () => {
  assert.equal(classifyInstrument("WD"), "transfer");
  assert.equal(classifyInstrument("Executor's Deed"), "transfer");
  assert.equal(classifyInstrument("SECURITY DEED"), "mortgage");
  assert.equal(classifyInstrument("Cancellation of Security Deed"), "satisfaction");
  assert.equal(classifyInstrument("Lien"), "other");
});

test("deeds: only post-transfer security deeds count; a cancellation closes the one it names; checked index → verified debt", () => {
  const p = { id: "P", address: "1 A St", lat: 33.7, lng: -84.4, fairMarketValue: 300000 } as Parameters<typeof attachDeeds>[0];
  const rows = [
    { INSTRUMENT: "WD", RECORDED: "2001-05-01", AMOUNT: 90000, GRANTEE: "OWNER", BOOK: "100", PAGE: "1" },
    { INSTRUMENT: "SECURITY DEED", RECORDED: "1999-01-01", AMOUNT: 50000, GRANTEE: "OLD BANK", BOOK: "90", PAGE: "9" },
    { INSTRUMENT: "SECURITY DEED", RECORDED: "2001-05-01", AMOUNT: 72000, GRANTEE: "BANK A", BOOK: "100", PAGE: "2" },
    { INSTRUMENT: "SECURITY DEED", RECORDED: "2015-03-01", AMOUNT: 40000, GRANTEE: "HELOC CU", BOOK: "200", PAGE: "5" },
    { INSTRUMENT: "CANCELLATION", RECORDED: "2016-01-01", CANCELS: "100/2" },
  ].map(mapDeedRow);
  attachDeeds(p, rows, "2026-10-01T00:00:00.000Z");
  assert.equal(p.mortgages!.length, 2);
  assert.equal(p.mortgages!.find((m) => m.ref === "100/2")!.satisfiedAt!.slice(0, 10), "2016-01-01");
  assert.equal(p.lastSalePrice, 90000);
  const now = new Date("2026-10-08T00:00:00Z");
  const v = estimateValue(p, undefined, now);
  assert.match(v.debtBasis, /1 open security deed/);
  assert.ok(v.debt! > 0 && v.debt! < 40000);
  // Cancel the HELOC too → debt 0 from the index, not an inference.
  attachDeeds(p, [...rows, mapDeedRow({ INSTRUMENT: "SATISFACTION", RECORDED: "2024-01-01" })], "2026-10-01T00:00:00.000Z");
  const v2 = estimateValue(p, undefined, now);
  assert.equal(v2.debt, 0);
  const eq = analyze(p, {}, now).engines.equity.findings[0].evidence.find((e) => e.source === "deeds");
  assert.ok(eq && !eq.inferred);
});

test("estate deed is a motivation signal", () => {
  const p = { id: "P", address: "1 A St", lat: 33.7, lng: -84.4, ownerMailing: "1 A St" } as Parameters<typeof attachDeeds>[0];
  attachDeeds(p, [mapDeedRow({ INSTRUMENT: "EXECUTORS DEED", RECORDED: "2026-02-01", GRANTEE: "HEIR" })], "2026-10-01T00:00:00.000Z");
  assert.ok(analyze(p, {}, new Date("2026-10-08")).engines.motivation.findings.some((f) => /estate/.test(f.text)));
});

test("ATL311: condition requests kept, others dropped; 311 + building complaint corroborate vacancy", () => {
  assert.equal(map311Row({ REQUEST_TYPE: "Pothole" }), null);
  const r = map311Row({ REQUEST_TYPE: "Vacant / abandoned house", CREATED_DATE: "2026-09-01", STATUS: "Open", SR_NUMBER: "311-1", ADDRESS: "1 A ST" })!;
  assert.equal(r.case.source, "atl311");
  assert.equal(r.case.vacant, true);
  const now = new Date("2026-10-08");
  const i = analyze({ id: "P", address: "1 A St", lat: 1, lng: 1, codeCases: [r.case, { id: "b", source: "building_complaints", openedAt: "2026-08-01", type: "Open and vacant", vacant: true }] }, {}, now);
  assert.equal(i.conclusions.find((c) => c.label === "Vacant")!.corroborated, true);
  assert.ok(i.engines.distress.findings.some((f) => /ATL311/.test(f.text)));
});

test("flood + OZ polygons: point in polygon with holes", () => {
  const outer = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.equal(pointInRings(2, 2, [outer, hole]), true);
  assert.equal(pointInRings(5, 5, [outer, hole]), false);
  const g = toPoly({ attributes: { FLD_ZONE: "AE" }, geometry: { rings: [outer] } })!;
  const props: PropertyRecord[] = [{ id: "a", address: "x", lat: 2, lng: 2 }, { id: "b", address: "y", lat: 20, lng: 20 }];
  assignFlood(props, [g], "2026-10-08T00:00:00.000Z");
  assert.equal(props[0].floodZone, "AE");
  assert.match(String(props[1].floodZone), /^X/);
});

test("GTFS: rail stations deduped by name, nearest assigned", () => {
  const txt = 'stop_id,stop_name,stop_lat,stop_lon,location_type\n1,"WEST END STATION",33.7359,-84.4131,1\n2,WEST END STATION - NB,33.7360,-84.4132,0\n3,"Cascade Rd @ Bus Stop",33.73,-84.45,0\n4,FIVE POINTS STATION,33.7539,-84.3916,1\n';
  const st = parseGtfsStations(txt);
  assert.equal(st.length, 2);
  const props: PropertyRecord[] = [{ id: "a", address: "x", lat: 33.7365, lng: -84.4139 }];
  assignTransit(props, st);
  assert.equal(props[0].transitName, "West End Station");
  assert.ok(props[0].transitMi! < 0.1);
});

test("non-Atlanta parcels skip the Atlanta zoning table", () => {
  const now = new Date("2026-10-08");
  const atl = analyze({ id: "a", address: "x", lat: 1, lng: 1, city: "Atlanta", zoning: "R-4", lotSqft: 20000 }, {}, now);
  const dek = analyze({ id: "b", address: "y", lat: 1, lng: 1, city: "Decatur", county: "DeKalb", zoning: "R-4", lotSqft: 20000 }, {}, now);
  assert.ok(atl.engines.development.score > 0);
  assert.equal(dek.engines.development.score, 0);
});

import { mapSafmr, attachSafmr, parseAcs, attachAcs } from "./re-feed-map.ts";
import { findComps, buildCompIndex, chooseRent, type MarketContext } from "./re-intel.ts";

test("HUD SAFMR: picks the bedroom column; ACS adds a cross-check rent and 5-year growth", () => {
  const safmr = mapSafmr([{ "ZIP Code": "30310", "SAFMR 0BR": "1100", "SAFMR 1BR": "1210", "SAFMR 2BR": "1390", "SAFMR 3BR": "1760", "SAFMR 4BR": "2100" }]);
  const props: PropertyRecord[] = [{ id: "a", address: "x", zip: "30310", lat: 1, lng: 1, beds: 3 }, { id: "b", address: "y", zip: "30310", lat: 1, lng: 1, sqft: 900 }];
  attachSafmr(props, safmr, "2026-10-01");
  assert.equal(props[0].rentEstimates![0].value, 1760);
  assert.match(props[1].rentEstimates![0].basis, /assumed/);
  const latest = parseAcs([["B25064_001E", "B01003_001E", "B19013_001E", "zip code tabulation area"], ["1250", "33000", "52000", "30310"]]);
  const earlier = parseAcs([["B25064_001E", "B01003_001E", "B19013_001E", "zip code tabulation area"], ["1000", "30000", "40000", "30310"]]);
  const market: Record<string, MarketContext> = { "30310": { key: "30310", asOf: null, source: "market" } };
  attachAcs(props, market, latest, earlier, 2024, "2025-12-01");
  assert.equal(market["30310"].popGrowthPct, 10);
  assert.equal(market["30310"].incomeGrowthPct, 30);
  assert.equal(props[0].rentEstimates!.length, 2);
  assert.equal(chooseRent(props[0])!.source, "hud_safmr");
  assert.equal(parseAcs([["B25064_001E", "zip code tabulation area"], ["-666666666", "30311"]]).get("30311")!.rent, null);
});

test("comps: renovated vs as-is split, distance/size/date filters, non-arm's-length dropped", () => {
  const now = new Date("2026-10-08T00:00:00Z");
  const sold = (id: string, dLat: number, sqft: number, price: number, daysAgo: number, reno: boolean, deedType = "WD"): PropertyRecord => {
    const d = new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
    return { id, address: id, lat: 33.73 + dLat, lng: -84.41, sqft, lastSaleDate: d, lastSalePrice: price, transfers: [{ date: d, price, deedType }], permits: reno ? [{ id: `p${id}`, category: "renovation", type: "Alteration", issuedAt: new Date(now.getTime() - (daysAgo + 120) * 86_400_000).toISOString() }] : [] };
  };
  const subject: PropertyRecord = { id: "S", address: "S", lat: 33.73, lng: -84.41, sqft: 1000 };
  const pool = [
    subject,
    sold("R1", 0.001, 1000, 300000, 30, true), sold("R2", 0.002, 1100, 310000, 60, true), sold("R3", 0.003, 950, 280000, 90, true),
    sold("A1", 0.001, 1000, 150000, 40, false), sold("A2", 0.002, 1050, 160000, 50, false), sold("A3", 0.003, 900, 140000, 70, false),
    sold("FAR", 0.05, 1000, 900000, 30, true), // ~3.5 mi
    sold("BIG", 0.001, 3000, 900000, 30, true), // too big
    sold("OLD", 0.001, 1000, 900000, 700, true), // too old
    sold("QCD", 0.001, 1000, 20000, 30, false, "Quitclaim Deed"), // family transfer
  ];
  const c = findComps(subject, buildCompIndex(pool, now), now)!;
  assert.deepEqual(c.renovated.map((x) => x.id).sort(), ["R1", "R2", "R3"]);
  assert.deepEqual(c.asIs.map((x) => x.id).sort(), ["A1", "A2", "A3"]);
  assert.equal(c.radiusMi, 0.5);
  assert.equal(c.arv, 295000); // median of 300, 282, 295 $/sq ft × 1000
  const v = estimateValue(subject, undefined, now, c);
  assert.match(v.arvBasis, /median of 3 renovated sales/);
});

test("Atlanta 2021–2023 code layer: address rebuilt from parts, flag columns become the case type", () => {
  const r = mapCodeRow({ CAP__: "CE-21-1", NBR: "123", NAME: "MOCK", STR: "ST", DIR: "SW", Open_Date: Date.UTC(2022, 4, 1), Case_Short_Description: "Housing", open_and_vacant: "1", boarded_more_than_6_months: "Y", exterior_structural: "0", overgrowth: "X" });
  assert.equal(r.address, "123 MOCK ST SW");
  assert.equal(r.case.id, "CE-21-1");
  assert.equal(r.case.vacant, true);
  assert.equal(r.case.boarded, true);
  assert.equal(r.case.structural, false);
  assert.match(r.case.type!, /open and vacant, boarded 6\+ months, overgrowth/);
  assert.equal(r.case.openedAt, "2022-05-01T00:00:00.000Z");
});
