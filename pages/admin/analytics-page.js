/**
 * BioMonitor - Analytics Page
 * Tab switching, dynamic table rendering, pagination, and search.
 * Uses shared observationsRenderer for table rendering.
 */

// State
var analyticsCurrentPage = 1;
var analyticsFilteredData = [];
var analyticsRecordsPerPage = 10;

// Get filtered data from BioData
function getAnalyticsFilteredData() {
    if (!window.BioData) return [];
    var allData = window.BioData.getObservations();
    var searchInput = document.querySelector('.page-analytics .search-input');
    if (!searchInput) return allData.slice();
    var searchTerm = searchInput.value.toLowerCase().trim();
    if (!searchTerm) return allData.slice();
    return allData.filter(function(obs) {
        var loc = obs.location || {};
        var city = (loc.city || '').toLowerCase();
        var area = (loc.area || '').toLowerCase();
        var species = (obs.species || '').toLowerCase();
        return species.includes(searchTerm) ||
            city.includes(searchTerm) ||
            area.includes(searchTerm);
    });
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
});