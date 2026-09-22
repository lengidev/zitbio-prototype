/**
 * 2026-09-14 — fix: the hook returned NULL for a user with no profile row
 * ======================================================================
 * WHAT WENT WRONG
 * ---------------
 * `202609140001` built the claim with
 *
 *   claims := jsonb_set(claims, '{user_role}', to_jsonb(app_role), true);
 *
 * `to_jsonb(NULL)` is SQL NULL (not the JSON `null` literal), and `jsonb_set`
 * is a STRICT function — a NULL `new_value` makes the whole call return NULL.
 * So for any `user_id` with no matching `public.profiles` row (and for an event
 * with no `user_id` at all, since a NULL cast raises nothing) the expression
 * collapsed to NULL, the next `jsonb_set(event, '{claims}', NULL, true)` also
 * returned NULL, and the hook handed the Auth server SQL NULL instead of a
 * claims object.
 *
 * The Auth server validates the hook's return against its claim specification.
 * A NULL is not a valid response, so this would most likely have failed sign-in
 * for exactly the users the hook could not resolve — the opposite of the
 * `exception` block's intent, which was to degrade to "slower login", never
 * "no login".
 *
 * Found by calling the function directly with four synthetic events (admin,
 * field officer, unknown uuid, no user_id) instead of assuming the happy path
 * proved the unhappy ones. Only the two users who *have* a profile row returned
 * a usable object.
 *
 * THE FIX
 * -------
 *   * `coalesce(to_jsonb(app_role), 'null'::jsonb)` — an unknown user gets the
 *     JSON literal `null` for `user_role`, which is the state the client already
 *     understands ("verified token, no role").
 *   * An event with no `claims` object is returned untouched before any of that
 *     runs, and the `uuid` cast is done once into a variable so a missing
 *     `user_id` cannot silently resolve to "no profile" instead of "nothing to do".
 *
 * INVERSE
 * -------
 * Re-applying `202609140001`'s body restores the NULL-returning version, which
 * is only correct while the hook is switched off in the dashboard. Do not do
 * that with the hook enabled.
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
  claims jsonb;
begin
  -- Nothing to add to, or nothing to add it for: hand the event straight back
  -- rather than inventing a claims object the Auth server did not send.
  if event is null or event -> 'claims' is null then
    return event;
  end if;

  user_id := (event ->> 'user_id')::uuid;

  if user_id is not null then
    select p.role::text
      into app_role
      from public.profiles p
     where p.id = user_id;
  end if;

  claims := event -> 'claims';

  -- `coalesce(... 'null'::jsonb)` is the fix: a user with no profile row gets an
  -- explicit JSON null, never a NULL that would make jsonb_set (STRICT) return NULL.
  claims := jsonb_set(
    claims,
    '{user_role}',
    coalesce(to_jsonb(app_role), 'null'::jsonb),
    true
  );

  return jsonb_set(event, '{claims}', claims, true);
exception
  when others then
    -- Raising here fails that user's sign-in. A token without the claim is an
    -- already-supported state (lib/auth-guard.js falls back to /profiles), so a
    -- hook bug must degrade to "slower login", never "no login".
    return event;
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Adds public.profiles.role to the access token as the `user_role` claim so protected pages can resolve the role locally instead of querying /profiles on every load. Enable in Auth -> Hooks -> Custom Access Token.';
