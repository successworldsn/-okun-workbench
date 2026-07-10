# OKUN Workbench v3.1 — Two-Engine Operations Console

Single Next.js app (Vercel) + Supabase backend + n8n for automations. Mobile-first —
built for the operator working from a phone at auctions, the shop, and on the move.
Two users, real per-user login: EJ (full access), Usman (parts modules only —
enforced by `middleware.ts` + `lib/route-access.ts`, not just a table flag; see
**Authentication** below).

v3.1 is a visual reskin on top of the same working system (dark "sacred
geometry" theme — see `tailwind.config.ts`/`globals.css`) plus the System
Health Layer: real status pills per module (never hardcoded green — see
**System Health** below), driven by actual data, not decoration.

Sibling to [okun-capital](../okun-capital) (real-estate wholesaling) and
[okun-scanner](../okun-scanner) (auction demand scanner) — same house style:
server components over a typed data layer, DEMO_MODE fallback when creds are
absent, money math in tested code rather than automation-canvas Function nodes,
human-in-the-loop at every dollar.

## Global rules (enforced in code, not comments)

1. **No autonomous spending.** Agents draft, queue, prepare — a human taps
   approve. Buy-queue decisions, inventory sales, and SSF listing publishes all
   require a tap. The one exception is the Stock-Feed Guard (`/api/ssf/stock-feed-guard`),
   which is allowed to run fully autonomously *because it only ever ends
   listings* — it never spends or publishes, so Global Rule 1 doesn't apply to it.
2. **Progressive autonomy.** `ssf_gates` is a runtime table (tier, listing cap,
   approval mode) checked at request time by `lib/ssf-gates.ts` on every draft/
   approve action — not a comment or a constant. An out-of-stock cancellation
   drops one tier and locks 14 days automatically (`applyOutOfStockCancellationPenalty`).
3. **Graceful degradation.** The ledger is append-only by Postgres trigger
   (`forbid_ledger_mutation`), not by convention — an `UPDATE`/`DELETE` raises.
4. **Every buy/sale/expense/return writes to the ledger**, channel-tagged
   `salvage | ssf | fbm`.

## What's built vs. roadmap

| Component | Status |
|---|---|
| Full schema (`ssf_orders.sale_price` added in Phase B) | ✅ Applied to Supabase project `okun-workbench` (`mdxhwvfnyppchxkgrvus`, us-east-1) |
| Append-only ledger (trigger-enforced), RLS on every table (service-role only) | ✅ |
| **Phase A** — Buy Queue, Inventory, Ledger + Expenses, Today Screen, SMS digest | ✅ |
| **Phase B — SSF catalog** (`/ssf/catalog`): manual CSV price-file upload, upsert, stale flags (7d amber / 14d blocks new listings) | ✅ |
| **Phase B — Demand-gap scanner** (`/ssf/scan`): Terapeak-style CSV in, ranked gap score out (velocity + margin + scarcity + niche bonus + commodity penalty, full WHY breakdown). Stateless — nothing persisted. | ✅. eBay Browse API live-supply cross-check is stubbed (`lib/ebay-browse.ts`) pending production API keys. |
| **Phase B — Listing pipeline** (`/ssf/listings`): draft (Claude, template fallback without a key) → VeRO guard (deterministic, tested, `lib/vero-guard.ts`) → human approve → publish | ✅ pipeline. Publish itself is stubbed (`lib/ebay.ts`) — nothing goes live on eBay until production API access lands, by design. |
| **Phase B — Stock-Feed Guard** (`POST /api/ssf/stock-feed-guard`): autonomous, no cap/gate, rechecks live listings vs. catalog stock/margin floor, auto-ends + logs | ✅ endpoint + n8n cron JSON. **Not yet scheduled.** Ending is local-only without eBay creds — see the endpoint's `note` field. |
| **Phase B — Order flow** (`/ssf/orders`): eBay sale webhook stub → order task card → fulfillment mode → tracking → ledger entry | ✅. Webhook payload shape is a best guess pending real eBay webhook docs/testing. |
| **Phase C — Retainer pipeline** (`/retainers`): kanban by stage, Prospect Researcher (Claude), Outreach Drafter | ✅. Prospect Researcher only works from what's typed in — the spec's after-hours Twilio test-call and reviews/website pull aren't built. Outreach Drafter uses a generic warm-outreach prompt for *non*-Gift-Protocol prospects (see the real Gift Protocol module below). |
| **Phase C — Deal tracker** (`/deals`): Judylyn checklist (toggle), countdown, buyer outreach log, Claude-drafted buyer blasts | ✅ |
| **Phase C — Facebook module** (`/facebook`): heavy-item Marketplace drafts (Claude + template fallback) for `local_only` inventory, one-tap inquiry log | ✅. Manual posting only — no Marketplace API automation exists (none reliable does) and browser automation was explicitly ruled out as a ToS risk. Messenger auto-responder is a status readout only (`lib/fb-gate.ts`, tested) — gate-locked at ≥15 legit inquiries/week × 2 consecutive weeks; **there is nothing to enable even once eligible**, per spec it doesn't get built until then. |
| **Phase C — Catalog checklist** (`/catalog-checklist`) | ✅ Static, no AI, seeded with 16 masters + PRO/distributor/publishing-admin/sync-submission items |
| **Module 3 patch — Gift Protocol** (`/retainers/gift-protocol`): confidence-tagged dossier builder, free-site brief + flyer copy generators (Claude, `usableFacts()`-restricted), package checklist, physical delivery tracker | ✅. Hard cap of 5 active dossiers, tested (`lib/gift-protocol.test.ts`). Seeded with the 4 real researched College Park/South Fulton GA prospects (Hubbard DDS, High Definition Cutz, Kendra Robinson & Associates, Conquest Auto Repair) — real data, not placeholders; every dossier fact is tagged `confirmed` or `single_source` (an `approved_for_use` tap gates single-source facts before they can reach flyer/site copy), and "inferred" facts were never even given a place to be stored. USPS live tracking is stubbed (`lib/usps.ts`) — v1 delivery status is manual entry, which is the actual primary path per spec, not a fallback. QR code image generation isn't wired (no library integrated) — the flyer step notes the live-site URL as text; printing the QR is a manual step for now. |
| **v3.1 — Auth** (`/login`, `middleware.ts`): per-user session login, EJ full access / Usman parts-only route gating | ✅ Web Crypto HMAC session cookie (`lib/session.ts`, Edge-safe), Node scrypt password hashing (`lib/auth.ts`, login-route-only). **DEMO_MODE bypasses auth entirely** — no real Supabase creds means no real users to check, so don't mistake local dev working without login for the real thing being verified; only actually enforced once `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` are set. No password-change UI yet — see **Authentication**. |
| **v3.1 — System Health Layer**: real status pill (active/attention/not_set_up/error) per module, Diagnose button (Claude-backed plain-English read + Try It / Copy Fix), External Blockers panel on Today | ✅ `lib/system-health.ts` (pure combinators, tested), `system_health_events` + `external_blockers` tables. Every check is real data (ledger recency, catalog freshness, credential presence, logged cron runs) — if a check can't be built, the pill says not_set_up, never green. |
| **v3.1 — Visual reskin**: dark "sacred geometry" theme, Space Grotesk/Inter/JetBrains Mono, CSS-only animated background (no JS render loop) | ✅ Same components/pages as before, restyled — no logic changes from the reskin itself. |

Tests: `npm test` runs 8 suites via `node --test` — `lib/vero-guard.test.ts` (6),
`lib/ssf-gates.test.ts` (9), `lib/fb-gate.test.ts` (4, catches a real UTC/local
timezone week-boundary bug found during Phase C verification), `lib/gift-protocol.test.ts`
(4 — cap enforcement, confidence filtering, business-day math), `lib/system-health.test.ts`
(11), `lib/session.test.ts` (5), `lib/auth.test.ts` (4), `lib/route-access.test.ts`
(4, including a "session TS type-checking bug" caught during the v3.1 build —
see git history on `lib/session.ts`). The rule
engines tested are the ones where a bug either loses the eBay account (VeRO),
breaks the spend-safety promise (SSF gates, Gift Protocol cap), silently
miscounts toward an autonomy threshold (Messenger gate), or lets an
unverified fact slip into outreach (Gift Protocol confidence filter).

## Setup

Requires Node ≥ 18.

```bash
cd okun-workbench
cp .env.example .env.local     # fill in Supabase service-role key + Twilio + digest secret
npm install
npm run dev                    # http://localhost:3000 — runs in demo mode without creds
npm test                       # vero-guard + ssf-gates + fb-gate unit tests, no creds needed
```

**Demo mode**: with no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, every page
renders off deterministic sample data (see `lib/db.ts`) so you can review the
UI without touching the real database. Try it with the sample files:
`sample-ssf-catalog.csv` (upload on `/ssf/catalog`) and `sample-ssf-demand.csv`
(upload on `/ssf/scan`).

**Supabase**: project `okun-workbench` (id `mdxhwvfnyppchxkgrvus`, region
us-east-1) already has the full schema applied — see `schema.sql`. Grab the
`service_role` key from Project Settings > API and put it in `.env.local`. It
is deliberately not fetchable via the Supabase MCP tools (secret, not a
publishable key).

**Twilio digest**: set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` /
`TWILIO_FROM_NUMBER` / `DIGEST_TO_NUMBER` / `DIGEST_SECRET`, deploy, then
import `n8n/daily-digest.json` into your n8n instance and set
`OKUN_WORKBENCH_URL` + `OKUN_DIGEST_SECRET` env vars there. Without Twilio
creds, `POST /api/digest` still computes and returns the digest text (useful
for testing) but reports `sent: false`.

**Stock-Feed Guard**: import `n8n/stock-feed-guard.json` the same way (reuses
`DIGEST_SECRET`). Runs every 4h once activated. Until `EBAY_*` creds are set,
it still recomputes and ends listings *in our own database*, but can't reach
the real eBay listing — check the `note` field in its response.

**Claude (listing drafter)**: set `ANTHROPIC_API_KEY`. Without it, drafts fall
back to a plain template — boring on purpose, so it can't itself trip the
VeRO guard.

## Authentication

Real per-user login, not a shared password — `app_users.access_scope` decides
what a session can reach, enforced in `middleware.ts` on every request via
`lib/route-access.ts`. Usman (`parts_only`) can reach Today + Buy Queue +
Inventory + Ledger + everything under `/ssf`; everything else (Retainers,
Gift Protocol, Deals, Facebook, Catalog Checklist) redirects him to Today.
EJ (`full`) reaches everything.

**Critical caveat**: `middleware.ts` bypasses auth entirely when `DEMO_MODE`
is on (no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) — there's no real user
to check credentials against in that state. Login only actually enforces once
real Supabase creds are set. Don't take "it works without logging in" in
local dev as evidence the gate works — it's *supposed* to be open in demo mode.

**Setup**:
1. Set `SESSION_SECRET` in `.env.local` — any long random string
   (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   Signs the session cookie via Web Crypto HMAC (`lib/session.ts`) — Edge-safe,
   so it works inside `middleware.ts`, unlike Node's `crypto` module.
2. Provision real user credentials — there's no signup flow by design (2 fixed
   users). Hash a password and set it directly:
   ```js
   // node -e with lib/auth.ts's hashPassword(), or inline:
   const { scryptSync, randomBytes } = require("crypto");
   const salt = randomBytes(16).toString("hex");
   const hash = scryptSync("the-real-password", salt, 64).toString("hex");
   console.log(`${salt}:${hash}`); // -> update app_users set password_hash = '...' where username = 'ej';
   ```
3. Initial credentials were generated and hashed into the live `app_users`
   table when this was built — ask in-session for the plaintext (not stored
   in any file, per the "never commit secrets" rule). Change them once you're
   in; there's no password-change UI yet, so that still means re-hashing and
   updating the row directly.

No password-reset flow, no email verification, no MFA — deliberately minimal
for a 2-person internal tool. If this ever grows past 2 known users, revisit
with a real auth provider instead of extending this by hand.

## Two things this build cannot do for you

1. **Net10th drop-ship approval** with the SSF rep — confirm this week, it
   gates the `fulfillment_mode` choice on every SSF order (`/ssf/orders`).
2. **eBay production API application** — submit it now. Nothing in the SSF
   channel actually reaches eBay (publish, end, tracking upload, live Browse
   supply counts) until `EBAY_APP_ID`/`EBAY_CERT_ID`/`EBAY_DEV_ID`/
   `EBAY_REFRESH_TOKEN` are set — every one of those calls is stubbed and says
   so explicitly rather than pretending to have worked.

## Architecture

```
                    n8n (self-hosted / cloud)
        daily-digest (7am)     stock-feed-guard (4h, autonomous)
                 │                        │
                 ▼                        ▼
   Twilio ◄── /api/digest      /api/ssf/stock-feed-guard
                 │                        │
                 └───────────┬────────────┘
                    ┌─────────┴──────────┐
    eBay (stub) ◄──►│    Next.js app      │◄── eBay sale webhook (stub)
                    │  (Vercel, App        │        /api/webhooks/ebay-order
    Claude ◄────────│   Router, server      │
   (listing drafts) │   actions)            │
                    └─────────┬──────────┘
                             │ service-role key, server-only
                             ▼
                    Supabase Postgres
   buy_queue · inventory · ledger (append-only, trigger-
   enforced) · expenses · ssf_catalog · ssf_listings ·
   ssf_orders · ssf_gates · retainer_prospects · deals
```

**Why this shape.** Same reasoning as okun-capital: the money math (ledger
writes, margin/days-to-sell calc, append-only enforcement, VeRO rules,
autonomy-gate math) lives in tested server code and a DB trigger, not in an
n8n Function node or a prompt. n8n stays thin — schedule crons, call the app's
HTTP API. The Claude wrapper and eBay client are single choke points
(`lib/claude.ts`, `lib/ebay.ts`) so swapping providers or wiring real eBay
access later touches one file each, not every call site.
