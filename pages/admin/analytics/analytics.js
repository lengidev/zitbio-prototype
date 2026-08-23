/**
 * ZitBio — Analytics Page
 * Tab switching, dynamic table rendering, pagination, search, and column toggling.
 * Uses the shared observationsRenderer for table rendering (same as the admin
 * Observations page), ensuring visual consistency.
 *
 * Design decisions:
 *   - Column toggles let analysts customise the table for different reporting
 *     contexts (e.g., hide coordinates when sharing publicly).
 *   - Filters are preserved across tab switches so analysts don't lose context.
 *   - The map tab uses Leaflet with OSM + Satellite basemaps and shows
 *     observations with colour-coded status markers.
 */

// View-model state for the analytics page — tracks pagination position,
// filtered dataset, and UI preferences (filters + column visibility).
var analyticsCurrentPage = 1;
var analyticsFilteredData = [];
var analyticsRecordsPerPage = 10;

// Active filter values — when set, they're passed to BioData.filterObservations()
// to narrow the dataset before rendering.
var analyticsFilters = {
    dateFrom: '',
    dateTo: '',
    focusArea: '',
    status: '',
    species: ''
};

// Column visibility toggles — stored here rather than in the DOM so they
// survive table re-renders (which would otherwise reset checkbox states).
var analyticsVisibleColumns = {
    coords: false,
    'focus-area': false,
    locality: false,
    'recorded-by': false,
    institution: false,
    'obs-id': false
};

// Get filtered data — applies BioData filters first, then scoped search on top.
// This two-phase approach means the filter count badge shows active filters
// even when no search term is entered.
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

// Count active filters — used to show a badge on the filter toggle button
// so users know at a glance that filtering is applied.
function countActiveFilters() {
    var count = 0;
    if (analyticsFilters.dateFrom) count++;
    if (analyticsFilters.dateTo) count++;
    if (analyticsFilters.focusArea) count++;
    if (analyticsFilters.status) count++;
    if (analyticsFilters.species) count++;
    return count;
}

// Update the filter-count badge on the toggle button
function updateFilterCount() {
    var badge = document.getElementById('filterCountBadge');
    if (!badge) return;
    var count = countActiveFilters();
    badge.textContent = count;
}

// Re-render the table when any filter changes, resetting to page 1
function applyFilters() {
    analyticsCurrentPage = 1;
    updateFilterCount();
    renderAnalyticsTable();
    var graphsPanel = document.getElementById('tab-graphs');
    var reportPanel = document.getElementById('tab-report');
    var mapPanel = document.getElementById('tab-map');
    if (graphsPanel && graphsPanel.classList.contains('active') && typeof initGraphsTab === 'function') {
        initGraphsTab();
    }
    if (reportPanel && reportPanel.classList.contains('active') && typeof initReportTab === 'function') {
        initReportTab();
    }
    if (mapPanel && mapPanel.classList.contains('active') && typeof window.refreshMapMarkers === 'function') {
        window.refreshMapMarkers();
    }
}

// Column definitions for the Analytics Observations table (12 columns)
function getAnalyticsColumns() {
    return [
        {
            label: 'Scientific Name',
            cellClass: 'sci-name',
            render: function(obs) {
                var sd = obs.species_details || {};
                return escapeHtmlObs(sd.scientific_name || '');
            }
        },
        {
            label: 'Common Name',
            cellClass: 'common-name',
            render: function(obs) {
                var sd = obs.species_details || {};
                return escapeHtmlObs(sd.common_name || '—');
            }
        },
        {
            label: 'Region / Province',
            render: function(obs) {
                var loc = obs.location || {};
                return escapeHtmlObs(loc.administrative_area || '—');
            }
        },
        {
            label: 'Habitat Type',
            render: function(obs) {
                var loc = obs.location || {};
                return escapeHtmlObs(loc.habitat_type || '—');
            }
        },
        {
            label: 'Total Count',
            cellClass: 'count-cell',
            render: function(obs) {
                return obs.count || 0;
            }
        },
        {
            label: 'Date Recorded',
            render: function(obs) {
                var dateStr = obs.timestamp ? obs.timestamp.split('T')[0] : null;
                return formatObsDate(dateStr);
            }
        },
        {
            label: 'Coordinates',
            toggleKey: 'coords',
            render: function(obs) {
                var loc = obs.location || {};
                var lat = loc.latitude != null ? Math.abs(loc.latitude).toFixed(4) + (loc.latitude >= 0 ? '°N' : '°S') : null;
                var lng = loc.longitude != null ? Math.abs(loc.longitude).toFixed(4) + (loc.longitude >= 0 ? '°E' : '°W') : null;
                var coordsStr = loc.latitude != null ? lat + ', ' + lng : '—';
                return '<span class="coords-text">' + coordsStr + '</span>';
            }
        },
        {
            label: 'Focus Area',
            toggleKey: 'focus-area',
            render: function(obs) {
                var loc = obs.location || {};
                return escapeHtmlObs(loc.focus_area || '—');
            }
        },
        {
            label: 'Location Description',
            toggleKey: 'locality',
            render: function(obs) {
                var loc = obs.location || {};
                return escapeHtmlObs(loc.locality_description || '—');
            }
        },
        {
            label: 'Recorded By',
            toggleKey: 'recorded-by',
            render: function(obs) {
                return escapeHtmlObs(obs.recorded_by || '—');
            }
        },
        {
            label: 'Institution',
            toggleKey: 'institution',
            render: function(obs) {
                return escapeHtmlObs(obs.institution_name || '—');
            }
        },
        {
            label: 'Observation ID',
            toggleKey: 'obs-id',
            render: function(obs) {
                return '<code>' + escapeHtmlObs(obs.observation_id || '') + '</code>';
            }
        }
    ];
}

// Render the analytics table using the shared renderer
// (same as the admin Observations page, ensuring visual consistency).
function renderAnalyticsTable() {
    if (!window.BioData) return;

    analyticsFilteredData = getAnalyticsFilteredData();
    var totalPages = Math.ceil(analyticsFilteredData.length / analyticsRecordsPerPage);

    if (analyticsCurrentPage > totalPages) analyticsCurrentPage = totalPages || 1;

    renderObservationsTable({
        data: analyticsFilteredData,
        page: analyticsCurrentPage,
        perPage: analyticsRecordsPerPage,
        tableSelector: '.page-analytics .observations-table',
        paginationSelector: '.page-analytics .observations-pagination',
        paginationStyle: 'bar',
        columns: getAnalyticsColumns()
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
//  Filter Bar Toggle — opens/closes the filter panel
//  Auto-opens if any filters are already active.
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
//  Populate Filter Dropdowns — fills focus area and species
//  selects from BioData reference data so they stay in sync
//  with the rest of the application.
// ============================================================

function populateFilterDropdowns() {
    if (!window.BioData) return;

    // Focus Areas — the two canonical CBU areas (campus / nature park).
    // These display names lenient-match every stored variant via the
    // filterObservations focusArea rule (e.g. 'CBU Campus',
    // 'The CBU Nature Park', GBIF 'Copperbelt University').
    var focusAreaSelect = document.getElementById('filterFocusArea');
    if (focusAreaSelect) {
        var focusAreaOptions = [
            'The Copperbelt University Campus',
            'The Copperbelt University Nature Park'
        ];
        focusAreaOptions.forEach(function(fa) {
            var opt = document.createElement('option');
            opt.value = fa;
            opt.textContent = fa;
            focusAreaSelect.appendChild(opt);
        });
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
//  Analytics exposes 12 columns by default; 6 are hidden via CSS
//  until the user toggles them on. This lets analysts customise
//  the table for different reporting contexts.
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
//  Column Toggle Buttons — in the filter bar for easy access
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
//  Filter Event Listeners — each filter dropdown triggers a
//  re-render on change (not on every keystroke, to avoid churn).
// ============================================================

function initFilterListeners() {
    var dateFrom = document.getElementById('filterDateFrom');
    var dateTo = document.getElementById('filterDateTo');
    var focusArea = document.getElementById('filterFocusArea');
    var status = document.getElementById('filterStatus');
    var species = document.getElementById('filterSpecies');
    var clearBtn = document.getElementById('filterClear');

    function onFilterChange() {
        analyticsFilters.dateFrom = dateFrom ? dateFrom.value : '';
        analyticsFilters.dateTo = dateTo ? dateTo.value : '';
        analyticsFilters.focusArea = focusArea ? focusArea.value : '';
        analyticsFilters.status = status ? status.value : '';
        analyticsFilters.species = species ? species.value : '';
        applyFilters();
    }

    if (dateFrom) dateFrom.addEventListener('change', onFilterChange);
    if (dateTo) dateTo.addEventListener('change', onFilterChange);
    if (focusArea) focusArea.addEventListener('change', onFilterChange);
    if (status) status.addEventListener('change', onFilterChange);
    if (species) species.addEventListener('change', onFilterChange);

    // Clear all
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (dateFrom) dateFrom.value = '';
            if (dateTo) dateTo.value = '';
            if (focusArea) focusArea.value = '';
            if (status) status.value = '';
            if (species) species.value = '';
            
            analyticsFilters = { dateFrom: '', dateTo: '', focusArea: '', status: '', species: '' };
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
    var tabsContainer = document.querySelector('.analytics-tabs');
    var filterBar = document.getElementById('analyticsFilters');

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

            var isDataset = (tabName === 'observations');
            if (searchWrapper) {
                searchWrapper.style.display = isDataset ? 'inline-flex' : 'none';
            }
            // Tag the container so CSS can align the search/filter controls per
            // tab at responsive breakpoints: Dataset shows both (side by side
            // below the tabs on small screens); the other tabs keep the filter
            // button right-aligned next to the tabs on every breakpoint.
            if (tabsContainer) {
                tabsContainer.classList.toggle('with-search', isDataset);
            }
            // Column toggles only apply to the Dataset table — flag the filter
            // bar so the Toggle Columns row is hidden on Map/Graphs/Report.
            if (filterBar) {
                filterBar.classList.toggle('with-column-toggles', isDataset);
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            activateTab(this);
            // Persist the active tab so switching pages and coming back
            // restores where the user left off (Issue #23).
            var tabName = this.getAttribute('data-tab');
            if (tabName) {
                try { localStorage.setItem('biodata_analytics_tab', tabName); } catch (err) { /* storage unavailable */ }
            }
        });
    });

    var hashTabMatched = false;

    function handleHashChange() {
        var hash = window.location.hash;
        if (hash) {
            var tabName = hash.replace('#tab-', '');
            var matchingTab = document.querySelector('.analytics-tab[data-tab="' + tabName + '"]');
            if (matchingTab) {
                activateTab(matchingTab);
                hashTabMatched = true;
            }
        }
    }

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    // Restore the previously active tab when returning to the page,
    // unless an explicit hash deep-link already selected one — the
    // hash takes precedence. Using .click() also triggers tab-specific
    // init (e.g. lazy Leaflet map) and re-persists the restored tab.
    if (!hashTabMatched) {
        var savedTab = null;
        try { savedTab = localStorage.getItem('biodata_analytics_tab'); } catch (err) { /* storage unavailable */ }
        if (savedTab) {
            var savedTabEl = document.querySelector('.analytics-tab[data-tab="' + savedTab + '"]');
            if (savedTabEl) {
                savedTabEl.click();
            }
        }
    }

    // Sync the container tag with the initially-active tab so the responsive
    // per-tab alignment applies on first load (not only after a tab click).
    var initialTab = document.querySelector('.analytics-tab.active');
    var initialIsDataset = !!(initialTab && initialTab.getAttribute('data-tab') === 'observations');
    if (tabsContainer) {
        tabsContainer.classList.toggle('with-search', initialIsDataset);
    }
    if (filterBar) {
        filterBar.classList.toggle('with-column-toggles', initialIsDataset);
    }

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

// Re-render the analytics table after the Supabase sync layer seeds cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    if (typeof renderAnalyticsTable === 'function') {
      applyFilters(); // re-apply active filters against the refreshed dataset
    }
  });
}

// ============================================================
//  CBU Area Map — Leaflet Interactive Map
//  Lazy-initialized when the Map tab is first activated to avoid
//  loading Leaflet resources on pages that don't need them.
//  Shows observation markers colour-coded by verification status,
//  with polygon overlays for CBU Nature Park and CBU Campus.
// ============================================================

(function() {
    'use strict';

    var mapInitialized = false;
    var mapInstance = null;
    var tileLayer = null;
    var parkPolygon = null;
    var campusPolygon = null;
    var obsMarkers = [];
    var mapActiveArea = 'park';
    var mapMode = 'map';

    // Polygon definitions ([lat, lng] format for Leaflet)
    var CBU_NATURE_PARK_COORDS = [
        [-12.80030, 28.24032],
        [-12.80126, 28.23867],
        [-12.80255, 28.23877],
        [-12.80325, 28.23913],
        [-12.80286, 28.23984],
        [-12.80295, 28.24106],
        [-12.80232, 28.24181],
        [-12.80136, 28.24090],
        [-12.80030, 28.24032]
    ];

    var CBU_CAMPUS_COORDS = [
        [-12.80326, 28.23502],
        [-12.80415, 28.23564],
        [-12.80642, 28.23719],
        [-12.80826, 28.23845],
        [-12.81019, 28.23980],
        [-12.80985, 28.24278],
        [-12.80960, 28.24565],
        [-12.80935, 28.24853],
        [-12.80909, 28.25140],
        [-12.80813, 28.25161],
        [-12.80716, 28.25181],
        [-12.80620, 28.25201],
        [-12.80523, 28.25221],
        [-12.80472, 28.24987],
        [-12.80421, 28.24753],
        [-12.80370, 28.24519],
        [-12.80318, 28.24285],
        [-12.80241, 28.24226],
        [-12.80198, 28.24159],
        [-12.80114, 28.24102],
        [-12.80009, 28.24048],
        [-12.80053, 28.23893],
        [-12.80103, 28.23686],
        [-12.80214, 28.23694],
        [-12.80326, 28.23502]
    ];

    var statusFilterState = {
        Approved: true,
        Pending: true,
        Flagged: true
    };

    // =====================================================
    // MAP STATE PERSISTENCE
    // Persists the map view to localStorage so navigating away
    // from Analytics and back restores the exact same view:
    // active area, map/satellite mode, zoom/center, and status
    // filters (Issue #33). The focused observation is NOT
    // persisted — auto-flying to an observation the admin never
    // clicked was confusing (see bug fix: map no longer
    // force-jumps to a record on load).
    // =====================================================
    var MAP_STATE_KEY = 'biodata_analytics_map';

    // Kept in memory ONLY for the explicit table-row→map fly;
    // never persisted, never auto-restored on load.
    var focusedObsId = null;

    function saveMapState() {
        var state = {
            area: mapActiveArea,
            mode: mapMode,
            statusFilters: statusFilterState
        };
        if (mapInstance) {
            state.zoom = mapInstance.getZoom();
            state.center = [mapInstance.getCenter().lat, mapInstance.getCenter().lng];
        }
        try {
            localStorage.setItem(MAP_STATE_KEY, JSON.stringify(state));
        } catch (err) { /* storage unavailable — ignore */ }
    }

    function loadMapState() {
        try {
            var raw = localStorage.getItem(MAP_STATE_KEY);
            if (!raw) return null;
            var state = JSON.parse(raw);
            // Validate + coerce to safe values
            if (state.area !== 'park' && state.area !== 'campus') state.area = 'park';
            if (state.mode !== 'map' && state.mode !== 'satellite') state.mode = 'map';
            if (typeof state.zoom !== 'number' || isNaN(state.zoom)) state.zoom = 16;
            if (!Array.isArray(state.center) || state.center.length !== 2) state.center = [-12.805, 28.240];
            if (state.statusFilters && typeof state.statusFilters === 'object') {
                state.statusFilters = {
                    Approved: state.statusFilters.Approved !== false,
                    Pending: state.statusFilters.Pending !== false,
                    Flagged: state.statusFilters.Flagged !== false
                };
            } else {
                state.statusFilters = { Approved: true, Pending: true, Flagged: true };
            }
            return state;
        } catch (err) {
            return null;
        }
    }

    function getStatusColor(status) {
        var s = (status || '').toLowerCase();
        if (s === 'approved') return '#22c55e';
        if (s === 'pending') return '#eab308';
        if (s === 'flagged') return '#ef4444';
        return '#6b7280';
    }

    function buildPopupContent(obs) {
        var loc = obs.location || {};
        var sd = obs.species_details || {};
        var sciName = sd.scientific_name || 'Unknown';
        var commonName = sd.common_name || '';
        var status = obs.verification_status || 'Unknown';
        var date = obs.timestamp ? obs.timestamp.split('T')[0] : '';
        var officer = obs.recorded_by || '';
        var statusClass = status.toLowerCase();

        var html = '<div class="map-popup-species">';
        if (commonName) {
            html += commonName + ' <i>(' + sciName + ')</i>';
        } else {
            html += '<i>' + sciName + '</i>';
        }
        html += '</div>';
        if (date) html += '<div class="map-popup-detail">' + date + '</div>';
        if (officer) html += '<div class="map-popup-detail">' + officer + '</div>';
        html += '<div style="margin-top:4px;"><span class="map-popup-status ' + statusClass + '">' + status + '</span></div>';
        return html;
    }

    function plotObservations() {
        // Clear existing markers
        obsMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
        obsMarkers = [];

        if (!window.BioData) return;

                var allObs = typeof getAnalyticsFilteredData === 'function'
                    ? getAnalyticsFilteredData()
                    : window.BioData.getObservations();
        if (!allObs) return;

        allObs.forEach(function(obs) {
            var loc = obs.location || {};
            var lat = loc.latitude;
            var lng = loc.longitude;
            if (lat == null || lng == null) return;

            var status = obs.verification_status || 'Approved';
            // Check status filter
            if (!statusFilterState[status]) return;

            var color = getStatusColor(status);

            var icon = L.divIcon({
                className: '',
                html: '<div class="map-obs-marker" style="background:' + color + ';"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            });

            var marker = L.marker([lat, lng], { icon: icon });
            marker.bindPopup(buildPopupContent(obs));
            marker._obsId = obs.observation_id;
            marker._status = status;

            marker.addTo(mapInstance);
            obsMarkers.push(marker);
        });

        updateMarkerCount();
    }

    function updateMarkerCount() {
        var visible = obsMarkers.filter(function(m) { return mapInstance.hasLayer(m); }).length;
        var el = document.getElementById('map-status-count');
        if (el) el.textContent = 'Markers: ' + visible;
    }

    function updateZoomDisplay() {
        var el = document.getElementById('map-status-zoom');
        if (el) el.textContent = 'Zoom: ' + mapInstance.getZoom().toFixed(1);
    }

    function renderPolygons(activeArea) {
        var parkStyle = {
            color: '#f59e0b',
            fillColor: '#f59e0b',
            fillOpacity: activeArea === 'park' ? 0.2 : 0.08,
            weight: activeArea === 'park' ? 3 : 1.5,
            opacity: activeArea === 'park' ? 0.9 : 0.4
        };

        var campusStyle = {
            color: '#06b6d4',
            fillColor: '#06b6d4',
            fillOpacity: activeArea === 'campus' ? 0.2 : 0.08,
            weight: activeArea === 'campus' ? 3 : 1.5,
            opacity: activeArea === 'campus' ? 0.9 : 0.4
        };

        if (!parkPolygon) {
            parkPolygon = L.polygon(CBU_NATURE_PARK_COORDS, parkStyle).addTo(mapInstance);
        } else {
            parkPolygon.setStyle(parkStyle);
        }

        if (!campusPolygon) {
            campusPolygon = L.polygon(CBU_CAMPUS_COORDS, campusStyle).addTo(mapInstance);
        } else {
            campusPolygon.setStyle(campusStyle);
        }

        // Add vertex dots for both polygons (once only)
        if (!parkPolygon._vertexDotsAdded) {
            CBU_NATURE_PARK_COORDS.forEach(function(c) {
                L.circleMarker(c, {
                    radius: 3,
                    color: '#f59e0b',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.8,
                    weight: 1
                }).addTo(mapInstance)._isVertex = true;
            });
            parkPolygon._vertexDotsAdded = true;
        }

        if (!campusPolygon._vertexDotsAdded) {
            CBU_CAMPUS_COORDS.forEach(function(c) {
                L.circleMarker(c, {
                    radius: 3,
                    color: '#06b6d4',
                    fillColor: '#06b6d4',
                    fillOpacity: 0.8,
                    weight: 1
                }).addTo(mapInstance)._isVertex = true;
            });
            campusPolygon._vertexDotsAdded = true;
        }
    }

    function fitActiveArea() {
        if (!mapInstance) return;
        var poly = mapActiveArea === 'park' ? parkPolygon : campusPolygon;
        if (poly) {
            mapInstance.fitBounds(poly.getBounds(), { padding: [80, 80] });
            updateZoomDisplay();
        }
    }

    function showMapToast(message) {
        var toast = document.getElementById('map-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('visible');
        setTimeout(function() { toast.classList.remove('visible'); }, 3000);
    }

    function switchMapMode(mode) {
        var tileUrl;
        var attribution;

        if (mode === 'satellite') {
            tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
            attribution = '&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';
        } else {
            tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
            attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
        }

        if (tileLayer) {
            mapInstance.removeLayer(tileLayer);
        }

        // Set the intended mode FIRST so the tileerror guard compares against
        // the mode we are actually trying to reach.
        mapMode = mode;

        tileLayer = L.tileLayer(tileUrl, {
            maxZoom: 18,
            minZoom: 16,
            attribution: attribution
        }).addTo(mapInstance);

        // If the requested tile server fails (offline / tile refusal), fall
        // back to OSM and surface a toast — the switch must never silently
        // appear broken.
        tileLayer.on('tileerror', function() {
            if (mapMode === 'map') return; // OSM itself failed — nothing to fall back to
            switchMapMode('map');
            showMapToast('Satellite unavailable — showing map');
        });
    }

    function initMap() {
        var mapEl = document.getElementById('map');
        if (!mapEl || mapInitialized) return;

        // Restore previously saved map state (area/mode/zoom/center/filters/
        // focused observation) so returning to the page shows the same view.
        var savedState = loadMapState();

        mapInstance = L.map('map', {
            center: savedState ? savedState.center : [-12.805, 28.240],
            zoom: savedState ? savedState.zoom : 16,
            minZoom: 16,
            maxZoom: 18,
            zoomSnap: 0.1,
            zoomControl: false,
            attributionControl: true
        });

        // Apply saved mode (defaults to OSM if none)
        var restoredMode = savedState ? savedState.mode : 'map';
        switchMapMode(restoredMode);
        var restoredModeToggle = document.getElementById('map-mode-toggle');
        if (restoredModeToggle) {
            restoredModeToggle.querySelectorAll('.map-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === restoredMode);
            });
        }

        // Render polygons with the saved (or default) active area
        mapActiveArea = savedState ? savedState.area : 'park';
        renderPolygons(mapActiveArea);

        var restoredAreaToggle = document.getElementById('map-area-toggle');
        if (restoredAreaToggle) {
            restoredAreaToggle.querySelectorAll('.map-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-area') === mapActiveArea);
            });
        }

        // Apply saved status filters
        if (savedState && savedState.statusFilters) {
            statusFilterState = savedState.statusFilters;
            document.querySelectorAll('.map-filter-label').forEach(function(label) {
                var status = label.getAttribute('data-status');
                if (status && statusFilterState[status] === false) {
                    label.classList.add('disabled');
                } else if (status) {
                    label.classList.remove('disabled');
                }
            });
        }

        // Plot observations (respects the restored status filters)
        plotObservations();

        // Update zoom display + persist on move
        mapInstance.on('moveend', function() {
            updateZoomDisplay();
            saveMapState();
        });

        mapInitialized = true;

        // Initial status bar update
        updateZoomDisplay();
        updateMarkerCount();
        var areaLabel = document.getElementById('map-status-area');
        if (areaLabel) {
            areaLabel.textContent = mapActiveArea === 'park' ? 'CBU Nature Park' : 'CBU Campus';
        }
    }

    // ---- Bind UI Controls ----

    // Area toggle
    var areaToggle = document.getElementById('map-area-toggle');
    if (areaToggle) {
        areaToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-btn');
            if (!btn || !btn.hasAttribute('data-area')) return;

            var area = btn.getAttribute('data-area');
            if (area === mapActiveArea) return;
            mapActiveArea = area;

            // Update button states
            areaToggle.querySelectorAll('.map-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-area') === area);
            });

            // Update polygon styles
            renderPolygons(area);

            // Update status bar
            var areaLabel = document.getElementById('map-status-area');
            if (areaLabel) {
                areaLabel.textContent = area === 'park' ? 'CBU Nature Park' : 'CBU Campus';
            }

            // Pan/zoom to the selected area — switching focus must visibly move
            // the camera, not just re-style the polygons.
            fitActiveArea();

            // Persist the new active area (fitBounds also triggers moveend → save)
            saveMapState();
        });
    }

    // Mode toggle
    var modeToggle = document.getElementById('map-mode-toggle');
    if (modeToggle) {
        modeToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-btn');
            if (!btn || !btn.hasAttribute('data-mode')) return;

            var mode = btn.getAttribute('data-mode');
            if (mode === mapMode) return;

            modeToggle.querySelectorAll('.map-btn').forEach(function(b) {
                b.classList.toggle('active', b.getAttribute('data-mode') === mode);
            });

            switchMapMode(mode);

            // Persist the new map mode
            saveMapState();
        });
    }

    // Fit area button
    var fitBtn = document.getElementById('map-fit-btn');
    if (fitBtn) {
        fitBtn.addEventListener('click', function() {
            fitActiveArea();
            // fitBounds triggers moveend which persists; be explicit for safety
            saveMapState();
        });
    }

    // Zoom buttons with 0.1 step, clamped 16.0–18.0
    function stepZoom(delta) {
        if (!mapInstance) return;
        var current = mapInstance.getZoom();
        var next = Math.round((current + delta) * 10) / 10;
        next = Math.max(16, Math.min(18, next));
        mapInstance.setZoom(next);
    }

    var zoomIn = document.getElementById('map-zoom-in');
    var zoomOut = document.getElementById('map-zoom-out');
    if (zoomIn) {
        zoomIn.addEventListener('click', function() { stepZoom(0.1); });
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', function() { stepZoom(-0.1); });
    }

    // Status filter labels
    document.querySelectorAll('.map-filter-label').forEach(function(label) {
        label.addEventListener('click', function() {
            var status = this.getAttribute('data-status');
            if (!status) return;

            statusFilterState[status] = !statusFilterState[status];
            this.classList.toggle('disabled', !statusFilterState[status]);

            // Re-plot markers with current filters
            if (mapInstance) plotObservations();

            // Persist the new filter state
            saveMapState();
        });
    });

    // Initialize map when Map tab is activated
    var origActivateTab = null;
    // Find the activateTab function (it's in a closure, so we hook via mutation observer)
    var mapTabBtn = document.querySelector('.analytics-tab[data-tab="map"]');
    if (mapTabBtn) {
        mapTabBtn.addEventListener('click', function() {
            // Defer init to let the tab panel become visible first
            setTimeout(function() {
                if (!mapInitialized) {
                    initMap();
                } else {
                    // Invalidate size in case tab switch changed layout
                    if (mapInstance) {
                        setTimeout(function() { mapInstance.invalidateSize(); }, 50);
                    }
                    updateMarkerCount();
                }
            }, 100);
        });
    }

    // Expose function for table-to-map sync
    window.flyToObservation = function(obsId) {
        // Always switch to Map tab first
        var mapTab = document.querySelector('.analytics-tab[data-tab="map"]');
        if (mapTab) {
            // Trigger click on the Map tab button
            mapTab.click();
        }

        if (!mapInitialized) {
            // Wait for init, then fly
            var checkInterval = setInterval(function() {
                if (mapInitialized && mapInstance) {
                    clearInterval(checkInterval);
                    doFly(obsId);
                }
            }, 100);
            setTimeout(function() { clearInterval(checkInterval); }, 5000);
        } else {
            // Small delay to let tab panel become visible
            setTimeout(function() {
                doFly(obsId);
            }, 200);
        }
    };

    // Expose marker re-plot so the shared filter bar can refresh the map
    // when the analytics filters change while the Map tab is active.
    window.refreshMapMarkers = function() {
        if (mapInstance) plotObservations();
    };

    function doFly(obsId) {
        if (!mapInstance || !obsId) return;
        // Find marker
        for (var i = 0; i < obsMarkers.length; i++) {
            var m = obsMarkers[i];
            if (m._obsId === obsId) {
                mapInstance.flyTo(m.getLatLng(), 17, { duration: 1 });
                // Track the focused observation so the map view can be
                // restored after navigating away and back (Issue #33)
                focusedObsId = obsId;
                saveMapState();
                // Highlight marker
                var iconEl = m.getElement();
                if (iconEl) {
                    var dot = iconEl.querySelector('.map-obs-marker');
                    if (dot) {
                        dot.classList.add('highlighted');
                        setTimeout(function() {
                            dot.classList.remove('highlighted');
                        }, 3000);
                    }
                }
                setTimeout(function() { m.openPopup(); }, 1200);
                break;
            }
        }
    }

    // Hook into table row clicks to sync with map
    document.addEventListener('click', function(e) {
        var row = e.target.closest('.page-analytics .observation-row');
        if (!row) return;

        // Extract observation ID from the <code> element in the col-obs-id cell
        var codeEl = row.querySelector('.col-obs-id code');
        if (!codeEl) return;
        var obsId = codeEl.textContent.trim();
        if (obsId && window.flyToObservation) {
            window.flyToObservation(obsId);
        }
    });
})();

// ============================================================
//  Toolbar UI — Consolidated controls
//  Proxies clicks to hidden legacy controls so the new toolbar
//  works without refactoring the existing Leaflet controller logic.
// ============================================================

(function() {
    'use strict';

    // Zoom in
    var zoomInBtn = document.getElementById('toolbar-zoom-in');
    var zoomOutBtn = document.getElementById('toolbar-zoom-out');
    var focusBtn = document.getElementById('toolbar-focus-toggle');
    var fitBtn = document.getElementById('toolbar-fit');
    var modeBtn = document.getElementById('toolbar-mode-toggle');
    // Hidden proxy targets
    var hiddenZoomIn = document.getElementById('map-zoom-in');
    var hiddenZoomOut = document.getElementById('map-zoom-out');
    var hiddenFitBtn = document.getElementById('map-fit-btn');

    if (zoomInBtn && hiddenZoomIn) {
        zoomInBtn.addEventListener('click', function() { hiddenZoomIn.click(); });
    }
    if (zoomOutBtn && hiddenZoomOut) {
        zoomOutBtn.addEventListener('click', function() { hiddenZoomOut.click(); });
    }
    if (fitBtn && hiddenFitBtn) {
        fitBtn.addEventListener('click', function() { hiddenFitBtn.click(); });
    }

    // Focus toggle — cycles between park and campus
    if (focusBtn) {
        focusBtn.addEventListener('click', function() {
            var areaToggle = document.getElementById('map-area-toggle');
            if (!areaToggle) return;
            var btns = areaToggle.querySelectorAll('.map-btn');
            var currentActive = areaToggle.querySelector('.map-btn.active');
            if (!currentActive) { btns[0].click(); return; }
            var idx = Array.prototype.indexOf.call(btns, currentActive);
            var next = btns[(idx + 1) % btns.length];
            if (next) next.click();
        });
    }

    // Mode toggle — cycles between map and satellite
    if (modeBtn) {
        modeBtn.addEventListener('click', function() {
            var modeToggle = document.getElementById('map-mode-toggle');
            if (!modeToggle) return;
            var btns = modeToggle.querySelectorAll('.map-btn');
            var currentActive = modeToggle.querySelector('.map-btn.active');
            if (!currentActive) { btns[0].click(); return; }
            var idx = Array.prototype.indexOf.call(btns, currentActive);
            var next = btns[(idx + 1) % btns.length];
            if (next) next.click();
        });
    }

    // Update toolbar tooltips when area changes
    var areaToggle = document.getElementById('map-area-toggle');
    if (areaToggle && focusBtn) {
        areaToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-btn');
            if (!btn) return;
            var area = btn.getAttribute('data-area');
            if (area === 'park') {
                focusBtn.setAttribute('data-tooltip', 'Switch to Campus');
            } else {
                focusBtn.setAttribute('data-tooltip', 'Switch to Nature Park');
            }
        });
    }

    // Update toolbar tooltips when mode changes
    var modeToggleParent = document.getElementById('map-mode-toggle');
    if (modeToggleParent && modeBtn) {
        modeToggleParent.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-btn');
            if (!btn) return;
            var mode = btn.getAttribute('data-mode');
            if (mode === 'map') {
                modeBtn.setAttribute('data-tooltip', 'Switch to Satellite');
            } else {
                modeBtn.setAttribute('data-tooltip', 'Switch to Map');
            }
        });
    }

})();

// ============================================================
//  ANALYTICS-LEVEL REPORT TAB + GRAPHS TAB
//  ------------------------------------------------------------
//  For Phase 4/5. Pure analytics core lives in lib/analytics.js
//  (BioAnalytics) — reusing getAnalyticsFilteredData() so reports
//  and graphs respect the same date/focus-area/status/species filters
//  as the table. Pending/Flagged are EXCLUDED by default (verified-
//  data rule) with a Report-tab toggle ("Include pending/flagged").
// ============================================================

// Lazily-built chart instances (destroy & rebuild on re-render).
var reportTrendChartInstance = null;
var graphRichnessChartInstance = null;
var graphShannonChartInstance = null;
var graphTrendChartInstance = null;

// Escaping/short-date helpers (escapeHtmlObs comes from the renderer).
function analyticsEscape(v) {
  return typeof escapeHtmlObs === 'function' ? escapeHtmlObs(String(v == null ? '' : v)) : String(v == null ? '' : v);
}
function analyticsShortDate(s) {
  if (!s) return '—';
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Enrich observations with entity ids so BioAnalytics resolves them
// consistently (species_id / site_id are optional on older records).
function enrichWithRegistryIds(obsList) {
  if (!window.BioData || !window.BioData.resolveSpeciesId) return obsList;
  return obsList.map(function(o) {
    var enriched = Object.assign({}, o);
    enriched.species_id = window.BioData.resolveSpeciesId(o) || null;
    enriched.site_id = window.BioData.resolveSiteId(o) || null;
    return enriched;
  });
}

// Default rolling window (months) applied to charts/report when no From/To
// date filter is set — mirrors the dashboard's rolling "This Week" chart so
// the default view stays focused on recent data instead of dumping every year.
var DEFAULT_ROLLING_MONTHS = 36;

// When a From/To date filter is set, respect it exactly (filterObservations
// already applied it); otherwise clamp the dataset to the most recent
// DEFAULT_ROLLING_MONTHS — a rolling window ending now.
function applyAnalyticsDateWindow(data) {
  if (analyticsFilters.dateFrom || analyticsFilters.dateTo) return data;
  var now = new Date();
  var cutoff = new Date(now.getFullYear(), now.getMonth() - DEFAULT_ROLLING_MONTHS, now.getDate());
  cutoff.setHours(0, 0, 0, 0);
  return data.filter(function(o) {
    var ts = o && o.timestamp ? new Date(o.timestamp) : null;
    return !!(ts && !isNaN(ts.getTime()) && ts >= cutoff && ts <= now);
  });
}

// Current report dataset — respects filters, uses verified (Approved) data
// only, and defaults to a recent rolling window when no date filter is set.
function getReportData() {
  var data = applyAnalyticsDateWindow(getAnalyticsFilteredData());
  data = data.filter(function(o) { return o.verification_status === 'Approved'; });
  return enrichWithRegistryIds(data);
}

// ============================================================
//  REPORT BUILDERS
// ============================================================

function buildReportConfidence() {
  var el = document.getElementById('reportConfidence');
  if (!el) return;
  var all = applyAnalyticsDateWindow(getAnalyticsFilteredData());
  var approved = all.filter(function(o) { return o.verification_status === 'Approved'; }).length;
  var pending = all.filter(function(o) { return o.verification_status === 'Pending'; }).length;
  var flagged = all.filter(function(o) { return o.verification_status === 'Flagged'; }).length;
  var total = all.length;
  el.textContent = 'Reporting on ' + total + ' record' + (total === 1 ? '' : 's') +
    ' in the current filter window: ' + approved + ' approved (included)' +
    (pending + flagged > 0
      ? ' · ' + pending + ' pending and ' + flagged + ' flagged (excluded from this report)'
      : '') +
    '. Only verified (Approved) observations are used.';
}

function buildReportSummary(data) {
  var speciesEl = document.getElementById('reportKpiSpecies');
  var obsEl = document.getElementById('reportKpiObservations');
  var rangeEl = document.getElementById('reportKpiDateRange');
  var shannonEl = document.getElementById('reportKpiShannon');
  if (!speciesEl || !obsEl || !rangeEl || !shannonEl) return;

  speciesEl.textContent = window.BioAnalytics.speciesRichness(data);
  obsEl.textContent = data.length;

  var sorted = data.map(function(o) { return o.timestamp ? new Date(o.timestamp) : null; })
    .filter(function(d) { return d && !isNaN(d.getTime()); })
    .sort(function(a, b) { return a - b; });
  rangeEl.textContent = sorted.length >= 2
    ? analyticsShortDate(sorted[0].toISOString()) + ' – ' + analyticsShortDate(sorted[sorted.length - 1].toISOString())
    : (sorted.length === 1 ? analyticsShortDate(sorted[0].toISOString()) : '—');

  shannonEl.textContent = window.BioAnalytics.shannonDiversityIndex(data).toFixed(3);
}

// Format a 'YYYY-MM' bucket into a readable month label, e.g. '2026-06' → 'Jun 2026'.
function formatReportMonth(ym) {
  var parts = String(ym || '').split('-');
  if (parts.length < 2) return ym || '';
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var m = parseInt(parts[1], 10);
  return (months[m - 1] || parts[1]) + ' ' + parts[0];
}

function buildReportDiversity(data) {
  var container = document.getElementById('reportDiversityContainer');
  if (!container) return;
  var sites = (window.BioData && window.BioData.getSiteRegistry) ? window.BioData.getSiteRegistry() : [];
  var html = '';
  if (sites.length === 0) {
    html = '<p class="report-empty">No sites registered.</p>';
  } else {
    sites.forEach(function(site) {
      var series = window.BioAnalytics.siteComparisonOverTime(data, site.id);
      html += '<div class="report-site-row">' +
        '<div class="report-site-name">' + analyticsEscape(site.name) + '</div>';
      if (series.length === 0) {
        html += '<div class="report-site-meta">No verified observations in the current filters</div>';
      } else {
        // Show every month in the filtered period (newest first) so the card
        // reads as a history, not a single locked date. The top row is the
        // latest month and carries the month-over-month delta.
        var rows = series.slice().reverse();
        var latest = rows[0];
        var prior = rows.length > 1 ? rows[1] : null;
        var delta = 0;
        var deltaClass = 'flat';
        var deltaGlyph = '●';
        var deltaText = '0.000';
        if (prior) {
          delta = latest.shannonIndex - prior.shannonIndex;
          if (delta > 0.001) { deltaClass = 'up'; deltaGlyph = '▲'; deltaText = '+' + (+delta.toFixed(3)); }
          else if (delta < -0.001) { deltaClass = 'down'; deltaGlyph = '▼'; deltaText = '' + (+delta.toFixed(3)); }
        }
        html += '<div class="report-site-caption">Shannon diversity H&prime; by month &mdash; latest highlighted</div>' +
          '<div class="report-site-timeline">';
        rows.forEach(function(b, i) {
          var isLatest = i === 0;
          html += '<div class="report-month-row' + (isLatest ? ' is-latest' : '') + '">' +
            '<span class="report-month">' + formatReportMonth(b.month) +
              (isLatest ? '<span class="report-latest-pill">Latest</span>' : '') + '</span>' +
            '<span class="report-month-value">H&prime; ' + b.shannonIndex.toFixed(3) + '</span>' +
            '<span class="report-month-meta">' + b.speciesRichness + ' spp &middot; ' + b.observations + ' obs</span>' +
            (isLatest && prior
              ? '<span class="report-month-delta ' + deltaClass + '" title="vs ' + formatReportMonth(prior.month) + '">' +
                deltaGlyph + ' ' + deltaText + '</span>'
              : '') +
            '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
  }
  container.innerHTML = html;
}

function buildReportWarnings(data) {
  var container = document.getElementById('reportWarningsContainer');
  if (!container) return;
  var registry = (window.BioData && window.BioData.getSpeciesRegistry) ? window.BioData.getSpeciesRegistry() : [];
  var warnings = window.BioAnalytics.lowPopulationWarnings(data, { speciesRegistry: registry });
  var active = warnings.filter(function(w) { return w.severity === 'warning' || w.severity === 'critical'; });
  var html = '';
  if (active.length === 0) {
    html = '<p class="report-empty">No low-population warnings — current estimates are within baseline.</p>' +
      (warnings.length === 0 ? '' : '<p class="report-meta">' + warnings.length + ' species/site combination(s) checked.</p>');
  } else {
    active.forEach(function(w) {
      var cls = w.severity === 'critical' ? 'status-flagged' : 'status-pending';
      var iconName = w.severity === 'critical' ? 'error' : 'warning';
      var sourceLabel = w.baselineSource === 'admin-set' ? 'admin baseline' :
        (w.baselineSource === 'site-override' ? 'site baseline' : 'derived baseline');
      html += '<div class="report-warning-row ' + cls + '">' +
        '<svg class="material-symbols-outlined report-warning-icon" aria-hidden="true"><use href="#i-' + iconName + '"/></svg>' +
        '<div class="report-warning-content">' +
        '<div class="report-warning-title">' + analyticsEscape(w.speciesName) + ' · ' + analyticsEscape(w.siteName) + '</div>' +
        '<div class="report-warning-meta">estimate ' + w.currentCount + ' vs ' + w.baseline +
        ' (' + sourceLabel + ') · ' + w.severity + '</div>' +
        '</div></div>';
    });
  }
  if (warnings.some(function(w) { return w.baselineSource === 'derived'; })) {
    html += '<p class="report-meta">Baselines marked "derived" are auto-computed from verified observations — ' +
      'set an admin baseline in Settings → Species & Baselines for authoritative numbers.</p>';
  }
  container.innerHTML = html;
}

function buildReportHabitats(data) {
  var container = document.getElementById('reportHabitatContainer');
  if (!container) return;
  var map = {};
  data.forEach(function(o) {
    var h = ((o.location && o.location.habitat_type) || 'Unspecified');
    var sd = o.species_details || {};
    var name = sd.common_name || sd.scientific_name || 'Unknown';
    var sci = sd.scientific_name || '';
    if (!map[h]) map[h] = {};
    map[h][sci] = map[h][sci] || { common: name, scientific: sci, count: 0 };
    map[h][sci].count += o.count || 0;
  });
  var html = '';
  var habitats = Object.keys(map).sort();
  if (habitats.length === 0) html = '<p class="report-empty">No species by habitat for the current filters.</p>';
  habitats.forEach(function(h) {
    var spList = Object.keys(map[h]).sort();
    html += '<div class="report-habitat-group">' +
      '<div class="report-habitat-name">' + analyticsEscape(h) + '</div>' +
      '<div class="report-habitat-species">' +
      spList.map(function(sci) {
        var item = map[h][sci];
        return '<span class="report-habitat-chip">' + analyticsEscape(item.common) +
          (item.scientific ? ' <i>(' + analyticsEscape(item.scientific) + ')</i>' : '') +
          ' · ' + item.count + '</span>';
      }).join('') +
      '</div></div>';
  });
  container.innerHTML = html;
}

function buildReportTrendChart(data) {
  var canvas = document.getElementById('reportTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (reportTrendChartInstance) { reportTrendChartInstance.destroy(); reportTrendChartInstance = null; }

  var select = document.getElementById('reportTrendSpecies');
  var speciesId = select ? select.value : '';
  var noteEl = document.getElementById('reportTrendNote');

  var trend = window.BioAnalytics.populationTrend(data, speciesId || null, null);
  var labels = trend.dataPoints.map(function(b) { return b.label; });
  var vals = trend.dataPoints.map(function(b) { return b.value; });

  if (trend.direction === 'insufficient_data' || vals.length < 2) {
    if (noteEl) noteEl.textContent = (trend.note || 'Insufficient data for a trend — need multiple survey periods.');
  } else {
    if (noteEl) noteEl.textContent = trend.slope.toFixed(3) + ' / period · ' + trend.direction + ' (trend line, not a forecast)';
  }

  var ctx = canvas.getContext('2d');
  var gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(46, 125, 50, 0.3)');
  gradient.addColorStop(1, 'rgba(46, 125, 50, 0.02)');

  var datasets = [{
    label: 'Observed count',
    data: vals,
    borderColor: '#2E7D32',
    backgroundColor: gradient,
    fill: true,
    tension: 0.4,
    pointRadius: 4,
    pointBackgroundColor: '#2E7D32'
  }];
  if (trend.fitted && trend.fitted.length > 1) {
    datasets.push({
      label: 'Trend line',
      data: trend.fitted.map(function(f) { return f.value; }),
      borderColor: trend.direction === 'declining' ? '#E53935' : '#8D6E63',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0
    });
  }

  reportTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: datasets.length > 1 } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
        x: { grid: { display: false } }
      }
    }
  });
}

// ============================================================
//  CSV EXPORT (raw numbers; respects include-pending toggle)
// ============================================================

function buildReportCsv(data) {
  var header = ['observation_id', 'count', 'verification_status', 'source', 'scientific_name', 'common_name',
    'latitude', 'longitude', 'country', 'administrative_area', 'city', 'focus_area', 'habitat_type',
    'locality_description', 'recorded_by', 'timestamp', 'institution_name', 'activity', 'field_notes'];
  function esc(v) {
    var s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }
  var rows = [header.join(',')];
  data.forEach(function(o) {
    var loc = o.location || {};
    var sd = o.species_details || {};
    rows.push([
      esc(o.observation_id), esc(o.count), esc(o.verification_status), esc(o.source),
      esc(sd.scientific_name), esc(sd.common_name),
      esc(loc.latitude), esc(loc.longitude), esc(loc.country), esc(loc.administrative_area),
      esc(loc.city), esc(loc.focus_area), esc(loc.habitat_type), esc(loc.locality_description),
      esc(o.recorded_by), esc(o.timestamp), esc(o.institution_name), esc(o.activity), esc(o.field_notes)
    ].join(','));
  });
  return rows.join('\n');
}

function downloadCsv(csv, filename) {
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
//  PDF EXPORT (custom written report generated from live data)
//  ------------------------------------------------------------
//  Uses jsPDF (loaded via CDN). Builds a narrative report from
//  the currently filtered, verified observations: executive
//  summary, key indicators, diversity by site, species by
//  habitat, population trend (with the chart), and warnings.
// ============================================================

function pdfEnsureSpace(doc, y, needed, bottomMargin) {
  var pageH = doc.internal.pageSize.getHeight();
  var margin = bottomMargin || 56;
  if (y + needed > pageH - margin) {
    doc.addPage();
    return 48;
  }
  return y;
}

function pdfWrapped(doc, text, x, y, maxWidth, lineHeight, opts) {
  opts = opts || {};
  var size = opts.size || 11;
  var style = opts.style || 'normal';
  var color = opts.color || [44, 62, 80];
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
  var lines = doc.splitTextToSize(text, maxWidth);
  lines.forEach(function(line) {
    y = pdfEnsureSpace(doc, y, size + 4);
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function pdfSectionTitle(doc, title, y) {
  var pageW = doc.internal.pageSize.getWidth();
  y = pdfEnsureSpace(doc, y, 34);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(46, 125, 50);
  doc.text(title, 48, y);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(1);
  doc.line(48, y + 6, pageW - 48, y + 6);
  return y + 22;
}

function pdfTable(doc, headers, rows, startY, colWidths) {
  var x = 48;
  var totalW = colWidths.reduce(function(a, b) { return a + b; }, 0);
  var rowH = 24;
  var y = startY;
  // Header row
  y = pdfEnsureSpace(doc, y, rowH);
  doc.setFillColor(249, 250, 251);
  doc.rect(x, y - 14, totalW, rowH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(44, 62, 80);
  var cx = x;
  headers.forEach(function(h, i) {
    doc.text(String(h), cx + 6, y);
    cx += colWidths[i];
  });
  y += rowH;
  // Body rows
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(44, 62, 80);
  rows.forEach(function(r) {
    y = pdfEnsureSpace(doc, y, rowH);
    cx = x;
    r.forEach(function(cell, i) {
      doc.text(String(cell == null ? '' : cell), cx + 6, y);
      cx += colWidths[i];
    });
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(x, y + 8, x + totalW, y + 8);
    y += rowH;
  });
  return y + 6;
}

function reportDateRange(data) {
  var dates = data.map(function(o) { return o.timestamp ? new Date(o.timestamp) : null; })
    .filter(function(d) { return d && !isNaN(d.getTime()); })
    .sort(function(a, b) { return a - b; });
  return dates.length >= 2
    ? analyticsShortDate(dates[0].toISOString()) + ' \u2013 ' + analyticsShortDate(dates[dates.length - 1].toISOString())
    : (dates.length === 1 ? analyticsShortDate(dates[0].toISOString()) : '\u2014');
}

function buildReportExecutiveSummary(data) {
  var n = data.length;
  var species = window.BioAnalytics.speciesRichness(data);
  var shannon = window.BioAnalytics.shannonDiversityIndex(data);
  var sites = (window.BioData && window.BioData.getSiteRegistry) ? window.BioData.getSiteRegistry() : [];
  var siteNames = sites.map(function(s) { return s.name; }).join(' and ');
  var sents = [];
  if (n === 0) {
    sents.push('No verified observations matched the current filters, so no analysis could be generated. Widen the date range or clear the focus area/species filters and try again.');
  } else {
    sents.push('This report summarises ' + n + ' verified observation record' + (n === 1 ? '' : 's') + ' covering ' + species + ' distinct species within ' + (siteNames || 'the monitored sites') + ', recorded between ' + reportDateRange(data) + '.');
    sents.push('Overall community diversity, measured by the Shannon index, is ' + shannon.toFixed(3) + (shannon === 0
      ? ', which indicates a single-species or heavily dominated community.'
      : ', reflecting a mix of common and rarer species across the sites.'));
    var trend = window.BioAnalytics.populationTrend(data, null, null);
    if (trend.direction !== 'insufficient_data' && trend.dataPoints.length > 1) {
      sents.push('Across the observation period the aggregate population count is ' + trend.direction + ', changing by ' + Math.abs(trend.slope).toFixed(1) + ' individuals per survey period.');
    } else {
      sents.push('There is not yet enough data to calculate a reliable population trend; additional survey periods are required.');
    }
  }
  return sents.join(' ');
}

function buildReportPdfSiteRows(data) {
  var sites = (window.BioData && window.BioData.getSiteRegistry) ? window.BioData.getSiteRegistry() : [];
  var rows = [];
  sites.forEach(function(site) {
    var series = window.BioAnalytics.siteComparisonOverTime(data, site.id);
    series.forEach(function(b) {
      rows.push([site.name, b.speciesRichness, b.observations, b.shannonIndex.toFixed(3), formatReportMonth(b.month)]);
    });
  });
  return rows;
}

function buildReportPdfHabitatRows(data) {
  var map = {};
  data.forEach(function(o) {
    var h = ((o.location && o.location.habitat_type) || 'Unspecified');
    var sd = o.species_details || {};
    var common = sd.common_name || sd.scientific_name || 'Unknown';
    map[h] = map[h] || [];
    map[h].push(common + ' (' + (o.count || 0) + ')');
  });
  var rows = [];
  Object.keys(map).sort().forEach(function(h) {
    var uniq = [];
    var seen = {};
    map[h].forEach(function(s) {
      if (!seen[s]) { seen[s] = true; uniq.push(s); }
    });
    rows.push([h, uniq.join(', ')]);
  });
  return rows;
}

function buildReportPdfWarningRows(data) {
  var registry = (window.BioData && window.BioData.getSpeciesRegistry) ? window.BioData.getSpeciesRegistry() : [];
  var warnings = window.BioAnalytics.lowPopulationWarnings(data, { speciesRegistry: registry });
  return warnings
    .filter(function(w) { return w.severity === 'warning' || w.severity === 'critical'; })
    .map(function(w) {
      return [w.speciesName, w.siteName, 'estimate ' + w.currentCount + ' vs ' + w.baseline, w.severity];
    });
}

function exportReportPdf() {
  var PDFLib = window.jspdf;
  if (!PDFLib || !PDFLib.jsPDF) {
    alert('The PDF library failed to load. Check your connection and reload the page.');
    return;
  }

  var data = getReportData();
  var doc = new PDFLib.jsPDF({ unit: 'pt', format: 'a4' });
  var pageW = doc.internal.pageSize.getWidth();
  var marginX = 48;
  var maxW = pageW - marginX * 2;
  var y = 60;
  var today = new Date();
  var dateStr = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var timeStr = today.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  // Header band
  doc.setFillColor(46, 125, 50);
  doc.rect(0, 0, pageW, 10, 'F');

  // Title block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(44, 62, 80);
  doc.text('Biodiversity Monitoring System Report', marginX, y);
  y += 24;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(127, 140, 141);
  doc.text('Prepared by ZitBio: Biodiversity Monitoring System \u00b7 ' + dateStr + ' at ' + timeStr, marginX, y);
  y += 16;

  // Filters summary
  var filtersDesc = [];
  var f = analyticsFilters || {};
  if (f.dateFrom || f.dateTo) filtersDesc.push((f.dateFrom || '\u2026') + ' to ' + (f.dateTo || '\u2026'));
  if (f.focusArea) filtersDesc.push(f.focusArea);
  if (f.status) filtersDesc.push(f.status);
  if (f.species) filtersDesc.push(f.species);
  doc.text('Filters: ' + (filtersDesc.length ? filtersDesc.join(' \u00b7 ') : 'All data'), marginX, y);
  y += 26;

  // Executive summary
  y = pdfSectionTitle(doc, 'Executive Summary', y);
  y = pdfWrapped(doc, buildReportExecutiveSummary(data), marginX, y, maxW, 15, { size: 11, color: [44, 62, 80] }) + 8;

  // Key indicators
  y = pdfSectionTitle(doc, 'Key Indicators', y);
  y = pdfTable(doc, ['Species', 'Observations', 'Date Range', 'Shannon H\u2032'],
    [[window.BioAnalytics.speciesRichness(data), data.length, reportDateRange(data), window.BioAnalytics.shannonDiversityIndex(data).toFixed(3)]],
    y, [110, 130, 220, 100]) + 10;

  // Shannon index explanation (keeps the metric legible for non-experts)
  var shannonVal = window.BioAnalytics.shannonDiversityIndex(data);
  y = pdfWrapped(doc,
    'Understanding Shannon H\u2032: the Shannon Diversity Index combines species richness (how many species) with evenness (how evenly individuals are spread across species). A value of 0 means a single species dominates completely; higher values (typically up to 3\u20134) indicate a more diverse, balanced community. With ' +
    window.BioAnalytics.speciesRichness(data) + ' species recorded, the current value of ' + shannonVal.toFixed(3) +
    (shannonVal === 0 ? ' shows a single-species or heavily dominated community.' : ' reflects the overall balance of this community.'),
    marginX, y, maxW, 13, { size: 9.5, style: 'italic', color: [127, 140, 141] }) + 10;

  // Diversity by site
  var siteRows = buildReportPdfSiteRows(data);
  if (siteRows.length) {
    y = pdfSectionTitle(doc, 'Diversity by Site', y);
    y = pdfTable(doc, ['Site', 'Richness', 'Observations', 'Shannon H\u2032', 'Month'],
      siteRows, y, [160, 80, 110, 110, 100]) + 10;
  }

  // Species by habitat
  var habitatRows = buildReportPdfHabitatRows(data);
  if (habitatRows.length) {
    y = pdfSectionTitle(doc, 'Species by Habitat', y);
    y = pdfTable(doc, ['Habitat', 'Species (count)'], habitatRows, y, [130, 330]) + 10;
  }

  // Population trend (narrative + chart)
  var trend = window.BioAnalytics.populationTrend(data, null, null);
  y = pdfSectionTitle(doc, 'Population Trend', y);
  var trendText = (trend.direction === 'insufficient_data' || !trend.dataPoints || trend.dataPoints.length < 2)
    ? (trend.note || 'Insufficient data for a reliable trend; multiple survey periods are required.') + ' The chart below shows the observed counts recorded so far.'
    : 'Across the recorded periods the population is ' + trend.direction + ' at ' + Math.abs(trend.slope).toFixed(1) + ' individuals per survey period (' + (trend.note || 'linear fit on observed buckets') + ').';
  y = pdfWrapped(doc, trendText, marginX, y, maxW, 15, { size: 11 }) + 6;
  var trendCanvas = document.getElementById('reportTrendChart');
  if (trendCanvas && trend.dataPoints && trend.dataPoints.length > 0) {
    try {
      var img = trendCanvas.toDataURL('image/png');
      var imgW = maxW;
      var imgH = imgW * (trendCanvas.height / trendCanvas.width);
      y = pdfEnsureSpace(doc, y, imgH);
      doc.addImage(img, 'PNG', marginX, y, imgW, imgH);
      y += imgH + 10;
    } catch (e) { /* chart image unavailable — skip */ }
  }

  // Low population warnings
  var warnRows = buildReportPdfWarningRows(data);
  y = pdfSectionTitle(doc, 'Low Population Warnings', y);
  if (!warnRows.length) {
    y = pdfWrapped(doc, 'No species are currently below their population baseline. Current estimates are within expected ranges.', marginX, y, maxW, 15, { size: 11 }) + 6;
  } else {
    y = pdfTable(doc, ['Species', 'Site', 'Estimate vs baseline', 'Severity'], warnRows, y, [140, 130, 150, 90]) + 10;
  }

  // Footer / methodology
  y = pdfEnsureSpace(doc, y, 40);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageW - marginX, y);
  y += 18;
  var footnote = 'This report was generated from verified (Approved) observations within the selected filters. Shannon diversity H\u2032 combines species richness and evenness. Population trends are linear fits on observed survey buckets and are descriptive, not forecasts.';
  y = pdfWrapped(doc, footnote, marginX, y, maxW, 12, { size: 9, color: [127, 140, 141] }) + 6;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(127, 140, 141);
  doc.text('ZitBio \u00b7 ' + dateStr, marginX, y);

  doc.save('zitbio-report_' + today.toISOString().split('T')[0] + '.pdf');
}

// ============================================================
//  GRAPHS TAB (Tier 1) — Chart.js
// ============================================================

function buildGraphsCharts(data) {
  var richnessCanvas = document.getElementById('graphRichnessChart');
  var shannonCanvas = document.getElementById('graphShannonChart');
  var trendCanvas = document.getElementById('graphTrendChart');
  if (!richnessCanvas || !shannonCanvas || !trendCanvas || typeof Chart === 'undefined') return;

  if (graphRichnessChartInstance) { graphRichnessChartInstance.destroy(); graphRichnessChartInstance = null; }
  if (graphShannonChartInstance) { graphShannonChartInstance.destroy(); graphShannonChartInstance = null; }
  if (graphTrendChartInstance) { graphTrendChartInstance.destroy(); graphTrendChartInstance = null; }

  var sites = (window.BioData && window.BioData.getSiteRegistry) ? window.BioData.getSiteRegistry() : [];

  var monthSet = {};
  sites.forEach(function(site) {
    window.BioAnalytics.siteComparisonOverTime(data, site.id).forEach(function(b) { monthSet[b.month] = true; });
  });
  var months = Object.keys(monthSet).sort();

  function makeLineChart(canvas, datasets, yTitle, opts) {
    opts = opts || {};
    var labels = opts.labels || months;
    var ctx = canvas.getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: datasets.length > 1 },
          tooltip: {
            callbacks: {
              label: function(context) {
                var val = context.parsed.y;
                if (val == null) return null;
                return context.dataset.label + ': ' + val + (opts.tooltipUnit ? ' ' + opts.tooltipUnit : '');
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: !!yTitle, text: yTitle },
            grid: { color: '#f1f5f9' },
            ticks: opts.integerY ? { precision: 0, stepSize: 1 } : undefined
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  var richnessDatasets = [];
  var shannonDatasets = [];
  sites.forEach(function(site) {
    var series = window.BioAnalytics.siteComparisonOverTime(data, site.id);
    var byMonth = {};
    var color = site.id === 'site_001' ? '#2E7D32' : '#8D6E63';
    series.forEach(function(b) { byMonth[b.month] = b; });
    richnessDatasets.push({
      label: site.name,
      data: months.map(function(m) { return byMonth[m] ? byMonth[m].speciesRichness : null; }),
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.3,
      spanGaps: true,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2
    });
    shannonDatasets.push({
      label: site.name,
      data: months.map(function(m) { return byMonth[m] ? byMonth[m].shannonIndex : null; }),
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.3,
      spanGaps: true,
      borderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: color,
      pointBorderColor: '#ffffff',
      pointBorderWidth: 2
    });
  });

  graphRichnessChartInstance = makeLineChart(richnessCanvas, richnessDatasets, 'Species', { integerY: true, tooltipUnit: 'species' });
  graphShannonChartInstance = makeLineChart(shannonCanvas, shannonDatasets, 'H\u2032');

  // Species is controlled by the shared filter bar, so the population trend
  // always aggregates the already-filtered dataset (no per-species select).
  var trend = window.BioAnalytics.populationTrend(data, null, null);
  var tLabels = trend.dataPoints.map(function(b) { return b.label; });
  var tDatasets = [{
    label: 'Observed count',
    data: trend.dataPoints.map(function(b) { return b.value; }),
    borderColor: '#2E7D32',
    backgroundColor: 'transparent',
    fill: false,
    tension: 0.3,
    borderWidth: 2,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: '#2E7D32',
    pointBorderColor: '#ffffff',
    pointBorderWidth: 2
  }];
  if (trend.fitted && trend.fitted.length > 1) {
    tDatasets.push({
      label: 'Trend line',
      data: trend.fitted.map(function(f) { return f.value; }),
      borderColor: trend.direction === 'declining' ? '#E53935' : '#8D6E63',
      borderDash: [5, 5],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      tension: 0
    });
  }
  graphTrendChartInstance = makeLineChart(trendCanvas, tDatasets, 'Count', { labels: tLabels, integerY: true, tooltipUnit: 'individuals' });

  // Explain why no trend line is drawn yet (needs >= 2 survey buckets).
  var trendNoteEl = document.getElementById('graphTrendNote');
  if (trendNoteEl) {
    trendNoteEl.textContent = (trend.direction === 'insufficient_data' || !trend.fitted || trend.fitted.length < 2)
      ? (trend.note || 'Insufficient data for a trend — need multiple survey periods.')
      : (trend.slope.toFixed(3) + ' / period · ' + trend.direction + ' (trend line, not a forecast)');
  }
}

function getGraphData() {
    var d = typeof getAnalyticsFilteredData === 'function'
        ? getAnalyticsFilteredData()
        : (window.BioData ? window.BioData.getObservations() : []);
  // Respect the From/To filter exactly; otherwise default to the recent
  // rolling window (same rule as the report).
  d = applyAnalyticsDateWindow(d);
  d = enrichWithRegistryIds(d);
  // Reports/graphs always use verified (Approved) data only.
  return d.filter(function(o) { return o.verification_status === 'Approved'; });
}

var reportTabInitialized = false;
var graphsTabInitialized = false;

function initGraphsTab() {
  buildGraphsCharts(getGraphData());
  if (graphsTabInitialized) return;
  graphsTabInitialized = true;
}

function initReportTab() {
  var csvBtn = document.getElementById('reportCsvBtn');
  var pdfBtn = document.getElementById('reportPdfBtn');
  var speciesSelect = document.getElementById('reportTrendSpecies');

  function populateReportSpecies() {
    if (!speciesSelect || !window.BioData) return;
    var registry = window.BioData.getSpeciesRegistry ? window.BioData.getSpeciesRegistry() : [];
    var html = '<option value="">All species</option>';
    registry.forEach(function(sp) {
      html += '<option value="' + sp.id + '">' + analyticsEscape(sp.common_name || sp.scientific_name) + '</option>';
    });
    speciesSelect.innerHTML = html;
  }

  function renderReport() {
    var data = getReportData();
    buildReportConfidence();
    buildReportSummary(data);
    buildReportDiversity(data);
    buildReportWarnings(data);
    buildReportHabitats(data);
    buildReportTrendChart(data);
  }

  // Populate the species dropdown on first mount only; if empty (a race
  // where the registry script hasn't hydrated yet), retry on each render.
  if (!speciesSelect || speciesSelect.options.length <= 1) populateReportSpecies();

  // Idempotency guard: re-render on every activation (filters/charts stay
  // fresh), but attach event listeners only once (no stacked handlers).
  if (reportTabInitialized) {
    renderReport();
    return;
  }
  reportTabInitialized = true;

  renderReport();

  if (csvBtn) csvBtn.addEventListener('click', function() {
    var date = new Date().toISOString().split('T')[0];
    downloadCsv(buildReportCsv(getReportData()), 'zitbio-report_' + date + '.csv');
  });
  if (pdfBtn) pdfBtn.addEventListener('click', exportReportPdf);
  if (speciesSelect) speciesSelect.addEventListener('change', renderReport);
}

// Lazy init when Report/Graphs tabs are activated (persisted tab restore
// uses .click(), so these fire even when the saved tab is Report/Graphs).
(function() {
  var tabs = document.querySelectorAll('.analytics-tab');
  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() {
      var tabName = this.getAttribute('data-tab');
      if (tabName === 'report' && typeof initReportTab === 'function') initReportTab();
      if (tabName === 'graphs' && typeof initGraphsTab === 'function') initGraphsTab();
    });
  });
})();

// Re-render after cloud sync (same pattern as the observations table).
window.addEventListener('biodata:synced', function() {
  var reportPanel = document.getElementById('tab-report');
  var graphsPanel = document.getElementById('tab-graphs');
  if (reportPanel && reportPanel.classList.contains('active') && typeof initReportTab === 'function') initReportTab();
  if (graphsPanel && graphsPanel.classList.contains('active') && typeof initGraphsTab === 'function') initGraphsTab();
});
