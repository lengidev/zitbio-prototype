-- ============================================================================
-- ZitBIO — Observations link to a walk, and record absence honestly
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- The counting rule needs two things `observations` could not express.
--
--   * WHICH WALK a sighting belongs to, so co-occurrence is a fact and so effort
--     has a denominator. Without it, twelve sightings of the same three zebras in
--     one day summed to 36, and the park reported 27 individuals where it holds 3.
--
--   * OBSERVED ABSENCE. "I searched this zone and saw none" and "nobody looked
--     here" were the same row: no row. They are different facts and invariant I4
--     exists to keep them apart.
--
-- THE COUNT CONSTRAINT HAD TO CHANGE, AND THAT IS THE POINT
-- ---------------------------------------------------------
-- 202609130013 added `observations_count_positive` (count > 0) because a single
-- live row read `Zebra, count = 0` and was a data-entry error capable of firing a
-- false "decline vs baseline 3" warning. That constraint is now wrong: a zero is
-- the correct way to record a searched-and-not-found zone.
--
-- The replacement keeps the protection and adds the missing meaning. `detection`
-- says what the record IS, and the count must agree with it:
--
--     detection = 'present'       -> count > 0
--     detection = 'not_detected'  -> count = 0
--
-- So a bare zero can no longer exist on its own. It is only valid as a deliberate
-- absence, and a zero that means "present" is still rejected. The historical
-- count = 0 row is exempted via NOT VALID, exactly as 202609130013 did, and stays
-- reported by `v_observations_check_exemptions` rather than being silently
-- repaired.
--
-- ONE SPECIES, ONE ZONE, ONE COUNT, PER WALK
-- ------------------------------------------
-- A partial unique index makes repetition impossible by construction rather than
-- by a rule somebody has to remember. The officer edits the row if they see more.
--
-- `abundance_kind` is constant today, because every row here is fauna counted as
-- individuals. It exists because the rule it encodes is "counts are never summed
-- across abundance kinds", and that rule needs somewhere to live before flora
-- records arrive.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop index if exists public.observations_one_per_species_zone_survey;
--     drop index if exists public.observations_survey_idx;
--     alter table public.observations drop constraint if exists observations_count_positive;
--     alter table public.observations drop constraint if exists observations_count_matches_detection;
--     alter table public.observations drop constraint if exists observations_abundance_kind_allowed;
--     alter table public.observations drop constraint if exists observations_detection_allowed;
--     alter table public.observations drop constraint if exists observations_provenance_allowed;
--     alter table public.observations drop constraint if exists observations_identification_confidence_allowed;
--     alter table public.observations drop constraint if exists observations_sex_age_non_negative;
--     alter table public.observations drop constraint if exists observations_bearing_range;
--     alter table public.observations drop constraint if exists observations_distance_non_negative;
--     alter table public.observations
--       add constraint observations_count_positive check (count > 0) not valid;
--     alter table public.observations drop column if exists survey_id;
--     alter table public.observations drop column if exists abundance_kind;
--     alter table public.observations drop column if exists detection;
--     alter table public.observations drop column if exists males;
--     alter table public.observations drop column if exists females;
--     alter table public.observations drop column if exists unknown_sex;
--     alter table public.observations drop column if exists adults;
--     alter table public.observations drop column if exists juveniles;
--     alter table public.observations drop column if exists unknown_age;
--     alter table public.observations drop column if exists behaviour;
--     alter table public.observations drop column if exists distance_m;
--     alter table public.observations drop column if exists bearing_deg;
--     alter table public.observations drop column if exists provenance;
--     alter table public.observations drop column if exists identification_confidence;
--
-- Dropping these discards no measurement. `count`, `timestamp`, `scientific_name`
-- and `focus_area` are all untouched.
-- ---------------------------------------------------------------------------

-- 1. THE LINK AND THE NEW FACTS
alter table public.observations
  add column if not exists survey_id     uuid references public.surveys (id) on delete set null,
  add column if not exists abundance_kind text not null default 'individuals',
  add column if not exists detection      text not null default 'present',
  add column if not exists males          integer,
  add column if not exists females        integer,
  add column if not exists unknown_sex    integer,
  add column if not exists adults         integer,
  add column if not exists juveniles      integer,
  add column if not exists unknown_age    integer,
  add column if not exists behaviour      text,
  add column if not exists distance_m     numeric,
  add column if not exists bearing_deg    numeric,
  add column if not exists provenance     text,
  add column if not exists identification_confidence text;

create index if not exists observations_survey_idx on public.observations (survey_id);

comment on column public.observations.survey_id is
  'The walk this sighting belongs to. NULL only on legacy rows, which the backfill migration attaches where it can.';
comment on column public.observations.detection is
  'present | not_detected. `not_detected` with count = 0 is a searched-and-not-found zone, which is a finding, not a missing value.';
comment on column public.observations.abundance_kind is
  'individuals today. The rule it encodes is that counts are never summed across abundance kinds.';
comment on column public.observations.provenance is
  'measured | literature | prototype | external. NULL on rows written before this migration.';

-- 2. THE COUNT CONSTRAINT, REPLACED RATHER THAN RELAXED
alter table public.observations drop constraint if exists observations_count_positive;

alter table public.observations
  add constraint observations_count_matches_detection
  check (
    (detection = 'present'      and count > 0)
    or (detection = 'not_detected' and count = 0)
  ) not valid;

comment on constraint observations_count_matches_detection on public.observations is
  'A count must agree with what the record claims to be. NOT VALID: the one legacy count = 0 row is exempt and is reported by v_observations_check_exemptions.';

-- 3. THE REMAINING GUARDS
alter table public.observations
  add constraint observations_abundance_kind_allowed
  check (abundance_kind in ('individuals')) not valid;

alter table public.observations
  add constraint observations_detection_allowed
  check (detection in ('present', 'not_detected')) not valid;

alter table public.observations
  add constraint observations_identification_confidence_allowed
  check (identification_confidence is null or identification_confidence in ('certain', 'probable', 'uncertain')) not valid;

comment on column public.observations.identification_confidence is
  'How sure the officer was. Lets an uncertain sighting sit against a group taxon such as Unidentified bird rather than drifting as a typed name.';

alter table public.observations
  add constraint observations_provenance_allowed
  check (provenance is null or provenance in ('measured', 'literature', 'prototype', 'external')) not valid;

alter table public.observations
  add constraint observations_sex_age_non_negative
  check (
    coalesce(males, 0) >= 0 and coalesce(females, 0) >= 0 and coalesce(unknown_sex, 0) >= 0
    and coalesce(adults, 0) >= 0 and coalesce(juveniles, 0) >= 0 and coalesce(unknown_age, 0) >= 0
  ) not valid;

alter table public.observations
  add constraint observations_distance_non_negative
  check (distance_m is null or distance_m >= 0) not valid;

alter table public.observations
  add constraint observations_bearing_range
  check (bearing_deg is null or (bearing_deg >= 0 and bearing_deg < 360)) not valid;

-- 4. ONE SPECIES, ONE ZONE, ONE COUNT, PER WALK
--    Partial, so legacy rows with no survey, zone or species link cannot collide
--    with each other while the structure is incomplete.
create unique index if not exists observations_one_per_species_zone_survey
  on public.observations (survey_id, zone_id, species_id)
  where survey_id is not null and zone_id is not null and species_id is not null;

comment on index public.observations_one_per_species_zone_survey is
  'One species, one zone, one count, per walk. Makes the 27-for-3 repeat-sighting defect impossible rather than merely discouraged.';

-- 5. THE EXEMPTION VIEW STILL REPORTS THE SAME ROW
--    Its `count <= 0` branch selects exactly the rows the new constraint exempts,
--    so it is left untouched rather than rewritten. Rewriting a view whose full
--    definition includes branches this migration does not change would risk
--    dropping one.
comment on view public.v_observations_check_exemptions is
  'Rows exempt from NOT VALID constraints. The `count <= 0` branch now surfaces rows whose detection disagrees with their count, which is the remaining exemption after 202609190003.';
