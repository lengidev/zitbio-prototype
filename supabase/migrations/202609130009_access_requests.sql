-- 202609130009 — Access requests
--
-- Backs the "Request Access" form on the login page. Decided 2026-09-13 to run
-- this as FRICTIONLESS self-signup (an account is created and active
-- immediately) — see Notes/brain/brain-access-request-decision.
--
-- This table exists for three reasons even though approval is automatic:
--   1. an audit trail of who asked, when, and from which institution;
--   2. it holds the row BEFORE the account is created, so a failure part-way
--      leaves evidence rather than silence;
--   3. it is the seam the deferred options need — an admin approval queue
--      (option B) or inactive-pending-approval (option C) both read from here
--      and only change what the edge function does on submit.
--
-- Inverse: drop the table. Nothing references it.

create table if not exists public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  full_name     text not null,
  institution   text,
  -- 'approved' is the default because signup is currently automatic. Deferred
  -- options would insert 'pending' and let an admin decide.
  status        text not null default 'approved'
                check (status in ('pending', 'approved', 'rejected')),
  requested_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid references public.profiles(id),
  note          text
);

-- One request per email, case-insensitively — `Name@x.com` and `name@x.com` are
-- the same person.
create unique index if not exists access_requests_email_key
  on public.access_requests (lower(email));

create index if not exists access_requests_status_idx
  on public.access_requests (status, requested_at desc);

alter table public.access_requests enable row level security;

-- Read-only for admins. There is deliberately NO insert/update/delete policy:
-- rows are written only by the `access-request` edge function using the service
-- role. That form is unauthenticated by definition, so an INSERT policy would
-- hand every anonymous visitor a direct write path into the database.
drop policy if exists access_requests_admin_read on public.access_requests;
create policy access_requests_admin_read on public.access_requests
  for select
  using (public.is_admin());
