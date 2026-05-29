/**
 * BioMonitor - Settings Page Component
 * Logic for password changes and settings interactions
 */

/**
 * Initialize settings page event listeners
 */
function initSettingsPage() {
  // Guard: Check if we're on the settings page
  const changePwdBtn = document.getElementById('changePwdBtn');
  if (!changePwdBtn) {
    return; // Not the settings page
  }

  // Password change functionality
  changePwdBtn.addEventListener('click', function() {
    const current = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirm = document.getElementById('confirmPwd').value;

    if (!current || !newPwd || !confirm) {
      alert('Please fill in all password fields.');
      return;
    }
    if (newPwd.length < 8) {
      alert('New password must be at least 8 characters.');
      return;
    }
    if (newPwd !== confirm) {
      alert('New password and confirmation do not match.');
      return;
    }
    alert('Password changed successfully!');
    document.getElementById('currentPwd').value = '';
    document.getElementById('newPwd').value = '';
    document.getElementById('confirmPwd').value = '';
  });

  // Close button functionality
  const closeBtn = document.querySelector('.close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function() {
      if (confirm('Close BioMonitor?')) {
        document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Inter,sans-serif;color:#6b7a8d;font-size:14px;">Session closed. Refresh to reopen.</div>';
      }
    });
  }

  // Navigation items - prevent default behavior
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(function(item) {
    if (item.getAttribute('href') === '#') {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Page coming soon');
        });
    }
});

  // User dropdown click
  const userDropdown = document.querySelector('.user-dropdown'); //not functioning yet
  if (userDropdown) {
    userDropdown.addEventListener('click', function() {
      alert('User menu dropdown (mockup)');
    });
  }

  // Help button click
  const helpBtn = document.querySelector('.help-btn');
  if (helpBtn) {
    helpBtn.addEventListener('click', function() {
      alert('Help center (mockup)');
    });
  }
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
