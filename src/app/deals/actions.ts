"use server";

import { revalidatePath } from "next/cache";
import { getOpenDeals, updateDealChecklist, createOutreachDraft, markOutreachSent } from "@/lib/db";
import { draftBuyerBlast } from "@/lib/outreach-draft";

export async function toggleChecklistItem(formData: FormData) {
  const dealId = formData.get("deal_id") as string;
  const index = Number(formData.get("index"));
  const deals = await getOpenDeals();
  const deal = deals.find((d) => d.id === dealId);
  if (!deal) return;
  const checklist = deal.checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
  await updateDealChecklist(dealId, checklist);
  revalidatePath("/deals");
}

export async function draftBlast(formData: FormData) {
  const dealId = formData.get("deal_id") as string;
  const dealName = formData.get("deal_name") as string;
  const details = (formData.get("details") as string) || "";
  const message = await draftBuyerBlast({ name: dealName }, details);
  await createOutreachDraft({ kind: "deal_buyer", dealId, message });
  revalidatePath("/deals");
}

export async function sendBlast(formData: FormData) {
  const outreachId = formData.get("outreach_id") as string;
  await markOutreachSent(outreachId);
  revalidatePath("/deals");
}
