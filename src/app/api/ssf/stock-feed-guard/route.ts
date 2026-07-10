/**
 * Stock-Feed Guard — Module 2d, the one fully autonomous SSF workflow. No cap,
 * no approval gate: it only ever ENDS listings, never spends or publishes, so
 * Global Rule 1 (no autonomous spending) doesn't apply to it. Rechecks every
 * live listing against current catalog stock/margin; out-of-stock or
 * below-margin-floor gets ended immediately and logged.
 *
 * Honest limitation: without EBAY_* production creds, "ending" a listing here
 * only updates our own ssf_listings row — the real eBay listing stays live
 * until the API call actually works. The response says so explicitly so this
 * never gets mistaken for real coverage.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsfListings, getSsfCatalog, updateSsfListingStatus, logHealthEvent } from "@/lib/db";
import { getSsfConfig } from "@/lib/ssf-config";
import { endListing, EBAY_CONFIGURED } from "@/lib/ebay";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [live, catalog] = await Promise.all([getSsfListings("live"), getSsfCatalog()]);
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const config = getSsfConfig();

  const ended: Array<{ id: string; sku?: string; reason: string; ebayCallOk: boolean }> = [];

  for (const listing of live) {
    const item = listing.ssf_catalog_id ? catalogById.get(listing.ssf_catalog_id) : null;
    if (!item) continue;

    let reason: string | null = null;
    if (item.stock_status !== "in_stock") {
      reason = `Stock gone: catalog status is "${item.stock_status}"`;
    } else if (item.our_cost !== null && listing.list_price) {
      const fees = listing.list_price * config.ebay_fee_pct;
      const promo = listing.list_price * config.promo_pct;
      const marginPct = (listing.list_price - item.our_cost - fees - promo) / listing.list_price;
      if (marginPct < config.margin_floor_pct) {
        reason = `Price moved beyond margin floor: ${Math.round(marginPct * 100)}% < ${Math.round(config.margin_floor_pct * 100)}% floor`;
      }
    }

    if (reason) {
      const ebayResult = listing.ebay_listing_id ? await endListing(listing.ebay_listing_id, reason) : { ok: false, error: "no ebay_listing_id on file" };
      await updateSsfListingStatus(listing.id, "ended", { endReason: reason });
      ended.push({ id: listing.id, sku: listing.ssf_part_number, reason, ebayCallOk: ebayResult.ok });
    }
  }

  await logHealthEvent("ssf", "stock_feed_guard_run", "ok", `checked ${live.length}, ended ${ended.length}`);

  return NextResponse.json({
    checked: live.length,
    ended: ended.length,
    endedItems: ended,
    ebayApiConfigured: EBAY_CONFIGURED,
    note: EBAY_CONFIGURED ? undefined : "eBay API not configured — listings were ended locally only, the real eBay listings are still live until production API access is wired up",
  });
}
