// lib/supabase-client.js: the only file that talks to supabase-js. Load it after
// config.js; the SDK is injected from the CDN because there is no build step.
// All auth helpers live here, so no page touches supabase-js directly.

window.BioSupabase = (function() {
  'use strict';

  var CDN_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

  var config = (typeof window !== 'undefined' && window.SUPABASE_CONFIG) || null;
  var client = null;
  var initPromise = null;
  var listeners = [];

  function loadSdkFromCDN() {
    return new Promise(function(resolve, reject) {
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

  /** Idempotent: safe to call from every layer. */
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

          // One listener throwing must not stop the others.
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
   * `auth.updatePassword()` is the supabase-js v1 name; this app loads v2, where
   * it does not exist. Calling it threw, so the password never changed and
   * `profiles.password_changed_at` was never stamped, leaving the forced
   * first-login gate to re-fire forever. v2 renamed it to `updateUser({ password })`.
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
   * Only works if Auth email delivery is configured. On this project SMTP is off
   * and the default service delivers to team members only, so callers must treat
   * failure as expected and say so, rather than implying an email was sent.
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

  /** Resolves to the client once the SDK is ready. */
  function ready() {
    return init();
  }

  // Profile cache: auth-guard and data.js both ask "who is the current user?" and
  // each used to fire its own /profiles call per page load. Now one fetch per user
  // per load, shared by all callers, cleared on sign-out.

  var profileCache = {};
  var profileInFlight = {};

  function getProfile(userId) {
    if (!userId) return Promise.reject(new Error('BioSupabase.getProfile requires a userId'));
    if (profileCache[userId]) return Promise.resolve(profileCache[userId]);
    // Share a pending request rather than firing a duplicate /profiles call: the
    // two callers run back-to-back on load.
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

  /**
   * Verified locally against the project's published signing keys, so unlike
   * anything read out of storage the result cannot be forged by editing
   * localStorage. That difference is why the route guard may trust a cached role.
   * Resolves null on any failure: not signed in, unrefreshable expired token, an
   * SDK without getClaims, or a verification error. Callers must read null as
   * "unknown" and fall back, never as "unauthorised".
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