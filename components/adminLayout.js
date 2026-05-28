/**
 * BioMonitor - Admin Layout Component
 * Unified sidebar collapse/expand engine with localStorage persistence
 */

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');
    const toggleBtn = document.getElementById('sidebarToggle');

    // 1. RECOVERY: Instantly look up sidebar preference state from localStorage
    const isCollapsed = localStorage.getItem('admin-sidebar-collapsed') === 'true';

    if (sidebar && isCollapsed) {
        sidebar.classList.add('collapsed');
        if (mainContent) mainContent.classList.add('expanded');
    }

    // 2. TOGGLE ACTION EVENT HANDLER
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            if (mainContent) mainContent.classList.toggle('expanded');

            // Save layout choice into memory pool
            const currentStatus = sidebar.classList.contains('collapsed');
            localStorage.setItem('admin-sidebar-collapsed', currentStatus);
        });
    }

    // 3. HIGHLIGHT ACTIVE PAGE LINK & ENSURE NATIVE NAV HOPPING
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.sidebar-menu .nav-item');
    
    navItems.forEach(item => {
        // Ensure standard anchor href transition is completely unblocked
        const itemHref = item.getAttribute('href');
        if (itemHref && currentPath.includes(itemHref)) {
            item.classList.add('active');
        }
    });
});

// Legacy SidebarManager for backward compatibility
const SidebarManager = {
  isCollapsed: false,
  isOpen: false,

  /**
   * Toggle sidebar open/close (mobile)
   */
  toggle: function() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar) return;

    this.isOpen = !this.isOpen;
    
    if (this.isOpen) {
      sidebar.classList.add('mobile-open');
      if (overlay) overlay.classList.add('open');
    } else {
      sidebar.classList.remove('mobile-open');
      if (overlay) overlay.classList.remove('open');
    }
  },

  /**
   * Open sidebar
   */
  open: function() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar) return;

    this.isOpen = true;
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('open');
  },

  /**
   * Close sidebar
   */
  close: function() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (!sidebar) return;

    this.isOpen = false;
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('open');
  },

  /**
   * Collapse sidebar (desktop)
   */
  collapse: function() {
    const sidebar = document.getElementById('adminSidebar');
    const mainContent = document.querySelector('.main-content');
    if (!sidebar) return;

    this.isCollapsed = !this.isCollapsed;
    
    if (this.isCollapsed) {
      sidebar.classList.add('collapsed');
      if (mainContent) mainContent.classList.add('expanded');
      localStorage.setItem('admin-sidebar-collapsed', 'true');
    } else {
      sidebar.classList.remove('collapsed');
      if (mainContent) mainContent.classList.remove('expanded');
      localStorage.setItem('admin-sidebar-collapsed', 'false');
    }
  }
};

/**
 * Initialize admin layout event listeners (legacy support)
 */
function initAdminLayout() {
  const sidebar = document.getElementById('adminSidebar');
  if (!sidebar) {
    return;
  }

  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', function() {
      SidebarManager.open();
    });
  }

  if (sidebarClose) {
    sidebarClose.addEventListener('click', function() {
      SidebarManager.close();
    });
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function() {
      SidebarManager.close();
    });
  }

  const navItems = sidebar.querySelectorAll('.nav-item');
  navItems.forEach(function(item) {
    item.addEventListener('click', function(e) {
        const href = item.getAttribute('href');
        // Only prevent if it's the same page? No, let browser handle.
        // But we need to ensure active class updates before navigation
        navItems.forEach(function(nav) {
            nav.classList.remove('active');
        });
        item.classList.add('active');
        if (window.innerWidth <= 768) {
            SidebarManager.close();
        }
        // Allow default navigation - do nothing else
    });
  });
}

/**
 * Initialize user menu dropdown
 */
function initUserMenu() {
  const userMenu = document.getElementById('userMenu');
  if (!userMenu) return;

  const dropdown = userMenu.querySelector('.user-dropdown');
  if (!dropdown) return;

  userMenu.addEventListener('click', function(event) {
    event.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', function() {
    dropdown.classList.remove('open');
  });
}

/**
 * Initialize dashboard actions
 */
function initDashboardActions() {
  const btnNewObservation = document.getElementById('btnNewObservation');
  if (!btnNewObservation) {
    return;
  }

  const btnAddUser = document.getElementById('btnAddUser');
  const btnGenerateReport = document.getElementById('btnGenerateReport');
  const btnViewAll = document.getElementById('btnViewAll');
  const userMenu = document.getElementById('userMenu');

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

  if (userMenu) {
    userMenu.addEventListener('click', function() {
      alert('User menu: Profile, Settings, Logout');
    });
  }
}

/**
 * Initialize header actions
 */
function initHeaderActions() {
  const helpLink = document.querySelector('.help-link');
  if (helpLink) {
    helpLink.addEventListener('click', function(event) {
      event.preventDefault();
      alert('Help documentation would open here.');
    });
  }
}

// Initialize when DOM is ready (legacy support)
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initAdminLayout();
    initUserMenu();
    initHeaderActions();
    initDashboardActions();
  });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SidebarManager, initAdminLayout, initUserMenu, initHeaderActions };
}
