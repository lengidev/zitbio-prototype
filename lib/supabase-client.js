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
    onAuthStateChange: onAuthStateChange,
    isConfigured: function() { return !!(config && config.url && config.anonKey); }
  };

})();