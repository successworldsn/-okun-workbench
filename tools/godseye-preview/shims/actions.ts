/**
 * Browser-only stand-ins for src/app/realestate/actions.ts, used by the
 * self-contained preview build. Same engine, same outputs; desk state stays
 * in this browser (localStorage) instead of Supabase, and there is no AI key,
 * so "What should I do?" returns the engine's own plan.
 */
import type { Intel } from "@/lib/re-intel";
import { nextAction, applyActivity, type ActivityKind, type Outcome, type Stage, type DeskState, type Activity } from "@/lib/re-desk";
import { draftOutreach, planFor, COMPLIANCE, type Channel } from "@/lib/re-outreach";
import { importBuyersCsv, type Buyer } from "@/lib/re-buyers";
import { demoBuyers } from "@/lib/re-intel-demo";
import type { Contract } from "@/lib/re-contract";
import type { Fieldwork, Photo } from "@/lib/re-field";

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

const BKEY = "godseye-preview-buyers-v1";
export function loadBuyers(): Buyer[] {
  try {
    const j = JSON.parse(localStorage.getItem(BKEY) ?? "null");
    if (Array.isArray(j)) return j;
  } catch {
    /* storage unavailable */
  }
  return demoBuyers(new Date());
}
function storeBuyers(list: Buyer[]) {
  try {
    localStorage.setItem(BKEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}
export async function saveBuyer(b: Buyer): Promise<Buyer[]> {
  if (!b.name?.trim()) throw new Error("A buyer needs a name.");
  const list = loadBuyers();
  const k = list.findIndex((x) => x.id === b.id);
  const c = { ...b, updatedAt: new Date().toISOString() };
  if (k >= 0) list[k] = c;
  else list.unshift(c);
  storeBuyers(list);
  return list;
}
export async function importBuyers(csv: string): Promise<{ buyers: Buyer[]; added: number; errors: string[] }> {
  const { buyers, errors } = importBuyersCsv(csv, new Date());
  const list = [...buyers, ...loadBuyers()];
  storeBuyers(list);
  return { buyers: list, added: buyers.length, errors };
}

const CKEY = "godseye-preview-contracts-v1";
export function loadContracts(): Contract[] {
  try {
    const j = JSON.parse(localStorage.getItem(CKEY) ?? "null");
    if (Array.isArray(j)) return j;
  } catch {
    /* storage unavailable */
  }
  return [];
}
export async function saveContract(c: Contract, statusChanged: boolean): Promise<{ contracts: Contract[]; state: DeskState | null }> {
  const list = loadContracts().filter((x) => x.parcelId !== c.parcelId);
  list.unshift({ ...c, updatedAt: new Date().toISOString() });
  try {
    localStorage.setItem(CKEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
  let state: DeskState | null = null;
  if (statusChanged) {
    const stage: Stage = c.status === "active" ? "CONTRACT" : c.status === "closed" ? "CLOSED" : "NEGOTIATION";
    state = await logTouch({ parcelId: c.parcelId, kind: "stage", outcome: null, stage, amount: c.status === "closed" ? c.assignmentFee ?? null : null, note: c.status === "active" ? `Under contract at $${c.contractPrice.toLocaleString("en-US")}` : c.status === "closed" ? "Closed" : "Contract cancelled" });
  }
  return { contracts: list, state };
}

const FKEY = "godseye-preview-fieldwork-v1";
export function loadFieldwork(): Record<string, Fieldwork> {
  try {
    const j = JSON.parse(localStorage.getItem(FKEY) ?? "null");
    if (j && typeof j === "object") return j;
  } catch {
    /* storage unavailable */
  }
  return {};
}
function putFw(fw: Fieldwork): Fieldwork {
  const all = loadFieldwork();
  const next = { ...fw, updatedAt: new Date().toISOString() };
  all[fw.parcelId] = next;
  try {
    localStorage.setItem(FKEY, JSON.stringify(all));
  } catch {
    throw new Error("This browser's storage is full: photos in the preview are limited to a few. The live app stores them server-side.");
  }
  return next;
}
const cur = (id: string): Fieldwork => loadFieldwork()[id] ?? { parcelId: id, scope: null, walkedAt: null, photos: [], convos: [], updatedAt: new Date().toISOString() };
export async function saveFieldwork(fw: Pick<Fieldwork, "parcelId" | "scope" | "walkedAt" | "convos">): Promise<Fieldwork> {
  return putFw({ ...cur(fw.parcelId), scope: fw.scope, walkedAt: fw.walkedAt, convos: fw.convos });
}
export async function addPhoto(parcelId: string, photo: Photo): Promise<Fieldwork> {
  const c = cur(parcelId);
  return putFw({ ...c, photos: [...c.photos, photo].slice(-24) });
}
export async function deletePhoto(parcelId: string, photoId: string): Promise<Fieldwork> {
  const c = cur(parcelId);
  return putFw({ ...c, photos: c.photos.filter((x) => x.id !== photoId) });
}
