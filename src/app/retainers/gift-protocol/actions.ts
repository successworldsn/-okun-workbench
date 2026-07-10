"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getGiftProspects,
  getActiveGiftProspectCount,
  createGiftProspect,
  updateGiftProspectDossier,
  updateSiteBrief,
  updateFlyerCopy,
  selectFlyerCopy,
  updateGiftDelivery,
  markGiftFollowedUp,
} from "@/lib/db";
import { canCreateGiftProspect } from "@/lib/gift-protocol";
import { generateSiteBrief, generateFlyerCopy } from "@/lib/gift-dossier-draft";
import type { GiftDeliveryStatus, DossierConfidence } from "@/lib/types";

export async function addProspect(formData: FormData) {
  const count = await getActiveGiftProspectCount();
  const check = canCreateGiftProspect(count);
  if (!check.allowed) {
    redirect("/retainers/gift-protocol?status=error&message=" + encodeURIComponent(check.reason ?? "At cap"));
  }
  const businessName = formData.get("business_name") as string;
  if (!businessName?.trim()) return;
  await createGiftProspect({
    businessName: businessName.trim(),
    category: (formData.get("category") as string) || undefined,
    ownerName: (formData.get("owner_name") as string) || undefined,
    ownerConfidence: (formData.get("owner_confidence") as DossierConfidence) || undefined,
    address: (formData.get("address") as string) || undefined,
    phone: (formData.get("phone") as string) || undefined,
    websiteCurrent: (formData.get("website_current") as string) || undefined,
  });
  revalidatePath("/retainers/gift-protocol");
}

export async function approveFact(formData: FormData) {
  const id = formData.get("id") as string;
  const factIndex = Number(formData.get("fact_index"));
  await updateGiftProspectDossier(id, { approveFactIndex: factIndex });
  revalidatePath("/retainers/gift-protocol");
}

export async function generateBrief(formData: FormData) {
  const id = formData.get("id") as string;
  const prospects = await getGiftProspects();
  const prospect = prospects.find((p) => p.id === id);
  if (!prospect) return;
  const brief = await generateSiteBrief(prospect);
  await updateSiteBrief(id, brief);
  revalidatePath("/retainers/gift-protocol");
}

export async function generateFlyer(formData: FormData) {
  const id = formData.get("id") as string;
  const prospects = await getGiftProspects();
  const prospect = prospects.find((p) => p.id === id);
  if (!prospect) return;
  const options = await generateFlyerCopy(prospect);
  await updateFlyerCopy(id, options);
  revalidatePath("/retainers/gift-protocol");
}

export async function selectFlyer(formData: FormData) {
  const id = formData.get("id") as string;
  const selected = formData.get("selected") as string;
  await selectFlyerCopy(id, selected);
  revalidatePath("/retainers/gift-protocol");
}

export async function toggleChecklistItem(formData: FormData) {
  const prospectId = formData.get("prospect_id") as string;
  const index = Number(formData.get("index"));
  await updateGiftDelivery(prospectId, { toggleChecklistIndex: index });
  revalidatePath("/retainers/gift-protocol");
}

export async function updateDeliveryStatus(formData: FormData) {
  const prospectId = formData.get("prospect_id") as string;
  const status = formData.get("status") as GiftDeliveryStatus;
  await updateGiftDelivery(prospectId, { status });
  revalidatePath("/retainers/gift-protocol");
  revalidatePath("/");
}

export async function submitTracking(formData: FormData) {
  const prospectId = formData.get("prospect_id") as string;
  const trackingNumber = (formData.get("tracking_number") as string) || undefined;
  const shipDate = (formData.get("ship_date") as string) || undefined;
  await updateGiftDelivery(prospectId, { trackingNumber, shipDate });
  revalidatePath("/retainers/gift-protocol");
}

export async function submitSigner(formData: FormData) {
  const prospectId = formData.get("prospect_id") as string;
  const signerName = formData.get("signer_name") as string;
  await updateGiftDelivery(prospectId, { signerName, status: "delivered_signed" });
  revalidatePath("/retainers/gift-protocol");
  revalidatePath("/");
}

export async function followedUp(formData: FormData) {
  const prospectId = formData.get("prospect_id") as string;
  await markGiftFollowedUp(prospectId);
  revalidatePath("/retainers/gift-protocol");
  revalidatePath("/");
}
