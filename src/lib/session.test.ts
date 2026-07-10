import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "./session.ts";
import type { SessionPayload } from "./types.ts";

process.env.SESSION_SECRET = "test-secret-do-not-use-in-production-1234567890";

const payload: SessionPayload = { userId: "u-1", name: "EJ", role: "ej", accessScope: "full", exp: Math.floor(Date.now() / 1000) + 3600 };

test("sign then verify roundtrips the payload", async () => {
  const token = await signSession(payload);
  const verified = await verifySession(token);
  assert.deepEqual(verified, payload);
});

test("tampered token fails verification", async () => {
  const token = await signSession(payload);
  const tampered = token.slice(0, -4) + "abcd";
  const verified = await verifySession(tampered);
  assert.equal(verified, null);
});

test("expired token fails verification", async () => {
  const expired: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) - 10 };
  const token = await signSession(expired);
  const verified = await verifySession(token);
  assert.equal(verified, null);
});

test("missing/empty token returns null, not a throw", async () => {
  assert.equal(await verifySession(null), null);
  assert.equal(await verifySession(undefined), null);
  assert.equal(await verifySession(""), null);
});

test("malformed token returns null, not a throw", async () => {
  assert.equal(await verifySession("not-a-real-token"), null);
});
