import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSites, analyzeSite, ciBadge, deliverableMw, matchCapital, layerCounts } from "./ci-intel.ts";
import { demoSites, demoSignals, demoCapital, demoDeals, demoMemories } from "./ci-demo.ts";
import { rule, negotiate, acceptProbability, ceoAlerts, recall, runDealTeam, newDealFromSite, DEFAULT_PLAYBOOK, type ProposedAction, type Deal } from "./ci-deal.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const sites = demoSites(NOW), signals = demoSignals(NOW), capital = demoCapital(NOW);
const all = analyzeSites(sites, signals, capital, NOW);
const byId = (id: string) => all.find((i) => i.site.id === id)!;

test("badges: government VERIFIED, filings/press/conversation REPORTED, estimates INFERRED", () => {
  assert.equal(ciBadge({ source: "hifld", detail: "", observedAt: null }, NOW), "VERIFIED");
  assert.equal(ciBadge({ source: "utility_irp", detail: "", observedAt: "2026-09-01" }, NOW), "REPORTED");
  assert.equal(ciBadge({ source: "estimate", detail: "", observedAt: null }, NOW), "INFERRED");
  assert.equal(ciBadge({ source: "news", detail: "", observedAt: "2024-01-01" }, NOW), "STALE");
});

test("reported MW beats generation beats estimate", () => {
  assert.deepEqual(deliverableMw(byId("GA-008").site), { mw: 35, basis: "reported" });
  assert.deepEqual(deliverableMw(byId("GA-002").site), { mw: 320, basis: "generation" });
  assert.equal(deliverableMw(byId("GA-003").site).basis, "estimated");
});

test("power + fiber + zoning + nearby demand put the Douglas tract on top; flood + moratorium sink the Dougherty land", () => {
  assert.equal(all[0].site.id, "GA-001");
  assert.ok(all[0].score >= 75, `top ${all[0].score}`);
  const sw = byId("GA-006");
  assert.ok(sw.factors.risk.findings.some((f) => /pauses data-center rezonings/.test(f.text)));
  assert.ok(sw.score < all[0].score - 30);
});

test("retired plant reads as stranded power and matches the repurposing strategic", () => {
  const p = byId("GA-002");
  assert.equal(p.theses[0].key, "stranded_power");
  assert.ok(p.matches.some((m) => m.source.id === "CP-4"));
});

test("capital mandates filter by MW range and region", () => {
  const small = byId("GA-007"); // 40 MW
  const ids = matchCapital(small.site, capital, NOW).map((m) => m.source.id);
  assert.ok(ids.includes("CP-6")); // edge developer 20–80 MW
  assert.ok(!ids.includes("CP-1")); // needs 100+
});

test("constellation fills roles and names the gaps", () => {
  const c = byId("GA-001").constellation;
  assert.ok(c.completeness >= 80);
  assert.ok(c.slots.find((s) => s.role === "end_user")!.filledBy);
});

test("autonomy boundary: routine GREEN, intros YELLOW, binding RED, licensed activity RED", () => {
  const d = demoDeals(NOW)[0];
  const A = (kind: ProposedAction["kind"], amount?: number): ProposedAction => ({ id: "t", dealId: d.id, kind, summary: "x", amount });
  assert.equal(rule(A("follow_up"), d).temperature, "GREEN");
  assert.equal(rule(A("introduction"), d).temperature, "YELLOW");
  assert.equal(rule(A("sign_agreement"), d).temperature, "RED");
  assert.equal(rule(A("investor_solicitation"), d).needs, "a licensed professional + you");
  assert.equal(rule(A("fee_on_sale"), d).temperature, "RED");
  // Counter inside the box: small move above target → GREEN; big move → YELLOW; past walk-away → RED.
  assert.equal(rule(A("counteroffer", 19_000_000), d).temperature, "GREEN");
  assert.equal(rule(A("counteroffer", 17_400_000), d).temperature, "YELLOW");
  assert.equal(rule(A("counteroffer", 15_000_000), d).temperature, "RED");
  assert.equal(rule({ ...A("draft"), draft: "We guarantee approval" }, d).temperature, "RED");
});

test("negotiation: counter concedes a share of the gap, never past walk-away, reports EV gain", () => {
  const d = demoDeals(NOW)[0];
  const n = negotiate(d, 14_200_000);
  assert.equal(n.recommendation, "counter");
  assert.ok(n.counter! < 19_500_000 && n.counter! >= d.terms!.walkAway);
  assert.ok(n.pAccept > 0 && n.pAccept < 1);
  assert.ok(n.improvement > 0);
  assert.equal(negotiate(d, 18_500_000).recommendation, "accept");
  assert.equal(negotiate(d, 18_500_000).ruling.temperature, "RED"); // accepting is yours
  assert.ok(acceptProbability(14_300_000, 14_200_000, 0) > acceptProbability(19_000_000, 14_200_000, 0));
});

test("CEO alerts: the developer's response is the top money alert with SEND / EDIT / TAKE OVER", () => {
  const a = ceoAlerts(demoDeals(NOW), [], all, NOW);
  assert.ok(a.length >= 2);
  assert.equal(a[0].dealId, "D-0472");
  assert.deepEqual(a[0].choices, ["SEND", "EDIT", "TAKE OVER"]);
});

test("memory recalls what a party told us, newest first", () => {
  const r = recall(demoMemories(NOW), "Example Infrastructure Fund B (fictional)");
  assert.ok(r.lines.some((l) => /liquidity within 90 days/.test(l)));
});

test("deal team: ten agents report; drafts never claim authority; actions carry rulings", () => {
  const i = byId("GA-001");
  const t = runDealTeam(i, signals, capital, demoMemories(NOW), DEFAULT_PLAYBOOK, NOW);
  assert.equal(t.reports.length, 10);
  assert.ok(t.actions.some((a) => a.kind === "nonbinding_proposal"));
  for (const a of t.actions) assert.notEqual(rule(a, null).temperature, "RED");
  const d: Deal = newDealFromSite(i, NOW);
  assert.ok(d.terms!.walkAway < d.terms!.target && d.terms!.target < d.terms!.anchor);
});

test("layer counts and single-site analysis are stable", () => {
  const c = layerCounts(all, signals, capital);
  assert.equal(c.capital, capital.length);
  assert.ok(c.power >= 5);
  assert.equal(analyzeSite(sites[0], signals, capital, NOW).score, byId("GA-001").score);
});

import { parseUsd, memoryHints } from "./ci-deal.ts";

test("memory-aware negotiation: a counter above the party's stated budget is flagged", () => {
  assert.equal(parseUsd("board approved up to ~$17M"), 17_000_000);
  assert.equal(parseUsd("$950K"), 950_000);
  const h = memoryHints(demoMemories(NOW), "Example DC Developer A (fictional)", 17_300_000, "sell");
  assert.ok(h.some((x) => /Above their stated budget/.test(x)));
  assert.ok(memoryHints(demoMemories(NOW), "Example DC Developer A (fictional)", 16_900_000, "sell").some((x) => /Inside their stated budget/.test(x)));
});
