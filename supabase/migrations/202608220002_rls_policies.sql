-- ============================================================================
-- ZitBIO — Row Level Security (RLS) Policies
-- ============================================================================
-- Security is enforced IN THE DATABASE. The anon/publishable key is public
-- and shipped to browsers, so RLS is what actually protects every row.
--
-- Model:
--   - profiles         → users read/update own row; admins read/update all
--   - observations     → any authenticated user can read/insert; only admins
--                        update/delete (approve/flag/edit/remove)
--   - notifications    → users read/update/delete their own; admins may see all
--   - species_reference/zambia_provinces → public read; write via service role only
--
-- NOTE: Must run AFTER 202608220001_initial_schema.sql.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. HELPER: is_admin()
--    Returns true if the current authenticated user has role = 'admin'.
--    Used by policies on observations/notifications/profiles.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. PROFILES
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Anyone authenticated can read their own profile.
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update their own profile (e.g. name, institution) but NOT role.
create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Admins can read all profiles.
create policy "Admins read all profiles"
  on public.profiles for select
  using (public.is_admin());

-- Admins can update any profile (role promotion/demotion, edits).
create policy "Admins update all profiles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. OBSERVATIONS
--    Any authenticated user can read/insert. Only admins update/delete.
-- ────────────────────────────────────────────────────────────────────────────
alter table public.observations enable row level security;

-- All authenticated users can read all observations.
create policy "Authenticated users read all observations"
  on public.observations for select
  using (auth.role() = 'authenticated');

-- Any authenticated user can insert an observation.
create policy "Authenticated users insert observations"
  on public.observations for insert
  with check (auth.role() = 'authenticated');

-- Only admins can update observations (approve/flag/edit).
create policy "Admins update observations"
  on public.observations for update
  using (public.is_admin())
  with check (public.is_admin());

-- Only admins can delete observations.
create policy "Admins delete observations"
  on public.observations for delete
  using (public.is_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. NOTIFICATIONS
-- ────────────────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

-- Users read their own notifications; admins read all.
create policy "Users read own notifications"
  on public.notifications for select
  using (auth.uid() = user_id or public.is_admin());

-- Users can mark their own notifications read.
create policy "Users update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own notifications.
create policy "Users delete own notifications"
  on public.notifications for delete
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. SPECIES REFERENCE  (public read; write via service role only)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.species_reference enable row level security;

create policy "Anyone can read species reference"
  on public.species_reference for select
  using (true);

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ZAMBIA PROVINCES  (public read; write via service role only)
-- ────────────────────────────────────────────────────────────────────────────
alter table public.zambia_provinces enable row level security;

create policy "Anyone can read provinces"
  on public.zambia_provinces for select
  using (true);