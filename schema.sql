-- OKUN Workbench v3 — full schema
-- Phase A tables are load-bearing today. ssf_* / retainer_prospects / deals are
-- schema-complete but only lightly used until Phase B/C build the UI on top.
-- The ledger is append-only by trigger, not convention — see forbid_ledger_mutation.

create extension if not exists pgcrypto;

create type channel_type as enum ('salvage', 'ssf', 'fbm');
create type ledger_entry_type as enum ('buy', 'sale', 'expense', 'return', 'listing');
create type inventory_status as enum ('acquired', 'at_shop', 'listed', 'sold', 'shipped', 'returned');
create type inventory_location as enum ('shop', 'home', 'storage', 'transit');
create type buy_queue_status as enum ('pending', 'bought', 'passed');
create type retainer_stage as enum ('target', 'contacted', 'meeting', 'proposal', 'signed');

-- ============================================================ users
create table app_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role text not null check (role in ('ej', 'usman')),
  access_scope text not null default 'full' check (access_scope in ('full', 'parts_only')),
  -- username + password_hash are NOT NULL in production but nullable here so
  -- this file stays a safe schema reference — real credentials are set via a
  -- one-time provisioning step (see lib/auth.ts), never baked into this file.
  username text unique,
  password_hash text,
  created_at timestamptz not null default now()
);

-- ============================================================ Module 1: salvage buy queue
create table buy_queue (
  id uuid primary key default gen_random_uuid(),
  vehicle_year int,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  lot_number text,
  auction_source text,
  auction_close_at timestamptz not null,
  scanner_score numeric,
  scanner_score_version text,
  suggested_max_bid numeric,
  component_breakdown jsonb,
  status buy_queue_status not null default 'pending',
  pass_reason text,
  bought_price numeric,
  decided_by uuid references app_users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index buy_queue_status_close_idx on buy_queue (status, auction_close_at);

-- ============================================================ Module 1: inventory
create table inventory (
  id uuid primary key default gen_random_uuid(),
  channel channel_type not null default 'salvage',
  buy_queue_id uuid references buy_queue(id),
  description text not null,
  part_number text,
  vehicle_source text,
  status inventory_status not null default 'acquired',
  location inventory_location not null default 'shop',
  local_only boolean not null default false,
  assignee uuid references app_users(id),
  acquired_at timestamptz not null default now(),
  listed_at timestamptz,
  sold_at timestamptz,
  shipped_at timestamptz,
  buy_price numeric,
  list_price numeric,
  sale_price numeric,
  updated_at timestamptz not null default now()
);
create index inventory_status_idx on inventory (status);
create index inventory_acquired_idx on inventory (acquired_at);

-- ============================================================ ledger (append-only, all channels)
create table ledger (
  id uuid primary key default gen_random_uuid(),
  channel channel_type not null,
  entry_type ledger_entry_type not null,
  inventory_id uuid references inventory(id),
  ssf_order_id uuid,
  amount numeric not null default 0,
  fees numeric not null default 0,
  shipping numeric not null default 0,
  net_margin numeric,
  days_to_sell int,
  scanner_score numeric,
  scanner_score_version text,
  refund_amount numeric,
  return_reason text,
  note text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);
create index ledger_channel_idx on ledger (channel, entry_type, created_at desc);

create or replace function forbid_ledger_mutation() returns trigger as $$
begin
  raise exception 'ledger is append-only: % not permitted', tg_op;
end;
$$ language plpgsql
set search_path = pg_catalog, public;

create trigger ledger_no_update before update on ledger
  for each row execute function forbid_ledger_mutation();
create trigger ledger_no_delete before delete on ledger
  for each row execute function forbid_ledger_mutation();

-- ============================================================ Module 1: expenses (two-tap entry)
create table expenses (
  id uuid primary key default gen_random_uuid(),
  channel channel_type not null default 'salvage',
  amount numeric not null,
  category text not null,
  note text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ============================================================ Module 2: SSF new-parts channel (schema now, UI in Phase B)
create table ssf_catalog (
  id uuid primary key default gen_random_uuid(),
  ssf_part_number text not null,
  oem_numbers text[] not null default '{}',
  description text,
  brands text[] not null default '{}',
  fitment jsonb,
  our_cost numeric,
  list_price numeric,
  stock_status text,
  warehouse text check (warehouse in ('kennesaw', 'norcross')),
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index ssf_catalog_part_idx on ssf_catalog (ssf_part_number);

create table ssf_listings (
  id uuid primary key default gen_random_uuid(),
  ssf_catalog_id uuid references ssf_catalog(id),
  ebay_listing_id text,
  title text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'live', 'ended')),
  vero_flagged boolean not null default false,
  vero_flag_reason text,
  approved_by uuid references app_users(id),
  published_at timestamptz,
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz not null default now()
);

create table ssf_orders (
  id uuid primary key default gen_random_uuid(),
  ssf_listing_id uuid references ssf_listings(id),
  ebay_order_id text,
  buyer_name text,
  our_cost numeric,
  sale_price numeric,
  fulfillment_mode text check (fulfillment_mode in ('dropship', 'ship_to_shop')),
  tracking_number text,
  ordered_at timestamptz,
  shipped_at timestamptz,
  deadline_at timestamptz,
  created_at timestamptz not null default now()
);

alter table ledger
  add constraint ledger_ssf_order_fk foreign key (ssf_order_id) references ssf_orders(id);

-- progressive autonomy gates — single-row runtime config, not a suggestion
create table ssf_gates (
  id int primary key default 1,
  tier int not null default 0 check (tier in (0, 1, 2)),
  active_listing_cap int not null default 10,
  approval_mode text not null default 'human' check (approval_mode in ('human', 'batch', 'auto_under_75')),
  locked_until timestamptz,
  lock_reason text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into ssf_gates (id, tier, active_listing_cap, approval_mode)
  values (1, 0, 10, 'human');

-- ============================================================ Module 3: retainer pipeline
create table retainer_prospects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage retainer_stage not null default 'target',
  suggested_offer text,
  brief text,
  phone text,
  website text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================ Module 4: deal tracker (Judylyn + future deals)
create table deals (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Judylyn',
  deadline date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  checklist jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ============================================================ Module 3+4: outreach log (retainer prospects + deal buyers)
create type outreach_kind as enum ('retainer', 'deal_buyer');

create table outreach_log (
  id uuid primary key default gen_random_uuid(),
  kind outreach_kind not null,
  retainer_prospect_id uuid references retainer_prospects(id),
  deal_id uuid references deals(id),
  buyer_name text,
  channel text not null default 'sms',
  message text not null,
  status text not null default 'drafted' check (status in ('drafted', 'sent')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index outreach_log_kind_idx on outreach_log (kind, created_at desc);

-- ============================================================ Module 5: Facebook (heavy-item lister + inquiry log)
create table fb_inquiries (
  id uuid primary key default gen_random_uuid(),
  note text,
  created_at timestamptz not null default now()
);

create table fb_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid references inventory(id),
  title text not null,
  price numeric,
  description text,
  pickup_terms text,
  created_at timestamptz not null default now()
);

-- ============================================================ Module 6: catalog checklist (static, no AI)
create table catalog_checklist_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  done boolean not null default false,
  note text,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

alter table outreach_log enable row level security;
alter table fb_inquiries enable row level security;
alter table fb_listing_drafts enable row level security;
alter table catalog_checklist_items enable row level security;

insert into catalog_checklist_items (category, label, sort_order) values
  ('Masters', 'Master 1 — registered', 1),
  ('Masters', 'Master 2 — registered', 2),
  ('Masters', 'Master 3 — registered', 3),
  ('Masters', 'Master 4 — registered', 4),
  ('Masters', 'Master 5 — registered', 5),
  ('Masters', 'Master 6 — registered', 6),
  ('Masters', 'Master 7 — registered', 7),
  ('Masters', 'Master 8 — registered', 8),
  ('Masters', 'Master 9 — registered', 9),
  ('Masters', 'Master 10 — registered', 10),
  ('Masters', 'Master 11 — registered', 11),
  ('Masters', 'Master 12 — registered', 12),
  ('Masters', 'Master 13 — registered', 13),
  ('Masters', 'Master 14 — registered', 14),
  ('Masters', 'Master 15 — registered', 15),
  ('Masters', 'Master 16 — registered', 16),
  ('PRO', 'PRO membership active (ASCAP/BMI/SESAC)', 20),
  ('PRO', 'All 16 masters registered with PRO', 21),
  ('Distributor', 'Distributor account set up', 30),
  ('Distributor', 'All 16 masters uploaded/scheduled', 31),
  ('Publishing admin', 'Publishing administrator signed', 40),
  ('Publishing admin', 'Splits/ownership documented per master', 41),
  ('Sync submissions', 'Sync licensing rep/platform set up', 50),
  ('Sync submissions', 'Catalog one-sheet prepared for sync pitches', 51);

-- ============================================================ Module 3 patch: Gift Protocol
-- Hard cap of 5 active dossiers, enforced in code (lib/gift-protocol.ts), not
-- just convention. "inferred" is deliberately NOT a valid dossier_confidence
-- value — those facts are never persisted at all, only confirmed/single_source.
create type dossier_confidence as enum ('confirmed', 'single_source');
create type gift_delivery_status as enum ('not_started', 'packed', 'shipped', 'in_transit', 'delivered_signed', 'exception');
create type gift_prospect_status as enum ('active', 'archived');

create table gift_protocol_prospects (
  id uuid primary key default gen_random_uuid(),
  retainer_prospect_id uuid references retainer_prospects(id),
  business_name text not null,
  category text,
  owner_name text,
  owner_confidence dossier_confidence,
  address text,
  phone text,
  website_current text,
  dossier jsonb not null default '[]',
  do_not_use_notes text,
  site_brief jsonb,
  flyer_copy_options jsonb not null default '[]',
  flyer_copy_selected text,
  qr_target_url text,
  status gift_prospect_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gift_protocol_prospects_status_idx on gift_protocol_prospects (status);

create table gift_protocol_deliveries (
  id uuid primary key default gen_random_uuid(),
  gift_protocol_prospect_id uuid not null references gift_protocol_prospects(id),
  ship_method text not null default 'USPS Priority Mail Small Flat Rate + Signature Confirmation',
  tracking_number text,
  ship_date date,
  delivery_status gift_delivery_status not null default 'not_started',
  signer_name text,
  follow_up_date date,
  followed_up boolean not null default false,
  checklist jsonb not null default '[
    {"label": "Flyer printed", "done": false},
    {"label": "QR code printed", "done": false},
    {"label": "Small flat rate box packed", "done": false},
    {"label": "Label printed via Pirate Ship", "done": false},
    {"label": "Signature confirmation selected (standard, not Adult-Restricted)", "done": false}
  ]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gift_protocol_deliveries_prospect_idx on gift_protocol_deliveries (gift_protocol_prospect_id);

alter table gift_protocol_prospects enable row level security;
alter table gift_protocol_deliveries enable row level security;

-- Real researched prospects (College Park / South Fulton, GA 30349 area, July 2026).
-- See dossier notes below — confidence-tagged, "inferred" facts never included.
insert into retainer_prospects (name, stage, website, phone) values
  ('Dr. Delores Hubbard, DDS', 'target', null, '(404) 766-8559'),
  ('High Definition Cutz', 'target', null, '(404) 573-0675'),
  ('Kendra Robinson & Associates', 'target', 'https://kendrarobinsonlaw.com', null),
  ('Conquest Auto Repair', 'target', 'https://conquestautorepairs.com', null);

insert into gift_protocol_prospects (retainer_prospect_id, business_name, category, owner_name, owner_confidence, address, phone, website_current, dossier, do_not_use_notes)
values (
  (select id from retainer_prospects where name = 'Dr. Delores Hubbard, DDS'),
  'Dr. Delores Hubbard, DDS', 'dentist', 'Dr. Delores Hubbard (also Dr. Delores Hubbard-Brooks)', 'confirmed',
  '1784 Washington Rd, East Point, GA 30344', '(404) 766-8559', 'None — hubbarddentistry.com belongs to a different, unrelated practice',
  '[
    {"fact": "Practice entity: Delores Hubbard DDS LLC", "confidence": "confirmed", "source_note": "ADA Find-a-Dentist; WebMD; Vitals; Sharecare"},
    {"fact": "Education: Meharry Medical College", "confidence": "single_source", "source_note": "ADA Find-a-Dentist profile only"},
    {"fact": "Licensed to practice dentistry in Georgia", "confidence": "single_source", "source_note": "CareDash"},
    {"fact": "Long-tenured solo practice; multigenerational patient loyalty (patients seen for years, adult children still patients)", "confidence": "single_source", "source_note": "aggregated patient reviews, no exact founding date public"},
    {"fact": "No functioning dedicated practice website; hubbarddentistry.com belongs to a different, unrelated Hubbard practice in Glennville, GA (Larry G. Hubbard DDS)", "confidence": "confirmed", "source_note": "site fetch of hubbarddentistry.com"},
    {"fact": "Reviews scattered across Yelp (5.0/5), Zaubee (4.1/14), Vitals (4.5/4), Healthgrades (5.0/2), CareDash (3.9/8) with no evidence of owner-managed responses", "confidence": "confirmed", "source_note": "multiple review platforms"},
    {"fact": "Patient reviews consistently describe a warm, old-school, intimate practice feel, especially with dental-anxious patients", "confidence": "confirmed", "source_note": "aggregated patient reviews"}
  ]'::jsonb,
  null
), (
  (select id from retainer_prospects where name = 'High Definition Cutz'),
  'High Definition Cutz', 'barbershop', null, null,
  '2459 Roosevelt Hwy, Suite A4, College Park, GA 30349', '(404) 573-0675', 'None — only Fresha/Atly/directory listings',
  '[
    {"fact": "Relocated to 2459 Roosevelt Hwy Suite A4 around late 2023", "confidence": "single_source", "source_note": "Instagram relocation post, date approximate"},
    {"fact": "No dedicated website; presence limited to Fresha (unclaimed lead page), Atly, and directory listings", "confidence": "confirmed", "source_note": "Fresha, Atly, directories"},
    {"fact": "No business-managed online booking; phone/walk-in only", "confidence": "confirmed", "source_note": "Fresha shows Call to book only"},
    {"fact": "Services: Men Haircut, Beard Trim, Head Shave", "confidence": "confirmed", "source_note": "Fresha, Atly"},
    {"fact": "Price range roughly $15-$30 per haircut", "confidence": "single_source", "source_note": "Atly, review-derived not an official posted menu"},
    {"fact": "Family-friendly, kid-friendly, relaxed, walk-ins-welcome reputation", "confidence": "confirmed", "source_note": "aggregated customer reviews"}
  ]'::jsonb,
  'Owner identity NOT publicly confirmed — a barber named "Jig" appears in reviews but is not confirmed as owner. Do not assert an owner name in outreach until verified via GA SOS registry / Google / Instagram.'
), (
  (select id from retainer_prospects where name = 'Kendra Robinson & Associates'),
  'Kendra Robinson & Associates', 'law_firm', 'Kendra Robinson (Kendra Nicole Robinson)', 'confirmed',
  null, null, 'https://kendrarobinsonlaw.com (dated 2021 template)',
  '[
    {"fact": "From Clinton, South Carolina", "confidence": "confirmed", "source_note": "The Atlanta Voice; firm bio"},
    {"fact": "BS Mathematics, Kentucky State University; JD, University of Louisville (Brandeis School of Law), 2013", "confidence": "confirmed", "source_note": "firm About page; The Atlanta Voice; Avvo"},
    {"fact": "Began career as a public defender representing indigent clients before founding her firms", "confidence": "confirmed", "source_note": "firm site; The Atlanta Voice"},
    {"fact": "Member of Delta Sigma Theta Sorority; HBCU graduate", "confidence": "confirmed", "source_note": "Yahoo interview; Famous Birthdays"},
    {"fact": "Speaks Spanish", "confidence": "single_source", "source_note": "taylorleeandassociates.com bio"},
    {"fact": "Cast member on Love and Hip Hop: Atlanta since 2019; married rapper Yung Joc Nov 7, 2021", "confidence": "confirmed", "source_note": "Forbes; The Atlanta Voice; multiple"},
    {"fact": "Instagram following 500,000+ (@attorneykendra_robinson)", "confidence": "single_source", "source_note": "Famous Birthdays"},
    {"fact": "Featured by Forbes (Nov 2022) and The Atlanta Voice; SRS Buckhead grand opening June 2022", "confidence": "confirmed", "source_note": "Forbes; The Atlanta Voice"},
    {"fact": "Website footer reads (c) 2021 All Rights Reserved; thin, generic BeaverBuilder template", "confidence": "confirmed", "source_note": "site fetch"},
    {"fact": "Site copy contains an out-of-place spammy external link, a sign of an unmaintained or compromised WordPress site", "confidence": "confirmed", "source_note": "site fetch"},
    {"fact": "Site messaging is criminal-defense-only despite the firm also handling real estate closings via affiliated title company SRS", "confidence": "confirmed", "source_note": "site fetch; Forbes"}
  ]'::jsonb,
  'Family details (e.g. a late father referenced in a firm Facebook birthday post) are voluntarily public but sensitive — do NOT use in outreach. Net worth figures circulating online are from low-quality/unofficial sources — exclude entirely.'
), (
  (select id from retainer_prospects where name = 'Conquest Auto Repair'),
  'Conquest Auto Repair', 'auto_repair', 'Eton Douglas', 'confirmed',
  '5548 Old National Hwy, College Park, GA 30349', null, 'conquestautorepairs.com + 2 duplicate domains (conquestautorepairsco.com, atlantaautomotiverepair.com)',
  '[
    {"fact": "Legal entity Conquest Auto Service and Repair LLC (GA control #08076445), started 9/12/2008, roughly 17 years in business", "confidence": "confirmed", "source_note": "GA SOS; BBB"},
    {"fact": "ASE Blue Seal of Excellence recognition", "confidence": "single_source", "source_note": "self-reported on conquestautorepairs.com, not independently verified via ASE directory"},
    {"fact": "A+ BBB rating (not BBB-accredited); BBB file opened 8/11/2010", "confidence": "confirmed", "source_note": "BBB"},
    {"fact": "Received a PPP loan (approximately $20,677, PNC Bank) retaining 8 jobs, indicating roughly 8 employees", "confidence": "confirmed", "source_note": "SBA/Treasury PPP data"},
    {"fact": "Multiple duplicated, low-quality websites with contradictory content and inconsistent hours", "confidence": "confirmed", "source_note": "site fetches of all 3 domains"},
    {"fact": "Strong review reputation across BBB, Birdeye (approximately 180 reviews), Yelp, Nextdoor, Trust-Mechanics — honesty, fair pricing, long-term customer loyalty (8-12 years)", "confidence": "confirmed", "source_note": "multiple review platforms"}
  ]'::jsonb,
  null
);

insert into gift_protocol_deliveries (gift_protocol_prospect_id)
select id from gift_protocol_prospects;

-- ============================================================ seed users
insert into app_users (name, role, access_scope) values
  ('EJ', 'ej', 'full'),
  ('Usman', 'usman', 'parts_only');

-- Set real credentials AFTER this seed, per-environment, never in a checked-in
-- file: node -e "..." using lib/auth.ts's hashPassword(), then
--   update app_users set username = '...', password_hash = '...' where role = '...';
-- password_hash format: '<hex salt>:<hex scrypt hash>' — see lib/auth.ts.

-- ============================================================ System Health Layer (v3.1)
-- Real backend checks, not decoration. If a real check can't be built, the
-- corresponding pill shows "Not Set Up" — never a hardcoded green.
create table system_health_events (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  event_type text not null,
  status text not null check (status in ('ok', 'error')),
  detail text,
  created_at timestamptz not null default now()
);
create index system_health_events_module_idx on system_health_events (module, event_type, created_at desc);

create table external_blockers (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  submitted_at date,
  typical_turnaround_days int,
  resolved boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

alter table system_health_events enable row level security;
alter table external_blockers enable row level security;

insert into external_blockers (label, submitted_at, typical_turnaround_days, note) values
  ('eBay production API keyset activation', '2026-07-06', 5, 'Blocked on Marketplace Account Deletion webhook — endpoint built, needs deploy + registration in eBay Developer Portal.'),
  ('Twilio toll-free verification (30482 + 30513)', '2026-07-06', 3, 'Business email + SMS opt-in fixes made; awaiting resubmission and Twilio review.'),
  ('Net10th drop-ship approval with SSF rep', null, null, 'Not yet submitted.');
