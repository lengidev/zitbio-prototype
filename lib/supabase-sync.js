/**
 * ZitBIO — Supabase Sync Layer (Phase 4)
 * =====================================
 * Bridges the synchronous BioData in-memory cache to the Supabase backend.
 *
 * Why this exists:
 *   - Every page reads via BioData.getObservations()/getUsers() (synchronous).
 *   - Supabase is asynchronous (network), so we cannot make the pages async
 *     without large churn.
 *
 * How it works:
 *   1. On page load, `loadFromCloud()` fetches observations + profiles from
 *      Supabase, maps them into the legacy BioData shapes, and seeds the cache
 *      via `BioData.seedData(...)`. Pages then render exactly as before.
 *   2. New observations are pushed to Supabase automatically by subscribing to
 *      BioData's `observation:created` event (same pattern as
 *      notification-service.js).
 *   3. Admin updates (approve/flag/edit/delete) call the explicit helpers
 *      below from the observations page.
 *
 * If Supabase is unavailable or the user is not logged in, the app degrades
 * gracefully to the local cache (offline-first behaviour preserved).
 */

window.BioSync = (function() {
  'use strict';

  var LOADED_KEY = 'biodata_cloud_loaded_v1';

  // ─────────────────────────────────────────────
  //  Mapping helpers — Supabase row → BioData shape
  // ─────────────────────────────────────────────

  // observations table (flat columns) → legacy nested object
  function mapObservation(row) {
    return {
      observation_id: row.observation_id,
      count: row.count,
      verification_status: row.verification_status,
      source: row.source || 'field_observation',
      species_details: {
        scientific_name: row.scientific_name || '',
        common_name: row.common_name || ''
      },
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        country: row.country || 'Zambia',
        administrative_area: row.administrative_area || '',
        city: row.city || '',
        focus_area: row.focus_area || null,
        habitat_type: row.habitat_type || '',
        locality_description: row.locality_description || ''
      },
      recorded_by: row.recorded_by || '',
      timestamp: row.timestamp || '',
      institution_name: row.institution_name || 'The Copperbelt University',
      activity: row.activity || '',
      field_notes: row.field_notes || '',
      user_id: row.user_id || null
    };
  }

  // Legacy BioData shape → observations table row (flat columns)
  function toObservationRow(obs) {
    var sd = obs.species_details || {};
    var loc = obs.location || {};
    return {
      observation_id: obs.observation_id,
      count: obs.count || 0,
      verification_status: obs.verification_status || 'Pending',
      source: obs.source || 'field_observation',
      scientific_name: sd.scientific_name || '',
      common_name: sd.common_name || '',
      latitude: loc.latitude != null ? loc.latitude : null,
      longitude: loc.longitude != null ? loc.longitude : null,
      country: loc.country || 'Zambia',
      administrative_area: loc.administrative_area || '',
      city: loc.city || '',
      focus_area: loc.focus_area || null,
      habitat_type: loc.habitat_type || '',
      locality_description: loc.locality_description || '',
      recorded_by: obs.recorded_by || '',
      timestamp: obs.timestamp || new Date().toISOString(),
      institution_name: obs.institution_name || 'The Copperbelt University',
      activity: obs.activity || '',
      field_notes: obs.field_notes || ''
    };
  }

  // profiles table row → legacy BioData user shape
  function mapProfile(row) {
    var created = row.created_at ? new Date(row.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) : '';
    return {
      id: row.id, // legacy pages use a numeric id for account display; we keep the uuid string and adapt display
      name: row.full_name || row.email || '',
      email: row.email || '',
      role: row.role || 'field_officer',
      institution_name: row.institution_name || '',
      created: created,
      lastLogin: row.last_login
    };
  }

  // ─────────────────────────────────────────────
  //  Cloud loaders
  // ─────────────────────────────────────────────

  function ensureReady() {
    if (!window.BioSupabase || !window.BioSupabase.isConfigured()) {
      return Promise.reject(new Error('Supabase not configured'));
    }
    return window.BioSupabase.ready();
  }

  /**
   * Fetch all observations + profiles from Supabase and seed the BioData
   * cache. Safe to call multiple times (idempotent at DB level).
   */
  function loadFromCloud() {
    return ensureReady().then(function(client) {
      // Only fetch if we have an authenticated session (RLS protects reads of observations).
      return window.BioSupabase.getSession().then(function(sessionResult) {
        if (sessionResult.error) throw sessionResult.error;
        var session = sessionResult.data && sessionResult.data.session;

        var observationsPromise = client.from('observations')
          .select('*')
          .order('timestamp', { ascending: false });

        // Profiles: if logged in, fetch visible profiles (own + all for admins).
        var profilesPromise = session
          ? client.from('profiles').select('id, email, full_name, role, institution_name, created_at, last_login')
          : Promise.resolve({ data: [], error: null });

        return Promise.all([observationsPromise, profilesPromise]);
      }).then(function(results) {
        var obsResult = results[0];
        var profResult = results[1];

        if (obsResult.error) throw obsResult.error;
        if (profResult.error) throw profResult.error;

        var cloudObservations = (obsResult.data || []).map(mapObservation);
        var cloudUsers = (profResult.data || []).map(mapProfile);

        if (window.BioData && window.BioData.seedData) {
          window.BioData.seedData(cloudUsers, cloudObservations);
        }

        // Notify pages that the authoritative cloud data has been seeded so
        // they can re-render tables/charts (handled centrally in admin-layout).
        if (typeof window !== 'undefined') {
          try { window.dispatchEvent(new window.CustomEvent('biodata:synced')); } catch (e) { /* ignore */ }
        }

        try { localStorage.setItem(LOADED_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        return { observations: cloudObservations, users: cloudUsers };
      });
    });
  }

  // ─────────────────────────────────────────────
  //  Write-through helpers
  // ─────────────────────────────────────────────

  /**
   * Insert (or update) an observation in Supabase. Idempotent by
   * observation_id via upsert.
   */
  function pushObservation(obs) {
    if (!obs || !obs.observation_id) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      var row = toObservationRow(obs);
      // Attach the current user id so the record is attributable.
      return window.BioSupabase.getUser().then(function(userResult) {
        if (userResult.data && userResult.data.user) {
          row.user_id = userResult.data.user.id;
        }
        return client.from('observations').upsert(row, { onConflict: 'observation_id' });
      });
    });
  }

  /**
   * Update observation fields in Supabase by observation_id.
   */
  function updateObservation(observationId, updates) {
    if (!observationId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      var patch = {};
      if (updates.count != null) patch.count = updates.count;
      if (updates.verification_status != null) patch.verification_status = updates.verification_status;
      if (updates.activity != null) patch.activity = updates.activity;
      if (updates.timestamp != null) patch.timestamp = updates.timestamp;
      if (updates.field_notes != null) patch.field_notes = updates.field_notes;
      if (updates.source != null) patch.source = updates.source;

      if (updates.species_details) {
        if (updates.species_details.common_name != null) patch.common_name = updates.species_details.common_name;
        if (updates.species_details.scientific_name != null) patch.scientific_name = updates.species_details.scientific_name;
      }
      if (updates.location) {
        var loc = updates.location;
        if (loc.latitude != null) patch.latitude = loc.latitude;
        if (loc.longitude != null) patch.longitude = loc.longitude;
        if (loc.country != null) patch.country = loc.country;
        if (loc.administrative_area != null) patch.administrative_area = loc.administrative_area;
        if (loc.city != null) patch.city = loc.city;
        if (loc.focus_area != null) patch.focus_area = loc.focus_area;
        if (loc.habitat_type != null) patch.habitat_type = loc.habitat_type;
        if (loc.locality_description != null) patch.locality_description = loc.locality_description;
      }

      return client.from('observations').update(patch).eq('observation_id', observationId);
    });
  }

  /**
   * Delete an observation from Supabase by observation_id.
   */
  function deleteObservation(observationId) {
    if (!observationId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('observations').delete().eq('observation_id', observationId);
    });
  }

  // ─────────────────────────────────────────────
  //  Admin user management (cloud-backed)
  //  Calls the `admin-users` Edge Function with the caller's JWT so real
  //  Supabase Auth users can be created/updated/deleted server-side.
  //  The function holds the service_role key; the browser never does.
  //  Falls back to a descriptive error if the function URL is not configured
  //  (the app then still works as a read-only view of profiles).
  // ─────────────────────────────────────────────

  // Base URL of the deployed edge function. Override via BioSync.setAdminUsersUrl
  // or by editing config.js (see config.example.js).
  var ADMIN_USERS_URL =
    (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.adminUsersUrl) ||
    '';

  function setAdminUsersUrl(url) {
    ADMIN_USERS_URL = url;
  }

  function getAdminUsersUrl() {
    return ADMIN_USERS_URL;
  }

  /**
   * POST an action to the admin-users Edge Function with the caller's JWT.
   * @param {string} action  'create' | 'update' | 'delete'
   * @param {object} payload  extra fields (email, password, full_name, role, id, ...)
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  function adminUsers(action, payload) {
    if (!ADMIN_USERS_URL) {
      return Promise.reject(new Error('admin-users function not deployed. Set SUPABASE_CONFIG.adminUsersUrl.'));
    }
    return ensureReady()
      .then(function() {
        return window.BioSupabase.getSession();
      })
      .then(function(sessionResult) {
        if (sessionResult.error) throw sessionResult.error;
        var session = sessionResult.data && sessionResult.data.session;
        if (!session || !session.access_token) {
          throw new Error('Not signed in.');
        }
        return fetch(ADMIN_USERS_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + session.access_token
          },
          body: JSON.stringify(Object.assign({ action: action }, payload || {}))
        });
      })
      .then(function(resp) {
        return resp.json().catch(function() { return {}; }).then(function(body) {
          if (!resp.ok) {
            throw new Error((body && body.error) || ('Request failed (' + resp.status + ')'));
          }
          return { ok: true, body: body };
        });
      })
      .catch(function(err) {
        // Network-level failures (e.g. function not deployed) surface the
        // browser's generic "Failed to fetch" — rethrow a clear message.
        if (!err || !err.message || err.message === 'Failed to fetch') {
          throw new Error('Could not reach the admin-users function. It may not be deployed yet — deploy supabase/functions/admin-users and try again.');
        }
        throw err;
      });
  }

  // ─────────────────────────────────────────────
  //  Cloud notifications (replaces localStorage seeds)
  //  Loads the current user's notifications from the DB and provides a
  //  postgres_changes realtime subscription so the bell updates live.
  // ─────────────────────────────────────────────

  // In-memory cache of cloud notification rows (legacy shape, newest first).
  var cloudNotifications = [];
  var realtimeChannel = null;

  // Map notifications row → legacy BioData notification shape.
  function mapNotification(row) {
    return {
      id: row.id,
      type: row.type || 'pending_observation',
      title: row.title || '',
      message: row.message || '',
      link: row.link || null,
      related_id: row.related_id || null,
      created_at: row.created_at || new Date().toISOString(),
      read: row.read === true
    };
  }

  /**
   * Fetch the current user's notifications from the DB (newest first),
   * cache them, and dispatch a `biodata:notifications` event so the
   * admin bell can re-render.
   */
  function loadNotifications() {
    return ensureReady().then(function(client) {
      return client.from('notifications')
        .select('*')
        .order('created_at', { ascending: false });
    }).then(function(result) {
      if (result.error) throw result.error;
      cloudNotifications = (result.data || []).map(mapNotification);
      if (typeof window !== 'undefined') {
        try { window.dispatchEvent(new window.CustomEvent('biodata:notifications')); }
        catch (e) { /* ignore */ }
      }
      return cloudNotifications.slice();
    });
  }

  function getNotificationsCache() {
    return cloudNotifications.slice();
  }

  /**
   * Subscribe to live INSERT/UPDATE/DELETE on the notifications table for
   * the current user. On each change we re-fetch and dispatch the event.
   * Returns an unsubscribe function. Idempotent — removes any existing
   * subscription first.
   */
  function registerNotificationRealtime() {
    if (!window.BioSupabase || !window.BioSupabase.isConfigured()) return function() {};

    return window.BioSupabase.ready().then(function(client) {
      if (realtimeChannel) {
        client.removeChannel(realtimeChannel);
        realtimeChannel = null;
      }
      realtimeChannel = client
        .channel('notifications-live')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          function() {
            loadNotifications().catch(function(err) {
              console.warn('BioSync: realtime notification refresh failed:', err && err.message);
            });
          }
        )
        .subscribe();
      return function() { if (realtimeChannel) client.removeChannel(realtimeChannel); };
    });
  }

  /** Mark a single notification read in the DB, then refresh. */
  function markNotificationRead(id) {
    return ensureReady().then(function(client) {
      return client.from('notifications').update({ read: true }).eq('id', id);
    }).then(function(result) {
      if (result.error) throw result.error;
      return loadNotifications();
    });
  }

  /** Mark all current user's notifications read in the DB, then refresh. */
  function markAllNotificationsRead() {
    return ensureReady().then(function(client) {
      return client.from('notifications').update({ read: true }).filter('read', 'eq', false);
    }).then(function(result) {
      if (result.error) throw result.error;
      return loadNotifications();
    });
  }

  /** Delete all current user's notifications in the DB, then refresh. (RLS scopes to the current user.) */
  function clearNotifications() {
    return ensureReady().then(function(client) {
      return client.from('notifications').delete();
    }).then(function(result) {
      if (result.error) throw result.error;
      return loadNotifications();
    });
  }

  /** Read system_meta rows (Settings page live data). */
  function getSystemMeta() {
    return ensureReady().then(function(client) {
      return client.from('system_meta').select('key, value');
    }).then(function(result) {
      if (result.error) throw result.error;
      return (result.data || []).reduce(function(acc, row) {
        acc[row.key] = row.value;
        return acc;
      }, {});
    });
  }

  // ─────────────────────────────────────────────
  //  Auto-push on observation creation
  //  Subscribes to BioData's event bus (same pattern as NotificationService)
  //  so any observation created anywhere is mirrored to Supabase.
  // ─────────────────────────────────────────────
  function registerAutoPush() {
    if (!window.BioData || !window.BioData.eventNames || !window.BioData.subscribe) return;
    window.BioData.subscribe(window.BioData.eventNames.OBSERVATION_CREATED, function(obs) {
      pushObservation(obs).catch(function(err) {
        // Non-fatal — the record still exists in local cache.
        console.warn('BioSync: failed to push observation to Supabase:', err && err.message);
      });
    });
  }

  // ─────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────

  return {
    loadFromCloud: loadFromCloud,
    pushObservation: pushObservation,
    updateObservation: updateObservation,
    deleteObservation: deleteObservation,
    registerAutoPush: registerAutoPush,
    adminUsers: adminUsers,
    setAdminUsersUrl: setAdminUsersUrl,
    getAdminUsersUrl: getAdminUsersUrl,
    loadNotifications: loadNotifications,
    getNotificationsCache: getNotificationsCache,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    clearNotifications: clearNotifications,
    registerNotificationRealtime: registerNotificationRealtime,
    getSystemMeta: getSystemMeta
  };

})();

// Self-register the auto-push listener once this script loads (data.js must
// load first, which it does on every page).
if (window.BioSync && window.BioSync.registerAutoPush) {
  window.BioSync.registerAutoPush();
}