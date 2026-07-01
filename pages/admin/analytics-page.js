/**
 * BioMonitor - Analytics Page
 * Tab switching, dynamic table rendering, pagination, search, and column toggling.
 * Uses shared observationsRenderer for table rendering.
 */

// State
var analyticsCurrentPage = 1;
var analyticsFilteredData = [];
var analyticsRecordsPerPage = 10;

// Filter state
var analyticsFilters = {
    dateFrom: '',
    dateTo: '',
    province: '',
    status: '',
    species: ''
};

// Column visibility state
var analyticsVisibleColumns = {
    coords: false,
    'protected-area': false,
    locality: false,
    'recorded-by': false,
    institution: false,
    'obs-id': false
};

// Get filtered data from BioData using shared search + filters
function getAnalyticsFilteredData() {
    if (!window.BioData) return [];
    
    // Apply filters first
    var data = window.BioData.filterObservations(analyticsFilters);
    
    // Apply search on top of filtered data
    var searchInput = document.querySelector('.page-analytics .search-input');
    if (searchInput && searchInput.value.trim()) {
        var selectedField = document.querySelector('input[name="searchField"]:checked');
        var field = selectedField ? selectedField.value : '';
        var query = searchInput.value;
        // Search within already-filtered data
        var q = query.toLowerCase().trim();
        data = data.filter(function(obs) {
            var sd = obs.species_details || {};
            var loc = obs.location || {};
            var searchable = [
                sd.scientific_name || '',
                sd.common_name || '',
                loc.city || '',
                loc.administrative_area || '',
                loc.country || '',
                loc.habitat_type || '',
                obs.recorded_by || '',
                obs.institution_name || '',
                obs.timestamp || ''
            ].join(' ').toLowerCase();
            return searchable.includes(q);
        });
    }
    
    return data;
}

// Count active filters
function countActiveFilters() {
    var count = 0;
    if (analyticsFilters.dateFrom) count++;
    if (analyticsFilters.dateTo) count++;
    if (analyticsFilters.province) count++;
    if (analyticsFilters.status) count++;
    if (analyticsFilters.species) count++;
    return count;
}

// Update filter count badge
function updateFilterCount() {
    var badge = document.getElementById('filterCountBadge');
    if (!badge) return;
    var count = countActiveFilters();
    badge.textContent = count;
}

// Trigger re-render when filters change
function applyFilters() {
    analyticsCurrentPage = 1;
    updateFilterCount();
    renderAnalyticsTable();
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

    // Re-attach page number click handlers
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
//  Filter Bar Toggle
// ============================================================

function initFilterToggle() {
    var toggleBtn = document.getElementById('analyticsFilterToggle');
    var filterBar = document.getElementById('analyticsFilters');
    if (!toggleBtn || !filterBar) return;

    toggleBtn.addEventListener('click', function() {
        filterBar.classList.toggle('open');
        this.classList.toggle('active');
    });

    // Open by default if filters are active
    if (countActiveFilters() > 0) {
        filterBar.classList.add('open');
        toggleBtn.classList.add('active');
    }
}

// ============================================================
//  Populate Filter Dropdowns
// ============================================================

function populateFilterDropdowns() {
    if (!window.BioData) return;

    // Provinces
    var provinceSelect = document.getElementById('filterProvince');
    if (provinceSelect) {
        if (window.BioData.getZambiaProvinces) {
            var provinces = window.BioData.getZambiaProvinces();
            provinces.forEach(function(p) {
                var opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                provinceSelect.appendChild(opt);
            });
        }
    }

    // Species — extract unique common names from observations
    var speciesSelect = document.getElementById('filterSpecies');
    if (speciesSelect) {
        var obs = window.BioData.getObservations();
        var speciesSet = {};
        obs.forEach(function(o) {
            if (o.species_details && o.species_details.common_name) {
                speciesSet[o.species_details.common_name] = true;
            }
        });
        var sorted = Object.keys(speciesSet).sort();
        sorted.forEach(function(name) {
            var opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            speciesSelect.appendChild(opt);
        });
    }
}

// ============================================================
//  Column Visibility Toggle
// ============================================================

function applyColumnVisibility() {
    var table = document.querySelector('.page-analytics .observations-table');
    if (!table) return;

    for (var col in analyticsVisibleColumns) {
        if (analyticsVisibleColumns.hasOwnProperty(col)) {
            table.setAttribute('data-show-' + col, analyticsVisibleColumns[col] ? 'true' : 'false');
        }
    }
}

// ============================================================
//  Column Toggle Buttons (in filter bar)
// ============================================================

function initColumnToggleButtons() {
    var buttons = document.querySelectorAll('.page-analytics .col-toggle-btn');
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var col = this.getAttribute('data-col');
            if (!col) return;
            
            // Toggle state
            analyticsVisibleColumns[col] = !analyticsVisibleColumns[col];
            this.classList.toggle('active');
            
            applyColumnVisibility();
        });
    });
}

// ============================================================
//  Filter Event Listeners
// ============================================================

function initFilterListeners() {
    var dateFrom = document.getElementById('filterDateFrom');
    var dateTo = document.getElementById('filterDateTo');
    var province = document.getElementById('filterProvince');
    var status = document.getElementById('filterStatus');
    var species = document.getElementById('filterSpecies');
    var clearBtn = document.getElementById('filterClear');

    function onFilterChange() {
        analyticsFilters.dateFrom = dateFrom ? dateFrom.value : '';
        analyticsFilters.dateTo = dateTo ? dateTo.value : '';
        analyticsFilters.province = province ? province.value : '';
        analyticsFilters.status = status ? status.value : '';
        analyticsFilters.species = species ? species.value : '';
        applyFilters();
    }

    if (dateFrom) dateFrom.addEventListener('change', onFilterChange);
    if (dateTo) dateTo.addEventListener('change', onFilterChange);
    if (province) province.addEventListener('change', onFilterChange);
    if (status) status.addEventListener('change', onFilterChange);
    if (species) species.addEventListener('change', onFilterChange);

    // Clear all
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (dateFrom) dateFrom.value = '';
            if (dateTo) dateTo.value = '';
            if (province) province.value = '';
            if (status) status.value = '';
            if (species) species.value = '';
            
            analyticsFilters = { dateFrom: '', dateTo: '', province: '', status: '', species: '' };
            applyFilters();
        });
    }
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
            } else {
                if (searchWrapper) searchWrapper.style.display = 'none';
                if (exportBtn) exportBtn.style.display = tabName === 'report' ? 'inline-flex' : 'none';
                // Close filter bar when leaving Observations tab
                var filterBar = document.getElementById('analyticsFilters');
                var toggleBtn = document.getElementById('analyticsFilterToggle');
                if (filterBar) filterBar.classList.remove('open');
                if (toggleBtn) toggleBtn.classList.remove('active');
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

    // Initialize filters
    populateFilterDropdowns();
    initFilterToggle();
    initFilterListeners();
    initColumnToggleButtons();
    updateFilterCount();

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