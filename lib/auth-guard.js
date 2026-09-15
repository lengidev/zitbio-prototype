/**
 * Route guard for every protected page: load after config.js and lib/supabase-client.js.
 */

window.AuthGuard = (function() {
  'use strict';

  // Every protected page is exactly 3 levels deep: pages/<section>/<page>.html.
  var LOGIN_PATH = '../../../index.html';

  // Cache the resolved profile so parallel guard calls don't hit the DB twice.
  var cachedProfile = null;

  // Least-privileged role. Offline we grant nothing above it (reason below).
  var OFFLINE_ROLE = 'field_officer';

  // One-shot message key. sessionStorage (not localStorage) so it is consumed
  // once, per tab, and never outlives the browsing session.
  var FLASH_KEY = 'biodata_flash';
  var flashFlushed = false;

  /**
   * Queued so a guard redirect explains itself instead of looking like a broken page.
   */
  function setFlash(type, text) {
    try {
      window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type: type, text: text }));
    } catch (e) { /* storage unavailable; the redirect still happens */ }
  }

  /**
   * Render the queued flash once per load, through the page's own toast helper.
   */
  function flushFlashOnce() {
    if (flashFlushed) return;
    flashFlushed = true;
    var raw = null;
    try {
      raw = window.sessionStorage.getItem(FLASH_KEY);
      window.sessionStorage.removeItem(FLASH_KEY);
    } catch (e) { return; }
    if (!raw) return;
    var flash = null;
    try { flash = JSON.parse(raw); } catch (e) { return; }
    if (!flash || !flash.text) return;
    if (typeof window.showToast === 'function') {
      window.showToast(flash.text, flash.type || 'warning');
    } else {
      console.warn('AuthGuard: ' + flash.text);
    }
  }

  /**
   * Does the cached session belong to the email we already authenticated?
   * Email rather than id: it is the only field both the cache and this call
   * carry, and a mismatch means a stale cache belonging to somebody else.
   */
  function cachedProfileMatches(cachedSession, userEmail) {
    if (!userEmail || !cachedSession) return true;
    var cachedEmail = cachedSession.email || '';
    if (!cachedEmail) return true;
    return String(cachedEmail) === String(userEmail);
  }

  /**
   * Depth-aware path to index.html, so this works under a GitHub Pages subpath
   * rather than assuming the app is served from the domain root.
   */
  function buildLoginPath() {
    try {
      var parts = window.location.pathname.split('/').filter(Boolean);
      var pagesIndex = -1;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === 'pages') { pagesIndex = i; break; }
      }
      var depth;
      if (pagesIndex !== -1) {
        depth = (parts.length - 1) - pagesIndex;
      } else {
        depth = parts.length > 0 ? parts.length - 1 : 0;
      }
      if (depth === 3) return LOGIN_PATH; // pages/x/y/page.html
      var prefix = '';
      for (var j = 0; j < depth; j++) prefix += '../';
      return prefix + 'index.html';
    } catch (e) {
      return LOGIN_PATH;
    }
  }

  function redirectToLogin() {
    window.location.href = buildLoginPath();
  }

  function redirectToRoleHome(role) {
    var page = window.location.pathname;

    if (role === 'admin') {
      if (page.indexOf('/admin/') !== -1) return; // already on an admin page
      window.location.href = pagesRelativePrefix() + 'admin/dashboard/dashboard.html';
    } else {
      if (page.indexOf('/field-officer/') !== -1) return; // already on the FO page
      window.location.href = pagesRelativePrefix() + 'field-officer/field-officer.html';
    }
  }

  /**
   * Relative path from this page to just inside `pages/`: "../../" from
   * pages/admin/dashboard/dashboard.html, "../" from pages/field-officer/*.
   */
  function pagesRelativePrefix() {
    try {
      var parts = window.location.pathname.split('/').filter(Boolean);
      var pagesIndex = -1;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === 'pages') { pagesIndex = i; break; }
      }
      if (pagesIndex === -1) return '';
      // -2, not -1: the last segment is the filename, and we must also step out
      // of this file's own directory. Stepping up one time too many produced
      // "../../../field-officer/field-officer.html" and a 404 on every
      // role-based redirect.
      var depth = parts.length - 2 - pagesIndex;
      if (depth < 0) depth = 0;
      var prefix = '';
      for (var j = 0; j < depth; j++) prefix += '../';
      return prefix;
    } catch (e) {
      return '';
    }
  }

  /**
   * Resolve the signed-in auth user, rejecting when Supabase is unreachable and
   * no session is cached. The profile is a separate step.
   */
  function getSessionUser() {
    if (!window.BioSupabase) {
      return Promise.reject(new Error('BioSupabase not loaded'));
    }

    return BioSupabase.getSession().then(function(result) {
      if (result.error) throw result.error;
      var session = result.data && result.data.session;
      if (!session || !session.user) return null; // not logged in
      return session.user;
    }).catch(function(error) {
      // Supabase cannot be reached offline, but BioData keeps the last
      // authenticated session locally so field work can continue.
      var cachedSession = window.BioData && window.BioData.getSession
        ? window.BioData.getSession()
        : null;
      if (cachedSession && cachedSession.email && isOfflineFailure(error)) {
        // Identity only, deliberately with no role (the reason is in getProfile).
        return {
          id: cachedSession.id || cachedSession.email,
          email: cachedSession.email,
          _offlineCached: true
        };
      }
      throw error;
    });
  }

  /**
   * The role as claimed by the signed access token, which the project's custom
   * access token hook puts there. BioSupabase verifies the signature locally
   * before any of it is believed, and that is what makes it safe to trust from
   * a browser: `localStorage` can be edited in devtools, a signed JWT cannot.
   * Nothing here reads a role out of storage.
   * Resolves null whenever the network path should still decide: no `user_role`
   * claim (a token issued before the hook), an explicit null, a failed
   * verification, or a subject mismatch. Callers must fall back, not refuse.
   */
  function profileFromToken(userId, userEmail) {
    if (!window.BioSupabase || typeof window.BioSupabase.getVerifiedClaims !== 'function') {
      return Promise.resolve(null);
    }
    return window.BioSupabase.getVerifiedClaims().then(function(claims) {
      if (!claims) return null;
      var role = claims.user_role;
      if (typeof role !== 'string' || role === '') return null;
      if (userId && claims.sub && String(claims.sub) !== String(userId)) return null;
      // Display fields only come from the local session: they decide nothing.
      // The authoritative role is the claim above, and cloud hydration repaints
      // names in parallel anyway.
      var cachedSession = window.BioData && window.BioData.getSession
        ? window.BioData.getSession()
        : null;
      return {
        id: claims.sub || userId,
        email: claims.email || userEmail || '',
        full_name: (cachedSession && cachedSession.name) || claims.email || userEmail || '',
        role: role,
        institution_name: (cachedSession && cachedSession.institution_name) || '',
        _fromToken: true
      };
    }).catch(function() {
      return null;
    });
  }

  function getProfile(userId, userEmail) {
    if (cachedProfile) return Promise.resolve(cachedProfile);
    return profileFromToken(userId, userEmail).then(function(profile) {
      if (profile) {
        cachedProfile = profile;
        return cachedProfile;
      }
      return profileFromDatabase(userId, userEmail);
    });
  }

  function profileFromDatabase(userId, userEmail) {
    // Shared, cached fetch on BioSupabase: dedupes with data.js's own profile
    // hydration so /profiles isn't hit multiple times per load.
    return BioSupabase.getProfile(userId).then(function(profile) {
      cachedProfile = profile || null;
      return cachedProfile;
    }).catch(function(error) {
      var cachedSession = window.BioData && window.BioData.getSession
        ? window.BioData.getSession()
        : null;
      if (cachedSession && cachedSession.email && isOfflineFailure(error)) {
        if (!cachedProfileMatches(cachedSession, userEmail)) throw error;
        cachedProfile = {
          id: cachedSession.id || cachedSession.email,
          email: cachedSession.email,
          full_name: cachedSession.name || cachedSession.email,
          // Never cachedSession.role: `biodata_session` is localStorage, so
          // anyone with devtools can edit it. Trusting a cached role lets a
          // field officer mount the admin shell offline. Grant exactly
          // OFFLINE_ROLE instead: enough to keep recording in the field, and
          // nothing that needs the cloud. Real enforcement stays server-side
          // (RLS policies + the profiles role-change trigger).
          role: OFFLINE_ROLE,
          institution_name: cachedSession.institution_name || '',
          _offlineCached: true
        };
        return cachedProfile;
      }
      throw error;
    });
  }

  function isOfflineFailure(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    var message = error && error.message ? error.message.toLowerCase() : '';
    return message.indexOf('failed to fetch') !== -1 ||
      message.indexOf('network') !== -1 ||
      message.indexOf('offline') !== -1 ||
      message.indexOf('timeout') !== -1;
  }

  /**
   * Hand the guard's verdict to the data layer, so surfaces that read
   * `BioData.getSession()` show the role this guard verified rather than
   * whatever they could reach alone. Best-effort by design: a display concern
   * must never be able to fail the guard, so failures here are swallowed. The
   * offline marker travels with the profile so the data layer can refuse to
   * adopt the deliberate field-officer downgrade as the person's identity.
   */
  function adoptVerifiedProfile(user, profile) {
    if (!profile || !window.BioData || typeof window.BioData.seedVerifiedProfile !== 'function') return;
    try {
      window.BioData.seedVerifiedProfile({
        id: profile.id || (user && user.id) || '',
        email: profile.email || (user && user.email) || '',
        full_name: profile.full_name || (user && user.email) || '',
        role: profile.role || null,
        institution_name: profile.institution_name || '',
        _offlineCached: profile._offlineCached === true
      });
    } catch (e) { /* display only; the guard's verdict is unaffected */ }
  }

  /**
   * Resolves { user, profile }, or { redirecting: true } after sending the user
   * to login.
   */
  function requireAuthenticated() {
    return getSessionUser().then(function(user) {
      if (!user) {
        redirectToLogin();
        // A sentinel, so callers can short-circuit without chaining errors.
        return { redirecting: true };
      }
      return getProfile(user.id, user.email).then(function(profile) {
        if (!profile) {
          // Authenticated but no profile row: the signup trigger should prevent this.
          redirectToLogin();
          return { redirecting: true };
        }
        adoptVerifiedProfile(user, profile);
        flushFlashOnce();
        return { user: user, profile: profile, redirecting: false };
      });
    });
  }

  /**
   * Requires one of `roles`; a wrong role is bounced to that role's own home.
   */
  function requireRole(roles) {
    var allowed = Array.isArray(roles) ? roles : [roles];
    return requireAuthenticated().then(function(result) {
      if (result.redirecting) return result;
      if (allowed.indexOf(result.profile.role) === -1) {
        // Wrong role: bounce to their home. An offline profile was downgraded on
        // purpose, so say so; a silent bounce would look like a broken page.
        if (result.profile._offlineCached) {
          setFlash('warning',
            'You are offline, so only field-officer access is available. Reconnect to use this page.');
        }
        redirectToRoleHome(result.profile.role);
        return { redirecting: true };
      }
      return result;
    });
  }

  /**
   * Convenience wrapper: runs `onSuccess` only if the guard lets the page through.
   */
  function protect(roles, onSuccess) {
    return requireRole(roles).then(function(result) {
      if (!result.redirecting && typeof onSuccess === 'function') {
        onSuccess(result);
      }
    });
  }

  return {
    requireAuthenticated: requireAuthenticated,
    requireRole: requireRole,
    protect: protect,
    getSessionUser: getSessionUser,
    getProfile: getProfile
  };

})();