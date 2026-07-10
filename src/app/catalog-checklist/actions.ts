"use server";

import { revalidatePath } from "next/cache";
import { toggleCatalogChecklistItem } from "@/lib/db";

export async function toggleItem(formData: FormData) {
  const id = formData.get("id") as string;
  const currentlyDone = formData.get("done") === "true";
  await toggleCatalogChecklistItem(id, !currentlyDone);
  revalidatePath("/catalog-checklist");
}
