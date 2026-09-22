-- 202609160002 — Realigning the Nature Park survey coordinates
--
-- The 32-record park survey dataset (obs_000001..obs_000032, 14 Jun - 14 Aug
-- 2026) is tagged `The CBU Nature Park` but was seeded with coordinates that are
-- 3 km away from the park, in the Martindale/Parklands residential streets of
-- Kitwe (reverse geocoding the pair used most often, -12.8161/28.2124, names
-- "Enos Chomba Avenue, Martindale, Parklands"). Every one of the 37 park-tagged
-- records therefore drew its marker outside the park polygon - 36 of them outside
-- the whole CBU campus bounding box - which is the "park data recorded outside the
-- park" report.
--
-- WHY THESE COORDINATES AND NOT A PARK BOUNDARY CHANGE
--
-- The park polygon is not the thing that is wrong. `CBU_CAMPUS_COORDS` in
-- pages/admin/analytics/analytics.js reproduces the OpenStreetMap boundary of
-- Copperbelt University (way 100964340, bbox -12.8101758..-12.7999466 /
-- 28.2350148..28.2523057) to 5 decimal places, the park polygon sits inside it on
-- the Jambo Drive side, and the imported GBIF records - real eBird observations
-- from the "Copperbelt University, Jambo Drive" hotspot at -12.801566, 28.238098 -
-- fall in and around that same polygon. The seed data, not the map, is what
-- disagreed with the ground truth.
--
-- So the records move to the five spots their own `locality_description` names,
-- placed inside the park polygon (verified with a point-in-polygon test against
-- the exact vertex list in analytics.js; each spot sits at least 20 m inside the
-- boundary and at least 55 m from the others, so the markers stay visually
-- distinguishable at the park's fit zoom):
--
--   near the fence at the main gate              -12.80160, 28.23962   (7 records)
--   near the pond                                -12.80262, 28.23955   (9 records)
--   near the trees at the basketball court       -12.80272, 28.24042   (6 records)
--   near the fence at Jambo Drive                -12.80224, 28.23922   (5 records)
--   close to the antenna                         -12.80192, 28.24088   (5 records)
--
-- MEASURED BEFORE APPLYING (2026-09-16, live): the 32 rows hold exactly these five
-- coordinate pairs, grouped 9/7/6/5/5 by locality, and no other row in
-- `observations` carries any of them. 210 rows in total, 173 of them the GBIF
-- campus import. Dates, counts, species, officers, field notes and
-- verification_status are NOT touched, so every trend, baseline and population
-- estimate computed from this dataset is unchanged.
--
-- Each statement is guarded on the coordinate it is replacing, so re-running this
-- file is a no-op and a coordinate an officer has since corrected is left alone.
--
-- NOT INCLUDED, reported instead: obs_100174 (24 Aug 2026) carries latitude 2 /
-- longitude 6 with the locality "Gdd" - a junk test entry that plots in the Gulf
-- of Guinea. Inventing a position for it would repeat the mistake this migration
-- is fixing, so it is left for a human to flag or delete.
--
-- The notification trigger is disabled for this pass. `handle_admin_action_notify`
-- fires on every UPDATE and treats any change that is not a verification_status
-- change as an "Observation Edited" event, so a maintenance fix would post 32
-- notifications to every admin. `observations_log_review` needs no disabling: it
-- only writes when verification_status changes, which this file never touches.
--
-- Inverse:
--     update public.observations set latitude = -12.8132, longitude = 28.2146
--       where observation_id between 'obs_000001' and 'obs_000032'
--         and latitude = -12.80160 and longitude = 28.23962;
--     update public.observations set latitude = -12.8161, longitude = 28.2124
--       where observation_id between 'obs_000001' and 'obs_000032'
--         and latitude = -12.80262 and longitude = 28.23955;
--     update public.observations set latitude = -12.8171, longitude = 28.2136
--       where observation_id between 'obs_000001' and 'obs_000032'
--         and latitude = -12.80272 and longitude = 28.24042;
--     update public.observations set latitude = -12.8146, longitude = 28.2104
--       where observation_id between 'obs_000001' and 'obs_000032'
--         and latitude = -12.80224 and longitude = 28.23922;
--     update public.observations set latitude = -12.8116, longitude = 28.2166
--       where observation_id between 'obs_000001' and 'obs_000032'
--         and latitude = -12.80192 and longitude = 28.24088;
--
-- Reverting restores the original (wrong) positions; no row is created or removed.

alter table public.observations disable trigger handle_admin_action_notify;

update public.observations
set latitude = -12.80160, longitude = 28.23962
where source = 'field_observation'
  and focus_area = 'The CBU Nature Park'
  and timestamp < timestamptz '2026-08-15 00:00:00+00'
  and latitude = -12.8132 and longitude = 28.2146;

update public.observations
set latitude = -12.80262, longitude = 28.23955
where source = 'field_observation'
  and focus_area = 'The CBU Nature Park'
  and timestamp < timestamptz '2026-08-15 00:00:00+00'
  and latitude = -12.8161 and longitude = 28.2124;

update public.observations
set latitude = -12.80272, longitude = 28.24042
where source = 'field_observation'
  and focus_area = 'The CBU Nature Park'
  and timestamp < timestamptz '2026-08-15 00:00:00+00'
  and latitude = -12.8171 and longitude = 28.2136;

update public.observations
set latitude = -12.80224, longitude = 28.23922
where source = 'field_observation'
  and focus_area = 'The CBU Nature Park'
  and timestamp < timestamptz '2026-08-15 00:00:00+00'
  and latitude = -12.8146 and longitude = 28.2104;

update public.observations
set latitude = -12.80192, longitude = 28.24088
where source = 'field_observation'
  and focus_area = 'The CBU Nature Park'
  and timestamp < timestamptz '2026-08-15 00:00:00+00'
  and latitude = -12.8116 and longitude = 28.2166;

alter table public.observations enable trigger handle_admin_action_notify;
