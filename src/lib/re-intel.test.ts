import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, analyzeAll, badge, isAbsentee, developmentRead, remainingBalance, estimateValue, type PropertyRecord } from "./re-intel.ts";
import { demoProperties, demoMarket } from "./re-intel-demo.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const base = (over: Partial<PropertyRecord> = {}): PropertyRecord => ({
  id: "P1",
  address: "10 Test St SW",
  zip: "30310",
  lat: 33.73,
  lng: -84.41,
  ownerMailing: "10 Test St SW, Atlanta, GA, 30310",
  sqft: 1400,
  yearBuilt: 1990,
  lotSqft: 5000,
  zoning: "R-4",
  fairMarketValue: 200000,
  lastSaleDate: ago(365 * 5),
  ...over,
});

test("badges: government record fresh → VERIFIED, old → STALE, history-only layer → STALE, rule → INFERRED", () => {
  assert.equal(badge({ source: "tax_delinquent", detail: "", observedAt: ago(10) }, NOW), "VERIFIED");
  assert.equal(badge({ source: "tax_delinquent", detail: "", observedAt: ago(400) }, NOW), "STALE");
  assert.equal(badge({ source: "code_history", detail: "", observedAt: ago(10) }, NOW), "STALE");
  assert.equal(badge({ source: "rule", detail: "", observedAt: null, inferred: true }, NOW), "INFERRED");
  assert.equal(badge({ source: "fulton_cama", detail: "", observedAt: null, inferred: true }, NOW), "INFERRED");
});

test("absentee: mailing address elsewhere, normalized street suffixes don't false-positive", () => {
  assert.equal(isAbsentee(base()), false);
  assert.equal(isAbsentee(base({ address: "10 Test Street SW", ownerMailing: "10 TEST ST SW, ATLANTA GA" })), false);
  assert.equal(isAbsentee(base({ ownerMailing: "900 Other Rd, Houston, TX" })), true);
  assert.equal(isAbsentee(base({ ownerMailing: undefined })), null);
});

test("distress needs current evidence: a 2022 code case alone scores far below a fresh tax + complaint stack", () => {
  const old = analyze(base({ codeCases: [{ id: "c", source: "code_history", openedAt: ago(1300), type: "Grass" }] }), {}, NOW);
  const hot = analyze(
    base({
      taxDelinquent: { amount: 5000, years: 2, asOf: ago(20) },
      codeCases: [{ id: "b", source: "building_complaints", openedAt: ago(30), type: "Open and vacant", vacant: true }],
    }),
    {},
    NOW,
  );
  assert.ok(old.engines.distress.score < 20);
  assert.ok(hot.engines.distress.score >= 55, `got ${hot.engines.distress.score}`);
});

test("corroboration: vacant backed by two independent sources is corroborated, one source is not", () => {
  const one = analyze(base({ codeCases: [{ id: "b", source: "building_complaints", openedAt: ago(30), type: "x", vacant: true }] }), {}, NOW);
  const two = analyze(
    base({
      codeCases: [
        { id: "b", source: "building_complaints", openedAt: ago(30), type: "x", vacant: true },
        { id: "h", source: "code_history", openedAt: ago(900), type: "Open and vacant", boarded: true },
      ],
    }),
    {},
    NOW,
  );
  assert.equal(one.conclusions.find((c) => c.label === "Vacant")!.corroborated, false);
  assert.equal(two.conclusions.find((c) => c.label === "Vacant")!.corroborated, true);
});

test("confidence rises with independent sources and never reaches 100", () => {
  const thin = analyze(base({ ownerMailing: "1 Far Rd, Austin, TX" }), {}, NOW);
  const thick = analyze(
    base({
      ownerMailing: "1 Far Rd, Austin, TX",
      ownerMailingState: "TX",
      homesteadExemption: false,
      taxDelinquent: { amount: 3000, years: 1, asOf: ago(10) },
      probate: { filedAt: ago(40) },
      codeCases: [{ id: "b", source: "building_complaints", openedAt: ago(30), type: "x" }],
      mortgages: [{ date: ago(365 * 25), amount: 50000 }],
      lastSaleDate: ago(365 * 25),
    }),
    {},
    NOW,
  );
  assert.ok(thick.confidence > thin.confidence + 20, `${thin.confidence} → ${thick.confidence}`);
  assert.ok(thick.confidence <= 97);
});

test("equity: amortized mortgage beats the last-sale inference; 30+ years owned with nothing recorded infers paid off", () => {
  assert.ok(Math.abs(remainingBalance(100000, 0.065, 30, 360)) < 1e-6);
  assert.ok(remainingBalance(100000, 0.065, 30, 60) > 90000);
  const v = estimateValue(base({ mortgages: [{ date: ago(365 * 10), amount: 100000 }] }), undefined, NOW);
  assert.match(v.debtBasis, /security deeds/);
  const free = estimateValue(base({ lastSaleDate: ago(365 * 35), lastSalePrice: null }), undefined, NOW);
  assert.equal(free.debt, 0);
  assert.match(free.debtBasis, /inference/);
});

test("development screen: R-4 lot 2× the minimum is a split candidate with an extra unit; MR district on 1 unit scores", () => {
  const d = developmentRead(base({ lotSqft: 19000, zoning: "R-4" }));
  assert.equal(d.splitCandidate, true);
  assert.equal(d.extraUnits, 1);
  const mr = analyze(base({ zoning: "MR-2", existingUnits: 1 }), {}, NOW);
  assert.ok(mr.engines.development.findings.some((f) => /Multifamily district/.test(f.text)));
  const building = analyze(base({ lotSqft: 19000, permits: [{ id: "n", category: "new_construction", type: "New SFD", issuedAt: ago(100) }] }), {}, NOW);
  assert.ok(building.engines.development.findings.some((f) => f.points < 0));
});

test("risk subtracts: a flood-zone twin scores lower", () => {
  const p = base({ taxDelinquent: { amount: 1, asOf: ago(5) } });
  assert.ok(analyze({ ...p, floodZone: "AE" }, {}, NOW).score < analyze(p, {}, NOW).score);
});

test("demo set: scores spread out, every property has a why, strategies are ranked", () => {
  const all = analyzeAll(demoProperties(NOW), demoMarket(NOW), NOW);
  assert.equal(all.length, 16);
  assert.ok(all[0].score >= 70, `top ${all[0].score}`);
  assert.ok(all[all.length - 1].score < 40, `bottom ${all[all.length - 1].score}`);
  for (const i of all) {
    assert.ok(i.why.length > 0);
    assert.ok(i.strategies[0].fit >= i.strategies[i.strategies.length - 1].fit);
  }
  // Recently-bought, mortgaged, renovated house should not outrank the foreclosure.
  const kirk = all.find((i) => i.p.address.startsWith("75 "))!;
  const fc = all.find((i) => i.p.foreclosure)!;
  assert.ok(fc.score > kirk.score);
});
