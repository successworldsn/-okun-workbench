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
