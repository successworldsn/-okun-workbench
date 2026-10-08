import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeAll } from "./re-intel.ts";
import { demoProperties, demoMarket } from "./re-intel-demo.ts";
import { applyActivity, buildQueue, followUpDays, parseCommand, applyCommand, stageAfter, moneyStats, nextAction, type DeskState } from "./re-desk.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const all = analyzeAll(demoProperties(NOW), demoMarket(NOW), NOW);

test("follow-up spacing by touch", () => {
  assert.equal(followUpDays("call", "no_answer"), 2);
  assert.equal(followUpDays("call", "left_message"), 3);
  assert.equal(followUpDays("letter", "sent"), 7);
  assert.equal(followUpDays("call", "wrong_number"), null);
  assert.equal(followUpDays("skip", null), 30);
});

test("stage only moves forward from touches; explicit stage change wins", () => {
  assert.equal(stageAfter("DISCOVERED", { kind: "call", outcome: "no_answer" }), "CONTACTED");
  assert.equal(stageAfter("CONVERSATION", { kind: "call", outcome: "no_answer" }), "CONVERSATION");
  assert.equal(stageAfter("CONTACTED", { kind: "call", outcome: "interested" }), "OPPORTUNITY");
  assert.equal(stageAfter("NEGOTIATION", { kind: "stage", outcome: null, stage: "DEAD" }), "DEAD");
});

test("contacted property drops out of the queue until its follow-up is due, then leads it", () => {
  const top = buildQueue(all, {}, NOW)[0];
  const id = top.intel.p.id;
  const st = applyActivity(undefined, { id: "a1", parcelId: id, at: NOW.toISOString(), kind: "call", outcome: "no_answer" });
  assert.equal(st.stage, "CONTACTED");
  assert.equal(st.nextFollowUp!.slice(0, 10), "2026-10-10");
  const states: Record<string, DeskState> = { [id]: st };
  assert.ok(!buildQueue(all, states, NOW).some((q) => q.intel.p.id === id));
  const later = new Date("2026-10-10T13:00:00Z");
  const q = buildQueue(all, states, later);
  assert.equal(q[0].intel.p.id, id);
  assert.equal(q[0].action.verb, "FOLLOW UP");
});

test("skip snoozes 30 days; dead never returns", () => {
  const id = all[0].p.id;
  const skipped = applyActivity(undefined, { id: "s", parcelId: id, at: NOW.toISOString(), kind: "skip", outcome: null });
  assert.ok(!buildQueue(all, { [id]: skipped }, new Date("2026-10-20T00:00:00Z")).some((q) => q.intel.p.id === id));
  const dead = applyActivity(undefined, { id: "d", parcelId: id, at: NOW.toISOString(), kind: "stage", outcome: null, stage: "DEAD" });
  assert.ok(!buildQueue(all, { [id]: dead }, new Date("2027-06-01T00:00:00Z")).some((q) => q.intel.p.id === id));
});

test("foreclosure inside 30 days says CALL NOW", () => {
  const fc = all.find((i) => i.p.foreclosure)!;
  assert.equal(nextAction(fc, undefined, NOW).verb, "CALL NOW");
});

test("command bar: the user's example sentences parse", () => {
  const a = parseCommand("Show me distressed properties within 5 miles of Atlanta with at least $200K estimated equity.");
  assert.deepEqual(a.missions, ["distress"]);
  assert.equal(a.minEquity, 200000);
  assert.equal(a.near?.miles, 5);
  assert.equal(a.near?.label, "atlanta");

  const b = parseCommand("Find vacant properties where the zoning allows more units than currently exist.");
  assert.deepEqual(b.signals, ["vacant"]);
  assert.equal(b.extraUnits, true);

  const c = parseCommand("Show me the 20 best opportunities I haven't contacted.");
  assert.equal(c.limit, 20);
  assert.equal(c.uncontacted, true);
  assert.deepEqual(c.missions, []);

  assert.equal(parseCommand("Why is this property ranked 94?").explain, true);
});

test("command filters apply", () => {
  const res = applyCommand(all, parseCommand("distressed within 5 miles of Atlanta with at least $100K equity"), {});
  assert.ok(res.length > 0);
  for (const i of res) {
    assert.ok(i.missions.includes("distress"));
    assert.ok((i.value.equity ?? 0) >= 100000);
  }
  const top3 = applyCommand(all, parseCommand("top 3"), {});
  assert.equal(top3.length, 3);
});

test("money screen counts funnel and closed value", () => {
  const id = all[0].p.id;
  const closed = applyActivity(undefined, { id: "c", parcelId: id, at: NOW.toISOString(), kind: "stage", outcome: null, stage: "CLOSED", amount: 18500 });
  const m = moneyStats(all, { [id]: closed });
  assert.equal(m.closed, 1);
  assert.equal(m.closedValue, 18500);
  assert.equal(m.funnel[0].count, all.length);
  assert.ok(m.estimatedEquity > 0);
});
