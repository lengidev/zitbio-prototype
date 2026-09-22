/**
 * 2026-09-14 — the forced-password-change stamp travels in the token too
 * =======================================================================
 * WHY
 * ---
 * lib/auth-guard.js resolves the role from the signed `user_role` claim with
 * zero network (the preceding hook work), but the LOGIN page still ran one
 * `GET /rest/v1/profiles` round trip after every successful sign-in — for
 * `password_changed_at`, the stamp that decides whether a temporary password
 * must be changed before the account is usable (the #54 gate). That query was
 * the last thing between "Signing in…" and the redirect, i.e. the length of
 * the wait the user reported as "signing in takes too long".
 *
 * Adding the stamp to the token lets login route from the same already-verified
 * claims the guard uses: sign-in becomes exactly ONE round trip (the password
 * grant itself). The client only trusts the claim when it is PRESENT — a token
 * without it (hook off, pre-migration token) still falls back to /profiles, so
 * the gate cannot be skipped by holding an old token.
 *
 * WHAT
 * ----
 * Adds a top-level `password_changed_at` claim mirroring
 * `public.profiles.password_changed_at` — the ISO timestamp, or the JSON
 * literal `null` when never stamped (the client reads null as "gate fires").
 * `user_role` is unchanged.
 *
 * No dashboard re-enable is needed: the hook is already selected in
 * Auth -> Hooks -> Custom Access Token, and `create or replace` swaps the body
 * in place. Only NEWLY issued tokens carry the claim; existing sessions pick
 * it up at their next refresh or sign-in, and the /profiles fallback covers
 * everything until then.
 *
 * INVERSE
 * -------
 * Re-apply the function body from `202609140002_custom_access_token_hook_null_return_fix.sql`
 * (which drops the `password_changed_at` claim by simply not setting it). No
 * table, column or row is touched, so there is no data inverse to run.
 */

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
-- See 202609140001 for why: the Auth server calls this as `supabase_auth_admin`,
-- which has no rights on public.profiles, and the empty search_path stops the
-- definer's privileges being redirected at a shadowing object.
set search_path = ''
as $$
declare
  user_id uuid;
  app_role text;
  pwd_changed_at timestamptz;
  claims jsonb;
begin
  -- Nothing to add to, or nothing to add it for: hand the event straight back
  -- rather than inventing a claims object the Auth server did not send.
  if event is null or event -> 'claims' is null then
    return event;
  end if;

  user_id := (event ->> 'user_id')::uuid;

  if user_id is not null then
    select p.role::text, p.password_changed_at
      into app_role, pwd_changed_at
      from public.profiles p
     where p.id = user_id;
  end if;

  claims := event -> 'claims';

  -- `coalesce(... 'null'::jsonb)` keeps jsonb_set (STRICT) from collapsing to
  -- NULL — the exact regression 202609140002 fixed for `user_role`. A user with
  -- no profile row gets explicit JSON nulls, never a hook failure.
  claims := jsonb_set(
    claims,
    '{user_role}',
    coalesce(to_jsonb(app_role), 'null'::jsonb),
    true
  );
  claims := jsonb_set(
    claims,
    '{password_changed_at}',
    coalesce(to_jsonb(pwd_changed_at), 'null'::jsonb),
    true
  );

  return jsonb_set(event, '{claims}', claims, true);
exception
  when others then
    -- Raising here fails that user's sign-in. Tokens without the claims are
    -- already-supported states (auth-guard and login fall back to /profiles),
    -- so a hook bug must degrade to "slower login", never "no login".
    return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Adds public.profiles.role (user_role) and public.profiles.password_changed_at to the access token so login routing and the route guard resolve locally instead of querying /profiles on every sign-in and page load. Enable in Auth -> Hooks -> Custom Access Token.';