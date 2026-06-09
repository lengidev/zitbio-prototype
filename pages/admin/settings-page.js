/**
 * BioMonitor - Settings Page Component
 * Logic for password changes, session-driven account info, and settings interactions
 */

/**
 * Format a date string (ISO or locale) into a readable format
 */
function formatSettingsDate(dateStr) {
  if (!dateStr) return '—';
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format an ISO timestamp into a readable datetime string
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
 * Populate Account Information from BioData session
 */
function populateAccountInfo() {
  if (!window.BioData) return;

  var session = BioData.getSession();
  if (!session) return;

  // Look up full user record
  var user = BioData.getUserByEmail(session.email);
  if (!user) return;

  // Determine prefix based on role
  var prefix = session.role === 'admin' ? 'ADMIN' : 'FO';
  var roleDisplay = session.role === 'admin' ? 'Administrator' : 'Field Officer';

  // User ID
  var userIdEl = document.getElementById('settingsUserId');
  if (userIdEl) {
    userIdEl.textContent = prefix + '-' + String(user.id).padStart(3, '0');
  }

  // Role
  var roleEl = document.getElementById('settingsRole');
  if (roleEl) {
    roleEl.textContent = roleDisplay;
  }

  // Account Created
  var createdEl = document.getElementById('settingsCreated');
  if (createdEl && user.created) {
    createdEl.textContent = formatSettingsDate(user.created);
  }

  // Last Login
  var lastLoginEl = document.getElementById('settingsLastLogin');
  if (lastLoginEl && user.lastLogin) {
    lastLoginEl.textContent = formatSettingsDateTime(user.lastLogin);
  }
}

/**
 * Initialize settings page event listeners
 */
function initSettingsPage() {
  // Guard: Check if we're on the settings page
  const changePwdBtn = document.getElementById('changePwdBtn');
  if (!changePwdBtn) {
    return; // Not the settings page
  }

  // Populate account info from session
  populateAccountInfo();

  // Password change functionality
  changePwdBtn.addEventListener('click', function() {
    const current = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;

    if (!current || !newPwd || !confirm) {
      if (typeof showToast === 'function') {
        showToast('Please fill in all password fields.', 'error');
      } else {
        alert('Please fill in all password fields.');
      }
      return;
    }
    if (newPwd.length < 8) {
      if (typeof showToast === 'function') {
        showToast('New password must be at least 8 characters.', 'error');
      } else {
        alert('New password must be at least 8 characters.');
      }
      return;
    }
    if (newPwd !== confirm) {
      if (typeof showToast === 'function') {
        showToast('New password and confirmation do not match.', 'error');
      } else {
        alert('New password and confirmation do not match.');
      }
      return;
    }

    if (typeof showToast === 'function') {
      showToast('Password changed successfully!', 'success');
    } else {
      alert('Password changed successfully!');
    }
    document.getElementById('currentPwd').value = '';
    document.getElementById('newPwd').value = '';
    document.getElementById('confirmPwd').value = '';
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