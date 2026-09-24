-- ============================================================================
-- ZitBIO — a measured distance needs its own accuracy
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `surveys.distance_m` is a measured number, and a measurement without its
-- uncertainty cannot be judged later. The browser sums the walk from GPS fixes
-- with a 50 m accuracy ceiling, so an accepted track can still be built from
-- fixes anywhere between a few metres and fifty. Those are not the same walk for
-- any purpose that compares effort, and nothing recorded said which one it was.
--
-- WHAT THIS ADDS
-- --------------
-- `distance_accuracy_m` — the typical accuracy radius of the fixes the distance
-- was summed from, in metres. Typical (the median of the accepted fixes) rather
-- than the best or the worst: one good reading should not flatter a sloppy walk,
-- and one bad reading at either end should not damn a good one.
--
-- It is NULL, deliberately, in three cases that are not the same fact:
--   * the officer typed the distance by hand, so there is no GPS figure to
--     attach an accuracy to (submit_wildlife_survey only writes it when the
--     browser says the number came from the track);
--   * the walk was never measured because location was off;
--   * the record predates this column.
-- A blank here therefore means "not measured by us", never "measured badly".
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     alter table public.surveys drop constraint if exists surveys_distance_accuracy_non_negative;
--     alter table public.surveys drop column if exists distance_accuracy_m;
--     -- and re-run 202609240001_wildlife_submission_enum_cast.sql, which is the
--     -- previous definition of the function below.
-- ---------------------------------------------------------------------------

-- 1. THE COLUMN
alter table public.surveys
  add column if not exists distance_accuracy_m numeric;

alter table public.surveys
  drop constraint if exists surveys_distance_accuracy_non_negative;

alter table public.surveys
  add constraint surveys_distance_accuracy_non_negative
  check (distance_accuracy_m is null or distance_accuracy_m >= 0);

comment on column public.surveys.distance_accuracy_m is
  'Typical (median) accuracy radius in metres of the GPS fixes the distance was summed from. '
  'Null means the distance was typed by hand, was not measured, or the row predates this column.';

-- 2. THE WRITER
-- Only the surveys insert changes: the accuracy column, its value, and the
-- upsert branch. The observation insert and the enum cast from 202609240001 are
-- carried over unchanged.
create or replace function public.submit_wildlife_survey(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_survey_id uuid;
  v_row jsonb := coalesce(p_payload -> 'surveyRow', '{}'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to submit a wildlife walk';
  end if;
  if coalesce(v_row ->> 'survey_id', '') = '' or v_row ->> 'survey_type' <> 'wildlife_census' then
    raise exception 'A wildlife walk needs a survey id and wildlife_census type';
  end if;

  insert into public.surveys (
    survey_id, survey_type, user_id, recorded_by, method, effort_basis,
    effort_status, started_at, ended_at, distance_m, distance_accuracy_m,
    rainfall_officer_flag, provenance
  ) values (
    v_row ->> 'survey_id', 'wildlife_census', auth.uid(), coalesce(v_row ->> 'recorded_by', ''),
    coalesce(v_row ->> 'method', ''), coalesce(v_row ->> 'effort_basis', 'distance_transect'),
    'known', (v_row ->> 'started_at')::timestamptz, (v_row ->> 'ended_at')::timestamptz,
    nullif(v_row ->> 'distance_m', '')::numeric,
    nullif(v_row ->> 'distance_accuracy_m', '')::numeric,
    coalesce((v_row ->> 'rainfall_officer_flag')::boolean, false), 'measured'
  ) on conflict (survey_id) do update set
    recorded_by = excluded.recorded_by, method = excluded.method, effort_basis = excluded.effort_basis,
    effort_status = excluded.effort_status, started_at = excluded.started_at, ended_at = excluded.ended_at,
    distance_m = excluded.distance_m, distance_accuracy_m = excluded.distance_accuracy_m,
    rainfall_officer_flag = excluded.rainfall_officer_flag, provenance = excluded.provenance
  returning id into v_survey_id;

  insert into public.survey_zones (survey_id, zone_id, zone_source, note)
  select v_survey_id, z.zone_id, coalesce(z.zone_source, 'manual'), nullif(z.note, '')
  from jsonb_to_recordset(coalesce(p_payload -> 'zoneRows', '[]'::jsonb)) as z(zone_id text, zone_source text, note text)
  on conflict (survey_id, zone_id) do update set zone_source = excluded.zone_source, note = excluded.note;

  insert into public.observations (
    observation_id, count, verification_status, source, scientific_name, common_name,
    latitude, longitude, country, administrative_area, city, focus_area, habitat_type,
    locality_description, recorded_by, timestamp, institution_name, activity, field_notes,
    user_id, species_id, site_id, survey_id, zone_id, abundance_kind, detection, juveniles,
    identification_confidence, provenance
  ) select
    o.observation_id, o.count, coalesce(o.verification_status, 'Pending')::public.verification_status,
    coalesce(o.source, 'field_observation'),
    coalesce(o.scientific_name, ''), coalesce(o.common_name, ''), o.latitude, o.longitude,
    coalesce(o.country, 'Zambia'), coalesce(o.administrative_area, ''), coalesce(o.city, ''),
    o.focus_area, coalesce(o.habitat_type, ''), coalesce(o.locality_description, ''),
    coalesce(o.recorded_by, ''), o.timestamp, coalesce(o.institution_name, ''), coalesce(o.activity, ''),
    coalesce(o.field_notes, ''), auth.uid(), o.species_id, o.site_id, v_survey_id, o.zone_id,
    coalesce(o.abundance_kind, 'individuals'), coalesce(o.detection, 'present'), o.juveniles,
    o.identification_confidence, 'measured'
  from jsonb_to_recordset(coalesce(p_payload -> 'observationRows', '[]'::jsonb)) as o(
    observation_id text, count integer, verification_status text, source text, scientific_name text, common_name text,
    latitude numeric, longitude numeric, country text, administrative_area text, city text, focus_area text,
    habitat_type text, locality_description text, recorded_by text, timestamp timestamptz, institution_name text,
    activity text, field_notes text, species_id text, site_id text, zone_id text, abundance_kind text,
    detection text, juveniles integer, identification_confidence text
  ) on conflict (observation_id) do update set
    count = excluded.count, timestamp = excluded.timestamp, field_notes = excluded.field_notes,
    survey_id = excluded.survey_id, zone_id = excluded.zone_id, detection = excluded.detection,
    juveniles = excluded.juveniles, identification_confidence = excluded.identification_confidence;

  return v_survey_id;
end;
$$;

revoke execute on function public.submit_wildlife_survey(jsonb) from public, anon;
grant execute on function public.submit_wildlife_survey(jsonb) to authenticated;

comment on function public.submit_wildlife_survey(jsonb) is
  'One authenticated transaction for a completed wildlife walk. The observation '
  'recordset is JSON, so verification_status arrives as text and must be cast to '
  'public.verification_status explicitly on the way into the enum column.';
