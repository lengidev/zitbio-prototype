-- ============================================================================
-- ZitBIO — Migration 007: auto-notify admins on new observations
-- ============================================================================
-- When an observation is inserted, create a pending_observation notification
-- for EVERY admin (role='admin'). This runs server-side on any INSERT path
-- (field officer form, admin entry, API), so admin bells update live via the
-- existing realtime subscription — no client-side code needed.
--
-- Admins receive it (not field officers). Uses security definer so the
-- insert bypasses RLS on notifications (which has no INSERT policy).
-- ============================================================================

create or replace function public.handle_observation_notify()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message, link, related_id, read)
  select
    p.id,
    'pending_observation',
    'New Pending Observation',
    (coalesce(new.common_name, new.scientific_name, 'Unknown species')) || ' recorded by ' || new.recorded_by || ' in ' ||
    coalesce(new.focus_area, new.administrative_area, '') || ' needs review.',
    '../observations/observations.html?obs=' || new.observation_id,
    new.observation_id,
    false
  from public.profiles p
  where p.role = 'admin';
  return new;
end;
$$;

drop trigger if exists on_observation_insert_notify on public.observations;
create trigger on_observation_insert_notify
  after insert on public.observations
  for each row execute procedure public.handle_observation_notify();