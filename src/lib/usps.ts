/**
 * USPS tracking check — v1 is manual entry (see the Gift Protocol delivery
 * tracker UI), this is the optional automated cross-check the spec mentions
 * ("simple scheduled USPS tracking check, no paid API needed at this
 * volume"). USPS Web Tools requires a registered User ID even for the free
 * tier; until USPS_USER_ID is set, this returns unavailable rather than
 * faking a status. Manual entry always works regardless of this file.
 */
const USER_ID = process.env.USPS_USER_ID;

export const USPS_CONFIGURED = Boolean(USER_ID);

export interface UspsTrackResult {
  available: boolean;
  status?: string;
  signerName?: string;
  reason?: string;
}

export async function trackPackage(_trackingNumber: string): Promise<UspsTrackResult> {
  if (!USPS_CONFIGURED) {
    return { available: false, reason: "USPS_USER_ID not configured — use manual status entry (v1 path)" };
  }
  // TODO if/when wired: USPS Web Tools TrackFieldRequest (free tier, XML API),
  // parse <Status>/<EventCity>/<SignedBy> — no paid API needed at this volume.
  return { available: false, reason: "not implemented yet" };
}
