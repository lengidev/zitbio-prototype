-- ZitBIO — GBIF is no longer an operational data source
--
-- The ecological model and ordinary monitoring surfaces use observations made
-- through ZitBIO's own workflow. GBIF rows are external records without a
-- documented field walk, so they must not contribute to counts, reports,
-- survey summaries, or the coupled-model baseline.
--
-- This is intentionally reversible. The rows remain recoverable in the database
-- and can be restored deliberately, but the client read layer also excludes
-- source = 'gbif' so a restored row cannot silently re-enter the product.

alter table public.observations disable trigger handle_admin_action_notify;

update public.observations
set deleted_at = now(),
    deleted_by = null
where lower(coalesce(source, '')) = 'gbif'
  and deleted_at is null;

alter table public.observations enable trigger handle_admin_action_notify;

comment on column public.observations.source is
  'Operational source. Rows with source = gbif are historical external imports and are excluded from product reads.';

-- Verification after applying:
--   select source, count(*) as rows,
--          count(*) filter (where deleted_at is null) as visible_rows
--   from public.observations
--   group by source
--   order by source;
--
-- Reversal (only after an explicit decision):
--   update public.observations
--      set deleted_at = null, deleted_by = null
--    where lower(coalesce(source, '')) = 'gbif';
