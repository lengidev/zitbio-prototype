/**
 * BioMonitor - Analytics Page
 * Tab switching, dynamic table rendering, pagination, search, and column toggling.
 * Uses shared observationsRenderer for table rendering.
 */

// State
var analyticsCurrentPage = 1;
var analyticsFilteredData = [];
var analyticsRecordsPerPage = 10;

// Column visibility state
var analyticsVisibleColumns = {
    coords: false,
    'protected-area': false,
    locality: false,
    'recorded-by': false,
    institution: false,
    'obs-id': false
};

// Get filtered data from BioData using shared search
function getAnalyticsFilteredData() {
    if (!window.BioData) return [];
    var searchInput = document.querySelector('.page-analytics .search-input');
    if (!searchInput) return window.BioData.getObservations().slice();
    // Get the selected search field from the active radio button
    var selectedField = document.querySelector('input[name="searchField"]:checked');
    var field = selectedField ? selectedField.value : '';
    return window.BioData.searchObservations(searchInput.value, field || undefined);
}

// Render the analytics table using the shared renderer
function renderAnalyticsTable() {
    if (!window.BioData) return;

    analyticsFilteredData = getAnalyticsFilteredData();
    var totalPages = Math.ceil(analyticsFilteredData.length / analyticsRecordsPerPage);

    if (analyticsCurrentPage > totalPages) analyticsCurrentPage = totalPages || 1;

    renderObservationsTable({
        viewMode: 'analytics',
        data: analyticsFilteredData,
        page: analyticsCurrentPage,
        perPage: analyticsRecordsPerPage,
        tableSelector: '.page-analytics .observations-table',
        paginationSelector: '.page-analytics .observations-pagination'
    });

    // Apply current column visibility state
    applyColumnVisibility();

    // Re-attach page number click handlers (renderSharedPagination creates fresh DOM elements)
    var pageNums = document.querySelectorAll('.page-analytics .page-num');
    pageNums.forEach(function(num) {
        num.addEventListener('click', function() {
            var page = parseInt(this.getAttribute('data-page'), 10);
            if (!isNaN(page) && page !== analyticsCurrentPage) {
                analyticsCurrentPage = page;
                renderAnalyticsTable();
            }
        });
    });
}

// Handle search input
function handleAnalyticsSearch() {
    analyticsCurrentPage = 1;
    renderAnalyticsTable();
}

// ============================================================
//  Column Visibility Toggle
// ============================================================

// Apply current column visibility to the table element
function applyColumnVisibility() {
    var table = document.querySelector('.page-analytics .observations-table');
    if (!table) return;

    for (var col in analyticsVisibleColumns) {
        if (analyticsVisibleColumns.hasOwnProperty(col)) {
            table.setAttribute('data-show-' + col, analyticsVisibleColumns[col] ? 'true' : 'false');
        }
    }
}

// Toggle dropdown open/close
function toggleDropdown() {
    var dropdown = document.getElementById('colToggleDropdown');
    var btn = document.getElementById('colToggleBtn');
    if (!dropdown || !btn) return;

    var isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    btn.classList.toggle('active');
}

// Close dropdown
function closeDropdown() {
    var dropdown = document.getElementById('colToggleDropdown');
    var btn = document.getElementById('colToggleBtn');
    if (dropdown) dropdown.classList.remove('open');
    if (btn) btn.classList.remove('active');
}

// Handle checkbox change
function handleColumnToggle(e) {
    var checkbox = e.target;
    var colName = checkbox.getAttribute('data-col');
    if (!colName) return;

    analyticsVisibleColumns[colName] = checkbox.checked;
    applyColumnVisibility();
}

// Initialize column toggle event listeners
function initColumnToggle() {
    var btn = document.getElementById('colToggleBtn');
    var dropdown = document.getElementById('colToggleDropdown');
    if (!btn || !dropdown) return;

    // Toggle dropdown on button click
    btn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleDropdown();
    });

    // Checkbox change handlers
    var checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function(cb) {
        cb.addEventListener('change', handleColumnToggle);
    });

    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
        if (!dropdown.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            closeDropdown();
        }
    });
}

// Initialize page when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Tab switching logic
    var tabs = document.querySelectorAll('.analytics-tab');
    var panels = document.querySelectorAll('.analytics-tab-content');
    var searchWrapper = document.getElementById('tabSearchWrapper');
    var exportBtn = document.getElementById('tabExportBtn');

    function activateTab(tab) {
        if (!tab) return;

        tabs.forEach(function(t) { t.classList.remove('active'); });
        panels.forEach(function(p) { p.classList.remove('active'); });

        tab.classList.add('active');
        var tabName = tab.getAttribute('data-tab');
        if (tabName) {
            var targetPanel = document.getElementById('tab-' + tabName);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }

            if (tabName === 'observations') {
                if (searchWrapper) searchWrapper.style.display = 'inline-flex';
                if (exportBtn) exportBtn.style.display = 'none';
            } else if (tabName === 'report') {
                if (searchWrapper) searchWrapper.style.display = 'none';
                if (exportBtn) exportBtn.style.display = 'inline-flex';
            } else {
                if (searchWrapper) searchWrapper.style.display = 'none';
                if (exportBtn) exportBtn.style.display = 'none';
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            activateTab(this);
        });
    });

    function handleHashChange() {
        var hash = window.location.hash;
        if (hash) {
            var tabName = hash.replace('#tab-', '');
            var matchingTab = document.querySelector('.analytics-tab[data-tab="' + tabName + '"]');
            if (matchingTab) {
                activateTab(matchingTab);
            }
        }
    }

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    // --- Dynamic table rendering ---
    if (!window.BioData) {
        console.warn('BioData not loaded. Analytics page cannot render table.');
        return;
    }

    // Render the table
    renderAnalyticsTable();

    // Search input handler
    var searchInput = document.querySelector('.page-analytics .search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handleAnalyticsSearch);
    }

    // Prev/Next button handlers
    var pagiBtns = document.querySelectorAll('.page-analytics .pagi-btn');
    if (pagiBtns.length >= 2) {
        var prevBtn = pagiBtns[0];
        var nextBtn = pagiBtns[1];
        prevBtn.addEventListener('click', function() {
            if (analyticsCurrentPage > 1) {
                analyticsCurrentPage--;
                renderAnalyticsTable();
            }
        });
        nextBtn.addEventListener('click', function() {
            var totalPages = Math.ceil(analyticsFilteredData.length / analyticsRecordsPerPage);
            if (analyticsCurrentPage < totalPages) {
                analyticsCurrentPage++;
                renderAnalyticsTable();
            }
        });
    }

    // Initialize column toggle (filter button)
    initColumnToggle();
});