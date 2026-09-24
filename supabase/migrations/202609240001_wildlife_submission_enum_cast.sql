-- ============================================================================
-- ZitBIO — submit_wildlife_survey could not insert a single observation
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- 202609220001 wrote `submit_wildlife_survey` so that one walk lands in one
-- transaction. It has never managed to write one. Every call failed with:
--
--   column "verification_status" is of type public.verification_status
--   but expression is of type text
--
-- `observations.verification_status` is the enum `public.verification_status`
-- (202608220001), but the function builds its observation rows through
-- `jsonb_to_recordset`, and a JSON recordset has no enums: the column is
-- declared `text`. `coalesce(text, 'Pending')` is therefore text, and Postgres
-- does not cast text to an enum implicitly in an INSERT ... SELECT. The cast has
-- to be written out.
--
-- The officer saw the raw Postgres error in a red toast and the walk stayed open
-- on the screen. Nothing was written: the whole function is one transaction, so
-- no survey row and no observation row existed either. That is why "End survey"
-- looked like it did nothing.
--
-- WHAT THIS CHANGES
-- -----------------
-- One expression gains an explicit cast. The function body, the security model
-- (SECURITY INVOKER, so the existing RLS policies remain the authority) and the
-- single-transaction guarantee are otherwise unchanged. No data is touched.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run this statement to restore the previous behaviour exactly:
--
--     -- (re-run 202609220001_atomic_wildlife_submission.sql, which carries the
--     -- uncast coalesce and therefore does not work)
-- ---------------------------------------------------------------------------
-- WARNING: that inverse leaves wildlife submission broken. It exists only so the
-- original text can be recovered, not as a rollback anyone should run.
-- ---------------------------------------------------------------------------

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
    effort_status, started_at, ended_at, distance_m, rainfall_officer_flag, provenance
  ) values (
    v_row ->> 'survey_id', 'wildlife_census', auth.uid(), coalesce(v_row ->> 'recorded_by', ''),
    coalesce(v_row ->> 'method', ''), coalesce(v_row ->> 'effort_basis', 'distance_transect'),
    'known', (v_row ->> 'started_at')::timestamptz, (v_row ->> 'ended_at')::timestamptz,
    nullif(v_row ->> 'distance_m', '')::numeric, coalesce((v_row ->> 'rainfall_officer_flag')::boolean, false), 'measured'
  ) on conflict (survey_id) do update set
    recorded_by = excluded.recorded_by, method = excluded.method, effort_basis = excluded.effort_basis,
    effort_status = excluded.effort_status, started_at = excluded.started_at, ended_at = excluded.ended_at,
    distance_m = excluded.distance_m, rainfall_officer_flag = excluded.rainfall_officer_flag, provenance = excluded.provenance
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

-- Re-stated, not re-created: `create or replace` keeps the existing grants, but
-- saying it again costs nothing and survives a later `drop function`.
revoke execute on function public.submit_wildlife_survey(jsonb) from public, anon;
grant execute on function public.submit_wildlife_survey(jsonb) to authenticated;

comment on function public.submit_wildlife_survey(jsonb) is
  'One authenticated transaction for a completed wildlife walk. The observation '
  'recordset is JSON, so verification_status arrives as text and must be cast to '
  'public.verification_status explicitly on the way into the enum column.';
