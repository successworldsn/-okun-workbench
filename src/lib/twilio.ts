/**
 * Twilio SMS send — plain fetch against the REST API, no SDK, matching the
 * zero-runtime-dependency style of okun-capital's backend. Server-only.
 */
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

export const TWILIO_CONFIGURED = Boolean(ACCOUNT_SID && AUTH_TOKEN && FROM_NUMBER);

export async function sendSms(to: string, body: string): Promise<{ sent: boolean; sid?: string; error?: string }> {
  if (!TWILIO_CONFIGURED) {
    return { sent: false, error: "Twilio not configured (TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER)" };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM_NUMBER as string, Body: body }).toString(),
  });
  const data = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) return { sent: false, error: data.message ?? `Twilio ${res.status}` };
  return { sent: true, sid: data.sid };
}
