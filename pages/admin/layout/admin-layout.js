/**
 * ZitBio — Admin Layout Component
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

        // On click: update active class and close mobile sidebar.
        // Logout is an <a href> pointing at the login page, so it must be
        // intercepted — otherwise the browser navigates before the session is
        // ended and the next person on the machine inherits a live admin
        // session (#39).
        item.addEventListener('click', function (e) {
            if (item.id === 'navLogout' || item.getAttribute('data-action') === 'logout') {
                e.preventDefault();
                endSessionAndRedirect();
                return;
            }
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
   Populated from the *verified* identity handed over by the route guard, so
   the displayed name/role/account always describes the person who is actually
   signed in. Before #86 this painted from a session whose profile had not
   arrived yet, and its `|| 'field_officer'` fallback is why an admin could read
   "Role: Field Officer" next to a hardcoded "Account ID: ADM-001".
   ============================================ */

// Repaint hook for the one `session:changed` subscription below. Kept at module
// scope so a later initUserMenu() cannot leave the subscription pointing at a
// dropdown that has been replaced.
var repaintUserMenu = null;
var userMenuRepaintBound = false;

function initUserMenu(verifiedProfile) {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) return;

  const dropdown = userMenu.querySelector('.user-dropdown');
  if (!dropdown) return;

  // Populate dropdown from the identity the guard verified
  repaintUserMenu = function() {
    if (window.BioData) {
      updateUserDropdownFromSession(dropdown, verifiedProfile);
    }
  };
  repaintUserMenu();

  // Repaint whenever the identity settles. The guard's verdict is already on the
  // session by the time this runs, but two later events can still change what we
  // should show — the session hydrating from the profile fetch, and a token
  // refresh carrying a new role. Without this, the first paint was permanent.
  if (window.BioData && typeof BioData.subscribe === 'function' && !userMenuRepaintBound) {
    userMenuRepaintBound = true;
    BioData.subscribe('session:changed', function() {
      if (repaintUserMenu) repaintUserMenu();
    });
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
   * Paint the user dropdown from the current identity.
   *
   * `verifiedProfile` is the route guard's verdict and always wins over the
   * cached session, which is a cache that may not have hydrated yet: this is the
   * difference between showing the role that was verified and showing a guess.
   * Name, email, role and account code are all rewritten on every call, because
   * the markup ships one person's details as a hardcoded placeholder — correct
   * for exactly one of the accounts that can load these pages.
   */
function updateUserDropdownFromSession(dropdown, verifiedProfile) {
  var session = (window.BioData && BioData.getSession) ? BioData.getSession() : null;
  if (!session && !verifiedProfile) return;

  var role = (verifiedProfile && verifiedProfile.role) || (session && session.role) || null;
  var name = (verifiedProfile && verifiedProfile.full_name) || (session && session.name) || '';
  var email = (verifiedProfile && verifiedProfile.email) || (session && session.email) || '';
  var accountSource = (verifiedProfile && verifiedProfile.id) || (session && session.id) || '';
  var roleLabel = role === 'admin' ? 'Admin'
    : (role === 'field_officer' ? 'Field Officer' : '\u2014');

  // Update header title
  var titleEl = dropdown.querySelector('.user-dropdown-title');
  if (titleEl && name) titleEl.textContent = name;

  // Update header subtitle
  var subtitleEl = dropdown.querySelector('.user-dropdown-subtitle');
  if (subtitleEl && email) subtitleEl.textContent = email;

  // Update user-menu name in the trigger
  var userNameEl = document.querySelector('.user-menu-name');
  if (userNameEl && name) userNameEl.textContent = name;

  // Update footer — role, then the account code that belongs to that same person
  var footerSpans = dropdown.querySelectorAll('.user-dropdown-footer span');
  if (footerSpans.length >= 2) {
    footerSpans[0].textContent = 'Role: ' + roleLabel;
    footerSpans[1].textContent = 'Account ID: ' + BioData.formatAccountId(accountSource, role);
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
      reportPlaceholder();
    }
  } else if (action === 'logout') {
    endSessionAndRedirect();
  }
}

/* ============================================
   LOGOUT — the single path for every logout control
   ============================================ */

// Guards against a double invocation when both the dropdown item and the
// sidebar link are reachable in the same click sequence.
var _loggingOut = false;

/**
 * End the session, then return to the login page.
 *
 * Used by BOTH the avatar dropdown item (data-action="logout") and the sidebar
 * link (#navLogout) so the two controls cannot behave differently again (#39).
 *
 * Clears AUTHENTICATION state only. The cached observation/registry data is
 * deliberately preserved so offline field work survives a logout — see the
 * Security + Identity milestone, decision #2.
 */
function endSessionAndRedirect() {
  if (_loggingOut) return;
  _loggingOut = true;

  function finish() {
    if (window.BioData) {
      BioData.logout();
    }
    // BioData.logout() writes an explicit null; drop the key entirely so no
    // stale session marker survives on a shared machine. (Signing out also
    // removes the sb-*-auth-token key, which is what actually matters.)
    try { localStorage.removeItem('biodata_session'); } catch (err) { /* storage unavailable */ }

    // Correct relative path depends on page depth.
    var isAdminPage = window.location.pathname.indexOf('/admin/') !== -1;
    window.location.href = isAdminPage ? '../../../index.html' : '../../index.html';
  }

  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    // Redirect regardless of whether signOut resolves or rejects — a failed
    // network call must not leave the user stuck on a protected page.
    BioSupabase.signOut().then(finish).catch(finish);
  } else {
    finish();
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
    window.location.href = '../../field-officer/field-officer.html';
  });

  if (btnAddUser) {
    btnAddUser.addEventListener('click', function() {
      window.location.href = '../users/users.html';
    });
  }

  if (btnGenerateReport) {
    btnGenerateReport.addEventListener('click', function() {
      window.location.href = '../analytics/analytics.html#tab-report';
    });
  }

  if (btnViewAll) {
    btnViewAll.addEventListener('click', function() {
      window.location.href = '../observations/observations.html';
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
      reportPlaceholder();
    });
  }
}

/**
 * Help is still a stub. Reported as a toast rather than a blocking alert() — a
 * modal dialog for "this does nothing yet" interrupts the task for no reason
 * (#52).
 */
function reportPlaceholder() {
  var message = 'Help documentation is not available yet.';
  if (typeof showToast === 'function') showToast(message, 'warning');
  else console.warn(message);
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

  // The bell mounts beside the user menu. Admin pages wrap that menu in
  // .header-right; the field-officer top bar does not, so fall back to the
  // menu's own parent. Without this the FO page had NO bell at all, which made
  // routing verdicts to an officer pointless (#71).
  var headerRight = document.querySelector('.header-right');
  if (!headerRight) {
    // Pages with no header-right group (the field-officer top bar) previously got
    // the bell inserted as a sibling of the logo. With the top bar laid out
    // space-between, that stranded the bell in the MIDDLE of the header and left
    // its dropdown floating away from the user menu. Group the bell WITH the
    // user menu instead, so both sit at the right-hand edge.
    var menuEl = document.querySelector('.user-menu');
    if (menuEl && menuEl.parentNode) {
      headerRight = document.createElement('div');
      headerRight.className = 'header-right';
      menuEl.parentNode.insertBefore(headerRight, menuEl);
      headerRight.appendChild(menuEl);
    }
  }
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
    '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-notifications"/></svg>' +
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

  // Re-render live when cloud notifications change (realtime + explicit loads).
  window.addEventListener('biodata:notifications', function() {
    renderNotifications();
  });
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
 * Stable identity for a notification across BOTH stores.
 *
 * The same logical notification exists twice: locally with an id like
 * `notif_7` (BioData's counter) and in the cloud with a UUID. Their
 * `created_at` values also differ slightly (client clock vs the DB trigger),
 * and their ids never match, so neither field can be used to dedupe. What the
 * two copies DO share is the event they describe: `type` plus `related_id`.
 */
function notificationKey(n) {
  var related = n.related_id || '';
  if (related) return n.type + '|' + related;
  return n.type + '|' + (n.title || '') + '|' + (n.message || '');
}

/**
 * Cloud ids are UUIDs from the notifications table; local ids are `notif_N`.
 * Routing on the shape avoids firing an UPDATE that Postgres rejects as
 * "invalid input syntax for type uuid" on every local notification click.
 */
function isCloudNotificationId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

/**
 * Render notifications into the dropdown.
 *
 * Merges BOTH sources rather than preferring one (decision 2026-09-13, #45).
 * The previous either/or chose the cloud cache whenever BioSync was loaded —
 * which is always — so a notification created locally in this session stayed
 * invisible until the cloud round-trip returned it, and if the cloud fetch
 * failed the user saw "No notifications yet" while local ones existed.
 *
 * The cloud copy wins when an event exists in both, because it carries the
 * real id, the real read state, and rows the server wrote for other admins.
 */
function renderNotifications() {
  var dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;

  if (!window.BioData && !window.BioSync) return;

  var cloud = (window.BioSync && typeof window.BioSync.getNotificationsCache === 'function')
    ? window.BioSync.getNotificationsCache()
    : [];
  var local = window.BioData
    ? window.BioData.getNotifications({ limit: 50 })
    : [];

  var seen = {};
  var notifications = [];
  cloud.concat(local).forEach(function(n) {
    if (!n || !n.id) return;
    var key = notificationKey(n);
    if (seen[key]) return;
    seen[key] = true;
    notifications.push(n);
  });

  notifications.sort(function(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  // Counted from the merged list. The old code read the unread count from a
  // different store than the one it rendered, so the badge could disagree with
  // the list directly beneath it.
  var unreadCount = notifications.filter(function(n) { return !n.read; }).length;

  var badge = document.getElementById('notificationBadge');

  // Update badge
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.add('show');
    } else {
      badge.classList.remove('show');
    }
  }

  var html = '';

  if (notifications.length === 0) {
    // Empty state
    html =
      '<div class="notification-empty">' +
        '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-notifications_off"/></svg>' +
        '<p>No notifications yet</p>' +
      '</div>';
  } else {
    // Header with "Mark all as read" + "Clear all"
    html +=
      '<div class="notification-dropdown-header">' +
        '<h3>Notifications</h3>' +
        '<div class="notification-header-actions">' +
          (unreadCount > 0 ? '<button class="notification-mark-read-btn" id="markAllReadBtn">Mark all read</button>' : '') +
          '<button class="notification-mark-read-btn" id="notificationClearBtn">Clear all</button>' +
        '</div>' +
      '</div>';

    // Notification list
    html += '<div class="notification-list">';

    notifications.forEach(function(n) {
      if (!n || !n.id) return;
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
      } else if (n.type === 'population_warning') {
        iconClass = 'flagged';
        iconName = 'trending_down';
      } else if (n.type === 'observation_verdict') {
        iconClass = 'new-user';
        iconName = 'verified';
      } else if (n.type === 'submission_verdict') {
        // The officer's own record was reviewed (#71) — a distinct icon so it
        // reads differently from an admin-side verdict in the same bell.
        iconClass = 'new-user';
        iconName = 'verified';
      } else if (n.type === 'observation_edited') {
        iconClass = 'new-user';
        iconName = 'edit_note';
      } else if (n.type === 'observation_deleted') {
        iconClass = 'flagged';
        iconName = 'delete';
      } else {
        iconClass = 'pending';
        iconName = 'notifications';
      }

      // Format time
      var timeAgo = formatTimeAgo(n.created_at);

      html +=
        '<div class="notification-item' + (n.read ? '' : ' unread') + '" data-notif-id="' + n.id + '"' + (n.link ? ' data-link="' + n.link + '"' : '') + '>' +
          '<div class="notification-icon ' + iconClass + '">' +
            '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-' + iconName + '"/></svg>' +
          '</div>' +
          '<div class="notification-content">' +
            '<div class="notification-title">' + escapeHtml(n.title) + '</div>' +
            '<div class="notification-message">' + escapeHtml(n.message) + '</div>' +
            '<div class="notification-time">' + timeAgo + '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';

    // Retention is enforced server-side by the notifications_enforce_retention
    // trigger (#77): read rows older than 30 days are deleted on the next
    // insert for that user. Say so here, otherwise a notification vanishing
    // looks like a bug. The 30 matches p_read_days in migration
    // 202609130014 — if that constant changes, change this string.
    html +=
      '<div class="notification-retention-note">' +
        'Read notifications are cleared after 30 days' +
      '</div>';
  }

  dropdown.innerHTML = html;

  // Attach click handlers to notification items
  var items = dropdown.querySelectorAll('.notification-item');
  items.forEach(function(item) {
    item.addEventListener('click', function(e) {
      var id = item.getAttribute('data-notif-id');
      var link = item.getAttribute('data-link');

      // Mark as read. Routed by id shape (#45): cloud rows carry UUIDs, locally
      // created rows carry `notif_N`, and sending `notif_N` to the cloud fails
      // as an invalid uuid on every click.
      if (id) {
        if (isCloudNotificationId(id) && window.BioSync && window.BioSync.markNotificationRead) {
          window.BioSync.markNotificationRead(id).catch(function(err) {
            console.warn('BioSync: mark read failed:', err && err.message);
            if (window.BioData) { BioData.markNotificationRead(id); renderNotifications(); }
          });
        } else if (window.BioData) {
          BioData.markNotificationRead(id);
          renderNotifications();
        }
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
      // Local rows are not covered by the cloud UPDATE, so clear them too —
      // otherwise the badge keeps counting notifications as unread that the
      // cloud no longer has (#45 merge).
      if (window.BioData) { BioData.markAllNotificationsRead(); }
      if (window.BioSync && window.BioSync.markAllNotificationsRead) {
        window.BioSync.markAllNotificationsRead().then(function() {
          renderNotifications();
        }).catch(function(err) {
          console.warn('BioSync: mark all read failed:', err && err.message);
          renderNotifications();
        });
      } else {
        renderNotifications();
      }
    });
  }

  // Attach "Clear all" handler (removes notifications entirely).
  var clearAllBtn = document.getElementById('notificationClearBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Clear BOTH stores (#45). Deleting only the cloud rows left local-only
      // notifications in the merged list, so "Clear all" looked broken.
      if (window.BioData) { BioData.clearNotifications(); }
      if (window.BioSync && window.BioSync.clearNotifications) {
        window.BioSync.clearNotifications().then(function() {
          renderNotifications();
        }).catch(function(err) {
          console.warn('BioSync: clear notifications failed:', err && err.message);
          renderNotifications();
        });
      } else {
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
 * Simple HTML escaping.
 * Delegates to lib/escape.js so the app has one implementation; this was a
 * second copy that happened to be correct.
 */
function escapeHtml(str) {
  if (!str) return '';
  return window.BioEscape.escapeHtml(str);
}

// ============================================================
//  ANALYTICS WARNING EVALUATION (full-dataset re-evaluation)
//  ------------------------------------------------------------
//  Distinct from NotificationService's create-event handlers: this is the
//  "re-evaluate everything and see what's now true" pass (Gap 3). Runs once
//  on admin page load (after cloud hydration) to surface low-population
//  warnings as `population_warning` notifications. Guarded so repeated
//  appears on page re-navigation across tabs don't duplicate spam.
// ============================================================
var analyticsEvaluationRan = false;

function enrichAdminObservations(obsList) {
  if (!window.BioData || !window.BioData.resolveSpeciesId) return obsList;
  return obsList.map(function(o) {
    return Object.assign({}, o, {
      species_id: window.BioData.resolveSpeciesId(o) || null,
      site_id: window.BioData.resolveSiteId(o) || null
    });
  });
}

function runAnalyticsEvaluation() {
  // Only the pure analytics engine + data layer are needed; bail silently if
  // they aren't loaded yet (they are on every admin page).
  if (!window.BioAnalytics || !window.BioData) return;
  if (analyticsEvaluationRan) return;
  analyticsEvaluationRan = true;

  var registry = window.BioData.getSpeciesRegistry ? window.BioData.getSpeciesRegistry() : [];
  var verified = enrichAdminObservations(window.BioData.getVerifiedObservations() || []);
  var warnings = window.BioAnalytics.lowPopulationWarnings(verified, { speciesRegistry: registry });
  var active = warnings.filter(function(w) { return w.severity === 'warning' || w.severity === 'critical'; });
  if (active.length === 0) return;

  var existingIds = {};
  (window.BioData.getNotifications({ unread: true }) || []).forEach(function(n) {
    if (n.related_id) existingIds[n.related_id] = true;
  });

  var added = false;
  active.forEach(function(w) {
    var relatedId = 'pop:' + (w.speciesId || 'sp') + ':' + (w.siteId || 'site');
    if (existingIds[relatedId]) return; // already notified (unread) — no spam
    var severityText = w.severity === 'critical' ? 'critically low' : 'below baseline';
    window.BioData.addNotification(
      'population_warning',
      (w.severity === 'critical' ? 'Critical: ' : 'Warning: ') + w.speciesName,
      w.speciesName + ' at ' + w.siteName + ' estimated ' + w.currentCount +
        ' vs baseline ' + w.baseline + ' (' + severityText + ').',
      '../analytics/analytics.html#tab-report',
      relatedId
    );
    added = true;
  });

  if (added && typeof window !== 'undefined') {
    try { window.dispatchEvent(new window.CustomEvent('biodata:notifications')); } catch (e) { /* ignore */ }
  }
}

/* ============================================
   AUTH-PENDING HOLD (#76)
   Protected pages ship `auth-pending` on <body> in their static markup so the
   protected shell cannot paint before the route guard has decided. The guard
   is asynchronous and its offline retry budget is ~10s, so without this hold a
   signed-in field officer opening an admin URL saw the full admin chrome.
   ============================================ */

/**
 * Reveal the page. Idempotent, and safe to call before the guard runs.
 */
function clearAuthPending() {
  if (document.body) document.body.classList.remove('auth-pending');
}

// Safety net: if a script fails to load or throws before a terminal guard path
// runs, the page must not stay invisible forever. Unconditional, and
// deliberately longer than the guard's worst-case decision window so it never
// races the real result. (styles/global.css carries a CSS-only equivalent for
// the case where this file itself never loads.)
window.setTimeout(clearAuthPending, 12000);

// Back/forward cache: a page left while still held is restored with that
// hidden state, but the timeout above does not re-run on restore — so the
// class must be dropped on a persisted pageshow or the page stays invisible.
window.addEventListener('pageshow', function(event) {
  if (event.persisted) clearAuthPending();
});

// Initialize when DOM is ready.
// Protected pages run through the AuthGuard first so unauthenticated or
// wrong-role users are redirected before any privileged UI mounts.
/* ============================================
   CLOUD HYDRATION
   ============================================
   Started as soon as the document is ready — deliberately NOT inside the
   guard's callback. `loadFromCloud()` is a read: RLS decides what comes back,
   and it mounts nothing, so it has no business waiting for a role verdict.
   Serialising it behind the guard is why the shell appeared first and the
   numbers, tables and charts arrived a second or two later — a visible SECOND
   wave of loading after the page had already revealed itself.
   One shared promise, so the guard path still waits on exactly one fetch, and
   a page that reveals before it lands renders what is already cached: the
   `biodata:synced` event re-renders when the rest arrives.
   ============================================ */
var cloudSyncPromise = null;

function startCloudSync() {
  if (cloudSyncPromise) return cloudSyncPromise;
  if (typeof window.BioSync === 'undefined' || typeof window.BioSync.loadFromCloud !== 'function') {
    return null;
  }
  cloudSyncPromise = window.BioSync.loadFromCloud();
  return cloudSyncPromise;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    // Start the read now: it runs ALONGSIDE the guard rather than after it.
    startCloudSync();

    function mountUI(verifiedProfile) {
      // Mount the shell chrome FIRST — the bell and the user menu read only
      // local state (the session and the local notification cache), so they have
      // nothing to wait for. They used to be mounted inside the
      // `loadFromCloud()` callback, which meant the sidebar and header painted
      // immediately but the top bar stayed half-empty for one further network
      // round trip. Cloud notifications still refresh the list when they arrive,
      // via the `biodata:notifications` event that loadNotifications() dispatches.
      //
      // `verifiedProfile` is the route guard's verdict — the one identity that is
      // allowed to say which role the person in front of us holds (#86).
      initUserMenu(verifiedProfile);
      initNotifications();

      // Hydrate the in-memory BioData cache from Supabase on load, then let
      // pages render cloud data. Non-fatal if offline/unconfigured. The read
      // itself was already started above, alongside the guard — this waits on
      // that same promise rather than issuing a second one.
      var cloudSync = startCloudSync();
      if (cloudSync) {
        cloudSync
          .then(function() {
            // Re-mount UI after cloud data is seeded so tables/charts reflect
            // the authoritative dataset.
            initHeaderActions();
            initDashboardActions();
            // Cloud notifications: initial load + live postgres_changes updates.
            if (window.BioSync.loadNotifications && window.BioSync.registerNotificationRealtime) {
              window.BioSync.loadNotifications();
              window.BioSync.registerNotificationRealtime();
            }
            // Analytics registries (species + sites): cloud → BioData cache.
            if (window.BioSync.loadRegistries) {
              window.BioSync.loadRegistries().catch(function(err) {
                console.warn('BioSync: registry load failed:', err && err.message);
              });
            }
            // Full-dataset re-evaluation (low-population warnings) after the
            // authoritative cloud data is seeded — once per page session.
            runAnalyticsEvaluation();
          })
          .catch(function() {
            // Offline or not configured — the local cache is already mounted.
            initHeaderActions();
            initDashboardActions();
          });
      } else {
        initHeaderActions();
        initDashboardActions();
      }
    }

    if (typeof window.AuthGuard !== 'undefined') {
      var body = document.body;
      var isAdminPage = body &&
        (body.classList.contains('page-dashboard') ||
         body.classList.contains('page-observations') ||
         body.classList.contains('page-analytics') ||
         body.classList.contains('page-users') ||
         body.classList.contains('page-settings'));

      var guardPromise = isAdminPage
        ? AuthGuard.requireRole(['admin'])
        : AuthGuard.requireAuthenticated();

      guardPromise.then(function(result) {
        // Deliberately still held when redirecting: the page is navigating
        // away, and revealing it would repaint the exact chrome this hold
        // exists to hide. If that navigation never lands, the 12s safety net
        // above reveals the page anyway — a refused user is never stranded.
        if (result && result.redirecting) return; // being redirected — don't mount UI
        clearAuthPending();
        mountUI(result && result.profile);
      }).catch(function() {
        // Guard failed (network, config) — fall back to login to be safe.
        // Held for the same reason as the redirect branch; the safety net
        // covers a navigation that never completes.
        window.location.href = '../../../index.html';
      });
    } else {
      // AuthGuard not loaded (legacy/mock path) — proceed as before.
      clearAuthPending();
      mountUI();
    }
  });
}

/**
 * Update connection status indicator in sidebar footer.
 * Network fallback states: Online, Slow network, Offline.
 * Polls every 30s and listens for browser online/offline events so
 * admins working in remote areas see network changes immediately.
 */
var syncStatusKnown = false;

function updateConnectionStatus() {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (!dot || !text) return;

  if (!navigator.onLine) {
    dot.classList.remove('slow');
    dot.classList.add('disconnected');
    text.textContent = 'Offline';
    return;
  }

  // Check connection type for slow detection (Chrome-based browsers)
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    // effectiveType: 'slow-2g', '2g', '3g', '4g'
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      if (syncStatusKnown) return;
      dot.classList.remove('disconnected');
      dot.classList.add('slow');
      text.textContent = 'Slow network';
      return;
    }
  }

  // Default: connected
  if (syncStatusKnown) return;
  dot.classList.remove('disconnected', 'slow');
  text.textContent = 'Online';
}

function setSyncStatus(label, state) {
  var dot = document.getElementById('statusDot');
  var text = document.getElementById('statusText');
  if (!dot || !text) return;
  dot.classList.remove('disconnected', 'slow', 'syncing');
  if (state) dot.classList.add(state);
  text.textContent = label;
}

function applySavedTheme() {
  // Resolution lives in lib/theme-init.js, which runs in <head> BEFORE the
  // stylesheets so the palette is already on <html> for the first paint. This
  // call therefore only re-syncs what depends on chrome this script owns: the
  // toggle's icon and the browser's own theme-color meta.
  var activeTheme = window.BioTheme ? window.BioTheme.apply() : 'light';
  syncThemeColorMeta(activeTheme);
  updateThemeToggleIcon(activeTheme);
}

/**
 * Keep the browser's own chrome in step with the theme (#68).
 *
 * `<meta name="theme-color">` is static in each page's HTML so it is already
 * correct on first paint, before any script has run. But the user can switch
 * theme at runtime, and without this the mobile address bar / status bar would
 * stay light green-grey over a dark page — the one part of the UI the theme
 * cannot reach from CSS. Values mirror --color-bg in styles/theme.css.
 *
 * One implementation, shared with the early bootstrap: lib/theme-init.js needs
 * the same two values before this script has loaded, and a second copy of them
 * is exactly how they drift apart.
 */
function syncThemeColorMeta(activeTheme) {
  if (window.BioTheme && window.BioTheme.syncMeta) window.BioTheme.syncMeta(activeTheme);
}

function updateThemeToggleIcon(activeTheme) {
  var btn = document.getElementById('navAppearance');
  if (!btn) return;
  var icon = btn.querySelector('.nav-icon use');
  if (icon) icon.setAttribute('href', activeTheme === 'dark' ? '#i-dark_mode' : '#i-light_mode');
  btn.setAttribute('data-tooltip', activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  btn.setAttribute('aria-label', activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function initThemeToggle() {
  var btn = document.getElementById('navAppearance');
  if (!btn || btn.getAttribute('data-theme-toggle') === 'bound') return;
  btn.setAttribute('data-theme-toggle', 'bound');
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    var current = (document.documentElement.getAttribute('data-theme') || 'light') === 'dark' ? 'dark' : 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    if (window.BioTheme) {
      window.BioTheme.set(next);
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
    syncThemeColorMeta(next);
    updateThemeToggleIcon(next);
  });
}

// Check connection status on load and poll every 30 seconds
document.addEventListener('DOMContentLoaded', function() {
  applySavedTheme();
  initThemeToggle();
  setSyncStatus(navigator.onLine ? 'Syncing' : 'Offline', navigator.onLine ? 'syncing' : 'disconnected');
  setInterval(updateConnectionStatus, 30000);
});

// Also update when browser fires online/offline events
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

window.addEventListener('biodata:syncing', function() {
  syncStatusKnown = true;
  setSyncStatus('Syncing', 'syncing');
});
window.addEventListener('biodata:synced', function() {
  syncStatusKnown = true;
  setSyncStatus('Synced', '');
});
window.addEventListener('biodata:sync-error', function() {
  syncStatusKnown = true;
  setSyncStatus(navigator.onLine ? 'Local only' : 'Offline', navigator.onLine ? 'slow' : 'disconnected');
});

// Listen for connection type changes (Chrome-based browsers)
if (navigator.connection) {
  navigator.connection.addEventListener('change', updateConnectionStatus);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initUserMenu, initHeaderActions };
}