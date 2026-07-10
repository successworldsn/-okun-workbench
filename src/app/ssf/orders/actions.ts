"use server";

import { revalidatePath } from "next/cache";
import { placeSsfOrder, addTrackingToSsfOrder } from "@/lib/db";
import type { SsfOrderFulfillment } from "@/lib/types";

export async function submitFulfillmentMode(formData: FormData) {
  const id = formData.get("id") as string;
  const mode = formData.get("fulfillment_mode") as SsfOrderFulfillment;
  await placeSsfOrder(id, mode);
  revalidatePath("/ssf/orders");
  revalidatePath("/");
}

export async function submitTracking(formData: FormData) {
  const id = formData.get("id") as string;
  const tracking = (formData.get("tracking_number") as string)?.trim();
  if (!tracking) return;
  await addTrackingToSsfOrder(id, tracking);
  revalidatePath("/ssf/orders");
  revalidatePath("/ledger");
  revalidatePath("/");
}
