/**
 * Browser-only stand-ins for src/app/realestate/actions.ts, used by the
 * self-contained preview build. Same engine, same outputs; desk state stays
 * in this browser (localStorage) instead of Supabase, and there is no AI key,
 * so "What should I do?" returns the engine's own plan.
 */
import type { Intel } from "@/lib/re-intel";
import { nextAction, applyActivity, type ActivityKind, type Outcome, type Stage, type DeskState, type Activity } from "@/lib/re-desk";
import { draftOutreach, planFor, COMPLIANCE, type Channel } from "@/lib/re-outreach";

let registry = new Map<string, Intel>();
export function registerIntel(all: Intel[]) {
  registry = new Map(all.map((i) => [i.p.id, i]));
}

const KEY = "godseye-preview-desk-v1";
export function loadLocal(): { states: Record<string, DeskState>; activity: Activity[] } {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (j && j.states && j.activity) return j;
  } catch {
    /* storage unavailable */
  }
  return { states: {}, activity: [] };
}
function saveLocal(v: { states: Record<string, DeskState>; activity: Activity[] }) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable: state lasts until reload */
  }
}

export async function logTouch(input: { parcelId: string; kind: ActivityKind; outcome: Outcome; note?: string; stage?: Stage; amount?: number | null }): Promise<DeskState> {
  const db = loadLocal();
  const act: Activity = { id: `pv-${Date.now()}`, at: new Date().toISOString(), parcelId: input.parcelId, kind: input.kind, outcome: input.outcome, note: input.note, stage: input.stage, amount: input.amount ?? null };
  const st = applyActivity(db.states[input.parcelId], act);
  db.states[input.parcelId] = st;
  db.activity.unshift(act);
  saveLocal(db);
  return st;
}

export async function askOracle(parcelId: string, stage: Stage | null): Promise<{ text: string; by: "engine" | "claude" }> {
  const i = registry.get(parcelId);
  if (!i) return { text: "Property not found.", by: "engine" };
  const now = new Date();
  const state = stage ? ({ parcelId, stage, nextFollowUp: null, snoozedUntil: null, updatedAt: now.toISOString() } as DeskState) : undefined;
  const a = nextAction(i, state, now);
  return { text: planFor(i, a.verb, a.why), by: "engine" };
}

export async function draftMessage(parcelId: string, channel: Channel, _polish?: boolean): Promise<{ text: string; compliance: string; by: "template" | "claude" }> {
  const i = registry.get(parcelId);
  return { text: i ? draftOutreach(i, channel) : "", compliance: COMPLIANCE[channel], by: "template" };
}
