"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getModuleHealthFor, saveDiagnosis } from "@/lib/db";
import { diagnoseModule } from "@/lib/health-diagnose";
import type { HealthModule } from "@/lib/types";

export async function runDiagnose(formData: FormData) {
  const moduleName = formData.get("module") as HealthModule;
  const returnPath = (formData.get("return_path") as string) || "/";
  const health = await getModuleHealthFor(moduleName);
  if (!health) return;
  const diagnosis = await diagnoseModule(moduleName, health.status, health.detail);
  await saveDiagnosis(moduleName, JSON.stringify(diagnosis));
  revalidatePath(returnPath);
}

async function selfUrl(path: string): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  const protocol = host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}${path}`;
}

export async function tryResendDigest(formData: FormData) {
  const returnPath = (formData.get("return_path") as string) || "/";
  const secret = process.env.DIGEST_SECRET;
  if (secret) {
    try {
      await fetch(await selfUrl("/api/digest"), { method: "POST", headers: { "x-digest-secret": secret } });
    } catch {
      // logged status will reflect reality on next health check regardless
    }
  }
  revalidatePath(returnPath);
}

export async function tryRecheckStock(formData: FormData) {
  const returnPath = (formData.get("return_path") as string) || "/";
  const secret = process.env.DIGEST_SECRET;
  if (secret) {
    try {
      await fetch(await selfUrl("/api/ssf/stock-feed-guard"), { method: "POST", headers: { "x-digest-secret": secret } });
    } catch {
      // logged status will reflect reality on next health check regardless
    }
  }
  revalidatePath(returnPath);
}
