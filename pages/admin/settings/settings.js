/**
 * Settings page: live Supabase account data and the password change flow.
 */

/**
 * Falls back to the input unchanged when it cannot be parsed.
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
 * Split out of populateAccountInfo() so the `session:changed` repaint of the identity
 * does not re-fire that function's three live Supabase reads.
 */
function renderAccountIdentity() {
  if (!window.BioData) return;

  var session = BioData.getSession();
  if (!session) return;

  var user = BioData.getUserByEmail(session.email);
  // The shared formatter keeps this page and the header dropdown from showing the
  // same person two different codes: the old local copy fell back to the *email*
  // before the profile row arrived, rendering nonsense like "ADMIN-SINY".
  var accountSource = session.id || (user && user.id) || '';
  var roleDisplay = session.role === 'admin' ? 'Administrator'
    : (session.role === 'field_officer' ? 'Field Officer' : '\u2014');

  var userIdEl = document.getElementById('settingsUserId');
  if (userIdEl) {
    userIdEl.textContent = BioData.formatAccountId(accountSource, session.role);
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
}

function populateAccountInfo() {
  if (!window.BioData) return;

  var session = BioData.getSession();
  if (!session) return;

  var user = BioData.getUserByEmail(session.email);
  renderAccountIdentity();

  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    window.BioSupabase.ready()
      .then(function(client) {
        var userId = user && user.id;
        var profilePromise = userId
          ? client.from('profiles').select('last_login, password_changed_at, created_at').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null });

        var sysPromise = client.from('system_meta').select('key, value');

        // Cheap, RLS-safe read for the health check.
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
 * Settings tabs: one panel is visible at a time, so the page reads as three
 * short pages instead of one long scroll. The active tab survives a reload, and
 * a #tab-account / #tab-system / #tab-species deep-link beats the remembered
 * tab. Mirrors the Analytics tab strip, including its hash format.
 */
function initSettingsTabs() {
  var tablist = document.querySelector('.settings-tabs');
  if (!tablist) return; // not on the settings page

  var tabs = Array.prototype.slice.call(tablist.querySelectorAll('.settings-tab'));
  if (tabs.length === 0) return;

  function tabByName(name) {
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('data-tab') === name) return tabs[i];
    }
    return null;
  }

  function activateTab(tab, persist) {
    tabs.forEach(function(t) {
      var isActive = t === tab;
      t.classList.toggle('active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
      // Roving tabindex: only the active tab stays in the tab order, so Tab
      // moves on into the panel instead of walking all three tabs.
      t.setAttribute('tabindex', isActive ? '0' : '-1');

      var panelId = t.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      if (panel) panel.classList.toggle('active', isActive);
    });

    if (persist !== false) {
      var name = tab.getAttribute('data-tab');
      if (name) {
        try { localStorage.setItem('biodata_settings_tab', name); } catch (err) { /* storage unavailable */ }
      }
    }
  }

  tabs.forEach(function(tab, index) {
    tab.addEventListener('click', function() { activateTab(tab); });

    tab.addEventListener('keydown', function(e) {
      var next = null;
      if (e.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      e.preventDefault();
      activateTab(next);
      next.focus();
    });
  });

  function tabFromHash() {
    var hash = window.location.hash;
    if (hash.indexOf('#tab-') !== 0) return null;
    return tabByName(hash.slice(5));
  }

  window.addEventListener('hashchange', function() {
    var linked = tabFromHash();
    if (linked) activateTab(linked, false);
  });

  // Precedence: deep-link, then the remembered tab, then whatever the markup
  // already marks active. Restoring does not re-persist.
  var initial = tabFromHash();
  if (!initial) {
    var saved = null;
    try { saved = localStorage.getItem('biodata_settings_tab'); } catch (err) { /* storage unavailable */ }
    if (saved) initial = tabByName(saved);
  }
  if (initial) activateTab(initial, false);
}

function initSettingsPage() {
  const changePwdBtn = document.getElementById('changePwdBtn');
  if (!changePwdBtn) {
    return; // Not the settings page
  }

  populateAccountInfo();

  changePwdBtn.addEventListener('click', function() {
    const current = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;

    function notify(message, type) {
      if (typeof showToast === 'function') {
        showToast(message, type || 'success');
        return;
      }
      // Never alert(): a blocking dialog for a form message is what was removed.
      console.warn('Settings: ' + message);
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

//  Species Registry: a read-first table. It answers "what baseline will the
//  warnings use?" with the number itself, and shows where that number came from
//  as text rather than in a tooltip. Editing happens one species at a time, in
//  the row it belongs to, through a single Save.

// Escaping built from char codes so no entity literal exists in source for an
// editor or auto-formatter to un-escape; the strings are assembled at runtime.
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
  // The one shared formatter; fails soft if lib/date.js is absent.
  if (!window.BioDate) return String(isoStr);
  var formatted = window.BioDate.mediumDate(isoStr);
  return formatted === '\u2014' ? String(isoStr) : formatted;
}

function setRegistryStat(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

var REGISTRY_FILTERS = ['all', 'admin', 'derived', 'none'];

// Module scope, not per-call: initBaselinesSection() runs again on
// `biodata:synced`, and a refresh must not close the editor or drop the filter.
var registryFilter = 'all';
var registryOpenId = null;
var registryModel = null;
var registryBound = false;
var registryDirty = false;
var registryUnloadBound = false;

// Intl rather than a hand-built string: the decimal separator is locale data.
var registryNumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function registryFormatNumber(value) {
  return registryNumberFormat.format(value);
}

function registryRound1(value) {
  return Math.round(value * 10) / 10;
}

/** DOM-safe fragment for the ids this section generates. */
function registryToken(value) {
  return String(value == null ? '' : value).replace(/[^A-Za-z0-9_-]/g, '');
}

/**
 * The whole table in one pass. `effective` is the number the warnings actually
 * compare against: an admin value when one is set, otherwise the mean of the
 * verified counts, never a fabricated default.
 */
function buildRegistryModel() {
  if (!window.BioData || !window.BioData.getSpeciesRegistry) return null;

  var sites = window.BioData.getSiteRegistry ? (window.BioData.getSiteRegistry() || []) : [];
  var registry = window.BioData.getSpeciesRegistry() || [];
  var verified = window.BioData.getVerifiedObservations() || [];

  // Grouped by entity id, so the counts match the analytics engine's.
  var countsBySpecies = {};
  verified.forEach(function(observation) {
    var speciesId = window.BioData.resolveSpeciesId(observation);
    if (!speciesId) return;
    if (!countsBySpecies[speciesId]) countsBySpecies[speciesId] = [];
    countsBySpecies[speciesId].push(observation.count || 0);
  });

  var rows = registry.map(function(species) {
    var counts = countsBySpecies[species.id] || [];
    var derived = counts.length > 0
      ? counts.reduce(function(sum, count) { return sum + count; }, 0) / counts.length
      : null;
    var explicit = species.baseline_count != null ? species.baseline_count : null;
    var overrides = sites.filter(function(site) {
      return !!(species.baseline_by_site && species.baseline_by_site[site.id] != null);
    }).map(function(site) {
      return { site: site, value: species.baseline_by_site[site.id] };
    });

    return {
      species: species,
      counts: counts,
      derived: derived,
      explicit: explicit,
      effective: explicit != null ? explicit
        : (derived != null ? registryRound1(derived) : null),
      source: explicit != null ? 'admin' : (derived != null ? 'derived' : 'none'),
      overrides: overrides
    };
  });

  return { sites: sites, rows: rows };
}

function registryRowById(speciesId) {
  if (!registryModel) return null;
  for (var i = 0; i < registryModel.rows.length; i++) {
    if (registryModel.rows[i].species.id === speciesId) return registryModel.rows[i];
  }
  return null;
}

function registryTypeLabel(species) {
  var type = String(species.taxon_type || '').toLowerCase();
  if (type === 'flora') return 'Flora';
  if (type === 'fauna') return 'Fauna';
  return '\u2014';
}

/**
 * Value first, provenance second: the number is what the warnings compare
 * against, the chip and the line under it say why it is that number.
 */
function registryBaselineCell(row) {
  var chips = {
    admin: '<span class="registry-chip registry-chip--admin">Admin-set</span>',
    derived: '<span class="registry-chip registry-chip--derived">Derived</span>',
    none: '<span class="registry-chip registry-chip--none">Not set</span>'
  };

  var meta;
  if (row.source === 'admin') {
    meta = row.species.baseline_updated_at
      ? 'Updated ' + settingsShortDate(row.species.baseline_updated_at)
      : 'Set by an admin';
  } else if (row.source === 'derived') {
    meta = 'Mean of ' + row.counts.length + ' verified record' + (row.counts.length === 1 ? '' : 's');
  } else {
    meta = 'No verified records yet';
  }

  var value = row.effective != null
    ? '<span class="registry-baseline-value">' + escapeSettingHtml(registryFormatNumber(row.effective)) + '</span>'
    : '<span class="registry-baseline-value registry-baseline-value--none">\u2014</span>';

  return value +
    '<span class="registry-baseline-meta">' + chips[row.source] +
    '<span class="registry-baseline-when">' + escapeSettingHtml(meta) + '</span></span>';
}

function registrySitesCell(row) {
  if (row.overrides.length === 0) {
    return '<span class="registry-sites-none">None</span>';
  }
  return '<span class="registry-site-list">' + row.overrides.map(function(override) {
    return '<span class="registry-site-chip">' +
      '<span class="registry-site-chip-name">' + escapeSettingHtml(override.site.short_name || override.site.name) + '</span>' +
      '<b>' + escapeSettingHtml(registryFormatNumber(override.value)) + '</b>' +
      '</span>';
  }).join('') + '</span>';
}

function registryRowHtml(row, index) {
  var species = row.species;
  var token = registryToken(species.id) || ('row-' + index);
  var isOpen = registryOpenId === species.id;

  return '<tr class="registry-row' + (isOpen ? ' is-open' : '') + '">' +
      '<td data-label="Species">' +
        '<span class="registry-species-name">' + escapeSettingHtml(species.common_name || species.scientific_name || '\u2014') + '</span>' +
        '<span class="registry-species-sci">' + escapeSettingHtml(species.scientific_name || '') + '</span>' +
      '</td>' +
      '<td data-label="Type"><span class="registry-type">' + escapeSettingHtml(registryTypeLabel(species)) + '</span></td>' +
      '<td data-label="Baseline">' + registryBaselineCell(row) + '</td>' +
      '<td data-label="Per-site overrides">' + registrySitesCell(row) + '</td>' +
      '<td class="registry-actions-cell">' +
        '<button type="button" class="btn btn-secondary btn-sm registry-toggle" ' +
          'data-registry-toggle="' + escapeSettingHtml(species.id) + '" ' +
          'aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-controls="registry-editor-' + token + '">' +
          '<span>' + (isOpen ? 'Close' : 'Edit') + '</span>' +
          '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-expand_more"/></svg>' +
        '</button>' +
      '</td>' +
    '</tr>' +
    '<tr class="registry-editor" id="registry-editor-' + token + '" data-species-id="' + escapeSettingHtml(species.id) + '"' +
      (isOpen ? '' : ' hidden') + '>' +
      '<td colspan="5"></td>' +
    '</tr>';
}

function registryEmptyHtml() {
  var filtered = registryFilter !== 'all';
  return '<tr class="registry-empty"><td colspan="5">' +
    '<p class="registry-empty-title">' +
      (filtered ? 'No Species Match This Filter' : 'No Species In The Registry Yet') +
    '</p>' +
    '<p class="registry-empty-text">' +
      (filtered
        ? 'Nothing in the registry matches this filter right now.'
        : 'Species appear here with the baseline the population warnings compare against.') +
    '</p>' +
    (filtered
      ? '<button type="button" class="btn btn-secondary btn-sm" data-registry-filter="all">Show All Species</button>'
      : '') +
    '</td></tr>';
}

/**
 * The editor for one species. Every control is labelled, the derived value is
 * stated instead of hidden in a placeholder, and the per-site overrides get a
 * fieldset of their own rather than sharing a cell with the global value.
 */
function registryEditorInnerHtml(row) {
  var species = row.species;
  var token = registryToken(species.id);
  var baselineId = 'registry-baseline-' + token;
  var baselineHintId = baselineId + '-hint';
  var baselineErrorId = baselineId + '-error';
  var sitesHintId = 'registry-sites-' + token + '-hint';

  var derivedHint;
  if (row.counts.length === 0) {
    derivedHint = 'No verified records yet, so there is nothing to derive from. Enter a number to set one.';
  } else {
    // The individual counts only help while there are few enough to compare by
    // eye; past that they are noise in front of the number that matters.
    derivedHint = 'Auto-derived from ' + row.counts.length + ' verified record' +
      (row.counts.length === 1 ? '' : 's') +
      (row.counts.length <= 3 ? ' (' + row.counts.join(', ') + ')' : '') + ': ' +
      registryFormatNumber(registryRound1(row.derived)) + '. Leave blank to use that.';
  }

  var globalField =
    '<div class="registry-field">' +
      '<label class="registry-field-label" for="' + baselineId + '">Species-wide baseline</label>' +
      '<p class="registry-field-hint" id="' + baselineHintId + '">' + escapeSettingHtml(derivedHint) + '</p>' +
      '<div class="registry-field-input">' +
        '<input type="number" min="0" step="1" inputmode="numeric" autocomplete="off" ' +
          'class="form-input registry-baseline-input" id="' + baselineId + '" name="' + baselineId + '" ' +
          'placeholder="Auto" aria-describedby="' + baselineHintId + ' ' + baselineErrorId + '" ' +
          'value="' + (row.explicit != null ? escapeSettingHtml(row.explicit) : '') + '" />' +
        '<button type="button" class="btn btn-secondary btn-sm' +
          (row.explicit != null ? '' : ' is-hidden') +
          '" data-registry-clear="' + escapeSettingHtml(species.id) + '">Clear</button>' +
      '</div>' +
      '<p class="validation-message" id="' + baselineErrorId + '"></p>' +
    '</div>';

  var siteRows = registryModel.sites.map(function(site) {
    var inputId = 'registry-site-' + token + '-' + (registryToken(site.id) || 'site');
    var errorId = inputId + '-error';
    var current = (species.baseline_by_site && species.baseline_by_site[site.id] != null)
      ? species.baseline_by_site[site.id]
      : '';
    return '<div class="registry-site-row">' +
        '<label class="registry-site-name" for="' + inputId + '">' + escapeSettingHtml(site.short_name || site.name) + '</label>' +
        '<input type="number" min="0" step="1" inputmode="numeric" autocomplete="off" ' +
          'class="form-input" id="' + inputId + '" name="' + inputId + '" placeholder="Global" ' +
          'data-registry-site="' + escapeSettingHtml(site.id) + '" ' +
          'aria-describedby="' + sitesHintId + ' ' + errorId + '" ' +
          'value="' + (current === '' ? '' : escapeSettingHtml(current)) + '" />' +
        '<p class="validation-message" id="' + errorId + '"></p>' +
      '</div>';
  }).join('');

  var sitesBlock =
    '<fieldset class="registry-field registry-field--sites">' +
      '<legend class="registry-field-label">Per-site overrides</legend>' +
      '<p class="registry-field-hint" id="' + sitesHintId + '">Leave a site blank to inherit the species-wide value.</p>' +
      (registryModel.sites.length === 0
        ? '<p class="registry-field-hint">No sites are configured.</p>'
        : '<div class="registry-site-list-edit">' + siteRows + '</div>') +
    '</fieldset>';

  var actions =
    '<div class="registry-editor-actions">' +
      '<span class="registry-editor-status" role="status" aria-live="polite">No changes yet</span>' +
      '<button type="button" class="btn btn-secondary" data-registry-cancel="' + escapeSettingHtml(species.id) + '">Cancel</button>' +
      '<button type="button" class="btn btn-primary" data-registry-save="' + escapeSettingHtml(species.id) + '" disabled>Save Changes</button>' +
    '</div>';

  return '<div class="registry-editor-inner">' +
      '<p class="registry-editor-title">' + escapeSettingHtml(species.common_name || species.scientific_name) +
        '<span class="registry-editor-sub">' + escapeSettingHtml(species.scientific_name) + ' \u00b7 ' +
        escapeSettingHtml(registryTypeLabel(species)) + '</span></p>' +
      '<div class="registry-editor-grid">' + globalField + sitesBlock + '</div>' +
      actions +
    '</div>';
}

/**
 * Snapshot of the open editor's inputs, so that a re-render (cloud sync,
 * refresh, filter change) cannot quietly throw away what someone has typed.
 */
function captureRegistryEdits() {
  if (!registryOpenId) return null;
  var tr = document.getElementById('registry-editor-' + registryToken(registryOpenId));
  if (!tr) return null;
  var baselineInput = tr.querySelector('.registry-baseline-input');
  if (!baselineInput) return null;

  var sites = {};
  tr.querySelectorAll('input[data-registry-site]').forEach(function(input) {
    sites[input.getAttribute('data-registry-site')] = input.value;
  });

  return { speciesId: registryOpenId, baseline: baselineInput.value, sites: sites };
}

function restoreRegistryEdits(snapshot) {
  if (!snapshot) return;
  var tr = document.getElementById('registry-editor-' + registryToken(snapshot.speciesId));
  if (!tr || tr.hidden) return;

  var baselineInput = tr.querySelector('.registry-baseline-input');
  if (baselineInput) baselineInput.value = snapshot.baseline;

  tr.querySelectorAll('input[data-registry-site]').forEach(function(input) {
    var siteId = input.getAttribute('data-registry-site');
    if (Object.prototype.hasOwnProperty.call(snapshot.sites, siteId)) {
      input.value = snapshot.sites[siteId];
    }
  });

  registrySyncEditorChrome(tr);
}

/** What the open editor holds, next to what the model says it held. */
function registryDirtyParts(tr) {
  var row = registryRowById(tr.getAttribute('data-species-id'));
  if (!row) return null;

  var baselineInput = tr.querySelector('.registry-baseline-input');
  var baselineRaw = baselineInput ? baselineInput.value.trim() : '';
  var baselineInitial = row.explicit != null ? String(row.explicit) : '';

  var sites = [];
  var changedSites = 0;
  tr.querySelectorAll('input[data-registry-site]').forEach(function(input) {
    var siteId = input.getAttribute('data-registry-site');
    var raw = input.value.trim();
    var initial = (row.species.baseline_by_site && row.species.baseline_by_site[siteId] != null)
      ? String(row.species.baseline_by_site[siteId])
      : '';
    var changed = raw !== initial;
    if (changed) changedSites++;
    sites.push({ siteId: siteId, input: input, raw: raw, changed: changed });
  });

  var baselineChanged = baselineRaw !== baselineInitial;
  return {
    row: row,
    baselineInput: baselineInput,
    baselineRaw: baselineRaw,
    baselineChanged: baselineChanged,
    sites: sites,
    changedSites: changedSites,
    changedCount: (baselineChanged ? 1 : 0) + changedSites,
    dirty: baselineChanged || changedSites > 0
  };
}

/** A baseline is a population count, so it is a whole number or nothing. */
function registryValidate(raw) {
  if (raw === '') return { ok: true, value: null };
  if (!/^\d+$/.test(raw)) return { ok: false, value: null };
  return { ok: true, value: parseInt(raw, 10) };
}

function registryClearErrors(tr) {
  tr.querySelectorAll('.validation-message').forEach(function(el) {
    el.textContent = '';
    el.classList.remove('error');
  });
  tr.querySelectorAll('.form-input').forEach(function(input) {
    input.classList.remove('error');
    input.removeAttribute('aria-invalid');
  });
}

function registryShowError(input, message) {
  if (!input) return;
  var errorEl = document.getElementById(input.id + '-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('error');
  }
  input.classList.add('error');
  input.setAttribute('aria-invalid', 'true');
}

function registrySyncEditorChrome(tr) {
  var parts = registryDirtyParts(tr);
  if (!parts) return;

  var statusEl = tr.querySelector('.registry-editor-status');
  if (statusEl) {
    statusEl.textContent = !parts.dirty ? 'No changes yet'
      : (parts.changedCount === 1 ? '1 unsaved change' : parts.changedCount + ' unsaved changes');
  }

  var saveBtn = tr.querySelector('[data-registry-save]');
  if (saveBtn) saveBtn.disabled = !parts.dirty;

  // The label states the stake: closing a clean editor is a cancel, closing a
  // dirty one throws work away.
  var cancelBtn = tr.querySelector('[data-registry-cancel]');
  if (cancelBtn) cancelBtn.textContent = parts.dirty ? 'Discard Changes' : 'Cancel';

  // Clear follows the field, not the dirty state.
  var clearBtn = tr.querySelector('[data-registry-clear]');
  if (clearBtn) clearBtn.classList.toggle('is-hidden', parts.baselineRaw === '');

  registryDirty = parts.dirty;
  registryUpdateUnloadGuard();
}

function registryHandleUnload(event) {
  if (!registryDirty) return;
  event.preventDefault();
  // Chrome requires returnValue to be set; every browser ignores the string.
  event.returnValue = '';
}

function registryUpdateUnloadGuard() {
  if (registryDirty === registryUnloadBound) return;
  if (registryDirty) window.addEventListener('beforeunload', registryHandleUnload);
  else window.removeEventListener('beforeunload', registryHandleUnload);
  registryUnloadBound = registryDirty;
}

function registrySave(speciesId) {
  var tr = document.getElementById('registry-editor-' + registryToken(speciesId));
  if (!tr) return;
  var parts = registryDirtyParts(tr);
  if (!parts || !parts.dirty) return;

  registryClearErrors(tr);

  // Everything is validated before anything is written, so a bad per-site value
  // cannot leave the row half saved.
  var invalidInputs = [];
  var baselineValue = null;
  if (parts.baselineChanged) {
    var baselineCheck = registryValidate(parts.baselineRaw);
    if (baselineCheck.ok) baselineValue = baselineCheck.value;
    else {
      registryShowError(parts.baselineInput, 'Enter a whole number, or leave blank to auto-derive.');
      invalidInputs.push(parts.baselineInput);
    }
  }

  var changedSiteValues = {};
  parts.sites.forEach(function(site) {
    if (!site.changed) return;
    var check = registryValidate(site.raw);
    if (check.ok) changedSiteValues[site.siteId] = check.value;
    else {
      registryShowError(site.input, 'Enter a whole number, or leave blank to inherit the global value.');
      invalidInputs.push(site.input);
    }
  });

  if (invalidInputs.length > 0) {
    // Focus the first offender so the correction is within reach, not only in a
    // transient message.
    invalidInputs[0].focus();
    if (typeof showToast === 'function') showToast('Baselines must be whole numbers. Nothing was saved.', 'error');
    return;
  }

  // Local writes first, so the table is right offline and in this session.
  if (parts.baselineChanged) {
    window.BioData.updateSpeciesBaseline(speciesId, baselineValue);
  }
  if (parts.changedSites > 0) {
    parts.sites.forEach(function(site) {
      if (site.changed) {
        window.BioData.updateSiteBaselineOverride(speciesId, site.siteId, changedSiteValues[site.siteId]);
      }
    });
  }

  // The per-site write is ONE complete map built from every input on screen,
  // because a per-key read-modify-write races: the second write would blank the
  // first site's value with its own stale copy.
  var siteMap = {};
  parts.sites.forEach(function(site) {
    var parsed = registryValidate(site.raw);
    if (parsed.ok && parsed.value != null) siteMap[site.siteId] = parsed.value;
  });

  var jobs = [];
  if (parts.baselineChanged && window.BioSync && window.BioSync.updateSpeciesBaselineCloud) {
    jobs.push(window.BioSync.updateSpeciesBaselineCloud(speciesId, baselineValue));
  }
  if (parts.changedSites > 0 && window.BioSync && window.BioSync.updateSiteBaselineMapCloud) {
    jobs.push(window.BioSync.updateSiteBaselineMapCloud(speciesId, siteMap).then(function(result) {
      if (result && result.error) throw result.error;
      return result;
    }));
  }

  function finish() {
    registryDirty = false;
    renderSpeciesRegistry();
  }

  if (jobs.length === 0) {
    // No reachable cloud writer: say so rather than report a success the server
    // never saw.
    console.warn('BioSync unavailable: baselines saved locally only.');
    if (typeof showToast === 'function') showToast('Saved on this device only — the server was not reached.', 'error');
    finish();
    return;
  }

  Promise.all(jobs).then(function() {
    if (typeof showToast === 'function') showToast('Baseline saved.', 'success');
    finish();
  }).catch(function(err) {
    console.error('BioSync: baseline sync failed:', err && err.message);
    if (typeof showToast === 'function') showToast('Saved on this device, but the server rejected it.', 'error');
    finish();
  });
}

function registryFocusToggle(speciesId) {
  var tbody = document.getElementById('baselinesTableBody');
  if (!tbody) return;
  var toggles = tbody.querySelectorAll('[data-registry-toggle]');
  for (var i = 0; i < toggles.length; i++) {
    if (toggles[i].getAttribute('data-registry-toggle') === speciesId) {
      toggles[i].focus();
      return;
    }
  }
}

function registryOpenEditor(speciesId) {
  registryOpenId = speciesId;
  renderSpeciesRegistry();
  var tr = document.getElementById('registry-editor-' + registryToken(speciesId));
  var input = tr ? tr.querySelector('.registry-baseline-input') : null;
  // One primary field, opened by an explicit click: this is the case autoFocus
  // is for.
  if (input) input.focus();
}

function registryCloseEditor(speciesId) {
  registryOpenId = null;
  registryDirty = false;
  renderSpeciesRegistry();
  registryUpdateUnloadGuard();
  registryFocusToggle(speciesId);
}

function registrySetFilter(filter) {
  registryFilter = REGISTRY_FILTERS.indexOf(filter) === -1 ? 'all' : filter;
  renderSpeciesRegistry();
  registrySyncUrl();
}

/** Filters live in the URL, so a filtered view can be linked, shared or reloaded. */
function registrySyncUrl() {
  if (!window.history || !window.history.replaceState) return;
  var url = new URL(window.location.href);
  if (registryFilter === 'all') url.searchParams.delete('baseline');
  else url.searchParams.set('baseline', registryFilter);
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

function registryFilterFromUrl() {
  try {
    var requested = new URL(window.location.href).searchParams.get('baseline');
    return REGISTRY_FILTERS.indexOf(requested) === -1 ? 'all' : requested;
  } catch (err) {
    return 'all';
  }
}

function registrySyncFilterChrome() {
  var bar = document.getElementById('registryFilters');
  if (!bar) return;
  bar.querySelectorAll('[data-filter]').forEach(function(button) {
    var isActive = button.getAttribute('data-filter') === registryFilter;
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function registrySyncSummaryText(model, totals, visibleRows) {
  var summaryEl = document.getElementById('registrySummary');
  if (summaryEl) {
    var siteCount = model.sites.length;
    summaryEl.textContent = registryFilter === 'all'
      ? totals.all + ' species \u00b7 ' + siteCount + (siteCount === 1 ? ' site' : ' sites')
      : 'Showing ' + visibleRows.length + ' of ' + totals.all + ' species';
  }

  var noteEl = document.getElementById('baselinesNote');
  if (!noteEl) return;
  if (totals.all === 0) {
    noteEl.textContent = 'No species in the registry.';
  } else if (totals.none > 0) {
    // What the count means for the warning system, rather than the count again:
    // a species with no baseline can produce no warning at all.
    noteEl.textContent = totals.none + ' of ' + totals.all +
      ' species have no baseline, so no population warning can be produced for them.';
  } else {
    noteEl.textContent = 'Every species has a baseline. Derived values recompute automatically as verified observations arrive.';
  }
}

function renderSpeciesRegistry() {
  var tbody = document.getElementById('baselinesTableBody');
  if (!tbody) return;

  var model = buildRegistryModel();
  if (!model) return;
  registryModel = model;

  var snapshot = captureRegistryEdits();

  var totals = { all: model.rows.length, admin: 0, derived: 0, none: 0 };
  model.rows.forEach(function(row) { totals[row.source]++; });

  setRegistryStat('registryStatSpecies', registryFormatNumber(totals.all));
  setRegistryStat('registryStatAdmin', registryFormatNumber(totals.admin));
  setRegistryStat('registryStatDerived', registryFormatNumber(totals.derived));
  setRegistryStat('registryStatNoBaseline', registryFormatNumber(totals.none));

  var visibleRows = registryFilter === 'all'
    ? model.rows
    : model.rows.filter(function(row) { return row.source === registryFilter; });

  tbody.innerHTML = visibleRows.length > 0
    ? visibleRows.map(registryRowHtml).join('')
    : registryEmptyHtml();

  // The open editor only survives if its species is still in view.
  if (registryOpenId) {
    var openRow = registryRowById(registryOpenId);
    if (!openRow || visibleRows.indexOf(openRow) === -1) {
      registryOpenId = null;
      registryDirty = false;
    } else {
      var editorTr = document.getElementById('registry-editor-' + registryToken(registryOpenId));
      var editorCell = editorTr ? editorTr.firstElementChild : null;
      if (editorCell) editorCell.innerHTML = registryEditorInnerHtml(openRow);
      if (editorTr) editorTr.hidden = false;
    }
  }

  registrySyncFilterChrome();
  registrySyncSummaryText(model, totals, visibleRows);
  restoreRegistryEdits(snapshot);
  registryUpdateUnloadGuard();
}
/**
 * One listener for the whole section. renderSpeciesRegistry() replaces the
 * tbody's children on every paint, so per-row listeners would have to be
 * re-attached each time; delegation on the tbody cannot go stale, and the
 * dataset flags keep a second init from stacking a second listener on it.
 */
function bindRegistryEvents() {
  var filters = document.getElementById('registryFilters');
  if (filters && !filters.dataset.registryBound) {
    filters.dataset.registryBound = '1';
    filters.addEventListener('click', function(event) {
      var button = event.target.closest('[data-filter]');
      if (button) registrySetFilter(button.getAttribute('data-filter'));
    });
  }

  var tbody = document.getElementById('baselinesTableBody');
  if (!tbody || tbody.dataset.registryBound) return;
  tbody.dataset.registryBound = '1';

  tbody.addEventListener('click', function(event) {
    var toggle = event.target.closest('[data-registry-toggle]');
    if (toggle) {
      var toggleId = toggle.getAttribute('data-registry-toggle');
      if (registryOpenId === toggleId) registryCloseEditor(toggleId);
      else registryOpenEditor(toggleId);
      return;
    }

    var save = event.target.closest('[data-registry-save]');
    if (save) {
      registrySave(save.getAttribute('data-registry-save'));
      return;
    }

    var cancel = event.target.closest('[data-registry-cancel]');
    if (cancel) {
      registryCloseEditor(cancel.getAttribute('data-registry-cancel'));
      return;
    }

    var clear = event.target.closest('[data-registry-clear]');
    if (clear) {
      var tr = clear.closest('.registry-editor');
      var input = tr ? tr.querySelector('.registry-baseline-input') : null;
      if (input) {
        input.value = '';
        if (tr) registrySyncEditorChrome(tr);
        input.focus();
      }
      return;
    }

    var showAll = event.target.closest('[data-registry-filter]');
    if (showAll) registrySetFilter(showAll.getAttribute('data-registry-filter'));
  });

  // Dirty state is live: each keystroke re-reads the editor and updates the
  // count, the Save button and the discard label.
  tbody.addEventListener('input', function(event) {
    var tr = event.target.closest('.registry-editor');
    if (tr) registrySyncEditorChrome(tr);
  });
}

function registryLoadFromCloud() {
  if (window.BioSync && window.BioSync.loadRegistries) {
    // Failing soft is deliberate: the local registries are the offline cache.
    return window.BioSync.loadRegistries().catch(function() { /* offline */ });
  }
  return Promise.resolve();
}

function initBaselinesSection() {
  var tbody = document.getElementById('baselinesTableBody');
  if (!tbody) return; // not on the settings page

  if (!registryBound) {
    // Only on the first pass: a later re-init must not undo the filter the
    // admin has just chosen.
    registryFilter = registryFilterFromUrl();
    registryBound = true;
  }
  bindRegistryEvents();

  var refreshBtn = document.getElementById('baselinesRefreshBtn');
  if (refreshBtn && !refreshBtn.dataset.registryBound) {
    refreshBtn.dataset.registryBound = '1';
    refreshBtn.addEventListener('click', function() {
      registryLoadFromCloud().then(renderSpeciesRegistry);
    });
  }

  // Local cache first, authoritative copy second. Waiting on the network before
  // the first paint left the table empty for the whole round trip, with nothing
  // on screen to say why.
  renderSpeciesRegistry();
  registryLoadFromCloud().then(renderSpeciesRegistry);
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initSettingsTabs();
    initSettingsPage();
    initBaselinesSection();
  });
}

// Re-render baselines after cloud sync so server-authoritative baselines
// (set in another session) appear without a page reload.
window.addEventListener('biodata:synced', function() {
  initBaselinesSection();
});

// This page reads the session during DOMContentLoaded, which can beat the route
// guard's profile lookup. Repaint the identity (locally, no extra reads) when the
// verified identity lands, so it never keeps a placeholder role or a stale code.
if (window.BioData && typeof BioData.subscribe === 'function') {
  BioData.subscribe('session:changed', function() {
    if (document.getElementById('changePwdBtn')) renderAccountIdentity();
  });
}
