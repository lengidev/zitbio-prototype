-- ────────────────────────────────────────────────────────────────────────────
-- B4 · Integrity — #37 and #56: observation attribution
--
-- #37  The INSERT policy was `with check (auth.role() = 'authenticated')`. That
--      only asks "is somebody signed in" — it never checks WHO the row claims.
--      Any authenticated user could insert a record attributed to a different
--      officer, or to nobody, using the public anon key.
--
-- #56  Only 4 of 208 rows had a `user_id`. 173 of those are GBIF imports, which
--      have no human submitter and are correctly unattributed. The other 32 are
--      `field_observation` rows created before attribution existed — and all 32
--      carry a `recorded_by` that matches a real profile exactly, so they are
--      recoverable rather than lost.
--
-- Two changes make attribution trustworthy, and they only work together:
--
--   1. `user_id` defaults to `auth.uid()`, so a client that omits the column
--      still gets an owner rather than a hole.
--   2. The policy requires the row to belong to the caller, unless the caller is
--      an admin. The default alone would be bypassable by sending an explicit
--      `user_id`, which is exactly the #37 hole.
--
-- Service-role / SQL-editor writes bypass RLS entirely, so GBIF imports and
-- maintenance are unaffected.
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Every new row gets an owner by default.
alter table public.observations
  alter column user_id set default auth.uid();

-- 2. A row may only be attributed to its author, unless an admin filed it.
drop policy if exists "Authenticated users insert observations" on public.observations;

create policy "Authenticated users insert observations"
  on public.observations
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    or public.is_admin()
  );

comment on policy "Authenticated users insert observations" on public.observations is
  'A row must belong to the caller (#37). Admins may file on behalf of others.';

-- 3. Backfill the 32 ownerless field observations from `recorded_by`.
--
-- Only where exactly one profile matches the name. A duplicate display name
-- would make the attribution a guess, and a wrong owner is worse than none.
update public.observations o
set user_id = (
  select p.id from public.profiles p where p.full_name = o.recorded_by limit 1
)
where o.user_id is null
  and o.source = 'field_observation'
  and (select count(*) from public.profiles p2 where p2.full_name = o.recorded_by) = 1;
