/**
 * eBay Sell/Inventory API client — publish and end listings. Blocked on
 * production API approval (the long pole called out in the build spec).
 * Until EBAY_APP_ID/EBAY_CERT_ID/EBAY_DEV_ID (+ a stored refresh token) are
 * configured, every call returns NOT_CONFIGURED — nothing pretends to have
 * published or ended a real listing.
 */
const APP_ID = process.env.EBAY_APP_ID;
const CERT_ID = process.env.EBAY_CERT_ID;
const REFRESH_TOKEN = process.env.EBAY_REFRESH_TOKEN;

export const EBAY_CONFIGURED = Boolean(APP_ID && CERT_ID && REFRESH_TOKEN);

export interface EbayResult {
  ok: boolean;
  ebayListingId?: string;
  error?: string;
}

export async function publishListing(_params: {
  sku: string;
  title: string;
  description: string;
  itemSpecifics: Record<string, string>;
  price: number;
  quantity: number;
  handlingTimeDays: number;
}): Promise<EbayResult> {
  if (!EBAY_CONFIGURED) {
    return { ok: false, error: "eBay Sell API not configured — production API approval pending (see README)" };
  }
  // TODO once approved: OAuth refresh-token grant, then createOrReplaceInventoryItem
  // + createOffer + publishOffer against the Sell Inventory API.
  return { ok: false, error: "not implemented yet" };
}

export async function endListing(_ebayListingId: string, _reason: string): Promise<EbayResult> {
  if (!EBAY_CONFIGURED) {
    return { ok: false, error: "eBay Sell API not configured — production API approval pending (see README)" };
  }
  // TODO once approved: withdrawOffer against the Sell Inventory API.
  return { ok: false, error: "not implemented yet" };
}

export async function uploadTracking(_ebayOrderId: string, _trackingNumber: string, _carrier = "USPS"): Promise<EbayResult> {
  if (!EBAY_CONFIGURED) {
    return { ok: false, error: "eBay Fulfillment API not configured — production API approval pending (see README)" };
  }
  // TODO once approved: POST shipping_fulfillment against the Sell Fulfillment API.
  return { ok: false, error: "not implemented yet" };
}
