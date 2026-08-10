/**
 * BioMonitor — Admin Layout Component
 * Unified sidebar collapse/expand engine with localStorage persistence.
 * Handles both desktop (collapsible) and mobile (overlay) sidebar behavior.
 *
 * Design decisions:
 *   - Sidebar state is persisted in localStorage so returning users
 *     find their preferred layout.
 *   - Uses CSS class switching rather than inline style manipulation
 *     for both performance and maintainability.
 *   - Connection status is polled every 30s so admins are immediately
 *     aware of network issues when entering data in the field.
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');

    /* ============================================
       DESKTOP: Collapse/Expand sidebar
       Persists the collapsed state so users returning to the app
       find their preferred layout without re-toggling.
       ============================================ */
    const toggleBtn = document.getElementById('sidebarToggle');

    // Restore persisted sidebar state from previous session
    const isCollapsed = localStorage.getItem('admin-sidebar-collapsed') === 'true';
    if (sidebar && isCollapsed) {
        sidebar.classList.add('collapsed');
        if (mainContent) mainContent.classList.add('expanded');
    }

    // Toggle action
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (mainContent) mainContent.classList.toggle('expanded');
            localStorage.setItem('admin-sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    /* ============================================
       MOBILE: Open/Close sidebar as overlay
       Hamburger opens; close button and overlay click both dismiss.
       Designed to feel native on touch devices.
       ============================================ */
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    function openMobileSidebar() {
        if (!sidebar) return;
        sidebar.classList.add('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.add('open');
    }

    function closeMobileSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove('mobile-open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('open');
    }

    if (hamburgerBtn) {
        hamburgerBtn.addEventListener('click', openMobileSidebar);
    }
    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeMobileSidebar);
    }
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', closeMobileSidebar);
    }

    /* ============================================
       NAV ITEMS: Active page highlighting + close mobile on navigate
       Highlights the current page's nav item so admins always know
       where they are in the hierarchy.
       ============================================ */
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.sidebar-menu .nav-item');

    navItems.forEach(item => {
        const itemHref = item.getAttribute('href');

        // Highlight active page
        if (itemHref && currentPath.includes(itemHref)) {
            item.classList.add('active');
        }

        // On click: update active class and close mobile sidebar
        item.addEventListener('click', function() {
            navItems.forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });
});

/* ============================================
   USER MENU DROPDOWN
   Populated dynamically from BioData session so the displayed
   name/role/ID always reflects the logged-in user.
   ============================================ */
function initUserMenu() {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) return;

  const dropdown = userMenu.querySelector('.user-dropdown');
  if (!dropdown) return;

  // Populate dropdown from session data
  if (window.BioData) {
    updateUserDropdownFromSession(dropdown);
  }

  // Toggle dropdown on user menu click
  userMenu.addEventListener('click', function(event) {
    event.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', function() {
    dropdown.classList.remove('open');
  });

  // Close dropdown on Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  // Keyboard and click handling for dropdown items
  const items = dropdown.querySelectorAll('.user-dropdown-item');
  items.forEach(function(item) {
    // Click handler
    item.addEventListener('click', function(event) {
      event.stopPropagation();
      handleUserDropdownAction(item);
      dropdown.classList.remove('open');
    });

    // Keyboard: Enter or Space to activate
    item.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        handleUserDropdownAction(item);
        dropdown.classList.remove('open');
      }
    });
  });
}

  /**
   * Update user dropdown content from the current session.
   * Pulls name, email, role, and a generated Account ID from BioData
   * so the dropdown is always in sync with the session state.
   */
function updateUserDropdownFromSession(dropdown) {
  var session = BioData.getSession();
  if (!session) return;

  // Update header title
  var titleEl = dropdown.querySelector('.user-dropdown-title');
  if (titleEl) titleEl.textContent = session.name;

  // Update header subtitle
  var subtitleEl = dropdown.querySelector('.user-dropdown-subtitle');
  if (subtitleEl) subtitleEl.textContent = session.email;

  // Update user-menu name in the trigger
  var userNameEl = document.querySelector('.user-menu-name');
  if (userNameEl) userNameEl.textContent = session.name;

  // Update footer
  var footerSpans = dropdown.querySelectorAll('.user-dropdown-footer span');
  if (footerSpans.length >= 2) {
    // Role
    var roleLabel = session.role === 'admin' ? 'Admin' : 'Field Officer';
    footerSpans[0].textContent = 'Role: ' + roleLabel;

    // Account ID - look up user to get their id
    var user = BioData.getUserByEmail(session.email);
    if (user) {
      var prefix = session.role === 'admin' ? 'ADMIN' : 'FO';
      // padZero is a shared dependency-free helper exposed on BioData;
      // guard against it being unavailable so this never throws.
      var accountId = (window.BioData && typeof window.BioData.padZero === 'function')
        ? prefix + '-' + window.BioData.padZero(user.id, 3)
        : prefix + '-' + user.id;
      footerSpans[1].textContent = 'Account ID: ' + accountId;
    }
  }
}

  /**
   * Handle user dropdown item actions.
   * Currently supports Help (placeholder) and Logout (clears session + redirects).
   */
function handleUserDropdownAction(item) {
  var action = item.getAttribute('data-action');
  if (action === 'help') {
    var helpLink = document.querySelector('.help-link');
    if (helpLink) {
      helpLink.click();
    } else {
      alert('Help documentation would open here.');
    }
  } else if (action === 'logout') {
    if (window.BioData) {
      BioData.logout();
    }
  // Determine correct relative path based on page depth
    var isAdminPage = window.location.pathname.indexOf('/admin/') !== -1;
    window.location.href = isAdminPage ? '../../../index.html' : '../../index.html';
  }
}

/* ============================================
   DASHBOARD ACTIONS
   ============================================ */
function initDashboardActions() {
  const btnNewObservation = document.getElementById('btnNewObservation');
  if (!btnNewObservation) {
    return;
  }

  const btnAddUser = document.getElementById('btnAddUser');
  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnViewAll = document.getElementById('btnViewAll');

  btnNewObservation.addEventListener('click', function() {
    alert('Create New Observation form would open here.');
  });

  if (btnAddUser) {
    btnAddUser.addEventListener('click', function() {
      alert('Add User form would open here.');
    });
  }

  if (btnGenerateReport) {
    btnGenerateReport.addEventListener('click', function() {
      alert('Generating biodiversity report...');
    });
  }

  if (btnViewAll) {
    btnViewAll.addEventListener('click', function() {
      alert('Navigate to full observations page.');
    });
  }
}

/* ============================================
   HEADER ACTIONS
   ============================================ */
function initHeaderActions() {
  const helpLink = document.querySelector('.help-link');
  if (helpLink) {
    helpLink.addEventListener('click', function(event) {
      event.preventDefault();
      alert('Help documentation would open here.');
    });
  }
}

/* ============================================
   NOTIFICATION SYSTEM
   Creates and manages the bell-icon notification dropdown from
   BioData's notification system. Used on all admin pages to surface
   pending/flagged observations and new user registrations.
   ============================================ */
function initNotifications() {
  // Guard: only init on admin pages (BioData must be loaded)
  if (!window.BioData) return;

  var headerRight = document.querySelector('.header-right');
  if (!headerRight) return;

  // Check if notification container already exists to avoid duplicates
  if (document.querySelector('.notification-container')) return;

  // Create the notification container
  var container = document.createElement('div');
  container.className = 'notification-container';

  // Bell button
  var bellBtn = document.createElement('a');
  bellBtn.href = '#';
  bellBtn.className = 'notification-btn';
  bellBtn.setAttribute('aria-label', 'Notifications');
  bellBtn.innerHTML =
    '<span class="material-symbols-outlined">notifications</span>' +
    '<span class="notification-badge" id="notificationBadge">0</span>';

  // Dropdown panel
  var dropdown = document.createElement('div');
  dropdown.className = 'notification-dropdown';
  dropdown.id = 'notificationDropdown';

  // Insert before the user menu (bell on left, username on right)
  var userMenu = headerRight.querySelector('.user-menu');
  if (userMenu) {
    headerRight.insertBefore(container, userMenu);
  } else {
    headerRight.appendChild(container);
  }
  container.appendChild(bellBtn);
  container.appendChild(dropdown);

  // Bell click — toggle dropdown
  bellBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleNotificationDropdown();
  });

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!container.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  // Initial render
  renderNotifications();
}

/**
 * Toggle notification dropdown open/close
 */
function toggleNotificationDropdown() {
  var dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('open');
}

/**
 * Extract the obs=<id> query parameter from a notification link, or null
 * if absent. Dependency-free (no URLSearchParams required).
 */
function getObsFromLink(link) {
  if (!link) return null;
  var qPos = link.indexOf('?');
  if (qPos === -1) return null;
  var qs = link.slice(qPos + 1).split('&');
  for (var i = 0; i < qs.length; i++) {
    var kv = qs[i].split('=');
    if (kv[0] === 'obs' && kv.length > 1) {
      try { return decodeURIComponent(kv[1]); } catch (e) { return kv[1]; }
    }
  }
  return null;
}

/**
 * Render notifications into the dropdown
 */
function renderNotifications() {
  if (!window.BioData) return;

  var dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;

  var badge = document.getElementById('notificationBadge');
  var unreadCount = BioData.getUnreadNotificationCount();

  // Update badge
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  var notifications = BioData.getNotifications({ limit: 50 });
  var html = '';

  if (notifications.length === 0) {
    // Empty state
    html =
      '<div class="notification-empty">' +
        '<span class="material-symbols-outlined">notifications_off</span>' +
        '<p>No notifications yet</p>' +
      '</div>';
  } else {
    // Header with "Mark all as read"
    html +=
      '<div class="notification-dropdown-header">' +
        '<h3>Notifications</h3>' +
        (unreadCount > 0 ? '<button class="notification-mark-read-btn" id="markAllReadBtn">Mark all as read</button>' : '') +
      '</div>';

    // Notification list
    html += '<div class="notification-list">';

    notifications.forEach(function(n) {
      var iconClass = '';
      var iconName = '';

      if (n.type === 'pending_observation') {
        iconClass = 'pending';
        iconName = 'pending_actions';
      } else if (n.type === 'flagged_observation') {
        iconClass = 'flagged';
        iconName = 'flag';
      } else if (n.type === 'new_user') {
        iconClass = 'new-user';
        iconName = 'person_add';
      } else {
        iconClass = 'pending';
        iconName = 'notifications';
      }

      // Format time
      var timeAgo = formatTimeAgo(n.created_at);

      html +=
        '<div class="notification-item' + (n.read ? '' : ' unread') + '" data-notif-id="' + n.id + '"' + (n.link ? ' data-link="' + n.link + '"' : '') + '>' +
          '<div class="notification-icon ' + iconClass + '">' +
            '<span class="material-symbols-outlined">' + iconName + '</span>' +
          '</div>' +
          '<div class="notification-content">' +
            '<div class="notification-title">' + escapeHtml(n.title) + '</div>' +
            '<div class="notification-message">' + escapeHtml(n.message) + '</div>' +
            '<div class="notification-time">' + timeAgo + '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
  }

  dropdown.innerHTML = html;

  // Attach click handlers to notification items
  var items = dropdown.querySelectorAll('.notification-item');
  items.forEach(function(item) {
    item.addEventListener('click', function(e) {
      var id = item.getAttribute('data-notif-id');
      var link = item.getAttribute('data-link');

      // Mark as read
      if (id && window.BioData) {
        BioData.markNotificationRead(id);
        renderNotifications(); // Re-render to update badge & list
      }

      // Same-page deep-link: if we're already on the observations page and
      // the notification points there with an ?obs= param, open the modal
      // directly — navigating would only change the URL and would NOT re-run
      // the load-time deep-link handler, so the modal would never appear.
      var isOnObservationsPage = document.body && document.body.classList.contains('page-observations');
      var linkObs = isOnObservationsPage ? getObsFromLink(link) : null;
      if (isOnObservationsPage && linkObs && typeof window.openObservationById === 'function') {
        window.openObservationById(linkObs);
      } else {
        // Navigate if link exists (first-time load / other pages — the
        // observations page opens the modal via its load-time deep-link).
        if (link) {
          window.location.href = link;
        }
      }

      // Close dropdown
      dropdown.classList.remove('open');
    });
  });

  // Attach "Mark all as read" handler
  var markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (window.BioData) {
        BioData.markAllNotificationsRead();
        renderNotifications();
      }
    });
  }
}

/**
 * Format a date string into a human-readable "time ago" string
 */
function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  var now = new Date();
  var date = new Date(dateStr);
  var diffMs = now - date;
  var diffMin = Math.floor(diffMs / (1000 * 60));
  var diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return diffMin + 'm ago';
  if (diffHrs < 24) return diffHrs + 'h ago';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Simple HTML escaping
 */
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// Initialize when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initUserMenu();
    initHeaderActions();
    initDashboardActions();
    initNotifications();
  });
}

/**
 * Update connection status indicator in sidebar footer.
 * States: Connected (green), Slow (amber), Disconnected (red).
 * Polls every 30s and listens for browser online/offline events so
 * admins working in remote areas see network changes immediately.
 */
function updateConnectionStatus() {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (!dot || !text) return;

  if (!navigator.onLine) {
    dot.classList.remove('slow');
    dot.classList.add('disconnected');
    text.textContent = 'Disconnected';
    return;
  }

  // Check connection type for slow detection (Chrome-based browsers)
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    // effectiveType: 'slow-2g', '2g', '3g', '4g'
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      dot.classList.remove('disconnected');
      dot.classList.add('slow');
      text.textContent = 'Slow';
      return;
    }
  }

  // Default: connected
  dot.classList.remove('disconnected', 'slow');
  text.textContent = 'Connected';
}

// Check connection status on load and poll every 30 seconds
document.addEventListener('DOMContentLoaded', function() {
  updateConnectionStatus();
  setInterval(updateConnectionStatus, 30000);
});

// Also update when browser fires online/offline events
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Listen for connection type changes (Chrome-based browsers)
if (navigator.connection) {
  navigator.connection.addEventListener('change', updateConnectionStatus);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initUserMenu, initHeaderActions };
}