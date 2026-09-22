-- 202609160003 — Archiving the 155 single-hotspot eBird records
--
-- These 155 rows are not bad data, they are coarse data presented as precise.
-- Every one of them carries the same coordinate, -12.801566 / 28.238098, because
-- that is the eBird hotspot "Copperbelt University, Jambo Drive, Kitwe" - one
-- named location with one fixed point. 155 checklists were submitted there
-- between 2023-10-27 and 2024-06-06 and every one inherited it. The source's own
-- locality text says how much that point is worth: "(-12.802, 28.238)", three
-- decimals, about 100 metres. The import kept six decimals, and the map then drew
-- a pin-sharp marker for a place no observer stood.
--
-- What that did to the product, measured:
--   * 155 of 210 observations (74%) sat on one pixel.
--   * They were 55 of the ~68 species the app knows about, so the species filter,
--     the richness and Shannon series and every report KPI were mostly this one
--     hotspot's bird list.
--   * On the map they collapsed into a single bubble that no zoom could separate -
--     a hotspot centroid is one point at every zoom.
-- The owner's decision (2026-09-16): remove them.
--
-- WHY ARCHIVE AND NOT DELETE
--
-- `deleted_at` (issue #74) already hides a row from every read - `loadFromCloud`
-- filters `.is('deleted_at', null)` - and the Observations page's Archived view
-- can restore it. So archiving achieves exactly what "remove" means here (the
-- records leave the map, the tables, the species list and every count) while
-- remaining a decision that can be reversed without re-running an import.
--
-- If they should be gone permanently, that is a separate, deliberate step:
--   delete from public.observations
--    where source = 'gbif'
--      and latitude = -12.801566 and longitude = 28.238098;
-- It is recoverable in principle - `gbif_occurrences.csv` and
-- scripts/gbif-import/generate-migration.mjs regenerate them - but it costs a
-- re-import run, and this project has no database backups (Free plan).
--
-- NOT ARCHIVED, on purpose: the other 18 imported records. They sit on 9 distinct
-- coordinates from three datasets (eBird, Observation.org, Pl@ntNet) and so carry
-- real spatial spread; they are what keeps the CBU Campus focus area alive.
--
-- MEASURED BEFORE APPLYING (2026-09-16, live): 210 observations in total, 173 of
-- them `source = 'gbif'`, of which exactly 155 share this coordinate. Focus Area
-- "CBU Campus" holds 173 rows and becomes 18. Total observations become 55.
--
-- `deleted_by` stays NULL deliberately: no person archived these, a maintenance
-- decision did, and a fabricated uuid would misattribute it. The Observations
-- Archived view does not read that column.
--
-- NOTE: `handle_admin_action_notify` fires on ANY update and treats a non-status
-- change as "edited", so without disabling it this pass would post 155
-- notifications to every admin - the same hazard `202608240003` worked around.
-- `observations_log_review` needs no disabling: it only writes on a
-- verification_status change, which this file never makes.
--
-- Inverse:
--     update public.observations
--     set deleted_at = null, deleted_by = null
--     where source = 'gbif'
--       and latitude = -12.801566 and longitude = 28.238098
--       and deleted_at is not null;
--
-- After a restore, do not re-run this migration: the guard matches the rows and
-- would archive them again.

alter table public.observations disable trigger handle_admin_action_notify;

update public.observations
set deleted_at = now(),
    deleted_by = null
where source = 'gbif'
  and latitude = -12.801566
  and longitude = 28.238098
  and deleted_at is null;

alter table public.observations enable trigger handle_admin_action_notify;
