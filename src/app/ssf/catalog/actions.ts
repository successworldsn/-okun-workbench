"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { upsertSsfCatalogRows } from "@/lib/db";
import { parseSsfCatalogCsv } from "@/lib/ssf-catalog-csv";

export async function uploadCatalogCsv(formData: FormData): Promise<void> {
  const file = formData.get("csv") as File | null;
  if (!file || file.size === 0) {
    redirect("/ssf/catalog?status=error&message=" + encodeURIComponent("Choose a CSV file first."));
  }

  const text = await file!.text();
  const { rows, errors } = parseSsfCatalogCsv(text);
  if (rows.length === 0) {
    redirect("/ssf/catalog?status=error&message=" + encodeURIComponent(errors.join("; ") || "No valid rows found."));
  }

  const { upserted } = await upsertSsfCatalogRows(rows);
  revalidatePath("/ssf/catalog");
  revalidatePath("/ssf/scan");

  const suffix = errors.length ? ` (${errors.length} row(s) skipped: ${errors.join("; ")})` : "";
  redirect("/ssf/catalog?status=ok&message=" + encodeURIComponent(`Upserted ${upserted} SKU(s).${suffix}`));
}
