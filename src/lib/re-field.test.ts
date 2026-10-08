import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, analyzeAll } from "./re-intel.ts";
import { demoProperties, demoMarket, demoBuyers } from "./re-intel-demo.ts";
import { computeScope, blankScope, applyFieldwork, blankNotes, type Fieldwork } from "./re-field.ts";
import { matchBuyers } from "./re-buyers.ts";
import { buildOffer } from "./re-offer.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const market = demoMarket(NOW);
const all = analyzeAll(demoProperties(NOW), market, NOW);
const base = all.find((i) => i.p.address.startsWith("1290 "))!; // absentee, no conversation yet

test("scope math: levels × qty, then permits and contingency", () => {
  const lines = blankScope(base.p).map((l) => (l.key === "roof" ? { ...l, level: "standard" as const, qty: 1700 } : l.key === "kitchen" ? { ...l, level: "heavy" as const } : l));
  const s = computeScope(lines);
  assert.equal(s.hard, 1700 * 6 + 28000);
  assert.equal(s.permits, Math.round(s.hard * 0.04));
  assert.equal(s.total, s.hard + s.permits + Math.round((s.hard + s.permits) * 0.12));
  assert.equal(s.used, 2);
  const over = computeScope([{ key: "hvac", level: "standard", qty: 2, unitCost: 5000 }]);
  assert.equal(over.hard, 10000);
});

test("walk-through replaces the size screen everywhere and closes the condition unknown", () => {
  const fw: Fieldwork = { parcelId: base.p.id, scope: blankScope(base.p).map((l) => ({ ...l, level: "standard" as const })), walkedAt: NOW.toISOString(), photos: [], convos: [], updatedAt: NOW.toISOString() };
  const i = analyze(applyFieldwork(base.p, fw), market, NOW, null, base.comps);
  assert.equal(i.rehab.fromWalkthrough, true);
  assert.equal(i.rehab.value, computeScope(fw.scope!).total);
  assert.ok(!i.unknowns.some((u) => /Interior condition/.test(u)));
  const m = matchBuyers(i, demoBuyers(NOW)).matches.concat(matchBuyers(i, demoBuyers(NOW)).nearMisses);
  if (m[0]) assert.match(m[0].priceBasis, /walk-through|land value|as-is/);
});

test("conversation: ASAP + reasons raise motivation and confidence; 'not selling' sinks the score; stated payoff becomes the debt", () => {
  const asap = { ...blankNotes(NOW), occupancy: "vacant" as const, timeline: "asap" as const, reasons: ["Inherited", "Repairs too costly"], statedPayoff: 42000, askingPrice: 260000, condition: 2 as const, issues: ["Roof"] };
  const fw: Fieldwork = { parcelId: base.p.id, scope: null, walkedAt: null, photos: [], convos: [asap], updatedAt: NOW.toISOString() };
  const hot = analyze(applyFieldwork(base.p, fw), market, NOW, null, base.comps);
  assert.ok(hot.engines.motivation.score > base.engines.motivation.score + 30);
  assert.ok(hot.score > base.score);
  assert.ok(hot.confidence >= base.confidence);
  assert.equal(hot.value.debt, 42000);
  assert.match(hot.value.debtBasis, /Owner stated payoff/);
  assert.ok(!hot.unknowns.some((u) => /intent/.test(u)));
  assert.ok(hot.engines.distress.findings.some((f) => /major issues: Roof/.test(f.text)));
  const offer = buildOffer(hot, []);
  assert.ok(offer.lines.some((l) => l.label === "Owner's asking price"));

  const no = analyze(applyFieldwork(base.p, { ...fw, convos: [{ ...blankNotes(NOW), timeline: "not_selling" }] }), market, NOW, null, base.comps);
  assert.ok(no.score < base.score);
});
