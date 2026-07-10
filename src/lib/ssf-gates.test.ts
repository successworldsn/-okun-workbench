import { test } from "node:test";
import assert from "node:assert/strict";
import { canQueueNewListing, requiresHumanApproval, applyOutOfStockCancellationPenalty, computeEligibleTier } from "./ssf-gates.ts";
import type { SsfGates } from "./types.ts";

const tier0: SsfGates = { tier: 0, active_listing_cap: 10, approval_mode: "human", locked_until: null, lock_reason: null };

test("blocks queueing at cap", () => {
  const r = canQueueNewListing(tier0, 10);
  assert.equal(r.allowed, false);
});

test("allows queueing under cap", () => {
  const r = canQueueNewListing(tier0, 9);
  assert.equal(r.allowed, true);
});

test("blocks queueing while locked, even under cap", () => {
  const locked: SsfGates = { ...tier0, locked_until: new Date(Date.now() + 86_400_000).toISOString(), lock_reason: "test lock" };
  const r = canQueueNewListing(locked, 0);
  assert.equal(r.allowed, false);
});

test("tier 0 always requires human approval", () => {
  assert.equal(requiresHumanApproval(tier0, { ourCost: 10, veroFlagged: false }), true);
});

test("tier 2 auto-publishes under $75 cost, unflagged", () => {
  const tier2: SsfGates = { tier: 2, active_listing_cap: 200, approval_mode: "auto_under_75", locked_until: null, lock_reason: null };
  assert.equal(requiresHumanApproval(tier2, { ourCost: 50, veroFlagged: false }), false);
  assert.equal(requiresHumanApproval(tier2, { ourCost: 100, veroFlagged: false }), true);
});

test("VeRO-flagged always requires approval regardless of tier", () => {
  const tier2: SsfGates = { tier: 2, active_listing_cap: 200, approval_mode: "auto_under_75", locked_until: null, lock_reason: null };
  assert.equal(requiresHumanApproval(tier2, { ourCost: 10, veroFlagged: true }), true);
});

test("out-of-stock cancellation drops one tier and locks 14 days", () => {
  const tier1: SsfGates = { tier: 1, active_listing_cap: 50, approval_mode: "batch", locked_until: null, lock_reason: null };
  const patch = applyOutOfStockCancellationPenalty(tier1);
  assert.equal(patch.tier, 0);
  assert.equal(patch.active_listing_cap, 10);
  assert.equal(patch.approval_mode, "human");
  assert.ok(new Date(patch.locked_until!).getTime() > Date.now() + 13 * 86_400_000);
});

test("tier floor is 0 — cancellation at tier 0 doesn't go negative", () => {
  const patch = applyOutOfStockCancellationPenalty(tier0);
  assert.equal(patch.tier, 0);
});

test("computeEligibleTier requires clean record (no cancellations/late shipments, 20%+ margin)", () => {
  assert.equal(computeEligibleTier({ salesCount: 30, blendedMarginPct: 0.25, cancellations: 0, lateShipments: 0 }), 2);
  assert.equal(computeEligibleTier({ salesCount: 30, blendedMarginPct: 0.25, cancellations: 1, lateShipments: 0 }), 0);
  assert.equal(computeEligibleTier({ salesCount: 5, blendedMarginPct: 0.2, cancellations: 0, lateShipments: 0 }), 1);
  assert.equal(computeEligibleTier({ salesCount: 4, blendedMarginPct: 0.5, cancellations: 0, lateShipments: 0 }), 0);
});
