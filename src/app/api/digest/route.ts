/**
 * Digest trigger endpoint. Called by the n8n daily-digest cron (see
 * n8n/daily-digest.json), gated by a shared secret so it can't be hit blind.
 * This is the one automated SMS in Phase A — informational only, no spend.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildDigestText } from "@/lib/digest";
import { sendSms, TWILIO_CONFIGURED } from "@/lib/twilio";
import { logHealthEvent } from "@/lib/db";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const text = await buildDigestText();
  const to = process.env.DIGEST_TO_NUMBER;

  if (!TWILIO_CONFIGURED || !to) {
    // No health event logged here — the credential check already reports
    // not_set_up correctly; logging an "ok" event with nothing sent would lie.
    return NextResponse.json({ sent: false, reason: "Twilio or DIGEST_TO_NUMBER not configured", text });
  }

  const result = await sendSms(to, text);
  await logHealthEvent("digest", "sms_sent", result.sent ? "ok" : "error", result.error ?? undefined);
  return NextResponse.json({ ...result, text });
}

export async function GET(req: NextRequest) {
  // Preview the digest text without sending — handy for checking before wiring the cron.
  const secret = req.headers.get("x-digest-secret");
  if (!process.env.DIGEST_SECRET || secret !== process.env.DIGEST_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const text = await buildDigestText();
  return NextResponse.json({ text });
}
