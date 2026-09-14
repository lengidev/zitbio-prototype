/**
 * ZitBIO — Supabase Client
 * ========================
 * Initialises the Supabase client from `config.js` and exposes it globally
 * as `window.BioSupabase`.
 *
 * Design decisions:
 *   - Static-host compatible: uses the supabase-js CDN build (like Chart.js
 *     and Leaflet already do). If the SDK script isn't already present in the
 *     page, this module injects it dynamically and waits for it to load —
 *     so HTML pages only need to include `config.js` and this file in order.
 *   - Exposes a tiny promise-based API (`ready()`) so higher layers (e.g. the
 *     BioData adapter in Phase 4) can await client initialisation before
 *     firing their first queries.
 *   - Authentication helpers (signIn/signOut/session/subscribe) live here so
 *     the login page and admin layout never talk to supabase-js directly.
 */

window.BioSupabase = (function() {
  'use strict';

  var CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var config = (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || null;
  var client = null;
  var initPromise = null;
  var listeners = [];

  // ─────────────────────────────────────────────
  //  Private helpers
  // ─────────────────────────────────────────────

  function loadSdkFromCDN() {
    return new Promise(function(resolve, reject) {
      // Already loaded?
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        resolve();
        return;
      }

      var script = document.createElement('script');
      script.src = CDN_URL;
      script.async = true;
      script.onload = function() { resolve(); };
      script.onerror = function() {
        reject(new Error('Failed to load supabase-js from CDN: ' + CDN_URL));
      };
      document.head.appendChild(script);
    });
  }

  // ─────────────────────────────────────────────
  //  Public initialisation
  // ─────────────────────────────────────────────

  /**
   * Ensure the client is created. Idempotent — safe to call multiple times.
   * @returns {Promise<object>} resolves to the Supabase client.
   */
  function init() {
    if (initPromise) return initPromise;

    initPromise = new Promise(function(resolve, reject) {
      if (!config || !config.url || !config.anonKey) {
        reject(new Error('SUPABASE_CONFIG missing. Create config.js from config.example.js first.'));
        return;
      }

      loadSdkFromCDN()
        .then(function() {
          client = window.supabase.createClient(config.url, config.anonKey, {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          });

          // Track auth state changes and fan out to local subscribers.
          client.auth.onAuthStateChange(function(event, session) {
            if (event === 'SIGNED_OUT' || event === 'USER_DELETED') { profileCache = {}; }
            listeners.forEach(function(fn) {
              try { fn(event, session); } catch (e) { console.error('BioSupabase auth listener error:', e); }
            });
          });

          resolve(client);
        })
        .catch(reject);
    });

    return initPromise;
  }

  // ─────────────────────────────────────────────
  //  Auth helpers
  // ─────────────────────────────────────────────

  function getClient() {
    return client;
  }

  /** @returns {Promise<{data: {user, session}, error}>} */
  function signIn(email, password) {
    return init().then(function(c) {
      return c.auth.signInWithPassword({ email: email, password: password });
    });
  }

  /** @returns {Promise<{error}>} */
  function signOut() {
    return init().then(function(c) {
      return c.auth.signOut();
    });
  }

  /** @returns {Promise<{data: {session}, error}>} */
  function getSession() {
    return init().then(function(c) {
      return c.auth.getSession();
    });
  }

  /** @returns {Promise<{data: {user}, error}>} */
  function getUser() {
    return init().then(function(c) {
      return c.auth.getUser();
    });
  }

  /**
   * Update the current user's password.
   *
   * `auth.updatePassword()` is the supabase-js **v1** name. This app loads v2
   * from the CDN, where that method does not exist — so the call threw
   * "auth.updatePassword is not a function" and the password could never be
   * changed by anyone.
   *
   * That single wrong method name broke the whole new-user workflow: the forced
   * first-login change is what stamps `profiles.password_changed_at`, so the
   * stamp never happened, the gate re-fired on every sign-in, and the account
   * was unreachable. Six of eight profiles were stuck in it.
   *
   * v2 renamed the call to `updateUser({ password })`.
   */
  function updatePassword(newPassword) {
    return init().then(function(c) {
      if (!c.auth || typeof c.auth.updateUser !== 'function') {
        throw new Error('Supabase Auth SDK does not expose updateUser.');
      }
      return c.auth.updateUser({ password: newPassword });
    });
  }

  /**
   * Send a password-recovery email. Exposed so the login page can attempt a
   * real self-service reset instead of a dead link.
   *
   * Note: this only works if Auth email delivery is configured. On this project
   * SMTP is off and the default service only delivers to project team members,
   * so callers must treat a failure as expected and say so plainly rather than
   * implying an email was sent.
   */
  function resetPasswordForEmail(email) {
    return init().then(function(c) {
      return c.auth.resetPasswordForEmail(email);
    });
  }

  /** Subscribe to auth state changes. @returns {function} unsubscribe */
  function onAuthStateChange(fn) {
    listeners.push(fn);
    return function() {
      var idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  /**
   * Await client readiness. Equivalent to init() but returns the client
   * directly. Useful for top-level `BioSupabase.ready().then(...)`.
   */
  function ready() {
    return init();
  }

  // ─────────────────────────────────────────────
  //  Profile cache (dedupe current-user profile fetches)
  //  auth-guard and data.js both ask "who is the current user?" — previously
  //  each fired its own /profiles REST call per page load. This cached
  //  getter means ONE fetch per user per load, with all callers sharing the
  //  result. Cleared automatically on sign-out.
  // ─────────────────────────────────────────────
  var profileCache = {};
  var profileInFlight = {};

  function getProfile(userId) {
    if (!userId) return Promise.reject(new Error('BioSupabase.getProfile requires a userId'));
    if (profileCache[userId]) return Promise.resolve(profileCache[userId]);
    // In-flight dedupe: if several callers ask for the same user at once
    // (auth-guard + data.js run back-to-back on load), share the pending
    // request instead of firing a duplicate /profiles call each.
    if (profileInFlight[userId]) return profileInFlight[userId];
    var p = init().then(function(c) {
      return c.from('profiles')
        .select('id, email, full_name, role, institution_name')
        .eq('id', userId)
        .maybeSingle();
    }).then(function(result) {
      if (result.error) throw result.error;
      profileCache[userId] = result.data || null;
      return profileCache[userId];
    });
    p.then(function() { if (profileInFlight[userId] === p) profileInFlight[userId] = null; },
           function() { if (profileInFlight[userId] === p) profileInFlight[userId] = null; });
    profileInFlight[userId] = p;
    return p;
  }

  function clearProfileCache() {
    profileCache = {};
  }

  // ─────────────────────────────────────────────
  //  Verified access-token claims
  // ─────────────────────────────────────────────

  /**
   * The current access token's claims, verified locally.
   *
   * `getClaims()` checks the JWT's signature against the project's published
   * signing keys (`.well-known/jwks.json`, fetched once and then cached), so it
   * normally needs no Auth-server round trip, and — unlike `getSession()` or
   * anything else read out of storage — the result cannot be forged by editing
   * localStorage. That difference is the whole reason the route guard is now
   * allowed to trust a cached role: the claim is signed by the Auth server.
   *
   * Resolves `null` on any failure — not signed in, an unrefreshable expired
   * token, an SDK without `getClaims`, or a verification error. Callers must
   * read null as "unknown" and fall back, never as "unauthorised".
   */
  function getVerifiedClaims() {
    return init().then(function(c) {
      if (!c.auth || typeof c.auth.getClaims !== 'function') return null;
      return c.auth.getClaims();
    }).then(function(result) {
      if (!result || result.error) return null;
      var claims = result.data && result.data.claims;
      return claims && typeof claims === 'object' ? claims : null;
    }).catch(function() {
      return null;
    });
  }

  // ─────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────

  return {
    init: init,
    ready: ready,
    getClient: getClient,
    signIn: signIn,
    signOut: signOut,
    getSession: getSession,
    getUser: getUser,
    updatePassword: updatePassword,
    getProfile: getProfile,
    clearProfileCache: clearProfileCache,
    getVerifiedClaims: getVerifiedClaims,
    onAuthStateChange: onAuthStateChange,
    isConfigured: function() { return !!(config && config.url && config.anonKey); }
  };

})();