/**
 * Progressive autonomy gates — Module 2f. Pure functions; the runtime state
 * lives in the ssf_gates table (db.ts) and is checked at request time, not
 * assumed. Any out-of-stock cancellation drops one tier and locks 14 days,
 * automatically and non-negotiably — see applyOutOfStockCancellationPenalty.
 */
import type { SsfGates } from "./types";

export interface SsfGateMetrics {
  salesCount: number;
  blendedMarginPct: number; // 0..1
  cancellations: number;
  lateShipments: number;
}

export interface TierConfig {
  cap: number;
  approvalMode: SsfGates["approval_mode"];
}

export function tierConfig(tier: 0 | 1 | 2): TierConfig {
  switch (tier) {
    case 0:
      return { cap: 10, approvalMode: "human" };
    case 1:
      return { cap: 50, approvalMode: "batch" };
    case 2:
      return { cap: 200, approvalMode: "auto_under_75" };
  }
}

/** Nightly recompute target — never downgrades here (only the cancellation penalty does that). */
export function computeEligibleTier(metrics: SsfGateMetrics): 0 | 1 | 2 {
  const clean = metrics.cancellations === 0 && metrics.lateShipments === 0 && metrics.blendedMarginPct >= 0.2;
  if (clean && metrics.salesCount >= 25) return 2;
  if (clean && metrics.salesCount >= 5) return 1;
  return 0;
}

export interface QueueCheck {
  allowed: boolean;
  reason?: string;
}

export function canQueueNewListing(gates: SsfGates, activeListingCount: number): QueueCheck {
  if (gates.locked_until && new Date(gates.locked_until) > new Date()) {
    return { allowed: false, reason: `Locked until ${new Date(gates.locked_until).toLocaleDateString()} — ${gates.lock_reason ?? "autonomy lock in effect"}` };
  }
  if (activeListingCount >= gates.active_listing_cap) {
    return { allowed: false, reason: `At tier ${gates.tier} cap of ${gates.active_listing_cap} active listings` };
  }
  return { allowed: true };
}

/** Whether a drafted listing needs an explicit human tap before it can go live. */
export function requiresHumanApproval(gates: SsfGates, listing: { ourCost: number | null; veroFlagged: boolean }): boolean {
  if (listing.veroFlagged) return true;
  if (gates.approval_mode === "auto_under_75") {
    return !(listing.ourCost !== null && listing.ourCost < 75);
  }
  // "human" and "batch" both require an explicit approve tap — batch just means
  // the UI lets you approve several at once, it's still a human decision each time.
  return true;
}

export function applyOutOfStockCancellationPenalty(gates: SsfGates): Pick<SsfGates, "tier" | "active_listing_cap" | "approval_mode" | "locked_until" | "lock_reason"> {
  const newTier = Math.max(0, gates.tier - 1) as 0 | 1 | 2;
  const cfg = tierConfig(newTier);
  return {
    tier: newTier,
    active_listing_cap: cfg.cap,
    approval_mode: cfg.approvalMode,
    locked_until: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    lock_reason: "Out-of-stock cancellation — automatic tier drop + 14-day lock",
  };
}
