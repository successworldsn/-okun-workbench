/**
 * Deal Desk storage: property intelligence input (feed JSON) + operator state
 * (stage, follow-ups, contact log). Server-only. DEMO_MODE keeps desk state in
 * memory for the life of the server process, like the rest of lib/db.ts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DEMO_MODE, db } from "./supabase";
import type { MarketContext, PropertyRecord } from "./re-intel";
import { demoBuyers, demoMarket, demoProperties } from "./re-intel-demo";
import type { Buyer } from "./re-buyers";
import type { Contract } from "./re-contract";
import type { Fieldwork, Photo } from "./re-field";
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

/** Desk tables not created yet (schema.sql not applied): the desk still opens, read-only. */
export const isMissingTable = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message ?? ""));
export const MISSING_TABLES = "Desk tables not set up: apply the God's Eye section of schema.sql in Supabase to save stages and contact logs.";

export async function getDeskStates(): Promise<Record<string, DeskState>> {
  if (DEMO_MODE) return Object.fromEntries(demoStates);
  const { data, error } = await db().from("re_desk_state").select("*");
  if (isMissingTable(error)) return {};
  if (error) throw error;
  return Object.fromEntries((data as StateRow[]).map((r) => [r.parcel_id, fromStateRow(r)]));
}

export async function deskTablesReady(): Promise<boolean> {
  if (DEMO_MODE) return true;
  const { error } = await db().from("re_desk_state").select("parcel_id").limit(1);
  return !isMissingTable(error);
}

export async function getActivity(limit = 300): Promise<Activity[]> {
  if (DEMO_MODE) return [...demoActivity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  const { data, error } = await db().from("re_activity").select("*").order("created_at", { ascending: false }).limit(limit);
  if (isMissingTable(error)) return [];
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
  if (isMissingTable(error)) throw new Error(MISSING_TABLES);
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

// ─── Buyers ─────────────────────────────────────────────────────────────────

let demoBuyerList: Buyer[] | null = null;

export async function getBuyers(): Promise<Buyer[]> {
  if (DEMO_MODE) return (demoBuyerList ??= demoBuyers(new Date()));
  const { data, error } = await db().from("re_buyers").select("data, active").order("updated_at", { ascending: false });
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data as { data: Buyer; active: boolean }[]).map((r) => ({ ...r.data, active: r.active }));
}

export async function saveBuyers(buyers: Buyer[]): Promise<void> {
  if (DEMO_MODE) {
    const list = (demoBuyerList ??= demoBuyers(new Date()));
    for (const b of buyers) {
      const k = list.findIndex((x) => x.id === b.id);
      if (k >= 0) list[k] = b;
      else list.unshift(b);
    }
    return;
  }
  const { error } = await db()
    .from("re_buyers")
    .upsert(buyers.map((b) => ({ id: b.id, data: b, active: b.active, updated_at: b.updatedAt })));
  if (isMissingTable(error)) throw new Error("Buyer table not set up: apply the re_buyers section of schema.sql in Supabase.");
  if (error) throw error;
}

// ─── Contracts ──────────────────────────────────────────────────────────────

const demoContracts = new Map<string, Contract>();

export async function getContracts(): Promise<Contract[]> {
  if (DEMO_MODE) return [...demoContracts.values()];
  const { data, error } = await db().from("re_contracts").select("data");
  if (isMissingTable(error)) return [];
  if (error) throw error;
  return (data as { data: Contract }[]).map((r) => r.data);
}

export async function putContract(c: Contract): Promise<void> {
  if (DEMO_MODE) {
    demoContracts.set(c.parcelId, c);
    return;
  }
  const { error } = await db().from("re_contracts").upsert({ parcel_id: c.parcelId, data: c, status: c.status, updated_at: c.updatedAt });
  if (isMissingTable(error)) throw new Error("Contract table not set up: apply the re_contracts section of schema.sql in Supabase.");
  if (error) throw error;
}

// ─── Field work (walk-through, photos, conversations) ───────────────────────

const demoField = new Map<string, Fieldwork>();
const emptyFw = (parcelId: string): Fieldwork => ({ parcelId, scope: null, walkedAt: null, photos: [], convos: [], updatedAt: new Date().toISOString() });

export async function getFieldwork(): Promise<Record<string, Fieldwork>> {
  if (DEMO_MODE) return Object.fromEntries(demoField);
  const { data, error } = await db().from("re_fieldwork").select("parcel_id, data");
  if (isMissingTable(error)) return {};
  if (error) throw error;
  return Object.fromEntries((data as { parcel_id: string; data: Fieldwork }[]).map((r) => [r.parcel_id, r.data]));
}

async function getOne(parcelId: string): Promise<Fieldwork> {
  if (DEMO_MODE) return demoField.get(parcelId) ?? emptyFw(parcelId);
  const { data, error } = await db().from("re_fieldwork").select("data").eq("parcel_id", parcelId).maybeSingle();
  if (error && !isMissingTable(error)) throw error;
  return (data as { data: Fieldwork } | null)?.data ?? emptyFw(parcelId);
}

async function putOne(fw: Fieldwork): Promise<Fieldwork> {
  const next = { ...fw, updatedAt: new Date().toISOString() };
  if (DEMO_MODE) {
    demoField.set(fw.parcelId, next);
    return next;
  }
  const { error } = await db().from("re_fieldwork").upsert({ parcel_id: fw.parcelId, data: next, updated_at: next.updatedAt });
  if (isMissingTable(error)) throw new Error("Field-work table not set up: apply the re_fieldwork section of schema.sql in Supabase.");
  if (error) throw error;
  return next;
}

/** Scope + conversations; photos are kept as stored (they travel one at a time). */
export async function putFieldworkText(fw: Pick<Fieldwork, "parcelId" | "scope" | "walkedAt" | "convos">): Promise<Fieldwork> {
  const cur = await getOne(fw.parcelId);
  return putOne({ ...cur, scope: fw.scope, walkedAt: fw.walkedAt, convos: fw.convos.slice(0, 30) });
}

export async function addFieldPhoto(parcelId: string, photo: Photo): Promise<Fieldwork> {
  const cur = await getOne(parcelId);
  return putOne({ ...cur, photos: [...cur.photos, photo].slice(-24) });
}

export async function removeFieldPhoto(parcelId: string, photoId: string): Promise<Fieldwork> {
  const cur = await getOne(parcelId);
  return putOne({ ...cur, photos: cur.photos.filter((x) => x.id !== photoId) });
}
