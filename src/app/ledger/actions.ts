"use server";

import { revalidatePath } from "next/cache";
import { addExpense } from "@/lib/db";

export async function submitExpense(formData: FormData) {
  const amount = Number(formData.get("amount"));
  const category = (formData.get("category") as string) || "misc";
  const note = (formData.get("note") as string) || undefined;
  if (!Number.isFinite(amount) || amount <= 0) return;
  await addExpense({ channel: "salvage", amount, category, note });
  revalidatePath("/ledger");
  revalidatePath("/");
}
