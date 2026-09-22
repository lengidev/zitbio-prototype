-- ────────────────────────────────────────────────────────────────────────────
-- User deletion: stop it failing, and stop it leaving dangling ids.
--
-- Deleting a user goes through the `admin-users` Edge Function, which calls
-- auth.admin.deleteUser(id). Postgres then applies the ON DELETE rules on every
-- table that references the user.
--
-- Two of those references were declared with no ON DELETE clause, which
-- defaults to NO ACTION. NO ACTION does not mean "leave it alone" — it means
-- the delete is REFUSED. So these blocked deletion outright:
--
--   species_registry.baseline_updated_by -> auth.users
--   access_requests.decided_by           -> profiles
--
-- Both columns are empty as of this migration, so user deletion currently
-- succeeds by luck. As soon as an admin updates a species baseline (the per-site
-- baselines feature), that admin becomes permanently undeletable, and the only
-- feedback is a raw Postgres foreign-key error surfaced in a toast.
--
-- SET NULL is the correct rule for both: neither row is *about* the user, each
-- merely records who last touched it, so the row should outlive them.
--
-- Two more columns hold user ids with no FK constraint at all, which leaves
-- dangling uuid references after a delete:
--
--   observation_reviews.actor_id  — has actor_name text alongside it, so the
--                                   audit trail stays readable regardless
--   observations.deleted_by       — has no name column, so a dangling id cannot
--                                   be rendered at all
--
-- Both get SET NULL too. The audit row and the observation must survive; only
-- the link to a now-deleted account should be dropped.
--
-- Safety check performed before writing this: `observations` carries two UPDATE
-- triggers (`observations_log_review`, `handle_admin_action_notify`), and a
-- SET NULL is an UPDATE, so both would fire. Neither misfires —
-- `log_observation_review` only inserts when verification_status actually
-- changes, and `handle_admin_action_notify` returns early unless one of eleven
-- content columns changed. user_id and deleted_by are not among them. No
-- spurious review entries and no spurious notifications.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.species_registry
  drop constraint if exists species_registry_baseline_updated_by_fkey;

alter table public.species_registry
  add constraint species_registry_baseline_updated_by_fkey
  foreign key (baseline_updated_by) references auth.users (id) on delete set null;

alter table public.access_requests
  drop constraint if exists access_requests_decided_by_fkey;

alter table public.access_requests
  add constraint access_requests_decided_by_fkey
  foreign key (decided_by) references public.profiles (id) on delete set null;

alter table public.observation_reviews
  drop constraint if exists observation_reviews_actor_id_fkey;

alter table public.observation_reviews
  add constraint observation_reviews_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete set null;

alter table public.observations
  drop constraint if exists observations_deleted_by_fkey;

alter table public.observations
  add constraint observations_deleted_by_fkey
  foreign key (deleted_by) references auth.users (id) on delete set null;

comment on constraint species_registry_baseline_updated_by_fkey on public.species_registry is
  'SET NULL, not NO ACTION: a baseline must outlive the admin who last edited it.';
comment on constraint access_requests_decided_by_fkey on public.access_requests is
  'SET NULL, not NO ACTION: an access request must outlive the admin who decided it.';
comment on constraint observation_reviews_actor_id_fkey on public.observation_reviews is
  'SET NULL: the review log is append-only and must survive the actor''s deletion. actor_name keeps it readable.';
comment on constraint observations_deleted_by_fkey on public.observations is
  'SET NULL: the observation record outlives the admin who archived it.';
