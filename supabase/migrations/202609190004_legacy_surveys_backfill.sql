-- ============================================================================
-- ZitBIO — Attaching existing records to walks, honestly
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- 202609190002 created `surveys`; 202609190003 added `observations.survey_id`.
-- Neither assigns anything, so every existing row has a walk it does not know
-- about. This migration gives each one a survey, and says truthfully what is
-- known about its effort: nothing.
--
-- MEASURED BEFORE APPLYING (live, 2026-09-19)
-- -------------------------------------------
--   source             rows  with_user_id  species_id  site_id  date range
--   gbif                173        0             0       173    2019-06-14 .. 2024-06-06
--   field_observation    36       34            34        35    2026-06-14 .. 2026-09-13
--
-- The discriminator is `source`, and it is exact rather than inferred. The two
-- populations do not overlap on it.
--
-- WHY ONE SURVEY PER EXISTING RECORD
-- ----------------------------------
-- The alternative was to group records into walks by officer and date. That would
-- have been a guess: two records by the same officer on the same day may be one
-- walk or two, and nothing in the data says which. One survey per record claims
-- only what is true (a sighting happened at a time), and the counting rule handles
-- it correctly, because each record is then the most recent count for its species.
--
-- NO MEASUREMENT IS INVENTED
-- --------------------------
-- Every legacy survey carries `effort_basis = 'unmeasured'` and an `effort_status`
-- of `unknown_legacy` (a real walk nobody wrote the effort down for) or
-- `imported_no_effort` (a row that never had effort to record). Only `known` may
-- enter a denominator, so none of these 209 rows can ever be averaged as though
-- somebody had searched. `started_at` is the observation's own timestamp, not a
-- new value. The 155 archived GBIF rows are included on purpose: archiving a
-- record should not orphan the visit it belonged to.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     update public.observations set survey_id = null;
--     delete from public.surveys where survey_id like 'survey_legacy_%';
--
-- Deleting the surveys removes their `survey_zones` rows by cascade, and
-- `observations.survey_id` is ON DELETE SET NULL, so the UPDATE is belt and
-- braces rather than strictly required. Run in this order so the intent is
-- explicit. No observation column is modified beyond the link.
-- ---------------------------------------------------------------------------

-- 1. ONE SURVEY PER EXISTING RECORD
--    The survey_id is derived from the observation_id, so it is deterministic and
--    unique without a sequence, and the update below can match on it exactly.
insert into public.surveys (
  survey_id, survey_type, user_id, recorded_by, method,
  effort_basis, effort_status, started_at, provenance
)
select
  'survey_legacy_' || o.observation_id,
  'wildlife_census',
  o.user_id,
  o.recorded_by,
  case when o.source = 'gbif'
       then 'imported record, method not recorded'
       else 'field record, method not recorded'
  end,
  'unmeasured',
  case when o.source = 'gbif'
       then 'imported_no_effort'
       else 'unknown_legacy'
  end,
  o.timestamp,
  case when o.source = 'gbif'
       then 'external'
       else 'measured'
  end
from public.observations o
where o.survey_id is null
on conflict (survey_id) do nothing;

-- 2. ATTACH THE OBSERVATIONS
update public.observations o
   set survey_id = s.id
  from public.surveys s
 where o.survey_id is null
   and s.survey_id = 'survey_legacy_' || o.observation_id;

-- 3. WHERE EACH WALK REACHED
--    Derived from the zone each sighting was recorded in, so it records where the
--    walk WENT, not where it searched. That distinction matters: a zone with no
--    sighting is absent from `survey_zones` even though the walk may have crossed
--    it, which is exactly what keeps a park total marked as partial coverage
--    rather than silently complete.
insert into public.survey_zones (survey_id, zone_id)
select distinct o.survey_id, o.zone_id
  from public.observations o
 where o.survey_id is not null
   and o.zone_id is not null
on conflict do nothing;

-- 4. VERIFICATION — run this after applying and expect gbif 173 / field 36, with
--    zero rows in the first and third columns.
--
--    select s.provenance,
--           s.effort_status,
--           count(*)                                            as surveys,
--           count(*) filter (where o.survey_id is null)         as observations_unlinked,
--           count(*) filter (where s.effort_status = 'known')   as claim_measured
--      from public.surveys s
--      left join public.observations o on o.survey_id = s.id
--     group by s.provenance, s.effort_status
--     order by surveys desc;
