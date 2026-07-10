import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { computeChallengeResponse } from "./ebay-account-deletion.ts";

test("matches an independently computed sha256(challengeCode + token + endpoint) hex digest", () => {
  const challengeCode = "abc123";
  const token = "my-verification-token-1234567890";
  const endpoint = "https://example.com/api/webhooks/ebay-account-deletion";

  const expected = createHash("sha256").update(challengeCode).update(token).update(endpoint).digest("hex");
  assert.equal(computeChallengeResponse(challengeCode, token, endpoint), expected);
});

test("is deterministic — same inputs, same output", () => {
  const a = computeChallengeResponse("x", "y", "z");
  const b = computeChallengeResponse("x", "y", "z");
  assert.equal(a, b);
});

test("is order-sensitive — concatenation order matters, per eBay's spec", () => {
  const forward = computeChallengeResponse("a", "b", "c");
  const swapped = computeChallengeResponse("b", "a", "c");
  assert.notEqual(forward, swapped);
});

test("produces a 64-char hex string (sha256 digest)", () => {
  const result = computeChallengeResponse("code", "token", "https://x.com/hook");
  assert.match(result, /^[0-9a-f]{64}$/);
});
