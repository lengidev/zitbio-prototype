-- 202609130005 — Notification actor integrity and message quality
--
-- Two defects, both visible in a single observed row:
--
--   "An admin set Zebra (obs_100177) to Rejected."
--
-- 1. PHANTOM SELF-NOTIFICATION.
--
--    All three notify triggers opened with:
--
--      actor := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
--      for rec in select id from profiles where role = 'admin' and id <> actor
--
--    When auth.uid() is null — SQL console, service role, migration, bulk
--    import — the actor degraded to the all-zero UUID, which matches no profile,
--    so `id <> actor` excluded NOBODY. Every admin was notified about a change
--    the actor had just made themselves, attributed to the placeholder
--    "An admin". The exclusion only ever worked when a JWT happened to be
--    present, so the defect was invisible in normal app use and total in
--    any scripted context.
--
--    A null auth.uid() means the write did not come from an authenticated
--    session, so there is no person to attribute and nobody to inform. All
--    three triggers now return early in that case. The application always
--    writes through an authenticated JWT (directly or via review_observation),
--    so no in-app notification is lost — but a bulk import no longer fans out
--    one notification per admin per row.
--
-- 2. UNUSEFUL MESSAGES.
--
--    The verdict message restated the column value ("set X to Flagged") while
--    omitting the two things a reader actually needs: where the record is and
--    why it changed. The officer's copy already carried the reason; the admin's
--    did not. Both now name the site and the reason. An edit now names the
--    fields that actually changed, instead of a bare "edited X".
--
-- Inverse: reintroduce `coalesce(auth.uid(), '00000000-...')` and restore the
-- previous message bodies from migrations 202608230002 and 202609130004. Both
-- of those are superseded in full here.

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
        ' (' || new.observation_id || ') was submitted by ' || public.current_actor_name() ||
        coalesce(' at ' || site, '') ||
        ' — needs review.',
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
    notif_msg   := species || ' (' || new.observation_id || ') was ' ||
                   lower(new.verification_status) || ' by ' ||
                   public.current_actor_name() ||
                   coalesce(' at ' || site, '') ||
                   coalesce('. Reason: ' || reason || '.', '.');
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
    notif_msg   := species || ' (' || new.observation_id || ') was edited by ' ||
                   public.current_actor_name() ||
                   coalesce(' at ' || site, '') ||
                   coalesce(' — ' || changed || ' changed.', '.');
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
        species || ' (' || new.observation_id || ') was ' ||
          lower(new.verification_status) || ' by ' || public.current_actor_name() ||
          coalesce(' at ' || site, '') ||
          coalesce('. Reason: ' || reason || '.', '.'),
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
        ' (' || old.observation_id || ') was deleted by ' || public.current_actor_name() ||
        coalesce(' at ' || site, '') || '.',
      '../observations/observations.html',
      old.observation_id
    );
  end loop;

  return old;
end;
$function$;
