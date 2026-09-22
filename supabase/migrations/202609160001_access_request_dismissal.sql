-- 202609160001 — Dismissing access requests
--
-- The Users page lists who asked for an account from the sign-in page. Approval
-- is automatic, so the list only ever grows, and an admin needs to clear a
-- request they have finished with. The request must survive that: the table
-- exists as the audit trail of who asked, when and from which institution, so
-- clearing hides the row instead of deleting it.
--
-- WHY A FUNCTION RATHER THAN AN RLS POLICY
--
-- `access_requests` is SELECT-only for admins by design (202609130009). An UPDATE
-- policy would be the shorter change, but RLS cannot restrict *columns*: an admin
-- JWT through PostgREST could then rewrite `email`, `status` and `decided_by` on
-- the same row, which is rewriting the evidence rather than annotating it. This
-- function can only stamp the two dismissal columns, and it checks is_admin()
-- itself rather than relying on a policy to have done so.
--
-- MEASURED BEFORE APPLYING (2026-09-16, live): access_requests holds 5 rows, all
-- status 'approved' and all already carrying a `decided_at` (the signup function
-- stamps it). Observation counts, for context on the same day: 210 rows, of which
-- 173 are the GBIF campus import. Nothing needs backfilling, and the two new
-- columns are nullable, so every existing row stays valid.
--
-- Inverse:
--     revoke execute on function public.dismiss_access_requests(uuid[]) from authenticated;
--     drop function if exists public.dismiss_access_requests(uuid[]);
--     drop index if exists access_requests_dismissed_idx;
--     alter table public.access_requests drop column if exists dismissed_by;
--     alter table public.access_requests drop column if exists dismissed_at;
--
-- Dropping the columns discards which rows were cleared but no request row is
-- removed, so the audit trail is untouched by reverting.

alter table public.access_requests
  add column if not exists dismissed_at timestamptz,
  add column if not exists dismissed_by uuid references public.profiles(id);

comment on column public.access_requests.dismissed_at is
  'Set when an admin clears the request from the Users page. The row is kept: clearing hides it from the list, it does not erase the audit trail.';

-- Partial index: the page only ever reads the undismissed rows, and dismissal is
-- the rare state.
create index if not exists access_requests_dismissed_idx
  on public.access_requests (requested_at desc)
  where dismissed_at is null;

-- Postgres does not index foreign key columns, and the project indexes them
-- deliberately (see 202609130011). Without this, deleting a profile scans the
-- whole table to enforce the reference.
create index if not exists access_requests_dismissed_by_idx
  on public.access_requests (dismissed_by);

create or replace function public.dismiss_access_requests(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_dismissed integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin privileges required' using errcode = '42501';
  end if;

  update public.access_requests
     set dismissed_at = now(),
         dismissed_by = auth.uid()
   where id = any(p_ids)
     and dismissed_at is null;
  get diagnostics v_dismissed = row_count;

  return v_dismissed;
end;
$function$;

comment on function public.dismiss_access_requests(uuid[]) is
  'Admin-only. Stamps dismissed_at/dismissed_by on the given requests and returns how many changed. Rows are never deleted.';

-- Postgres grants EXECUTE to PUBLIC on every new function, so the exposure is the
-- default rather than a grant. Revoke it, then grant only to signed-in callers:
-- the is_admin() check above is the real gate, and an anonymous caller has no JWT
-- for it to read.
revoke execute on function public.dismiss_access_requests(uuid[]) from public, anon;
grant execute on function public.dismiss_access_requests(uuid[]) to authenticated;
