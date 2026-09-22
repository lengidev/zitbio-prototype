-- ============================================================================
-- ZitBIO — The Sourced Register
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- The assessment needs numbers nobody can measure on a walk: how much can be
-- taken from the sward before it degrades, how much one zebra eats in a day, how
-- many animals the park can support, whether more zebra actually competes with
-- puku. Today that knowledge is scattered across prose in lib/data.js, a count in
-- `species_registry.baseline_count`, and sentences in the report copy. Nothing
-- links them and none of it says where it came from.
--
-- THE DISCIPLINE THIS SCHEMA ENFORCES
-- -----------------------------------
-- `source` is NOT NULL on every value and every relationship, and a CHECK rejects
-- a blank one. A value with no stated origin cannot be inserted, so the system can
-- never present an invented ecological claim as though it were researched. Where
-- a number is genuinely unknown the row simply does not exist, and the engine
-- reports what it is waiting for.
--
-- TWO WRITERS, ONE DOOR
-- ---------------------
-- An admin and the analysis service both write here, and `authority` plus
-- `written_by` keep them apart. The admin's row is the answer when both exist; the
-- service's is kept beside it rather than overwriting it, so a disagreement stays
-- visible instead of disappearing. The service writes through the service role,
-- never a client session, so a client cannot claim `authority = 'service'`.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- It seeds NOTHING. No capacity, no fraction, no intake, no relationship. The 2023
-- translocation survey recorded populations, not carrying capacities, and no
-- source in this project states how many zebra the park can support. Inventing one
-- here would be the most damaging thing this migration could do, because the whole
-- point of the Register is that its numbers are traceable.
--
-- It also does not store derived values. Index values are computed on read, per
-- invariant I7. What lives here is the sourced REFERENCE a derivation uses.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop table if exists public.species_relationships;
--     drop table if exists public.parameter_values;
--     drop table if exists public.parameters;
--
-- Dropping these discards no measurement. Observations, surveys, readings and
-- zones are all untouched.
-- ---------------------------------------------------------------------------

-- 1. PARAMETER NAMES ARE IDENTITY, SO THEY ARE REGISTERED
--    A freely typed parameter name is the same defect as a freely typed species
--    name: it drifts, and nothing can be grouped by it.
create table if not exists public.parameters (
  key           text primary key,
  label         text not null,
  unit          text not null,
  value_shape   text not null,
  scope_kind    text not null,
  season_aware  boolean not null default false,
  description   text not null,
  supports      text not null,
  created_at    timestamptz not null default now(),

  constraint parameters_value_shape_allowed check (value_shape in ('scalar', 'range')),
  constraint parameters_scope_kind_allowed check (scope_kind in ('park', 'species', 'species_zone')),
  constraint parameters_description_present check (char_length(btrim(description)) > 0),
  constraint parameters_supports_present check (char_length(btrim(supports)) > 0)
);

comment on table public.parameters is
  'Registered parameter names. A parameter is identity, so it is not free text. Carries no value.';
comment on column public.parameters.supports is
  'The decision this parameter exists to support. A parameter that cannot name one does not belong here.';

-- 2. THE BELIEFS
create table if not exists public.parameter_values (
  id                uuid primary key default gen_random_uuid(),
  parameter_key     text not null references public.parameters (key) on delete restrict,
  scope_species_id  text references public.species_registry (id) on delete set null,
  scope_zone_id     text references public.sites (id) on delete set null,
  scope_season      text,
  value_num         numeric,
  value_min         numeric,
  value_max         numeric,
  source            text not null,
  support           text not null,
  provenance        text not null,
  authority         text not null,
  written_by        uuid references auth.users (id) on delete set null,
  written_at        timestamptz not null default now(),

  constraint parameter_values_provenance_allowed
    check (provenance in ('measured', 'literature', 'prototype', 'external')),
  constraint parameter_values_authority_allowed
    check (authority in ('admin', 'service')),
  constraint parameter_values_source_present
    check (char_length(btrim(source)) > 0),
  constraint parameter_values_support_present
    check (char_length(btrim(support)) > 0),

  -- A value is either one number or a range, never both and never neither.
  constraint parameter_values_scalar_or_range check (
    (value_num is not null and value_min is null and value_max is null)
    or (value_num is null and value_min is not null and value_max is not null and value_min <= value_max)
  ),

  -- An admin value must name the person accountable for it.
  constraint parameter_values_author_honest
    check (authority <> 'admin' or written_by is not null),

  -- One answer per scope per authority. `nulls not distinct` because most scopes
  -- leave some of these columns null, and Postgres otherwise treats two nulls as
  -- different rows, which would allow two answers for the same scope.
  constraint parameter_values_one_per_scope
    unique nulls not distinct (parameter_key, scope_species_id, scope_zone_id, scope_season, authority)
);

create index if not exists parameter_values_lookup_idx
  on public.parameter_values (parameter_key, scope_species_id, scope_zone_id);

comment on table public.parameter_values is
  'Values for registered parameters, each carrying its source, its purpose and its origin. The admin row is the answer when an admin and the service both hold one.';
comment on constraint parameter_values_source_present on public.parameter_values is
  'A value with no stated origin cannot be inserted. This is the rule the whole Register exists to enforce.';

-- 3. HOW ONE THING AFFECTS ANOTHER
--    The ends are not always species. Zebra affects puku, but zebra also affects
--    forage and water quality, which are resources.
create table if not exists public.species_relationships (
  id               uuid primary key default gen_random_uuid(),
  from_species_id  text not null references public.species_registry (id) on delete cascade,
  to_kind          text not null,
  to_species_id    text references public.species_registry (id) on delete cascade,
  to_resource      text,
  mechanism        text not null,
  direction        text not null,
  magnitude        numeric,
  source           text not null,
  provenance       text not null,
  authority        text not null,
  written_by       uuid references auth.users (id) on delete set null,
  written_at       timestamptz not null default now(),

  constraint species_relationships_to_kind_allowed check (to_kind in ('species', 'resource')),
  constraint species_relationships_resource_allowed check (
    to_resource is null or to_resource in
      ('forage', 'water_quantity', 'water_quality', 'soil_condition', 'woody_cover', 'space')
  ),

  -- The end must match the kind. A species relationship with no species, or a
  -- resource relationship with no resource, is not a relationship.
  constraint species_relationships_end_matches_kind check (
    (to_kind = 'species'  and to_species_id is not null and to_resource is null)
    or (to_kind = 'resource' and to_resource is not null and to_species_id is null)
  ),

  constraint species_relationships_direction_allowed
    check (direction in ('up', 'down', 'none', 'unclear')),
  constraint species_relationships_provenance_allowed
    check (provenance in ('measured', 'literature', 'prototype', 'external')),
  constraint species_relationships_authority_allowed
    check (authority in ('admin', 'service')),

  -- A named mechanism is mandatory. "Zebra affects puku" is not a claim anybody
  -- can check; "shares the same grass" is.
  constraint species_relationships_mechanism_present
    check (char_length(btrim(mechanism)) > 0),
  constraint species_relationships_source_present
    check (char_length(btrim(source)) > 0)
);

create index if not exists species_relationships_from_idx on public.species_relationships (from_species_id);
create index if not exists species_relationships_to_idx   on public.species_relationships (to_species_id);

comment on table public.species_relationships is
  'Directional relationships with a named mechanism and a source. `direction` alone is a complete claim; `magnitude` is filled when a source can supply one.';
comment on column public.species_relationships.magnitude is
  'Nullable on purpose. Directions are knowable before magnitudes are, and an unfilled magnitude must not block a sourced direction.';

-- 4. RLS. Every authenticated user may read the Register, because the assessment
--    is built from it and an officer seeing where a number came from is the point.
--    Only admins may write. The analysis service writes through the service role,
--    which bypasses RLS by design and sets `authority = 'service'` itself.
alter table public.parameters            enable row level security;
alter table public.parameter_values      enable row level security;
alter table public.species_relationships enable row level security;

drop policy if exists "parameters_read_authenticated" on public.parameters;
create policy "parameters_read_authenticated" on public.parameters
  for select to authenticated using (true);

drop policy if exists "parameters_admin_write" on public.parameters;
create policy "parameters_admin_write" on public.parameters
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "parameter_values_read_authenticated" on public.parameter_values;
create policy "parameter_values_read_authenticated" on public.parameter_values
  for select to authenticated using (true);

drop policy if exists "parameter_values_admin_write" on public.parameter_values;
create policy "parameter_values_admin_write" on public.parameter_values
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "species_relationships_read_authenticated" on public.species_relationships;
create policy "species_relationships_read_authenticated" on public.species_relationships
  for select to authenticated using (true);

drop policy if exists "species_relationships_admin_write" on public.species_relationships;
create policy "species_relationships_admin_write" on public.species_relationships
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
