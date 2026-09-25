import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIntel, validateItem, matchesMarket, isRecordUrl, toMarketFilter, sortItems } from "./intel-feed.ts";

const good = {
  id: "warn-fl-2026-09-24-1",
  feed: "city-signals",
  title: "WARN notice: 120 layoffs at a Jacksonville distribution center",
  source: "Florida WARN notices",
  source_url: "https://example.org/warn/fl/12345",
  detected_at: "2026-09-24",
  geo: { state: "FL", county: "Duval", city: "Jacksonville", market: "duval" },
  category: "workforce",
  meaning: "m",
  opportunity: "o",
  action: "a",
  priority: "high",
};

test("v1 feed yields no items and says why", () => {
  const r = parseIntel({ generated_at_et: "x", translator: [{ title: "t" }], money_strip: [] });
  assert.equal(r.items.length, 0);
  assert.equal(r.cards.length, 0);
  assert.match(r.notReady ?? "", /v1/);
});

test("a correct v2 item passes", () => {
  const r = validateItem(good);
  assert.ok("item" in r);
});

test("items without a record source_url are dropped", () => {
  assert.ok("reason" in validateItem({ ...good, source_url: "" }));
  assert.ok("reason" in validateItem({ ...good, source_url: "https://example.org/" }));
  assert.equal(isRecordUrl("https://www.grants.gov/search-results-detail/123"), true);
  assert.equal(isRecordUrl("ftp://x/y"), false);
});

test("Broward / Palm Beach items filed as miami-dade are dropped", () => {
  const r = validateItem({ ...good, title: "$89M Fort Lauderdale tower", geo: { state: "FL", market: "miami-dade" } });
  assert.ok("reason" in r);
});

test("phones and emails anywhere in an item are dropped", () => {
  assert.ok("reason" in validateItem({ ...good, action: "Call (305) 555-1234" }));
  assert.ok("reason" in validateItem({ ...good, meaning: "email ops@example.com" }));
});

test("NIH / clinical-trial grants are dropped", () => {
  const g = { ...good, feed: "money-found", title: "Phase II clinical trial of X", source_url: "https://www.grants.gov/search-results-detail/1" };
  assert.ok("reason" in validateItem(g));
  assert.ok("reason" in validateItem({ ...g, title: "Small business grant", agencyCode: "HHS-NIH11" }));
  assert.ok("item" in validateItem({ ...g, title: "Small business grant", agencyCode: "SBA", deadline: "2026-12-01", amount: 50000 }));
});

test("translator cards only show when every cite resolves", () => {
  const r = parseIntel({
    version: 2,
    items: [good, { ...good, id: "bad", source_url: "" }],
    translator: [
      { title: "ok", interpretation: true, cites: [good.id] },
      { title: "cites dropped item", interpretation: true, cites: ["bad"] },
      { title: "no flag", cites: [good.id] },
      { title: "no cites", interpretation: true, cites: [] },
    ],
  });
  assert.deepEqual(r.cards.map((c) => c.title), ["ok"]);
  assert.equal(r.dropped.length, 1);
});

test("duplicate ids are dropped", () => {
  const r = parseIntel({ version: 2, items: [good, good] });
  assert.equal(r.items.length, 1);
  assert.equal(r.dropped[0].reason, "duplicate id");
});

test("market filter", () => {
  assert.equal(matchesMarket("duval", "florida"), true);
  assert.equal(matchesMarket("statewide", "florida"), true);
  assert.equal(matchesMarket("national", "florida"), false);
  assert.equal(matchesMarket("national", "all"), true);
  assert.equal(matchesMarket("alachua", "duval"), false);
  assert.equal(toMarketFilter("duval"), "duval");
  assert.equal(toMarketFilter("nope"), "florida");
  assert.equal(toMarketFilter(undefined), "florida");
});

test("sort: newest first, high priority first on a tie", () => {
  const a = validateItem({ ...good, id: "a", priority: "normal", title: "A" });
  const b = validateItem({ ...good, id: "b", priority: "high", title: "B" });
  const c = validateItem({ ...good, id: "c", detected_at: "2026-09-25", priority: "normal", title: "C" });
  const items = [a, b, c].map((r) => ("item" in r ? r.item : assert.fail()));
  assert.deepEqual(sortItems(items).map((i) => i.id), ["c", "b", "a"]);
});
