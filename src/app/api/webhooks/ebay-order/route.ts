/**
 * eBay sale webhook (Module 2e). Real signature/challenge verification against
 * eBay's Marketplace Account Deletion / order-notification scheme still needs
 * to be wired once production API access lands — this validates a shared
 * secret only, matching every other inbound endpoint in this app until then.
 * Shape of the expected payload is a minimal guess at eBay's order-notification
 * body; adjust field names against the real payload the moment webhooks arrive.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSsfListings, createSsfOrder } from "@/lib/db";

interface InboundEbayOrder {
  ebayOrderId: string;
  ebayListingId: string;
  buyerName?: string;
  salePrice: number;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as InboundEbayOrder;
  if (!body.ebayOrderId || !body.ebayListingId || !body.salePrice) {
    return NextResponse.json({ error: "missing ebayOrderId/ebayListingId/salePrice" }, { status: 400 });
  }

  const live = await getSsfListings("live");
  const listing = live.find((l) => l.ebay_listing_id === body.ebayListingId);
  if (!listing) {
    return NextResponse.json({ error: `No live listing found for ebayListingId ${body.ebayListingId}` }, { status: 404 });
  }

  const order = await createSsfOrder({
    ssf_listing_id: listing.id,
    ebay_order_id: body.ebayOrderId,
    buyer_name: body.buyerName ?? null,
    our_cost: listing.our_cost ?? null,
    sale_price: body.salePrice,
  });

  return NextResponse.json({ created: order.id });
}
