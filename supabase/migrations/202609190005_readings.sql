-- ============================================================================
-- ZitBIO — Readings: vegetation, water and soil
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- The capacity calculation needs three things the Record plane could not hold:
-- how much grass is standing, what state the water is in, and what state the soil
-- is in. None is a sighting, so none belongs in `observations`.
--
-- WHY THREE TABLES AND NOT ONE
-- ----------------------------
-- A single tall table (survey, metric_name, value) was the compact option and was
-- rejected. It stores the thing being measured as FREE TEXT, and the capacity
-- engine would then match on that text. That is the same shape as the defect that
-- left 174 of 208 observations outside the species registry: free text used as
-- identity. A tall table also cannot enforce that a cover percentage is between 0
-- and 100, which these tables can.
--
-- WHY EACH TABLE CARRIES ITS OWN `survey_type`
-- --------------------------------------------
-- It looks redundant next to a table named `water_readings`, and it is not. The
-- composite foreign key against `surveys (id, survey_type)` means the database
-- refuses a water reading attached to a wildlife census. A plain foreign key on
-- survey_id alone would happily accept that mistake.
--
-- CORRECTION TO THE SPEC, MADE DURING IMPLEMENTATION
-- --------------------------------------------------
-- The Record plane spec said one reading row per survey. A survey may cross
-- several zones, and grass cover, water level and soil condition all differ
-- between them, so one row per survey would have to pick a zone or average
-- across them. Each table therefore has `zone_id` and is unique on
-- `(survey_id, zone_id)`, with a NULL zone meaning a park-wide reading.
-- `unique nulls not distinct` is required because Postgres otherwise treats two
-- NULL zones as different rows and would allow duplicates.
--
-- SECOND CORRECTION, 2026-09-20, BEFORE THIS FILE WAS EVER APPLIED
-- ---------------------------------------------------------------
-- Three of these tables changed once the survey forms were settled, on the rule
-- that a field with no computation reading it does not belong on a form.
-- Vegetation stores the point-intercept taps that PRODUCE cover rather than the
-- cover percentage, because a stored ratio can disagree with the counts behind
-- it and nothing would say which is right. Soil lost ground cover and litter,
-- which the same taps already measure for the same zone. Water lost `faunal_use`,
-- which nothing read. Species identity moved out of free text into the registry,
-- which is the defect this whole schema exists to remove.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It seeds nothing, and it enforces no lab parameters. pH, dissolved oxygen,
-- coliform counts and soil nutrients arrive when somebody samples for them, by a
-- later migration that adds columns here rather than a parallel table.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop table if exists public.vegetation_species;
--     drop table if exists public.soil_readings;
--     drop table if exists public.water_readings;
--     drop table if exists public.vegetation_readings;
--
-- Dropping these discards no measurement other than the readings themselves.
-- Observations, surveys and zones are untouched.
-- ---------------------------------------------------------------------------

-- 1. VEGETATION
create table if not exists public.vegetation_readings (
  id                uuid primary key default gen_random_uuid(),
  survey_id         uuid not null,
  survey_type       text not null default 'vegetation',
  zone_id           text references public.sites (id) on delete set null,
  grass_hits        integer,
  litter_hits       integer,
  bare_hits         integer,
  woody_hits        integer,
  grass_height_mean_cm numeric,
  created_at        timestamptz not null default now(),

  constraint vegetation_readings_type check (survey_type = 'vegetation'),
  foreign key (survey_id, survey_type) references public.surveys (id, survey_type) on delete cascade,
  constraint vegetation_readings_one_per_zone unique nulls not distinct (survey_id, zone_id),
  constraint vegetation_readings_hits_non_negative
    check ((grass_hits is null or grass_hits >= 0)
       and (litter_hits is null or litter_hits >= 0)
       and (bare_hits is null or bare_hits >= 0)
       and (woody_hits is null or woody_hits >= 0)),
  constraint vegetation_readings_height_non_negative
    check (grass_height_mean_cm is null or grass_height_mean_cm >= 0)
);

create index if not exists vegetation_readings_survey_idx on public.vegetation_readings (survey_id, zone_id);

comment on table public.vegetation_readings is
  'Point-intercept taps and mean grass height per survey per zone. Cover percentages are derived from the taps on read and never stored, so they cannot disagree with the counts behind them.';
comment on column public.vegetation_readings.woody_hits is
  'Bush encroachment, counted by the same taps that produce grass cover. Where flora is measured, since trees are a habitat condition rather than a monitored population.';

-- 1b. SPECIES IN THE SWARD
create table if not exists public.vegetation_species (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null,
  survey_type text not null default 'vegetation',
  zone_id     text references public.sites (id) on delete set null,
  species_id  text not null references public.species_registry (id) on delete restrict,
  role        text not null,
  created_at  timestamptz not null default now(),

  constraint vegetation_species_type check (survey_type = 'vegetation'),
  constraint vegetation_species_role check (role in ('dominant', 'present', 'invasive')),
  foreign key (survey_id, survey_type) references public.surveys (id, survey_type) on delete cascade,
  constraint vegetation_species_one_per_zone unique nulls not distinct (survey_id, zone_id, species_id)
);

create index if not exists vegetation_species_survey_idx on public.vegetation_species (survey_id, zone_id);

comment on table public.vegetation_species is
  'Dominant, present and invasive species per survey per zone, as registry references and never as typed names. The registry refuses to delete a species a survey recorded, because unlike an observation this row carries no name text to fall back on.';

-- 2. WATER
create table if not exists public.water_readings (
  id               uuid primary key default gen_random_uuid(),
  survey_id        uuid not null,
  survey_type      text not null default 'water_quality',
  zone_id          text references public.sites (id) on delete set null,
  level_pct        numeric,
  flow             text,
  appearance       text,
  odour_or_foam    boolean,
  bank_condition   text,
  created_at       timestamptz not null default now(),

  constraint water_readings_type check (survey_type = 'water_quality'),
  foreign key (survey_id, survey_type) references public.surveys (id, survey_type) on delete cascade,
  constraint water_readings_one_per_zone unique nulls not distinct (survey_id, zone_id),
  constraint water_readings_level_range check (level_pct is null or (level_pct >= 0 and level_pct <= 100)),
  constraint water_readings_flow_allowed check (flow is null or flow in ('flowing', 'still')),
  constraint water_readings_appearance_allowed
    check (appearance is null or appearance in ('clear', 'turbid', 'green', 'brown')),
  constraint water_readings_bank_allowed
    check (bank_condition is null or bank_condition in ('vegetated', 'trampled', 'eroded'))
);

create index if not exists water_readings_survey_idx on public.water_readings (survey_id, zone_id);

comment on table public.water_readings is
  'Water quantity and quality as observable on foot. Level zero already means dry, so `flow` only separates moving from still water. Lab parameters are added by a later migration rather than guessed at here.';

-- 3. SOIL
create table if not exists public.soil_readings (
  id                uuid primary key default gen_random_uuid(),
  survey_id         uuid not null,
  survey_type       text not null default 'soil_condition',
  zone_id           text references public.sites (id) on delete set null,
  surface_condition text,
  compaction        text,
  erosion_signs     text,
  created_at        timestamptz not null default now(),

  constraint soil_readings_type check (survey_type = 'soil_condition'),
  foreign key (survey_id, survey_type) references public.surveys (id, survey_type) on delete cascade,
  constraint soil_readings_one_per_zone unique nulls not distinct (survey_id, zone_id),
  constraint soil_readings_surface_allowed
    check (surface_condition is null or surface_condition in ('intact', 'crusted', 'cracked', 'loose')),
  constraint soil_readings_compaction_allowed
    check (compaction is null or compaction in ('soft', 'firm', 'hard')),
  constraint soil_readings_erosion_allowed
    check (erosion_signs is null or erosion_signs in ('none', 'sheet', 'rills', 'gullies'))
);

create index if not exists soil_readings_survey_idx on public.soil_readings (survey_id, zone_id);

comment on table public.soil_readings is
  'Soil condition as observable on foot. Compaction is a hand-pressure probe, not an instrument reading. Ground cover and litter are absent on purpose: the point-intercept already measures both for the same zone, and two sources for one fact is how a number stops being defensible.';

-- 4. RLS. Reads are open to authenticated users, matching every other table.
--    Writes follow the parent survey, so an officer can only write readings into
--    their own walk.
alter table public.vegetation_readings enable row level security;
alter table public.water_readings      enable row level security;
alter table public.soil_readings       enable row level security;

drop policy if exists "vegetation_readings_read_authenticated" on public.vegetation_readings;
create policy "vegetation_readings_read_authenticated" on public.vegetation_readings
  for select to authenticated using (true);

drop policy if exists "vegetation_readings_write_with_parent" on public.vegetation_readings;
create policy "vegetation_readings_write_with_parent" on public.vegetation_readings
  for all to authenticated
  using (exists (select 1 from public.surveys s where s.id = vegetation_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.surveys s where s.id = vegetation_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())));

alter table public.vegetation_species enable row level security;

drop policy if exists "vegetation_species_read_authenticated" on public.vegetation_species;
create policy "vegetation_species_read_authenticated" on public.vegetation_species
  for select to authenticated using (true);

drop policy if exists "vegetation_species_write_with_parent" on public.vegetation_species;
create policy "vegetation_species_write_with_parent" on public.vegetation_species
  for all to authenticated
  using (exists (select 1 from public.surveys s where s.id = vegetation_species.survey_id and (s.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.surveys s where s.id = vegetation_species.survey_id and (s.user_id = auth.uid() or public.is_admin())));

drop policy if exists "water_readings_read_authenticated" on public.water_readings;
create policy "water_readings_read_authenticated" on public.water_readings
  for select to authenticated using (true);

drop policy if exists "water_readings_write_with_parent" on public.water_readings;
create policy "water_readings_write_with_parent" on public.water_readings
  for all to authenticated
  using (exists (select 1 from public.surveys s where s.id = water_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.surveys s where s.id = water_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())));

drop policy if exists "soil_readings_read_authenticated" on public.soil_readings;
create policy "soil_readings_read_authenticated" on public.soil_readings
  for select to authenticated using (true);

drop policy if exists "soil_readings_write_with_parent" on public.soil_readings;
create policy "soil_readings_write_with_parent" on public.soil_readings
  for all to authenticated
  using (exists (select 1 from public.surveys s where s.id = soil_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.surveys s where s.id = soil_readings.survey_id and (s.user_id = auth.uid() or public.is_admin())));
