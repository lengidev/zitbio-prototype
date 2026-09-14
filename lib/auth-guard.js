/**
 * ZitBIO — Auth Route Guard
 * =========================
 * Shared session guard for protected pages (admin + field officer).
 *
 * Usage:
 *   Include this script AFTER config.js and lib/supabase-client.js on any
 *   protected page, then call:  authGuard.requireRole(['admin'])  or
 *   authGuard.requireAuthenticated()
 *
 * Behaviors:
 *   - No session              → redirect to login page
 *   - Session but no profile  → treat as unauthenticated → login
 *   - Wrong role              → redirect to the role-appropriate home
 *   - Correct role            → resolve, page renders
 */

window.AuthGuard = (function() {
  'use strict';

  // Path used for redirects. Every protected page lives at exactly 3 folder
  // levels: pages/<section>/<page>.html → ../../../index.html reaches root.
  var LOGIN_PATH = '../../../index.html';

  // Cache the resolved profile so parallel guard calls don't hit the DB twice.
  var cachedProfile = null;

  // The least-privileged role in the system. Offline we never grant anything
  // above this — see the offline branch of getProfile() for the reasoning.
  var OFFLINE_ROLE = 'field_officer';

  // One-shot message key. sessionStorage (not localStorage) so it is consumed
  // once, per tab, and never outlives the browsing session.
  var FLASH_KEY = 'biodata_flash';
  var flashFlushed = false;

  /**
   * Queue a one-shot message to render after the next navigation, so a guard
   * redirect explains itself instead of looking like a broken page.
   */
  function setFlash(type, text) {
    try {
      window.sessionStorage.setItem(FLASH_KEY, JSON.stringify({ type: type, text: text }));
    } catch (e) { /* storage unavailable — the redirect still happens */ }
  }

  /**
   * Render any queued flash message (once per page load), then clear it.
   * Reuses the page's own toast helper so the guard introduces no new UI.
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
   * Check the cached session belongs to the email we already authenticated.
   * Compares email rather than id on purpose: `biodata_session` records email
   * (buildSessionFromAuth never stored an id), so comparing a cached email
   * against the JWT's user id would reject every legitimate offline user.
   * A mismatch here means a stale cache belonging to a different person.
   */
  function cachedProfileMatches(cachedSession, userEmail) {
    if (!userEmail || !cachedSession) return true;
    var cachedEmail = cachedSession.email || '';
    if (!cachedEmail) return true;
    return String(cachedEmail) === String(userEmail);
  }

  /**
   * Compute the deepest-folder depth of the current page so we can build a
   * correct relative path to index.html regardless of where the app is hosted
   * (GitHub Pages subpath aware — same logic as redirectToLogin in data.js).
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
      // Fallback: build "../.." repeated depth times
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
      // Navigate to the admin dashboard from the current depth.
      window.location.href = pagesRelativePrefix() + 'admin/dashboard/dashboard.html';
    } else {
      if (page.indexOf('/field-officer/') !== -1) return; // already on the FO page
      // Navigate to the field officer page from the current depth.
      window.location.href = pagesRelativePrefix() + 'field-officer/field-officer.html';
    }
  }

  /**
   * Build a relative path from the current page to just inside the `pages/`
   * directory. e.g. from pages/admin/dashboard/dashboard.html → "../../",
   * from pages/field-officer/field-officer.html → "../".
   */
  function pagesRelativePrefix() {
    try {
      var parts = window.location.pathname.split('/').filter(Boolean);
      var pagesIndex = -1;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === 'pages') { pagesIndex = i; break; }
      }
      if (pagesIndex === -1) return '';
      // Climb from this file's own directory back up to `pages/`, so the
      // caller can append a path relative to `pages/`. The last segment is the
      // filename, so the folder depth below `pages/` is parts.length - 1 -
      // pagesIndex, minus 1 more to step out of this file's directory.
      // (This previously stepped up one time too many, producing e.g.
      // "../../../field-officer/field-officer.html" → a 404 on every
      // role-based redirect.)
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
   * Get the current user's profile (id, email, role) from Supabase.
   * Returns { user, profile } or throws/rejects with a non-JSON Sentinel.
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
        // Identity only, and deliberately no role — see getProfile() for why.
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
   * The role as it appears in the signed access token — the fast path, and the
   * reason changing page no longer costs a Supabase round trip.
   *
   * The role is put there by the project's custom access token hook (see
   * `supabase/migrations/202609140001_custom_access_token_hook.sql`), and the
   * token's signature is verified locally before any of it is believed. That is
   * what makes this safe to trust from a browser: `localStorage` can be edited
   * with devtools, a signed JWT cannot. #40 closed the "trust the stored role"
   * hole, and this does not reopen it — nothing here reads a role out of
   * storage.
   *
   * Resolves `null` for every case the network path should still handle: a
   * token issued before the hook was enabled (no `user_role` claim), an
   * explicit null role, a failed verification, or a token whose subject is not
   * the user being resolved. Callers must fall back, not refuse.
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
      // The display fields come from the local session because they are display
      // only — they decide nothing. The authoritative role is the claim above,
      // and the cloud hydration that repaints names runs in parallel anyway.
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
    // Shared, cached fetch on BioSupabase — dedupes with data.js's own
    // profile hydration so /profiles isn't hit multiple times per load.
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
          // Never cachedSession.role. `biodata_session` lives in localStorage
          // and is editable by anyone with devtools, so trusting a cached role
          // is a privilege-escalation path — a field officer could edit the
          // value to 'admin' and mount the admin shell without a connection.
          // Offline we therefore grant exactly the least-privileged role:
          // enough to keep recording observations in the field, and nothing
          // that needs the cloud. Real enforcement stays server-side
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
   * Hand the verified profile to the data layer so surfaces that read
   * `BioData.getSession()` — the header user dropdown, Settings → Account — show
   * the role this guard *verified* instead of whatever they could reach on their
   * own. Before this, the dropdown painted from a session whose profile had not
   * arrived yet and labelled an admin "Field Officer" (#86).
   *
   * Best-effort by design: a display concern must never be able to fail the
   * guard, so every failure here is swallowed. The offline profile is passed
   * through with its marker so the data layer can refuse to adopt the
   * deliberate field-officer downgrade (#40) as the person's identity.
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
    } catch (e) { /* display only — the guard's verdict is unaffected */ }
  }

  /**
   * Require an authenticated session. Resolves with { user, profile }.
   * Redirects to login if there is no session.
   */
  function requireAuthenticated() {
    return getSessionUser().then(function(user) {
      if (!user) {
        redirectToLogin();
        // Resolve with a sentinel so callers can short-circuit without chaining errors.
        return { redirecting: true };
      }
      return getProfile(user.id, user.email).then(function(profile) {
        if (!profile) {
          // Authenticated but no profile row (shouldn't happen — trigger creates one)
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
   * Require a specific role (or array of roles). Redirects to login if no
   * session, or to the role-appropriate home if the role doesn't match.
   */
  function requireRole(roles) {
    var allowed = Array.isArray(roles) ? roles : [roles];
    return requireAuthenticated().then(function(result) {
      if (result.redirecting) return result;
      if (allowed.indexOf(result.profile.role) === -1) {
        // Authenticated but wrong role — bounce to their home. If the profile
        // came from the offline cache it was downgraded on purpose, so say so:
        // a silent bounce would just look like a broken page.
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
   * Convenience: wait for the guard to resolve before running page init.
   * Usage: AuthGuard.requireRole(['admin']).then(initPage);
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