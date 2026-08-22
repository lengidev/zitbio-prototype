/**
 * ZitBIO — Supabase Configuration Template
 * ========================================
 * Copy this file to `config.js` and fill in your real values.
 * `config.js` (containing only the PUBLIC publishable/anon key) is safe to
 * commit — Row Level Security protects the actual data from unauthorized
 * access even though the key is exposed to browsers.
 *
 * NEVER put your service_role key or SUPABASE_ACCESS_TOKEN in config.js.
 */

window.SUPABASE_CONFIG = {
  // Project URL — found in Supabase Dashboard → Project Settings → API
  url: 'https://YOUR-PROJECT-REF.supabase.co',

  // Publishable / anon key (public by design)
  // Found in Supabase Dashboard → Project Settings → API → Publishable keys
  anonKey: 'sb_publishable_YOUR_KEY_HERE',

  // Optional: Supabase Edge Function for server-side admin user management
  // (create/update/delete real Auth users). The function holds the
  // service_role key server-side; the browser only sends the caller's JWT.
  // URL format: https://<project-ref>.supabase.co/functions/v1/admin-users
  // Leave '' if the function is not deployed — Add/Edit/Delete then fall
  // back to the local cache.
  adminUsersUrl: ''
};