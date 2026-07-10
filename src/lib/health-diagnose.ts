/**
 * Diagnose button (Part 2 of the v3.1 spec). Claude reads the real health
 * detail already computed in lib/system-health.ts + db.ts — it never invents
 * a diagnosis from nothing, it explains what the real check already found.
 * Template fallback when Claude isn't configured is just the raw detail
 * string, so the feature still works without a key.
 */
import { complete, CLAUDE_CONFIGURED } from "./claude";
import type { HealthModule, HealthStatus } from "./types";

export type SafeAction = "resend_digest" | "recheck_stock" | null;

export interface Diagnosis {
  text: string;
  safeAction: SafeAction;
  copyFixPrompt: string;
}

const SAFE_ACTION_BY_MODULE: Partial<Record<HealthModule, SafeAction>> = {
  digest: "resend_digest",
  stock_feed_guard: "recheck_stock",
};

const SYSTEM_PROMPT = `You are a plain-English diagnostic assistant for an internal ops tool. Given a module name, its status (active/attention/not_set_up/error), and a real detail string already computed by the system, write ONE or TWO short sentences a non-technical operator would understand — what's happening and roughly why. Do not invent facts beyond what's given. Do not use jargon. Output ONLY the diagnosis text, nothing else.`;

export async function diagnoseModule(module: HealthModule, status: HealthStatus, detail: string): Promise<Diagnosis> {
  const safeAction = status === "active" ? null : (SAFE_ACTION_BY_MODULE[module] ?? null);
  const copyFixPrompt = buildCopyFixPrompt(module, status, detail);

  if (!CLAUDE_CONFIGURED) {
    return { text: detail, safeAction, copyFixPrompt };
  }

  const result = await complete(SYSTEM_PROMPT, `Module: ${module}\nStatus: ${status}\nDetail: ${detail}`);
  return { text: result.ok && result.text ? result.text.trim() : detail, safeAction, copyFixPrompt };
}

function buildCopyFixPrompt(module: HealthModule, status: HealthStatus, detail: string): string {
  return `OKUN Workbench — ${module} module is showing "${status}".\nDetail: ${detail}\n\nInvestigate why and fix it. Check the relevant lib/ file and .env.local for this module (see README's env var table), confirm the real integration is configured, and re-verify the status pill turns active after the fix — don't just silence the warning.`;
}
