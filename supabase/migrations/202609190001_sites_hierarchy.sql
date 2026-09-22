-- ============================================================================
-- ZitBIO — Sites become a hierarchy (park to zones)
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `sites` had two rows, the Nature Park and the Campus, and nothing between them
-- and a sighting. But the park is woodland with distinct areas, and the officers
-- already recorded which one they were in, as free text in `locality_description`:
--
--     Near the pond                                    9 records
--     Near the fence at the main gate                  7
--     Near the trees at the basketball court           6
--     Close to the antenna                             5
--     Near the fence at Jambo Drive                    5
--
-- Five values, 32 of 32 records, no spelling variation. The pattern is already in
-- the data; it is simply not queryable.
--
-- Zones live in `sites` rather than a new `zones` table on purpose. A separate
-- table would make a THIRD place for place identity alongside `sites` and
-- `observations.focus_area`, and fragmenting identity is the defect this whole
-- design exists to remove.
--
-- The zone names are the officers' own words, unchanged, because that wording is
-- evidence. `short_name` is a separate column for tight UI so the long form is
-- never overwritten by a display concern.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It does not guess. A historical observation is matched to a zone only where the
-- locality text matches EXACTLY, case and surrounding whitespace aside. The 176
-- GBIF rows carry campus locality strings, so they stay NULL. A zone is a claim
-- about where animals are, and fuzzing "near the fence" onto "main gate" would
-- invent a location nobody recorded.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     update public.observations
--        set zone_id = null
--      where zone_id in ('zone_001','zone_002','zone_003','zone_004','zone_005');
--     alter table public.observations drop column if exists zone_id;
--     delete from public.sites
--      where id in ('zone_001','zone_002','zone_003','zone_004','zone_005');
--     alter table public.sites drop constraint if exists sites_kind_allowed;
--     alter table public.sites drop constraint if exists sites_id_kind_key;
--     alter table public.sites drop column if exists sort_order;
--     alter table public.sites drop column if exists parent_site_id;
--     alter table public.sites drop column if exists kind;
--     alter table public.sites drop column if exists short_name;
--
-- The UPDATE must precede the DELETE. Dropping these discards no measurement:
-- no observation column other than the new `zone_id` is touched.
-- ---------------------------------------------------------------------------

-- 1. The hierarchy columns. `kind` is added nullable, backfilled, then made NOT
--    NULL, so the two existing rows are classified by their own ids rather than
--    by a default that would silently label them.
alter table public.sites add column if not exists short_name     text;
alter table public.sites add column if not exists kind           text;
alter table public.sites add column if not exists parent_site_id text references public.sites (id) on delete set null;
alter table public.sites add column if not exists sort_order     integer;

update public.sites set kind = 'park'   where id = 'site_001' and kind is null;
update public.sites set kind = 'campus' where id = 'site_002' and kind is null;
update public.sites set kind = 'zone'   where kind is null;

alter table public.sites alter column kind set default 'zone';
alter table public.sites alter column kind set not null;

alter table public.sites drop constraint if exists sites_kind_allowed;
alter table public.sites
  add constraint sites_kind_allowed check (kind in ('park', 'campus', 'zone'));

-- Composite key so a child table can require its parent to be an actual zone.
-- A CHECK cannot look at another table, and this is the cheap way to make a
-- single-column foreign key carry a type guarantee with it.
alter table public.sites drop constraint if exists sites_id_kind_key;
alter table public.sites add constraint sites_id_kind_key unique (id, kind);

create index if not exists sites_parent_idx on public.sites (parent_site_id);

comment on column public.sites.kind is
  'park | campus | zone. One table, one hierarchy, so place identity is not split across tables.';
comment on column public.sites.short_name is
  'Compact display name for tight UI. `name` stays the officers'' own wording and remains the value matched against locality text.';

-- 2. The five zones, named after the locality text that produced them.
insert into public.sites (id, name, short_name, kind, parent_site_id, habitat_type_default, sort_order)
values
  ('zone_001', 'Near the pond',                            'Pond',              'zone', 'site_001', 'Miombo Woodland', 1),
  ('zone_002', 'Near the fence at the main gate',          'Main gate fence',   'zone', 'site_001', 'Miombo Woodland', 2),
  ('zone_003', 'Near the trees at the basketball court',   'Basketball court',  'zone', 'site_001', 'Miombo Woodland', 3),
  ('zone_004', 'Close to the antenna',                     'Antenna',           'zone', 'site_001', 'Miombo Woodland', 4),
  ('zone_005', 'Near the fence at Jambo Drive',            'Jambo Drive fence', 'zone', 'site_001', 'Miombo Woodland', 5)
on conflict (id) do nothing;

-- 3. Where in the park a sighting happened. Nullable and ON DELETE SET NULL, so
--    retiring a zone never destroys an observation.
alter table public.observations
  add column if not exists zone_id text references public.sites (id) on delete set null;

create index if not exists observations_zone_idx on public.observations (zone_id);

comment on column public.observations.zone_id is
  'Sub-site within the park. NULL means the exact area was not recorded, which is different from the park row itself.';

-- 4. Backfill, exact match only. Idempotent: only fills NULLs.
update public.observations o
   set zone_id = s.id
  from public.sites s
 where o.zone_id is null
   and s.kind = 'zone'
   and lower(trim(o.locality_description)) = lower(trim(s.name));
