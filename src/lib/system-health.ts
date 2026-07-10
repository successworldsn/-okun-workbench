/**
 * System Health Layer — pure status logic. Every function here takes real
 * data (a timestamp, a boolean, a config flag) and returns one of exactly
 * four states. There is no fifth "assume it's fine" state — if a module
 * genuinely can't be checked, the caller must pass not_set_up explicitly,
 * never default to active.
 */
import type { HealthStatus } from "./types";

const severity: Record<HealthStatus, number> = { active: 0, not_set_up: 1, attention: 2, error: 3 };

/** Worst-status-wins across however many checks feed one module's pill. */
export function combineHealth(statuses: HealthStatus[]): HealthStatus {
  if (statuses.length === 0) return "not_set_up";
  return statuses.reduce((worst, s) => (severity[s] > severity[worst] ? s : worst));
}

/**
 * Generic recency check: null timestamp (nothing has ever happened) is
 * not_set_up, not error — "no data yet" and "broken" are different claims.
 */
export function checkRecency(lastTimestampIso: string | null, activeWithinHours: number, attentionWithinHours: number): HealthStatus {
  if (!lastTimestampIso) return "not_set_up";
  const ageHours = (Date.now() - new Date(lastTimestampIso).getTime()) / 3_600_000;
  if (ageHours < 0) return "attention"; // clock skew or bad data — don't claim active on a future timestamp
  if (ageHours <= activeWithinHours) return "active";
  if (ageHours <= attentionWithinHours) return "attention";
  return "attention"; // deliberately not "error" — staleness alone isn't a failure, just a signal to look
}

export function checkCredential(configured: boolean): HealthStatus {
  return configured ? "active" : "not_set_up";
}

/** Last logged event for a module/event_type — 'error' status always wins regardless of recency. */
export function checkLastEvent(lastEvent: { status: "ok" | "error"; created_at: string } | null, activeWithinHours: number, attentionWithinHours: number): HealthStatus {
  if (!lastEvent) return "not_set_up";
  if (lastEvent.status === "error") return "error";
  return checkRecency(lastEvent.created_at, activeWithinHours, attentionWithinHours);
}

/** SSF catalog pricing freshness — mirrors lib/ssf-catalog-csv.ts's pricingAge thresholds exactly. */
export function checkCatalogFreshness(oldestActiveLastUpdated: string | null, amberDays: number, blockDays: number): HealthStatus {
  if (!oldestActiveLastUpdated) return "not_set_up";
  const days = (Date.now() - new Date(oldestActiveLastUpdated).getTime()) / 86_400_000;
  if (days > blockDays) return "error";
  if (days > amberDays) return "attention";
  return "active";
}
