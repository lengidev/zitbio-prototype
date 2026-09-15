// config.js
// The publishable (anon) key is PUBLIC by design: it ships to every browser and
// static hosting needs it. Security is Row Level Security in the database, not
// hiding this key.
// NEVER add the service_role key or SUPABASE_ACCESS_TOKEN here.

window.SUPABASE_CONFIG = {
  url: 'https://hhudwocgyrpgzqoffdqg.supabase.co',
  anonKey: 'sb_publishable_SZg6En_qApKJiS2npQbrsA_AoLJzHnX',

  // Holds service_role server-side; the browser only ever sends the caller's JWT.
  adminUsersUrl: 'https://hhudwocgyrpgzqoffdqg.supabase.co/functions/v1/admin-users',

  // The only unauthenticated endpoint: takes no JWT and always creates a
  // field_officer, ignoring any role in the request body.
  accessRequestUrl: 'https://hhudwocgyrpgzqoffdqg.supabase.co/functions/v1/access-request'
};