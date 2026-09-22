-- ============================================================================
-- ZitBIO — Sourced Register: the parameter vocabulary, and temporary values
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- Migration 202609190006 built the Register's tables and deliberately seeded
-- nothing. Verified afterwards: `parameters`, `parameter_values` and
-- `species_relationships` all held zero rows, so `lib/capacity.js` had no input
-- to resolve and reported every one as missing. The engine was built and had
-- nothing to read.
--
-- This migration does two different things, and they deserve different amounts
-- of trust.
--
-- 1. THE VOCABULARY. Seven parameter names, with labels, units, shapes, scopes
--    and a stated purpose for each. This is structure, not a claim: it says
--    "grazable area is measured in hectares and exists to divide the forage
--    pool", and nobody can be wrong about that. It is safe.
--
-- 2. THE VALUES. Every value below is a PLACEHOLDER. None is researched and none
--    is sourced from a document. They exist so the calculation can be run end to
--    end while the deadline is close, and migration 006's own header says
--    inventing a capacity number is the most damaging thing the Register could
--    do. So each value carries `provenance = 'prototype'` and a `source` string
--    that says out loud that it is an assumption to be replaced.
--
-- HOW TO REMOVE THEM
-- ------------------
-- Every placeholder is identifiable and purgeable in one statement:
--
--     delete from public.parameter_values
--      where provenance = 'prototype' and authority = 'service';
--     delete from public.species_relationships
--      where provenance = 'prototype' and authority = 'service';
--
-- The vocabulary rows in `parameters` are meant to stay; they are names.
--
-- AUTHORITY IS 'service', NOT 'admin', ON PURPOSE
-- -----------------------------------------------
-- `parameter_values_author_honest` requires `written_by` whenever
-- `authority = 'admin'`, because an admin value names the person accountable for
-- it. Nobody is accountable for these numbers, so they are written as the second
-- writer, the analysis service, which needs no author. That also means an admin
-- row outranks them automatically the moment a real one exists, which is exactly
-- the behaviour we want for a placeholder.
--
-- EVERY VALUE IS SCALAR, NOT A RANGE, AND THAT IS A COMPROMISE
-- -----------------------------------------------------------
-- A literature intake usually comes as a range. The schema supports ranges, but
-- `lib/capacity.js` multiplies `value_num` and would read a range-only row as
-- `null`, producing NaN, which silently collapses to a verdict of
-- `cannot_assess` rather than naming the problem. So the range is written into
-- the description instead and the value is one number. This is a real gap in the
-- engine, recorded as gap G9 in the vault note, not a property of the schema.
--
-- Zone coordinates are NOT touched here. See gap G8: no site carries a latitude,
-- so `grazable_area_ha` is a stated area rather than a measured one, and that is
-- a temporary decision (T3) rather than an oversight.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     delete from public.species_relationships
--      where provenance = 'prototype' and authority = 'service';
--     delete from public.parameter_values
--      where provenance = 'prototype' and authority = 'service';
--     delete from public.parameters
--      where key in (
--        'grazable_area_ha', 'standing_forage_kg_per_ha', 'utilizable_fraction',
--        'daily_intake_kg_dm', 'dry_season_days',
--        'cover_to_forage_slope', 'cover_to_forage_intercept'
--      );
--
-- Dropping these discards no measurement. Observations, surveys, readings and
-- zones are all untouched.
-- ---------------------------------------------------------------------------

-- 1. THE VOCABULARY
--    A parameter that cannot name the decision it supports does not belong here,
--    so `supports` is written as the decision, not as a restatement of the label.
insert into public.parameters (key, label, unit, value_shape, scope_kind, season_aware, description, supports)
values
  ('grazable_area_ha', 'Grazable area', 'ha', 'scalar', 'species_zone', false,
   'The part of a zone an animal can actually graze, excluding open water, rock, paths, buildings and impenetrable bush. Never the whole polygon.',
   'Dividing the standing forage into the pool actually available inside one zone.'),

  ('standing_forage_kg_per_ha', 'Standing forage', 'kg DM/ha', 'scalar', 'species_zone', true,
   'The mass of dry grass standing in the sward per hectare. Measured on a vegetation walk through the cover to forage line, or carried here as a reference where no walk has been done.',
   'The supply side of the capacity calculation: what there is to eat.'),

  ('utilizable_fraction', 'Utilizable fraction', 'fraction', 'scalar', 'park', false,
   'The share of standing forage that may be taken before the sward stops recovering. A management choice as much as a measurement, which is why it is registered rather than assumed in code.',
   'Setting the ceiling on how much of the standing crop may be eaten.'),

  ('daily_intake_kg_dm', 'Daily intake', 'kg DM/day', 'scalar', 'species', true,
   'Dry matter one animal of a species eats in a day. Commonly published as 2 to 3 per cent of body mass for grazing ungulates, which is a range; the single number here is the midpoint of that range.',
   'Converting a counted population into one daily demand figure that can be compared with supply.'),

  ('dry_season_days', 'Dry season remaining', 'days', 'scalar', 'park', true,
   'The days of dry season still to run. During this period grass does not regrow, so the standing crop recorded today is the whole of the supply until the rains.',
   'Deciding whether the standing forage covers the period it has to cover.'),

  ('cover_to_forage_slope', 'Cover to forage, slope', 'kg DM/ha per %', 'scalar', 'park', false,
   'The slope of the line that converts grass cover percentage into standing forage. Without it a tap count stays a tap count and cannot become an amount of grass.',
   'Turning a point intercept cover reading into a quantity of forage.'),

  ('cover_to_forage_intercept', 'Cover to forage, intercept', 'kg DM/ha', 'scalar', 'park', false,
   'The intercept of the line that converts grass cover percentage into standing forage. Where the relationship is expected to pass through the origin this is zero.',
   'Completing the cover to forage line, together with its slope.')
on conflict (key) do nothing;

-- 2. THE PLACEHOLDER VALUES
--    `source` is the field an administrator reads to find out where a number came
--    from, so it carries the warning rather than a citation it cannot back.
insert into public.parameter_values
  (parameter_key, scope_species_id, scope_zone_id, scope_season, value_num, source, support, provenance, authority)
values
  ('grazable_area_ha', null, 'zone_001', null, 1.2, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T3.', 'A zone area is needed before any zone can be assessed. Assumed share of the roughly 6.6 ha park.', 'prototype', 'service'),
  ('grazable_area_ha', null, 'zone_002', null, 1.5, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T3.', 'A zone area is needed before any zone can be assessed. Assumed share of the roughly 6.6 ha park.', 'prototype', 'service'),
  ('grazable_area_ha', null, 'zone_003', null, 1.4, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T3.', 'A zone area is needed before any zone can be assessed. Assumed share of the roughly 6.6 ha park.', 'prototype', 'service'),
  ('grazable_area_ha', null, 'zone_004', null, 1.3, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T3.', 'A zone area is needed before any zone can be assessed. Assumed share of the roughly 6.6 ha park.', 'prototype', 'service'),
  ('grazable_area_ha', null, 'zone_005', null, 1.2, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T3.', 'A zone area is needed before any zone can be assessed. Assumed share of the roughly 6.6 ha park.', 'prototype', 'service'),

  ('standing_forage_kg_per_ha', null, null, null, 1200, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value or a measured vegetation walk. See temporary decision T1.', 'A fallback supply figure so the calculation can run in a zone where no vegetation walk has been done. A measured walk always outranks it, because a zone scoped reading is more specific.', 'prototype', 'service'),

  ('utilizable_fraction', null, null, null, 0.5, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. See temporary decision T1.', 'A grazing ceiling is needed to turn standing forage into forage that may actually be taken without degrading the sward.', 'prototype', 'service'),

  ('daily_intake_kg_dm', 'sp_001', null, null, 2.0, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. Impala of roughly 50 kg at 2 to 4 per cent of body mass. See temporary decision T2.', 'A demand cannot be added up without a per animal intake for every species in the count.', 'prototype', 'service'),
  ('daily_intake_kg_dm', 'sp_007', null, null, 7.0, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. Zebra of roughly 250 to 320 kg at 2 to 3 per cent of body mass. See temporary decision T2.', 'A demand cannot be added up without a per animal intake for every species in the count. Zebra also set the reference intake, so this number moves the zebra equivalent figure.', 'prototype', 'service'),
  ('daily_intake_kg_dm', 'sp_012', null, null, 6.5, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. Waterbuck of roughly 200 to 260 kg at 2 to 3 per cent of body mass. See temporary decision T2.', 'A demand cannot be added up without a per animal intake for every species in the count.', 'prototype', 'service'),
  ('daily_intake_kg_dm', 'sp_1010', null, null, 2.5, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a sourced value. Puku of roughly 70 to 80 kg at 3 per cent of body mass. See temporary decision T2.', 'A demand cannot be added up without a per animal intake for every species in the count. Puku shares the sward with zebra, so this number carries the competition argument.', 'prototype', 'service'),

  ('dry_season_days', null, null, null, 45, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a value derived from the season and the survey date. See temporary decision T4.', 'The standing forage has to cover a period, and without a period the calculation has nothing to compare against.', 'prototype', 'service'),

  ('cover_to_forage_slope', null, null, null, 15, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a calibration carrying its own source. See temporary decision T1.', 'Without a line, a vegetation walk records taps and stops there, and the assessment never learns how much grass was standing.', 'prototype', 'service'),
  ('cover_to_forage_intercept', null, null, null, 0, 'Prototype placeholder, assumed 2026-09-20, not researched. Replace with a calibration carrying its own source. See temporary decision T1.', 'Completes the cover to forage line. Zero assumes bare ground carries no standing grass, which is the conservative reading.', 'prototype', 'service')
on conflict on constraint parameter_values_one_per_scope do nothing;

-- 3. THE RELATIONSHIPS
--    This is what answers the supervisor's question, and a direction with a named
--    mechanism is a complete claim on its own. `magnitude` is left null on
--    purpose: the schema says directions are knowable before magnitudes are, and
--    inventing a magnitude would be the same fault as inventing a value.
--    Cleared first so re-running this file cannot duplicate the set.
delete from public.species_relationships
 where provenance = 'prototype' and authority = 'service';

insert into public.species_relationships
  (from_species_id, to_kind, to_species_id, to_resource, mechanism, direction, magnitude, source, provenance, authority)
values
  ('sp_007', 'resource', null, 'forage',
   'Zebra are bulk grazers. They take the tallest and most accessible grass first, which lowers the standing crop and its height for every grazer that comes after them.',
   'down', null,
   'Prototype placeholder, written 2026-09-20 from general grazing ecology, not from a cited source. Replace with a sourced relationship. See temporary decision T5.',
   'prototype', 'service'),

  ('sp_007', 'species', 'sp_1010', null,
   'Overlapping grass height preference. Puku select short green grass, and a sward grazed down by zebra removes the height band they feed in before it removes their food outright, so a rising zebra population lowers puku foraging efficiency.',
   'down', null,
   'Prototype placeholder, written 2026-09-20 from general grazing ecology, not from a cited source. Replace with a sourced relationship. See temporary decision T5.',
   'prototype', 'service'),

  ('sp_007', 'resource', null, 'water_quality',
   'Concentrated grazing and trampling near the waterline strips bank vegetation and increases erosion and nutrient loading where animals come to drink.',
   'down', null,
   'Prototype placeholder, written 2026-09-20 from general grazing ecology, not from a cited source. Replace with a sourced relationship. See temporary decision T5.',
   'prototype', 'service'),

  ('sp_012', 'resource', null, 'forage',
   'Waterbuck graze medium height grasses close to water and share the same sward as zebra, so they compete for the same standing crop rather than for different parts of it.',
   'down', null,
   'Prototype placeholder, written 2026-09-20 from general grazing ecology, not from a cited source. Replace with a sourced relationship. See temporary decision T5.',
   'prototype', 'service'),

  ('sp_001', 'resource', null, 'woody_cover',
   'Impala browse woody regrowth as well as grazing, so browsing pressure from a stable or rising impala population slows bush encroachment where it is otherwise unchecked.',
   'down', null,
   'Prototype placeholder, written 2026-09-20 from general grazing ecology, not from a cited source. Replace with a sourced relationship. See temporary decision T5.',
   'prototype', 'service');
