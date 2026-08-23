/**
 * ZitBio — Settings Page Component
 * Real, live data from Supabase: last login, last password change, system
 * version/updated, and a live database health check. Password change uses
 * Supabase Auth and records profiles.password_changed_at.
 */

/**
 * Format a date/ISO string into a readable datetime string.
 */
function formatSettingsDateTime(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Populate Account Information from the live Supabase profile +
 * system_meta + a real DB health check.
 */
function populateAccountInfo() {
  if (!window.BioData) return;

  var session = BioData.getSession();
  if (!session) return;

  var user = BioData.getUserByEmail(session.email);
  var prefix = session.role === 'admin' ? 'ADMIN' : 'FO';
  var roleDisplay = session.role === 'admin' ? 'Administrator' : 'Field Officer';

  // User ID — numeric legacy users get padded code; cloud UUIDs get a friendly prefix.
  var userIdEl = document.getElementById('settingsUserId');
  if (userIdEl) {
    var uid = user ? user.id : session.email;
    var accountId = prefix + '-' + uid;
    if (/^\d+$/.test(String(uid)) && window.BioData && typeof window.BioData.padZero === 'function') {
      accountId = prefix + '-' + window.BioData.padZero(uid, 3);
    } else if (String(uid).indexOf('-') !== -1) {
      accountId = prefix + '-' + String(uid).slice(0, 4).toUpperCase();
    }
    userIdEl.textContent = accountId;
  }

  var roleEl = document.getElementById('settingsRole');
  if (roleEl) roleEl.textContent = roleDisplay;

  var createdEl = document.getElementById('settingsCreated');
  if (createdEl && user && user.created) createdEl.textContent = user.created;

  var lastLoginEl = document.getElementById('settingsLastLogin');
  if (lastLoginEl && user && user.lastLogin) {
    lastLoginEl.textContent = formatSettingsDateTime(user.lastLogin);
  } else if (lastLoginEl) {
    lastLoginEl.textContent = 'Never';
  }

  // Live Supabase data for the other fields.
  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    window.BioSupabase.ready()
      .then(function(client) {
        var userId = user && user.id;
        var profilePromise = userId
          ? client.from('profiles').select('last_login, password_changed_at, created_at').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null });

        // System meta
        var sysPromise = client.from('system_meta').select('key, value');

        // DB health check via a cheap, RLS-safe read.
        var healthPromise = client.from('species_reference').select('common_name').limit(1);

        return Promise.all([profilePromise, sysPromise, healthPromise]);
      })
      .then(function(results) {
        var profileResult = results[0];
        var sysResult = results[1];
        var healthResult = results[2];

        var pwEl = document.getElementById('settingsPasswordChanged');
        if (profileResult.data && profileResult.data.password_changed_at) {
          if (pwEl) pwEl.textContent = formatSettingsDateTime(profileResult.data.password_changed_at);
        } else if (pwEl) {
          pwEl.textContent = 'Never';
        }

        var versionEl = document.getElementById('settingsVersion');
        var updatedEl = document.getElementById('settingsLastUpdated');
        var sysMap = {};
        (sysResult.data || []).forEach(function(row) { sysMap[row.key] = row.value; });
        if (versionEl) versionEl.textContent = sysMap.version || '—';
        if (updatedEl) updatedEl.textContent = formatSettingsDateTime(sysMap.last_updated_at);

        // Live DB status
        var dbDot = document.getElementById('settingsDbDot');
        var dbStatus = document.getElementById('settingsDbStatus');
        if (healthResult.error) {
          if (dbStatus) dbStatus.textContent = 'Offline';
          if (dbDot) dbDot.className = 'db-dot disconnected';
        } else {
          if (dbStatus) dbStatus.textContent = 'Healthy';
          if (dbDot) dbDot.className = 'db-dot';
        }
      })
      .catch(function() {
        var dbStatus = document.getElementById('settingsDbStatus');
        if (dbStatus) dbStatus.textContent = 'Offline';
        var dbDot = document.getElementById('settingsDbDot');
        if (dbDot) dbDot.className = 'db-dot disconnected';
      });
  }
}

/**
 * Initialize settings page event listeners
 */
function initSettingsPage() {
  // Guard: only run on the settings page (detected by the change password button)
  const changePwdBtn = document.getElementById('changePwdBtn');
  if (!changePwdBtn) {
    return; // Not the settings page
  }

  // Populate account info from live data
  populateAccountInfo();

  // Password change — real Supabase Auth, records password_changed_at.
  changePwdBtn.addEventListener('click', function() {
    const current = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;

    function notify(message, type) {
      if (typeof showToast === 'function') {
        showToast(message, type || 'success');
      } else {
        alert(message);
      }
    }

    if (!current || !newPwd || !confirm) {
      notify('Please fill in all password fields.', 'error');
      return;
    }
    if (newPwd.length < 8) {
      notify('New password must be at least 8 characters.', 'error');
      return;
    }
    if (newPwd !== confirm) {
      notify('New password and confirmation do not match.', 'error');
      return;
    }

    var session = window.BioData ? BioData.getSession() : null;
    var email = session ? session.email : '';
    var user = window.BioData ? BioData.getUserByEmail(email) : null;
    var userId = user && user.id;

    if (!email || !window.BioSupabase || !window.BioSupabase.isConfigured()) {
      notify('You must be signed in to change your password.', 'error');
      return;
    }

    // Verify current password, then update + record timestamp.
    window.BioSupabase.signIn(email, current)
      .then(function(res) {
        if (res.error) {
          notify('Current password is incorrect.', 'error');
          return;
        }
        return window.BioSupabase.ready().then(function(client) {
          return client.auth.updateUser({ password: newPwd });
        });
      })
      .then(function(updateResult) {
        if (!updateResult) return; // current-password failure path already handled
        if (updateResult.error) {
          notify(updateResult.error.message || 'Unable to change password.', 'error');
          return;
        }
        // Record password_changed_at on the profile (own-row update allowed by RLS).
        var profilePromise = userId
          ? window.BioSupabase.ready().then(function(client) {
              return client.from('profiles').update({ password_changed_at: new Date().toISOString() }).eq('id', userId);
            })
          : Promise.resolve({ error: null });

        return profilePromise.then(function() {
          notify('Password changed successfully!', 'success');
          document.getElementById('currentPwd').value = '';
          document.getElementById('newPwd').value = '';
          document.getElementById('confirmPwd').value = '';
          populateAccountInfo();
        });
      })
      .catch(function() {
        notify('Unable to change password. Please try again.', 'error');
      });
  });
}

// ============================================================
//  SPECIES & BASELINES — population warning reference data
//  ------------------------------------------------------------
//  Lists species_registry entries with an inline baseline editor.
//  Derived baselines = mean of verified observation counts (clearly
//  labelled — never fabricated). Admin-set baselines persist via
//  BioData.updateSpeciesBaseline + BioSync.updateSpeciesBaselineCloud.
// ============================================================

// HTML-escaping built from char codes + concatenation only, so no entity
// literals (& / < …) exist in source that an editor/auto-formatter
// could un-escape. Entity strings are assembled at runtime.
var SETTING_HTML_ENTITIES = (function() {
  var amp = String.fromCharCode(38);      // &
  var map = {};
  map[amp] = amp + 'amp;';                // &
  map[String.fromCharCode(60)] = amp + 'lt;';   // <
  map[String.fromCharCode(62)] = amp + 'gt;';   // >
  map[String.fromCharCode(34)] = amp + 'quot;'; // "
  map[String.fromCharCode(39)] = amp + '#39;';  // &#39;
  return map;
})();
function escapeSettingHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function(c) {
    return SETTING_HTML_ENTITIES[c] || '';
  });
}

function settingsShortDate(isoStr) {
  if (!isoStr) return '—';
  var d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initBaselinesSection() {
  var tbody = document.getElementById('baselinesTableBody');
  if (!tbody) return; // not on the settings page (or section missing)

  var noteEl = document.getElementById('baselinesNote');
  var refreshBtn = document.getElementById('baselinesRefreshBtn');

  function renderBaselines() {
    if (!window.BioData || !window.BioData.getSpeciesRegistry) return;
    var registry = window.BioData.getSpeciesRegistry();
    var verified = window.BioData.getVerifiedObservations();
    // Enrich with entity ids so analytics grouping is consistent.
    var enriched = verified.map(function(o) {
      return Object.assign({}, o, {
        species_id: window.BioData.resolveSpeciesId(o) || null,
        site_id: window.BioData.resolveSiteId(o) || null
      });
    });

    var html = '';
    registry.forEach(function(sp) {
      // Current derived estimate: mean of verified counts for this species.
      var spObs = enriched.filter(function(o) { return o.species_id === sp.id; });
      var derived = spObs.length > 0
        ? (spObs.reduce(function(s, o) { return s + (o.count || 0); }, 0) / spObs.length)
        : null;

      var sourceLabel, sourceClass, sourceTitle;
      if (sp.baseline_count != null) {
        sourceLabel = 'admin-set';
        sourceClass = 'baseline-source-admin';
        sourceTitle = 'Authoritative baseline set by an admin' + (sp.baseline_updated_at ? ' on ' + settingsShortDate(sp.baseline_updated_at) : '') + '. Leave the field blank and Save to return to the auto-derived value.';
      } else if (derived != null) {
        var countList = spObs.map(function(o) { return o.count; }).join(', ');
        sourceLabel = 'derived \u00b7 ' + Math.round(derived * 10) / 10 +
          (spObs.length <= 3 ? ' (' + countList + ')' : ' (avg of ' + spObs.length + ')');
        sourceClass = 'baseline-source-derived';
        sourceTitle = 'Auto-derived baseline: the mean of ' + spObs.length + ' verified count' + (spObs.length === 1 ? '' : 's') +
          (countList ? ' (' + countList + ')' : '') + '. Computed from observations, never fabricated \u2014 enter a number above and Save to set an explicit baseline.';
      } else {
        sourceLabel = 'no baseline';
        sourceClass = '';
        sourceTitle = 'No verified observations yet and no admin-set baseline. No warning can be produced until a baseline is available.';
      }

      html += '<tr>' +
        '<td class="baseline-species">' + escapeSettingHtml(sp.common_name || sp.scientific_name) + '</td>' +
        '<td class="baseline-sci">' + escapeSettingHtml(sp.scientific_name || '') + '</td>' +
        '<td>' + escapeSettingHtml(sp.taxon_type || '—') + '</td>' +
        '<td><input type="number" min="0" class="form-input baseline-input" data-species-id="' + escapeSettingHtml(sp.id) + '" value="' + (sp.baseline_count != null ? sp.baseline_count : '') + '" placeholder="' + (derived != null ? 'derived: ' + Math.round(derived * 10) / 10 : 'auto') + '" /></td>' +
        '<td><span class="baseline-source ' + sourceClass + '" title="' + escapeSettingHtml(sourceTitle) + '">' + escapeSettingHtml(sourceLabel) + '</span></td>' +
        '<td>' + (sp.baseline_updated_at ? settingsShortDate(sp.baseline_updated_at) : '—') + '</td>' +
        '<td><button class="btn-primary baseline-save-btn" data-species-id="' + escapeSettingHtml(sp.id) + '">Save</button></td>' +
        '</tr>';
    });
    tbody.innerHTML = html;

    if (noteEl) {
      noteEl.textContent = registry.length + ' species in registry · ' +
        (window.BioData.getSiteRegistry ? window.BioData.getSiteRegistry().length : 0) + ' sites';
    }

    // Wire inline save buttons.
    tbody.querySelectorAll('.baseline-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var speciesId = btn.getAttribute('data-species-id');
        var input = tbody.querySelector('.baseline-input[data-species-id="' + speciesId + '"]');
        var raw = input ? input.value : '';
        var value = (raw === '' || raw == null) ? null : parseInt(raw, 10);

        if (value != null && (isNaN(value) || value < 0)) {
          if (typeof showToast === 'function') showToast('Baseline must be a positive number or blank.', 'error');
          else alert('Baseline must be a positive number or blank.');
          return;
        }

        // Local persistence first (works offline).
        var updated = window.BioData.updateSpeciesBaseline(speciesId, value);
        if (!updated) return;

        // Cloud write-through when online (admin-only RLS enforces auth).
        if (window.BioSync && window.BioSync.updateSpeciesBaselineCloud) {
          window.BioSync.updateSpeciesBaselineCloud(speciesId, value).catch(function(err) {
            console.warn('BioSync: baseline sync failed:', err && err.message);
          });
        }

        if (typeof showToast === 'function') showToast('Baseline saved.', 'success');
        renderBaselines();
      });
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', renderBaselines);

  // Cloud registry hydration (new tables) + re-render after sync.
  if (window.BioSync && window.BioSync.loadRegistries) {
    window.BioSync.loadRegistries().then(renderBaselines).catch(function() { renderBaselines(); });
  } else {
    renderBaselines();
  }
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initSettingsPage();
    initBaselinesSection();
  });
}

// Re-render baselines after cloud sync so server-authoritative baselines
// (set in another session) appear without a page reload.
window.addEventListener('biodata:synced', function() {
  initBaselinesSection();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSettingsPage };
}