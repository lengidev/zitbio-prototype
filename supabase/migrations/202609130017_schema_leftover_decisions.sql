-- 202609130017 — #58 schema leftovers: decisions, recorded on the objects themselves
--
-- #58 asked for a decision on four leftovers, with the reasoning recorded in the
-- vault. A vault note is where a person looks; a `COMMENT` is where the next
-- person to open the schema looks. This migration writes the verdict onto each
-- object so the two cannot drift, and changes no data and no structure.
--
-- ============================================================
-- 1. species_reference vs species_registry — KEEP BOTH, contract stated
-- ============================================================
-- They are not duplicates; they answer different questions and the "overlap" in
-- the issue is the alias relationship, not redundancy:
--   * species_registry   — the 13 canonical park taxa, with baselines. The single
--                          source of truth for what a species IS.
--   * species_reference  — 19 common-name -> scientific-name pairs resolving to
--                          those same 13 species. The source of truth for what a
--                          species is CALLED.
-- 19 rows mapping to 13 names is exactly what an alias table looks like, so no
-- data change is warranted. The recorded risk is drift: a taxa table growing
-- columns it should not have. The COMMENTs below pin the contract.
comment on table public.species_registry is
  'Canonical park taxa. Single source of truth for species identity (baseline counts, baseline_by_site, ecology). Do NOT add name-variant rows here — a new spelling of an existing species belongs in species_reference.';

comment on table public.species_reference is
  'Common-name aliases only: each row maps a common_name to the scientific_name it resolves to (19 aliases -> 13 species). Holds NO taxonomy of its own — baselines, sites and ecology all live in species_registry. Also used as the admin Settings DB-health probe, so it must stay readable.';

-- ============================================================
-- 2. zambia_provinces — KEEP as reserved reference data, do NOT wire up yet
-- ============================================================
-- The table has 10 rows and nothing reads it, which the issue read as dead
-- weight. It is not: the field-officer Province field is a `readonly` input
-- pinned to "Copperbelt Province" ON PURPOSE (see the comment at
-- pages/field-officer/field-officer.js "Province and Country are locked to
-- Copperbelt/Zambia for current scope"), with expansion tracked in
-- futureupdates.md. So there is nothing to wire the list into today, and
-- deleting it would throw away reference data the expansion needs.
--
-- This is the "keep, with the reason written down" branch of the decision rather
-- than the "delete it" branch — the deciding factor being that the emptiness is
-- a deliberate product scope, not neglect. Its SELECT policy stays open to
-- `anon`: province names are public reference data with nothing to protect.
comment on table public.zambia_provinces is
  'Canonical Zambia province names (10). Reserved for the field-officer province picker when the 10-province expansion lands — the Province field is deliberately readonly/locked to Copperbelt for current scope, which is the only reason nothing reads this table yet. Do not drop as "unused": the emptiness is intended scope, not neglect.';

-- ============================================================
-- 3. The two "unused" indexes — BOTH KEPT, for different reasons
-- ============================================================
-- A scan count alone is not a reason to drop an index, and one of these proves
-- it. Both verdicts are recorded so this does not get re-litigated.

-- Now demonstrably in use: 8 scans at the time of this decision. The original
-- "0 scans" reading was taken too soon after the audit to mean anything.
comment on index public.idx_observations_recorded_by is
  'KEPT (#58): was 0 scans at audit time, now actively used (8 scans). Retained for officer-wise filtering and audit lookups.';

-- NEVER drop this one on a scan count. It is UNIQUE, so it is the only thing
-- enforcing that species_registry cannot hold the same scientific_name twice —
-- the exact drift that #58 was worried about in species_reference. At 13 rows the
-- planner will always prefer a sequential scan, so its scan count will read 0
-- forever while it does essential work. This is the trap: "unused index" and
-- "load-bearing constraint" look identical in pg_stat_user_indexes.
comment on index public.idx_species_registry_scientific is
  'KEPT (#58): UNIQUE index enforcing species_registry.scientific_name uniqueness. Its scan count will always read 0 because the table is tiny and the planner prefers a seq scan — that is NOT evidence of disuse. Dropping it would silently permit duplicate species.';

-- ============================================================
-- 4. password_changed_at — RESOLVED, it is not a leftover
-- ============================================================
-- The issue listed it as an unused column. It was, when filed. It is now written
-- by the forced-first-login change (#54, completed in B3) and read by
-- pages/admin/settings/settings.js. No action; recorded so it stops being
-- reported as dead.
comment on column public.profiles.password_changed_at is
  'Timestamp of the last password change. Written by the forced first-login flow (#54) and read by admin Settings. NOT a leftover — do not remove as unused.';

-- Inverse: `comment on ... is NULL;` for each statement above. Comments carry no
-- behaviour, so removing them restores the previous state exactly.
