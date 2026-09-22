-- ============================================================================
-- ZitBIO — Analytics Schema (species registry + sites)
-- ============================================================================
-- Gap-1/Gap-3 fixes for the analytics/reporting layer:
--   * species_registry — first-class species entities carrying an
--     admin-authoritative baseline_count for the low-population warning
--     system. Derived-by-default (auto baseline) + admin-overridable.
--     conservation_status is intentionally nullable — never fabricated.
--   * sites — first-class site entities (CBU Nature Park focus, campus for
--     map/dataset coverage). Species baselines are species-wide with an
--     optional per-site override (baseline_by_site JSON).
--
-- The existing species_reference lookup table is intentionally left
-- untouched for backward compatibility with BioData.lookupScientificName.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. SPECIES REGISTRY
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.species_registry (
  id                  text primary key,               -- 'sp_001'
  scientific_name     text not null,
  common_name         text not null default '',
  taxon_type          text not null default 'fauna',  -- 'fauna' | 'flora'
  baseline_count      integer,                        -- admin-set reference population (null = auto-derived)
  baseline_updated_at timestamptz,
  baseline_updated_by uuid references auth.users (id),
  conservation_status text,                           -- left null; never fabricated
  baseline_by_site    jsonb not null default '{}'::jsonb, -- per-site override map { siteId: count }
  created_at          timestamptz not null default now()
);

create unique index if not exists idx_species_registry_scientific on public.species_registry (scientific_name);

comment on table public.species_registry is
  'Analytics-facing species entities with admin baseline data for population warnings.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. SITES
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.sites (
  id                   text primary key,               -- 'site_001'
  name                 text not null unique,
  habitat_type_default text not null default '',
  established          timestamptz,
  created_at           timestamptz not null default now()
);

comment on table public.sites is
  'Reference sites (CBU Nature Park is the analytical focus; CBU Campus covers map/dataset coverage).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS
--    All authenticated users can read both registries.
--    ONLY admins may update baselines (and sit metadata) — the client never
--    touches these tables with the anon key beyond reads.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.species_registry enable row level security;
alter table public.sites enable row level security;

drop policy if exists "species_registry_read_authenticated" on public.species_registry;
create policy "species_registry_read_authenticated" on public.species_registry
  for select to authenticated using (true);

drop policy if exists "species_registry_admin_write" on public.species_registry;
create policy "species_registry_admin_write" on public.species_registry
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "sites_read_authenticated" on public.sites;
create policy "sites_read_authenticated" on public.sites
  for select to authenticated using (true);

drop policy if exists "sites_admin_write" on public.sites;
create policy "sites_admin_write" on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. SEED — from the existing species_reference (24 entries) so the cloud
--    registry matches the in-app BioData registry one-to-one. Idempotent.
-- ────────────────────────────────────────────────────────────────────────────
insert into public.species_registry (id, scientific_name, common_name, taxon_type, baseline_count)
select
  'sp_' || lpad(row_number() over (order by sr.scientific_name)::text, 3, '0'),
  sr.scientific_name,
  sr.common_name,
  case when sr.scientific_name in ('Brachystegia spiciformis', 'Brachystegia floribunda', 'Julbernardia paniculata', 'Isoberlinia angolensis', 'Parinari curatellifolia', 'Uapaca spp.', 'Syzygium guineense', 'Diplorhynchus condylocarpon', 'Anisophyllea boehmii') then 'flora' else 'fauna' end,
  case sr.scientific_name
    when 'Equus quagga' then 3
    when 'Kobus ellipsiprymnus' then 3
    when 'Kobus vardonii' then 5
    when 'Aepyceros melampus' then 8
    else null
  end
from (
  select distinct on (scientific_name) scientific_name, common_name
  from public.species_reference
  order by scientific_name, common_name
) sr
on conflict (id) do nothing;

insert into public.sites (id, name, habitat_type_default)
values
  ('site_001', 'The CBU Nature Park', 'Miombo Woodland'),
  ('site_002', 'CBU Campus', 'Urban')
on conflict (id) do nothing;