/**
 * ZitBIO — Supabase Configuration
 * ===============================
 * The publishable (anon) key below is PUBLIC by design — it is shipped to
 * every browser that loads the app and is required for static hosting
 * (GitHub Pages). Security is enforced by Row Level Security (RLS) policies
 * in the database, NOT by hiding this key.
 *
 * NEVER add the service_role key or SUPABASE_ACCESS_TOKEN to this file.
 */

window.SUPABASE_CONFIG = {
  url: 'https://hhudwocgyrpgzqoffdqg.supabase.co',
  anonKey: 'sb_publishable_SZg6En_qApKJiS2npQbrsA_AoLJzHnX',

  // Supabase Edge Function used for server-side admin user management
  // (create/update/delete real Auth users). The function holds the
  // service_role key server-side; the browser only ever sends the caller's JWT.
  // URL format: https://<project-ref>.supabase.co/functions/v1/admin-users
  // Set to '' until the function is deployed.
  adminUsersUrl: 'https://hhudwocgyrpgzqoffdqg.supabase.co/functions/v1/admin-users',

  // Public self-signup used by the "Request Access" form on the login page.
  // The ONLY unauthenticated endpoint in the project: it takes no JWT and always
  // creates a field_officer, ignoring any role in the request body.
  accessRequestUrl: 'https://hhudwocgyrpgzqoffdqg.supabase.co/functions/v1/access-request'
};