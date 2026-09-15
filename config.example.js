// ZitBIO: Supabase configuration template. Copy to `config.js` and fill in.
// The publishable/anon key is safe to commit: RLS protects the data.
// NEVER put the service_role key or SUPABASE_ACCESS_TOKEN in config.js.

window.SUPABASE_CONFIG = {
  // Project URL, from Dashboard → Project Settings → API
  url: 'https://YOUR-PROJECT-REF.supabase.co',

  // From Dashboard → Project Settings → API → Publishable keys (public by design)
  anonKey: 'sb_publishable_YOUR_KEY_HERE',

  // Optional: server-side admin user management (create/update/delete real Auth
  // users). It holds service_role; the browser only sends the caller's JWT.
  // https://<project-ref>.supabase.co/functions/v1/admin-users
  // Leave '' if not deployed: Add/Edit/Delete then use the local cache.
  adminUsersUrl: ''
};