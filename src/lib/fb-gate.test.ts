import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMessengerGateStatus } from "./fb-gate.ts";

function datesInWeek(mondayIso: string, count: number): string[] {
  const monday = new Date(mondayIso);
  return Array.from({ length: count }, (_, i) => new Date(monday.getTime() + i * 3_600_000).toISOString());
}

test("not eligible with too few inquiries", () => {
  const dates = [...datesInWeek("2026-06-29", 5), ...datesInWeek("2026-07-06", 5)];
  const r = computeMessengerGateStatus(dates);
  assert.equal(r.eligible, false);
});

test("eligible with 2 consecutive weeks at/above threshold", () => {
  const dates = [...datesInWeek("2026-06-29", 16), ...datesInWeek("2026-07-06", 15)];
  const r = computeMessengerGateStatus(dates);
  assert.equal(r.eligible, true);
});

test("not eligible if the two qualifying weeks aren't consecutive", () => {
  const dates = [...datesInWeek("2026-06-22", 20), ...datesInWeek("2026-07-06", 20)]; // gap week missing
  const r = computeMessengerGateStatus(dates);
  assert.equal(r.eligible, false);
});

test("not eligible with only one qualifying week on record", () => {
  const dates = datesInWeek("2026-07-06", 20);
  const r = computeMessengerGateStatus(dates);
  assert.equal(r.eligible, false);
});
