-- ============================================================================
-- Migration: 202609130001_profile_privilege_guard.sql
-- Date:      2026-09-13
-- Issue:     #35 — "Field officer can promote themselves to admin"
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- `202608220002_rls_policies.sql` grants every authenticated user the right to
-- update their own `profiles` row:
--
--     "Users update own profile"  using (auth.uid() = id)
--                                 with check (auth.uid() = id)
--
-- RLS restricts ROWS, not COLUMNS. That policy therefore also permits a field
-- officer to write `role` on their own row. Verified live on 2026-09-12: as
-- `qa.officer@zitbio.test`, `update({ role: 'admin' })` returned no error and
-- `role: 'admin'` for one row. Only the SQL editor was used to revert it.
--
-- A trigger to prevent this existed (`202608220004_prevent_role_escalation.sql`)
-- and was removed, because it checked `is_admin()` which is `false` whenever
-- `auth.uid()` is null — i.e. in the SQL editor and for service-role calls — so
-- it blocked legitimate administration.
--
-- CORRECTION TO THE RECORD
-- ------------------------
-- The header comment left in `202608220004_prevent_role_escalation.sql` claims:
--
--     "a plain field_officer cannot update role via the API at all"
--
-- That statement is false, and was disproved empirically as described above.
-- Per the project's migration policy an applied migration is never rewritten,
-- so the correction lives here instead of in that file. That file remains in
-- the history as a no-op placeholder (`select 1;`).
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- Re-adds a BEFORE UPDATE guard on `public.profiles`, but with the correct
-- trust model. It raises only when the writer is an *API-authenticated
-- non-admin* AND the row's `role`, `email` or `created_at` actually changes.
--
--   - SQL editor / migrations / service role  → allowed (no JWT, non-API role)
--   - A JWT-less `anon` or `authenticated` API call → treated as untrusted
--     (a null `auth.uid()` here is *not* evidence of privilege)
--   - An admin (by `profiles.role`, via the existing STABLE SECURITY DEFINER
--     `is_admin()`) → allowed, so admins keep managing accounts
--   - Anyone else → may still edit their own `full_name`, `institution_name`,
--     `last_login` and `password_changed_at`; changing role/email/created_at
--     raises SQLSTATE 42501 (PostgREST returns HTTP 403)
--
-- Callers that must keep working, checked before applying:
--   * `pages/admin/settings/settings.js:192`  updates `password_changed_at`  → allowed
--   * `supabase/functions/admin-users/index.ts:136,159` updates `role` as the
--     service role                                                          → allowed
--   * No code path anywhere updates `profiles.email`                         → nothing breaks
--
-- ENFORCEMENT LAYERING
-- --------------------
-- This trigger is the server-side authority. The client-side counterpart
-- (#40, fixed 2026-09-13) stops the app from *granting* privilege offline from
-- a cached `localStorage` role — but the client can always be edited, so this
-- is the check that actually enforces the role model.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these two statements to undo this migration exactly:
--
--     drop trigger if exists profiles_prevent_privilege_change on public.profiles;
--     drop function if exists public.prevent_profile_privilege_change();
--
-- Neither statement touches data. Rolling back re-opens the escalation path.
-- ---------------------------------------------------------------------------

create or replace function public.prevent_profile_privilege_change()
returns trigger
language plpgsql
-- Deliberately NOT `security definer`: it only compares OLD/NEW and calls
-- `is_admin()`, which is already security definer. Running with the caller's
-- rights keeps another definer function out of the API surface.
as $$
declare
  v_has_jwt boolean := auth.uid() is not null;
  -- `anon` and `authenticated` are the roles PostgREST uses for API traffic.
  -- Any other role (postgres, service_role, supabase_admin, …) is a database
  -- context, not an API caller.
  v_is_api_caller boolean := current_user in ('anon', 'authenticated');
begin
  -- 1. Trusted database context: SQL editor, migrations, service role.
  --    `auth.uid()` is null here — but a null `auth.uid()` on an API call is
  --    NOT privileged, which is exactly the mistake that got the first version
  --    of this trigger removed. Both conditions must hold.
  if not v_has_jwt and not v_is_api_caller then
    return new;
  end if;

  -- 2. Administrators manage accounts: promoting, demoting, correcting data.
  if v_has_jwt and public.is_admin() then
    return new;
  end if;

  -- 3. Everyone else: own profile is fine, these three columns are not.
  if new.role is distinct from old.role
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Changing role, email or created_at requires administrator rights'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function public.prevent_profile_privilege_change() is
  'BEFORE UPDATE guard on public.profiles (issue #35). Blocks API-authenticated '
  'non-admins from changing role/email/created_at while allowing admins, the '
  'service role and the SQL editor. Supersedes the removed guard in migration '
  '202608220004, which failed because is_admin() is false when auth.uid() is null.';

drop trigger if exists profiles_prevent_privilege_change on public.profiles;

create trigger profiles_prevent_privilege_change
  before update on public.profiles
  for each row
  execute function public.prevent_profile_privilege_change();
