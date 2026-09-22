-- ────────────────────────────────────────────────────────────────────────────
-- Covering indexes for the foreign keys a user deletion now has to resolve.
--
-- The previous migration turned two NO ACTION constraints into SET NULL and gave
-- two dangling-uuid columns real constraints. The consequence is that deleting a
-- user now performs a referential action on each of those columns, and Postgres
-- must locate the referencing rows in order to do it. Without an index on the
-- referencing column, that is a sequential scan of the child table.
--
-- The tables are small today (209 observations, 13 review rows), so the cost is
-- invisible — but `observations` is the table that grows with every field
-- observation, so this scan sits on the critical path of the dataset's main
-- table. An index makes the lookup proportional to the rows actually affected
-- rather than to the size of the table.
--
-- `observation_reviews.observation_ref` is included for the same reason even
-- though it is not user-related: its rule is CASCADE from `observations`, so
-- deleting or archiving an observation scans the review log.
--
-- Supabase's performance advisor flagged all five as `unindexed_foreign_keys`.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: the tables are tiny, and
-- CONCURRENTLY cannot run inside a transaction, which is how migrations apply.
-- ────────────────────────────────────────────────────────────────────────────

create index if not exists idx_observations_deleted_by
  on public.observations (deleted_by);

create index if not exists idx_observation_reviews_actor_id
  on public.observation_reviews (actor_id);

create index if not exists idx_observation_reviews_observation_ref
  on public.observation_reviews (observation_ref);

create index if not exists idx_species_registry_baseline_updated_by
  on public.species_registry (baseline_updated_by);

create index if not exists idx_access_requests_decided_by
  on public.access_requests (decided_by);
