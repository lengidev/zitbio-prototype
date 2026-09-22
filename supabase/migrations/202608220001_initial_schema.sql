-- ============================================================================
-- ZitBIO — Initial Schema
-- ============================================================================
-- Creates the core tables, enums, triggers, and reference data for the
-- biodiversity monitoring system. Derived directly from the data models in
-- lib/data.js (BioData layer).
--
-- Tables created:
--   profiles            — user profile data linked to auth.users
--   observations        — biodiversity observations
--   notifications       — in-app notifications per user
--   species_reference   — common-name → scientific-name lookup
--   zambia_provinces    — province + reserve reference data
--
-- NOTE: RLS policies are applied in a SEPARATE migration
-- (202608220002_rls_policies.sql) so schema and security are reviewed
-- independently.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ────────────────────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- 2. ENUMS
-- ────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type user_role as enum ('admin', 'field_officer');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type verification_status as enum ('Pending', 'Approved', 'Flagged');
exception
  when duplicate_object then null;
end $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. PROFILES TABLE
--    One row per authenticated user; linked 1:1 to auth.users.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  full_name         text not null default '',
  email             text not null,
  role              user_role not null default 'field_officer',
  institution_name  text not null default '',
  created_at        timestamptz not null default now(),
  last_login        timestamptz
);

comment on table public.profiles is
  'User profile data joined 1:1 to auth.users. Role drives admin vs field-officer access.';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. OBSERVATIONS TABLE
--    Mirrors the observation object shape from lib/data.js.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.observations (
  id                    uuid primary key default uuid_generate_v4(),
  observation_id        text not null unique,              -- readable ID e.g. obs_000001
  user_id               uuid references auth.users (id) on delete set null, -- submitting user
  count                 integer not null default 0,
  verification_status   verification_status not null default 'Pending',
  source                text not null default 'field_observation',
  scientific_name       text not null default '',
  common_name           text not null default '',
  latitude              double precision,
  longitude             double precision,
  country               text not null default 'Zambia',
  administrative_area   text not null default '',
  city                  text not null default '',
  focus_area            text,
  habitat_type          text not null default '',
  locality_description  text not null default '',
  recorded_by           text not null default '',
  timestamp             timestamptz not null default now(),
  institution_name      text not null default 'The Copperbelt University',
  activity              text not null default '',
  field_notes           text not null default '',
  created_at            timestamptz not null default now()
);

create index if not exists idx_observations_verification_status on public.observations (verification_status);
create index if not exists idx_observations_timestamp on public.observations (timestamp);
create index if not exists idx_observations_recorded_by on public.observations (recorded_by);
create index if not exists idx_observations_user_id on public.observations (user_id);

comment on table public.observations is
  'Biodiversity observations recorded by field officers and admins.';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. NOTIFICATIONS TABLE
--    Per-user in-app notifications. user_id is the recipient.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users (id) on delete cascade,
  type        text not null default 'pending_observation',
  title       text not null default '',
  message     text not null default '',
  link        text,
  related_id  text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications (user_id);
create index if not exists idx_notifications_read on public.notifications (user_id, read);

comment on table public.notifications is
  'In-app notifications targeted at a specific user.';

-- ────────────────────────────────────────────────────────────────────────────
-- 6. SPECIES REFERENCE TABLE
--    Common-name → scientific-name lookup (seeded from lib/data.js).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.species_reference (
  common_name      text primary key,
  scientific_name  text not null
);

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ZAMBIA PROVINCES TABLE
--    Provincial reference data with associated reserves.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.zambia_provinces (
  id       serial primary key,
  name     text not null unique,
  reserves jsonb not null default '[]'::jsonb
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8. AUTO-CREATE PROFILE ON SIGNUP TRIGGER
--    When a user signs up through Supabase Auth, a matching profile row is
--    created automatically with a sensible default role ('field_officer').
--    Admins are promoted via the dashboard/SQL, never via open signup.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'field_officer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- 9. SEED DATA — SPECIES REFERENCE (from lib/data.js)
-- ────────────────────────────────────────────────────────────────────────────
insert into public.species_reference (common_name, scientific_name) values
  -- Mammals — CBU Nature Park managed ungulate inventory (Sept 2023)
  ('Zebra', 'Equus quagga'),
  ('Waterbuck', 'Kobus ellipsiprymnus'),
  ('Puku', 'Kobus vardonii'),
  ('Impala', 'Aepyceros melampus'),
  -- Flora — Miombo woodland strata (upper canopy → sub-canopy)
  ('Miombo Tree', 'Brachystegia spiciformis'),
  ('Zebrawood', 'Brachystegia spiciformis'),
  ('Musasa', 'Brachystegia spiciformis'),
  ('Blue-leaved Brachystegia', 'Brachystegia floribunda'),
  ('Mutondo', 'Julbernardia paniculata'),
  ('Munali Tree', 'Julbernardia paniculata'),
  ('Isoberlinia', 'Isoberlinia angolensis'),
  ('Mpundu', 'Isoberlinia angolensis'),
  ('Mobola Plum', 'Parinari curatellifolia'),
  ('Mahobohobo', 'Uapaca spp.'),
  ('Wild Loquat', 'Uapaca spp.'),
  ('Water Berry', 'Syzygium guineense'),
  ('Musiko', 'Syzygium guineense'),
  ('Wild Rubber Tree', 'Diplorhynchus condylocarpon'),
  ("Elephant's Apple", 'Anisophyllea boehmii')
on conflict (common_name) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. SEED DATA — ZAMBIA PROVINCES (from lib/data.js)
-- ────────────────────────────────────────────────────────────────────────────
insert into public.zambia_provinces (name, reserves) values
  ('Central Province',       '["Blue Lagoon National Park", "Kafue National Park (Central Sector)", "Lukanga Swamps"]'),
  ('Copperbelt Province',    '["Chembe Bird Sanctuary", "Mwekera National Forest"]'),
  ('Eastern Province',       '["South Luangwa National Park", "Lukusuzi National Park", "Luambe National Park"]'),
  ('Luapula Province',       '["Lusenga Plain National Park", "Lake Bangweulu Wetlands", "Isangano National Park"]'),
  ('Lusaka Province',        '["Lower Zambezi National Park", "Lusaka National Park", "Lochinvar National Park"]'),
  ('Muchinga Province',      '["North Luangwa National Park", "Lavushi Manda National Park", "Nsumbu National Park"]'),
  ('Northern Province',      '["Nsumbu National Park", "Mweru Wantipa National Park", "Kalambo Falls"]'),
  ('North-Western Province', '["West Lunga National Park", "Zambezi Source National Forest", "Jiwundu Swamp"]'),
  ('Southern Province',      '["Mosi-oa-Tunya National Park", "Kafue National Park (South Sector)", "Siavonga Game Management Area", "Batoka Gorge"]'),
  ('Western Province',       '["Liuwa Plain National Park", "Sioma Ngwezi National Park", "Zambezi National Forest"]')
on conflict (name) do nothing;