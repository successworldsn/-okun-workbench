/**
 * 7am digest. Phase A + Phase B lines are live; Phase C (retainer
 * follow-ups) is still TODO-marked so it doesn't get silently forgotten.
 */
import { getTodayScreen } from "./today";
import { getSsfGates } from "./db";
import { usd } from "@/components/ui";

export async function buildDigestText(): Promise<string> {
  const [t, gates] = await Promise.all([getTodayScreen(), getSsfGates()]);
  const lines: string[] = [];
  lines.push(`OKUN Workbench — ${new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`);
  lines.push(`Deployable: ${usd(t.cashBar.deployable)}`);

  const closingSoon = t.nextActions.filter((a) => a.kind === "auction_closing");
  lines.push(`Auctions closing today: ${closingSoon.length}`);
  for (const a of closingSoon.slice(0, 3)) lines.push(`  · ${a.label} — ${a.detail}`);

  const unshipped = t.nextActions.filter((a) => a.kind === "sold_unshipped");
  if (unshipped.length) lines.push(`Sold, unshipped: ${unshipped.length}`);

  const aging = t.nextActions.filter((a) => a.kind === "aging_inventory");
  if (aging.length) lines.push(`Aging inventory (45d+): ${aging.length}`);

  const ssfOrdersPending = t.nextActions.filter((a) => a.kind === "ssf_order_pending");
  if (ssfOrdersPending.length) lines.push(`SSF orders awaiting placement: ${ssfOrdersPending.length} (${usd(t.cashBar.pendingSsfOrders)} committed)`);

  const overnightAutoEnds = t.nextActions.filter((a) => a.kind === "ssf_out_of_stock");
  if (overnightAutoEnds.length) lines.push(`Stock-Feed Guard auto-ended overnight: ${overnightAutoEnds.length}`);

  lines.push(`SSF autonomy tier: ${gates.tier} (${gates.active_listing_cap} cap, ${gates.approval_mode.replace("_", " ")})`);
  if (gates.locked_until && new Date(gates.locked_until) > new Date()) {
    lines.push(`  ⚠ locked until ${new Date(gates.locked_until).toLocaleDateString()} — ${gates.lock_reason}`);
  }

  if (t.dealCountdown) lines.push(`${t.dealCountdown.name} deal: ${t.dealCountdown.daysLeft}d left`);

  // TODO Phase C: prospects waiting on follow-up (retainer pipeline UI)

  return lines.join("\n");
}
