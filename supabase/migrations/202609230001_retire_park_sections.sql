-- ============================================================================
-- ZitBIO — retire unsupported park sections from the active place catalogue
-- ============================================================================
-- The current operational dataset supports two focus areas only: the CBU Nature
-- Park and CBU Campus. The earlier hierarchy migration created five park-section
-- rows from locality text, but those sections are not present in the available
-- source data. Retire them from selection without deleting observations or
-- historical survey evidence.

alter table public.sites
  add column if not exists active boolean not null default true;

update public.sites
   set active = false
 where kind = 'zone';

comment on column public.sites.active is
  'Whether this place may be selected for new work. Retired section rows remain for historical joins and are not deleted.';

