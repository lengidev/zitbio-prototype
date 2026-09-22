-- ============================================================================
-- Migration: 202609130004_officer_feedback_routing.sql
-- Date:      2026-09-13
-- Layer:     Routing (Layer 4) — issue #71; also fixes #77
-- ============================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- Every notification trigger in the app ends with the same recipient loop:
--
--     for rec in select id from public.profiles where role = 'admin' and id <> actor
--
-- Admins notify other admins. **Nothing can notify a field officer** — there is
-- no recipient resolution and no event type that reaches one. So when an admin
-- flags or rejects a submission, the officer who recorded it is never told. The
-- feedback loop is one-directional, and the officer's only channel is a human
-- conversation. Combined with the reason now captured in `observation_reviews`
-- (202609130003), the decision carries an explanation that no officer can see.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
-- 1. `handle_admin_action_notify()` is replaced so a **verdict also notifies the
--    submitter** (`observations.user_id`) as a `submission_verdict`, carrying the
--    reason. The existing admin fan-out and its edit-dedupe are unchanged.
-- 2. The same trigger now **ignores updates that change nothing meaningful**
--    (issue #77). Previously ANY update produced a notification, so a column
--    backfill generated 624 `observation_edited` rows for 3 admins — an
--    accidental flood that buried the real ones.
--
-- THE REASON, AND TRIGGER ORDERING
-- --------------------------------
-- The reason is read from the transaction-local `app.review_reason` setting that
-- `review_observation()` sets, NOT from `observation_reviews`. Both are AFTER
-- UPDATE triggers, and `handle_admin_action_notify` sorts before
-- `observations_log_review` alphabetically — so the log row does not exist yet
-- when this runs. The setting is written in the same transaction, so it is
-- available and correct.
--
-- NO LINK FOR THE OFFICER, ON PURPOSE
-- -----------------------------------
-- `link` is left null on the officer's notification. The only deep link that
-- exists (`../observations/observations.html?obs=…`) is an **admin** page, and
-- the auth guard now refuses it for a field officer (#40) — linking there would
-- bounce them. A "My submissions" view (#49) is what makes it actionable; until
-- then the message must carry the information itself, which it does.
--
-- ---------------------------------------------------------------------------
-- INVERSE — restore the previous behaviour exactly. `202608230002` is the
-- authoritative source; re-run section 4 of that file to revert this function.
-- There is no data change to undo.
-- ---------------------------------------------------------------------------

create or replace function public.handle_admin_action_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec         record;
  actor       uuid;
  submitter   uuid;
  notif_type  text;
  notif_title text;
  notif_msg   text;
  reason      text;
  species     text;
begin
  actor := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');

  -- ── Issue #77 guard ──────────────────────────────────────────────────────
  -- A mechanical UPDATE (a migration or import touching columns nobody reviews)
  -- must not notify anyone. Without this, backfilling 208 rows generated 624
  -- notifications across 3 admins.
  if new.verification_status is not distinct from old.verification_status
     and new.count            is not distinct from old.count
     and new.common_name      is not distinct from old.common_name
     and new.scientific_name  is not distinct from old.scientific_name
     and new.field_notes      is not distinct from old.field_notes
     and new.activity         is not distinct from old.activity
     and new.timestamp        is not distinct from old.timestamp
     and new.focus_area       is not distinct from old.focus_area
     and new.locality_description is not distinct from old.locality_description
     and new.latitude         is not distinct from old.latitude
     and new.longitude        is not distinct from old.longitude
  then
    return new;
  end if;

  species := coalesce(nullif(new.common_name, ''), nullif(new.scientific_name, ''), 'an observation');

  if new.verification_status is distinct from old.verification_status then
    notif_type  := 'observation_verdict';
    notif_title := 'Observation ' || new.verification_status;
    notif_msg   := public.current_actor_name() || ' set ' || species ||
                   ' (' || new.observation_id || ') to ' || new.verification_status || '.';
  else
    notif_type  := 'observation_edited';
    notif_title := 'Observation Edited';
    notif_msg   := public.current_actor_name() || ' edited ' || species ||
                   ' (' || new.observation_id || ').';
  end if;

  -- ── The field officer's feedback loop (issue #71) ────────────────────────
  -- A verdict goes to the person who recorded the record, with the reason, so
  -- the admin's decision stops being a dead end.
  if notif_type = 'observation_verdict' then
    submitter := new.user_id;
    reason    := nullif(current_setting('app.review_reason', true), '');

    if submitter is not null and submitter <> actor then
      insert into public.notifications (user_id, type, title, message, link, related_id)
      values (
        submitter,
        'submission_verdict',
        'Your observation was ' || new.verification_status,
        species || ' (' || new.observation_id || ') was reviewed by ' ||
          public.current_actor_name() || ' and marked ' || new.verification_status ||
          coalesce('. Reason: ' || reason || '.', '.'),
        null,
        new.observation_id
      );
    end if;
  end if;

  -- ── Admins (unchanged behaviour) ─────────────────────────────────────────
  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
    -- Noise control: for plain edits, keep at most ONE unread notification per
    -- observation+admin so rapid saves collapse instead of spamming the bell.
    if notif_type = 'observation_edited' and exists (
      select 1 from public.notifications n
      where n.user_id = rec.id
        and n.type = 'observation_edited'
        and n.related_id = new.observation_id
        and n.read = false
    ) then
      continue;
    end if;

    insert into public.notifications (user_id, type, title, message, link, related_id)
    values (
      rec.id,
      notif_type,
      notif_title,
      notif_msg,
      '../observations/observations.html?obs=' || new.observation_id,
      new.observation_id
    );
  end loop;

  return new;
end;
$$;

comment on function public.handle_admin_action_notify() is
  'AFTER UPDATE on observations. Notifies the submitting officer of a verdict (#71) and the other '
  'admins of verdicts/edits. Ignores updates with no meaningful change (#77). Reason is read from '
  'the transaction-local app.review_reason set by review_observation().';
