-- ============================================================================
-- ZitBIO — Notification isolation + admin-action notifications
-- ============================================================================
-- Fixes the "Clear all doesn't clear" bug and the cross-admin visibility leak:
--
--   1. Notifications become STRICTLY per-user. Admins previously read
--      everyone's notifications (`auth.uid() = user_id OR public.is_admin()`),
--      so one admin's "Clear all" looked broken because OTHER admins' rows
--      stayed visible. The read policy is now own-rows only.
--
--   2. Observation ADMIN ACTIONS now notify every OTHER admin, naming the
--      acting admin (via profiles.full_name). Noise control:
--        * status changes (approve/flag/revert) → 'observation_verdict'
--        * delete                            → 'observation_deleted'
--        * plain edits                        → 'observation_edited', DEDUPED —
--          at most one unread "edited" notification per observation+admin,
--          so rapid saves collapse instead of spamming.
--
-- The INSERT path (new observation) keeps the existing review semantics but
-- now excludes the actor (an admin adding via panel won't self-notify).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. PER-OWNER READ POLICY
-- ────────────────────────────────────────────────────────────────────────────
drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. HELPERS — resolve the acting admin's display name
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.current_actor_name()
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select full_name from public.profiles where id = auth.uid()),
    'An admin'
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. INSERT — new observation (replaces the 007 handler; excludes the actor)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_observation_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec record;
  actor uuid;
begin
  actor := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
    insert into public.notifications (user_id, type, title, message, link, related_id)
    values (
      rec.id,
      'pending_observation',
      'New Observation',
      public.current_actor_name() || ' submitted ' || coalesce(nullif(new.common_name, ''), 'an observation') || ' (' || new.observation_id || ') — needs review.',
      '../observations/observations.html?obs=' || new.observation_id,
      new.observation_id
    );
  end loop;
  return new;
end;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. UPDATE — approve/flag/edited notifications (dedupe plain edits)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_admin_action_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec record;
  actor uuid;
  notif_type text;
  notif_title text;
  notif_msg text;
begin
  actor := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');

  if new.verification_status is distinct from old.verification_status then
    notif_type := 'observation_verdict';
    notif_title := 'Observation ' || new.verification_status;
    notif_msg := public.current_actor_name() || ' set ' ||
      coalesce(nullif(new.common_name, ''), 'an observation') || ' (' || new.observation_id || ') to ' ||
      new.verification_status || '.';
  else
    notif_type := 'observation_edited';
    notif_title := 'Observation Edited';
    notif_msg := public.current_actor_name() || ' edited ' ||
      coalesce(nullif(new.common_name, ''), 'an observation') || ' (' || new.observation_id || ').';
  end if;

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

drop trigger if exists handle_admin_action_notify on public.observations;
create trigger handle_admin_action_notify
  after update on public.observations
  for each row execute procedure public.handle_admin_action_notify();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. DELETE — notify other admins (BEFORE so we can read the row being removed)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_observation_delete_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec record;
  actor uuid;
begin
  actor := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000');
  for rec in select id from public.profiles where role = 'admin' and id <> actor
  loop
    insert into public.notifications (user_id, type, title, message, link, related_id)
    values (
      rec.id,
      'observation_deleted',
      'Observation Deleted',
      public.current_actor_name() || ' deleted ' ||
        coalesce(nullif(old.common_name, ''), 'an observation') || ' (' || old.observation_id || ').',
      '../observations/observations.html',
      old.observation_id
    );
  end loop;
  return old;
end;
$$;

drop trigger if exists handle_observation_delete_notify on public.observations;
create trigger handle_observation_delete_notify
  before delete on public.observations
  for each row execute procedure public.handle_observation_delete_notify();