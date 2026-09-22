-- 202609130016 — Advisor hardening: security-definer view + mutable search_path (#38)
--
-- Follow-up to 202609130015. That migration closed the seven client-executable
-- SECURITY DEFINER *functions*. This one closes the two findings it left behind,
-- plus one ERROR that an earlier migration of mine introduced.
--
-- ============================================================
-- 1. ERROR — v_observations_check_exemptions was a SECURITY DEFINER view
-- ============================================================
--
-- Created in 202609130013 to list rows exempted from the new NOT VALID CHECK
-- constraints. A view whose owner is the migration runner inherits SECURITY
-- DEFINER semantics: it is evaluated with the CREATOR's privileges, so it reads
-- every row regardless of the caller's RLS. That is the opposite of what a
-- diagnostic view should do, and the linter rates it ERROR for good reason — it
-- is a row-level-security bypass sitting in the exposed `public` schema.
--
-- security_invoker = true makes the view evaluate under the QUERYING user's
-- permissions and policies, which is the intended semantics: an admin still sees
-- every row, and anyone else sees exactly the rows they were already allowed to
-- read. Postgres 15+; this project is on 17.6.
alter view public.v_observations_check_exemptions set (security_invoker = true);

-- ============================================================
-- 2. WARN — three functions had a role-mutable search_path
-- ============================================================
--
-- Without a pinned search_path, a function resolves unqualified names against the
-- CALLER's search_path. A caller who can create objects in a schema earlier in
-- that path can shadow a table or function the body references, and have their
-- own version executed with the function's privileges. None of these three
-- grants privileges to the caller, so the practical exposure is small — but the
-- fix is free and the pattern is worth not having in the codebase.
--
-- All three are SECURITY INVOKER (verified: prosecdef = false), so this pins
-- name resolution only; it does not change who the body runs as.
alter function public.prevent_profile_privilege_change() set search_path = public;
alter function public.profiles_sync_deactivation()       set search_path = public;
alter function public.review_observation(text, text, text) set search_path = public;

-- ── Deliberately NOT changed, recorded so the next reader does not "fix" it ──
--
-- public.is_admin() is still executable by `anon` and `authenticated`, and the
-- linter still reports it (lint 0028 / 0029). It is referenced by 9 RLS policies,
-- five of which are PUBLIC, and policy expressions are evaluated with the
-- CALLER's privileges — so revoking EXECUTE would replace a working
-- authorisation layer with "permission denied for function is_admin" on every
-- admin path and on public reads. With no JWT, auth.uid() is null, so an anon
-- caller learns only `false`. See the long note in 202609130015.
--
-- public.auth_leaked_password_protection is an Auth service setting, not a
-- database object. No SQL or MCP tool in this environment can change it; it
-- requires the dashboard or the Management API with a personal access token.

-- Inverse:
--   alter view public.v_observations_check_exemptions set (security_invoker = false);
--   alter function public.<name>(<args>) reset search_path;
-- Nothing is dropped and no data is touched.
