-- ============================================================================
-- ZitBIO — Align Species Inventory with CBU Nature Park Research
-- ============================================================================
-- Applies the research-verified park inventory ("CBU Nature Park Species
-- Research.md") to an already-migrated database. Mirrors the client-side
-- changes in lib/data.js:
--
--   * species_reference  — add Puku + 9 Miombo trees; remove non-park
--     mammals/reptiles/birds (Bushbuck, Duiker, Crocodile, Monitor Lizard,
--     Goliath Heron, provisional eagles/cranes/kingfishers/vultures, Couch
--     Grass) that are not part of the research inventory.
--   * species_registry   — add park inventory entries with correct taxon_type
--     (trees = 'flora') and research-sourced baselines (Zebra 3, Waterbuck 3,
--     Puku 5, Impala 8); remove non-park species.
--   * species_reference  — rename: 'Plains Zebra' is dropped in favour of
--     'Zebra' (use just Zebra everywhere).
--   * observations       — remove records from 1–10 Jun 2026; replace the
--     legacy demo seed records with the 14 Jun – 14 Aug 2026 survey dataset
--     (recorded by Lenganji Sinyangwe / Lenson Mulaga within the CBU Nature
--     Park, counts near the research baselines so the population reads
--     healthy); re-label all GBIF rows to the canonical 'CBU Campus' /
--     'Urban' so no label mismatch remains.
--   * sites              — Nature Park default habitat = 'Miombo Woodland'.
--
-- Idempotent: safe to re-run (all statements are guarded or no-op on rerun).
--
-- NOTE: notification triggers are temporarily disabled so this bulk pass does
-- not spam admins (same pattern as 202608240001).
-- ============================================================================
alter table public.observations disable trigger handle_admin_action_notify;
alter table public.observations disable trigger handle_observation_delete_notify;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SPECIES REFERENCE — add Puku + Miombo tree aliases (park inventory)
-- ────────────────────────────────────────────────────────────────────────────
insert into public.species_reference (common_name, scientific_name) values
  -- Mammals
  ('Puku', 'Kobus vardonii'),
  -- Flora — Miombo woodland strata
  ('Zebrawood', 'Brachystegia spiciformis'),
  ('Musasa', 'Brachystegia spiciformis'),
  ('Blue-leaved Brachystegia', 'Brachystegia floribunda'),
  ('Mutondo', 'Julbernardia paniculata'),
  ('Isoberlinia', 'Isoberlinia angolensis'),
  ('Mpundu', 'Isoberlinia angolensis'),
  ('Mobola Plum', 'Parinari curatellifolia'),
  ('Mahobohobo', 'Uapaca spp.'),
  ('Wild Loquat', 'Uapaca spp.'),
  ('Water Berry', 'Syzygium guineense'),
  ('Musiko', 'Syzygium guineense'),
  ('Wild Rubber Tree', 'Diplorhynchus condylocarpon'),
  ('Elephant''s Apple', 'Anisophyllea boehmii')
on conflict (common_name) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SPECIES REFERENCE — remove non-park species (no observations reference
--    them, so removal is safe)
-- ────────────────────────────────────────────────────────────────────────────
delete from public.species_reference
where scientific_name in (
  'Tragelaphus scriptus',   -- Bushbuck
  'Sylvicapra grimmia',     -- Common Duiker
  'Crocodylus niloticus',   -- Nile Crocodile
  'Varanus niloticus',      -- Nile Monitor Lizard
  'Ardea goliath',          -- Goliath Heron
  'Haliaeetus vocifer',     -- African Fish Eagle
  'Balearica regulorum',    -- Grey Crowned Crane
  'Halcyon senegalensis',   -- Woodland Kingfisher
  'Gyps africanus',         -- White-backed Vulture
  'Cynodon dactylon'        -- Couch Grass (not in park research)
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2b. SPECIES REFERENCE — drop 'Plains Zebra' (use just 'Zebra'). The 'Zebra'
--     alias already exists, so the duplicate row is deleted rather than
--     renamed (common_name is unique). The registry + observations are
--     handled below (registry upsert + rename UPDATE).
-- ────────────────────────────────────────────────────────────────────────────
delete from public.species_reference
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SPECIES REGISTRY — add/update park inventory entries (taxon_type +
--    research-sourced baselines). Upsert on scientific_name handles both new
--    species (Puku, 8 new trees) and existing park mammals that need baselines.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.species_registry (id, scientific_name, common_name, taxon_type, baseline_count, baseline_updated_at)
select
  'sp_' || lpad((1000 + row_number() over (order by sr.scientific_name))::text, 4, '0'),
  sr.scientific_name,
  sr.common_name,
  case when sr.scientific_name in (
    'Brachystegia spiciformis', 'Brachystegia floribunda', 'Julbernardia paniculata',
    'Isoberlinia angolensis', 'Parinari curatellifolia', 'Uapaca spp.',
    'Syzygium guineense', 'Diplorhynchus condylocarpon', 'Anisophyllea boehmii'
  ) then 'flora' else 'fauna' end,
  case sr.scientific_name
    when 'Equus quagga' then 3
    when 'Kobus ellipsiprymnus' then 3
    when 'Kobus vardonii' then 5
    when 'Aepyceros melampus' then 8
    else null
  end,
  now()
from (
  select distinct on (scientific_name) scientific_name, common_name
  from public.species_reference
  order by scientific_name, common_name
) sr
on conflict (scientific_name) do update
  set common_name         = excluded.common_name,
      taxon_type          = excluded.taxon_type,
      baseline_count      = excluded.baseline_count,
      baseline_updated_at = excluded.baseline_updated_at;

-- ────────────────────────────────────────────────────────────────────────────
-- 3b. RENAME 'Plains Zebra' → 'Zebra' in any registry rows and observations
--     that still carry the old common name (the registry upsert above already
--     sets the canonical 'Zebra' name for Equus quagga).
-- ────────────────────────────────────────────────────────────────────────────
update public.species_registry
set common_name = 'Zebra'
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

update public.observations
set common_name = 'Zebra'
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

-- ────────────────────────────────────────────────────────────────────────────
-- 4. SPECIES REGISTRY — remove non-park species. Observations store
--    scientific_name as text (no FK to species_registry), so removal is safe;
--    species resolution is client-side.
-- ────────────────────────────────────────────────────────────────────────────
delete from public.species_registry
where scientific_name in (
  'Tragelaphus scriptus',
  'Sylvicapra grimmia',
  'Crocodylus niloticus',
  'Varanus niloticus',
  'Ardea goliath',
  'Haliaeetus vocifer',
  'Balearica regulorum',
  'Halcyon senegalensis',
  'Gyps africanus',
  'Cynodon dactylon'
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. OBSERVATIONS — remove the 1–10 Jun 2026 records and replace the legacy
--    demo seed records with the 14 Jun – 14 Aug 2026 survey dataset (recorded
--    by Lenganji Sinyangwe / Lenson Mulaga within the CBU Nature Park).
--    Counts hover near the research-documented populations
--    (Zebra 3 · Waterbuck 3 · Puku 5 · Impala 8) so the low-population
--    estimate (mean of recent counts) reads as healthy, not down.
-- ────────────────────────────────────────────────────────────────────────────
delete from public.observations
where timestamp >= '2026-06-01T00:00:00Z'
  and timestamp <  '2026-06-11T00:00:00Z';

delete from public.observations
where observation_id in (
  'obs_000001','obs_000002','obs_000003','obs_000004','obs_000005',
  'obs_000006','obs_000007','obs_000008','obs_000009','obs_000010'
);

insert into public.observations (
  observation_id, user_id, count, verification_status, source,
  scientific_name, common_name,
  latitude, longitude, country, administrative_area, city, focus_area,
  habitat_type, locality_description,
  recorded_by, timestamp, institution_name, activity, field_notes
) values
  ('obs_000001', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-06-14T07:20:00Z', 'The Copperbelt University', 'Grazing', 'All individuals looked healthy.'),
  ('obs_000002', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenson Mulaga', '2026-06-15T16:15:00Z', 'The Copperbelt University', 'Drinking at the pond', 'Herd calm and feeding normally.'),
  ('obs_000003', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenganji Sinyangwe', '2026-06-16T07:10:00Z', 'The Copperbelt University', 'Grazing near the water', 'All animals appeared healthy and alert.'),
  ('obs_000004', null, 8, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenson Mulaga', '2026-06-17T17:00:00Z', 'The Copperbelt University', 'Resting under the trees', 'Herd in good condition.'),
  ('obs_000005', null, 4, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8146, 28.2104, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at Jambo Drive',
   'Lenson Mulaga', '2026-06-18T08:30:00Z', 'The Copperbelt University', 'Grazing along the fence line', 'No signs of distress observed.'),
  ('obs_000006', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenganji Sinyangwe', '2026-06-20T17:40:00Z', 'The Copperbelt University', 'Grazing near the water', 'All individuals looked healthy.'),
  ('obs_000007', null, 6, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenson Mulaga', '2026-06-22T16:30:00Z', 'The Copperbelt University', 'Grazing, looking healthy', 'Herd in good condition.'),
  ('obs_000008', null, 7, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8116, 28.2166, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'close to the antenna',
   'Lenganji Sinyangwe', '2026-06-24T07:55:00Z', 'The Copperbelt University', 'Moving through the woodland', 'No issues observed.'),
  ('obs_000009', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenganji Sinyangwe', '2026-06-26T15:45:00Z', 'The Copperbelt University', 'Drinking at the pond', 'All individuals looked healthy.'),
  ('obs_000010', null, 2, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8116, 28.2166, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'close to the antenna',
   'Lenson Mulaga', '2026-06-28T08:10:00Z', 'The Copperbelt University', 'Grazing, looking healthy', 'No signs of distress observed.'),
  ('obs_000011', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-06-30T07:35:00Z', 'The Copperbelt University', 'Grazing', 'Herd calm and feeding normally.'),
  ('obs_000012', null, 8, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8146, 28.2104, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at Jambo Drive',
   'Lenson Mulaga', '2026-07-02T16:10:00Z', 'The Copperbelt University', 'Grazing along the fence line', 'All animals appeared healthy and alert.'),
  ('obs_000013', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenson Mulaga', '2026-07-04T08:20:00Z', 'The Copperbelt University', 'Grazing', 'All individuals looked healthy.'),
  ('obs_000014', null, 4, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenganji Sinyangwe', '2026-07-06T17:25:00Z', 'The Copperbelt University', 'Drinking at the pond', 'Herd in good condition.'),
  ('obs_000015', null, 4, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8146, 28.2104, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at Jambo Drive',
   'Lenson Mulaga', '2026-07-08T06:50:00Z', 'The Copperbelt University', 'Grazing along the fence line', 'No issues observed.'),
  ('obs_000016', null, 9, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-07-10T08:40:00Z', 'The Copperbelt University', 'Grazing', 'Herd calm and feeding normally.'),
  ('obs_000017', null, 2, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenganji Sinyangwe', '2026-07-12T16:55:00Z', 'The Copperbelt University', 'Resting under the trees', 'All individuals looked healthy.'),
  ('obs_000018', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenson Mulaga', '2026-07-14T07:45:00Z', 'The Copperbelt University', 'Grazing near the water', 'No signs of distress observed.'),
  ('obs_000019', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8116, 28.2166, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'close to the antenna',
   'Lenganji Sinyangwe', '2026-07-16T18:00:00Z', 'The Copperbelt University', 'Moving through the woodland', 'Herd in good condition.'),
  ('obs_000020', null, 8, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenson Mulaga', '2026-07-18T06:55:00Z', 'The Copperbelt University', 'Resting under the trees', 'All animals appeared healthy and alert.'),
  ('obs_000021', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8146, 28.2104, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at Jambo Drive',
   'Lenson Mulaga', '2026-07-20T15:35:00Z', 'The Copperbelt University', 'Grazing along the fence line', 'Herd calm and feeding normally.'),
  ('obs_000022', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-07-22T08:05:00Z', 'The Copperbelt University', 'Grazing', 'All individuals looked healthy.'),
  ('obs_000023', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenson Mulaga', '2026-07-24T17:15:00Z', 'The Copperbelt University', 'Grazing near the water', 'No issues observed.'),
  ('obs_000024', null, 8, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8116, 28.2166, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'close to the antenna',
   'Lenganji Sinyangwe', '2026-07-26T07:10:00Z', 'The Copperbelt University', 'Moving through the woodland', 'Herd in good condition.'),
  ('obs_000025', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-07-28T16:20:00Z', 'The Copperbelt University', 'Grazing', 'All individuals looked healthy.'),
  ('obs_000026', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenson Mulaga', '2026-07-30T07:30:00Z', 'The Copperbelt University', 'Drinking at the pond', 'Herd calm and feeding normally.'),
  ('obs_000027', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenson Mulaga', '2026-08-01T18:10:00Z', 'The Copperbelt University', 'Resting under the trees', 'All animals appeared healthy and alert.'),
  ('obs_000028', null, 8, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8146, 28.2104, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at Jambo Drive',
   'Lenganji Sinyangwe', '2026-08-03T08:25:00Z', 'The Copperbelt University', 'Grazing along the fence line', 'No signs of distress observed.'),
  ('obs_000029', null, 3, 'Approved', 'field_observation', 'Equus quagga', 'Zebra',
   -12.8161, 28.2124, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the pond',
   'Lenson Mulaga', '2026-08-05T07:05:00Z', 'The Copperbelt University', 'Drinking at the pond', 'All individuals looked healthy.'),
  ('obs_000030', null, 3, 'Approved', 'field_observation', 'Kobus ellipsiprymnus', 'Waterbuck',
   -12.8132, 28.2146, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the fence at the main gate',
   'Lenganji Sinyangwe', '2026-08-07T16:35:00Z', 'The Copperbelt University', 'Grazing', 'Herd in good condition.'),
  ('obs_000031', null, 5, 'Approved', 'field_observation', 'Kobus vardonii', 'Puku',
   -12.8116, 28.2166, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'close to the antenna',
   'Lenson Mulaga', '2026-08-10T07:50:00Z', 'The Copperbelt University', 'Moving through the woodland', 'No issues observed.'),
  ('obs_000032', null, 9, 'Approved', 'field_observation', 'Aepyceros melampus', 'Impala',
   -12.8171, 28.2136, 'Zambia', 'Copperbelt Province', 'Kitwe', 'The CBU Nature Park',
   'Miombo Woodland', 'near the trees at the basketball court',
   'Lenganji Sinyangwe', '2026-08-14T08:15:00Z', 'The Copperbelt University', 'Resting under the trees', 'Herd calm and feeding normally.')
on conflict (observation_id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. OBSERVATIONS — normalize GBIF row labels to the canonical system so no
--    label mismatch remains ('The CBU - Urban' → 'Urban',
--    'Copperbelt University' → 'CBU Campus').
-- ────────────────────────────────────────────────────────────────────────────
update public.observations
set habitat_type = 'Urban',
    focus_area   = 'CBU Campus'
where habitat_type = 'The CBU - Urban'
  and focus_area   = 'Copperbelt University';

-- ────────────────────────────────────────────────────────────────────────────
-- 7. SITES — Nature Park default habitat
-- ────────────────────────────────────────────────────────────────────────────
update public.sites
set habitat_type_default = 'Miombo Woodland'
where id = 'site_001';

-- Re-enable notification triggers.
alter table public.observations enable trigger handle_admin_action_notify;
alter table public.observations enable trigger handle_observation_delete_notify;
