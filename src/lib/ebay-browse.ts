/**
 * eBay Browse API — live active-listing supply counts, to cross-check the
 * Terapeak CSV's active_count. Same "long pole" blocker as okun-scanner Phase 2:
 * needs production API keys, which are pending approval (see README). Until
 * EBAY_APP_ID/EBAY_CLIENT_SECRET are set, every call returns unavailable rather
 * than silently pretending the CSV number is live data.
 */
const APP_ID = process.env.EBAY_APP_ID;
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

export const EBAY_BROWSE_CONFIGURED = Boolean(APP_ID && CLIENT_SECRET);

export interface LiveSupplyResult {
  available: boolean;
  activeCount?: number;
  reason?: string;
}

export async function getLiveActiveCount(_query: string): Promise<LiveSupplyResult> {
  if (!EBAY_BROWSE_CONFIGURED) {
    return { available: false, reason: "eBay Browse API not configured — EBAY_APP_ID/EBAY_CLIENT_SECRET missing (production API approval pending)" };
  }
  // TODO Phase B follow-up once eBay production keys land: OAuth client-credentials
  // grant, then GET /buy/browse/v1/item_summary/search?q=... and count item_summaries.
  return { available: false, reason: "not implemented yet" };
}
