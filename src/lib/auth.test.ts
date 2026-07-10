import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./auth.ts";

test("verifyPassword accepts the correct password", () => {
  const hash = hashPassword("correct-horse-battery-staple");
  assert.equal(verifyPassword("correct-horse-battery-staple", hash), true);
});

test("verifyPassword rejects a wrong password", () => {
  const hash = hashPassword("correct-horse-battery-staple");
  assert.equal(verifyPassword("wrong-password", hash), false);
});

test("two hashes of the same password differ (random salt)", () => {
  const a = hashPassword("same-password");
  const b = hashPassword("same-password");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("same-password", a), true);
  assert.equal(verifyPassword("same-password", b), true);
});

test("verifyPassword rejects malformed stored hash rather than throwing", () => {
  assert.equal(verifyPassword("anything", "not-a-valid-hash"), false);
  assert.equal(verifyPassword("anything", ""), false);
});
