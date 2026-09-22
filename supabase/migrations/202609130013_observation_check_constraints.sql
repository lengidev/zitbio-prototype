-- ────────────────────────────────────────────────────────────────────────────
-- B4 · Integrity — #57: no CHECK constraints meant invalid data was accepted
--
-- The `public` schema had zero CHECK constraints. The live evidence is a single
-- observation reading `Zebra, count = 0, recorded by Jeromy Ngoma, 2026-08-24` —
-- not a valid population count, and capable of generating a false
-- "decline vs baseline 3" warning because 0 sits below every baseline.
--
-- Latitude/longitude ranges and note lengths were equally unguarded.
--
-- All four constraints are added `NOT VALID` on purpose:
--
--   * `NOT VALID` still enforces them on every INSERT and UPDATE — the goal is
--     "invalid data cannot be accepted", and it is met from this moment.
--   * It exempts rows that already exist, so the migration cannot fail on live
--     data. There is exactly one such row (the count = 0 above).
--
-- Validating that row would mean inventing a count or deleting a field record.
-- Neither is my call to make silently, so it is left in place and reported
-- instead. Run `validate constraint` once it has been corrected or archived.
-- ────────────────────────────────────────────────────────────────────────────

-- Population counts are positive. The field-officer form already requires this
-- and its stepper floors at 1, so no legitimate path can produce 0.
alter table public.observations
  add constraint observations_count_positive
  check (count > 0) not valid;

alter table public.observations
  add constraint observations_latitude_range
  check (latitude is null or (latitude between -90 and 90)) not valid;

alter table public.observations
  add constraint observations_longitude_range
  check (longitude is null or (longitude between -180 and 180)) not valid;

-- Free text has no natural ceiling, but an unbounded field is a storage and
-- rendering hazard rather than a data-model one.
alter table public.observations
  add constraint observations_field_notes_length
  check (char_length(field_notes) <= 2000) not valid;

comment on constraint observations_count_positive on public.observations is
  'Population count must be positive (#57). NOT VALID: one legacy count = 0 row is exempt.';

-- What the constraints are currently forgiving, so the exemption is measurable
-- rather than folklore.
create or replace view public.v_observations_check_exemptions as
select
  'count <= 0' as violated_constraint,
  observation_id,
  common_name,
  count::text as offending_value,
  recorded_by
from public.observations
where count <= 0
union all
select 'latitude out of range', observation_id, common_name, latitude::text, recorded_by
from public.observations
where latitude is not null and (latitude < -90 or latitude > 90)
union all
select 'longitude out of range', observation_id, common_name, longitude::text, recorded_by
from public.observations
where longitude is not null and (longitude < -180 or longitude > 180)
union all
select 'field_notes too long', observation_id, common_name,
       char_length(field_notes)::text, recorded_by
from public.observations
where char_length(field_notes) > 2000;
