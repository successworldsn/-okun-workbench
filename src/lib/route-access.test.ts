import { test } from "node:test";
import assert from "node:assert/strict";
import { canAccessPath } from "./route-access.ts";

test("full access can reach anything", () => {
  assert.equal(canAccessPath("full", "/retainers/gift-protocol"), true);
  assert.equal(canAccessPath("full", "/deals"), true);
  assert.equal(canAccessPath("full", "/buy-queue"), true);
});

test("parts_only can reach Today, salvage, and SSF routes", () => {
  assert.equal(canAccessPath("parts_only", "/"), true);
  assert.equal(canAccessPath("parts_only", "/buy-queue"), true);
  assert.equal(canAccessPath("parts_only", "/inventory"), true);
  assert.equal(canAccessPath("parts_only", "/ledger"), true);
  assert.equal(canAccessPath("parts_only", "/ssf/catalog"), true);
  assert.equal(canAccessPath("parts_only", "/ssf/listings"), true);
});

test("parts_only is blocked from retainers, deals, facebook, catalog checklist", () => {
  assert.equal(canAccessPath("parts_only", "/retainers"), false);
  assert.equal(canAccessPath("parts_only", "/retainers/gift-protocol"), false);
  assert.equal(canAccessPath("parts_only", "/deals"), false);
  assert.equal(canAccessPath("parts_only", "/facebook"), false);
  assert.equal(canAccessPath("parts_only", "/catalog-checklist"), false);
});

test("prefix matching doesn't false-positive on similarly-named routes", () => {
  // /ledgerish should NOT match the /ledger prefix
  assert.equal(canAccessPath("parts_only", "/ledgerish"), false);
  assert.equal(canAccessPath("parts_only", "/inventoryzzz"), false);
});
