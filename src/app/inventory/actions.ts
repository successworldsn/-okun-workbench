"use server";

import { revalidatePath } from "next/cache";
import { updateInventoryStatus } from "@/lib/db";
import type { InventoryLocation, InventoryStatus } from "@/lib/types";

export async function advanceStatus(formData: FormData) {
  const id = formData.get("id") as string;
  const status = formData.get("status") as InventoryStatus;
  const salePriceRaw = formData.get("sale_price") as string | null;
  const salePrice = salePriceRaw ? Number(salePriceRaw) : undefined;
  await updateInventoryStatus(id, status, salePrice !== undefined && Number.isFinite(salePrice) ? { salePrice } : {});
  revalidatePath("/inventory");
  revalidatePath("/");
  revalidatePath("/ledger");
}

export async function moveLocation(formData: FormData) {
  const id = formData.get("id") as string;
  const location = formData.get("location") as InventoryLocation;
  const status = formData.get("current_status") as InventoryStatus;
  await updateInventoryStatus(id, status, { location });
  revalidatePath("/inventory");
}
