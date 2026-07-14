/**
 * BioMonitor — Analytics Page
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
    province: '',
    status: '',
    species: ''
};

// Column visibility toggles — stored here rather than in the DOM so they
// survive table re-renders (which would otherwise reset checkbox states).
var analyticsVisibleColumns = {
    coords: false,
    'protected-area': false,
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
    if (analyticsFilters.province) count++;
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
            label: 'Protected Area',
            toggleKey: 'protected-area',
            render: function(obs) {
                var loc = obs.location || {};
                return escapeHtmlObs(loc.protected_area || '—');
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
//  Populate Filter Dropdowns — fills province and species selects
//  from BioData reference data so they stay in sync with the rest
//  of the application.
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

        var allObs = window.BioData.getObservations();
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

        tileLayer = L.tileLayer(tileUrl, {
            maxZoom: 18,
            minZoom: 16,
            attribution: attribution
        }).addTo(mapInstance);

        mapMode = mode;
    }

    function initMap() {
        var mapEl = document.getElementById('map');
        if (!mapEl || mapInitialized) return;

        mapInstance = L.map('map', {
            center: [-12.805, 28.240],
            zoom: 16,
            minZoom: 16,
            maxZoom: 18,
            zoomSnap: 0.1,
            zoomControl: false,
            attributionControl: true
        });

        // Default tile layer (OSM)
        switchMapMode('map');

        // Render polygons
        renderPolygons('park');

        // Plot observations
        plotObservations();

        // Update zoom display on move
        mapInstance.on('moveend', function() {
            updateZoomDisplay();
        });

        mapInitialized = true;

        // Initial status bar update
        updateZoomDisplay();
        updateMarkerCount();
        var areaLabel = document.getElementById('map-status-area');
        if (areaLabel) areaLabel.textContent = 'CBU Nature Park';
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
        });
    }

    // Fit area button
    var fitBtn = document.getElementById('map-fit-btn');
    if (fitBtn) {
        fitBtn.addEventListener('click', fitActiveArea);
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

    function doFly(obsId) {
        if (!mapInstance || !obsId) return;
        // Find marker
        for (var i = 0; i < obsMarkers.length; i++) {
            var m = obsMarkers[i];
            if (m._obsId === obsId) {
                mapInstance.flyTo(m.getLatLng(), 17, { duration: 1 });
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
