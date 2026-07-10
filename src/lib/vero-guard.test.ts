import { test } from "node:test";
import assert from "node:assert/strict";
import { checkVero } from "./vero-guard.ts";
import { getSsfConfig } from "./ssf-config.ts";

const config = getSsfConfig();

test("clean fitment-context listing passes clean", () => {
  const r = checkVero(
    { title: "Air Suspension Compressor — Fits Land Rover LR3 LR4", description: "Aftermarket replacement, fits Land Rover LR3/LR4 models.", brands: ["Land Rover"], isGenuineLine: false },
    config
  );
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, false);
});

test("blocks manufacturer packaging references", () => {
  const r = checkVero(
    { title: "Water Pump", description: "Comes in genuine packaging, OEM box included.", brands: ["BMW"], isGenuineLine: false },
    config
  );
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.some((x) => x.includes("packaging")));
});

test('blocks "genuine" claim on a non-genuine line', () => {
  const r = checkVero({ title: "Genuine Turbocharger", description: "This is a genuine part.", brands: ["Volvo"], isGenuineLine: false }, config);
  assert.equal(r.blocked, true);
});

test('allows "genuine" claim when catalog line actually is Genuine', () => {
  const r = checkVero({ title: "Genuine Turbocharger", description: "This is a genuine part.", brands: ["Volvo"], isGenuineLine: true }, config);
  assert.equal(r.blocked, false);
});

test("flags bare brand mention outside fitment context", () => {
  const r = checkVero(
    { title: "BMW Water Pump — Premium Quality", description: "BMW quality you can trust.", brands: ["BMW"], isGenuineLine: false },
    config
  );
  assert.equal(r.flagged, true);
  assert.ok(r.reasons.some((x) => x.includes("fitment context")));
});

test("flags VeRO-sensitive brands for manual review even when clean", () => {
  const r = checkVero(
    { title: "Water Pump — Fits BMW E90", description: "Aftermarket replacement, fits BMW E90 3-Series.", brands: ["BMW"], isGenuineLine: false },
    config
  );
  assert.equal(r.blocked, false);
  assert.equal(r.flagged, true);
  assert.ok(r.reasons.some((x) => x.includes("manual review")));
});
