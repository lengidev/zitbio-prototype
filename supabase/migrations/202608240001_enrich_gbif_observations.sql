-- ============================================================================
-- ZitBIO — Enrich GBIF Observations (updated scientific/common names)
-- ============================================================================
-- Follow-up to 202608230003_import_gbif_observations.
-- The original import stored raw GBIF scientific names WITH authorship
-- (e.g. "Pycnonotus barbatus (Desfontaines, 1789)") and empty common_name.
-- This migration strips authorship from scientific_name and backfills the
-- mapped vernacular (common) names for all 173 GBIF records.
--
-- Idempotent: re-running sets the same values (no-op on second run).
--
-- NOTE: the handle_admin_action_notify UPDATE trigger is temporarily disabled
-- so this bulk data-enrichment pass does not spam admins with
-- 'observation_edited' notifications. Re-enabled immediately after.
-- ============================================================================
alter table public.observations disable trigger handle_admin_action_notify;
alter table public.observations disable trigger handle_observation_delete_notify;

insert into public.observations (
  observation_id, user_id, count, verification_status, source,
  scientific_name, common_name,
  latitude, longitude, country, administrative_area, city, focus_area,
  habitat_type, locality_description,
  recorded_by, timestamp, institution_name, activity, field_notes
) values
  (
    'obs_100001', null, 1, 'Approved', 'gbif', 'Pycnonotus barbatus', 'Dark-capped Bulbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5298344616'
  ),
  (
    'obs_100002', null, 1, 'Approved', 'gbif', 'Cecropis senegalensis', 'West African Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5298844183'
  ),
  (
    'obs_100003', null, 1, 'Approved', 'gbif', 'Phyllastrephus terrestris', 'Terrestrial Brownbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5303071883'
  ),
  (
    'obs_100004', null, 1, 'Approved', 'gbif', 'Cypsiurus parvus', 'African Palm Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5304646828'
  ),
  (
    'obs_100005', null, 1, 'Approved', 'gbif', 'Dryoscopus cubla', 'Black-backed Puffback', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5308451902'
  ),
  (
    'obs_100006', null, 1, 'Approved', 'gbif', 'Crithagra mozambica', 'Yellow-fronted Canary', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5311977669'
  ),
  (
    'obs_100007', null, 1, 'Approved', 'gbif', 'Chalcomitra amethystina', 'Amethyst Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5316226012'
  ),
  (
    'obs_100008', null, 1, 'Approved', 'gbif', 'Cecropis senegalensis', 'West African Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5316283064'
  ),
  (
    'obs_100009', null, 1, 'Approved', 'gbif', 'Laniarius major', 'Tropical Boubou', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5316288762'
  ),
  (
    'obs_100010', null, 1, 'Approved', 'gbif', 'Hedydipna collaris', 'Collared Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5322954598'
  ),
  (
    'obs_100011', null, 1, 'Approved', 'gbif', 'Pycnonotus barbatus', 'Dark-capped Bulbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5322976146'
  ),
  (
    'obs_100012', null, 1, 'Approved', 'gbif', 'Dendropicos fuscescens', 'Cardinal Woodpecker', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5324564930'
  ),
  (
    'obs_100013', null, 1, 'Approved', 'gbif', 'Apus affinis', 'Little Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5328397180'
  ),
  (
    'obs_100014', null, 1, 'Approved', 'gbif', 'Urocolius indicus', 'Red-faced Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5329409383'
  ),
  (
    'obs_100015', null, 1, 'Approved', 'gbif', 'Centropus superciliosus', 'White-browed Coucal', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5330079453'
  ),
  (
    'obs_100016', null, 1, 'Approved', 'gbif', 'Merops pusillus', 'Little Bee-eater', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5330086151'
  ),
  (
    'obs_100017', null, 1, 'Approved', 'gbif', 'Passer griseus', 'Grey-headed Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5332563090'
  ),
  (
    'obs_100018', null, 1, 'Approved', 'gbif', 'Lybius torquatus', 'Black-collared Barbet', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5333216169'
  ),
  (
    'obs_100019', null, 1, 'Approved', 'gbif', 'Hirundo smithii', 'Wire-tailed Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5335628957'
  ),
  (
    'obs_100020', null, 1, 'Approved', 'gbif', 'Lagonosticta nitidula', 'Brown Firefinch', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5337046628'
  ),
  (
    'obs_100021', null, 1, 'Approved', 'gbif', 'Lybius torquatus', 'Black-collared Barbet', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5337513146'
  ),
  (
    'obs_100022', null, 1, 'Approved', 'gbif', 'Bycanistes bucinator', 'Trumpeter Hornbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5340785372'
  ),
  (
    'obs_100023', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5342174214'
  ),
  (
    'obs_100024', null, 1, 'Approved', 'gbif', 'Cecropis abyssinica', 'Lesser Striped Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5342441466'
  ),
  (
    'obs_100025', null, 1, 'Approved', 'gbif', 'Atimastillas flavigula', 'Yellow-throated Leaflove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5343649365'
  ),
  (
    'obs_100026', null, 1, 'Approved', 'gbif', 'Scopus umbretta', 'Hamerkop', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5343988107'
  ),
  (
    'obs_100027', null, 1, 'Approved', 'gbif', 'Uraeginthus angolensis', 'Blue Waxbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5347619475'
  ),
  (
    'obs_100028', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5349068168'
  ),
  (
    'obs_100029', null, 1, 'Approved', 'gbif', 'Streptopelia semitorquata', 'Red-eyed Dove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5351553780'
  ),
  (
    'obs_100030', null, 1, 'Approved', 'gbif', 'Zosterops anderssoni', 'Southern Yellow White-eye', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5353023408'
  ),
  (
    'obs_100031', null, 1, 'Approved', 'gbif', 'Urocolius indicus', 'Red-faced Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5354077575'
  ),
  (
    'obs_100032', null, 1, 'Approved', 'gbif', 'Motacilla aguimp', 'African Pied Wagtail', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5362576648'
  ),
  (
    'obs_100033', null, 1, 'Approved', 'gbif', 'Pogoniulus chrysoconus', 'Yellow-fronted Tinkerbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5363575712'
  ),
  (
    'obs_100034', null, 1, 'Approved', 'gbif', 'Ploceus xanthops', 'Holub''s Golden Weaver', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5368167683'
  ),
  (
    'obs_100035', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5369408306'
  ),
  (
    'obs_100036', null, 1, 'Approved', 'gbif', 'Spermestes cucullata', 'Bronze Mannikin', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5369991692'
  ),
  (
    'obs_100037', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5373208623'
  ),
  (
    'obs_100038', null, 1, 'Approved', 'gbif', 'Ardea cinerea', 'Grey Heron', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5373314308'
  ),
  (
    'obs_100039', null, 1, 'Approved', 'gbif', 'Crithagra mozambica', 'Yellow-fronted Canary', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5375760430'
  ),
  (
    'obs_100040', null, 1, 'Approved', 'gbif', 'Spermestes cucullata', 'Bronze Mannikin', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5379330811'
  ),
  (
    'obs_100041', null, 1, 'Approved', 'gbif', 'Hirundo smithii', 'Wire-tailed Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5381039514'
  ),
  (
    'obs_100042', null, 1, 'Approved', 'gbif', 'Passer griseus', 'Grey-headed Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5382819236'
  ),
  (
    'obs_100043', null, 1, 'Approved', 'gbif', 'Zosterops anderssoni', 'Southern Yellow White-eye', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5383783753'
  ),
  (
    'obs_100044', null, 1, 'Approved', 'gbif', 'Colius striatus', 'Speckled Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5385488761'
  ),
  (
    'obs_100045', null, 1, 'Approved', 'gbif', 'Motacilla aguimp', 'African Pied Wagtail', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5395900436'
  ),
  (
    'obs_100046', null, 1, 'Approved', 'gbif', 'Passer domesticus', 'House Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5396373068'
  ),
  (
    'obs_100047', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5398750753'
  ),
  (
    'obs_100048', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5398772553'
  ),
  (
    'obs_100049', null, 1, 'Approved', 'gbif', 'Ploceus xanthops', 'Holub''s Golden Weaver', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5400199110'
  ),
  (
    'obs_100050', null, 1, 'Approved', 'gbif', 'Colius striatus', 'Speckled Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5403345684'
  ),
  (
    'obs_100051', null, 1, 'Approved', 'gbif', 'Gymnoris superciliaris', 'Yellow-spotted Bush Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5404358970'
  ),
  (
    'obs_100052', null, 1, 'Approved', 'gbif', 'Passer domesticus', 'House Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5404493024'
  ),
  (
    'obs_100053', null, 1, 'Approved', 'gbif', 'Cisticola woosnami', 'White-tailed Cisticola', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5406732960'
  ),
  (
    'obs_100054', null, 1, 'Approved', 'gbif', 'Chalcomitra amethystina', 'Amethyst Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5406992599'
  ),
  (
    'obs_100055', null, 1, 'Approved', 'gbif', 'Passer griseus', 'Grey-headed Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5408071627'
  ),
  (
    'obs_100056', null, 1, 'Approved', 'gbif', 'Ploceus ocularis', 'Spectacled Weaver', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5411595120'
  ),
  (
    'obs_100057', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5412334382'
  ),
  (
    'obs_100058', null, 1, 'Approved', 'gbif', 'Cypsiurus parvus', 'African Palm Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5412774485'
  ),
  (
    'obs_100059', null, 1, 'Approved', 'gbif', 'Cossypha heuglini', 'White-browed Robin-Chat', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5415640667'
  ),
  (
    'obs_100060', null, 1, 'Approved', 'gbif', 'Scopus umbretta', 'Hamerkop', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5416179418'
  ),
  (
    'obs_100061', null, 1, 'Approved', 'gbif', 'Pycnonotus barbatus', 'Dark-capped Bulbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5418471324'
  ),
  (
    'obs_100062', null, 1, 'Approved', 'gbif', 'Cisticola woosnami', 'White-tailed Cisticola', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5418747665'
  ),
  (
    'obs_100063', null, 1, 'Approved', 'gbif', 'Elanus caeruleus', 'Black-winged Kite', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5419313070'
  ),
  (
    'obs_100064', null, 1, 'Approved', 'gbif', 'Chalcomitra amethystina', 'Amethyst Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5427136560'
  ),
  (
    'obs_100065', null, 1, 'Approved', 'gbif', 'Prinia subflava', 'Tawny-flanked Prinia', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5431042336'
  ),
  (
    'obs_100066', null, 1, 'Approved', 'gbif', 'Spermestes cucullata', 'Bronze Mannikin', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5433375296'
  ),
  (
    'obs_100067', null, 1, 'Approved', 'gbif', 'Passer domesticus', 'House Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5435655409'
  ),
  (
    'obs_100068', null, 1, 'Approved', 'gbif', 'Atimastillas flavigula', 'Yellow-throated Leaflove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5436156254'
  ),
  (
    'obs_100069', null, 1, 'Approved', 'gbif', 'Scopus umbretta', 'Hamerkop', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5436752457'
  ),
  (
    'obs_100070', null, 1, 'Approved', 'gbif', 'Hedydipna collaris', 'Collared Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5438945124'
  ),
  (
    'obs_100071', null, 1, 'Approved', 'gbif', 'Euplectes ardens', 'Red-collared Widowbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5442039538'
  ),
  (
    'obs_100072', null, 1, 'Approved', 'gbif', 'Hedydipna collaris', 'Collared Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5443227781'
  ),
  (
    'obs_100073', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5444662249'
  ),
  (
    'obs_100074', null, 1, 'Approved', 'gbif', 'Motacilla aguimp', 'African Pied Wagtail', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5448304385'
  ),
  (
    'obs_100075', null, 1, 'Approved', 'gbif', 'Turtur chalcospilos', 'Emerald-spotted Wood Dove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5451980502'
  ),
  (
    'obs_100076', null, 1, 'Approved', 'gbif', 'Chalcomitra amethystina', 'Amethyst Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5452021084'
  ),
  (
    'obs_100077', null, 1, 'Approved', 'gbif', 'Egretta garzetta', 'Little Egret', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5458666553'
  ),
  (
    'obs_100078', null, 1, 'Approved', 'gbif', 'Uraeginthus angolensis', 'Blue Waxbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5463418274'
  ),
  (
    'obs_100079', null, 1, 'Approved', 'gbif', 'Spermestes cucullata', 'Bronze Mannikin', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5464902436'
  ),
  (
    'obs_100080', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5467525632'
  ),
  (
    'obs_100081', null, 1, 'Approved', 'gbif', 'Dryoscopus cubla', 'Black-backed Puffback', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5470268671'
  ),
  (
    'obs_100082', null, 1, 'Approved', 'gbif', 'Pycnonotus barbatus', 'Dark-capped Bulbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5475298893'
  ),
  (
    'obs_100083', null, 1, 'Approved', 'gbif', 'Cecropis abyssinica', 'Lesser Striped Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5476022604'
  ),
  (
    'obs_100084', null, 1, 'Approved', 'gbif', 'Dendropicos fuscescens', 'Cardinal Woodpecker', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5478324118'
  ),
  (
    'obs_100085', null, 1, 'Approved', 'gbif', 'Cypsiurus parvus', 'African Palm Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5478900228'
  ),
  (
    'obs_100086', null, 1, 'Approved', 'gbif', 'Apus affinis', 'Little Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5479857333'
  ),
  (
    'obs_100087', null, 1, 'Approved', 'gbif', 'Cossypha heuglini', 'White-browed Robin-Chat', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5492098459'
  ),
  (
    'obs_100088', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5502861562'
  ),
  (
    'obs_100089', null, 1, 'Approved', 'gbif', 'Bycanistes bucinator', 'Trumpeter Hornbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5509127736'
  ),
  (
    'obs_100090', null, 1, 'Approved', 'gbif', 'Motacilla aguimp', 'African Pied Wagtail', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5519489841'
  ),
  (
    'obs_100091', null, 1, 'Approved', 'gbif', 'Laniarius major', 'Tropical Boubou', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5529665116'
  ),
  (
    'obs_100092', null, 1, 'Approved', 'gbif', 'Ardea cinerea', 'Grey Heron', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5531690343'
  ),
  (
    'obs_100093', null, 1, 'Approved', 'gbif', 'Centropus superciliosus', 'White-browed Coucal', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5547197929'
  ),
  (
    'obs_100094', null, 1, 'Approved', 'gbif', 'Elanus caeruleus', 'Black-winged Kite', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5550802382'
  ),
  (
    'obs_100095', null, 1, 'Approved', 'gbif', 'Lagonosticta rubricata', 'African Firefinch', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5551886854'
  ),
  (
    'obs_100096', null, 1, 'Approved', 'gbif', 'Pogonornis minor', 'Black-breasted Barbet', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5553748074'
  ),
  (
    'obs_100097', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5558695816'
  ),
  (
    'obs_100098', null, 1, 'Approved', 'gbif', 'Laniarius major', 'Tropical Boubou', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5563671734'
  ),
  (
    'obs_100099', null, 1, 'Approved', 'gbif', 'Prinia subflava', 'Tawny-flanked Prinia', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5565750079'
  ),
  (
    'obs_100100', null, 1, 'Approved', 'gbif', 'Streptopelia semitorquata', 'Red-eyed Dove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5566091879'
  ),
  (
    'obs_100101', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5569556455'
  ),
  (
    'obs_100102', null, 1, 'Approved', 'gbif', 'Lybius torquatus', 'Black-collared Barbet', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5572432921'
  ),
  (
    'obs_100103', null, 1, 'Approved', 'gbif', 'Apus affinis', 'Little Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5575344079'
  ),
  (
    'obs_100104', null, 1, 'Approved', 'gbif', 'Zosterops anderssoni', 'Southern Yellow White-eye', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5577957632'
  ),
  (
    'obs_100105', null, 1, 'Approved', 'gbif', 'Euplectes ardens', 'Red-collared Widowbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5578310385'
  ),
  (
    'obs_100106', null, 1, 'Approved', 'gbif', 'Pogoniulus chrysoconus', 'Yellow-fronted Tinkerbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5580300638'
  ),
  (
    'obs_100107', null, 1, 'Approved', 'gbif', 'Turtur chalcospilos', 'Emerald-spotted Wood Dove', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5582449740'
  ),
  (
    'obs_100108', null, 1, 'Approved', 'gbif', 'Colius striatus', 'Speckled Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5590897300'
  ),
  (
    'obs_100109', null, 1, 'Approved', 'gbif', 'Merops pusillus', 'Little Bee-eater', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5600929573'
  ),
  (
    'obs_100110', null, 1, 'Approved', 'gbif', 'Apus affinis', 'Little Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5603356479'
  ),
  (
    'obs_100111', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5604167451'
  ),
  (
    'obs_100112', null, 1, 'Approved', 'gbif', 'Lagonosticta rubricata', 'African Firefinch', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5609912615'
  ),
  (
    'obs_100113', null, 1, 'Approved', 'gbif', 'Cossypha heuglini', 'White-browed Robin-Chat', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5611119391'
  ),
  (
    'obs_100114', null, 1, 'Approved', 'gbif', 'Uraeginthus angolensis', 'Blue Waxbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5617217172'
  ),
  (
    'obs_100115', null, 1, 'Approved', 'gbif', 'Ploceus ocularis', 'Spectacled Weaver', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5621084814'
  ),
  (
    'obs_100116', null, 1, 'Approved', 'gbif', 'Prinia subflava', 'Tawny-flanked Prinia', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-31T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5624790707'
  ),
  (
    'obs_100117', null, 1, 'Approved', 'gbif', 'Oriolus auratus', 'African Golden Oriole', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-20T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5656468180'
  ),
  (
    'obs_100118', null, 1, 'Approved', 'gbif', 'Lagonosticta nitidula', 'Brown Firefinch', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5658198912'
  ),
  (
    'obs_100119', null, 1, 'Approved', 'gbif', 'Prinia subflava', 'Tawny-flanked Prinia', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5667854192'
  ),
  (
    'obs_100120', null, 1, 'Approved', 'gbif', 'Phyllastrephus terrestris', 'Terrestrial Brownbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-05-11T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5677598577'
  ),
  (
    'obs_100121', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-06-06T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5385383921'
  ),
  (
    'obs_100122', null, 1, 'Approved', 'gbif', 'Ardea melanocephala', 'Black-headed Heron', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2024-06-06T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 5454386939'
  ),
  (
    'obs_100123', null, 1, 'Approved', 'gbif', 'Motacilla aguimp', 'African Pied Wagtail', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4614922344'
  ),
  (
    'obs_100124', null, 1, 'Approved', 'gbif', 'Turdus litsitsirupa', 'Groundscraper Thrush', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4617497140'
  ),
  (
    'obs_100125', null, 1, 'Approved', 'gbif', 'Hirundo rustica', 'Barn Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4632644974'
  ),
  (
    'obs_100126', null, 1, 'Approved', 'gbif', 'Colius striatus', 'Speckled Mousebird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4640278634'
  ),
  (
    'obs_100127', null, 1, 'Approved', 'gbif', 'Spermestes cucullata', 'Bronze Mannikin', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4647005573'
  ),
  (
    'obs_100128', null, 1, 'Approved', 'gbif', 'Chrysococcyx klaas', 'Klaas''s Cuckoo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4647213959'
  ),
  (
    'obs_100129', null, 1, 'Approved', 'gbif', 'Uraeginthus angolensis', 'Blue Waxbill', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4649499661'
  ),
  (
    'obs_100130', null, 1, 'Approved', 'gbif', 'Pogonornis minor', 'Black-breasted Barbet', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4654035330'
  ),
  (
    'obs_100131', null, 1, 'Approved', 'gbif', 'Pogoniulus chrysoconus', 'Yellow-fronted Tinkerbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4659240330'
  ),
  (
    'obs_100132', null, 1, 'Approved', 'gbif', 'Zosterops anderssoni', 'Southern Yellow White-eye', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4669056380'
  ),
  (
    'obs_100133', null, 1, 'Approved', 'gbif', 'Dendropicos fuscescens', 'Cardinal Woodpecker', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4724605456'
  ),
  (
    'obs_100134', null, 1, 'Approved', 'gbif', 'Scopus umbretta', 'Hamerkop', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4737477356'
  ),
  (
    'obs_100135', null, 1, 'Approved', 'gbif', 'Passer domesticus', 'House Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4738352547'
  ),
  (
    'obs_100136', null, 1, 'Approved', 'gbif', 'Tauraco schalowi', 'Schalow''s Turaco', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4738488336'
  ),
  (
    'obs_100137', null, 1, 'Approved', 'gbif', 'Upupa epops', 'Common Hoopoe', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4741414206'
  ),
  (
    'obs_100138', null, 1, 'Approved', 'gbif', 'Crithagra mozambica', 'Yellow-fronted Canary', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4743430047'
  ),
  (
    'obs_100139', null, 1, 'Approved', 'gbif', 'Ardea cinerea', 'Grey Heron', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4744774570'
  ),
  (
    'obs_100140', null, 1, 'Approved', 'gbif', 'Cossypha heuglini', 'White-browed Robin-Chat', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4745403329'
  ),
  (
    'obs_100141', null, 1, 'Approved', 'gbif', 'Egretta garzetta', 'Little Egret', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4745913721'
  ),
  (
    'obs_100142', null, 1, 'Approved', 'gbif', 'Dryoscopus cubla', 'Black-backed Puffback', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4747872723'
  ),
  (
    'obs_100143', null, 1, 'Approved', 'gbif', 'Pycnonotus barbatus', 'Dark-capped Bulbul', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4749398558'
  ),
  (
    'obs_100144', null, 1, 'Approved', 'gbif', 'Terpsiphone viridis', 'African Paradise Flycatcher', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4750178131'
  ),
  (
    'obs_100145', null, 1, 'Approved', 'gbif', 'Hedydipna collaris', 'Collared Sunbird', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4754131578'
  ),
  (
    'obs_100146', null, 1, 'Approved', 'gbif', 'Apus affinis', 'Little Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4799566308'
  ),
  (
    'obs_100147', null, 1, 'Approved', 'gbif', 'Passer griseus', 'Grey-headed Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4806044542'
  ),
  (
    'obs_100148', null, 1, 'Approved', 'gbif', 'Gymnoris superciliaris', 'Yellow-spotted Bush Sparrow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4815018680'
  ),
  (
    'obs_100149', null, 1, 'Approved', 'gbif', 'Laniarius major', 'Tropical Boubou', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4817959988'
  ),
  (
    'obs_100150', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4819363143'
  ),
  (
    'obs_100151', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4819819011'
  ),
  (
    'obs_100152', null, 1, 'Approved', 'gbif', 'Cypsiurus parvus', 'African Palm Swift', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4823833695'
  ),
  (
    'obs_100153', null, 1, 'Approved', 'gbif', 'Cinnyricinclus leucogaster', 'Violet-backed Starling', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4836348866'
  ),
  (
    'obs_100154', null, 1, 'Approved', 'gbif', 'Cecropis abyssinica', 'Lesser Striped Swallow', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4843892120'
  ),
  (
    'obs_100155', null, 1, 'Approved', 'gbif', 'Tachyspiza', '', -12.801566, 28.238098, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University, Jambo Drive, Kitwe, Copperbelt Province, ZM (-12.802, 28.238)', 'eBird (GBIF)', '2023-10-27T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4844364964'
  ),
  (
    'obs_100156', null, 1, 'Approved', 'gbif', 'Duranta erecta', 'Golden Dewdrop', -12.806355, 28.238118, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2022-03-18T13:02:52.695Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3953625425'
  ),
  (
    'obs_100157', null, 1, 'Approved', 'gbif', 'Melia azedarach', 'Chinaberry Tree', -12.806497, 28.240887, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2022-03-19T09:55:49.273Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3958059651'
  ),
  (
    'obs_100158', null, 1, 'Approved', 'gbif', 'Psammophis angolensis', 'Dwarf Sand Snake', -12.806464, 28.241739, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt', 'Observation.org (GBIF)', '2022-05-19T00:00:00Z', 'Observation.org', '', 'GBIF occurrence ID 5901694863'
  ),
  (
    'obs_100159', null, 1, 'Approved', 'gbif', 'Passer domesticus', 'House Sparrow', -12.805907, 28.238487, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University', 'eBird (GBIF)', '2022-07-21T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4291666071'
  ),
  (
    'obs_100160', null, 1, 'Approved', 'gbif', 'Dicrurus adsimilis', 'Fork-tailed Drongo', -12.805907, 28.238487, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University', 'eBird (GBIF)', '2022-07-21T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4358390116'
  ),
  (
    'obs_100161', null, 1, 'Approved', 'gbif', 'Corvus albus', 'Pied Crow', -12.805907, 28.238487, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University', 'eBird (GBIF)', '2022-07-21T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4373696460'
  ),
  (
    'obs_100162', null, 1, 'Approved', 'gbif', 'Columba livia', 'Rock Dove', -12.805907, 28.238487, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt University', 'eBird (GBIF)', '2022-07-21T00:00:00Z', 'eBird / Cornell Lab of Ornithology', '', 'GBIF occurrence ID 4388465543'
  ),
  (
    'obs_100163', null, 1, 'Approved', 'gbif', 'Anahita', '', -12.806464, 28.241739, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt', 'Observation.org (GBIF)', '2022-11-24T00:00:00Z', 'Observation.org', '', 'GBIF occurrence ID 5902059047'
  ),
  (
    'obs_100164', null, 1, 'Approved', 'gbif', 'Naja nigricollis', 'Black-necked Spitting Cobra', -12.806464, 28.241739, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt', 'Observation.org (GBIF)', '2021-05-07T00:00:00Z', 'Observation.org', '', 'GBIF occurrence ID 5902899374'
  ),
  (
    'obs_100165', null, 1, 'Approved', 'gbif', 'Duranta erecta', 'Golden Dewdrop', -12.801577, 28.238632, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-26T23:33:24.118Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3952598237'
  ),
  (
    'obs_100166', null, 1, 'Approved', 'gbif', 'Ipomoea cairica', 'Coast Morning Glory', -12.802937, 28.239945, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-28T15:00:12.862Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3953986231'
  ),
  (
    'obs_100167', null, 1, 'Approved', 'gbif', 'Ipomoea cairica', 'Coast Morning Glory', -12.802937, 28.239945, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-28T13:54:51.457Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3954667721'
  ),
  (
    'obs_100168', null, 1, 'Approved', 'gbif', 'Psidium guajava', 'Guava', -12.805645, 28.240087, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-27T05:49:45.217Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3955009493'
  ),
  (
    'obs_100169', null, 1, 'Approved', 'gbif', 'Ipomoea cairica', 'Coast Morning Glory', -12.80292, 28.239937, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-28T20:09:38.937Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3958184892'
  ),
  (
    'obs_100170', null, 1, 'Approved', 'gbif', 'Psidium guajava', 'Guava', -12.805645, 28.240087, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-28T08:52:06.504Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3958337481'
  ),
  (
    'obs_100171', null, 1, 'Approved', 'gbif', 'Ipomoea cairica', 'Coast Morning Glory', -12.802937, 28.239945, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2021-08-29T15:02:37.613Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3959403109'
  ),
  (
    'obs_100172', null, 1, 'Approved', 'gbif', 'Nudaurelia dione', '', -12.806464, 28.241739, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', 'Copperbelt', 'Observation.org (GBIF)', '2020-12-19T00:00:00Z', 'Observation.org', '', 'GBIF occurrence ID 5902665637'
  ),
  (
    'obs_100173', null, 1, 'Approved', 'gbif', 'Tithonia diversifolia', 'Mexican Sunflower', -12.808349, 28.239878, 'Zambia', 'Copperbelt Province', 'Kitwe', 'CBU Campus', 'Urban', '', 'Pl@ntNet (GBIF)', '2019-06-14T09:31:15.889Z', 'Pl@ntNet', '', 'GBIF occurrence ID 3953364671'
  )
on conflict (observation_id) do update set
  scientific_name = excluded.scientific_name,
  common_name = excluded.common_name;

alter table public.observations enable trigger handle_admin_action_notify;
alter table public.observations enable trigger handle_observation_delete_notify;
