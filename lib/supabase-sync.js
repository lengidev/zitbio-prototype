/* Sync layer between BioData and Supabase: cloud reads seed the local cache and
   writes go back through the helpers below; with Supabase unavailable or the user
   signed out, the app degrades to that cache (offline-first). */

window.BioSync = (function() {
  'use strict';

  var LOADED_KEY = 'biodata_cloud_loaded_v1';

  // Mapping helpers: Supabase row → BioData shape

  // observations table (flat columns) → legacy nested object
  function mapObservation(row) {
    var obs = {
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
      user_id: row.user_id || null,
      // Keep the identity columns: dropping them here leaves the client with no
      // stored id, so species and site get re-derived from display names.
      species_id: row.species_id || null,
      site_id: row.site_id || null,
      // Which walk this belongs to, and what the record claims to be. Added to
      // BOTH mapping functions at once, because a field carried in only one of
      // them is silently dropped, which is how species_id was once lost.
      survey_id: row.survey_id || null,
      zone_id: row.zone_id || null,
      abundance_kind: row.abundance_kind || 'individuals',
      detection: row.detection || 'present',
      juveniles: row.juveniles == null ? null : row.juveniles,
      identification_confidence: row.identification_confidence || null,
      provenance: row.provenance || null
    };
    // Strip GBIF authorship from scientific names + fill common names.
    if (window.BioData && typeof window.BioData.normalizeObservation === 'function') {
      obs = window.BioData.normalizeObservation(obs) || obs;
    }
    return obs;
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
      field_notes: obs.field_notes || '',
      // Write the identity columns through: otherwise they are only ever set by
      // the backfill migration, and new records land with both ids NULL.
      species_id: obs.species_id || null,
      site_id: obs.site_id || null,
      survey_id: obs.survey_id || null,
      zone_id: obs.zone_id || null,
      abundance_kind: obs.abundance_kind || 'individuals',
      // A missing `detection` means a row written before the column existed, and
      // every one of those was a count above zero, so `present` is the honest
      // default rather than a guess.
      detection: obs.detection || 'present',
      juveniles: obs.juveniles == null ? null : obs.juveniles,
      identification_confidence: obs.identification_confidence || null,
      provenance: obs.provenance || null
    };
  }

  // profiles table row → legacy BioData user shape
  function mapProfile(row) {
      // Route through BioDate when it is loaded: the login page, which also
      // loads supabase-sync, does not load lib/date.js. Medium style, not numeric,
      // because "8/24/2026" is ambiguous to a DD/MM reader and contradicted the
      // observations table one click away.
      var created = row.created_at
        ? (window.BioDate
            ? window.BioDate.mediumDate(row.created_at)
            : new Date(row.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
        : '';
    return {
      id: row.id, // legacy pages use a numeric id for account display; we keep the uuid string and adapt display
      name: row.full_name || row.email || '',
      email: row.email || '',
      role: row.role || 'field_officer',
      institution_name: row.institution_name || '',
      created: created,
      lastLogin: row.last_login,
      // Absent means active: rows predating the column have no value and must
      // not be treated as deactivated.
      active: row.active !== false,
      deactivatedAt: row.deactivated_at || null
    };
  }

  function ensureReady() {
    if (!window.BioSupabase || !window.BioSupabase.isConfigured()) {
      return Promise.reject(new Error('Supabase not configured'));
    }
    return window.BioSupabase.ready();
  }

  /**
   * Status events drive the sidebar footer, so they must never be able to break a
   * read, and the footer must never sit on "Syncing" once the read has settled.
   */
  function announce(name) {
    if (typeof window === 'undefined' || !window.dispatchEvent) return;
    try { window.dispatchEvent(new window.CustomEvent(name)); } catch (e) { /* ignore */ }
  }

  /** Fetch observations + profiles and seed the BioData cache. Safe to re-run. */
  function loadFromCloud() {
    announce('biodata:syncing');

    return ensureReady().then(function(client) {
      // Only fetch if we have an authenticated session (RLS protects reads of observations).
      return window.BioSupabase.getSession().then(function(sessionResult) {
        if (sessionResult.error) throw sessionResult.error;
        var session = sessionResult.data && sessionResult.data.session;

        // Exclude archived rows in the query rather than filtering later, so a
        // soft-deleted record cannot leak back into any view.
        var observationsPromise = client.from('observations')
          .select('*')
          .is('deleted_at', null)
          .order('timestamp', { ascending: false });

        // Profiles: if logged in, fetch visible profiles (own + all for admins).
        var profilesPromise = session
          ? client.from('profiles').select('id, email, full_name, role, institution_name, created_at, last_login, active, deactivated_at')
          : Promise.resolve({ data: [], error: null });

        return Promise.all([observationsPromise, profilesPromise]);
      }).then(function(results) {
        var obsResult = results[0];
        var profResult = results[1];

        if (obsResult.error) throw obsResult.error;
        if (profResult.error) throw profResult.error;

        var cloudObservations = (obsResult.data || []).map(mapObservation);
        var cloudUsers = (profResult.data || []).map(mapProfile);

        // Nothing delivered at all: an unsigned-in read is filtered by RLS and comes
        // back empty rather than failing. Reporting this as a successful sync is how
        // an admin ends up looking at the local fallback believing it is the dataset,
        // so it takes the error path and the footer says what it is.
        if (cloudObservations.length === 0 && cloudUsers.length === 0) {
          throw new Error('Cloud read returned no rows');
        }

        if (window.BioData && window.BioData.seedData) {
          window.BioData.seedData(cloudUsers, cloudObservations);
        }

        // Seeded cloud data is authoritative; the listener that re-renders
        // tables and charts lives in admin-layout.
        announce('biodata:synced');

        try { localStorage.setItem(LOADED_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        return { observations: cloudObservations, users: cloudUsers };
      });
    }).catch(function(error) {
      announce('biodata:sync-error');
      throw error;
    });
  }

  /** Upsert by observation_id: re-pushing the same observation is idempotent. */
  function pushObservation(obs) {
    if (!obs || !obs.observation_id) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      var row = toObservationRow(obs);
      // Shared getCurrentUserId reads the local session; no /auth/v1/user trip.
      return getCurrentUserId(client).then(function(uid) {
        if (uid) {
          row.user_id = uid;
        }
        return client.from('observations').upsert(row, { onConflict: 'observation_id' });
      });
    });
  }

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
   * Goes through the `review_observation` RPC, never a direct column update: the
   * audit row is written by an AFTER trigger that only sees the reason if it
   * lands in the same transaction, so a direct update would change the status and
   * leave `observation_reviews` empty. The RPC is not `security definer`, so the
   * admin-only RLS policy on `observations` still authorises the decision.
   */
  function reviewObservation(observationId, toStatus, reason) {
    if (!observationId || !toStatus) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.rpc('review_observation', {
        p_observation_id: observationId,
        p_to_status: toStatus,
        p_reason: reason || null
      });
    });
  }

  /**
   * Soft delete: sets `deleted_at` instead of issuing a DELETE, so a mis-click
   * destroys nothing and the row keeps its identity, review history and audit
   * trail. `deleted_by` records who archived it.
   */
  function deleteObservation(observationId) {
    if (!observationId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return getCurrentUserId(client).then(function(uid) {
        return client.from('observations')
          .update({ deleted_at: new Date().toISOString(), deleted_by: uid })
          .eq('observation_id', observationId);
      });
    });
  }

  /** Restore an archived observation. */
  function restoreObservation(observationId) {
    if (!observationId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('observations')
        .update({ deleted_at: null, deleted_by: null })
        .eq('observation_id', observationId);
    });
  }

  /** Archived rows, most recently deleted first. */
  function loadArchivedObservations() {
    return ensureReady().then(function(client) {
      return client.from('observations')
        .select('observation_id, scientific_name, common_name, focus_area, recorded_by, timestamp, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
    });
  }

  /**
   * Append-only decision log. The table is SELECT-only by design, so reading is
   * the only interaction the client ever has with it.
   */
  function getObservationReviews(observationId) {
    if (!observationId) return Promise.resolve({ data: [], error: null });
    return ensureReady().then(function(client) {
      return client.from('observation_reviews')
        .select('from_status, to_status, reason, actor_name, created_at')
        .eq('observation_id', observationId)
        .order('created_at', { ascending: false });
    });
  }

  // Admin user management (cloud-backed)
  // Calls the `admin-users` Edge Function with the caller's JWT: Auth users must
  // be managed server-side, where the service_role key lives. With no function
  // URL configured it rejects with a clear error and the app stays read-only.

  // Override via BioSync.setAdminUsersUrl or SUPABASE_CONFIG.adminUsersUrl.
  var ADMIN_USERS_URL =
    (typeof window !== 'undefined' && window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.adminUsersUrl) ||
    '';

  function setAdminUsersUrl(url) {
    ADMIN_USERS_URL = url;
  }

  function getAdminUsersUrl() {
    return ADMIN_USERS_URL;
  }

  /** POST an action to the admin-users Edge Function with the caller's JWT. */
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
        // An undeployed function surfaces only as the browser's generic
        // "Failed to fetch", so rethrow something actionable instead.
        if (!err || !err.message || err.message === 'Failed to fetch') {
          throw new Error('Could not reach the admin-users function. It may not be deployed yet — deploy supabase/functions/admin-users and try again.');
        }
        throw err;
      });
  }

  // Cloud notifications (replaces localStorage seeds)
  // Loads the current user's rows and keeps them live via a postgres_changes
  // realtime subscription so the bell updates without a reload.

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

  // Current authenticated user id, resolved once per page from the LOCAL
  // session: /auth/v1/user was a network round trip for an id the persisted
  // session already carries.
  var currentUserId = null;
  function getCurrentUserId(client) {
    if (currentUserId) return Promise.resolve(currentUserId);
    return window.BioSupabase.getSession().then(function(res) {
      var session = res && res.data && res.data.session;
      if (session && session.user) currentUserId = session.user.id;
      return currentUserId;
    }).catch(function() { return null; });
  }

  function loadNotifications() {
    return ensureReady().then(function(client) {
      return getCurrentUserId(client).then(function(uid) {
        var q = client.from('notifications').select('*');
        if (uid) q = q.eq('user_id', uid);
        return q.order('created_at', { ascending: false });
      });
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
   * Re-fetches and dispatches `biodata:notifications` on any
   * INSERT/UPDATE/DELETE so the admin bell follows the DB. Returns an
   * unsubscribe function; idempotent, so it clears any existing subscription.
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

  function markNotificationRead(id) {
    return ensureReady().then(function(client) {
      return client.from('notifications').update({ read: true }).eq('id', id);
    }).then(function(result) {
      if (result.error) throw result.error;
      return loadNotifications();
    });
  }

  function markAllNotificationsRead() {
    return ensureReady().then(function(client) {
      return client.from('notifications').update({ read: true }).filter('read', 'eq', false);
    }).then(function(result) {
      if (result.error) throw result.error;
      return loadNotifications();
    });
  }

  function clearNotifications() {
    return ensureReady().then(function(client) {
      return getCurrentUserId(client).then(function(uid) {
        var q = client.from('notifications').delete();
        if (uid) q = q.eq('user_id', uid);
        return q;
      });
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

  // Analytics registries (species_registry + sites)
  // Cloud to cache on load; admin baseline writes go the other way, under
  // admin-only RLS.

  function loadRegistries() {
    return ensureReady().then(function(client) {
      return Promise.all([
        client.from('species_registry').select('*').order('id'),
        client.from('sites').select('*').order('id')
      ]);
    }).then(function(results) {
      var speciesResult = results[0];
      var sitesResult = results[1];
      if (speciesResult.error) throw speciesResult.error;
      if (sitesResult.error) throw sitesResult.error;
      if (speciesResult.data && speciesResult.data.length > 0 && window.BioData && window.BioData.seedRegistries) {
        window.BioData.seedRegistries(speciesResult.data, sitesResult.data || []);
      }
      return {
        speciesRegistry: speciesResult.data || [],
        sites: sitesResult.data || []
      };
    });
  }

  // The survey plane: surveys, their zones and the four reading tables. These
  // were write-only, so three of the four survey types recorded successfully and
  // could not be seen anywhere. This is the read side of `submitSurvey` below.
  function loadSurveyPlane() {
    return ensureReady().then(function(client) {
      return Promise.all([
        client.from('surveys').select('*').order('started_at', { ascending: false }),
        client.from('survey_zones').select('*'),
        client.from('vegetation_readings').select('*'),
        client.from('water_readings').select('*'),
        client.from('soil_readings').select('*'),
        client.from('vegetation_species').select('*')
      ]);
    }).then(function(results) {
      results.forEach(function(result) {
        if (result.error) throw result.error;
      });
      var plane = {
        surveys: results[0].data || [],
        zones: results[1].data || [],
        vegetation: results[2].data || [],
        water: results[3].data || [],
        soil: results[4].data || [],
        sward: results[5].data || []
      };
      if (window.BioData && window.BioData.seedSurveyPlane) {
        window.BioData.seedSurveyPlane(plane);
      }
      return plane;
    });
  }

  // The Sourced Register: the vocabulary, the values and the relationships. Read
  // only from here; the editor writes under admin RLS.
  function loadRegister() {
    return ensureReady().then(function(client) {
      return Promise.all([
        client.from('parameters').select('*').order('key'),
        client.from('parameter_values').select('*'),
        client.from('species_relationships').select('*')
      ]);
    }).then(function(results) {
      results.forEach(function(result) {
        if (result.error) throw result.error;
      });
      var register = {
        parameters: results[0].data || [],
        values: results[1].data || [],
        relationships: results[2].data || []
      };
      if (window.BioData && window.BioData.seedRegister) {
        window.BioData.seedRegister(register);
      }
      return register;
    });
  }

  /**
   * Per-site baseline override: a read-modify-write of the `baseline_by_site`
   * jsonb map, because PostgREST cannot patch a single key of a jsonb column.
   */
  function updateSiteBaselineOverrideCloud(speciesId, siteId, value) {
    if (!speciesId || !siteId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('species_registry')
        .select('baseline_by_site')
        .eq('id', speciesId)
        .maybeSingle()
        .then(function(res) {
          if (res.error) throw res.error;
          var map = (res.data && res.data.baseline_by_site) || {};
          if (value === null || value === undefined || value === '') {
            delete map[siteId];
          } else {
            map[siteId] = Math.max(0, parseInt(value, 10) || 0);
          }
          return client.from('species_registry')
            .update({ baseline_by_site: map, baseline_updated_at: new Date().toISOString() })
            .eq('id', speciesId);
        });
    });
  }

  /**
   * Writes the whole per-site map in one call. A per-key read-modify-write races:
   * two concurrent saves read the same map and the second write clobbers the
   * first, so the UI builds the complete map from its inputs and writes it once.
   */
  function updateSiteBaselineMapCloud(speciesId, map) {
    if (!speciesId) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('species_registry')
        .update({ baseline_by_site: map || {}, baseline_updated_at: new Date().toISOString() })
        .eq('id', speciesId);
    });
  }

  function updateSpeciesBaselineCloud(speciesId, value) {
    return ensureReady().then(function(client) {
      return client.from('species_registry').update({
        baseline_count: value == null ? null : parseInt(value, 10) || 0,
        baseline_updated_at: new Date().toISOString()
      }).eq('id', speciesId);
    }).then(function(result) {
      if (result.error) throw result.error;
      return result.data || [];
    });
  }
  // Auto-push on observation creation
  // Subscribes to BioData's event bus so an observation created anywhere is
  // mirrored to Supabase.
  function registerAutoPush() {
    if (!window.BioData || !window.BioData.eventNames || !window.BioData.subscribe) return;
    window.BioData.subscribe(window.BioData.eventNames.OBSERVATION_CREATED, function(obs) {
      pushObservation(obs).catch(function(err) {
        // Non-fatal: the record still exists in the local cache.
        console.warn('BioSync: failed to push observation to Supabase:', err && err.message);
      });
    });
  }

  /**
   * The login page's "Request Access" form. Read-only: approval is automatic, so
   * this records who joined rather than queuing work to action. The
   * access_requests_admin_read policy gives admins the rows, and everyone else an
   * empty list.
   *
   * `dismissed_at` only exists once 202609160001 is applied, and naming a missing
   * column fails the whole query, so the first failure retries without it and every
   * row then counts as not dismissed.
   */
  function loadAccessRequests() {
    var columns = 'id, email, full_name, institution, status, requested_at';

    function query(client, withDismissed) {
      return client
        .from('access_requests')
        .select(withDismissed ? columns + ', dismissed_at' : columns)
        .order('requested_at', { ascending: false })
        .limit(50);
    }

    return ensureReady().then(function(client) {
      return query(client, true).then(function(res) {
        if (!res || !res.error) return res;
        return query(client, false);
      });
    });
  }

  /**
   * Clear requests from the Users list. The row is kept as the audit trail; only
   * the dismissal stamp is written, by a function that checks the caller is an
   * admin rather than trusting this side to have checked.
   */
  function dismissAccessRequests(ids) {
    return ensureReady().then(function(client) {
      return client.rpc('dismiss_access_requests', { p_ids: ids });
    });
  }

  // Survey writes. A survey is the parent of everything else a walk produces, so
  // its database id has to exist before any child row can name it. That ordering
  // is why one function owns the sequence instead of four callers doing it by
  // hand and getting it wrong.

  /** Upsert by `survey_id` and return the database id the children need. */
  function pushSurvey(row) {
    if (!row || !row.survey_id) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return getCurrentUserId(client).then(function(uid) {
        if (uid) row.user_id = uid;
        return client.from('surveys')
          .upsert(row, { onConflict: 'survey_id' })
          .select('id, survey_id')
          .single();
      });
    }).then(function(result) {
      if (result.error) throw result.error;
      return result.data;
    });
  }

  function pushSurveyZones(surveyDbId, zoneRows) {
    if (!surveyDbId || !zoneRows || !zoneRows.length) return Promise.resolve(null);
    var rows = zoneRows.map(function(zone) {
      return {
        survey_id: surveyDbId,
        zone_id: zone.zone_id,
        zone_source: zone.zone_source || 'manual',
        note: zone.note
      };
    });
    return ensureReady().then(function(client) {
      return client.from('survey_zones').upsert(rows, { onConflict: 'survey_id,zone_id' });
    });
  }

  function pushObservations(rows) {
    if (!rows || !rows.length) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('observations').upsert(rows, { onConflict: 'observation_id' });
    });
  }

  // One table per reading type, chosen by the survey, because the composite
  // foreign key on (survey_id, survey_type) refuses a reading filed against the
  // wrong kind of walk.
  var READING_TABLES = {
    vegetation: 'vegetation_readings',
    water_quality: 'water_readings',
    soil_condition: 'soil_readings'
  };

  function pushReading(surveyType, rows) {
    var table = READING_TABLES[surveyType];
    if (!table || !rows || !rows.length) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from(table).upsert(rows, { onConflict: 'survey_id,zone_id' });
    });
  }

  function pushSwardSpecies(rows) {
    if (!rows || !rows.length) return Promise.resolve(null);
    return ensureReady().then(function(client) {
      return client.from('vegetation_species')
        .upsert(rows, { onConflict: 'survey_id,zone_id,species_id' });
    });
  }

  /**
   * Everything one walk produced, in dependency order. `rows` come from
   * `lib/survey.js`, so the counting and absence rules are already applied; this
   * only moves them and attaches the parent id.
   */
  function submitSurvey(payload) {
    payload = payload || {};
    var surveyRow = payload.surveyRow;
    if (!surveyRow || !surveyRow.survey_id) {
      return Promise.reject(new Error('A survey needs a survey_id before it can be written'));
    }

    var written = { survey: null, zones: null, observations: null, reading: null, sward: null };

    return pushSurvey(surveyRow).then(function(saved) {
      written.survey = saved;
      var surveyDbId = saved && saved.id;
      if (!surveyDbId) throw new Error('The survey was written but no id came back');

      function attach(rows) {
        return (rows || []).map(function(row) {
          return Object.assign({}, row, { survey_id: surveyDbId });
        });
      }

      return Promise.all([
        pushSurveyZones(surveyDbId, payload.zoneRows || []),
        pushObservations(attach(payload.observationRows)),
        pushReading(surveyRow.survey_type, attach(payload.readingRows)),
        pushSwardSpecies(attach(payload.swardRows))
      ]).then(function(results) {
        written.zones = results[0];
        written.observations = results[1];
        written.reading = results[2];
        written.sward = results[3];
        return written;
      });
    });
  }

  return {
    loadFromCloud: loadFromCloud,
    loadAccessRequests: loadAccessRequests,
    dismissAccessRequests: dismissAccessRequests,
    pushObservation: pushObservation,
    updateObservation: updateObservation,
    reviewObservation: reviewObservation,
    deleteObservation: deleteObservation,
    restoreObservation: restoreObservation,
    loadArchivedObservations: loadArchivedObservations,
    getObservationReviews: getObservationReviews,
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
    getSystemMeta: getSystemMeta,
    loadRegistries: loadRegistries,
    loadSurveyPlane: loadSurveyPlane,
    loadRegister: loadRegister,
    updateSpeciesBaselineCloud: updateSpeciesBaselineCloud,
    updateSiteBaselineOverrideCloud: updateSiteBaselineOverrideCloud,
    updateSiteBaselineMapCloud: updateSiteBaselineMapCloud,
    submitSurvey: submitSurvey,
    pushSurvey: pushSurvey
  };

})();

// Self-registers on load; data.js must load first, which it does on every page.
if (window.BioSync && window.BioSync.registerAutoPush) {
  window.BioSync.registerAutoPush();
}