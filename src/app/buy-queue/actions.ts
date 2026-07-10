"use server";

import { revalidatePath } from "next/cache";
import { decideBuyQueueItem } from "@/lib/db";

export async function markBought(formData: FormData) {
  const id = formData.get("id") as string;
  const price = Number(formData.get("bought_price"));
  await decideBuyQueueItem(id, "bought", { boughtPrice: Number.isFinite(price) ? price : 0 });
  revalidatePath("/buy-queue");
  revalidatePath("/");
  revalidatePath("/inventory");
}

export async function markPassed(formData: FormData) {
  const id = formData.get("id") as string;
  const reason = (formData.get("pass_reason") as string) || "no reason given";
  await decideBuyQueueItem(id, "passed", { passReason: reason });
  revalidatePath("/buy-queue");
  revalidatePath("/");
}
