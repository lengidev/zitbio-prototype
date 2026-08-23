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
      // depth = segments after 'pages' (excluding the filename itself is not a
      // concern here — the filename is after the folder segments we care about).
      var depth = parts.length - 1 - pagesIndex;
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
        return {
          id: cachedSession.id || cachedSession.email,
          email: cachedSession.email,
          _offlineCached: true
        };
      }
      throw error;
    });
  }

  function getProfile(userId) {
    if (cachedProfile) return Promise.resolve(cachedProfile);
    return BioSupabase.ready().then(function(client) {
      return client.from('profiles').select('id, email, full_name, role, institution_name').eq('id', userId).maybeSingle();
    }).then(function(result) {
      if (result.error) throw result.error;
      cachedProfile = result.data || null;
      return cachedProfile;
    }).catch(function(error) {
      var cachedSession = window.BioData && window.BioData.getSession
        ? window.BioData.getSession()
        : null;
      if (cachedSession && cachedSession.email && isOfflineFailure(error)) {
        cachedProfile = {
          id: cachedSession.id || cachedSession.email,
          email: cachedSession.email,
          full_name: cachedSession.name || cachedSession.email,
          role: cachedSession.role || 'field_officer',
          institution_name: cachedSession.institution_name || ''
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
      return getProfile(user.id).then(function(profile) {
        if (!profile) {
          // Authenticated but no profile row (shouldn't happen — trigger creates one)
          redirectToLogin();
          return { redirecting: true };
        }
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
        // Authenticated but wrong role — bounce to their home.
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