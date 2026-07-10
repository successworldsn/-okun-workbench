/**
 * eBay Marketplace Account Deletion/Closure notification endpoint.
 *
 * This is what unblocks the production keyset — eBay disables every new
 * production app until it either implements this endpoint or the developer
 * files for an exemption. We store buyer names on ssf_orders, so an
 * exemption isn't a clean claim; implementing the real endpoint is the
 * honest path.
 *
 * Setup (do this in the eBay Developer Portal, Application Keys page, under
 * "Notifications" / "Marketplace Account Deletion"):
 *   1. Set EBAY_VERIFICATION_TOKEN below to any string 32-80 chars, letters/
 *      numbers/underscore/hyphen only. Put the SAME string in eBay's config.
 *   2. Endpoint URL in eBay's config must be this route's full production
 *      URL, e.g. https://<your-deployed-domain>/api/webhooks/ebay-account-deletion
 *   3. eBay calls GET once to verify (see below), then POST on real deletions.
 *
 * GET verification: eBay sends ?challenge_code=X, expects back
 *   {"challengeResponse": sha256_hex(challengeCode + verificationToken + endpointURL)}
 * per eBay's documented algorithm — order matters, no separators.
 */
import { NextRequest, NextResponse } from "next/server";
import { computeChallengeResponse } from "@/lib/ebay-account-deletion";
import { redactBuyerNamesMatching } from "@/lib/db";

const VERIFICATION_TOKEN = process.env.EBAY_VERIFICATION_TOKEN;

export async function GET(req: NextRequest) {
  const challengeCode = req.nextUrl.searchParams.get("challenge_code");
  if (!challengeCode) {
    return NextResponse.json({ error: "missing challenge_code" }, { status: 400 });
  }
  if (!VERIFICATION_TOKEN) {
    return NextResponse.json({ error: "EBAY_VERIFICATION_TOKEN not configured" }, { status: 500 });
  }
  const endpointUrl = `${req.nextUrl.protocol}//${req.nextUrl.host}${req.nextUrl.pathname}`;
  return NextResponse.json({ challengeResponse: computeChallengeResponse(challengeCode, VERIFICATION_TOKEN, endpointUrl) });
}

interface EbayDeletionNotification {
  metadata?: { topic?: string };
  notification?: {
    data?: {
      username?: string;
      userId?: string;
      eiasToken?: string;
    };
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as EbayDeletionNotification;
  const username = body.notification?.data?.username;

  // Ack fast — eBay expects a quick 200, do the purge without blocking the response shape.
  if (username) {
    await redactBuyerNamesMatching(username);
  }

  return NextResponse.json({ ok: true });
}
