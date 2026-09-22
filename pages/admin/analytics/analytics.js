/* ZitBio analytics page: tab switching, table rendering, pagination, search and
   column toggling. Tables render through the shared observationsRenderer, so the
   Table tab matches the admin Observations page. */

var analyticsCurrentPage = 1;
var analyticsFilteredData = [];
var analyticsRecordsPerPage = 10;

var analyticsFilters = {
    dateFrom: '',
    dateTo: '',
    focusArea: '',
    status: '',
    species: ''
};

// Stored here rather than in the DOM so they survive table re-renders, which
// would otherwise reset the checkbox states.
var analyticsVisibleColumns = {
    coords: false,
    province: false,
    locality: false,
    'recorded-by': false,
    institution: false,
    'obs-id': false
};

var ANALYTICS_VIEW_KEY = 'analytics_view';

// Filters, column toggles, search and page survive navigating away. The tab is
// persisted separately under biodata_analytics_tab.
function saveAnalyticsView() {
    if (!window.BioPageState) return;
    var searchInput = document.querySelector('.page-analytics .search-input');
    window.BioPageState.write(ANALYTICS_VIEW_KEY, {
        filters: analyticsFilters,
        columns: analyticsVisibleColumns,
        search: searchInput ? searchInput.value : '',
        page: analyticsCurrentPage
    });
}

function restoreAnalyticsView() {
    var saved = window.BioPageState ? window.BioPageState.read(ANALYTICS_VIEW_KEY, null) : null;
    if (!saved || typeof saved !== 'object') return;

    if (saved.filters && typeof saved.filters === 'object') {
        Object.keys(analyticsFilters).forEach(function(key) {
            if (typeof saved.filters[key] === 'string') analyticsFilters[key] = saved.filters[key];
        });
    }
    if (saved.columns && typeof saved.columns === 'object') {
        Object.keys(analyticsVisibleColumns).forEach(function(key) {
            if (typeof saved.columns[key] === 'boolean') analyticsVisibleColumns[key] = saved.columns[key];
        });
    }
    if (typeof saved.page === 'number' && saved.page > 0) analyticsCurrentPage = saved.page;

    var searchInput = document.querySelector('.page-analytics .search-input');
    if (searchInput && typeof saved.search === 'string') searchInput.value = saved.search;
}

// Two phases: BioData filters first, then a scoped search on top, so the filter
// badge can count active filters even when no search term is entered.
function getAnalyticsFilteredData() {
    if (!window.BioData) return [];
    
    var data = window.BioData.filterObservations(analyticsFilters);
    
    var searchInput = document.querySelector('.page-analytics .search-input');
    if (searchInput && searchInput.value.trim()) {
        var selectedField = document.querySelector('input[name="searchField"]:checked');
        var field = selectedField ? selectedField.value : '';
        var query = searchInput.value;
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

function countActiveFilters() {
    var count = 0;
    if (analyticsFilters.dateFrom) count++;
    if (analyticsFilters.dateTo) count++;
    if (analyticsFilters.focusArea) count++;
    if (analyticsFilters.status) count++;
    if (analyticsFilters.species) count++;
    return count;
}

function updateFilterCount() {
    var badge = document.getElementById('filterCountBadge');
    if (!badge) return;
    var count = countActiveFilters();
    badge.textContent = count;
}

function applyFilters() {
    analyticsCurrentPage = 1;
    updateFilterCount();
    populateSpeciesOptions();
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
            cellClass: 'province-cell',
            toggleKey: 'province',
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
            cellClass: 'focus-area-cell',
            render: function(obs) {
                var loc = obs.location || {};
                var name = loc.focus_area || '';
                // Full registry name: the tables are where the long form matters.
                return name ? escapeHtmlObs(window.BioData.getSiteLabel(name, 'full')) : '—';
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
        columns: getAnalyticsColumns(),
        onPageChange: function(page) {
            analyticsCurrentPage = page;
            renderAnalyticsTable();
        }
    });

    applyColumnVisibility();
    markRowsAsMapLinked();
    saveAnalyticsView();
}

// A row is a way into the map, but a single click would fight text selection, so
// the gesture is a double click and the rows say so on hover.
function markRowsAsMapLinked() {
    var rows = document.querySelectorAll('.page-analytics .observation-row');
    rows.forEach(function(row) {
        row.title = 'Double-click to show this observation on the map';
    });
}

function handleAnalyticsSearch() {
    analyticsCurrentPage = 1;
    renderAnalyticsTable();
}

//  FILTER BAR TOGGLE

function initFilterToggle() {
    var toggleBtn = document.getElementById('analyticsFilterToggle');
    var filterBar = document.getElementById('analyticsFilters');
    if (!toggleBtn || !filterBar) return;

    toggleBtn.addEventListener('click', function() {
        filterBar.classList.toggle('open');
        this.classList.toggle('active');
    });

    if (countActiveFilters() > 0) {
        filterBar.classList.add('open');
        toggleBtn.classList.add('active');
    }
}

//  FILTER DROPDOWNS

function populateFilterDropdowns() {
    if (!window.BioData) return;
    populateFocusAreaOptions();
    populateSpeciesOptions();
}

// Option values are site names because that is what observations.focus_area
// stores; the shorter registry name is only ever the label.
function populateFocusAreaOptions() {
    var select = document.getElementById('filterFocusArea');
    if (!select) return;

    var previous = select.value;
    select.innerHTML = '<option value="">All focus areas</option>';

    var registry = window.BioData.getSiteRegistry ? (window.BioData.getSiteRegistry() || []) : [];
    registry.forEach(function(site) {
        if (!site || !site.name) return;
        var opt = document.createElement('option');
        opt.value = site.name;
        opt.textContent = site.short_name || site.name;
        select.appendChild(opt);
    });

    select.value = previous;
}

// Scoped to the other active filters, so the list cannot offer a species that is
// absent from the current result set.
function populateSpeciesOptions() {
    var select = document.getElementById('filterSpecies');
    if (!select || !window.BioData) return;

    var previous = analyticsFilters.species || select.value || '';
    select.innerHTML = '<option value="">All species</option>';

    var scoped = window.BioData.filterObservations({
        dateFrom: analyticsFilters.dateFrom,
        dateTo: analyticsFilters.dateTo,
        focusArea: analyticsFilters.focusArea,
        status: analyticsFilters.status,
        species: ''
    });

    var seen = {};
    var names = [];
    scoped.forEach(function(obs) {
        var sd = obs.species_details || {};
        var name = sd.common_name || sd.scientific_name || '';
        if (!name || seen[name]) return;
        seen[name] = true;
        names.push(name);
    });
    names.sort(function(a, b) { return a.localeCompare(b); });

    names.forEach(function(name) {
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });

    // A species the admin already picked stays on the list, labelled, so an empty
    // table explains itself rather than the filter changing under them.
    if (previous && !seen[previous]) {
        var stale = document.createElement('option');
        stale.value = previous;
        stale.textContent = previous + ' (outside the current filters)';
        select.appendChild(stale);
    }

    select.value = previous;
}

//  COLUMN VISIBILITY

function applyColumnVisibility() {
    var table = document.querySelector('.page-analytics .observations-table');
    if (!table) return;

    for (var col in analyticsVisibleColumns) {
        if (analyticsVisibleColumns.hasOwnProperty(col)) {
            table.setAttribute('data-show-' + col, analyticsVisibleColumns[col] ? 'true' : 'false');
        }
    }
}

// The filter bar's controls, looked up in one place so every reader resolves the
// same set of ids.
function getFilterControls() {
    return {
        dateFrom: document.getElementById('filterDateFrom'),
        dateTo: document.getElementById('filterDateTo'),
        focusArea: document.getElementById('filterFocusArea'),
        status: document.getElementById('filterStatus'),
        species: document.getElementById('filterSpecies'),
        clearBtn: document.getElementById('filterClear')
    };
}

// Pushes the restored state back into the controls, so the filter bar and toggle
// buttons show what the table is already doing.
function applyFilterControlsFromState() {
    var controls = getFilterControls();

    if (controls.dateFrom) controls.dateFrom.value = analyticsFilters.dateFrom;
    if (controls.dateTo) controls.dateTo.value = analyticsFilters.dateTo;
    if (controls.focusArea) controls.focusArea.value = analyticsFilters.focusArea;
    if (controls.status) controls.status.value = analyticsFilters.status;
    if (controls.species) controls.species.value = analyticsFilters.species;

    document.querySelectorAll('.page-analytics .col-toggle-btn').forEach(function(btn) {
        btn.classList.toggle('active', !!analyticsVisibleColumns[btn.getAttribute('data-col')]);
    });
}

//  COLUMN TOGGLE BUTTONS

function initColumnToggleButtons() {
    var buttons = document.querySelectorAll('.page-analytics .col-toggle-btn');
    buttons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var col = this.getAttribute('data-col');
            if (!col) return;
            
            analyticsVisibleColumns[col] = !analyticsVisibleColumns[col];
            this.classList.toggle('active');
            
            applyColumnVisibility();
            saveAnalyticsView();
        });
    });
}

//  FILTER LISTENERS
//  Re-render on change, not on every keystroke, to avoid churn.

function initFilterListeners() {
    var controls = getFilterControls();

    function onFilterChange() {
        analyticsFilters.dateFrom = controls.dateFrom ? controls.dateFrom.value : '';
        analyticsFilters.dateTo = controls.dateTo ? controls.dateTo.value : '';
        analyticsFilters.status = controls.status ? controls.status.value : '';
        analyticsFilters.species = controls.species ? controls.species.value : '';
        applyFilters();
    }

    if (controls.dateFrom) controls.dateFrom.addEventListener('change', onFilterChange);
    if (controls.dateTo) controls.dateTo.addEventListener('change', onFilterChange);
    if (controls.status) controls.status.addEventListener('change', onFilterChange);
    if (controls.species) controls.species.addEventListener('change', onFilterChange);

    // Focus Area is not a plain filter: it also decides which map area is in
    // scope, so it goes through the one function that owns that decision.
    if (controls.focusArea) {
        controls.focusArea.addEventListener('change', function() {
            setFocusArea(this.value, { fit: true });
        });
    }

    if (controls.clearBtn) {
        controls.clearBtn.addEventListener('click', function() {
            if (controls.dateFrom) controls.dateFrom.value = '';
            if (controls.dateTo) controls.dateTo.value = '';
            if (controls.status) controls.status.value = '';
            if (controls.species) controls.species.value = '';

            analyticsFilters.dateFrom = '';
            analyticsFilters.dateTo = '';
            analyticsFilters.status = '';
            analyticsFilters.species = '';
            setFocusArea('', { fit: true });
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
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

            // The Table tab (data-tab="observations") is the one that shows the
            // search box and the column toggles.
            var isTableTab = (tabName === 'observations');
            if (searchWrapper) {
                searchWrapper.style.display = isTableTab ? 'inline-flex' : 'none';
            }
            // Tag the container so CSS can align the search/filter controls per
            // tab at responsive breakpoints: Table shows both (side by side
            // below the tabs on small screens); the other tabs keep the filter
            // button right-aligned next to the tabs on every breakpoint.
            if (tabsContainer) {
                tabsContainer.classList.toggle('with-search', isTableTab);
            }
            // Column toggles apply to the Table tab only: flagging the filter
            // bar hides the Toggle Columns row on Map/Graphs/Report.
            if (filterBar) {
                filterBar.classList.toggle('with-column-toggles', isTableTab);
            }
        }
    }

    tabs.forEach(function(tab) {
        tab.addEventListener('click', function(e) {
            activateTab(this);
            // Persist the active tab so returning to the page restores it.
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

    // Restore the saved tab unless an explicit hash deep-link already chose one.
    // .click() also runs tab-specific init (e.g. the lazy Leaflet map).
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

    // Apply the same class on first load, not only after a tab click.
    var initialTab = document.querySelector('.analytics-tab.active');
    var initialIsTableTab = !!(initialTab && initialTab.getAttribute('data-tab') === 'observations');
    if (tabsContainer) {
        tabsContainer.classList.toggle('with-search', initialIsTableTab);
    }
    if (filterBar) {
        filterBar.classList.toggle('with-column-toggles', initialIsTableTab);
    }

    if (!window.BioData) {
        console.warn('BioData not loaded. Analytics page cannot render table.');
        return;
    }

    // Restored first: the dropdown options are built from the restored filters.
    restoreAnalyticsView();
    populateFilterDropdowns();
    applyFilterControlsFromState();
    initFilterToggle();
    initFilterListeners();
    initColumnToggleButtons();
    updateFilterCount();

    renderAnalyticsTable();

    var searchInput = document.querySelector('.page-analytics .search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handleAnalyticsSearch);
    }
});

// Re-render the analytics table after the Supabase sync layer seeds cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    if (typeof renderAnalyticsTable === 'function') {
      // The cloud copy of the site registry replaces the local one, so the option
      // labels are rebuilt before the filters are applied.
      populateFocusAreaOptions();
      applyFilters();
    }
  });
}

//  CBU AREA MAP
//  Leaflet, created lazily on first Map-tab activation so pages that never open
//  the map do not load Leaflet resources at all.

(function() {
    'use strict';

    var mapInitialized = false;
    var mapInstance = null;
    var tileLayer = null;
    var parkPolygon = null;
    var campusPolygon = null;
    var obsMarkers = [];
    // Observations represented on the map, which is not the same as the number of
    // markers drawn once records are grouped.
    var plottedRecordCount = 0;
    var plottedStats = null;
    var mapActiveArea = 'park';
    var mapMode = 'map';

    // [lat, lng] order, as Leaflet expects.
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

    // THE ZOOM WINDOW, and the only place it is written down.
    //
    // It used to be minZoom 16, and it used to be written three times: here, in
    // the tile layer, and again as literals inside `stepZoom`. The effect of the
    // three copies was that "Fit area" on Campus stopped at 16 - Leaflet clamps
    // `fitBounds` by `minZoom` - and zooming out looked stuck, because the zoom-out
    // button was clamped by the same number. The Nature Park is small enough to fit
    // above 16, which is why only the Campus view looked broken.
    //
    // 15 is a deliberate floor, not a fit: it is the furthest out the map is
    // allowed to go. The Campus bounds are ~1.9km x ~1.1km, which needs ~15.4 to
    // frame on a 720x380 map and ~15.9 on a large one - so the floor sits just under
    // the Campus fit and the fit still succeeds on a tablet or a desktop window.
    // On a phone-width map (a ~328px map) the Campus genuinely needs ~14.4 to fit
    // horizontally, so there the floor crops it by about a tenth of its width and
    // the user pans; that is the cost of not being able to zoom out past 15.
    //
    // The inset in `fitPadding()` is what keeps the desktop fit above the floor: an
    // 80px inset needs 14.8, which the floor would refuse.
    var MAP_MIN_ZOOM = 15;
    var MAP_MAX_ZOOM = 18;

    // Two zoom thresholds, because there are two different things a "cluster" can
    // be, and the user asked for them to come apart at different points (2026-09-16):
    // records at ONE coordinate split at 17.5, and records that are merely close
    // together split by 18.0, so the top of the range shows every record on its own.
    //
    // At and above this one, a group of records that share a coordinate is drawn
    // apart, around that coordinate, so each is its own marker. It is the only place
    // the map moves a marker off its position, and it is confined to records that
    // have no separate position to be drawn on. The popup says how many records
    // share the point, so the spread is explained rather than implied.
    var FANOUT_ZOOM = MAP_MAX_ZOOM - 0.5;

    // At and above this one, merely-nearby records stop being merged at all: two
    // places a few metres apart are two places once you are this close. Below it,
    // records within lib/map-cluster.js's pixel radius draw as one group, so the map
    // clusters while you are zoomed out and shows records once you are in.
    //
    // amCharts' `stopClusterZoom` is the same idea with one threshold; this splits it
    // in two because a shared coordinate and a near miss are different claims.
    var SEPARATE_ZOOM = MAP_MAX_ZOOM;

    // Marker geometry, in px. A dot is 14px plus a 2px border; a group bubble is
    // large enough for three digits on its core and still small enough that two
    // groups 40px apart stay distinguishable.
    var DOT_SIZE = [14, 14];
    var CLUSTER_BOX = 40;

    function isSeparateZoom() {
        return !!mapInstance && mapInstance.getZoom() >= SEPARATE_ZOOM;
    }

    function isFanoutZoom() {
        return !!mapInstance && mapInstance.getZoom() >= FANOUT_ZOOM;
    }

    var statusFilterState = {
        Approved: true,
        Pending: true,
        Flagged: true
    };

    // MAP STATE PERSISTENCE
    // Mode, zoom/center and the status filters survive navigating away and back.
    // The active area is NOT stored here: the Focus Area filter owns it, so there
    // is one value instead of two that can disagree. The focused observation is
    // not stored either, because auto-flying to a record nobody clicked confused
    // people.
    var MAP_STATE_KEY = 'biodata_analytics_map';

    // In memory only, for the explicit table-row→map fly. Never restored on load.
    var focusedObsId = null;

    // Keeps the map's idea of its own size honest when the container changes.
    // Assigned in initMap; held here so it cannot be collected mid-life.
    var mapSizer = null;

    function saveMapState() {
        var state = {
            mode: mapMode,
            statusFilters: statusFilterState
        };
        if (mapInstance) {
            state.zoom = mapInstance.getZoom();
            state.center = [mapInstance.getCenter().lat, mapInstance.getCenter().lng];
        }
        try {
            localStorage.setItem(MAP_STATE_KEY, JSON.stringify(state));
        } catch (err) { /* storage unavailable, ignore */ }
    }

    function loadMapState() {
        try {
            var raw = localStorage.getItem(MAP_STATE_KEY);
            if (!raw) return null;
            var state = JSON.parse(raw);
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

    // The Focus Area filter is the single owner of the area in scope. The map's own
    // toggle and the toolbar button both read and write through setFocusArea, so
    // there is no second value to drift.
    function getSiteRegistry() {
        return (window.BioData && window.BioData.getSiteRegistry) ? (window.BioData.getSiteRegistry() || []) : [];
    }

    function areaForSiteName(name) {
        var wanted = String(name == null ? '' : name).toLowerCase();
        if (!wanted) return '';
        var match = getSiteRegistry().find(function(site) {
            return (site.name || '').toLowerCase() === wanted;
        });
        var probe = match ? (match.name || '').toLowerCase() : wanted;
        if (/nature park/.test(probe)) return 'park';
        if (/campus|copperbelt university/.test(probe)) return 'campus';
        return '';
    }

    function focusAreaForArea(area) {
        var pattern = area === 'park' ? /nature park/ : /campus|copperbelt university/;
        var match = getSiteRegistry().find(function(site) {
            return pattern.test((site.name || '').toLowerCase());
        });
        return match ? match.name : '';
    }

    function updateAreaStatus() {
        var label = document.getElementById('map-status-area');
        if (!label) return;
        var site = getSiteRegistry().find(function(s) {
            return mapActiveArea && areaForSiteName(s.name) === mapActiveArea;
        });
        label.textContent = site ? (site.short_name || site.name) : 'All focus areas';
    }

    function updateAreaControls() {
        var toggle = document.getElementById('map-area-toggle');
        if (toggle) {
            toggle.querySelectorAll('.map-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-area') === mapActiveArea);
            });
        }
        var focusBtn = document.getElementById('toolbar-focus-toggle');
        if (focusBtn) {
            var nextLabel = mapActiveArea === 'park' ? 'Campus' : 'Nature Park';
            focusBtn.setAttribute('data-tooltip', 'Switch to ' + nextLabel);
            focusBtn.setAttribute('aria-label', 'Switch to ' + nextLabel);
        }
    }

    /**
     * The only writer of the focus-area scope: keeps the filter chip, the table and
     * charts, the polygon styles, the camera and the status bar in step.
     */
    window.setFocusArea = function(value, options) {
        var opts = options || {};
        analyticsFilters.focusArea = value || '';

        var chip = document.getElementById('filterFocusArea');
        if (chip) chip.value = analyticsFilters.focusArea;

        if (opts.apply !== false) applyFilters();

        mapActiveArea = areaForSiteName(analyticsFilters.focusArea);

        if (mapInstance) {
            renderPolygons(mapActiveArea);
            if (opts.fit !== false) fitActiveArea();
        }

        updateAreaControls();
        updateAreaStatus();
        saveMapState();
    };

    // The toolbar button cycles the same value the filter chip owns.
    window.cycleMapFocus = function() {
        var next = mapActiveArea === 'park' ? 'campus' : 'park';
        window.setFocusArea(focusAreaForArea(next), { fit: true });
    };

    function getStatusColor(status) {
        var s = (status || '').toLowerCase();
        if (s === 'approved') return '#22c55e';
        if (s === 'pending') return '#eab308';
        if (s === 'flagged') return '#ef4444';
        return '#6b7280';
    }

    // Species names, localities and officer names are user-entered (or imported
    // from a third party), and both popup builders interpolate them, so every
    // value goes through lib/escape.js - the app's single escaper.
    function mapEscape(value) {
        if (window.BioEscape && typeof window.BioEscape.escapeHtml === 'function') {
            return window.BioEscape.escapeHtml(value);
        }
        return typeof escapeHtmlObs === 'function' ? escapeHtmlObs(value) : '';
    }

    // Statuses arrive as written by officers and by importers, so the filter keys
    // below are the only spelling the map reasons about.
    var MAP_STATUSES = ['Approved', 'Pending', 'Flagged'];

    function normaliseMapStatus(status) {
        var wanted = String(status == null ? '' : status).toLowerCase();
        for (var i = 0; i < MAP_STATUSES.length; i++) {
            if (MAP_STATUSES[i].toLowerCase() === wanted) return MAP_STATUSES[i];
        }
        return 'Unknown';
    }

    function buildPopupRow(item) {
        var obs = item.obs;
        var sd = obs.species_details || {};
        var name = sd.common_name || sd.scientific_name || 'Unknown';
        var date = obs.timestamp ? String(obs.timestamp).split('T')[0] : '';
        // The record the user double-clicked in the table is marked here, which is
        // how a record inside a 135-record summary bubble stays findable.
        var focused = obs.observation_id && obs.observation_id === focusedObsId;
        return '<div class="map-popup-list-item' + (focused ? ' map-popup-list-item--focused' : '') + '">'
            + '<span class="map-popup-dot" style="background:' + getStatusColor(item.status) + '"></span>'
            + '<span class="map-popup-list-text">' + mapEscape(name) + '</span>'
            + (date ? '<span class="map-popup-list-date">' + mapEscape(date) + '</span>' : '')
            + '</div>';
    }

    // One popup builder for every kind of marker: a single observation reads as it
    // always did; a group says how many records it stands for and how many places
    // they came from, because a group now means "close together on screen", which
    // is not the same claim as "at the same coordinate".
    function buildPopupContent(items, summary) {
        if (items.length === 1) {
            var obs = items[0].obs;
            var sd = obs.species_details || {};
            var sciName = sd.scientific_name || 'Unknown';
            var commonName = sd.common_name || '';
            var status = items[0].status;
            var date = obs.timestamp ? String(obs.timestamp).split('T')[0] : '';
            var officer = obs.recorded_by || '';

            var html = '<div class="map-popup-species">';
            if (commonName) {
                html += mapEscape(commonName) + ' <i>(' + mapEscape(sciName) + ')</i>';
            } else {
                html += '<i>' + mapEscape(sciName) + '</i>';
            }
            html += '</div>';
            if (date) html += '<div class="map-popup-detail">' + mapEscape(date) + '</div>';
            if (officer) html += '<div class="map-popup-detail">' + mapEscape(officer) + '</div>';
            // A marker that was spread away from its coordinate has to say so here.
            // Without it, nine dots drawn in a ring read as nine places, which is the
            // one thing the fan-out must not be allowed to imply.
            if (summary && summary.sharedWith > 1) {
                html += '<div class="map-popup-detail">One of ' + mapEscape(summary.sharedWith)
                    + ' records recorded at this same point</div>';
            }
            html += '<div class="map-popup-foot"><span class="map-popup-status ' + status.toLowerCase() + '">'
                + mapEscape(status) + '</span></div>';
            return html;
        }

        var places = summary && summary.coordinateCount;
        var heading = items.length + ' observations';
        if (places > 1) heading += ' at ' + places + ' locations';
        else heading += ' at this location';

        // A list long enough to scroll is worse than a list that says how much it
        // is hiding, so the tail is summarised.
        var MAX_LISTED = 6;
        var html2 = '<div class="map-popup-species">' + heading + '</div>';
        html2 += '<div class="map-popup-sub">' + mapEscape(items[0].status) + '</div>';
        html2 += '<div class="map-popup-list">';
        items.slice(0, MAX_LISTED).forEach(function(item) {
            html2 += buildPopupRow(item);
        });
        html2 += '</div>';
        if (items.length > MAX_LISTED) {
            html2 += '<div class="map-popup-detail">+' + (items.length - MAX_LISTED) + ' more</div>';
        }
        // Spotting why the pile exists matters more than the pile: an imported
        // dataset has one coordinate for the whole hotspot, so every record from it
        // lands on the same pixel. Saying so stops the map looking broken.
        if (places === 1 && items.every(function(item) { return item.obs.source === 'gbif'; })) {
            html2 += '<div class="map-popup-detail">Shared GBIF/eBird hotspot coordinate, so these records sit on one point.</div>';
        }
        return html2;
    }

    // Leaflet anchors an icon by the point it represents, so both icons anchor on
    // their own centre. The bubble is much bigger than a dot and would otherwise
    // sit half a bubble up and to the left of its coordinate.
    function dotIcon(color) {
        return L.divIcon({
            className: '',
            html: '<div class="map-obs-marker" style="background:' + color + ';"></div>',
            iconSize: DOT_SIZE,
            iconAnchor: [DOT_SIZE[0] / 2, DOT_SIZE[1] / 2]
        });
    }

    // A group: concentric halos in the status colour with the count on a solid
    // core, so "how many" is readable without opening anything. `--map-status-color`
    // is set here because it is data (one of three status colours), not theme.
    function clusterIcon(color, item) {
        return L.divIcon({
            className: '',
            html: '<div class="map-cluster" style="--map-status-color:' + color + ';">'
                + '<span class="map-cluster-halo map-cluster-halo--outer"></span>'
                + '<span class="map-cluster-halo map-cluster-halo--inner"></span>'
                + '<span class="map-cluster-core">' + mapEscape(item.count) + '</span>'
                + '</div>',
            iconSize: [CLUSTER_BOX, CLUSTER_BOX],
            iconAnchor: [CLUSTER_BOX / 2, CLUSTER_BOX / 2]
        });
    }

    // amCharts' zoomToCluster: one click on a group of several PLACES goes to them,
    // because the current zoom is what merged them. A group of records that share a
    // single coordinate is never drilled into - no zoom can separate it - so it is
    // given a popup instead.
    //
    // `maxZoom` is what makes one call serve both: the members occupy at most the
    // cluster radius, so this always zooms IN, and it stops at the one zoom where
    // grouping of merely-nearby records ends. Since that is now the top of the
    // range, a click on a group from a wide view is a long jump, and that is the
    // contract: below this zoom the map shows groups, and asking for the members
    // means asking for the zoom that can show them.
    function drillInto(members) {
        var bounds = L.latLngBounds([]);
        members.forEach(function(entry) {
            var loc = entry.obs.location || {};
            if (loc.latitude != null && loc.longitude != null) {
                bounds.extend([loc.latitude, loc.longitude]);
            }
        });
        if (!bounds.isValid()) return;
        mapInstance.fitBounds(bounds, { padding: [60, 60], maxZoom: SEPARATE_ZOOM });
    }

    // Rebuilt from the CURRENT zoom every time, because grouping is a screen
    // distance: the campus's imported records are one group when the whole campus
    // fits on screen and separate markers once you zoom in, and records that share
    // one hotspot coordinate are one counted marker at every zoom. Fixing the
    // grouping at plot time is what made the old marker count describe a screen
    // that no longer existed.
    function plotObservations() {
        obsMarkers.forEach(function(m) { mapInstance.removeLayer(m); });
        obsMarkers = [];

        if (!window.BioData || !window.BioMapCluster || !mapInstance) return;

        var allObs = typeof getAnalyticsFilteredData === 'function'
            ? getAnalyticsFilteredData()
            : window.BioData.getObservations();
        if (!allObs) return;

        // Project once here: the layout module works in container pixels so it can
        // be reasoned about (and tested) without a map.
        var points = [];
        var byId = {};
        allObs.forEach(function(obs, index) {
            var loc = obs.location || {};
            var lat = loc.latitude;
            var lng = loc.longitude;
            if (lat == null || lng == null) return;

            var status = normaliseMapStatus(obs.verification_status || 'Approved');
            // Only the three statuses the map has a filter for are drawn, so the
            // legend and the marker count agree.
            if (statusFilterState[status] !== true) return;

            // observation_id is the primary key everywhere else; the fallback keeps
            // a record that somehow lacks one from stealing another's identity.
            var id = obs.observation_id || 'unidentified_' + index;
            var px = mapInstance.latLngToContainerPoint([lat, lng]);
            points.push({ id: id, lat: Number(lat), lng: Number(lng), x: px.x, y: px.y, status: status });
            byId[id] = { obs: obs, status: status };
        });

        var layout = window.BioMapCluster.plan(points, {
            groupNearby: !isSeparateZoom(),
            fanout: isFanoutZoom()
        });

        layout.items.forEach(function(item) {
            var members = [];
            item.ids.forEach(function(id) { if (byId[id]) members.push(byId[id]); });
            if (!members.length) return;

            var color = getStatusColor(item.status);
            var at = mapInstance.containerPointToLatLng([item.x, item.y]);
            var marker;

            if (item.count > 1) {
                marker = L.marker(at, { icon: clusterIcon(color, item) });
                if (item.coordinateCount > 1) {
                    // Several distinct places, merged only because of this zoom:
                    // the useful answer is to go and look at them separately.
                    marker.on('click', function() { drillInto(members); });
                } else {
                    // One place with several records. Zooming cannot help, so the
                    // group answers with its list.
                    marker.bindPopup(buildPopupContent(members, item));
                }
            } else {
                marker = L.marker(at, { icon: dotIcon(color) });
                marker.bindPopup(buildPopupContent(members, item));
            }

            marker._obsIds = item.ids.slice();
            marker.addTo(mapInstance);
            obsMarkers.push(marker);
        });

        plottedStats = layout.stats;
        plottedRecordCount = layout.stats.records;
        updateMarkerCount();
    }

    // The status bar reports records first, and what is actually on screen only
    // when it differs, so "Markers:" cannot look like it disagrees with itself.
    function updateMarkerCount() {
        var el = document.getElementById('map-status-count');
        if (!el) return;
        if (!plottedStats || plottedStats.drawn === plottedStats.records) {
            el.textContent = 'Markers: ' + plottedRecordCount;
            return;
        }
        el.textContent = 'Markers: ' + plottedStats.drawn + ' of ' + plottedRecordCount;
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

    // The inset that keeps a fitted area off the map edges. It is a fraction of the
    // map's smaller side rather than a fixed 80px, because the inset and the zoom
    // floor both decide whether an area can be framed at all: an 80px inset on a
    // 380px-tall map asks for zoom 14.8 to fit Campus, which MAP_MIN_ZOOM refuses, so
    // the fit would silently clamp and crop the area it was asked to show.
    function fitPadding() {
        var size = mapInstance.getSize();
        var inset = Math.round(Math.min(size.x, size.y) * 0.09);
        inset = Math.max(16, Math.min(80, inset));
        return [inset, inset];
    }

    function fitActiveArea() {
        if (!mapInstance) return;
        var padding = fitPadding();
        var poly = mapActiveArea === 'park' ? parkPolygon : (mapActiveArea === 'campus' ? campusPolygon : null);
        if (poly) {
            mapInstance.fitBounds(poly.getBounds(), { padding: padding });
        } else {
            // No area in scope: frame both zones so the difference is visible.
            var both = L.latLngBounds([]);
            if (parkPolygon) both.extend(parkPolygon.getBounds());
            if (campusPolygon) both.extend(campusPolygon.getBounds());
            if (both.isValid()) mapInstance.fitBounds(both, { padding: padding });
        }
        updateZoomDisplay();
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

        // The layer must never be tighter than the map. Leaflet stops drawing a
        // tile layer outside the layer's own zoom range, so the `minZoom: 16`
        // that used to sit here turned the map into a flat grey rectangle the
        // moment the view went below 16 - the empty tiles were painted over by
        // the container's `background`.
        tileLayer = L.tileLayer(tileUrl, {
            maxZoom: MAP_MAX_ZOOM,
            minZoom: MAP_MIN_ZOOM,
            attribution: attribution
        }).addTo(mapInstance);

        // If the requested tile server fails (offline / tile refusal), fall back
        // to OSM and surface a toast. The switch must never silently look broken.
        tileLayer.on('tileerror', function() {
            if (mapMode === 'map') return; // OSM itself failed, nothing to fall back to
            switchMapMode('map');
            showMapToast('Satellite unavailable — showing map');
        });
    }

    function initMap() {
        var mapEl = document.getElementById('map');
        if (!mapEl || mapInitialized) return;

        var savedState = loadMapState();

        mapInstance = L.map('map', {
            center: savedState ? savedState.center : [-12.805, 28.240],
            zoom: savedState ? savedState.zoom : 16,
            minZoom: MAP_MIN_ZOOM,
            maxZoom: MAP_MAX_ZOOM,
            zoomSnap: 0.1,
            zoomControl: false,
            attributionControl: true
        });

        var restoredMode = savedState ? savedState.mode : 'map';
        switchMapMode(restoredMode);
        var restoredModeToggle = document.getElementById('map-mode-toggle');
        if (restoredModeToggle) {
            restoredModeToggle.querySelectorAll('.map-btn').forEach(function(btn) {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === restoredMode);
            });
        }

        // The area in scope follows the filter, which is restored with the rest of
        // the view state, so the map never invents its own idea of focus.
        mapActiveArea = areaForSiteName(analyticsFilters.focusArea);
        renderPolygons(mapActiveArea);
        updateAreaControls();

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

        plotObservations();

        // Update zoom display + persist on move
        mapInstance.on('moveend', function() {
            updateZoomDisplay();
            saveMapState();
        });

        // Grouping is a screen distance, so a new zoom is a new layout: this is what
        // makes a group split as the user zooms in. Panning cannot change a pixel
        // distance between two records, so `moveend` deliberately does not re-plot.
        mapInstance.on('zoomend', function() {
            plotObservations();
        });

        // A resize changes the container's pixel geometry too (the nav rail
        // collapsing, the tab becoming visible), so the grouping has to be redone.
        mapInstance.on('resize', function() {
            plotObservations();
        });

        // Leaflet caches the container's size and only recalculates when told, and
        // nothing ever told it: `invalidateSize()` ran once, on tab activation. So
        // any later change to the container's box - a window resize, the nav rail
        // collapsing, a phone rotating, the browser zooming - left the map drawing
        // into its OLD viewport. Measured on the real page: growing the container
        // from 720x380 to 768x560 kept Leaflet at 8 tiles and left 480 of 1680
        // sampled points inside the map with no tile over them at all - a band down
        // the side of the map that simply showed the container background. It also
        // silently corrupted the grouping, which is computed from
        // `latLngToContainerPoint` and so depended on that stale size.
        //
        // A ResizeObserver catches every cause rather than just `window.resize`, and
        // `invalidateSize` fires the map's own `resize` event, which is already wired
        // to re-plot. Leaflet returns early when the size has not actually changed,
        // so re-checking is cheap.
        //
        // Re-checked for as long as the container keeps moving, and no longer: one
        // call can land while a CSS transition is still resizing the box, and the
        // observer is not promised another callback to correct it with - at
        // 1268x560 a single call left a 210-point band unpainted and nothing ever
        // came back to fix it. Remembering the size last applied means each re-check
        // costs one measurement, corrects a half-applied resize, and stops itself the
        // moment the container settles.
        //
        // A timer, deliberately, not requestAnimationFrame: rAF does not fire for a
        // page the browser is not rendering, so an animation-frame gate would swallow
        // the resize and every resize after it, leaving the map wrong for the rest of
        // the session - a worse version of the bug this exists to fix.
        var appliedSize = { w: -1, h: -1 };
        var resizeTimer = null;

        function onContainerResize() {
            var w = mapEl.clientWidth;
            var h = mapEl.clientHeight;
            // A zero-sized box (the tab is not being rendered) measures nothing
            // useful; wait for a real one rather than teaching the map it is 0x0.
            if (!w || !h) return;
            // Applied every time, with no "is it different" guard in front of it:
            // `_size` is also refreshed by anything else that happens to call
            // getSize(), and a guard reading it would then conclude there is nothing
            // to do while the map's tile grid is still drawn for the old box.
            // Leaflet's own early return covers the cost of a redundant call.
            mapInstance.invalidateSize({ pan: false });
            // Keep re-applying only while the container is still moving; the chain
            // ends by itself once it holds still.
            if (w !== appliedSize.w || h !== appliedSize.h) {
                appliedSize = { w: w, h: h };
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(onContainerResize, 200);
            }
        }

        if (typeof ResizeObserver === 'function') {
            mapSizer = new ResizeObserver(onContainerResize);
            mapSizer.observe(mapEl);
        } else {
            // No observer (older browser): a window listener still covers the common
            // case, which is better than the previous behaviour of covering none.
            window.addEventListener('resize', onContainerResize);
        }

        // Neither the observer nor a timer is guaranteed to have been delivered while
        // the page was in a background tab - a browser does not run rendering steps
        // for a tab it is not showing, and the observer rides on them. Coming back to
        // the page is therefore the moment the map has to re-measure itself, whatever
        // changed the container in the meantime, or the user returns to a map still
        // sized for a window they no longer have.
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) onContainerResize();
        });

        mapInitialized = true;

        updateZoomDisplay();
        updateMarkerCount();
        updateAreaStatus();
    }

    //  MAP UI CONTROLS

    var areaToggle = document.getElementById('map-area-toggle');
    if (areaToggle) {
        areaToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.map-btn');
            if (!btn || !btn.hasAttribute('data-area')) return;
            setFocusArea(focusAreaForArea(btn.getAttribute('data-area')), { fit: true });
        });
    }

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

            saveMapState();
        });
    }

    var fitBtn = document.getElementById('map-fit-btn');
    if (fitBtn) {
        fitBtn.addEventListener('click', function() {
            fitActiveArea();
            // fitBounds triggers moveend which persists; be explicit for safety
            saveMapState();
        });
    }

    // Clamped by the map's own limits, not by a second copy of them: the hardcoded
    // `Math.max(16, ...)` here is what made the zoom-out button do nothing on the
    // Campus view (16 was its floor while the campus needs 14.8 to be framed).
    function stepZoom(delta) {
        if (!mapInstance) return;
        var current = mapInstance.getZoom();
        var next = Math.round((current + delta) * 10) / 10;
        next = Math.max(mapInstance.getMinZoom(), Math.min(mapInstance.getMaxZoom(), next));
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

    document.querySelectorAll('.map-filter-label').forEach(function(label) {
        label.addEventListener('click', function() {
            var status = this.getAttribute('data-status');
            if (!status) return;

            statusFilterState[status] = !statusFilterState[status];
            this.classList.toggle('disabled', !statusFilterState[status]);

            if (mapInstance) plotObservations();

            saveMapState();
        });
    });

    var origActivateTab = null;
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

    window.flyToObservation = function(obsId) {
        var mapTab = document.querySelector('.analytics-tab[data-tab="map"]');
        if (mapTab) {
            mapTab.click();
        }

        if (!mapInitialized) {
            var checkInterval = setInterval(function() {
                if (mapInitialized && mapInstance) {
                    clearInterval(checkInterval);
                    doFly(obsId);
                }
            }, 100);
            setTimeout(function() { clearInterval(checkInterval); }, 5000);
        } else {
            // Let the tab panel become visible before flying.
            setTimeout(function() {
                doFly(obsId);
            }, 200);
        }
    };

    // The shared filter bar re-plots markers through this hook.
    window.refreshMapMarkers = function() {
        if (mapInstance) plotObservations();
    };

    function findObservation(obsId) {
        var allObs = typeof getAnalyticsFilteredData === 'function'
            ? getAnalyticsFilteredData()
            : (window.BioData ? window.BioData.getObservations() : null);
        if (!allObs) return null;
        for (var i = 0; i < allObs.length; i++) {
            if (allObs[i].observation_id === obsId) return allObs[i];
        }
        return null;
    }

    /**
     * Row -> map. A record that shares its coordinate with others is part of a
     * counted marker, so it has no marker of its own to open; at the separate zoom
     * its group still exists but lists it first, and the reveal pulses the marker
     * that stands for it. If the map is not close enough yet, the view goes to the
     * record's own coordinate at that zoom first and the reveal happens on the plot
     * that the resulting `zoomend` triggers.
     */
    function doFly(obsId) {
        if (!mapInstance || !obsId) return;

        var obs = findObservation(obsId);
        var loc = obs ? (obs.location || {}) : null;
        var hasPoint = loc && loc.latitude != null && loc.longitude != null;

        // Mark it before anything moves: the popup that opens afterwards lists the
        // group's records, and this is how the asked-for one is found in that list.
        focusedObsId = obsId;

        if (hasPoint && mapInstance.getZoom() < SEPARATE_ZOOM) {
            mapInstance.setView([loc.latitude, loc.longitude], SEPARATE_ZOOM);
            // zoomend re-plots; reveal once the new markers exist.
            setTimeout(function() { revealObservation(obsId); }, 450);
            saveMapState();
            return;
        }

        revealObservation(obsId);
    }

    function revealObservation(obsId) {
        if (!mapInstance) return;
        for (var i = 0; i < obsMarkers.length; i++) {
            var m = obsMarkers[i];
            // A group stands for several records, so the match is against the whole
            // set of ids the marker answers for.
            if (!m._obsIds || m._obsIds.indexOf(obsId) === -1) continue;

            var target = m.getLatLng();
            if (mapInstance.getZoom() < SEPARATE_ZOOM) {
                mapInstance.flyTo(target, SEPARATE_ZOOM, { duration: 1 });
            } else {
                mapInstance.panTo(target, { animate: true });
            }
            saveMapState();

            // Only a marker that IS this one record can be made to pulse as a dot;
            // inside a group the highlight belongs on the row in the popup's list
            // (buildPopupRow marks it), so the bubble pulses instead.
            var iconEl = m.getElement();
            var pulse = iconEl
                ? iconEl.querySelector(m._obsIds.length === 1 ? '.map-obs-marker' : '.map-cluster')
                : null;
            if (pulse) {
                pulse.classList.add('highlighted');
                setTimeout(function() { pulse.classList.remove('highlighted'); }, 3000);
            }
            // A group of distinct places deliberately has no popup - clicking it
            // drills in - so the call is guarded rather than assumed.
            if (m.getPopup && m.getPopup()) m.openPopup();
            return;
        }
    }

    document.addEventListener('dblclick', function(e) {
        var row = e.target.closest('.page-analytics .observation-row');
        if (!row) return;

        var codeEl = row.querySelector('.col-obs-id code');
        if (!codeEl) return;
        var obsId = codeEl.textContent.trim();
        if (obsId && window.flyToObservation) {
            window.flyToObservation(obsId);
        }
    });
})();

//  TOOLBAR UI
//  Proxies clicks to the hidden legacy controls. The focus button is the
//  exception: it cycles the same focus value the filter chip owns.

(function() {
    'use strict';

    var zoomInBtn = document.getElementById('toolbar-zoom-in');
    var zoomOutBtn = document.getElementById('toolbar-zoom-out');
    var focusBtn = document.getElementById('toolbar-focus-toggle');
    var fitBtn = document.getElementById('toolbar-fit');
    var modeBtn = document.getElementById('toolbar-mode-toggle');
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

    if (focusBtn) {
        focusBtn.addEventListener('click', function() {
            if (window.cycleMapFocus) window.cycleMapFocus();
        });
    }

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

//  REPORT TAB + GRAPHS TAB
//  Reuses getAnalyticsFilteredData() so reports and graphs honour the same
//  date/focus-area/status/species filters as the table. Pending and Flagged
//  records are excluded: the verified-data rule.

// Lazily-built chart instances (destroy & rebuild on re-render).
var reportTrendChartInstance = null;
var reportHabitatChartInstance = null;
var graphRichnessChartInstance = null;
var graphShannonChartInstance = null;
var graphTrendChartInstance = null;

// escapeHtmlObs is a global provided by the shared renderer.
function analyticsEscape(v) {
  return typeof escapeHtmlObs === 'function' ? escapeHtmlObs(String(v == null ? '' : v)) : String(v == null ? '' : v);
}
function analyticsShortDate(s) {
  if (!s) return '—';
  // One formatter for the whole app: repeating the format string here is how the
  // Report drifted from the tables it summarises. Fails soft if lib/date.js has
  // not loaded.
  if (!window.BioDate) return String(s);
  var formatted = window.BioDate.mediumDate(s);
  // mediumDate returns a dash for an unparseable value; showing the raw string
  // is more useful when diagnosing a bad record.
  return formatted === '\u2014' ? String(s) : formatted;
}

// species_id / site_id are optional on older records; BioAnalytics needs both to
// resolve entities consistently.
function enrichWithRegistryIds(obsList) {
  if (!window.BioData || !window.BioData.resolveSpeciesId) return obsList;
  return obsList.map(function(o) {
    var enriched = Object.assign({}, o);
    enriched.species_id = window.BioData.resolveSpeciesId(o) || null;
    enriched.site_id = window.BioData.resolveSiteId(o) || null;
    return enriched;
  });
}

// Default rolling window (months) for charts and the report when no From/To
// filter is set. Mirrors the dashboard's rolling "This Week" chart so the default
// view shows recent data instead of every year on record.
var DEFAULT_ROLLING_MONTHS = 36;

// An explicit From/To filter wins (filterObservations already applied it);
// otherwise clamp to the most recent DEFAULT_ROLLING_MONTHS, ending now.
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

function getReportData() {
  var data = applyAnalyticsDateWindow(getAnalyticsFilteredData());
  data = data.filter(function(o) { return o.verification_status === 'Approved'; });
  return enrichWithRegistryIds(data);
}

//  REPORT BUILDERS

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
  if (sorted.length >= 2) {
    var firstLabel = analyticsShortDate(sorted[0].toISOString());
    // One year covers both ends, so the first date drops it and the range stays
    // on a single line inside the compact KPI strip.
    if (sorted[0].getFullYear() === sorted[sorted.length - 1].getFullYear()) {
      firstLabel = firstLabel.replace(/, \d{4}$/, '');
    }
    rangeEl.textContent = firstLabel + ' \u2013 ' + analyticsShortDate(sorted[sorted.length - 1].toISOString());
  } else {
    rangeEl.textContent = sorted.length === 1 ? analyticsShortDate(sorted[0].toISOString()) : '\u2014';
  }

  shannonEl.textContent = window.BioAnalytics.shannonDiversityIndex(data).toFixed(3);
}

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

  // The title names what the Focus Area filter is showing. The scope label comes
  // from the registry (short_name), so it can never drift from the filter chip.
  var titleEl = document.getElementById('reportDiversityTitle');
  if (titleEl) {
    var focusArea = (analyticsFilters && analyticsFilters.focusArea) || '';
    var scope = (focusArea && window.BioData && window.BioData.getSiteLabel)
      ? window.BioData.getSiteLabel(focusArea, 'short')
      : '';
    titleEl.textContent = scope ? scope + ' Diversity' : 'Overall Diversity';
  }

  // Monthly series for the selected scope. The report deliberately does not split
  // the park into sub-locations: the individual spots are not recorded
  // consistently enough to compare, so only the scope-wide view is reported.
  var series = window.BioAnalytics.siteComparisonOverTime(data, null);
  if (series.length === 0) {
    container.innerHTML = '<p class="report-empty">No verified observations in the current filters.</p>';
    return;
  }

  // Newest first, so the card reads as a history. The top row is the latest
  // month and carries the month-over-month delta.
  var rows = series.slice().reverse();
  var latest = rows[0];
  var prior = rows.length > 1 ? rows[1] : null;
  var delta = 0;
  var deltaClass = 'flat';
  var deltaGlyph = '\u25cf';
  var deltaText = '0.000';
  if (prior) {
    delta = latest.shannonIndex - prior.shannonIndex;
    if (delta > 0.001) { deltaClass = 'up'; deltaGlyph = '\u25b2'; deltaText = '+' + (+delta.toFixed(3)); }
    else if (delta < -0.001) { deltaClass = 'down'; deltaGlyph = '\u25bc'; deltaText = '' + (+delta.toFixed(3)); }
  }

  var html = '<div class="report-site-row">' +
    '<div class="report-site-caption">Shannon diversity H&prime; by month (latest highlighted)</div>' +
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
  html += '</div></div>';
  container.innerHTML = html;
}

function buildReportWarnings(data) {
  var container = document.getElementById('reportWarningsContainer');
  if (!container) return;
  var registry = (window.BioData && window.BioData.getSpeciesRegistry) ? window.BioData.getSpeciesRegistry() : [];
  var fauna = registry.filter(function(sp) { return sp.taxon_type === 'fauna'; });
  var rows = fauna.map(function(sp) {
    var baseline = sp.baseline_count == null ? 'Not set' : String(sp.baseline_count);
    return '<li><strong>' + analyticsEscape(sp.common_name || sp.scientific_name) + '</strong>: baseline ' + analyticsEscape(baseline) + '</li>';
  }).join('');
  container.innerHTML = '<p class="report-empty">Sightings are not a census.</p>' +
    '<p class="report-meta">A sighting proves an animal was present, not how many there are. The same herd recorded on five days is still one herd, so a park-wide total needs an approved, recent survey covering the whole park: an area searched with nothing found counts as zero, and an area left unsearched stays unknown.</p>' +
    '<p class="report-meta">Use <a href="../state/state.html">Ecological State</a> for the park population and for non-persistent coupled what-if scenarios.</p>' +
    (rows ? '<p class="report-meta">Configured fauna baselines:</p><ul class="report-meta">' + rows + '</ul>' : '');
}

function buildReportHabitats(data) {
  var container = document.getElementById('reportHabitatContainer');
  if (!container) return;

  // Destroy any previous chart so re-renders (filter changes) don't leak.
  if (reportHabitatChartInstance) { reportHabitatChartInstance.destroy(); reportHabitatChartInstance = null; }

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

  var habitats = Object.keys(map).sort();
  if (habitats.length === 0) {
    container.innerHTML = '<p class="report-empty">No species by habitat for the current filters.</p>';
    return;
  }

  var rows = [];
  var totalIndividuals = 0;
  habitats.forEach(function(h) {
    Object.keys(map[h]).forEach(function(sci) {
      var item = map[h][sci];
      totalIndividuals += item.count;
      rows.push({ common: item.common, scientific: item.scientific, count: item.count, habitat: h });
    });
  });
  rows.sort(function(a, b) { return b.count - a.count; });

  var TOP = 12;
  var top = rows.slice(0, TOP);
  var otherRows = rows.slice(TOP);
  var otherCount = otherRows.reduce(function(s, r) { return s + r.count; }, 0);

  var HABITAT_COLORS = { 'Miombo Woodland': '#2E7D32', 'Urban': '#1565C0' };
  var OTHER_COLOR = '#90A4AE';
  function colorFor(h) { return HABITAT_COLORS[h] || OTHER_COLOR; }

  var labels = top.map(function(r) { return r.common; });
  var values = top.map(function(r) { return r.count; });
  var colors = top.map(function(r) { return colorFor(r.habitat); });
  if (otherCount > 0) {
    labels.push('Other species (' + otherRows.length + ')');
    values.push(otherCount);
    colors.push(OTHER_COLOR);
  }

  var wrapHeight = Math.max(120, labels.length * 36 + 30);

  var html = '';
  html += '<p class="report-habitat-summary">' + rows.length + ' species across ' + habitats.length +
    ' habitat' + (habitats.length === 1 ? '' : 's') + ' · ' + totalIndividuals +
    ' individuals. Showing the top ' + top.length +
    (otherRows.length ? '; the remaining ' + otherRows.length + ' species are combined as "Other".' : '.') + '</p>';

  var legendHtml = habitats.map(function(h) {
    return '<span class="report-habitat-legend-item"><i class="report-habitat-dot" style="background:' + colorFor(h) + '"></i>' + analyticsEscape(h) + '</span>';
  }).join('');
  if (otherCount > 0) {
    legendHtml += '<span class="report-habitat-legend-item"><i class="report-habitat-dot" style="background:' + OTHER_COLOR + '"></i>Other species</span>';
  }
  html += '<div class="report-habitat-legend">' + legendHtml + '</div>';
  html += '<div class="report-habitat-chart-wrap" style="height:' + wrapHeight + 'px"><canvas id="reportHabitatChart"></canvas></div>';

  container.innerHTML = html;

  if (typeof Chart === 'undefined') return;
  var canvas = document.getElementById('reportHabitatChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  // Draw the count at the end of each bar so the chart is readable without
  // hovering (Chart.js core doesn't render data labels natively).
  var valueLabelPlugin = {
    id: 'habitatValueLabels',
    afterDatasetsDraw: function(chart) {
      var c = chart.ctx;
      c.save();
      c.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      c.fillStyle = '#334155';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      chart.data.datasets.forEach(function(dataset, di) {
        var meta = chart.getDatasetMeta(di);
        meta.data.forEach(function(el, i) {
          var val = dataset.data[i];
          if (val == null) return;
          c.fillText(String(val), el.x + 8, el.y);
        });
      });
      c.restore();
    }
  };

  reportHabitatChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Recorded individuals',
        data: values,
        backgroundColor: colors,
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 6,
        barPercentage: 0.6,
        categoryPercentage: 0.85
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          padding: 10,
          titleFont: { size: 12, weight: '600' },
          bodyFont: { size: 12 },
          callbacks: {
            label: function(context) {
              var n = context.parsed.x;
              var base = n + ' individual' + (n === 1 ? '' : 's');
              var r = top[context.dataIndex];
              if (r) return base + ' — ' + r.habitat + (r.scientific ? ' · ' + r.scientific : '');
              return base + ' — combined total for the remaining species';
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grace: '15%', // headroom for the bar-end value labels
          grid: { color: '#eef2f6' },
          ticks: { precision: 0, color: '#64748b', font: { size: 11 } }
        },
        y: {
          grid: { display: false },
          ticks: { color: '#334155', font: { size: 12, weight: '500' } }
        }
      }
    },
    plugins: [valueLabelPlugin]
  });
}

/**
 * Push a "Trend line" dataset onto an array of datasets, in place.
 * Shared by the Report and Graphs trend charts.
 */
function pushTrendLineDataset(datasets, trend) {
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
}

// When the newest record is older than the staleness window, the trend covers
// earlier survey periods only and must not be read as a current decline.
function trendRecencyNote(data) {
  var staleDays = (window.BioAnalytics && window.BioAnalytics.thresholds && window.BioAnalytics.thresholds.STALE_DAYS) || 30;
  var maxTs = 0;
  (data || []).forEach(function(o) {
    var ts = o && o.timestamp ? new Date(o.timestamp).getTime() : 0;
    if (ts > maxTs) maxTs = ts;
  });
  if (!maxTs) return '';
  var days = (Date.now() - maxTs) / 86400000;
  if (days > staleDays) {
    return ' Note: the most recent record is ' + Math.round(days) + ' days old — the trend reflects earlier survey periods only and should not be read as a current decline.';
  }
  return '';
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

  var recencyNote = trendRecencyNote(data);
  if (trend.direction === 'insufficient_data' || vals.length < 2) {
    if (noteEl) noteEl.textContent = (trend.note || 'Insufficient data for a trend — need multiple survey periods.') + recencyNote;
  } else {
    if (noteEl) noteEl.textContent = trend.slope.toFixed(3) + ' / period · ' + trend.direction + ' (trend line, not a forecast)' + recencyNote;
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
  pushTrendLineDataset(datasets, trend);

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

//  ECOSYSTEM INSIGHTS & MANAGEMENT (report card)
/**
 * Inputs shared by the two ecosystem report surfaces (Report tab + PDF).
 * Gathered once, so the two cannot drift apart.
 */
function ecosystemReportContext(data) {
  var BioData = window.BioData;
  var registry = (BioData && BioData.getSpeciesRegistry) ? BioData.getSpeciesRegistry() : [];
  var sites = (BioData && BioData.getSiteRegistry) ? BioData.getSiteRegistry() : [];
  var ecology = (BioData && BioData.getSpeciesEcology) ? BioData.getSpeciesEcology() : {};
  var insights = window.BioAnalytics.ecosystemInsights(data, { speciesRegistry: registry, sites: sites, ecology: ecology });

  // Overview counts: species with live data vs permanent woodland trees.
  var presentCount = 0;
  var treeCount = 0;
  insights.species.forEach(function(r) {
    if (r.present) presentCount++;
    if (r.flora && !r.present) treeCount++;
  });

  return {
    insights: insights,
    summary: insights.summary,
    presentCount: presentCount,
    treeCount: treeCount
  };
}

function buildReportEcosystem(data) {
  var container = document.getElementById('reportEcosystemContainer');
  if (!container) return;

  var ctx = ecosystemReportContext(data);
  var insights = ctx.insights;
  var s = ctx.summary;
  var html = '';

  if (s.observations === 0) {
    html = '<p class="report-empty">No verified observations matched the current filters, so ecological insights could not be generated.</p>';
    container.innerHTML = html;
    return;
  }

  // The table covers the monitored mammals (fauna); the permanent woodland
  // trees are habitat context, not something the survey counts per season.
  var fauna = insights.species.filter(function(r) { return !r.flora; });

  html += '<p class="report-eco-overview">This section covers the park\u2019s monitored mammals: the ecological ' +
    'role each one plays, what changes in the vegetation and for other wildlife as its numbers rise or fall, ' +
    'and the management actions the current data supports.</p>';

  // The impact text follows the species' actual state: up / down / healthy / assumed.
  if (fauna.length) {
    html += '<h4 class="report-eco-section-title">Species roles &amp; environmental impact</h4>';
    html += '<div class="report-eco-table-wrap"><table class="report-eco-table"><thead><tr>' +
      '<th>Species</th><th>Ecological role</th><th>Environmental impact</th>' +
      '</tr></thead><tbody>';
    fauna.forEach(function(r) {
      var chip = '';
      var impactText = '';
      if (r.condition === 'up') {
        chip = '<span class="report-eco-condition up">Sightings trending up \u2191</span>';
        impactText = r.up;
      } else if (r.condition === 'down') {
        chip = '<span class="report-eco-condition down">Sightings trending down \u2193</span>';
        impactText = r.down;
      } else if (r.condition === 'assumed') {
        chip = '<span class="report-eco-condition assumed">Assumed present</span>';
        impactText = r.impact;
      } else if (r.condition === 'nodata') {
        chip = '<span class="report-eco-condition nodata">Awaiting observations</span>';
        impactText = r.impact;
      } else if (r.condition === 'stale') {
        chip = '<span class="report-eco-condition stale">No recent records</span>';
        impactText = r.impact;
      } else {
        chip = '<span class="report-eco-condition healthy">Healthy</span>';
        impactText = r.impact;
      }
      html += '<tr><td data-label="Species"><strong>' + analyticsEscape(r.common) + '</strong><div class="report-eco-sci">' + analyticsEscape(r.scientific) + '</div></td>' +
        '<td data-label="Ecological role">' + analyticsEscape(r.role) + '</td>' +
        '<td data-label="Environmental impact">' + chip + '<span class="report-eco-impact-text">' + analyticsEscape(impactText) + '</span></td></tr>';
    });
    html += '</tbody></table></div>';
  }

  html += '<h4 class="report-eco-section-title">Management recommendations</h4>';
  html += '<ul class="report-eco-recs">';
  insights.recommendations.forEach(function(r) {
    html += '<li>' + analyticsEscape(r.action) + '</li>';
  });
  html += '</ul>';

  container.innerHTML = html;
}

//  CSV EXPORT

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
  // The app's one downloader (lib/csv.js, loaded before this file). No local
  // fallback: a second copy of the blob/anchor dance is what drifts, and a
  // missing lib/csv.js is a load-order bug worth seeing rather than masking.
  window.BioCsv.downloadCsv(csv, filename);
}

//  PDF EXPORT
//  A hand-built jsPDF report (CDN) from the filtered, verified observations.

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
  return [['Population status', 'Ecological State', 'Requires approved recent census coverage; individual sightings are not population estimates.', 'See Ecological State']];
}

function buildReportEcosystemPdf(data) {
  var ctx = ecosystemReportContext(data);
  var insights = ctx.insights;
  var s = ctx.summary;
  var paragraph = 'This section explains the ecological role and environmental impact of each monitored park species, what happens when a population rises or falls, and management recommendations. It covers ' +
    s.parkSpeciesCount + ' monitored park species \u2014 ' + ctx.presentCount + ' with live observation data and ' +
    ctx.treeCount + ' permanent woodland trees assumed present \u2014 across ' + s.observations +
    ' verified observations (Shannon H\u2032 = ' + s.shannonIndex.toFixed(3) + ').';

  var conditionLabel = {
    up: 'Population up',
    down: 'Population down',
    healthy: 'Healthy',
    assumed: 'Assumed present',
    nodata: 'Awaiting observations',
    stale: 'No recent records'
  };
  var rows = insights.species.map(function(r) {
    var status;
    if (r.condition === 'assumed') {
      status = 'Assumed present';
    } else if (r.condition === 'nodata') {
      status = 'No records yet';
    } else if (r.condition === 'stale') {
      status = 'No recent records';
    } else if (r.severity === 'warning' || r.severity === 'critical') {
      status = 'Below baseline';
    } else {
      status = 'At baseline';
    }
    return [r.common, r.role, status];
  });
  var impactLines = insights.species.map(function(r) {
    var label = conditionLabel[r.condition] || 'Healthy';
    var text = r.condition === 'up' ? r.up : (r.condition === 'down' ? r.down : r.impact);
    return r.common + ' (' + label + '): ' + text;
  });

  return {
    paragraph: paragraph,
    rows: rows,
    impactLines: impactLines,
    recommendations: insights.recommendations
  };
}

function exportReportPdf() {
  var PDFLib = window.jspdf;
  if (!PDFLib || !PDFLib.jsPDF) {
    // Toast, not alert(): a blocking dialog for a retryable failure stops the page.
    if (typeof showToast === 'function') {
      showToast('The PDF library did not load. Check your connection and reload.', 'error');
    } else {
      console.warn('PDF library failed to load.');
    }
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

  doc.setFillColor(46, 125, 50);
  doc.rect(0, 0, pageW, 10, 'F');

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

  var filtersDesc = [];
  var f = analyticsFilters || {};
  if (f.dateFrom || f.dateTo) filtersDesc.push((f.dateFrom || '\u2026') + ' to ' + (f.dateTo || '\u2026'));
  if (f.focusArea) filtersDesc.push(f.focusArea);
  if (f.status) filtersDesc.push(f.status);
  if (f.species) filtersDesc.push(f.species);
  doc.text('Filters: ' + (filtersDesc.length ? filtersDesc.join(' \u00b7 ') : 'All data'), marginX, y);
  y += 26;

  y = pdfSectionTitle(doc, 'Executive Summary', y);
  y = pdfWrapped(doc, buildReportExecutiveSummary(data), marginX, y, maxW, 15, { size: 11, color: [44, 62, 80] }) + 8;

  y = pdfSectionTitle(doc, 'Key Indicators', y);
  y = pdfTable(doc, ['Species', 'Observations', 'Date Range', 'Shannon H\u2032'],
    [[window.BioAnalytics.speciesRichness(data), data.length, reportDateRange(data), window.BioAnalytics.shannonDiversityIndex(data).toFixed(3)]],
    y, [110, 130, 220, 100]) + 10;

  // Prose explanation so the metric stays legible to non-experts.
  var shannonVal = window.BioAnalytics.shannonDiversityIndex(data);
  y = pdfWrapped(doc,
    'Understanding Shannon H\u2032: the Shannon Diversity Index combines species richness (how many species) with evenness (how evenly individuals are spread across species). A value of 0 means a single species dominates completely; higher values (typically up to 3\u20134) indicate a more diverse, balanced community. With ' +
    window.BioAnalytics.speciesRichness(data) + ' species recorded, the current value of ' + shannonVal.toFixed(3) +
    (shannonVal === 0 ? ' shows a single-species or heavily dominated community.' : ' reflects the overall balance of this community.'),
    marginX, y, maxW, 13, { size: 9.5, style: 'italic', color: [127, 140, 141] }) + 10;

  var siteRows = buildReportPdfSiteRows(data);
  if (siteRows.length) {
    y = pdfSectionTitle(doc, 'Diversity by Site', y);
    y = pdfTable(doc, ['Site', 'Richness', 'Observations', 'Shannon H\u2032', 'Month'],
      siteRows, y, [160, 80, 110, 110, 100]) + 10;
  }

  var habitatRows = buildReportPdfHabitatRows(data);
  if (habitatRows.length) {
    y = pdfSectionTitle(doc, 'Species by Habitat', y);
    y = pdfTable(doc, ['Habitat', 'Species (count)'], habitatRows, y, [130, 330]) + 10;
  }

  var trend = window.BioAnalytics.populationTrend(data, null, null);
  y = pdfSectionTitle(doc, 'Population Trend', y);
  var trendRecency = trendRecencyNote(data);
  var trendText = (trend.direction === 'insufficient_data' || !trend.dataPoints || trend.dataPoints.length < 2)
    ? (trend.note || 'Insufficient data for a reliable trend; multiple survey periods are required.') + ' The chart below shows the observed counts recorded so far.' + trendRecency
    : 'Across the recorded periods the population is ' + trend.direction + ' at ' + Math.abs(trend.slope).toFixed(1) + ' individuals per survey period (' + (trend.note || 'linear fit on observed buckets') + ').' + trendRecency;
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
    } catch (e) { /* chart image unavailable, skip */ }
  }

  var warnRows = buildReportPdfWarningRows(data);
  y = pdfSectionTitle(doc, 'Low Population Warnings', y);
  if (!warnRows.length) {
    y = pdfWrapped(doc, 'No species are currently below their population baseline. Current estimates are within expected ranges.', marginX, y, maxW, 15, { size: 11 }) + 6;
  } else {
    y = pdfTable(doc, ['Species', 'Site', 'Estimate vs baseline', 'Severity'], warnRows, y, [140, 130, 150, 90]) + 10;
  }

  var eco = buildReportEcosystemPdf(data);
  y = pdfSectionTitle(doc, 'Ecological Insights & Management', y);
  y = pdfWrapped(doc, eco.paragraph, marginX, y, maxW, 15, { size: 11 }) + 6;
  if (eco.rows.length) {
    y = pdfTable(doc, ['Species', 'Ecological role', 'Population status'], eco.rows, y, [140, 240, 120]) + 6;
  }
  if (eco.impactLines.length) {
    y = pdfWrapped(doc, 'Environmental impact & population response: ' + eco.impactLines.join(' '), marginX, y, maxW, 15, { size: 11 }) + 6;
  }
  if (eco.recommendations.length) {
    var recText = 'Recommendations: ' + eco.recommendations.map(function(r) { return r.action; }).join(' ');
    y = pdfWrapped(doc, recText, marginX, y, maxW, 15, { size: 11 }) + 6;
  }

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

//  GRAPHS TAB

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

  // No per-species select here: the shared filter bar already scopes this trend.
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
  pushTrendLineDataset(tDatasets, trend);
  graphTrendChartInstance = makeLineChart(trendCanvas, tDatasets, 'Count', { labels: tLabels, integerY: true, tooltipUnit: 'individuals' });

  // The trend line needs at least two survey buckets.
  var trendNoteEl = document.getElementById('graphTrendNote');
  if (trendNoteEl) {
    var gRecencyNote = trendRecencyNote(data);
    trendNoteEl.textContent = (trend.direction === 'insufficient_data' || !trend.fitted || trend.fitted.length < 2)
      ? (trend.note || 'Insufficient data for a trend — need multiple survey periods.') + gRecencyNote
      : (trend.slope.toFixed(3) + ' / period · ' + trend.direction + ' (trend line, not a forecast)') + gRecencyNote;
  }
}

function getGraphData() {
    var d = typeof getAnalyticsFilteredData === 'function'
        ? getAnalyticsFilteredData()
        : (window.BioData ? window.BioData.getObservations() : []);
  // Same window rule as the report: an explicit From/To wins, else the recent
  // rolling window.
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
    buildReportEcosystem(data);
  }

  // Populate on first mount, or retry while empty: the registry script may not
  // have hydrated yet.
  if (!speciesSelect || speciesSelect.options.length <= 1) populateReportSpecies();

  // Re-render on every activation, but attach listeners only once: stacked
  // handlers would fire twice.
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

// Restoring a saved tab goes through .click(), so these listeners fire for
// Report/Graphs on load too.
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
