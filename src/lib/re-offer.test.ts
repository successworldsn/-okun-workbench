import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAll } from "./re-intel.ts";
import { demoProperties, demoMarket, demoBuyers } from "./re-intel-demo.ts";
import { matchBuyers } from "./re-buyers.ts";
import { buildOffer, offerLetter, DEFAULT_OFFER } from "./re-offer.ts";
import { newContract, deadlines, upcomingDeadlines, progress, addDaysYmd } from "./re-contract.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const all = analyzeAll(demoProperties(NOW), demoMarket(NOW), NOW);
const buyers = demoBuyers(NOW);
const byAddr = (a: string) => all.find((i) => i.p.address.startsWith(a))!;

test("offer ladder: opening < target < walk-away < exit, from the best buyer's price", () => {
  const i = byAddr("101 ");
  const o = buildOffer(i, matchBuyers(i, buyers).matches);
  assert.ok(o.exit! > o.walkAway! && o.walkAway! > o.target! && o.target! > o.opening!);
  assert.match(o.exitBasis, /Example Buyer A/);
  assert.equal(o.walkAway! % 500, 0);
  assert.equal(o.exit! - o.walkAway! >= DEFAULT_OFFER.minFee, true);
});

test("seller floor: free-and-clear owner is feasible; underwater owner is flagged", () => {
  const i = byAddr("101 "); // deeds checked, no open loan
  const ok = buildOffer(i, matchBuyers(i, buyers).matches);
  assert.equal(ok.feasible, "yes");
  const under = { ...i, value: { ...i.value, debt: 500000 } };
  const no = buildOffer(under, matchBuyers(under, buyers).matches);
  assert.equal(no.feasible, "no");
  assert.match(no.verdict, /bring \$/);
});

test("unknown debt can't be judged; retail net subtracts commission, closing, carry", () => {
  const i = byAddr("12 "); // no deed index search → debt is inferred, may be null or estimate
  const o = buildOffer({ ...i, value: { ...i.value, debt: null } }, []);
  assert.equal(o.feasible, "unknown");
  assert.ok(o.retailNet! < i.value.current!);
});

test("offer letter is a non-binding LOI with the opening price", () => {
  const i = byAddr("101 ");
  const o = buildOffer(i, matchBuyers(i, buyers).matches);
  const l = offerLetter(i, o);
  assert.ok(l.includes("$" + o.opening!.toLocaleString("en-US")));
  assert.match(l, /not a contract/);
});

test("contract deadlines: EMD +3, due diligence +10, closing +30, severities", () => {
  const c = newContract("P", "1 A St", 80000, NOW);
  const d = deadlines(c, NOW);
  assert.deepEqual(d.map((x) => x.date), ["2026-10-11", "2026-10-18", "2026-11-07"]);
  assert.equal(d[0].severity, "amber");
  assert.equal(deadlines(c, new Date("2026-10-12T12:00:00Z"))[0].severity, "overdue");
  c.checklist[1].done = true;
  assert.equal(deadlines(c, new Date("2026-10-12T12:00:00Z"))[0].severity, "done");
  assert.equal(addDaysYmd("2026-12-30", 3), "2027-01-02");
  assert.equal(progress(c), Math.round((2 / c.checklist.length) * 100));
  const up = upcomingDeadlines([c], new Date("2026-10-15T12:00:00Z"));
  assert.equal(up[0].key, "dd");
  assert.equal(up[0].daysLeft, 3);
});
