-- ============================================================================
-- Migration: 202609130002_observation_identity_columns.sql
-- Date:      2026-09-13
-- Layer:     Identity (Layer 1) — issues #55, #47
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- `observations` stores species and site as **free text** (`scientific_name`,
-- `focus_area`). Nothing links a row to `species_registry` or `sites`, so every
-- consumer re-resolves that identity at read time, each in its own way:
--
--   * `lib/data.js:616-630` resolves a site with a regex fallback
--     (`/nature park/`, `/campus|copperbelt university/`) to paper over the
--     spelling differences between callers;
--   * the analytics layer matches species by name at query time;
--   * the review page and the FO form each decide differently.
--
-- That is why the same dataset reports four different totals (issue #42), and
-- why 174 of 208 rows "match nothing" in the registry (#55). This migration
-- makes the link explicit and **normalises identity at write time**, which is
-- the Layer 1 prescription: one identity per concept, resolved once.
--
-- MEASURED BEFORE APPLYING (2026-09-13, live)
-- -------------------------------------------
--   observations                208
--   species matched exactly      34
--   species matched normalised   34   ← `lower(trim())` recovers NOTHING
--   species unmatched           174   → these are genuinely campus taxa
--                                       (GBIF), not formatting artefacts
--   focus_area values             2   → 'CBU Campus' (173), 'The CBU Nature
--                                       Park' (35); both already equal a
--                                       `sites.name` exactly → 208/208 match
--
-- CONSEQUENCE FOR THE BACKFILL
-- ----------------------------
-- `species_id` will be set on **34** rows and left **NULL on 174**. That NULL is
-- *correct and meaningful*, not data debt: those rows are outside the park
-- inventory. The distinction this migration makes possible is the one the
-- earlier analysis identified — **diversity needs identity** (all 208 rows,
-- whatever their taxon) while **baselines and population warnings need
-- inventory membership** (the 34 linked rows). Analytics must not silently
-- exclude the 174; it must count them and label them as out-of-inventory
-- (issue #43, badge copy "Outside park inventory").
--
-- `site_id` will be set on **all 208** rows.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- --------------------------------------------
-- It does **not** rename `sites.name` or `focus_area`. The plan expected 5
-- spellings across the database, but measurement shows the database holds
-- exactly two values and both already match `sites.name` verbatim — it is
-- internally consistent. The one genuine mismatch is in the *client*: the field
-- officer form offers "The Copperbelt University Campus", which matches no row
-- in `sites` or `observations`. That is fixed in the UI (registry-driven
-- options), not by rewriting 208 rows. A cosmetic rename to the canonical
-- wording can still be done separately if wanted.
--
-- It also does **not** yet rewire readers to use `site_id`/`species_id`. Those
-- columns are the new source of truth and are backfilled now; moving
-- `data.js`, analytics and the filters onto them is the follow-through.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop index if exists public.observations_species_id_idx;
--     drop index if exists public.observations_site_id_idx;
--     alter table public.observations drop column if exists species_id;
--     alter table public.observations drop column if exists site_id;
--     alter table public.sites drop column if exists short_name;
--
-- Dropping the two columns discards the resolved links but touches no
-- observation data — `scientific_name` and `focus_area` are untouched.
-- ---------------------------------------------------------------------------

-- 1. Identity columns. Nullable on purpose: a future GBIF import may contain a
--    taxon or focus area that is not yet in a registry, and that must not
--    block the import. `on delete set null` keeps a registry cleanup from
--    destroying observation rows.
alter table public.observations
  add column if not exists species_id text references public.species_registry(id) on delete set null,
  add column if not exists site_id    text references public.sites(id) on delete set null;

comment on column public.observations.species_id is
  'Resolved link to species_registry (Layer 1, issue #55). NULL means the taxon is outside the '
  'curated park inventory — expected for campus GBIF records. Diversity counts must include those '
  'rows; baseline/warning logic must exclude them (issue #43).';

comment on column public.observations.site_id is
  'Resolved link to sites (Layer 1). Backfilled from focus_area, which matched sites.name on all '
  '208 rows. Replaces read-time regex resolution.';

-- 2. Indexes: both columns are used for filtering and for baseline aggregation.
create index if not exists observations_species_id_idx on public.observations (species_id);
create index if not exists observations_site_id_idx    on public.observations (site_id);

-- 3. Short display names, so tight UI (badges, chips, table cells) does not have
--    to print the full ceremonial site name.
alter table public.sites add column if not exists short_name text;

comment on column public.sites.short_name is
  'Compact display name for tight UI. Full name stays in sites.name and remains the value '
  'stored in observations.focus_area for backward compatibility.';

update public.sites set short_name = 'Nature Park' where id = 'site_001' and short_name is null;
update public.sites set short_name = 'Campus'      where id = 'site_002' and short_name is null;

-- 4. Backfill. Normalised comparison so a stray capital or trailing space can
--    never silently orphan a row. Idempotent: only fills NULLs.
update public.observations o
   set species_id = sr.id
  from public.species_registry sr
 where o.species_id is null
   and lower(trim(sr.scientific_name)) = lower(trim(o.scientific_name));

update public.observations o
   set site_id = s.id
  from public.sites s
 where o.site_id is null
   and lower(trim(o.focus_area)) = lower(trim(s.name));
