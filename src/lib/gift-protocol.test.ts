import { test } from "node:test";
import assert from "node:assert/strict";
import { canCreateGiftProspect, usableFacts, addBusinessDays, GIFT_PROTOCOL_CAP } from "./gift-protocol.ts";
import type { DossierFact } from "./types.ts";

test("cap allows under 5, blocks at 5", () => {
  assert.equal(canCreateGiftProspect(4).allowed, true);
  assert.equal(canCreateGiftProspect(5).allowed, false);
  assert.equal(canCreateGiftProspect(6).allowed, false);
  assert.equal(GIFT_PROTOCOL_CAP, 5);
});

test("usableFacts includes confirmed, excludes unapproved single_source", () => {
  const dossier: DossierFact[] = [
    { fact: "A", confidence: "confirmed", source_note: "x" },
    { fact: "B", confidence: "single_source", source_note: "y" },
    { fact: "C", confidence: "single_source", source_note: "z", approved_for_use: true },
  ];
  const usable = usableFacts(dossier).map((f) => f.fact);
  assert.deepEqual(usable, ["A", "C"]);
});

test("addBusinessDays skips weekends — Friday + 2 business days lands on Tuesday", () => {
  // 2026-07-10 is a Friday (UTC)
  const result = addBusinessDays("2026-07-10T00:00:00.000Z", 2);
  assert.equal(result, "2026-07-14"); // Sat 11, Sun 12 skipped -> Mon 13, Tue 14
});

test("addBusinessDays from a Monday lands on Wednesday", () => {
  // 2026-07-06 is a Monday (UTC)
  const result = addBusinessDays("2026-07-06T00:00:00.000Z", 2);
  assert.equal(result, "2026-07-08");
});
