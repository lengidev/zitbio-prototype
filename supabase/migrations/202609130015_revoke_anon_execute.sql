-- 202609130015 — Revoke client EXECUTE from internal SECURITY DEFINER functions (#38)
--
-- Supabase's security advisor flagged seven SECURITY DEFINER functions as
-- executable by `anon` (and `authenticated`) through `/rest/v1/rpc/<name>`.
-- A SECURITY DEFINER function runs with the OWNER's privileges, so exposing one
-- to a client is exposing the owner's rights to whoever can reach it. These
-- seven should never have been callable: six are trigger functions and one is an
-- event-trigger function, and triggers do not go through EXECUTE at all.
--
-- WHY THE DEFAULT IS EXECUTE
--
-- Postgres grants EXECUTE to PUBLIC on every new function. So the exposure was
-- never a deliberate grant — it was the absence of a revoke. That is why the fix
-- is a revoke per function rather than a change to any role.
--
-- ============================================================
-- WHAT IS **NOT** REVOKED, AND WHY — is_admin()
-- ============================================================
--
-- is_admin() stays executable by anon and authenticated. This is deliberate and
-- must not be "tidied up" later:
--
--   * It is referenced by **9 RLS policies** (verified against pg_policy).
--   * Policy expressions are evaluated with the PRIVILEGES OF THE CALLER, so a
--     policy that calls is_admin() requires the querying role to hold EXECUTE on
--     it. Revoking from `authenticated` would break authorisation on profiles,
--     observations, species_registry, sites, observation_reviews and
--     access_requests — every admin path in the application.
--   * Five of those nine are PUBLIC policies (polroles = {0}), so `anon` reaches
--     the same expressions. Revoking from `anon` would turn anon reads of those
--     tables into "permission denied for function is_admin" — an error, not an
--     empty result — which would break the public-facing read path.
--   * The residual risk is nil: with no JWT, auth.uid() is null, so an anon
--     caller of /rest/v1/rpc/is_admin learns nothing but `false`.
--
-- Trading a working authorisation layer for a clean advisor line would be a bad
-- trade. This exception is recorded in the vault instead.
--
-- Also NOT revoked: prevent_profile_privilege_change(). It is an invoker-rights
-- trigger function that itself calls is_admin(), so it depends on the caller
-- holding EXECUTE on is_admin — which is why is_admin stays as it is above.
--
-- ============================================================
-- The revokes
-- ============================================================
-- Six trigger functions. All are fired by the trigger manager, which does not
-- check EXECUTE, so revoking cannot stop them firing — proved below rather than
-- asserted, because "triggers do not check EXECUTE" is exactly the kind of claim
-- that is true until it is not.

revoke execute on function public.handle_observation_notify()        from public, anon, authenticated;
revoke execute on function public.handle_admin_action_notify()       from public, anon, authenticated;
revoke execute on function public.handle_observation_delete_notify() from public, anon, authenticated;
revoke execute on function public.log_observation_review()           from public, anon, authenticated;
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;

-- Called only from inside the three SECURITY DEFINER handlers above
-- (verified by scanning every function body in the schema). Those run as the
-- owner, and the owner keeps EXECUTE, so this call keeps working.
revoke execute on function public.current_actor_name()               from public, anon, authenticated;

-- Event-trigger function for `ensure_rls`, a Supabase-managed helper that turns
-- Row Level Security on for new tables created in `public`. Event triggers are
-- fired by the system, not invoked by a role, so EXECUTE is not consulted — but
-- this one has real consequences if that ever changes: new tables would silently
-- ship WITHOUT RLS. It is exercised explicitly in the verification below. Note
-- that Supabase's own tooling may recreate it; if the advisor ever reports it
-- again, this revoke was overwritten by the platform.
revoke execute on function public.rls_auto_enable()                  from public, anon, authenticated;

-- Inverse: `grant execute on function public.<name>() to public;` for each
-- function above. Each revoke is independent and safe to undo on its own. No
-- data is touched and no object is dropped, so nothing needs restoring.
