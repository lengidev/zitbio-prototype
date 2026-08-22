/**
 * BioMonitor — Settings Page Component
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
          if (dbStatus) dbStatus.textContent = 'Connected';
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

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initSettingsPage();
  });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initSettingsPage };
}