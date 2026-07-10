"use server";

import { revalidatePath } from "next/cache";
import { getRetainerProspects, updateRetainerStage, updateRetainerResearch, markRetainerContacted, createOutreachDraft, markOutreachSent } from "@/lib/db";
import { researchProspect, draftRetainerOutreach } from "@/lib/outreach-draft";
import type { RetainerStage } from "@/lib/types";

const STAGE_ORDER: RetainerStage[] = ["target", "contacted", "meeting", "proposal", "signed"];

export async function advanceStage(formData: FormData) {
  const id = formData.get("id") as string;
  const current = formData.get("current_stage") as RetainerStage;
  const idx = STAGE_ORDER.indexOf(current);
  const next = STAGE_ORDER[Math.min(idx + 1, STAGE_ORDER.length - 1)];
  await updateRetainerStage(id, next);
  revalidatePath("/retainers");
  revalidatePath("/");
}

export async function runResearch(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const notes = (formData.get("notes") as string) || "";
  const result = await researchProspect(name, notes);
  if (result.source === "claude") {
    await updateRetainerResearch(id, { brief: result.brief, suggestedOffer: result.suggestedOffer });
  }
  revalidatePath("/retainers");
}

export async function draftOutreach(formData: FormData) {
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const brief = (formData.get("brief") as string) || null;
  const message = await draftRetainerOutreach({ name, brief });
  await createOutreachDraft({ kind: "retainer", retainerProspectId: id, message });
  revalidatePath("/retainers");
}

export async function sendOutreach(formData: FormData) {
  const outreachId = formData.get("outreach_id") as string;
  const prospectId = formData.get("prospect_id") as string;
  await markOutreachSent(outreachId);
  await markRetainerContacted(prospectId);
  revalidatePath("/retainers");
}
