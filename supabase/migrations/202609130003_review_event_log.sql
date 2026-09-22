-- ============================================================================
-- Migration: 202609130003_review_event_log.sql
-- Date:      2026-09-13
-- Layer:     Events (Layer 3) — issues #73, #74
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- Review decisions are currently **mutated in place**. `lib/data.js:1263` does
-- `obs.verification_status = updates.verification_status` and
-- `lib/supabase-sync.js:206` mirrors it; the review actions in
-- `pages/admin/observations/observations.js:248-266` write only the new value.
-- Therefore:
--
--   * the previous state is **overwritten** — there is no history;
--   * there is **no reason** and **no actor** recorded;
--   * there is no terminal *Rejected* state (only Pending / Approved / Flagged);
--   * the only surviving record of a decision is a **notification row**, and the
--     bell's "Clear all" button deletes notifications.
--
-- The last point is the serious one: a decision log the user can clear is not a
-- decision log. And because notifications are also the sink for mechanical
-- events, real review events get buried — a single column backfill generated
-- 624 `observation_edited` rows on 2026-09-13 (issue #77).
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. Adds a terminal `Rejected` state to the status enum.
-- 2. Creates `observation_reviews`: an **append-only** log of every status
--    transition, with the reason and an actor *name snapshot* (profiles get
--    renamed; the log must not).
-- 3. Writes that log from a trigger, so no caller can forget it and no client
--    can bypass it.
-- 4. Adds `review_observation(...)`, the single supported way to change a
--    decision, carrying the reason into the same transaction.
-- 5. Adds soft-delete columns so a deletion stops being destructive (#74).
--
-- ON SECURITY DEFINER — AND WHY IT IS THE OPPOSITE CHOICE FROM #35
-- ---------------------------------------------------------------
-- The log table grants **no INSERT policy at all**, deliberately: if any client
-- could insert review rows, the audit trail would be client-authored and
-- therefore forgeable — the mistake issue #35 punished. The insert must happen
-- as the table owner, so `log_observation_review()` is `security definer`.
--
-- `review_observation()` is deliberately **NOT** definer. It runs with the
-- caller's rights, so the existing admin-only RLS policy on `observations`
-- remains the thing that decides who may review. The definer privilege is
-- confined to appending the log entry — the one operation that genuinely cannot
-- be caller-authorised.
--
-- `alter type ... add value` cannot create a label that is *used* in the same
-- transaction, so `Rejected` is added here and is only referenced by the client
-- after this migration commits.
--
-- The log references `observations(id)` — the uuid primary key — which is the
-- canonical foreign-key target, and stores the text `observation_id` alongside
-- for display and joins. Measured after writing this: `observation_id` does
-- also carry a unique index, so it could equally have served as the FK target;
-- the primary key is preferred because it cannot be re-pointed by an edit.
--
-- ---------------------------------------------------------------------------
-- INVERSE — run these statements to undo this migration exactly:
--
--     drop function if exists public.review_observation(text, text, text);
--     drop trigger if exists observations_log_review on public.observations;
--     drop function if exists public.log_observation_review();
--     drop table if exists public.observation_reviews;
--     alter table public.observations drop column if exists deleted_at;
--     alter table public.observations drop column if exists deleted_by;
--
-- A Postgres enum value cannot be removed, so `Rejected` remains in the type
-- afterwards; it is inert once nothing references it. Dropping
-- `observation_reviews` discards the decision history — the one irreversible
-- part of this migration.
-- ---------------------------------------------------------------------------

-- 1. Terminal reject state. Resolved dynamically so the enum type's name is
--    never hard-coded.
do $$
declare
  v_status_enum text;
begin
  select udt_name into v_status_enum
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'observations'
    and column_name = 'verification_status';

  if v_status_enum is null then
    raise exception 'observations.verification_status not found — aborting';
  end if;

  execute format('alter type public.%I add value if not exists %L', v_status_enum, 'Rejected');
end;
$$;

-- 2. The append-only decision log.
create table if not exists public.observation_reviews (
  id              uuid        primary key default gen_random_uuid(),
  observation_ref uuid        not null references public.observations(id) on delete cascade,
  observation_id  text        not null,
  from_status     text,
  to_status       text        not null,
  reason          text,
  actor_id        uuid,
  actor_name      text        not null default 'System',
  created_at      timestamptz not null default now(),
  constraint observation_reviews_to_status_check
    check (to_status in ('Pending', 'Approved', 'Flagged', 'Rejected')),
  constraint observation_reviews_from_status_check
    check (from_status is null or from_status in ('Pending', 'Approved', 'Flagged', 'Rejected'))
);

comment on table public.observation_reviews is
  'Append-only log of observation review decisions (issue #73). One row per status transition, '
  'written by trigger only. Deliberately has no INSERT/UPDATE/DELETE policy: a client-authored '
  'audit trail would be forgeable (see issue #35).';

create index if not exists observation_reviews_observation_idx
  on public.observation_reviews (observation_id, created_at desc);

alter table public.observation_reviews enable row level security;

drop policy if exists "Admins read observation reviews" on public.observation_reviews;
create policy "Admins read observation reviews"
  on public.observation_reviews
  for select
  to authenticated
  using (public.is_admin());

-- A field officer can read the decisions on their own submissions — the point
-- of recording a reason is that the person who did the work can see it (#71).
drop policy if exists "Officers read reviews of own observations" on public.observation_reviews;
create policy "Officers read reviews of own observations"
  on public.observation_reviews
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.observations o
      where o.id = observation_reviews.observation_ref
        and o.user_id = auth.uid()
    )
  );

-- 3. The logger. Writes one row per *actual* status change — the same guard
--    issue #77 needs, since it ignores updates that do not touch the status.
create or replace function public.log_observation_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.verification_status is distinct from old.verification_status then
    insert into public.observation_reviews
      (observation_ref, observation_id, from_status, to_status, reason, actor_id, actor_name)
    values (
      new.id,
      new.observation_id,
      old.verification_status::text,
      new.verification_status::text,
      nullif(current_setting('app.review_reason', true), ''),
      auth.uid(),
      coalesce(
        (select full_name from public.profiles where id = auth.uid()),
        'System'
      )
    );
  end if;
  return null;  -- AFTER trigger: the return value is ignored
end;
$$;

comment on function public.log_observation_review() is
  'Appends one observation_reviews row per real verification_status change (issue #73). '
  'SECURITY DEFINER because the log table intentionally has no INSERT policy — the log must '
  'not be client-authorable.';

drop trigger if exists observations_log_review on public.observations;
create trigger observations_log_review
  after update on public.observations
  for each row
  execute function public.log_observation_review();

-- 4. The single supported write path for a decision.
create or replace function public.review_observation(
  p_observation_id text,
  p_to_status      text,
  p_reason         text default null
)
returns void
language plpgsql
as $$
declare
  v_status_enum text;
begin
  select udt_name into v_status_enum
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'observations'
    and column_name = 'verification_status';

  -- Transaction-local, so the AFTER trigger in this same transaction can read
  -- it and nothing leaks into a later statement.
  perform set_config('app.review_reason', coalesce(p_reason, ''), true);

  execute format(
    'update public.observations set verification_status = $1::public.%I where observation_id = $2',
    v_status_enum
  ) using p_to_status, p_observation_id;

  if not found then
    -- Either the row does not exist, or RLS filtered it — i.e. not permitted.
    raise exception 'Observation % not found or not permitted for review', p_observation_id
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.review_observation(text, text, text) is
  'Single audited entry point for a review decision (issue #73). Records the reason for the '
  'trigger-written log. NOT security definer: the admin-only RLS policy on observations remains '
  'the authorisation check.';

-- 5. Soft delete (#74): a deletion becomes recoverable and leaves a trace.
alter table public.observations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

comment on column public.observations.deleted_at is
  'Soft delete (issue #74). NULL = live. Archiving replaces hard DELETE so a mistaken deletion '
  'can be restored instead of being unrecoverable.';
comment on column public.observations.deleted_by is
  'Who archived the row (issue #74).';

create index if not exists observations_deleted_at_idx
  on public.observations (deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- FOLLOW-UP, deliberately not done here: the notify trigger on observations
-- still fires on ANY update, so a column backfill can still flood every admin's
-- bell (#77). Fixing it requires that trigger's current definition, and the
-- guard to add is the same one used above:
--     if new.verification_status is distinct from old.verification_status then ...
-- ---------------------------------------------------------------------------
