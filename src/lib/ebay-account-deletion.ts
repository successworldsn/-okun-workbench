/**
 * eBay Marketplace Account Deletion challenge-response — pure function so the
 * hash algorithm (order-sensitive, easy to get wrong) is unit-tested rather
 * than trusted inline in the route handler.
 */
import { createHash } from "node:crypto";

export function computeChallengeResponse(challengeCode: string, verificationToken: string, endpointUrl: string): string {
  const hash = createHash("sha256");
  hash.update(challengeCode);
  hash.update(verificationToken);
  hash.update(endpointUrl);
  return hash.digest("hex");
}
