/**
 * Deal Desk storage: property intelligence input (feed JSON) + operator state
 * (stage, follow-ups, contact log). Server-only. DEMO_MODE keeps desk state in
 * memory for the life of the server process, like the rest of lib/db.ts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEMO_MODE, db } from "./supabase";
import type { MarketContext, PropertyRecord } from "./re-intel";
import { demoMarket, demoProperties } from "./re-intel-demo";
import { applyActivity, type Activity, type DeskState } from "./re-desk";

export interface FeedSource {
  id: string;
  label: string;
  url?: string | null;
  pulledAt: string;
  records: number;
  minDate?: string | null;
  maxDate?: string | null;
  unmapped?: string[];
}

export interface IntelData {
  example: boolean;
  generatedAt: string;
  sources: FeedSource[];
  market: Record<string, MarketContext>;
  properties: PropertyRecord[];
  note?: string;
}

/**
 * RE_INTEL_URL (e.g. a Supabase Storage object) wins, then data/atlanta-intel.json
 * from `node tools/atlanta-intel/atlanta-feed.mjs`, then the EXAMPLE set.
 */
export async function loadIntelData(now: Date): Promise<IntelData> {
  const fromJson = (j: { generatedAt: string; sources?: FeedSource[]; market?: Record<string, MarketContext>; properties?: PropertyRecord[] }): IntelData => ({
    example: false,
    generatedAt: j.generatedAt,
    sources: j.sources ?? [],
    market: j.market ?? {},
    properties: j.properties ?? [],
  });
  let note: string | undefined;
  const url = process.env.RE_INTEL_URL;
  if (url) {
    try {
      const res = await fetch(url, { next: { revalidate: 900 } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return fromJson(await res.json());
    } catch (e) {
      note = `RE_INTEL_URL could not be read (${(e as Error).message}).`;
    }
  }
  try {
    return fromJson(JSON.parse(await readFile(join(process.cwd(), "data", "atlanta-intel.json"), "utf8")));
  } catch {
    /* no local feed output yet */
  }
  return {
    example: true,
    generatedAt: now.toISOString(),
    sources: [],
    market: demoMarket(now),
    properties: demoProperties(now),
    note: note ?? "No feed output yet: run tools/atlanta-intel/atlanta-feed.mjs. Showing fictional EXAMPLE properties.",
  };
}

// ─── Operator state ─────────────────────────────────────────────────────────

const demoStates = new Map<string, DeskState>();
const demoActivity: Activity[] = [];

type StateRow = { parcel_id: string; stage: DeskState["stage"]; next_follow_up: string | null; snoozed_until: string | null; closed_amount: number | null; updated_at: string };
type ActivityRow = { id: string; parcel_id: string; kind: Activity["kind"]; outcome: Activity["outcome"]; note: string | null; stage: Activity["stage"] | null; amount: number | null; created_at: string };

const fromStateRow = (r: StateRow): DeskState => ({ parcelId: r.parcel_id, stage: r.stage, nextFollowUp: r.next_follow_up, snoozedUntil: r.snoozed_until, closedAmount: r.closed_amount, updatedAt: r.updated_at });
const fromActivityRow = (r: ActivityRow): Activity => ({ id: r.id, parcelId: r.parcel_id, at: r.created_at, kind: r.kind, outcome: r.outcome, note: r.note ?? undefined, stage: r.stage ?? undefined, amount: r.amount });

export async function getDeskStates(): Promise<Record<string, DeskState>> {
  if (DEMO_MODE) return Object.fromEntries(demoStates);
  const { data, error } = await db().from("re_desk_state").select("*");
  if (error) throw error;
  return Object.fromEntries((data as StateRow[]).map((r) => [r.parcel_id, fromStateRow(r)]));
}

export async function getActivity(limit = 300): Promise<Activity[]> {
  if (DEMO_MODE) return [...demoActivity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const { data, error } = await db().from("re_activity").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as ActivityRow[]).map(fromActivityRow);
}

/** Log one touch and roll the property's stage / follow-up forward. */
export async function logActivity(a: Omit<Activity, "id" | "at">): Promise<DeskState> {
  const at = new Date().toISOString();
  if (DEMO_MODE) {
    const act: Activity = { ...a, id: `act-${demoActivity.length + 1}`, at };
    demoActivity.push(act);
    const next = applyActivity(demoStates.get(a.parcelId), act);
    demoStates.set(a.parcelId, next);
    return next;
  }
  const { data, error } = await db()
    .from("re_activity")
    .insert({ parcel_id: a.parcelId, kind: a.kind, outcome: a.outcome, note: a.note ?? null, stage: a.stage ?? null, amount: a.amount ?? null })
    .select("*")
    .single();
  if (error) throw error;
  const act = fromActivityRow(data as ActivityRow);
  const { data: cur } = await db().from("re_desk_state").select("*").eq("parcel_id", a.parcelId).maybeSingle();
  const next = applyActivity(cur ? fromStateRow(cur as StateRow) : undefined, act);
  const { error: e2 } = await db().from("re_desk_state").upsert({
    parcel_id: next.parcelId,
    stage: next.stage,
    next_follow_up: next.nextFollowUp,
    snoozed_until: next.snoozedUntil,
    closed_amount: next.closedAmount ?? null,
    updated_at: next.updatedAt,
  });
  if (e2) throw e2;
  return next;
}
