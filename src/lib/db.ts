/**
 * Workbench data layer.
 *
 * Server-only. Every read/write goes through here so DEMO_MODE (no Supabase
 * creds) renders the whole app off deterministic in-memory demo data, matching
 * the okun-capital dashboard convention. Real writes use the service-role
 * client from lib/supabase.ts — never exposed to the browser.
 */
import { DEMO_MODE, db } from "./supabase";
import type {
  AppUser,
  AppUserCredential,
  BuyQueueItem,
  BuyQueueStatus,
  Deal,
  Expense,
  InventoryItem,
  InventoryLocation,
  InventoryStatus,
  LedgerEntry,
  RetainerProspect,
  SsfGates,
  SsfCatalogItem,
  SsfListing,
  SsfListingStatus,
  SsfOrder,
  SsfOrderFulfillment,
  ChecklistItem,
  OutreachKind,
  OutreachLogEntry,
  FbInquiry,
  FbListingDraft,
  CatalogChecklistItem,
  GiftProtocolProspect,
  GiftProtocolDelivery,
  GiftDeliveryStatus,
  DossierFact,
  SiteBrief,
  SystemHealthEvent,
  ExternalBlocker,
  ModuleHealth,
} from "./types";
import { getSsfConfig, type SsfConfig } from "./ssf-config";
import { addBusinessDays, isConversionTrigger } from "./gift-protocol";
import { combineHealth, checkRecency, checkCredential, checkLastEvent, checkCatalogFreshness } from "./system-health";
import { EBAY_CONFIGURED } from "./ebay";
import { TWILIO_CONFIGURED } from "./twilio";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ─── Demo data ──────────────────────────────────────────────────────────────

const DEMO_USERS: AppUser[] = [
  { id: "u-ej", name: "EJ", role: "ej", access_scope: "full", username: "ej" },
  { id: "u-usman", name: "Usman", role: "usman", access_scope: "parts_only", username: "usman" },
];

const now = () => new Date();
const hoursFromNow = (h: number) => new Date(now().getTime() + h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(now().getTime() - d * 86_400_000).toISOString();

const DEMO_BUY_QUEUE: BuyQueueItem[] = [
  {
    id: "bq-1", vehicle_year: 2013, vehicle_make: "BMW", vehicle_model: "3-Series", vehicle_trim: "335i",
    lot_number: "44821990", auction_source: "Copart", auction_close_at: hoursFromNow(2.5),
    scanner_score: 82, scanner_score_version: "v1", suggested_max_bid: 1450,
    component_breakdown: { engine: 900, transmission: 400, panels: 150 },
    status: "pending", pass_reason: null, bought_price: null, decided_at: null, created_at: daysAgo(0.2),
  },
  {
    id: "bq-2", vehicle_year: 2010, vehicle_make: "Land Rover", vehicle_model: "Range Rover Sport", vehicle_trim: "HSE",
    lot_number: "39102771", auction_source: "IAA", auction_close_at: hoursFromNow(9),
    scanner_score: 91, scanner_score_version: "v1", suggested_max_bid: 2200,
    component_breakdown: { engine: 1200, transmission: 700, panels: 300 },
    status: "pending", pass_reason: null, bought_price: null, decided_at: null, created_at: daysAgo(0.4),
  },
  {
    id: "bq-3", vehicle_year: 2015, vehicle_make: "Toyota", vehicle_model: "Camry", vehicle_trim: "LE",
    lot_number: "51002233", auction_source: "Copart", auction_close_at: hoursFromNow(30),
    scanner_score: 38, scanner_score_version: "v1", suggested_max_bid: 300,
    component_breakdown: { engine: 200, transmission: 100 },
    status: "pending", pass_reason: null, bought_price: null, decided_at: null, created_at: daysAgo(1),
  },
];

const DEMO_INVENTORY: InventoryItem[] = [
  {
    id: "inv-1", channel: "salvage", buy_queue_id: null, description: "BMW N54 3.0L twin-turbo engine",
    part_number: "N54B30", vehicle_source: "2010 BMW 335i", status: "listed", location: "shop", local_only: false,
    assignee: "u-usman", acquired_at: daysAgo(12), listed_at: daysAgo(5), sold_at: null, shipped_at: null,
    buy_price: 850, list_price: 2400, sale_price: null,
  },
  {
    id: "inv-2", channel: "salvage", buy_queue_id: null, description: "Jaguar XF rear subframe, complete",
    part_number: null, vehicle_source: "2012 Jaguar XF", status: "at_shop", location: "shop", local_only: true,
    assignee: "u-ej", acquired_at: daysAgo(52), listed_at: null, sold_at: null, shipped_at: null,
    buy_price: 220, list_price: null, sale_price: null,
  },
  {
    id: "inv-3", channel: "salvage", buy_queue_id: null, description: "Volvo XC90 8-speed transmission",
    part_number: "TF-80SC", vehicle_source: "2016 Volvo XC90", status: "sold", location: "transit", local_only: false,
    assignee: "u-usman", acquired_at: daysAgo(20), listed_at: daysAgo(15), sold_at: daysAgo(1), shipped_at: null,
    buy_price: 400, list_price: 1350, sale_price: 1300,
  },
];

const DEMO_LEDGER: LedgerEntry[] = [
  { id: "l-1", channel: "salvage", entry_type: "buy", inventory_id: "inv-1", amount: -850, fees: 0, shipping: 0, net_margin: null, days_to_sell: null, scanner_score: 82, scanner_score_version: "v1", refund_amount: null, return_reason: null, note: null, created_at: daysAgo(12) },
  { id: "l-2", channel: "salvage", entry_type: "sale", inventory_id: "inv-3", amount: 1300, fees: 177, shipping: 90, net_margin: 633, days_to_sell: 15, scanner_score: null, scanner_score_version: null, refund_amount: null, return_reason: null, note: null, created_at: daysAgo(1) },
  { id: "l-3", channel: "salvage", entry_type: "expense", inventory_id: null, amount: -65, fees: 0, shipping: 0, net_margin: null, days_to_sell: null, scanner_score: null, scanner_score_version: null, refund_amount: null, return_reason: null, note: "Shop supplies", created_at: daysAgo(2) },
];

const DEMO_EXPENSES: Expense[] = [
  { id: "e-1", channel: "salvage", amount: 65, category: "Shop supplies", note: null, created_at: daysAgo(2) },
];

const DEMO_RETAINERS: RetainerProspect[] = [
  {
    id: "r-1", name: "Peachtree Auto Group", stage: "proposal", suggested_offer: "$1,200/mo parts-sourcing retainer",
    brief: "12-bay independent shop, 3 locations metro Atlanta. Owner mentioned parts delays as a recurring pain point in a recent review reply.",
    phone: "+14045550188", website: "https://peachtreeautogroup.example.com", last_contacted_at: daysAgo(4), created_at: daysAgo(18),
  },
  {
    id: "r-2", name: "Southside Fleet Services", stage: "signed", suggested_offer: "$2,000/mo fleet parts retainer",
    brief: "18-vehicle commercial fleet, in-house mechanic. Signed after two follow-ups.", phone: "+14045550199", website: null,
    last_contacted_at: daysAgo(30), created_at: daysAgo(60),
  },
  {
    id: "r-3", name: "Midtown Import Specialists", stage: "target", suggested_offer: null, brief: null,
    phone: null, website: "https://midtownimports.example.com", last_contacted_at: null, created_at: daysAgo(1),
  },
];

const DEMO_DEALS: Deal[] = [
  {
    id: "d-1", name: "Judylyn", deadline: hoursFromNow(96).slice(0, 10), status: "open",
    checklist: [
      { label: "Contract signed", done: true },
      { label: "Title/deed verified", done: true },
      { label: "Buyer list matched", done: false },
      { label: "Buyer briefing sent", done: false },
      { label: "EMD collected", done: false },
      { label: "Closing scheduled", done: false },
    ],
  },
];

const DEMO_GATES: SsfGates = { tier: 0, active_listing_cap: 10, approval_mode: "human", locked_until: null, lock_reason: null };

// ─── Users ──────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<AppUser[]> {
  if (DEMO_MODE) return DEMO_USERS;
  const { data, error } = await db().from("app_users").select("id,name,role,access_scope,username");
  if (error) throw error;
  return data as AppUser[];
}

/** Includes password_hash — only ever called from the login action, never rendered. */
export async function getUserCredentialByUsername(username: string): Promise<AppUserCredential | null> {
  if (DEMO_MODE) return null; // no real credentials exist for demo fixture users
  const { data, error } = await db().from("app_users").select("id,name,role,access_scope,username,password_hash").eq("username", username).maybeSingle();
  if (error) throw error;
  return data as AppUserCredential | null;
}

// ─── Buy queue ──────────────────────────────────────────────────────────────

export async function getBuyQueue(): Promise<BuyQueueItem[]> {
  if (DEMO_MODE) return [...DEMO_BUY_QUEUE].sort((a, b) => a.auction_close_at.localeCompare(b.auction_close_at));
  const { data, error } = await db()
    .from("buy_queue")
    .select("*")
    .order("auction_close_at", { ascending: true });
  if (error) throw error;
  return data as BuyQueueItem[];
}

export async function decideBuyQueueItem(
  id: string,
  decision: BuyQueueStatus,
  opts: { boughtPrice?: number; passReason?: string; decidedBy?: string }
): Promise<void> {
  if (DEMO_MODE) {
    const item = DEMO_BUY_QUEUE.find((b) => b.id === id);
    if (item) {
      item.status = decision;
      item.bought_price = opts.boughtPrice ?? null;
      item.pass_reason = opts.passReason ?? null;
    }
    return;
  }
  const { error } = await db()
    .from("buy_queue")
    .update({
      status: decision,
      bought_price: opts.boughtPrice ?? null,
      pass_reason: opts.passReason ?? null,
      decided_by: opts.decidedBy ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  if (decision === "bought") {
    const { data: item } = await db().from("buy_queue").select("*").eq("id", id).single();
    if (item) {
      const { data: inv, error: invErr } = await db()
        .from("inventory")
        .insert({
          channel: "salvage",
          buy_queue_id: id,
          description: `${item.vehicle_year ?? ""} ${item.vehicle_make ?? ""} ${item.vehicle_model ?? ""}`.trim() || "Salvage vehicle",
          vehicle_source: `${item.vehicle_year ?? ""} ${item.vehicle_make ?? ""} ${item.vehicle_model ?? ""}`.trim(),
          status: "acquired",
          buy_price: opts.boughtPrice ?? null,
        })
        .select()
        .single();
      if (invErr) throw invErr;
      await appendLedger({
        channel: "salvage",
        entry_type: "buy",
        inventory_id: inv.id,
        amount: -(opts.boughtPrice ?? 0),
        scanner_score: item.scanner_score,
        scanner_score_version: item.scanner_score_version,
      });
    }
  }
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export async function getInventory(): Promise<InventoryItem[]> {
  if (DEMO_MODE) return DEMO_INVENTORY;
  const { data, error } = await db().from("inventory").select("*").order("acquired_at", { ascending: false });
  if (error) throw error;
  return data as InventoryItem[];
}

export async function updateInventoryStatus(
  id: string,
  status: InventoryStatus,
  opts: { location?: InventoryLocation; salePrice?: number } = {}
): Promise<void> {
  const timestampField =
    status === "listed" ? "listed_at" : status === "sold" ? "sold_at" : status === "shipped" ? "shipped_at" : null;

  if (DEMO_MODE) {
    const item = DEMO_INVENTORY.find((i) => i.id === id);
    if (item) {
      item.status = status;
      if (opts.location) item.location = opts.location;
      if (opts.salePrice !== undefined) item.sale_price = opts.salePrice;
      if (timestampField) (item as unknown as Record<string, string>)[timestampField] = new Date().toISOString();
    }
    return;
  }

  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (opts.location) patch.location = opts.location;
  if (opts.salePrice !== undefined) patch.sale_price = opts.salePrice;
  if (timestampField) patch[timestampField] = new Date().toISOString();

  const { data: before } = await db().from("inventory").select("*").eq("id", id).single();
  const { error } = await db().from("inventory").update(patch).eq("id", id);
  if (error) throw error;

  if (status === "sold" && before) {
    const salePrice = opts.salePrice ?? 0;
    const buyPrice = before.buy_price ?? 0;
    const daysToSell = before.acquired_at
      ? Math.round((Date.now() - new Date(before.acquired_at).getTime()) / 86_400_000)
      : null;
    await appendLedger({
      channel: before.channel,
      entry_type: "sale",
      inventory_id: id,
      amount: salePrice,
      net_margin: salePrice - buyPrice,
      days_to_sell: daysToSell,
    });
  }
}

// ─── Ledger (append-only) ────────────────────────────────────────────────────

export async function getLedger(limit = 100): Promise<LedgerEntry[]> {
  if (DEMO_MODE) return DEMO_LEDGER;
  const { data, error } = await db().from("ledger").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as LedgerEntry[];
}

export async function appendLedger(entry: {
  channel: string;
  entry_type: string;
  inventory_id?: string | null;
  ssf_order_id?: string | null;
  amount: number;
  fees?: number;
  shipping?: number;
  net_margin?: number | null;
  days_to_sell?: number | null;
  scanner_score?: number | null;
  scanner_score_version?: string | null;
  refund_amount?: number | null;
  return_reason?: string | null;
  note?: string | null;
  created_by?: string | null;
}): Promise<void> {
  if (DEMO_MODE) {
    DEMO_LEDGER.unshift({
      id: `l-${DEMO_LEDGER.length + 1}`,
      channel: entry.channel as LedgerEntry["channel"],
      entry_type: entry.entry_type as LedgerEntry["entry_type"],
      inventory_id: entry.inventory_id ?? null,
      amount: entry.amount,
      fees: entry.fees ?? 0,
      shipping: entry.shipping ?? 0,
      net_margin: entry.net_margin ?? null,
      days_to_sell: entry.days_to_sell ?? null,
      scanner_score: entry.scanner_score ?? null,
      scanner_score_version: entry.scanner_score_version ?? null,
      refund_amount: entry.refund_amount ?? null,
      return_reason: entry.return_reason ?? null,
      note: entry.note ?? null,
      created_at: new Date().toISOString(),
    });
    return;
  }
  const { error } = await db().from("ledger").insert(entry);
  if (error) throw error;
}

// ─── Expenses (two-tap entry) ─────────────────────────────────────────────────

export async function getExpenses(limit = 50): Promise<Expense[]> {
  if (DEMO_MODE) return DEMO_EXPENSES;
  const { data, error } = await db().from("expenses").select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data as Expense[];
}

export async function addExpense(entry: { channel: string; amount: number; category: string; note?: string }): Promise<void> {
  if (DEMO_MODE) {
    DEMO_EXPENSES.unshift({ id: `e-${DEMO_EXPENSES.length + 1}`, channel: entry.channel as Expense["channel"], amount: entry.amount, category: entry.category, note: entry.note ?? null, created_at: new Date().toISOString() });
    await appendLedger({ channel: entry.channel, entry_type: "expense", amount: -entry.amount, note: `${entry.category}${entry.note ? " — " + entry.note : ""}` });
    return;
  }
  const { error } = await db().from("expenses").insert(entry);
  if (error) throw error;
  await appendLedger({ channel: entry.channel, entry_type: "expense", amount: -entry.amount, note: `${entry.category}${entry.note ? " — " + entry.note : ""}` });
}

// ─── Module 3: retainer pipeline ────────────────────────────────────────────

export async function getRetainerProspects(): Promise<RetainerProspect[]> {
  if (DEMO_MODE) return DEMO_RETAINERS;
  const { data, error } = await db().from("retainer_prospects").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as RetainerProspect[];
}

export async function createRetainerProspect(entry: { name: string; website?: string | null; phone?: string | null }): Promise<RetainerProspect> {
  if (DEMO_MODE) {
    const prospect: RetainerProspect = {
      id: `r-${DEMO_RETAINERS.length + 1}`, name: entry.name, stage: "target", suggested_offer: null, brief: null,
      phone: entry.phone ?? null, website: entry.website ?? null, last_contacted_at: null, created_at: new Date().toISOString(),
    };
    DEMO_RETAINERS.unshift(prospect);
    return prospect;
  }
  const { data, error } = await db().from("retainer_prospects").insert({ name: entry.name, website: entry.website ?? null, phone: entry.phone ?? null }).select().single();
  if (error) throw error;
  return data as RetainerProspect;
}

export async function updateRetainerStage(id: string, stage: RetainerProspect["stage"]): Promise<void> {
  if (DEMO_MODE) {
    const r = DEMO_RETAINERS.find((x) => x.id === id);
    if (r) r.stage = stage;
    return;
  }
  const { error } = await db().from("retainer_prospects").update({ stage, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function updateRetainerResearch(id: string, patch: { brief: string; suggestedOffer: string }): Promise<void> {
  if (DEMO_MODE) {
    const r = DEMO_RETAINERS.find((x) => x.id === id);
    if (r) { r.brief = patch.brief; r.suggested_offer = patch.suggestedOffer; }
    return;
  }
  const { error } = await db().from("retainer_prospects").update({ brief: patch.brief, suggested_offer: patch.suggestedOffer, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function markRetainerContacted(id: string): Promise<void> {
  if (DEMO_MODE) {
    const r = DEMO_RETAINERS.find((x) => x.id === id);
    if (r) r.last_contacted_at = new Date().toISOString();
    return;
  }
  const { error } = await db().from("retainer_prospects").update({ last_contacted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ─── Module 3+4: outreach log ───────────────────────────────────────────────

const DEMO_OUTREACH_LOG: OutreachLogEntry[] = [
  {
    id: "out-1", kind: "retainer", retainer_prospect_id: "r-1", deal_id: null, buyer_name: null, channel: "sms",
    message: "Hey — noticed the parts-delay comment on your Google review. We run same-day sourcing for 3 metro shops already, might be worth a 10-minute call.",
    status: "sent", created_at: daysAgo(4), sent_at: daysAgo(4),
  },
];

export async function getOutreachLog(kind?: OutreachKind, targetId?: string): Promise<OutreachLogEntry[]> {
  if (DEMO_MODE) {
    return DEMO_OUTREACH_LOG.filter((o) => (!kind || o.kind === kind) && (!targetId || o.retainer_prospect_id === targetId || o.deal_id === targetId));
  }
  let q = db().from("outreach_log").select("*").order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  if (targetId) q = q.or(`retainer_prospect_id.eq.${targetId},deal_id.eq.${targetId}`);
  const { data, error } = await q;
  if (error) throw error;
  return data as OutreachLogEntry[];
}

export async function createOutreachDraft(entry: {
  kind: OutreachKind;
  retainerProspectId?: string;
  dealId?: string;
  buyerName?: string;
  message: string;
}): Promise<OutreachLogEntry> {
  if (DEMO_MODE) {
    const row: OutreachLogEntry = {
      id: `out-${DEMO_OUTREACH_LOG.length + 1}`, kind: entry.kind, retainer_prospect_id: entry.retainerProspectId ?? null,
      deal_id: entry.dealId ?? null, buyer_name: entry.buyerName ?? null, channel: "sms", message: entry.message,
      status: "drafted", created_at: new Date().toISOString(), sent_at: null,
    };
    DEMO_OUTREACH_LOG.unshift(row);
    return row;
  }
  const { data, error } = await db()
    .from("outreach_log")
    .insert({ kind: entry.kind, retainer_prospect_id: entry.retainerProspectId ?? null, deal_id: entry.dealId ?? null, buyer_name: entry.buyerName ?? null, message: entry.message })
    .select()
    .single();
  if (error) throw error;
  return data as OutreachLogEntry;
}

export async function markOutreachSent(id: string): Promise<void> {
  if (DEMO_MODE) {
    const o = DEMO_OUTREACH_LOG.find((x) => x.id === id);
    if (o) { o.status = "sent"; o.sent_at = new Date().toISOString(); }
    return;
  }
  const { error } = await db().from("outreach_log").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ─── Module 4: deal tracker ─────────────────────────────────────────────────

export async function getOpenDeals(): Promise<Deal[]> {
  if (DEMO_MODE) return DEMO_DEALS.filter((d) => d.status === "open");
  const { data, error } = await db().from("deals").select("*").eq("status", "open");
  if (error) throw error;
  return data as Deal[];
}

export async function updateDealChecklist(id: string, checklist: ChecklistItem[]): Promise<void> {
  if (DEMO_MODE) {
    const d = DEMO_DEALS.find((x) => x.id === id);
    if (d) d.checklist = checklist;
    return;
  }
  const { error } = await db().from("deals").update({ checklist }).eq("id", id);
  if (error) throw error;
}

// ─── Module 5: Facebook (heavy-item lister + inquiry log) ──────────────────

const DEMO_FB_INQUIRIES: FbInquiry[] = [
  { id: "fbi-1", note: "Asked about the Jaguar subframe", created_at: daysAgo(2) },
  { id: "fbi-2", note: "Local pickup question", created_at: daysAgo(1) },
];

const DEMO_FB_DRAFTS: FbListingDraft[] = [];

export async function getFbInquiries(): Promise<FbInquiry[]> {
  if (DEMO_MODE) return DEMO_FB_INQUIRIES;
  const { data, error } = await db().from("fb_inquiries").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as FbInquiry[];
}

export async function addFbInquiry(note?: string): Promise<void> {
  if (DEMO_MODE) {
    DEMO_FB_INQUIRIES.unshift({ id: `fbi-${DEMO_FB_INQUIRIES.length + 1}`, note: note ?? null, created_at: new Date().toISOString() });
    return;
  }
  const { error } = await db().from("fb_inquiries").insert({ note: note ?? null });
  if (error) throw error;
}

export async function getFbListingDrafts(): Promise<FbListingDraft[]> {
  if (DEMO_MODE) return DEMO_FB_DRAFTS;
  const { data, error } = await db().from("fb_listing_drafts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as FbListingDraft[];
}

export async function createFbListingDraft(entry: { inventoryId: string; title: string; price: number | null; description: string; pickupTerms: string }): Promise<void> {
  if (DEMO_MODE) {
    DEMO_FB_DRAFTS.unshift({
      id: `fbd-${DEMO_FB_DRAFTS.length + 1}`, inventory_id: entry.inventoryId, title: entry.title, price: entry.price,
      description: entry.description, pickup_terms: entry.pickupTerms, created_at: new Date().toISOString(),
    });
    return;
  }
  const { error } = await db().from("fb_listing_drafts").insert({ inventory_id: entry.inventoryId, title: entry.title, price: entry.price, description: entry.description, pickup_terms: entry.pickupTerms });
  if (error) throw error;
}

// ─── Module 6: catalog checklist ────────────────────────────────────────────

const DEMO_CATALOG_CHECKLIST: CatalogChecklistItem[] = [
  { id: "cc-1", category: "Masters", label: "Master 1 — registered", done: true, note: null, sort_order: 1 },
  { id: "cc-2", category: "Masters", label: "Master 2 — registered", done: false, note: null, sort_order: 2 },
  { id: "cc-3", category: "PRO", label: "PRO membership active (ASCAP/BMI/SESAC)", done: true, note: null, sort_order: 20 },
  { id: "cc-4", category: "Distributor", label: "Distributor account set up", done: false, note: null, sort_order: 30 },
  { id: "cc-5", category: "Publishing admin", label: "Publishing administrator signed", done: false, note: null, sort_order: 40 },
  { id: "cc-6", category: "Sync submissions", label: "Sync licensing rep/platform set up", done: false, note: null, sort_order: 50 },
];

export async function getCatalogChecklist(): Promise<CatalogChecklistItem[]> {
  if (DEMO_MODE) return DEMO_CATALOG_CHECKLIST;
  const { data, error } = await db().from("catalog_checklist_items").select("*").order("sort_order");
  if (error) throw error;
  return data as CatalogChecklistItem[];
}

export async function toggleCatalogChecklistItem(id: string, done: boolean): Promise<void> {
  if (DEMO_MODE) {
    const item = DEMO_CATALOG_CHECKLIST.find((x) => x.id === id);
    if (item) item.done = done;
    return;
  }
  const { error } = await db().from("catalog_checklist_items").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function getSsfGates(): Promise<SsfGates> {
  if (DEMO_MODE) return DEMO_GATES;
  const { data, error } = await db().from("ssf_gates").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as SsfGates;
}

export async function updateSsfGates(patch: Partial<SsfGates>): Promise<void> {
  if (DEMO_MODE) {
    Object.assign(DEMO_GATES, patch);
    return;
  }
  const { error } = await db().from("ssf_gates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) throw error;
}

// ─── SSF catalog (Module 2a) ───────────────────────────────────────────────

const DEMO_SSF_CATALOG: SsfCatalogItem[] = [
  {
    id: "cat-1", ssf_part_number: "SSF-LR3-4401", oem_numbers: ["LR014401", "LR018342"],
    description: "Land Rover LR3/LR4 air suspension compressor", brands: ["Land Rover"], fitment: null,
    our_cost: 145, list_price: 289.99, stock_status: "in_stock", warehouse: "kennesaw", last_updated: daysAgo(2),
  },
  {
    id: "cat-2", ssf_part_number: "SSF-JAG-XF220", oem_numbers: ["C2D22254"],
    description: "Jaguar XF rear air spring", brands: ["Jaguar"], fitment: null,
    our_cost: 98, list_price: 199.99, stock_status: "in_stock", warehouse: "norcross", last_updated: daysAgo(1),
  },
  {
    id: "cat-3", ssf_part_number: "SSF-OILFLT-STD", oem_numbers: ["W712/75"],
    description: "Standard spin-on oil filter", brands: ["Universal"], fitment: null,
    our_cost: 2.1, list_price: 9.99, stock_status: "in_stock", warehouse: "kennesaw", last_updated: daysAgo(20),
  },
  {
    id: "cat-4", ssf_part_number: "SSF-BMW-E90-WP", oem_numbers: ["11517586925"],
    description: "BMW E90 water pump", brands: ["BMW"], fitment: null,
    our_cost: 42, list_price: 94.99, stock_status: "in_stock", warehouse: "kennesaw", last_updated: daysAgo(0.5),
  },
];

export async function getSsfCatalog(): Promise<SsfCatalogItem[]> {
  if (DEMO_MODE) return DEMO_SSF_CATALOG;
  const { data, error } = await db().from("ssf_catalog").select("*").order("ssf_part_number");
  if (error) throw error;
  return data as SsfCatalogItem[];
}

export async function upsertSsfCatalogRows(
  rows: Array<{
    ssf_part_number: string;
    oem_numbers: string[];
    description: string;
    brands: string[];
    our_cost: number | null;
    list_price: number | null;
    stock_status: string;
    warehouse: string;
  }>
): Promise<{ upserted: number }> {
  if (DEMO_MODE) {
    for (const row of rows) {
      const existing = DEMO_SSF_CATALOG.find((c) => c.ssf_part_number === row.ssf_part_number);
      const patch = { ...row, warehouse: row.warehouse as SsfCatalogItem["warehouse"], last_updated: new Date().toISOString() };
      if (existing) Object.assign(existing, patch);
      else DEMO_SSF_CATALOG.push({ id: `cat-${DEMO_SSF_CATALOG.length + 1}`, fitment: null, ...patch });
    }
    return { upserted: rows.length };
  }
  const { error } = await db()
    .from("ssf_catalog")
    .upsert(
      rows.map((r) => ({ ...r, last_updated: new Date().toISOString() })),
      { onConflict: "ssf_part_number" }
    );
  if (error) throw error;
  return { upserted: rows.length };
}

// ─── SSF listings (Module 2c) ───────────────────────────────────────────────

const DEMO_SSF_LISTINGS: SsfListing[] = [
  {
    id: "lst-1", ssf_catalog_id: "cat-1", ebay_listing_id: null,
    title: "Land Rover LR3 LR4 Air Suspension Compressor — Fits LR014401",
    status: "pending_approval", vero_flagged: false, vero_flag_reason: null,
    approved_by: null, published_at: null, ended_at: null, end_reason: null, created_at: daysAgo(0.3),
    ssf_part_number: "SSF-LR3-4401", description: "Land Rover LR3/LR4 air suspension compressor", our_cost: 145, list_price: 289.99,
  },
  {
    id: "lst-2", ssf_catalog_id: "cat-4", ebay_listing_id: "EB-DEMO-9981",
    title: "BMW E90 Water Pump — Fits BMW 3-Series E90",
    status: "live", vero_flagged: true, vero_flag_reason: "BMW brand — manual VeRO review required",
    approved_by: "u-ej", published_at: daysAgo(6), ended_at: null, end_reason: null, created_at: daysAgo(7),
    ssf_part_number: "SSF-BMW-E90-WP", description: "BMW E90 water pump", our_cost: 42, list_price: 94.99,
  },
];

export async function getSsfListings(status?: SsfListingStatus): Promise<SsfListing[]> {
  if (DEMO_MODE) return status ? DEMO_SSF_LISTINGS.filter((l) => l.status === status) : DEMO_SSF_LISTINGS;
  let q = db().from("ssf_listings").select("*, ssf_catalog(ssf_part_number, description, our_cost, list_price)").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row) => ({
    ...row,
    ssf_part_number: row.ssf_catalog?.ssf_part_number,
    description: row.ssf_catalog?.description,
    our_cost: row.ssf_catalog?.our_cost,
    list_price: row.ssf_catalog?.list_price,
  })) as SsfListing[];
}

export async function createSsfListing(entry: {
  ssf_catalog_id: string;
  title: string;
  vero_flagged: boolean;
  vero_flag_reason: string | null;
}): Promise<SsfListing> {
  if (DEMO_MODE) {
    const cat = DEMO_SSF_CATALOG.find((c) => c.id === entry.ssf_catalog_id);
    const listing: SsfListing = {
      id: `lst-${DEMO_SSF_LISTINGS.length + 1}`, ssf_catalog_id: entry.ssf_catalog_id, ebay_listing_id: null,
      title: entry.title, status: "pending_approval", vero_flagged: entry.vero_flagged, vero_flag_reason: entry.vero_flag_reason,
      approved_by: null, published_at: null, ended_at: null, end_reason: null, created_at: new Date().toISOString(),
      ssf_part_number: cat?.ssf_part_number, description: cat?.description, our_cost: cat?.our_cost, list_price: cat?.list_price,
    };
    DEMO_SSF_LISTINGS.unshift(listing);
    return listing;
  }
  const { data, error } = await db()
    .from("ssf_listings")
    .insert({ ssf_catalog_id: entry.ssf_catalog_id, title: entry.title, status: "pending_approval", vero_flagged: entry.vero_flagged, vero_flag_reason: entry.vero_flag_reason })
    .select()
    .single();
  if (error) throw error;
  return data as SsfListing;
}

export async function updateSsfListingStatus(
  id: string,
  status: SsfListingStatus,
  opts: { approvedBy?: string; ebayListingId?: string; endReason?: string } = {}
): Promise<void> {
  if (DEMO_MODE) {
    const l = DEMO_SSF_LISTINGS.find((x) => x.id === id);
    if (l) {
      l.status = status;
      if (status === "live") { l.published_at = new Date().toISOString(); l.approved_by = opts.approvedBy ?? null; l.ebay_listing_id = opts.ebayListingId ?? l.ebay_listing_id; }
      if (status === "ended") { l.ended_at = new Date().toISOString(); l.end_reason = opts.endReason ?? null; }
    }
    return;
  }
  const patch: Record<string, unknown> = { status };
  if (status === "live") { patch.published_at = new Date().toISOString(); patch.approved_by = opts.approvedBy ?? null; if (opts.ebayListingId) patch.ebay_listing_id = opts.ebayListingId; }
  if (status === "ended") { patch.ended_at = new Date().toISOString(); patch.end_reason = opts.endReason ?? null; }
  const { error } = await db().from("ssf_listings").update(patch).eq("id", id);
  if (error) throw error;
}

// ─── SSF orders (Module 2e) ─────────────────────────────────────────────────

const DEMO_SSF_ORDERS: SsfOrder[] = [
  {
    id: "ord-1", ssf_listing_id: "lst-2", ebay_order_id: "EB-ORDER-4471", buyer_name: "J. Marsh",
    our_cost: 42, sale_price: 94.99, fulfillment_mode: null, tracking_number: null,
    ordered_at: daysAgo(0.2), shipped_at: null, deadline_at: hoursFromNow(60), created_at: daysAgo(0.2),
  },
];

export async function getSsfOrders(pendingOnly = false): Promise<SsfOrder[]> {
  if (DEMO_MODE) return pendingOnly ? DEMO_SSF_ORDERS.filter((o) => !o.tracking_number) : DEMO_SSF_ORDERS;
  let q = db().from("ssf_orders").select("*").order("created_at", { ascending: false });
  if (pendingOnly) q = q.is("tracking_number", null);
  const { data, error } = await q;
  if (error) throw error;
  return data as SsfOrder[];
}

export async function createSsfOrder(entry: {
  ssf_listing_id: string;
  ebay_order_id: string;
  buyer_name: string | null;
  our_cost: number | null;
  sale_price: number;
}): Promise<SsfOrder> {
  const config = getSsfConfig();
  const deadlineAt = new Date(Date.now() + (config.handling_time_business_days + 2) * 86_400_000).toISOString();

  if (DEMO_MODE) {
    const order: SsfOrder = {
      id: `ord-${DEMO_SSF_ORDERS.length + 1}`, ssf_listing_id: entry.ssf_listing_id, ebay_order_id: entry.ebay_order_id,
      buyer_name: entry.buyer_name, our_cost: entry.our_cost, sale_price: entry.sale_price,
      fulfillment_mode: null, tracking_number: null,
      ordered_at: new Date().toISOString(), shipped_at: null, deadline_at: deadlineAt, created_at: new Date().toISOString(),
    };
    DEMO_SSF_ORDERS.unshift(order);
    return order;
  }
  const { data, error } = await db()
    .from("ssf_orders")
    .insert({ ...entry, ordered_at: new Date().toISOString(), deadline_at: deadlineAt })
    .select()
    .single();
  if (error) throw error;
  return data as SsfOrder;
}

/**
 * eBay Marketplace Account Deletion compliance — redact any order's buyer_name
 * that matches the deleted account's username. Matching is by name text since
 * ssf_orders doesn't store a stable eBay user ID today; this is an honest
 * best-effort against what we actually retain, not a claim of full linkage.
 */
export async function redactBuyerNamesMatching(username: string): Promise<number> {
  const needle = username.trim().toLowerCase();
  if (!needle) return 0;

  if (DEMO_MODE) {
    let count = 0;
    for (const o of DEMO_SSF_ORDERS) {
      if (o.buyer_name?.trim().toLowerCase() === needle) {
        o.buyer_name = "[redacted per eBay account deletion]";
        count++;
      }
    }
    return count;
  }

  const { data, error } = await db().from("ssf_orders").update({ buyer_name: "[redacted per eBay account deletion]" }).ilike("buyer_name", username).select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

export async function placeSsfOrder(id: string, fulfillmentMode: SsfOrderFulfillment): Promise<void> {
  if (DEMO_MODE) {
    const o = DEMO_SSF_ORDERS.find((x) => x.id === id);
    if (o) o.fulfillment_mode = fulfillmentMode;
    return;
  }
  const { error } = await db().from("ssf_orders").update({ fulfillment_mode: fulfillmentMode }).eq("id", id);
  if (error) throw error;
}

export async function addTrackingToSsfOrder(id: string, trackingNumber: string): Promise<void> {
  const config = getSsfConfig();

  if (DEMO_MODE) {
    const o = DEMO_SSF_ORDERS.find((x) => x.id === id);
    if (o) {
      o.tracking_number = trackingNumber;
      o.shipped_at = new Date().toISOString();
      await logSsfSale(o, config);
    }
    return;
  }

  const { data: order, error: fetchErr } = await db().from("ssf_orders").select("*").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const { error } = await db().from("ssf_orders").update({ tracking_number: trackingNumber, shipped_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  if (order) await logSsfSale(order as SsfOrder, config);
}

async function logSsfSale(order: SsfOrder, config: SsfConfig): Promise<void> {
  const salePrice = order.sale_price ?? 0;
  const fees = round2(salePrice * config.ebay_fee_pct);
  const promo = round2(salePrice * config.promo_pct);
  const netMargin = order.our_cost !== null ? round2(salePrice - order.our_cost - fees - promo) : null;
  await appendLedger({
    channel: "ssf",
    entry_type: "sale",
    amount: salePrice,
    fees: fees + promo,
    net_margin: netMargin,
    ssf_order_id: order.id,
    note: `SSF order ${order.ebay_order_id ?? order.id} shipped, tracking added`,
  });
}

// ─── Gift Protocol (Module 3 patch) ─────────────────────────────────────────
// Demo data mirrors the real seed in schema.sql so demo mode and production
// behave identically — these are the 4 real researched College Park / South
// Fulton GA prospects, not placeholders.

const hubbardFacts: DossierFact[] = [
  { fact: "Practice entity: Delores Hubbard DDS LLC", confidence: "confirmed", source_note: "ADA Find-a-Dentist; WebMD; Vitals; Sharecare" },
  { fact: "Education: Meharry Medical College", confidence: "single_source", source_note: "ADA Find-a-Dentist profile only" },
  { fact: "Licensed to practice dentistry in Georgia", confidence: "single_source", source_note: "CareDash" },
  { fact: "Long-tenured solo practice; multigenerational patient loyalty", confidence: "single_source", source_note: "aggregated patient reviews, no exact founding date public" },
  { fact: "No functioning dedicated practice website; hubbarddentistry.com belongs to a different, unrelated Hubbard practice in Glennville, GA", confidence: "confirmed", source_note: "site fetch of hubbarddentistry.com" },
  { fact: "Reviews scattered across Yelp/Zaubee/Vitals/Healthgrades/CareDash, no evidence of owner-managed responses", confidence: "confirmed", source_note: "multiple review platforms" },
  { fact: "Warm, old-school, intimate practice feel per patient reviews", confidence: "confirmed", source_note: "aggregated patient reviews" },
];

const cutzFacts: DossierFact[] = [
  { fact: "Relocated to 2459 Roosevelt Hwy Suite A4 around late 2023", confidence: "single_source", source_note: "Instagram relocation post, date approximate" },
  { fact: "No dedicated website; presence limited to Fresha (unclaimed lead page), Atly, and directory listings", confidence: "confirmed", source_note: "Fresha, Atly, directories" },
  { fact: "No business-managed online booking; phone/walk-in only", confidence: "confirmed", source_note: "Fresha shows Call to book only" },
  { fact: "Services: Men's Haircut, Beard Trim, Head Shave", confidence: "confirmed", source_note: "Fresha, Atly" },
  { fact: "Price range roughly $15-$30 per haircut", confidence: "single_source", source_note: "Atly, review-derived, not an official posted menu" },
  { fact: "Family-friendly, kid-friendly, relaxed, walk-ins-welcome reputation", confidence: "confirmed", source_note: "aggregated customer reviews" },
];

const robinsonFacts: DossierFact[] = [
  { fact: "From Clinton, South Carolina", confidence: "confirmed", source_note: "The Atlanta Voice; firm bio" },
  { fact: "BS Mathematics, Kentucky State University; JD, University of Louisville (Brandeis School of Law), 2013", confidence: "confirmed", source_note: "firm About page; The Atlanta Voice; Avvo" },
  { fact: "Began career as a public defender before founding her firms", confidence: "confirmed", source_note: "firm site; The Atlanta Voice" },
  { fact: "Member of Delta Sigma Theta Sorority; HBCU graduate", confidence: "confirmed", source_note: "Yahoo interview; Famous Birthdays" },
  { fact: "Speaks Spanish", confidence: "single_source", source_note: "taylorleeandassociates.com bio" },
  { fact: "Cast member on Love & Hip Hop: Atlanta since 2019; married rapper Yung Joc Nov 7, 2021", confidence: "confirmed", source_note: "Forbes; The Atlanta Voice; multiple" },
  { fact: "Instagram following 500,000+", confidence: "single_source", source_note: "Famous Birthdays" },
  { fact: "Featured by Forbes (Nov 2022) and The Atlanta Voice; SRS Buckhead grand opening June 2022", confidence: "confirmed", source_note: "Forbes; The Atlanta Voice" },
  { fact: "Website footer reads © 2021 All Rights Reserved; thin, dated template", confidence: "confirmed", source_note: "site fetch" },
  { fact: "Site copy contains an out-of-place spammy external link — sign of an unmaintained/compromised WordPress site", confidence: "confirmed", source_note: "site fetch" },
  { fact: "Site messaging is criminal-defense-only despite also handling real estate closings via affiliated title company", confidence: "confirmed", source_note: "site fetch; Forbes" },
];

const conquestFacts: DossierFact[] = [
  { fact: "Legal entity Conquest Auto Service and Repair, LLC, started 9/12/2008, ~17 years in business", confidence: "confirmed", source_note: "GA SOS; BBB" },
  { fact: "ASE Blue Seal of Excellence recognition", confidence: "single_source", source_note: "self-reported on conquestautorepairs.com, not independently verified via ASE directory" },
  { fact: "A+ BBB rating (not accredited); file opened 8/11/2010", confidence: "confirmed", source_note: "BBB" },
  { fact: "PPP loan (~$20,677, PNC Bank) retaining 8 jobs — roughly 8 employees", confidence: "confirmed", source_note: "SBA/Treasury PPP data" },
  { fact: "Multiple duplicated, low-quality websites with contradictory content and inconsistent hours", confidence: "confirmed", source_note: "site fetches of all 3 domains" },
  { fact: "Strong review reputation across BBB, Birdeye (~180 reviews), Yelp, Nextdoor — honesty, fair pricing, long-term loyalty", confidence: "confirmed", source_note: "multiple review platforms" },
];

const DEMO_GIFT_PROSPECTS: GiftProtocolProspect[] = [
  {
    id: "gp-1", retainer_prospect_id: null, business_name: "Dr. Delores Hubbard, DDS", category: "dentist",
    owner_name: "Dr. Delores Hubbard (also Dr. Delores Hubbard-Brooks)", owner_confidence: "confirmed",
    address: "1784 Washington Rd, East Point, GA 30344", phone: "(404) 766-8559",
    website_current: "None — hubbarddentistry.com belongs to a different, unrelated practice",
    dossier: hubbardFacts, do_not_use_notes: null, site_brief: null, flyer_copy_options: [], flyer_copy_selected: null,
    qr_target_url: null, status: "active", created_at: daysAgo(3),
  },
  {
    id: "gp-2", retainer_prospect_id: null, business_name: "High Definition Cutz", category: "barbershop",
    owner_name: null, owner_confidence: null,
    address: "2459 Roosevelt Hwy, Suite A4, College Park, GA 30349", phone: "(404) 573-0675",
    website_current: "None — only Fresha/Atly/directory listings",
    dossier: cutzFacts,
    do_not_use_notes: 'Owner identity NOT publicly confirmed — a barber named "Jig" appears in reviews but is not confirmed as owner. Do not assert an owner name in outreach until verified.',
    site_brief: null, flyer_copy_options: [], flyer_copy_selected: null, qr_target_url: null, status: "active", created_at: daysAgo(3),
  },
  {
    id: "gp-3", retainer_prospect_id: null, business_name: "Kendra Robinson & Associates", category: "law_firm",
    owner_name: "Kendra Robinson (Kendra Nicole Robinson)", owner_confidence: "confirmed",
    address: null, phone: null, website_current: "https://kendrarobinsonlaw.com (dated 2021 template)",
    dossier: robinsonFacts,
    do_not_use_notes: "Family details (e.g. a late father referenced in a firm Facebook birthday post) are voluntarily public but sensitive — do NOT use in outreach. Net worth figures circulating online are from low-quality/unofficial sources — exclude entirely.",
    site_brief: null, flyer_copy_options: [], flyer_copy_selected: null, qr_target_url: null, status: "active", created_at: daysAgo(3),
  },
  {
    id: "gp-4", retainer_prospect_id: null, business_name: "Conquest Auto Repair", category: "auto_repair",
    owner_name: "Eton Douglas", owner_confidence: "confirmed",
    address: "5548 Old National Hwy, College Park, GA 30349", phone: null,
    website_current: "conquestautorepairs.com + 2 duplicate domains",
    dossier: conquestFacts, do_not_use_notes: null, site_brief: null, flyer_copy_options: [], flyer_copy_selected: null,
    qr_target_url: null, status: "active", created_at: daysAgo(3),
  },
];

const DEFAULT_PACKAGE_CHECKLIST = [
  { label: "Flyer printed", done: false },
  { label: "QR code printed", done: false },
  { label: "Small flat rate box packed", done: false },
  { label: "Label printed via Pirate Ship", done: false },
  { label: "Signature confirmation selected (standard, not Adult-Restricted)", done: false },
];

const DEMO_GIFT_DELIVERIES: GiftProtocolDelivery[] = DEMO_GIFT_PROSPECTS.map((p) => ({
  id: `gpd-${p.id}`, gift_protocol_prospect_id: p.id,
  ship_method: "USPS Priority Mail Small Flat Rate + Signature Confirmation",
  tracking_number: null, ship_date: null, delivery_status: "not_started", signer_name: null,
  follow_up_date: null, followed_up: false, checklist: DEFAULT_PACKAGE_CHECKLIST.map((c) => ({ ...c })),
}));

export async function getGiftProspects(): Promise<GiftProtocolProspect[]> {
  if (DEMO_MODE) return DEMO_GIFT_PROSPECTS;
  const { data, error } = await db().from("gift_protocol_prospects").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as GiftProtocolProspect[];
}

export async function getActiveGiftProspectCount(): Promise<number> {
  if (DEMO_MODE) return DEMO_GIFT_PROSPECTS.filter((p) => p.status === "active").length;
  const { count, error } = await db().from("gift_protocol_prospects").select("id", { count: "exact", head: true }).eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

export async function createGiftProspect(entry: {
  businessName: string;
  category?: string;
  ownerName?: string;
  ownerConfidence?: DossierFact["confidence"];
  address?: string;
  phone?: string;
  websiteCurrent?: string;
}): Promise<GiftProtocolProspect> {
  const retainer = await createRetainerProspect({ name: entry.businessName, website: entry.websiteCurrent ?? null, phone: entry.phone ?? null });

  if (DEMO_MODE) {
    const prospect: GiftProtocolProspect = {
      id: `gp-${DEMO_GIFT_PROSPECTS.length + 1}`, retainer_prospect_id: retainer.id, business_name: entry.businessName,
      category: entry.category ?? null, owner_name: entry.ownerName ?? null, owner_confidence: entry.ownerConfidence ?? null,
      address: entry.address ?? null, phone: entry.phone ?? null, website_current: entry.websiteCurrent ?? null,
      dossier: [], do_not_use_notes: null, site_brief: null, flyer_copy_options: [], flyer_copy_selected: null,
      qr_target_url: null, status: "active", created_at: new Date().toISOString(),
    };
    DEMO_GIFT_PROSPECTS.unshift(prospect);
    DEMO_GIFT_DELIVERIES.unshift({
      id: `gpd-${prospect.id}`, gift_protocol_prospect_id: prospect.id, ship_method: "USPS Priority Mail Small Flat Rate + Signature Confirmation",
      tracking_number: null, ship_date: null, delivery_status: "not_started", signer_name: null, follow_up_date: null,
      followed_up: false, checklist: DEFAULT_PACKAGE_CHECKLIST.map((c) => ({ ...c })),
    });
    return prospect;
  }

  const { data, error } = await db()
    .from("gift_protocol_prospects")
    .insert({
      retainer_prospect_id: retainer.id, business_name: entry.businessName, category: entry.category ?? null,
      owner_name: entry.ownerName ?? null, owner_confidence: entry.ownerConfidence ?? null, address: entry.address ?? null,
      phone: entry.phone ?? null, website_current: entry.websiteCurrent ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  await db().from("gift_protocol_deliveries").insert({ gift_protocol_prospect_id: data.id });
  return data as GiftProtocolProspect;
}

export async function updateGiftProspectDossier(id: string, patch: { doNotUseNotes?: string; approveFactIndex?: number }): Promise<void> {
  if (DEMO_MODE) {
    const p = DEMO_GIFT_PROSPECTS.find((x) => x.id === id);
    if (p && patch.approveFactIndex !== undefined) p.dossier[patch.approveFactIndex].approved_for_use = true;
    return;
  }
  const { data: p, error: fetchErr } = await db().from("gift_protocol_prospects").select("dossier").eq("id", id).single();
  if (fetchErr) throw fetchErr;
  const dossier = p.dossier as DossierFact[];
  if (patch.approveFactIndex !== undefined && dossier[patch.approveFactIndex]) dossier[patch.approveFactIndex].approved_for_use = true;
  const { error } = await db().from("gift_protocol_prospects").update({ dossier, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function updateSiteBrief(id: string, brief: SiteBrief): Promise<void> {
  if (DEMO_MODE) {
    const p = DEMO_GIFT_PROSPECTS.find((x) => x.id === id);
    if (p) p.site_brief = brief;
    return;
  }
  const { error } = await db().from("gift_protocol_prospects").update({ site_brief: brief, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function updateFlyerCopy(id: string, options: string[]): Promise<void> {
  if (DEMO_MODE) {
    const p = DEMO_GIFT_PROSPECTS.find((x) => x.id === id);
    if (p) p.flyer_copy_options = options;
    return;
  }
  const { error } = await db().from("gift_protocol_prospects").update({ flyer_copy_options: options, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function selectFlyerCopy(id: string, selected: string): Promise<void> {
  if (DEMO_MODE) {
    const p = DEMO_GIFT_PROSPECTS.find((x) => x.id === id);
    if (p) p.flyer_copy_selected = selected;
    return;
  }
  const { error } = await db().from("gift_protocol_prospects").update({ flyer_copy_selected: selected, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function getGiftDeliveries(): Promise<GiftProtocolDelivery[]> {
  if (DEMO_MODE) return DEMO_GIFT_DELIVERIES;
  const { data, error } = await db().from("gift_protocol_deliveries").select("*");
  if (error) throw error;
  return data as GiftProtocolDelivery[];
}

export async function updateGiftDelivery(
  prospectId: string,
  patch: { shipMethod?: string; trackingNumber?: string; shipDate?: string; status?: GiftDeliveryStatus; signerName?: string; toggleChecklistIndex?: number }
): Promise<void> {
  if (DEMO_MODE) {
    const d = DEMO_GIFT_DELIVERIES.find((x) => x.gift_protocol_prospect_id === prospectId);
    if (!d) return;
    if (patch.shipMethod !== undefined) d.ship_method = patch.shipMethod;
    if (patch.trackingNumber !== undefined) d.tracking_number = patch.trackingNumber;
    if (patch.shipDate !== undefined) d.ship_date = patch.shipDate;
    if (patch.signerName !== undefined) d.signer_name = patch.signerName;
    if (patch.toggleChecklistIndex !== undefined) d.checklist[patch.toggleChecklistIndex].done = !d.checklist[patch.toggleChecklistIndex].done;
    if (patch.status !== undefined) {
      d.delivery_status = patch.status;
      if (isConversionTrigger(patch.status)) d.follow_up_date = addBusinessDays(new Date().toISOString(), 2);
    }
    return;
  }

  const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.shipMethod !== undefined) dbPatch.ship_method = patch.shipMethod;
  if (patch.trackingNumber !== undefined) dbPatch.tracking_number = patch.trackingNumber;
  if (patch.shipDate !== undefined) dbPatch.ship_date = patch.shipDate;
  if (patch.signerName !== undefined) dbPatch.signer_name = patch.signerName;
  if (patch.status !== undefined) {
    dbPatch.delivery_status = patch.status;
    if (isConversionTrigger(patch.status)) dbPatch.follow_up_date = addBusinessDays(new Date().toISOString(), 2);
  }
  if (patch.toggleChecklistIndex !== undefined) {
    const { data: existing } = await db().from("gift_protocol_deliveries").select("checklist").eq("gift_protocol_prospect_id", prospectId).single();
    const checklist = (existing?.checklist ?? []) as ChecklistItem[];
    if (checklist[patch.toggleChecklistIndex]) checklist[patch.toggleChecklistIndex].done = !checklist[patch.toggleChecklistIndex].done;
    dbPatch.checklist = checklist;
  }
  const { error } = await db().from("gift_protocol_deliveries").update(dbPatch).eq("gift_protocol_prospect_id", prospectId);
  if (error) throw error;
}

export async function markGiftFollowedUp(prospectId: string): Promise<void> {
  if (DEMO_MODE) {
    const d = DEMO_GIFT_DELIVERIES.find((x) => x.gift_protocol_prospect_id === prospectId);
    if (d) d.followed_up = true;
    return;
  }
  const { error } = await db().from("gift_protocol_deliveries").update({ followed_up: true, updated_at: new Date().toISOString() }).eq("gift_protocol_prospect_id", prospectId);
  if (error) throw error;
}

// ─── System Health Layer (v3.1) ─────────────────────────────────────────────

const DEMO_HEALTH_EVENTS: SystemHealthEvent[] = [
  { id: "he-1", module: "digest", event_type: "sms_sent", status: "ok", detail: null, created_at: daysAgo(0.1) },
  { id: "he-2", module: "ssf", event_type: "stock_feed_guard_run", status: "ok", detail: "checked 1, ended 0", created_at: daysAgo(0.05) },
];

const DEMO_EXTERNAL_BLOCKERS: ExternalBlocker[] = [
  { id: "eb-1", label: "eBay production API keyset activation", submitted_at: "2026-07-06", typical_turnaround_days: 5, resolved: false, note: "Blocked on Marketplace Account Deletion webhook — endpoint built, needs deploy + registration in eBay Developer Portal." },
  { id: "eb-2", label: "Twilio toll-free verification (30482 + 30513)", submitted_at: "2026-07-06", typical_turnaround_days: 3, resolved: false, note: "Business email + SMS opt-in fixes made; awaiting resubmission and Twilio review." },
  { id: "eb-3", label: "Net10th drop-ship approval with SSF rep", submitted_at: null, typical_turnaround_days: null, resolved: false, note: "Not yet submitted." },
];

export async function logHealthEvent(module: string, eventType: string, status: "ok" | "error", detail?: string): Promise<void> {
  if (DEMO_MODE) {
    DEMO_HEALTH_EVENTS.unshift({ id: `he-${DEMO_HEALTH_EVENTS.length + 1}`, module, event_type: eventType, status, detail: detail ?? null, created_at: new Date().toISOString() });
    return;
  }
  const { error } = await db().from("system_health_events").insert({ module, event_type: eventType, status, detail: detail ?? null });
  if (error) throw error;
}

async function getLastHealthEvent(module: string, eventType: string): Promise<SystemHealthEvent | null> {
  if (DEMO_MODE) return DEMO_HEALTH_EVENTS.find((e) => e.module === module && e.event_type === eventType) ?? null;
  const { data, error } = await db().from("system_health_events").select("*").eq("module", module).eq("event_type", eventType).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as SystemHealthEvent | null;
}

export async function getExternalBlockers(): Promise<ExternalBlocker[]> {
  if (DEMO_MODE) return DEMO_EXTERNAL_BLOCKERS.filter((b) => !b.resolved);
  const { data, error } = await db().from("external_blockers").select("*").eq("resolved", false).order("created_at");
  if (error) throw error;
  return data as ExternalBlocker[];
}

/**
 * Real checks only, per module — see lib/system-health.ts for the never-fake-
 * green combinators. Each module's `detail` explains which underlying signal
 * drove the status so the pill is never a mystery.
 */
export async function getModuleHealth(): Promise<ModuleHealth[]> {
  const [ledger, catalog, retainers, giftProspects, fbInquiries, digestEvent, guardEvent] = await Promise.all([
    getLedger(500),
    getSsfCatalog(),
    getRetainerProspects(),
    getGiftProspects(),
    getFbInquiries(),
    getLastHealthEvent("digest", "sms_sent"),
    getLastHealthEvent("ssf", "stock_feed_guard_run"),
  ]);
  const ssfConfig = getSsfConfig();

  const lastOf = (dates: Array<string | null | undefined>): string | null =>
    dates.filter((d): d is string => Boolean(d)).sort((a, b) => b.localeCompare(a))[0] ?? null;

  // ─── Salvage: last salvage-channel ledger write ──────────────────────────
  const lastSalvage = lastOf(ledger.filter((e) => e.channel === "salvage").map((e) => e.created_at));
  const salvageStatus = checkRecency(lastSalvage, 24, 168);

  // ─── SSF: catalog pricing freshness + eBay credentials ───────────────────
  const oldestCatalogUpdate = catalog.length ? catalog.map((c) => c.last_updated).sort()[0] : null;
  const catalogStatus = checkCatalogFreshness(oldestCatalogUpdate, ssfConfig.stale_amber_days, ssfConfig.stale_block_days);
  const ssfCredStatus = checkCredential(EBAY_CONFIGURED);
  const ssfStatus = combineHealth([catalogStatus, ssfCredStatus]);
  const ssfDetail = !EBAY_CONFIGURED
    ? "eBay production API not configured — publish/end/tracking are stubbed"
    : catalogStatus !== "active"
      ? `Oldest catalog price is ${oldestCatalogUpdate ? Math.floor((Date.now() - new Date(oldestCatalogUpdate).getTime()) / 86_400_000) : "?"}d old`
      : "eBay configured, catalog pricing fresh";

  // ─── Stock-Feed Guard ─────────────────────────────────────────────────────
  const guardStatus = checkLastEvent(guardEvent, 6, 48);
  const guardDetail = guardEvent ? `Last ran ${Math.floor((Date.now() - new Date(guardEvent.created_at).getTime()) / 3_600_000)}h ago${guardEvent.detail ? " — " + guardEvent.detail : ""}` : "Never run — n8n cron not scheduled yet";

  // ─── Digest ───────────────────────────────────────────────────────────────
  const digestCredStatus = checkCredential(TWILIO_CONFIGURED);
  const digestEventStatus = checkLastEvent(digestEvent, 30, 72);
  const digestStatus = combineHealth([digestCredStatus, digestEventStatus]);
  const digestDetail = !TWILIO_CONFIGURED
    ? "Twilio not configured"
    : digestEvent
      ? `Last sent ${Math.floor((Date.now() - new Date(digestEvent.created_at).getTime()) / 3_600_000)}h ago`
      : "Twilio configured, but no digest sent yet — n8n cron not scheduled";

  // ─── Retainers / Gift Protocol / Facebook: last write recency ───────────
  const lastRetainer = lastOf(retainers.map((r) => r.created_at));
  const retainersStatus = checkRecency(lastRetainer, 168, 720);

  const lastGift = lastOf(giftProspects.map((p) => p.created_at));
  const giftStatus = checkRecency(lastGift, 168, 720);

  const lastFb = lastOf(fbInquiries.map((i) => i.created_at));
  const fbStatus = checkRecency(lastFb, 168, 720);

  return [
    { module: "salvage", status: salvageStatus, detail: lastSalvage ? `Last ledger write ${Math.floor((Date.now() - new Date(lastSalvage).getTime()) / 3_600_000)}h ago` : "No salvage activity logged yet" },
    { module: "ssf", status: ssfStatus, detail: ssfDetail },
    { module: "stock_feed_guard", status: guardStatus, detail: guardDetail },
    { module: "digest", status: digestStatus, detail: digestDetail },
    { module: "retainers", status: retainersStatus, detail: lastRetainer ? `Last prospect activity ${Math.floor((Date.now() - new Date(lastRetainer).getTime()) / 86_400_000)}d ago` : "No prospects yet" },
    { module: "gift_protocol", status: giftStatus, detail: lastGift ? `Last dossier activity ${Math.floor((Date.now() - new Date(lastGift).getTime()) / 86_400_000)}d ago` : "No dossiers yet" },
    { module: "facebook", status: fbStatus, detail: lastFb ? `Last inquiry ${Math.floor((Date.now() - new Date(lastFb).getTime()) / 86_400_000)}d ago` : "No inquiries logged yet" },
  ];
}

export async function getModuleHealthFor(module: string): Promise<ModuleHealth | null> {
  const all = await getModuleHealth();
  return all.find((m) => m.module === module) ?? null;
}

/** Diagnosis results are stored as JSON in a health event's detail field — reuses
 * the same event log rather than a dedicated table for one more small shape. */
export async function saveDiagnosis(module: string, diagnosisJson: string): Promise<void> {
  await logHealthEvent(module, "diagnosis", "ok", diagnosisJson);
}

export async function getLastDiagnosis(module: string): Promise<{ text: string; safeAction: string | null; copyFixPrompt: string } | null> {
  const event = await getLastHealthEvent(module, "diagnosis");
  if (!event?.detail) return null;
  try {
    return JSON.parse(event.detail);
  } catch {
    return null;
  }
}
