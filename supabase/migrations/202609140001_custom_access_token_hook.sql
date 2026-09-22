/**
 * 2026-09-14 — custom_access_token_hook: the app role travels in the token
 * ==========================================================================
 * WHY
 * ---
 * Every protected page re-derived the caller's role with its own
 * `GET /rest/v1/profiles` round trip, because the role lives in a table and each
 * page load is a fresh JS context that has nothing cached. That single query was
 * the route guard's critical path, and therefore the length of the `auth-pending`
 * hold in `styles/global.css`: measured 0.36-0.6s warm and 2.2-4.5s cold, i.e.
 * the user watched a loading state every time they changed page.
 *
 * The obvious shortcut — remember the role on the client and skip the query —
 * is the privilege-escalation path #40 closed: `localStorage.biodata_session.role`
 * is editable with devtools, so a field officer could write "admin" into it.
 *
 * An access token cannot be edited that way. It is signed by the Auth server
 * (this project uses asymmetric ES256 signing keys, `.well-known/jwks.json`),
 * so the browser can verify it locally with the public key and read a role out
 * of it that no client can forge. Putting the role in the token is therefore the
 * one way to make "log in once" both instant AND trustworthy.
 *
 * WHAT
 * ----
 * Adds a top-level `user_role` claim carrying `public.profiles.role`.
 * `role` itself is deliberately left alone: it is a required claim whose value
 * must stay 'authenticated' for RLS to work.
 *
 * ENABLING IT — the function does nothing until Auth is told to call it
 * ----------------------------------------------------------------------
 * Dashboard → Authentication → Hooks → Custom Access Token →
 * select `public.custom_access_token_hook`. (Requires this migration to be applied
 * first: the function must exist and be executable by `supabase_auth_admin`.)
 *
 * Only NEWLY issued tokens carry the claim, so an already-signed-in session picks
 * it up at its next refresh (JWT expiry is ~20 minutes) or on the next sign-in.
 * `lib/auth-guard.js` keeps its `/profiles` fallback for tokens without it, so the
 * two paths coexist and either one alone is correct.
 *
 * INVERSE
 * -------
 * Switch the hook OFF in the dashboard FIRST — with the hook still enabled, a
 * dropped function makes every sign-in fail. Then:
 *
 *   drop function if exists public.custom_access_token_hook(jsonb);
 *   revoke usage on schema public from supabase_auth_admin;
 *
 * No table, column or row is touched by this migration, so there is no data
 * inverse to run.
 *
 * DELIBERATELY NOT DONE HERE
 * --------------------------
 * `active` / `deactivated_at` are not consulted. The claim mirrors exactly what
 * the client's own `/profiles` read returned before, so this change is
 * behaviour-preserving. Moving deactivation enforcement into the hook (no claim
 * ⇒ no privileged access, even for a live session) is a separate decision and
 * would change account-deactivation semantics, not page-load speed.
 */

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
-- `security definer` because the Auth server calls this as `supabase_auth_admin`,
-- which has no rights on `public.profiles`; the owner (postgres) is also the table
-- owner, so RLS does not filter the lookup. An empty search_path keeps the
-- definer's privileges from being redirected at a shadowing object.
set search_path = ''
as $$
declare
  app_role text;
  claims jsonb;
begin
  select p.role::text
    into app_role
    from public.profiles p
   where p.id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  -- `true` = create the key when absent. An unknown user gets an explicit null
  -- rather than a missing key, so the client can tell "verified, no role" from
  -- "this token predates the hook".
  claims := jsonb_set(claims, '{user_role}', to_jsonb(app_role), true);

  return jsonb_set(event, '{claims}', claims, true);
exception
  when others then
    -- Raising here fails the sign-in for that user. A token without the claim is
    -- already a supported state (the guard falls back to /profiles), so a hook
    -- bug must degrade to "slower login", never "no login".
    return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Adds public.profiles.role to the access token as the `user_role` claim so protected pages can resolve the role locally instead of querying /profiles on every load. Enable in Auth -> Hooks -> Custom Access Token.';

-- The Auth server executes the hook as supabase_auth_admin, which owns nothing here.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Every other role must be unable to call it: it is a SECURITY DEFINER function
-- that reads any row of public.profiles.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
