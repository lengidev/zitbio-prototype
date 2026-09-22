-- ============================================================================
-- ZitBIO — Zone anchors
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- Deciding which zone a walk happened in needs somewhere for the zone to BE. A
-- zone was a name with no position, so the app could only ask the officer, and a
-- walk filed under the wrong zone misplaces every count inside it.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It seeds no coordinates. A fabricated anchor is worse than no anchor: it would
-- place a walk confidently in the wrong zone and nothing downstream could tell.
-- The columns arrive NULL and an admin fills them from a map, one row per zone.
--
-- Until a zone has an anchor the app asks the officer, and records that it asked
-- by writing `survey_zones.zone_source = 'manual'` rather than 'gps'. The absence
-- of an anchor is therefore visible in the data instead of being papered over.
--
-- Polygons replace anchors later, and need PostGIS, which is not installed. This
-- is the cheap step that comes first and the one the app can use today.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     alter table public.sites drop constraint if exists sites_latitude_range;
--     alter table public.sites drop constraint if exists sites_longitude_range;
--     alter table public.sites drop column if exists longitude;
--     alter table public.sites drop column if exists latitude;
--
-- Dropping these discards no measurement. Only the anchors themselves go.
-- ---------------------------------------------------------------------------

alter table public.sites add column if not exists latitude  numeric;
alter table public.sites add column if not exists longitude numeric;

alter table public.sites drop constraint if exists sites_latitude_range;
alter table public.sites add constraint sites_latitude_range
  check (latitude is null or (latitude >= -90 and latitude <= 90));

alter table public.sites drop constraint if exists sites_longitude_range;
alter table public.sites add constraint sites_longitude_range
  check (longitude is null or (longitude >= -180 and longitude <= 180));

comment on column public.sites.latitude is
  'Anchor for matching a walk to a zone. NULL until an admin places it from a map, and the app asks the officer while it is NULL.';
comment on column public.sites.longitude is
  'Anchor for matching a walk to a zone. NULL until an admin places it from a map.';
