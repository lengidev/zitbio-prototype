-- ============================================================================
-- ZitBIO — Surveys and the zones a walk covered
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- `observations` records a sighting. Nothing represented the WALK on which the
-- sighting happened, and that missing entity is the root of three problems:
--
--   1. NO DENOMINATOR. "I saw 3 zebras" cannot be compared with "I saw 3 zebras"
--      if one took 30 minutes and the other four hours. Nothing recorded how long
--      anybody looked.
--   2. NO ABSENCE. A walk that found nothing produced no row, so "we looked and
--      found none" was indistinguishable from "nobody looked".
--   3. NO JOIN KEY. Two species seen on the same walk had no shared key, so
--      co-occurrence was inferred from a 7-day window (`CO_OCCURRENCE_DAYS` in
--      lib/analytics.js). That is a guess standing in for a fact.
--
-- A survey is that entity. It is where effort lives, it is the unit that is
-- allowed to be empty, and it is the key co-occurrence joins on.
--
-- EFFORT HAS THREE STATES, NOT TWO
-- --------------------------------
-- `effort_status` keeps apart three genuinely different facts: effort was
-- measured; a real walk where nobody wrote it down (`unknown_legacy`); and a row
-- that never had effort to record because it came from an import
-- (`imported_no_effort`). Only the first may ever enter a denominator.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It seeds no survey. Rows arrive when somebody walks, and legacy rows are
-- attached by the companion backfill migration, which invents no measurement.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop table if exists public.survey_zones;
--     drop table if exists public.surveys;
--
-- Dropping these discards no observation: `observations.survey_id` is added by
-- 202609190003, not here, and it is ON DELETE SET NULL.
-- ---------------------------------------------------------------------------

-- 1. SURVEYS
create table if not exists public.surveys (
  id                      uuid primary key default gen_random_uuid(),
  survey_id               text not null unique,
  survey_type             text not null,
  user_id                 uuid references auth.users (id) on delete set null,
  recorded_by             text not null default '',
  method                  text not null default '',
  -- No defaults on these two, deliberately. Defaulting effort_basis to
  -- 'unmeasured' while effort_status defaulted to 'known' would produce a row that
  -- violates the constraint below on the way in, so the writer must state both.
  effort_basis            text not null,
  effort_status           text not null,
  started_at              timestamptz not null,
  ended_at                timestamptz,
  distance_m              numeric,
  rainfall_7d_mm          numeric,
  days_since_rain         integer,
  rainfall_source         text,
  rainfall_officer_flag   boolean,
  rainfall_verdict        text,
  rainfall_verdict_by     uuid references auth.users (id) on delete set null,
  rainfall_verdict_reason text,
  season                  text,
  provenance              text not null default 'measured',
  created_at              timestamptz not null default now(),

  constraint surveys_type_allowed check (
    survey_type in ('wildlife_census', 'vegetation', 'water_quality', 'soil_condition')
  ),
  constraint surveys_effort_basis_allowed check (
    effort_basis in ('distance_transect', 'point_count', 'area_search', 'unmeasured')
  ),
  constraint surveys_effort_status_allowed check (
    effort_status in ('known', 'unknown_legacy', 'imported_no_effort')
  ),
  constraint surveys_provenance_allowed check (
    provenance in ('measured', 'literature', 'prototype', 'external')
  ),
  constraint surveys_rainfall_verdict_allowed check (
    rainfall_verdict is null or rainfall_verdict in ('dataset', 'confirmed', 'overridden')
  ),

  -- The point of invariant I3, enforced: a survey that claims measured effort
  -- must say how it was measured.
  constraint surveys_known_effort_has_basis check (
    effort_status <> 'known' or effort_basis <> 'unmeasured'
  ),

  -- An override without a reason is an unexplained edit.
  constraint surveys_override_needs_reason check (
    rainfall_verdict is distinct from 'overridden'
    or char_length(coalesce(rainfall_verdict_reason, '')) > 0
  ),

  constraint surveys_ended_after_started check (ended_at is null or ended_at >= started_at),
  constraint surveys_distance_non_negative check (distance_m is null or distance_m >= 0)
);

-- A composite key on (id, survey_type) so the reading tables can require their
-- parent to be a survey OF THEIR OWN TYPE. Added here rather than in 202609190005
-- so the key exists before anything depends on it.
alter table public.surveys drop constraint if exists surveys_id_type_key;
alter table public.surveys add constraint surveys_id_type_key unique (id, survey_type);

create index if not exists surveys_started_idx  on public.surveys (started_at desc);
create index if not exists surveys_type_idx     on public.surveys (survey_type);
create index if not exists surveys_user_idx     on public.surveys (user_id);

comment on table public.surveys is
  'One walk, one type. The unit of effort and the key co-occurrence joins on. Allowed to have zero observations.';
comment on column public.surveys.effort_status is
  'known | unknown_legacy | imported_no_effort. Only known may enter a denominator.';
comment on column public.surveys.rainfall_verdict is
  'dataset | confirmed | overridden. An override keeps the dataset reading visible rather than replacing it.';
comment on column public.surveys.distance_m is
  'Effort, where the basis is a transect. Duration is derived from started_at and ended_at, never stored, so it cannot disagree with them.';

-- 2. WHICH ZONES A WALK COVERED
--    A join table rather than an array on `surveys`, because an array can hold a
--    zone name the database does not know, and a typo would silently drop that
--    record out of zone-based analysis.
create table if not exists public.survey_zones (
  survey_id   uuid not null references public.surveys (id) on delete cascade,
  zone_id     text not null,
  zone_kind   text not null default 'zone',
  zone_source text not null default 'manual',
  note        text,
  primary key (survey_id, zone_id),

  -- Where the zone came from. A zone read off the GPS is a different kind of fact
  -- from one the officer chose, and a later reader needs to tell them apart.
  constraint survey_zones_zone_source check (zone_source in ('gps', 'manual')),

  -- The composite foreign key is what makes this a ZONE and not merely a site:
  -- the pair must exist in `sites`, and the paired kind must be 'zone', so a
  -- survey cannot claim the park or the campus as one of its zones.
  constraint survey_zones_zone_kind check (zone_kind = 'zone'),
  foreign key (zone_id, zone_kind) references public.sites (id, kind)
);

create index if not exists survey_zones_zone_idx on public.survey_zones (zone_id);

comment on table public.survey_zones is
  'The zones a survey passed through, how each was decided, and the officer note for it. Lets a walk with zero findings still say where it went.';
comment on column public.survey_zones.note is
  'One note per zone per survey, rather than one per reading table, so a wildlife census has the same place to explain an oddity as a soil walk.';

-- 3. RLS. Reads are open to authenticated users, matching every other table.
--    Writes are scoped to the walk's own officer, so one officer cannot write
--    into another officer's survey.
alter table public.surveys enable row level security;

drop policy if exists "surveys_read_authenticated" on public.surveys;
create policy "surveys_read_authenticated" on public.surveys
  for select to authenticated using (true);

drop policy if exists "surveys_insert_own_or_admin" on public.surveys;
create policy "surveys_insert_own_or_admin" on public.surveys
  for insert to authenticated
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "surveys_update_own_or_admin" on public.surveys;
create policy "surveys_update_own_or_admin" on public.surveys
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "surveys_delete_admin" on public.surveys;
create policy "surveys_delete_admin" on public.surveys
  for delete to authenticated using (public.is_admin());

alter table public.survey_zones enable row level security;

drop policy if exists "survey_zones_read_authenticated" on public.survey_zones;
create policy "survey_zones_read_authenticated" on public.survey_zones
  for select to authenticated using (true);

drop policy if exists "survey_zones_write_with_parent" on public.survey_zones;
create policy "survey_zones_write_with_parent" on public.survey_zones
  for all to authenticated
  -- The outer column is qualified because `public.surveys` also carries a
  -- `survey_id`, and it is TEXT. Left unqualified it binds to the inner table
  -- and the comparison becomes uuid = text, which Postgres refuses outright.
  using (
    exists (
      select 1 from public.surveys s
      where s.id = survey_zones.survey_id and (s.user_id = auth.uid() or public.is_admin())
    )
  )
  with check (
    exists (
      select 1 from public.surveys s
      where s.id = survey_zones.survey_id and (s.user_id = auth.uid() or public.is_admin())
    )
  );
