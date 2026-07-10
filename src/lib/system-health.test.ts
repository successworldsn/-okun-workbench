import { test } from "node:test";
import assert from "node:assert/strict";
import { combineHealth, checkRecency, checkCredential, checkLastEvent, checkCatalogFreshness } from "./system-health.ts";

test("combineHealth: error beats everything", () => {
  assert.equal(combineHealth(["active", "attention", "error", "not_set_up"]), "error");
});

test("combineHealth: attention beats not_set_up and active", () => {
  assert.equal(combineHealth(["active", "not_set_up", "attention"]), "attention");
});

test("combineHealth: all active stays active", () => {
  assert.equal(combineHealth(["active", "active"]), "active");
});

test("combineHealth: empty input is not_set_up, never a silent default to active", () => {
  assert.equal(combineHealth([]), "not_set_up");
});

test("checkRecency: null timestamp is not_set_up, not error", () => {
  assert.equal(checkRecency(null, 24, 168), "not_set_up");
});

test("checkRecency: recent timestamp is active", () => {
  assert.equal(checkRecency(new Date(Date.now() - 3_600_000).toISOString(), 24, 168), "active");
});

test("checkRecency: stale timestamp is attention, not error (staleness alone isn't failure)", () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  assert.equal(checkRecency(tenDaysAgo, 24, 168), "attention");
});

test("checkCredential: absent is not_set_up, never fake active", () => {
  assert.equal(checkCredential(false), "not_set_up");
  assert.equal(checkCredential(true), "active");
});

test("checkLastEvent: error status always wins regardless of recency", () => {
  const justNow = new Date().toISOString();
  assert.equal(checkLastEvent({ status: "error", created_at: justNow }, 24, 168), "error");
});

test("checkLastEvent: no event ever is not_set_up", () => {
  assert.equal(checkLastEvent(null, 24, 168), "not_set_up");
});

test("checkCatalogFreshness: matches the 7/14 day amber/block convention", () => {
  const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const stale = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const dead = new Date(Date.now() - 20 * 86_400_000).toISOString();
  assert.equal(checkCatalogFreshness(fresh, 7, 14), "active");
  assert.equal(checkCatalogFreshness(stale, 7, 14), "attention");
  assert.equal(checkCatalogFreshness(dead, 7, 14), "error");
  assert.equal(checkCatalogFreshness(null, 7, 14), "not_set_up");
});
