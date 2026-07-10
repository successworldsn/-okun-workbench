/**
 * Gift Protocol (Module 3 patch) — pure rule functions. Two hard rules live
 * here, both enforced in code rather than left to discipline:
 *  1. Max 5 active dossiers at a time — this module never auto-upgrades
 *     autonomy tiers, unlike the SSF gates. There is no tier to earn into.
 *  2. Nothing below `confirmed` (or a human-approved `single_source` fact)
 *     ever reaches flyer/site copy. "Inferred" facts aren't even a storable
 *     confidence value (see schema) — they're filtered upstream of this file.
 */
import type { DossierFact, GiftDeliveryStatus } from "./types";

export const GIFT_PROTOCOL_CAP = 5;

export interface CapCheck {
  allowed: boolean;
  reason?: string;
}

export function canCreateGiftProspect(activeCount: number): CapCheck {
  if (activeCount >= GIFT_PROTOCOL_CAP) {
    return { allowed: false, reason: `At the hard cap of ${GIFT_PROTOCOL_CAP} active Gift Protocol dossiers — archive one before adding another.` };
  }
  return { allowed: true };
}

/** Facts safe to use in flyer/site copy: confirmed always, single_source only once a human has tapped approve. */
export function usableFacts(dossier: DossierFact[]): DossierFact[] {
  return dossier.filter((f) => f.confidence === "confirmed" || f.approved_for_use === true);
}

const isWeekend = (d: Date) => d.getUTCDay() === 0 || d.getUTCDay() === 6;

/** Add N business days (Mon-Fri) in UTC, so this doesn't drift with local timezone (see fb-gate.ts's earlier bug). */
export function addBusinessDays(fromIso: string, days: number): string {
  const d = new Date(fromIso);
  let remaining = days;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!isWeekend(d)) remaining--;
  }
  return d.toISOString().slice(0, 10);
}

/** Whether a delivery status transition should trigger the Today Screen follow-up task + auto follow_up_date. */
export function isConversionTrigger(status: GiftDeliveryStatus): boolean {
  return status === "delivered_signed";
}
