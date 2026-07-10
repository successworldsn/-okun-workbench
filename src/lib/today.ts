/**
 * Today Screen aggregation.
 *
 * Cash Bar is computed from the ledger, not a synced bank balance — there's no
 * bank integration yet, so it's a net-cash-flow proxy, labeled as such in the UI
 * rather than presented as a real balance.
 */
import { getBuyQueue, getInventory, getLedger, getOpenDeals, getRetainerProspects, getSsfOrders, getSsfListings, getGiftProspects, getGiftDeliveries } from "./db";
import type { BuyQueueItem, InventoryItem } from "./types";

export interface NextAction {
  kind: "auction_closing" | "ssf_order_pending" | "gift_protocol_followup" | "sold_unshipped" | "ssf_out_of_stock" | "aging_inventory" | "prospect_followup" | "deal_task";
  label: string;
  detail: string;
  href: string;
  urgent: boolean;
}

export interface TodayScreen {
  cashBar: { netCashFlow: number; pendingBuys: number; pendingSsfOrders: number; deployable: number };
  nextActions: NextAction[];
  dealCountdown: { name: string; daysLeft: number; red: boolean } | null;
  retainerCounter: { signed: number; target: number };
  scoreboard: { bought: number; listed: number; sold: number; net: number };
}

const isToday = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

const ageDays = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const hoursUntil = (iso: string) => (new Date(iso).getTime() - Date.now()) / 3_600_000;

export async function getTodayScreen(): Promise<TodayScreen> {
  const [buyQueue, inventory, ledger, deals, retainers, ssfOrders, ssfListings, giftProspects, giftDeliveries] = await Promise.all([
    getBuyQueue(),
    getInventory(),
    getLedger(500),
    getOpenDeals(),
    getRetainerProspects(),
    getSsfOrders(),
    getSsfListings("ended"),
    getGiftProspects(),
    getGiftDeliveries(),
  ]);

  // ─── Cash bar ───────────────────────────────────────────────────────────
  const netCashFlow = ledger.reduce((sum, e) => sum + e.amount - e.fees - e.shipping, 0);
  const pendingBuys = buyQueue
    .filter((b) => b.status === "pending")
    .reduce((sum, b) => sum + (b.suggested_max_bid ?? 0), 0);
  const ordersAwaitingPlacement = ssfOrders.filter((o) => !o.fulfillment_mode);
  const pendingSsfOrders = ordersAwaitingPlacement.reduce((sum, o) => sum + (o.our_cost ?? 0), 0);
  const deployable = netCashFlow - pendingBuys - pendingSsfOrders;

  // ─── Next actions (hard-ranked, max 5) ─────────────────────────────────
  const actions: NextAction[] = [];

  for (const b of buyQueue) {
    if (b.status !== "pending") continue;
    const h = hoursUntil(b.auction_close_at);
    if (h <= 4 && h > -1) {
      actions.push({
        kind: "auction_closing",
        label: `${b.vehicle_year ?? ""} ${b.vehicle_make ?? ""} ${b.vehicle_model ?? ""}`.trim() || "Auction closing",
        detail: `${b.auction_source ?? "Auction"} closes in ${Math.max(0, h).toFixed(1)}h — max bid $${(b.suggested_max_bid ?? 0).toLocaleString()}`,
        href: "/buy-queue",
        urgent: true,
      });
    }
  }

  for (const o of ordersAwaitingPlacement) {
    actions.push({
      kind: "ssf_order_pending",
      label: `${o.buyer_name ?? "Buyer"} — ${o.ebay_order_id ?? "order"}`,
      detail: `SSF sale awaiting order placement — cost $${(o.our_cost ?? 0).toLocaleString()}`,
      href: "/ssf/orders",
      urgent: false,
    });
  }

  const giftProspectsById = new Map(giftProspects.map((p) => [p.id, p]));
  const giftFollowups = giftDeliveries.filter((d) => d.delivery_status === "delivered_signed" && !d.followed_up);
  for (const d of giftFollowups) {
    const prospect = giftProspectsById.get(d.gift_protocol_prospect_id);
    actions.push({
      kind: "gift_protocol_followup",
      label: prospect?.business_name ?? "Gift Protocol prospect",
      detail: `Signed for${d.signer_name ? ` by ${d.signer_name}` : ""} — call/visit window open${d.follow_up_date ? ` (by ${d.follow_up_date})` : ""}`,
      href: "/retainers/gift-protocol",
      urgent: true,
    });
  }

  const recentlyEndedForStock = ssfListings.filter((l) => l.end_reason?.startsWith("Stock gone") && l.ended_at && ageDays(l.ended_at) < 1);
  for (const l of recentlyEndedForStock) {
    actions.push({
      kind: "ssf_out_of_stock",
      label: l.title,
      detail: "Auto-ended overnight — out of stock (Stock-Feed Guard)",
      href: "/ssf/listings",
      urgent: false,
    });
  }

  const soldUnshipped = inventory.filter((i) => i.status === "sold");
  for (const i of soldUnshipped) {
    actions.push({
      kind: "sold_unshipped",
      label: i.description,
      detail: `Sold, not yet shipped — $${(i.sale_price ?? 0).toLocaleString()}`,
      href: "/inventory",
      urgent: false,
    });
  }

  const aging = inventory.filter((i) => !["sold", "shipped", "returned"].includes(i.status) && ageDays(i.acquired_at) > 45);
  for (const i of aging) {
    actions.push({
      kind: "aging_inventory",
      label: i.description,
      detail: `${ageDays(i.acquired_at)} days in inventory — ${i.status.replace("_", " ")}`,
      href: "/inventory",
      urgent: false,
    });
  }

  const followups = retainers.filter((r) => ["contacted", "meeting", "proposal"].includes(r.stage));
  for (const r of followups) {
    actions.push({
      kind: "prospect_followup",
      label: r.name,
      detail: `Retainer prospect — ${r.stage}, needs follow-up`,
      href: "/retainers",
      urgent: false,
    });
  }

  // hard rank per Module 0 spec, gift_protocol_followup inserted right after ssf_order_pending —
  // "the actual conversion trigger," time-sensitive same as the other early-rank items
  const rank: Record<NextAction["kind"], number> = {
    auction_closing: 0,
    ssf_order_pending: 1,
    gift_protocol_followup: 2,
    sold_unshipped: 3,
    ssf_out_of_stock: 4,
    aging_inventory: 5,
    prospect_followup: 6,
    deal_task: 7,
  };
  actions.sort((a, b) => rank[a.kind] - rank[b.kind]);
  const nextActions = actions.slice(0, 5);

  // ─── Deal countdown ─────────────────────────────────────────────────────
  const nextDeal = [...deals].sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
  const dealCountdown = nextDeal
    ? {
        name: nextDeal.name,
        daysLeft: Math.ceil((new Date(nextDeal.deadline).getTime() - Date.now()) / 86_400_000),
        red: Math.ceil((new Date(nextDeal.deadline).getTime() - Date.now()) / 86_400_000) < 7,
      }
    : null;

  // ─── Retainer counter ───────────────────────────────────────────────────
  const signed = retainers.filter((r) => r.stage === "signed").length;

  // ─── Scoreboard ─────────────────────────────────────────────────────────
  const bought = buyQueue.filter((b) => b.status === "bought" && isToday(b.decided_at ?? b.created_at)).length;
  const listed = inventory.filter((i: InventoryItem) => isToday(i.listed_at)).length;
  const sold = inventory.filter((i: InventoryItem) => isToday(i.sold_at)).length;
  const net = ledger.filter((e) => isToday(e.created_at)).reduce((s, e) => s + e.amount - e.fees - e.shipping, 0);

  return {
    cashBar: { netCashFlow, pendingBuys, pendingSsfOrders, deployable },
    nextActions,
    dealCountdown,
    retainerCounter: { signed, target: 5 },
    scoreboard: { bought, listed, sold, net },
  };
}

export type { BuyQueueItem };
