-- ============================================================================
-- ZitBIO — Migration 006: live settings data + notification seeding
-- ============================================================================
-- 1. profiles: track when the user last changed their password.
-- 2. system_meta: small key/value table for version + last-updated (Settings page).
-- 3. Seed notifications for current admins so the bell shows real cloud rows
--    instead of the old localStorage-only seeds.
-- ============================================================================

-- 1. PROFILES.password_changed_at
alter table public.profiles
  add column if not exists password_changed_at timestamptz;

-- 2. SYSTEM_META
create table if not exists public.system_meta (
  key            text primary key,
  value          text not null default '',
  updated_at     timestamptz not null default now()
);

alter table public.system_meta enable row level security;

create policy "Anyone can read system_meta"
  on public.system_meta for select
  using (true);

insert into public.system_meta (key, value) values
  ('version', '0.6.0-beta'),
  ('last_updated_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
on conflict (key) do nothing;

-- 3. SEED NOTIFICATIONS FOR ADMINS (from existing pending/flagged observations)
--    Only seed admins so field officers don't get admin-targeted alerts.
insert into public.notifications (user_id, type, title, message, link, related_id, read)
select
  p.id,
  case when o.verification_status = 'Flagged' then 'flagged_observation' else 'pending_observation' end,
  case when o.verification_status = 'Flagged' then 'Flagged Observation' else 'Pending Observation' end,
  (coalesce(o.common_name, o.scientific_name, 'Unknown species')) || ' recorded by ' || o.recorded_by || ' in ' ||
  coalesce(o.focus_area, o.administrative_area, '') || ' requires review.',
  '../observations/observations.html?obs=' || o.observation_id,
  o.observation_id,
  false
from public.observations o
cross join public.profiles p
where p.role = 'admin'
  and o.verification_status in ('Pending', 'Flagged');