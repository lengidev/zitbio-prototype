-- ============================================================================
-- ZitBIO: restore the enum cast that 202609240002 reverted
-- ============================================================================
-- WHAT BROKE
-- ----------
-- Approve and Flag failed for every signed-in admin with
--
--     42883: function lower(verification_status) does not exist
--
-- and nothing was recorded. The trigger fires in the same transaction as
-- review_observation(), so its exception rolled the whole status change back:
-- no new status, no observation_reviews row, and the page undid its optimistic
-- update. An approve of a record that was ALREADY approved still succeeded,
-- because the guard below returns early when no tracked column changed. That is
-- why the fault looked intermittent and why the toast named only some records.
--
-- WHY THIS IS A REGRESSION, NOT A NEW BUG
-- --------------------------------------
-- 202609130005 introduced `lower(new.verification_status)`. Migration
-- `fix_enum_lower_in_notify_verdict` (applied 2026-09-13 as version
-- 20260913123002) corrected both call sites to `lower(new.verification_status::text)`,
-- and verdict changes worked from then on. The observation_reviews table records
-- 13 approvals made through the UI on 2026-09-20, all of them after that fix.
--
-- That fix was applied through the SQL console and was never written to this
-- repo, so nothing here recorded it. 202609240002 then rewrote this function to
-- change the verdict message shape, and re-created the body from a copy of the
-- pre-fix text. The cast went with it. Approve and Flag have been broken since
-- that migration was applied.
--
-- The mechanism, for the next person: there is no implicit enum -> text cast, so
-- lower() has no overload matching public.verification_status. Concatenation
-- with `||` works because textcat accepts anynonarray, which is why only the two
-- lower() call sites fail and the title next to them is fine.
--
-- WHAT THIS DOES
-- --------------
-- Re-creates public.handle_admin_action_notify() with both call sites cast. The
-- body is otherwise byte-identical to the live definition, so the only
-- behavioural change is that the two verdict messages can now be built.
--
-- ---------------------------------------------------------------------------
-- INVERSE — the previous definition is what 202609240002 wrote, and applying it
-- again restores the defect, so it is deliberately not repeated here. It is
-- recoverable from supabase_migrations.schema_migrations where
-- version = '20260924094226'.
--
-- ANTI-REGRESSION NOTE
-- --------------------
-- If you re-create this function, take the body from the DATABASE
-- (pg_get_functiondef) rather than from an older file in this folder, and keep
-- the ::text casts. The file for 202609130005 and the file for 202609240002 both
-- still carry the uncast form, and replaying either would break verdicts again.
-- ---------------------------------------------------------------------------

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

  if actor is null then
    return new;
  end if;

  species := coalesce(nullif(new.common_name, ''), nullif(new.scientific_name, ''), 'An observation');
  site    := nullif(btrim(coalesce(new.focus_area, '')), '');
  reason  := nullif(current_setting('app.review_reason', true), '');

  if new.verification_status is distinct from old.verification_status then
    notif_type  := 'observation_verdict';
    notif_title := 'Observation ' || new.verification_status;
    notif_msg   := species || coalesce(' at ' || site, '') || ' was ' ||
                   lower(new.verification_status::text) || ' by ' ||
                   public.current_actor_name() ||
                   coalesce(' Reason: ' || reason || '.', '.');
  else
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

  if notif_type = 'observation_verdict' then
    submitter := new.user_id;

    if submitter is not null and submitter <> actor then
      insert into public.notifications (user_id, type, title, message, link, related_id)
      values (
        submitter,
        'submission_verdict',
        'Your observation was ' || new.verification_status,
        species || coalesce(' at ' || site, '') || ' was ' ||
          lower(new.verification_status::text) || ' by ' || public.current_actor_name() ||
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
