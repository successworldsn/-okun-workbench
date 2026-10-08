import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAll, analyze } from "./re-intel.ts";
import { demoProperties, demoMarket, demoBuyers } from "./re-intel-demo.ts";
import { matchBuyers, matchBuyer, importBuyersCsv, dealSheet, propType, type Buyer } from "./re-buyers.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const all = analyzeAll(demoProperties(NOW), demoMarket(NOW), NOW);
const buyers = demoBuyers(NOW);
const byAddr = (a: string) => all.find((i) => i.p.address.startsWith(a))!;

test("westside flipper matches the West End lead; eastside luxury flipper doesn't", () => {
  const i = byAddr("101 ");
  const { matches } = matchBuyers(i, buyers);
  assert.ok(matches.some((m) => m.buyer.id === "bx-1"));
  assert.ok(!matches.some((m) => m.buyer.id === "bx-5"));
  const a = matches.find((m) => m.buyer.id === "bx-1")!;
  assert.match(a.priceBasis, /× 70%/);
  assert.ok(a.why.includes("proof of funds on file"));
});

test("near miss: exactly one criterion off is reported with the gap", () => {
  const b: Buyer = { ...buyers[0], id: "t", maxPrice: 1000 };
  const m = matchBuyer(byAddr("101 "), b);
  assert.equal(m.misses.length, 1);
  assert.match(m.misses[0], /over their maximum/);
  assert.ok(matchBuyers(byAddr("101 "), [b]).nearMisses.length === 1);
});

test("county buyers work without ZIPs; inactive buyers never match", () => {
  const dek = byAddr("2290 ");
  assert.equal(propType(dek.p), "sfr");
  const rental: Buyer = { ...buyers[1], maxRehab: null, minBeds: null, minPrice: null, maxPrice: null };
  assert.ok(matchBuyers(dek, [rental]).matches.length === 1);
  assert.equal(matchBuyers(dek, [{ ...rental, active: false }]).matches.length, 0);
});

test("fit rewards proof of funds and track record", () => {
  const i = byAddr("101 ");
  const base: Buyer = { ...buyers[0], pofVerified: false, cash: false, dealsClosed: 0, closeDays: null };
  assert.ok(matchBuyer(i, buyers[0]).fit > matchBuyer(i, base).fit);
});

test("deal sheet carries ARV basis and comps, never owner details", () => {
  const i = byAddr("101 ");
  const sheet = dealSheet(i, matchBuyer(i, buyers[0]));
  assert.match(sheet, /ARV: \$/);
  assert.match(sheet, /Renovated comps/);
  assert.ok(!sheet.includes(i.p.owner!));
  assert.ok(!/tax|probate|foreclos|delinquen/i.test(sheet));
});

test("CSV import from a spreadsheet paste", () => {
  const csv = 'Name,Company,Phone,ZIPs,Types,Strategies,Min Price,Max Price,Max Rehab,Cash,POF,Close Days\n"Jane Doe","JD Homes","404-555-0000","30310; 30314","SFR, duplex","fix and flip, buy and hold",50k,$225000,75k,yes,y,14\n,NoName\n';
  const { buyers: out, errors } = importBuyersCsv(csv, NOW);
  assert.equal(out.length, 1);
  assert.equal(errors.length, 1);
  const j = out[0];
  assert.deepEqual(j.zips, ["30310", "30314"]);
  assert.deepEqual(j.types.sort(), ["multi_2_4", "sfr"]);
  assert.deepEqual(j.strategies.sort(), ["flip", "rental"]);
  assert.equal(j.minPrice, 50000);
  assert.equal(j.maxPrice, 225000);
  assert.equal(j.pofVerified, true);
  assert.equal(j.closeDays, 14);
});

test("analyze exposes the rehab estimate the buyer price uses", () => {
  const i = analyze(byAddr("101 ").p, demoMarket(NOW), NOW);
  assert.ok(i.rehab.value! > 0);
});

import { applyActivity } from "./re-desk.ts";

test("logging a deal sheet to a buyer doesn't move the owner follow-up", () => {
  const st = applyActivity(undefined, { id: "a", parcelId: "P", at: "2026-10-08T12:00:00Z", kind: "call", outcome: "no_answer" });
  const after = applyActivity(st, { id: "b", parcelId: "P", at: "2026-10-09T12:00:00Z", kind: "buyer", outcome: "sent", note: "Sent to X" });
  assert.equal(after.nextFollowUp, st.nextFollowUp);
  assert.equal(after.stage, "CONTACTED");
});
