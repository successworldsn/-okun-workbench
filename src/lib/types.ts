export type Channel = "salvage" | "ssf" | "fbm";
export type LedgerEntryType = "buy" | "sale" | "expense" | "return" | "listing";
export type InventoryStatus = "acquired" | "at_shop" | "listed" | "sold" | "shipped" | "returned";
export type InventoryLocation = "shop" | "home" | "storage" | "transit";
export type BuyQueueStatus = "pending" | "bought" | "passed";
export type RetainerStage = "target" | "contacted" | "meeting" | "proposal" | "signed";

export interface AppUser {
  id: string;
  name: string;
  role: "ej" | "usman";
  access_scope: "full" | "parts_only";
  username: string;
}

/** Password hash never leaves lib/auth.ts's login check — separate type so it can't leak into a page by accident. */
export interface AppUserCredential extends AppUser {
  password_hash: string;
}

export interface SessionPayload {
  userId: string;
  name: string;
  role: "ej" | "usman";
  accessScope: "full" | "parts_only";
  exp: number; // unix seconds
}

export interface BuyQueueItem {
  id: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  lot_number: string | null;
  auction_source: string | null;
  auction_close_at: string;
  scanner_score: number | null;
  scanner_score_version: string | null;
  suggested_max_bid: number | null;
  component_breakdown: Record<string, number> | null;
  status: BuyQueueStatus;
  pass_reason: string | null;
  bought_price: number | null;
  decided_at: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  channel: Channel;
  buy_queue_id: string | null;
  description: string;
  part_number: string | null;
  vehicle_source: string | null;
  status: InventoryStatus;
  location: InventoryLocation;
  local_only: boolean;
  assignee: string | null;
  acquired_at: string;
  listed_at: string | null;
  sold_at: string | null;
  shipped_at: string | null;
  buy_price: number | null;
  list_price: number | null;
  sale_price: number | null;
}

export interface LedgerEntry {
  id: string;
  channel: Channel;
  entry_type: LedgerEntryType;
  inventory_id: string | null;
  amount: number;
  fees: number;
  shipping: number;
  net_margin: number | null;
  days_to_sell: number | null;
  scanner_score: number | null;
  scanner_score_version: string | null;
  refund_amount: number | null;
  return_reason: string | null;
  note: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  channel: Channel;
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
}

export interface RetainerProspect {
  id: string;
  name: string;
  stage: RetainerStage;
  suggested_offer: string | null;
  brief: string | null;
  phone: string | null;
  website: string | null;
  last_contacted_at: string | null;
  created_at: string;
}

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface Deal {
  id: string;
  name: string;
  deadline: string;
  status: "open" | "closed";
  checklist: ChecklistItem[];
}

export interface SsfGates {
  tier: 0 | 1 | 2;
  active_listing_cap: number;
  approval_mode: "human" | "batch" | "auto_under_75";
  locked_until: string | null;
  lock_reason: string | null;
}

export interface SsfCatalogItem {
  id: string;
  ssf_part_number: string;
  oem_numbers: string[];
  description: string | null;
  brands: string[];
  fitment: Record<string, unknown> | null;
  our_cost: number | null;
  list_price: number | null;
  stock_status: string | null;
  warehouse: "kennesaw" | "norcross" | null;
  last_updated: string;
}

export type SsfListingStatus = "draft" | "pending_approval" | "live" | "ended";

export interface SsfListing {
  id: string;
  ssf_catalog_id: string | null;
  ebay_listing_id: string | null;
  title: string;
  status: SsfListingStatus;
  vero_flagged: boolean;
  vero_flag_reason: string | null;
  approved_by: string | null;
  published_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
  created_at: string;
  // joined convenience fields, not columns
  ssf_part_number?: string;
  description?: string | null;
  our_cost?: number | null;
  list_price?: number | null;
}

export type SsfOrderFulfillment = "dropship" | "ship_to_shop";

export interface SsfOrder {
  id: string;
  ssf_listing_id: string | null;
  ebay_order_id: string | null;
  buyer_name: string | null;
  our_cost: number | null;
  sale_price: number | null;
  fulfillment_mode: SsfOrderFulfillment | null;
  tracking_number: string | null;
  ordered_at: string | null;
  shipped_at: string | null;
  deadline_at: string | null;
  created_at: string;
}

export type OutreachKind = "retainer" | "deal_buyer";

export interface OutreachLogEntry {
  id: string;
  kind: OutreachKind;
  retainer_prospect_id: string | null;
  deal_id: string | null;
  buyer_name: string | null;
  channel: string;
  message: string;
  status: "drafted" | "sent";
  created_at: string;
  sent_at: string | null;
}

export interface FbInquiry {
  id: string;
  note: string | null;
  created_at: string;
}

export interface FbListingDraft {
  id: string;
  inventory_id: string | null;
  title: string;
  price: number | null;
  description: string | null;
  pickup_terms: string | null;
  created_at: string;
}

export interface CatalogChecklistItem {
  id: string;
  category: string;
  label: string;
  done: boolean;
  note: string | null;
  sort_order: number;
}

// ─── Gift Protocol (Module 3 patch) ────────────────────────────────────────

export type DossierConfidence = "confirmed" | "single_source";

export interface DossierFact {
  fact: string;
  confidence: DossierConfidence;
  source_note: string;
  approved_for_use?: boolean; // single_source facts need an explicit human tap before flyer/site copy can use them
}

export interface SiteBrief {
  brandVoice: string;
  palette: string;
  trustElements: string[];
  visualLanguage: string;
}

export type GiftProspectStatus = "active" | "archived";

export interface GiftProtocolProspect {
  id: string;
  retainer_prospect_id: string | null;
  business_name: string;
  category: string | null;
  owner_name: string | null;
  owner_confidence: DossierConfidence | null;
  address: string | null;
  phone: string | null;
  website_current: string | null;
  dossier: DossierFact[];
  do_not_use_notes: string | null;
  site_brief: SiteBrief | null;
  flyer_copy_options: string[];
  flyer_copy_selected: string | null;
  qr_target_url: string | null;
  status: GiftProspectStatus;
  created_at: string;
}

export type GiftDeliveryStatus = "not_started" | "packed" | "shipped" | "in_transit" | "delivered_signed" | "exception";

export interface GiftProtocolDelivery {
  id: string;
  gift_protocol_prospect_id: string;
  ship_method: string;
  tracking_number: string | null;
  ship_date: string | null;
  delivery_status: GiftDeliveryStatus;
  signer_name: string | null;
  follow_up_date: string | null;
  followed_up: boolean;
  checklist: ChecklistItem[];
}

// ─── System Health Layer (v3.1) ────────────────────────────────────────────

export type HealthStatus = "active" | "attention" | "not_set_up" | "error";

export type HealthModule = "salvage" | "ssf" | "digest" | "stock_feed_guard" | "retainers" | "gift_protocol" | "facebook";

export interface SystemHealthEvent {
  id: string;
  module: string;
  event_type: string;
  status: "ok" | "error";
  detail: string | null;
  created_at: string;
}

export interface ExternalBlocker {
  id: string;
  label: string;
  submitted_at: string | null;
  typical_turnaround_days: number | null;
  resolved: boolean;
  note: string | null;
}

export interface ModuleHealth {
  module: HealthModule;
  status: HealthStatus;
  detail: string;
}
