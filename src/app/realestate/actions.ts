"use server";

import { revalidatePath } from "next/cache";
import { logActivity, loadIntelData, saveBuyers, getBuyers, putContract, getContracts } from "@/lib/re-desk-store";
import type { Contract } from "@/lib/re-contract";
import { putFieldworkText, addFieldPhoto, removeFieldPhoto } from "@/lib/re-desk-store";
import type { Fieldwork, Photo } from "@/lib/re-field";
import { importBuyersCsv, type Buyer } from "@/lib/re-buyers";
import { STAGES, nextAction, type ActivityKind, type Outcome, type Stage, type DeskState } from "@/lib/re-desk";
import { analyze } from "@/lib/re-intel";
import { draftOutreach, planFor, COMPLIANCE, type Channel } from "@/lib/re-outreach";
import { complete, CLAUDE_CONFIGURED } from "@/lib/claude";

const KINDS: ActivityKind[] = ["call", "sms", "email", "letter", "verify", "research", "note", "skip", "stage", "buyer"];

export async function logTouch(input: { parcelId: string; kind: ActivityKind; outcome: Outcome; note?: string; stage?: Stage; amount?: number | null }): Promise<DeskState> {
  if (!KINDS.includes(input.kind)) throw new Error("Unknown activity");
  if (input.stage && !STAGES.includes(input.stage)) throw new Error("Unknown stage");
  const state = await logActivity({ parcelId: input.parcelId, kind: input.kind, outcome: input.outcome, note: input.note?.slice(0, 2000), stage: input.stage, amount: input.amount ?? null });
  revalidatePath("/realestate/command");
  return state;
}

async function intelFor(parcelId: string) {
  const now = new Date();
  const data = await loadIntelData(now);
  const p = data.properties.find((x) => x.id === parcelId);
  return p ? { i: analyze(p, data.market, now), now } : null;
}

const GROUNDING =
  "You are the analyst on a real-estate acquisitions desk. Use ONLY the facts in the JSON you are given. " +
  "Never invent owner circumstances, condition, payoff balances or comps. If something is unknown, say it is unknown. " +
  "Plain English, short, no hype. Every claim must trace to a field in the JSON.";

function factSheet(i: ReturnType<typeof analyze>) {
  return JSON.stringify({
    address: i.p.address,
    example_data: !!i.p.example,
    score: i.score,
    confidence: i.confidence,
    strongest: i.strongest,
    conclusions: i.conclusions.map((c) => ({ label: c.label, independent_sources: c.independentSources, corroborated: c.corroborated })),
    engines: Object.fromEntries(Object.values(i.engines).map((e) => [e.key, { score: e.score, findings: e.findings.map((f) => f.text) }])),
    value: i.value,
    strategies: i.strategies.slice(0, 4),
    unknowns: i.unknowns,
    next_verification: i.nextVerification,
  });
}

/** "WHAT SHOULD I DO?" — deterministic plan, optionally rewritten by Claude from the same facts. */
export async function askOracle(parcelId: string, stage: Stage | null): Promise<{ text: string; by: "engine" | "claude" }> {
  const r = await intelFor(parcelId);
  if (!r) return { text: "Property not found in the current feed.", by: "engine" };
  const state = stage ? ({ parcelId, stage, nextFollowUp: null, snoozedUntil: null, updatedAt: r.now.toISOString() } as DeskState) : undefined;
  const a = nextAction(r.i, state, r.now);
  const plan = planFor(r.i, a.verb, a.why);
  if (!CLAUDE_CONFIGURED) return { text: plan, by: "engine" };
  const res = await complete(GROUNDING, `Facts:\n${factSheet(r.i)}\n\nEngine plan:\n${plan}\n\nIn 6 lines or fewer: what should the operator do next with this property today, and what would change the plan?`, 500);
  return res.ok && res.text ? { text: res.text, by: "claude" } : { text: plan, by: "engine" };
}

export async function draftMessage(parcelId: string, channel: Channel, polish: boolean): Promise<{ text: string; compliance: string; by: "template" | "claude" }> {
  const r = await intelFor(parcelId);
  if (!r) return { text: "", compliance: "", by: "template" };
  const text = draftOutreach(r.i, channel);
  if (!polish || !CLAUDE_CONFIGURED) return { text, compliance: COMPLIANCE[channel], by: "template" };
  const res = await complete(
    GROUNDING + " Do not mention distress, taxes, code cases, foreclosure or any public-record problem to the owner.",
    `Polish this ${channel} draft to sound warm and human. Keep every placeholder in [brackets]. Keep it the same length or shorter.\n\n${text}`,
    600,
  );
  return { text: res.ok && res.text ? res.text : text, compliance: COMPLIANCE[channel], by: res.ok ? "claude" : "template" };
}

const clean = (b: Buyer): Buyer => ({
  ...b,
  name: String(b.name ?? "").slice(0, 120).trim(),
  zips: (b.zips ?? []).filter((z) => /^\d{5}$/.test(z)),
  counties: (b.counties ?? []).map((c) => String(c).slice(0, 40)),
  notes: b.notes?.slice(0, 2000),
  updatedAt: new Date().toISOString(),
});

export async function saveBuyer(b: Buyer): Promise<Buyer[]> {
  const c = clean(b);
  if (!c.name) throw new Error("A buyer needs a name.");
  await saveBuyers([c]);
  revalidatePath("/realestate/command");
  return getBuyers();
}

export async function importBuyers(csv: string): Promise<{ buyers: Buyer[]; added: number; errors: string[] }> {
  const { buyers, errors } = importBuyersCsv(csv.slice(0, 500_000), new Date());
  if (buyers.length) await saveBuyers(buyers.map(clean));
  revalidatePath("/realestate/command");
  return { buyers: await getBuyers(), added: buyers.length, errors };
}

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Save a contract; when its status changes, roll the pipeline stage to match (CONTRACT / CLOSED with the fee / back to NEGOTIATION). */
export async function saveContract(c: Contract, statusChanged: boolean): Promise<{ contracts: Contract[]; state: DeskState | null }> {
  if (!(c.contractPrice >= 0) || !isDate(c.effectiveDate) || !isDate(c.closingDate)) throw new Error("Contract needs a price, a binding date and a closing date.");
  const clean: Contract = { ...c, notes: c.notes?.slice(0, 4000), checklist: c.checklist.slice(0, 40), updatedAt: new Date().toISOString() };
  await putContract(clean);
  let state: DeskState | null = null;
  if (statusChanged) {
    const stage: Stage = clean.status === "active" ? "CONTRACT" : clean.status === "closed" ? "CLOSED" : "NEGOTIATION";
    state = await logActivity({
      parcelId: clean.parcelId,
      kind: "stage",
      outcome: null,
      stage,
      amount: clean.status === "closed" ? clean.assignmentFee ?? null : null,
      note: clean.status === "active" ? `Under contract at $${clean.contractPrice.toLocaleString("en-US")}` : clean.status === "closed" ? "Closed" : "Contract cancelled",
    });
  }
  revalidatePath("/realestate/command");
  return { contracts: await getContracts(), state };
}

export async function saveFieldwork(fw: Pick<Fieldwork, "parcelId" | "scope" | "walkedAt" | "convos">): Promise<Fieldwork> {
  const out = await putFieldworkText({ ...fw, convos: fw.convos.map((c) => ({ ...c, notes: c.notes?.slice(0, 4000) })) });
  revalidatePath("/realestate/command");
  return out;
}

export async function addPhoto(parcelId: string, photo: Photo): Promise<Fieldwork> {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(photo.dataUrl) || photo.dataUrl.length > 900_000) throw new Error("Photo must be a resized image under ~650 KB.");
  return addFieldPhoto(parcelId, { ...photo, room: photo.room.slice(0, 40), caption: photo.caption?.slice(0, 200) });
}

export async function deletePhoto(parcelId: string, photoId: string): Promise<Fieldwork> {
  return removeFieldPhoto(parcelId, photoId);
}
