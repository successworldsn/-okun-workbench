import { getModuleHealthFor, getLastDiagnosis } from "@/lib/db";
import { StatusPill, Card } from "./ui";
import { CopyButton } from "./CopyButton";
import { runDiagnose, tryResendDigest, tryRecheckStock } from "@/app/_health/actions";
import type { HealthModule } from "@/lib/types";

const MODULE_LABEL: Record<HealthModule, string> = {
  salvage: "Salvage",
  ssf: "SSF",
  stock_feed_guard: "Stock-Feed Guard",
  digest: "Digest",
  retainers: "Retainers",
  gift_protocol: "Gift Protocol",
  facebook: "Facebook",
};

const SAFE_ACTION_LABEL: Record<string, string> = {
  resend_digest: "Try It — resend digest",
  recheck_stock: "Try It — recheck stock",
};

/** Every module tab gets a status pill at the top, driven by real checks — never hardcoded green. */
export async function HealthPanel({ module, returnPath }: { module: HealthModule; returnPath: string }) {
  const health = await getModuleHealthFor(module);
  if (!health) return null;

  const diagnosis = health.status !== "active" ? await getLastDiagnosis(module) : null;

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <StatusPill status={health.status} label={`${MODULE_LABEL[module]} — ${health.status === "not_set_up" ? "Not set up" : health.status === "attention" ? "Needs attention" : health.status === "error" ? "Error" : "Active"}`} />
        {health.status !== "active" && (
          <form action={runDiagnose}>
            <input type="hidden" name="module" value={module} />
            <input type="hidden" name="return_path" value={returnPath} />
            <button type="submit" className="text-[11px] font-semibold text-cyan underline">
              Diagnose
            </button>
          </form>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted">{health.detail}</p>

      {diagnosis && (
        <Card className="mt-2 border-cyan/20">
          <p className="text-xs text-ash">{diagnosis.text}</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {diagnosis.safeAction === "resend_digest" && (
              <form action={tryResendDigest}>
                <input type="hidden" name="return_path" value={returnPath} />
                <button type="submit" className="w-full rounded-control bg-cyan/15 px-4 py-2 text-xs font-semibold text-cyan hover:bg-cyan/25">
                  {SAFE_ACTION_LABEL.resend_digest}
                </button>
              </form>
            )}
            {diagnosis.safeAction === "recheck_stock" && (
              <form action={tryRecheckStock}>
                <input type="hidden" name="return_path" value={returnPath} />
                <button type="submit" className="w-full rounded-control bg-cyan/15 px-4 py-2 text-xs font-semibold text-cyan hover:bg-cyan/25">
                  {SAFE_ACTION_LABEL.recheck_stock}
                </button>
              </form>
            )}
            <CopyButton text={diagnosis.copyFixPrompt} />
          </div>
        </Card>
      )}
    </div>
  );
}
