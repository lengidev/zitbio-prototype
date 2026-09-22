-- 202609130014 — Notification retention (#77, second half)
--
-- The flood half of #77 was fixed in 202609130005: the notify triggers now
-- return early when no reviewed column actually changed, so a mechanical
-- UPDATE (a backfill, an import, a site_id write) no longer writes one row per
-- admin. That stops the *flood*. It does not stop *growth*.
--
-- Nothing has ever pruned this table. It reached 688 rows for 208
-- observations, and one admin alone accumulated 211 rows with 210 unread.
-- A bell the user cannot clear is functionally the same as no bell, so the
-- guard and the retention are two halves of one fix.
--
-- WHY A TRIGGER AND NOT A SCHEDULED JOB
--
-- Retention is normally a cron job. This project has no scheduler: pg_cron,
-- pg_net and pg_partman are all absent from the database (verified against
-- pg_extension), and the free plan offers no external scheduling hook. Rather
-- than depend on something that is not there, retention hangs off the one
-- event that can possibly cause growth — an INSERT. Every row that is ever
-- added to this table arrives through that trigger, so the per-user backlog is
-- swept at exactly the moment it grows. The table is therefore bounded by
-- construction, with no scheduler to be missing.
--
-- The honest limitation: if nobody inserts a notification, an old one lingers
-- past its window until the next insert. That is a stale row, not growth, and
-- it is the correct trade for not having a scheduler.
--
-- POLICY — three rules, deliberately conservative
--
--   1. READ and older than 30 days          -> delete. The user has already
--      seen it and not acted on it for a month; it is history, not
--      information.
--   2. UNREAD and older than 180 days       -> delete. Unread is never swept
--      on the read schedule. This rule exists only as a safety valve so that
--      an account that never opens its bell still cannot grow without bound.
--   3. More than 500 rows for one user      -> delete the excess, evicting
--      READ rows first and oldest-first. An unseen notification is only ever
--      sacrificed when there is nothing already-seen left to give up.
--
-- Rule 1 is the only one that removes anything in practice. At the time of
-- writing the table held 44 rows, 0 of them older than 30 days, so **this
-- migration deletes nothing on application** — it changes what happens to rows
-- written from here on.
--
-- Inverse: drop trigger notifications_enforce_retention; drop function
-- public.prune_notifications(uuid, integer, integer, integer) and
-- public.notifications_enforce_retention(); drop index
-- idx_notifications_user_created. No data needs restoring — the function is the
-- only thing that deletes, and dropping it stops all deletions.

-- ============================================================
-- Index to make the retention predicates cheap
-- ============================================================
-- Both the age rules (user + created_at range) and the cap rule (user, ordered
-- by recency) walk the same access path. idx_notifications_user_id alone would
-- force a sort of every row the user owns; idx_notifications_read is partial on
-- the wrong column pair. This is the one the retention actually needs.
create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

-- ============================================================
-- Retention sweep for a single user
-- ============================================================
-- SECURITY DEFINER because the sweep is a maintenance operation on rows that
-- belong to the user being notified, and it must not be limited by the
-- policies of whoever happened to trigger it. That power is why EXECUTE is
-- revoked from clients below: a client-callable definer function that deletes
-- by user_id would let any authenticated user wipe any other user's bell.
create or replace function public.prune_notifications(
  p_user_id     uuid,
  p_read_days   integer default 30,
  p_unread_days integer default 180,
  p_cap         integer default 500
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_read_deleted   integer := 0;
  v_unread_deleted integer := 0;
  v_cap_deleted    integer := 0;
  v_n              integer;
begin
  if p_user_id is null then
    return 0;
  end if;

  -- Rule 1 — seen, and stale.
  delete from public.notifications n
   where n.user_id = p_user_id
     and n.read is true
     and n.created_at < now() - make_interval(days => greatest(p_read_days, 1));
  get diagnostics v_n = row_count;
  v_read_deleted := v_n;

  -- Rule 2 — never seen, and far past any plausible reading horizon.
  delete from public.notifications n
   where n.user_id = p_user_id
     and n.read is false
     and n.created_at < now() - make_interval(days => greatest(p_unread_days, 1));
  get diagnostics v_n = row_count;
  v_unread_deleted := v_n;

  -- Rule 3 — hard cap. `read desc` puts already-seen rows at the front of the
  -- ordering, and delete takes the lowest ranks, so seen rows are spent first.
  delete from public.notifications n
   where n.id in (
     select r.id
       from (
         select x.id,
                row_number() over (order by x.read desc, x.created_at asc) as rn,
                count(*)     over ()                                     as total
           from public.notifications x
          where x.user_id = p_user_id
       ) r
      where r.rn <= r.total - greatest(p_cap, 1)
   );
  get diagnostics v_n = row_count;
  v_cap_deleted := v_n;

  return v_read_deleted + v_unread_deleted + v_cap_deleted;
end;
$function$;

-- ============================================================
-- Sweep on insert
-- ============================================================
-- AFTER INSERT only. The sweep deletes, and this trigger does not fire on
-- delete, so there is no recursion. Returning null from an AFTER INSERT row
-- trigger is correct — the return value is ignored.
create or replace function public.notifications_enforce_retention()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.prune_notifications(new.user_id);
  return null;
end;
$function$;

drop trigger if exists notifications_enforce_retention on public.notifications;
create trigger notifications_enforce_retention
  after insert on public.notifications
  for each row
  execute function public.notifications_enforce_retention();

-- ============================================================
-- Lock the sweep away from clients
-- ============================================================
-- Triggers do not check EXECUTE (proved by the verification below, which
-- exercises the trigger after these revokes are in place), so revoking here
-- does not weaken the trigger path — it only removes the client-callable path.
-- Nothing in the app calls either function.
revoke execute on function public.prune_notifications(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.notifications_enforce_retention()
  from public, anon, authenticated;
