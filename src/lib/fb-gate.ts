/**
 * Messenger AI auto-responder gate (Module 5b). Per spec: "gate-locked in
 * code — the build task only unlocks in the backlog when the log shows ≥15
 * legit inquiries/week for 2 consecutive weeks. Until then it does not
 * exist." This file computes whether that threshold has been crossed; it
 * does NOT build the responder — there is nothing to enable even if eligible,
 * by design. This is a status readout only.
 */
export interface WeekBucket {
  weekStart: string; // ISO date, Monday
  count: number;
}

const WEEK_MS = 7 * 86_400_000;

/** Entirely UTC-based — mixing local getDay()/setHours() with toISOString() output
 * causes week-boundary miscounts whenever a timestamp falls near local midnight
 * but not UTC midnight (or vice versa). Server timestamps are UTC; stay in UTC throughout. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function bucketInquiriesByWeek(inquiryDates: string[]): WeekBucket[] {
  const buckets = new Map<string, number>();
  for (const iso of inquiryDates) {
    const key = mondayOf(new Date(iso)).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([weekStart, count]) => ({ weekStart, count })).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

export interface MessengerGateStatus {
  eligible: boolean;
  weeks: WeekBucket[];
  threshold: number;
  consecutiveWeeksRequired: number;
}

export function computeMessengerGateStatus(inquiryDates: string[], threshold = 15, consecutiveWeeksRequired = 2): MessengerGateStatus {
  const weeks = bucketInquiriesByWeek(inquiryDates).slice(0, consecutiveWeeksRequired + 1);
  const recentEnough = weeks.length >= consecutiveWeeksRequired;
  const consecutive = recentEnough && weeks.slice(0, consecutiveWeeksRequired).every((w) => w.count >= threshold) && isConsecutive(weeks.slice(0, consecutiveWeeksRequired));
  return { eligible: Boolean(consecutive), weeks, threshold, consecutiveWeeksRequired };
}

function isConsecutive(weeks: WeekBucket[]): boolean {
  for (let i = 0; i < weeks.length - 1; i++) {
    const a = new Date(weeks[i].weekStart).getTime();
    const b = new Date(weeks[i + 1].weekStart).getTime();
    if (a - b !== WEEK_MS) return false;
  }
  return true;
}
