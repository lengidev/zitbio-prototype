-- ============================================================================
-- ZitBIO — notification messages were quoting an internal key
-- ============================================================================
-- WHY THIS EXISTS
-- ---------------
-- Every notification body carried the raw `observation_id` in brackets:
--
--   "Impala (obs_survey_20260920_1228_ty3_zone_004_sp_001) was approved by
--    Lenganji Sinyangwe at The CBU Nature Park."
--
-- That string is a join key, not a name. It is long enough to push the useful
-- half of the sentence onto a second line, and a field officer has no use for
-- it: what they need is the species, where it was, and what was decided. The
-- same text went to the officer and to the other admins, so both sides read the
-- internal key.
--
-- Second defect in the same sentence: "approved by X at The CBU Nature Park"
-- puts the approval at the park. The park is the focus area of the RECORD; the
-- approval happened at a desk. The site now attaches to the record it describes
-- ("Impala at The CBU Nature Park was approved by X") so the sentence reads as
-- the two separate facts it is.
--
-- The key itself is not lost. `notifications.related_id` still holds the
-- observation_id, and the admin `link` still points at the record, so nothing
-- that joins on it changes. Only the prose is affected.
--
-- WHAT THIS CHANGES
-- -----------------
-- All three message templates from 202609130005: the new-submission notice, the
-- verdict notice (both the officer's copy and the admin's), the edit notice, and
-- the delete notice. Actor resolution, recipient routing and the self-exclusion
-- rules are untouched.
--
-- ---------------------------------------------------------------------------
-- INVERSE — re-run 202609130005_notification_actor_and_message_quality.sql to
-- restore the messages with the observation_id in brackets.
-- ---------------------------------------------------------------------------

-- ============================================================
-- New submission
-- ============================================================
create or replace function public.handle_observation_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec   record;
  actor uuid;
  site  text;
begin
  actor := auth.uid();

  -- No authenticated actor: not an in-app action. Nothing to attribute.
  if actor is null then
    return new;
  end if;

  site := nullif(btrim(coalesce(new.focus_area, '')), '');

  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
    insert into public.notifications (user_id, type, title, message, link, related_id)
    values (
      rec.id,
      'pending_observation',
      'New observation',
      coalesce(nullif(new.common_name, ''), nullif(new.scientific_name, ''), 'An observation') ||
        coalesce(' at ' || site, '') ||
        ' was submitted by ' || public.current_actor_name() ||
        ' and needs review.',
      '../observations/observations.html?obs=' || new.observation_id,
      new.observation_id
    );
  end loop;

  return new;
end;
$function$;

-- ============================================================
-- Verdict or edit by an admin
-- ============================================================
create or replace function public.handle_admin_action_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec         record;
  actor       uuid;
  submitter   uuid;
  notif_type  text;
  notif_title text;
  notif_msg   text;
  reason      text;
  species     text;
  site        text;
  changed     text;
begin
  actor := auth.uid();

  -- Issue #77 guard: a mechanical UPDATE must not notify anyone.
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

  -- No authenticated actor: not an in-app action, so nobody to notify. This is
  -- what stops an admin being told about a change they made themselves.
  if actor is null then
    return new;
  end if;

  species := coalesce(nullif(new.common_name, ''), nullif(new.scientific_name, ''), 'An observation');
  site    := nullif(btrim(coalesce(new.focus_area, '')), '');
  reason  := nullif(current_setting('app.review_reason', true), '');

  if new.verification_status is distinct from old.verification_status then
    notif_type  := 'observation_verdict';
    notif_title := 'Observation ' || new.verification_status;
    -- The record is "at" the site; the decision is "by" a person. Keeping those
    -- apart is the difference between a true sentence and a plausible one.
    notif_msg   := species || coalesce(' at ' || site, '') || ' was ' ||
                   lower(new.verification_status) || ' by ' ||
                   public.current_actor_name() ||
                   coalesce(' Reason: ' || reason || '.', '.');
  else
    -- Name the fields that changed, so "edited" is actionable rather than a
    -- prompt to go and diff the record by eye.
    changed := '';
    if new.count is distinct from old.count then
      changed := changed || 'count ' || coalesce(old.count::text, '—') || ' → ' ||
                 coalesce(new.count::text, '—') || ', ';
    end if;
    if new.common_name is distinct from old.common_name then
      changed := changed || 'species, ';
    end if;
    if new.timestamp is distinct from old.timestamp then
      changed := changed || 'date, ';
    end if;
    if new.focus_area is distinct from old.focus_area then
      changed := changed || 'focus area, ';
    end if;
    if new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude then
      changed := changed || 'GPS, ';
    end if;
    if new.field_notes is distinct from old.field_notes then
      changed := changed || 'notes, ';
    end if;
    changed := nullif(rtrim(changed, ', '), '');

    notif_type  := 'observation_edited';
    notif_title := 'Observation edited';
    notif_msg   := species || coalesce(' at ' || site, '') || ' was edited by ' ||
                   public.current_actor_name() ||
                   coalesce('. Changed: ' || changed || '.', '.');
  end if;

  -- The field officer's feedback loop (#71). Phrased like the admin copy so the
  -- two sides of the same decision read consistently.
  if notif_type = 'observation_verdict' then
    submitter := new.user_id;

    if submitter is not null and submitter <> actor then
      insert into public.notifications (user_id, type, title, message, link, related_id)
      values (
        submitter,
        'submission_verdict',
        'Your observation was ' || new.verification_status,
        species || coalesce(' at ' || site, '') || ' was ' ||
          lower(new.verification_status) || ' by ' || public.current_actor_name() ||
          coalesce(' Reason: ' || reason || '.', '.'),
        null,
        new.observation_id
      );
    end if;
  end if;

  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
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
$function$;

-- ============================================================
-- Hard delete
-- ============================================================
create or replace function public.handle_observation_delete_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rec   record;
  actor uuid;
  site  text;
begin
  actor := auth.uid();

  if actor is null then
    return old;
  end if;

  site := nullif(btrim(coalesce(old.focus_area, '')), '');

  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
    insert into public.notifications (user_id, type, title, message, link, related_id)
    values (
      rec.id,
      'observation_deleted',
      'Observation deleted',
      coalesce(nullif(old.common_name, ''), nullif(old.scientific_name, ''), 'An observation') ||
        coalesce(' at ' || site, '') ||
        ' was deleted by ' || public.current_actor_name() || '.',
      '../observations/observations.html',
      old.observation_id
    );
  end loop;

  return old;
end;
$function$;
