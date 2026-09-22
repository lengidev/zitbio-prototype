-- ============================================================================
-- ZitBIO — Park Survey Refresh (rename Zebra + Jun–Aug 2026 survey dataset)
-- ============================================================================
-- Follow-up to 202608240002_align_park_inventory (which was applied before
-- this file's parent was updated). Reconciles the remote database with the
-- updated 202608240002 intent:
--
--   * species_reference  — drop 'Plains Zebra' in favour of 'Zebra'.
--   * species_registry   — rename 'Plains Zebra' → 'Zebra' (Equus quagga).
--   * observations       — rename 'Plains Zebra' → 'Zebra' (Equus quagga);
--     remove the old 1–10 Jun 2026 demo/seed records AND the legacy
--     obs_000011/obs_000012 Waterbuck seed rows, then load the 14 Jun –
--     14 Aug 2026 survey dataset (32 records: obs_000001..obs_000032,
--     recorded by Lenganji Sinyangwe / Lenson Mulaga within the CBU Nature
--     Park, counts near the research baselines).
--
-- Idempotent: safe to re-run (all statements are guarded or no-op on rerun).
--
-- NOTE: notification triggers are temporarily disabled so this bulk pass does
-- not spam admins (same pattern as 202608240001).
-- ============================================================================
alter table public.observations disable trigger handle_admin_action_notify;
alter table public.observations disable trigger handle_observation_delete_notify;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SPECIES REFERENCE — drop 'Plains Zebra' (use just 'Zebra')
-- ────────────────────────────────────────────────────────────────────────────
delete from public.species_reference
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SPECIES REGISTRY — rename 'Plains Zebra' → 'Zebra' (Equus quagga)
-- ────────────────────────────────────────────────────────────────────────────
update public.species_registry
set common_name = 'Zebra'
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. OBSERVATIONS — rename 'Plains Zebra' → 'Zebra' (Equus quagga), then
--    remove the old park/seed records (obs_000001..obs_000012) so the new
--    survey dataset can load cleanly into those IDs.
-- ────────────────────────────────────────────────────────────────────────────
update public.observations
set common_name = 'Zebra'
where common_name = 'Plains Zebra'
  and scientific_name = 'Equus quagga';

delete from public.observations
where observation_id in (
  'obs_000001','obs_000002','obs_000003','obs_000004','obs_000005',
  'obs_000006','obs_000007','obs_000008','obs_000009','obs_000010',
  'obs_000011','obs_000012'
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
-- 4. OBSERVATIONS — normalize GBIF row labels (kept idempotent: 0 rows after
--    the first pass, retained for consistency with the parent migration).
-- ────────────────────────────────────────────────────────────────────────────
update public.observations
set habitat_type = 'Urban',
    focus_area   = 'CBU Campus'
where habitat_type = 'The CBU - Urban'
  and focus_area   = 'Copperbelt University';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. SITES — Nature Park default habitat (idempotent no-op after first pass)
-- ────────────────────────────────────────────────────────────────────────────
update public.sites
set habitat_type_default = 'Miombo Woodland'
where id = 'site_001';

-- Re-enable notification triggers.
alter table public.observations enable trigger handle_admin_action_notify;
alter table public.observations enable trigger handle_observation_delete_notify;