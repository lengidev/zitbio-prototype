/**
 * Admin shell: sidebar, user menu, notifications, connection status, theme toggle.
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');

    /* DESKTOP: Collapse/Expand sidebar */
    const toggleBtn = document.getElementById('sidebarToggle');

    const isCollapsed = localStorage.getItem('admin-sidebar-collapsed') === 'true';
    if (sidebar && isCollapsed) {
        sidebar.classList.add('collapsed');
        if (mainContent) mainContent.classList.add('expanded');
    }

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (mainContent) mainContent.classList.toggle('expanded');
            localStorage.setItem('admin-sidebar-collapsed', sidebar.classList.contains('collapsed'));
        });
    }

    /* MOBILE: Open/Close sidebar as overlay */
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

    /* NAV ITEMS: Active page highlighting + close mobile on navigate */
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.sidebar-menu .nav-item');

    navItems.forEach(item => {
        const itemHref = item.getAttribute('href');

        if (itemHref && currentPath.includes(itemHref)) {
            item.classList.add('active');
        }

        // Logout is an <a href>, so it must be intercepted: otherwise the browser
        // navigates before the session ends and the next person on the machine
        // inherits a live admin session.
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

/* USER MENU DROPDOWN */

// Module-scoped repaint hook so the one `session:changed` subscription below
// cannot be left pointing at a dropdown that has been replaced.
var repaintUserMenu = null;
var userMenuRepaintBound = false;

function initUserMenu(verifiedProfile) {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) return;

  const dropdown = userMenu.querySelector('.user-dropdown');
  if (!dropdown) return;

  repaintUserMenu = function() {
    if (window.BioData) {
      updateUserDropdownFromSession(dropdown, verifiedProfile);
    }
  };
  repaintUserMenu();

  // Repaint when the identity settles: the session can hydrate from the profile
  // fetch and a token refresh can carry a new role, and without this the first
  // paint was permanent.
  if (window.BioData && typeof BioData.subscribe === 'function' && !userMenuRepaintBound) {
    userMenuRepaintBound = true;
    BioData.subscribe('session:changed', function() {
      if (repaintUserMenu) repaintUserMenu();
    });
  }

  userMenu.addEventListener('click', function(event) {
    event.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', function() {
    dropdown.classList.remove('open');
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  const items = dropdown.querySelectorAll('.user-dropdown-item');
  items.forEach(function(item) {
    item.addEventListener('click', function(event) {
      event.stopPropagation();
      handleUserDropdownAction(item);
      dropdown.classList.remove('open');
    });

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
   * `verifiedProfile` is the guard's verdict and always wins over the cached
   * session, which may not have hydrated: the difference between the verified
   * role and a guess. Every label is rewritten because the markup ships one
   * person's details as a hardcoded placeholder.
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

  var titleEl = dropdown.querySelector('.user-dropdown-title');
  if (titleEl && name) titleEl.textContent = name;

  var subtitleEl = dropdown.querySelector('.user-dropdown-subtitle');
  if (subtitleEl && email) subtitleEl.textContent = email;

  var userNameEl = document.querySelector('.user-menu-name');
  if (userNameEl && name) userNameEl.textContent = name;

  // Role and account code must describe one identity, never two.
  var footerSpans = dropdown.querySelectorAll('.user-dropdown-footer span');
  if (footerSpans.length >= 2) {
    footerSpans[0].textContent = 'Role: ' + roleLabel;
    footerSpans[1].textContent = 'Account ID: ' + BioData.formatAccountId(accountSource, role);
  }
}

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

/* LOGOUT: the single path for every logout control */

// Guards against a double invocation when both logout controls are clicked.
var _loggingOut = false;

/**
 * Ends the session and returns to login. Both logout controls route through
 * here so they cannot behave differently again. Clears AUTHENTICATION state
 * only: cached observation/registry data is deliberately kept so offline field
 * work survives a logout.
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

    // Only two depths can reach here: pages/admin/* and pages/field-officer/*.
    var isAdminPage = window.location.pathname.indexOf('/admin/') !== -1;
    window.location.href = isAdminPage ? '../../../index.html' : '../../index.html';
  }

  if (window.BioSupabase && window.BioSupabase.isConfigured()) {
    // Redirect whether signOut resolves or rejects: a failed network call must
    // not leave the user stuck on a protected page.
    BioSupabase.signOut().then(finish).catch(finish);
  } else {
    finish();
  }
}

/* DASHBOARD ACTIONS */
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

/* HEADER ACTIONS */
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
 * Reported as a toast, not a blocking alert(): a modal dialog for "this does
 * nothing yet" interrupts the task for no reason.
 */
function reportPlaceholder() {
  var message = 'Help documentation is not available yet.';
  if (typeof showToast === 'function') showToast(message, 'warning');
  else console.warn(message);
}

/* NOTIFICATION SYSTEM */
function initNotifications() {
  if (!window.BioData) return;

  // The bell mounts beside the user menu. Admin pages wrap that menu in
  // .header-right and the field-officer top bar does not, so fall back to the
  // menu's own parent: without this the FO page had no bell at all, so routing
  // verdicts to an officer was useless.
  var headerRight = document.querySelector('.header-right');
  if (!headerRight) {
    // Group the bell WITH the user menu rather than as a sibling of the logo:
    // this top bar is space-between, so the bell landed in the MIDDLE of the
    // header with its dropdown floating away from the menu.
    var menuEl = document.querySelector('.user-menu');
    if (menuEl && menuEl.parentNode) {
      headerRight = document.createElement('div');
      headerRight.className = 'header-right';
      menuEl.parentNode.insertBefore(headerRight, menuEl);
      headerRight.appendChild(menuEl);
    }
  }
  if (!headerRight) return;

  if (document.querySelector('.notification-container')) return;

  var container = document.createElement('div');
  container.className = 'notification-container';

  var bellBtn = document.createElement('a');
  bellBtn.href = '#';
  bellBtn.className = 'notification-btn';
  bellBtn.setAttribute('aria-label', 'Notifications');
  bellBtn.innerHTML =
    '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-notifications"/></svg>' +
    '<span class="notification-badge" id="notificationBadge">0</span>';

  var dropdown = document.createElement('div');
  dropdown.className = 'notification-dropdown';
  dropdown.id = 'notificationDropdown';

  var userMenu = headerRight.querySelector('.user-menu');
  if (userMenu) {
    headerRight.insertBefore(container, userMenu);
  } else {
    headerRight.appendChild(container);
  }
  container.appendChild(bellBtn);
  container.appendChild(dropdown);

  bellBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleNotificationDropdown();
  });

  document.addEventListener('click', function(e) {
    if (!container.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  renderNotifications();

  window.addEventListener('biodata:notifications', function() {
    renderNotifications();
  });
}

function toggleNotificationDropdown() {
  var dropdown = document.getElementById('notificationDropdown');
  if (!dropdown) return;
  dropdown.classList.toggle('open');
}

/**
 * `obs=<id>` from a notification link, or null. Dependency-free, no URLSearchParams.
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
 * Stable identity for a notification across BOTH stores: local ids are
 * `notif_7` and cloud ids are UUIDs, and the two `created_at` values differ
 * (client clock vs the DB trigger), so neither field can dedupe them. What both
 * copies share is the event they describe: `type` plus `related_id`.
 */
function notificationKey(n) {
  var related = n.related_id || '';
  if (related) return n.type + '|' + related;
  return n.type + '|' + (n.title || '') + '|' + (n.message || '');
}

/**
 * Local ids are `notif_N`, cloud ids are UUIDs. Routing on the shape avoids an
 * UPDATE Postgres rejects as "invalid input syntax for type uuid" on every click.
 */
function isCloudNotificationId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ''));
}

/**
 * Merges BOTH sources rather than preferring one: preferring the cloud cache
 * (always loaded) hid a notification created locally in this session until the
 * round trip returned it, and showed "No notifications yet" when the fetch
 * failed while local ones existed. The cloud copy wins when both carry the same
 * event: it has the real id, the real read state, and rows other admins wrote.
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

  // Counted from the merged list: reading the count from a different store than
  // the one rendered let the badge disagree with the list beneath it.
  var unreadCount = notifications.filter(function(n) { return !n.read; }).length;

  var badge = document.getElementById('notificationBadge');

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
    html =
      '<div class="notification-empty">' +
        '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-notifications_off"/></svg>' +
        '<p>No notifications yet</p>' +
      '</div>';
  } else {
    html +=
      '<div class="notification-dropdown-header">' +
        '<h3>Notifications</h3>' +
        '<div class="notification-header-actions">' +
          (unreadCount > 0 ? '<button class="notification-mark-read-btn" id="markAllReadBtn">Mark all read</button>' : '') +
          '<button class="notification-mark-read-btn" id="notificationClearBtn">Clear all</button>' +
        '</div>' +
      '</div>';

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
        // The officer's own record was reviewed: a distinct icon so it reads
        // differently from an admin-side verdict in the same bell.
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

    // Retention is enforced server-side (notifications_enforce_retention): read
    // rows older than 30 days are deleted on the next insert for that user. Say
    // so here, otherwise a notification vanishing looks like a bug. The 30 must
    // match p_read_days in migration 202609130014.
    html +=
      '<div class="notification-retention-note">' +
        'Read notifications are cleared after 30 days' +
      '</div>';
  }

  dropdown.innerHTML = html;

  var items = dropdown.querySelectorAll('.notification-item');
  items.forEach(function(item) {
    item.addEventListener('click', function(e) {
      var id = item.getAttribute('data-notif-id');
      var link = item.getAttribute('data-link');

      // Routed by id shape: sending `notif_N` to the cloud fails as an invalid uuid.
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

      // On the observations page, open the modal directly: navigating would only
      // change the URL and NOT re-run the load-time deep-link handler, so the
      // modal would never appear.
      var isOnObservationsPage = document.body && document.body.classList.contains('page-observations');
      var linkObs = isOnObservationsPage ? getObsFromLink(link) : null;
      if (isOnObservationsPage && linkObs && typeof window.openObservationById === 'function') {
        window.openObservationById(linkObs);
      } else {
        // Any other page: navigate, and let its load-time deep-link open the modal.
        if (link) {
          window.location.href = link;
        }
      }

      dropdown.classList.remove('open');
    });
  });

  var markAllBtn = document.getElementById('markAllReadBtn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Local rows are not covered by the cloud UPDATE, so mark them too:
      // otherwise the badge keeps counting notifications the cloud no longer has.
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

  var clearAllBtn = document.getElementById('notificationClearBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Clear BOTH stores: deleting only the cloud rows left local-only
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
 * Delegates to lib/escape.js so the app keeps one implementation: this was a
 * second copy that happened to be correct.
 */
function escapeHtml(str) {
  if (!str) return '';
  return window.BioEscape.escapeHtml(str);
}

//  ANALYTICS WARNING EVALUATION (full-dataset re-evaluation)
//  Distinct from NotificationService's create-event handlers: this is the
//  re-evaluate-everything pass, guarded so re-navigating across tabs cannot
//  duplicate the warnings.
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
    if (existingIds[relatedId]) return; // already notified while unread, so no spam
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

/* AUTH-PENDING HOLD */

function clearAuthPending() {
  if (document.body) document.body.classList.remove('auth-pending');
}

// Safety net: a script that fails to load must not leave the page invisible
// forever. Unconditional, and deliberately longer than the guard's worst-case
// decision window so it never races the real result. styles/global.css carries
// a CSS-only equivalent for when this file itself never loads.
window.setTimeout(clearAuthPending, 12000);

// Back/forward cache: a held page is restored with that hidden state and the
// timeout above does not re-run, so the class must be dropped on a persisted
// pageshow or the page stays invisible.
window.addEventListener('pageshow', function(event) {
  if (event.persisted) clearAuthPending();
});

// Protected pages run through the AuthGuard first, so a wrong role never mounts
// privileged UI.
/* CLOUD HYDRATION
   Deliberately started before the guard has decided, not inside its callback:
   loadFromCloud() is a read and RLS decides what comes back, so it mounts
   nothing and has no business waiting for a role verdict. */
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
    startCloudSync();

    function mountUI(verifiedProfile) {
      // Mount the shell chrome FIRST: the bell and the user menu read only local
      // state, so they have nothing to wait for. Mounting them inside the
      // `loadFromCloud()` callback left the top bar half-empty for one further
      // network round trip. `verifiedProfile` is the guard's verdict, the one
      // identity allowed to say which role the person in front of us holds.
      initUserMenu(verifiedProfile);
      initNotifications();

      // Waits on the read started above rather than issuing a second one, and is
      // non-fatal when offline: the local cache is already mounted.
      var cloudSync = startCloudSync();
      if (cloudSync) {
        cloudSync
          .then(function() {
            // Re-mount so tables and charts reflect the authoritative dataset.
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
            // Low-population re-evaluation, once the authoritative data is seeded.
            runAnalyticsEvaluation();
          })
          .catch(function() {
            // Offline or unconfigured: the local cache is already mounted.
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
        // Still held while redirecting: revealing it would repaint the exact
        // chrome this hold exists to hide. If the navigation never lands, the 12s
        // safety net above reveals the page, so a refused user is never stranded.
        if (result && result.redirecting) return;
        clearAuthPending();
        mountUI(result && result.profile);
      }).catch(function() {
        // Guard failed (network, config), so fall back to login. Held for the
        // same reason as the redirect branch; the safety net covers a hang.
        window.location.href = '../../../index.html';
      });
    } else {
      // AuthGuard not loaded (legacy path), so proceed unguarded.
      clearAuthPending();
      mountUI();
    }
  });
}

/**
 * Sidebar footer status, polled every 30s plus the browser's online/offline
 * events, so admins working in remote areas see network changes immediately.
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

  // Vendor-prefixed: only Chrome-based browsers expose the connection type.
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
      if (syncStatusKnown) return;
      dot.classList.remove('disconnected');
      dot.classList.add('slow');
      text.textContent = 'Slow network';
      return;
    }
  }

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
  // Resolution lives in lib/theme-init.js, which runs in <head> before the
  // stylesheets, so the palette is already on <html> at first paint. This call
  // only re-syncs what this script owns: the toggle icon and the theme-color meta.
  var activeTheme = window.BioTheme ? window.BioTheme.apply() : 'light';
  syncThemeColorMeta(activeTheme);
  updateThemeToggleIcon(activeTheme);
}

/**
 * Keeps the browser's own chrome in step with the theme. `<meta name="theme-color">`
 * is static in each page's HTML, so a runtime switch would otherwise leave the
 * mobile address bar light green-grey over a dark page, the one part of the UI
 * CSS cannot reach. Values mirror --color-bg in styles/theme.css, and
 * lib/theme-init.js needs the same two values before this script loads: a second
 * copy of them is how they drift apart.
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

document.addEventListener('DOMContentLoaded', function() {
  applySavedTheme();
  initThemeToggle();
  setSyncStatus(navigator.onLine ? 'Syncing' : 'Offline', navigator.onLine ? 'syncing' : 'disconnected');
  setInterval(updateConnectionStatus, 30000);
});

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

if (navigator.connection) {
  navigator.connection.addEventListener('change', updateConnectionStatus);
}

// CommonJS export kept for tests; nothing requires it yet, and the guard above
// means it never runs in a browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initUserMenu, initHeaderActions };
}