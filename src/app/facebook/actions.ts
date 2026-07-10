"use server";

import { revalidatePath } from "next/cache";
import { getInventory, createFbListingDraft, addFbInquiry } from "@/lib/db";
import { draftFbListing } from "@/lib/fb-listing-draft";

export async function draftListing(formData: FormData) {
  const inventoryId = formData.get("inventory_id") as string;
  const inventory = await getInventory();
  const item = inventory.find((i) => i.id === inventoryId);
  if (!item) return;

  const draft = await draftFbListing(item, item.list_price ?? null);
  await createFbListingDraft({
    inventoryId: item.id,
    title: draft.title,
    price: item.list_price ?? null,
    description: draft.description,
    pickupTerms: draft.pickupTerms,
  });
  revalidatePath("/facebook");
}

export async function logInquiry(formData: FormData) {
  const note = (formData.get("note") as string) || undefined;
  await addFbInquiry(note);
  revalidatePath("/facebook");
}
