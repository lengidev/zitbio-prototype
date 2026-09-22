-- 202609130007 — Account deactivation (#53)
--
-- Offboarding a researcher meant DELETING the Auth user. That destroys the
-- `recorded_by` link on every observation they submitted and cannot be undone;
-- there was also no way to temporarily disable an account (for example while
-- someone is away, or while a suspicious account is investigated).
--
-- This adds a reversible deactivation:
--   profiles.active          false once deactivated
--   profiles.deactivated_at  when, so the Users page can show it
--
-- Sign-in is blocked at the Auth layer by banning the user through the Admin API
-- in the `admin-users` edge function — not by this flag alone, because a flag
-- only stops sign-in if every access path remembers to check it. A flag that
-- nothing enforces would make "Deactivate" a label rather than a control.
--
-- Inverse: drop the two columns, the index and the trigger. Nothing else
-- references them; no data is lost by reverting beyond the flag itself.

alter table public.profiles
  add column if not exists active boolean not null default true,
  add column if not exists deactivated_at timestamptz;

comment on column public.profiles.active is
  'False when the account is deactivated. Login is blocked by banning the Auth user; this column drives the Users page list and status.';

-- Partial index: the common query is "the active accounts" and deactivated rows
-- are a small minority, so indexing only the exceptions is the cheaper shape.
create index if not exists profiles_deactivated_idx
  on public.profiles (deactivated_at)
  where active = false;

-- Keep `active` and `deactivated_at` consistent with each other, so no code path
-- can leave a deactivated account with no timestamp, or a reactivated one still
-- carrying a stale deactivation date.
create or replace function public.profiles_sync_deactivation()
returns trigger
language plpgsql
as $function$
begin
  if new.active is distinct from old.active then
    if new.active then
      new.deactivated_at := null;
    else
      new.deactivated_at := coalesce(new.deactivated_at, now());
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_sync_deactivation on public.profiles;
create trigger profiles_sync_deactivation
  before update on public.profiles
  for each row execute function public.profiles_sync_deactivation();
