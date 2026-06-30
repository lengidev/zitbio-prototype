/**
 * BioMonitor - Observations Page Logic
 * Reads from unified BioData layer via shared observationsRenderer.
 * Handles table rendering, pagination, search, and modal interactions.
 */

// State
var obsCurrentPage = 1;
var obsFilteredData = [];
var obsRecordsPerPage = 8;
var currentObsId = null; // Tracks the currently viewed observation ID

// Get filtered data from unified data layer using shared search
function getObsFilteredData() {
    if (!window.BioData) return [];
    var searchInput = document.getElementById('searchInput');
    if (!searchInput) return window.BioData.getObservations().slice();
    var selectedField = document.querySelector('input[name="obsSearchField"]:checked');
    var field = selectedField ? selectedField.value : '';
    return window.BioData.searchObservations(searchInput.value, field || undefined);
}

// Render the table using shared renderer
function renderObsTable() {
    if (!window.BioData) return;

    obsFilteredData = getObsFilteredData();
    var totalPages = Math.ceil(obsFilteredData.length / obsRecordsPerPage);

    if (obsCurrentPage > totalPages) obsCurrentPage = totalPages || 1;

    var result = renderObservationsTable({
        viewMode: 'admin',
        data: obsFilteredData,
        page: obsCurrentPage,
        perPage: obsRecordsPerPage,
        tableSelector: '.page-observations .data-table'
    });

    // Update prev/next buttons
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.disabled = (obsCurrentPage <= 1);
    if (nextBtn) nextBtn.disabled = (obsCurrentPage >= result.totalPages);

    // Observations page uses .page-item with centered layout — render separately
    renderObsPagination(result.totalPages);

    // Attach event listeners to View buttons (using data-id now)
    var viewButtons = document.querySelectorAll('.page-observations .btnViewRecord');
    viewButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = this.getAttribute('data-id');
            viewRecordById(id);
        });
    });
}

// Render pagination with .page-item style (Observations page layout)
function renderObsPagination(totalPages) {
    var container = document.getElementById('paginationContainer');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    var html = '';
    for (var i = 1; i <= totalPages; i++) {
        var activeClass = i === obsCurrentPage ? ' active' : '';
        html += '<div class="page-item' + activeClass + '" data-page="' + i + '">' + i + '</div>';
    }
    container.innerHTML = html;

    // Attach click handlers
    var pageItems = container.querySelectorAll('.page-item');
    pageItems.forEach(function(item) {
        item.addEventListener('click', function() {
            var page = parseInt(item.getAttribute('data-page'), 10);
            if (!isNaN(page) && page !== obsCurrentPage) {
                obsCurrentPage = page;
                renderObsTable();
            }
        });
    });
}

// Handle search input
function handleObsSearch() {
    obsCurrentPage = 1;
    renderObsTable();
}

// Format date from YYYY-MM-DD to readable format
function formatDateStr(dateStr) {
    if (!dateStr) return '—';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var year = parts[0];
    var monthNum = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1] + ' ' + day + ', ' + year;
}

// Format time from timestamp
function formatTimeStr(timestamp) {
    if (!timestamp) return '—';
    var parts = timestamp.split('T');
    if (parts.length < 2) return '—';
    var timePart = parts[1].split('+')[0].split('Z')[0];
    var timeParts = timePart.split(':');
    if (timeParts.length < 2) return '—';
    return timeParts[0] + ':' + timeParts[1];
}

// Format coordinates
function formatCoords(lat, lng) {
    if (lat == null || lng == null) return '—';
    var latDir = lat >= 0 ? '°N' : '°S';
    var lngDir = lng >= 0 ? '°E' : '°W';
    return Math.abs(lat).toFixed(4) + latDir + ', ' + Math.abs(lng).toFixed(4) + lngDir;
}

// Set badge class based on status
function setBadge(status) {
    var badge = document.getElementById('modalStatusBadge');
    if (!badge) return;
    badge.className = 'badge';
    if (status === 'Approved') {
        badge.classList.add('badge-approved');
        badge.textContent = 'Approved';
    } else if (status === 'Pending') {
        badge.classList.add('badge-pending');
        badge.textContent = 'Pending';
    } else if (status === 'Flagged') {
        badge.classList.add('badge-flagged');
        badge.textContent = 'Flagged';
    } else {
        badge.classList.add('badge-pending');
        badge.textContent = status || 'Pending';
    }
}

// View record details by ID (v2 schema)
function viewRecordById(id) {
    if (!window.BioData) return;
    var obs = window.BioData.getObservationById(id);
    if (!obs) return;

    currentObsId = id;
    var speciesDet = obs.species_details || {};
    var loc = obs.location || {};

    // Title & subtitle
    var speciesTitle = speciesDet.common_name || speciesDet.scientific_name || 'Unknown';
    document.getElementById('modalSpeciesTitle').textContent = speciesTitle;
    document.getElementById('modalSubtitle').textContent = speciesDet.scientific_name || '—';

    // Badge
    setBadge(obs.verification_status || 'Pending');

    // Observation fields
    document.getElementById('fldPopulation').textContent = obs.count || 0;
    document.getElementById('fldActivity').textContent = obs.activity || 'Not recorded';
    
    var dateStr = obs.timestamp ? obs.timestamp.split('T')[0] : '';
    document.getElementById('fldDate').textContent = formatDateStr(dateStr);
    document.getElementById('fldTime').textContent = formatTimeStr(obs.timestamp);

    // Location fields
    document.getElementById('fldCountry').textContent = loc.country || '—';
    document.getElementById('fldProvince').textContent = loc.administrative_area || '—';
    document.getElementById('fldCity').textContent = loc.city || '—';
    document.getElementById('fldHabitat').textContent = loc.habitat_type || '—';
    document.getElementById('fldProtectedArea').textContent = loc.protected_area || 'None';
    document.getElementById('fldGps').textContent = formatCoords(loc.latitude, loc.longitude);

    // Record Details (collapsible)
    document.getElementById('fldLocality').textContent = loc.locality_description || 'Not recorded';
    document.getElementById('fldFieldNotes').textContent = obs.field_notes || 'Not recorded';
    document.getElementById('fldRecordedBy').textContent = obs.recorded_by || '—';
    document.getElementById('fldInstitution').textContent = obs.institution_name || '—';
    
    // Format observation ID nicely
    var displayId = obs.observation_id ? obs.observation_id.replace('obs_', 'OBS-') : '—';
    document.getElementById('fldRecordId').textContent = displayId;
    document.getElementById('fldRecordStatus').textContent = 'Active';

    // Cancel any active edit mode
    cancelEdit();

    // Store current observation ID for actions
    document.getElementById('viewModal').setAttribute('data-obs-id', obs.observation_id);
    document.getElementById('viewModal').classList.add('active');
}

// Close view modal
function closeViewModal() {
    cancelEdit();
    document.getElementById('viewModal').classList.remove('active');
    currentObsId = null;
}

// Toggle collapsible section
function toggleSection(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

// ───── APPROVE / FLAG ACTIONS ─────

function handleApprove() {
    if (!window.BioData || !currentObsId) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    if (!obsId) return;
    window.BioData.updateObservation(obsId, { verification_status: 'Approved' });
    setBadge('Approved');
    renderObsTable();
}

function handleFlag() {
    if (!window.BioData || !currentObsId) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    if (!obsId) return;
    window.BioData.updateObservation(obsId, { verification_status: 'Flagged' });
    setBadge('Flagged');
    renderObsTable();
}

// ───── EDIT MODE ─────

var isEditing = false;

function enableEditMode() {
    if (isEditing) return;
    isEditing = true;

    // Replace Edit button with Save + Cancel
    var editBtn = document.getElementById('btnEditRecord');
    editBtn.innerHTML = '<span class="material-symbols-outlined">check</span>';
    editBtn.className = 'icon-btn icon-btn-save';
    editBtn.setAttribute('data-tip', 'Save Changes');
    editBtn.removeEventListener('click', enableEditMode);
    editBtn.addEventListener('click', saveChanges);

    // Add Cancel button next to Save
    var actionsDiv = document.querySelector('.page-observations .header-actions');
    if (actionsDiv) {
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'icon-btn icon-btn-cancel';
        cancelBtn.id = 'btnCancelEdit';
        cancelBtn.setAttribute('data-tip', 'Cancel');
        cancelBtn.setAttribute('aria-label', 'Cancel Edit');
        cancelBtn.innerHTML = '<span class="material-symbols-outlined">close</span>';
        cancelBtn.addEventListener('click', cancelEdit);
        // Insert after the edit/save button (before approve)
        var approveBtn = document.getElementById('btnApproveRecord');
        if (approveBtn) {
            actionsDiv.insertBefore(cancelBtn, approveBtn);
        } else {
            actionsDiv.appendChild(cancelBtn);
        }
    }

    // Disable approve/flag during edit
    var approveBtn = document.getElementById('btnApproveRecord');
    var flagBtn = document.getElementById('btnFlagRecord');
    if (approveBtn) { approveBtn.disabled = true; approveBtn.style.opacity = '0.4'; approveBtn.style.pointerEvents = 'none'; }
    if (flagBtn) { flagBtn.disabled = true; flagBtn.style.opacity = '0.4'; flagBtn.style.pointerEvents = 'none'; }

    // Make fields editable
    makeFieldsEditable(true);
}

function cancelEdit() {
    if (!isEditing) return;
    isEditing = false;

    // Restore Edit button
    var editBtn = document.getElementById('btnEditRecord');
    editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
    editBtn.className = 'icon-btn icon-btn-edit';
    editBtn.setAttribute('data-tip', 'Edit Record');
    editBtn.removeEventListener('click', saveChanges);
    editBtn.addEventListener('click', enableEditMode);

    // Remove Cancel button
    var cancelBtn = document.getElementById('btnCancelEdit');
    if (cancelBtn) cancelBtn.remove();

    // Re-enable approve/flag
    var approveBtn = document.getElementById('btnApproveRecord');
    var flagBtn = document.getElementById('btnFlagRecord');
    if (approveBtn) { approveBtn.disabled = false; approveBtn.style.opacity = ''; approveBtn.style.pointerEvents = ''; }
    if (flagBtn) { flagBtn.disabled = false; flagBtn.style.opacity = ''; flagBtn.style.pointerEvents = ''; }

    // Remove edit inputs
    makeFieldsEditable(false);
}

function makeFieldsEditable(enable) {
    var obs = currentObsId ? window.BioData.getObservationById(document.getElementById('viewModal').getAttribute('data-obs-id')) : null;
    if (!obs) return;
    var loc = obs.location || {};

    // Editable field IDs and their current values
    var editableFields = [
        { id: 'fldPopulation', type: 'number', value: obs.count },
        { id: 'fldActivity', type: 'select', value: obs.activity || '', options: ['', 'Feeding', 'Resting', 'Moving', 'Breeding', 'Foraging', 'Vocalizing', 'Other'] },
        { id: 'fldDate', type: 'date', value: obs.timestamp ? obs.timestamp.split('T')[0] : '' },
        { id: 'fldTime', type: 'time', value: obs.timestamp ? formatTimeInput(obs.timestamp) : '' },
        { id: 'fldCountry', type: 'text', value: loc.country || '' },
        { id: 'fldProvince', type: 'select', value: loc.administrative_area || '', options: getProvinceOptions() },
        { id: 'fldCity', type: 'text', value: loc.city || '' },
        { id: 'fldHabitat', type: 'select', value: loc.habitat_type || '', options: ['', 'Woodland', 'Grassland', 'Wetland', 'Savanna', 'Forest', 'Riverine Forest', 'Urban', 'Agricultural', 'Thicket'] },
        { id: 'fldProtectedArea', type: 'text', value: loc.protected_area || '' },
        { id: 'fldGps', type: 'text', value: formatCoords(loc.latitude, loc.longitude) },
        { id: 'fldLocality', type: 'textarea', value: loc.locality_description || '' },
        { id: 'fldFieldNotes', type: 'textarea', value: obs.field_notes || '' }
    ];

    editableFields.forEach(function(field) {
        var el = document.getElementById(field.id);
        if (!el) return;
        var parentRow = el.closest('.field-row') || el.closest('.text-block') || el.parentElement;
        if (!parentRow) return;

        if (enable) {
            if (field.type === 'select') {
                var select = document.createElement('select');
                select.className = 'edit-select';
                select.id = field.id + '-edit';
                field.options.forEach(function(opt) {
                    var optEl = document.createElement('option');
                    optEl.value = opt;
                    optEl.textContent = opt || 'Select...';
                    if (opt === field.value) optEl.selected = true;
                    select.appendChild(optEl);
                });
                el.style.display = 'none';
                parentRow.appendChild(select);
                parentRow.classList.add('editing');
            } else if (field.type === 'textarea') {
                var textarea = document.createElement('textarea');
                textarea.className = 'edit-textarea';
                textarea.id = field.id + '-edit';
                textarea.value = field.value;
                el.style.display = 'none';
                parentRow.appendChild(textarea);
                parentRow.classList.add('editing');
            } else {
                var input = document.createElement('input');
                input.className = 'edit-input';
                input.id = field.id + '-edit';
                input.type = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text';
                input.value = field.value;
                if (field.type === 'number') input.min = 0;
                el.style.display = 'none';
                parentRow.appendChild(input);
                parentRow.classList.add('editing');
            }
        } else {
            // Remove edit controls
            var editEl = document.getElementById(field.id + '-edit');
            if (editEl) editEl.remove();
            el.style.display = '';
            parentRow.classList.remove('editing');
        }
    });
}

function formatTimeInput(timestamp) {
    if (!timestamp) return '';
    var parts = timestamp.split('T');
    if (parts.length < 2) return '';
    var timePart = parts[1].split('+')[0].split('Z')[0];
    var timeParts = timePart.split(':');
    if (timeParts.length < 2) return '';
    return timeParts[0] + ':' + timeParts[1];
}

function getProvinceOptions() {
    if (window.BioData && window.BioData.getZambiaProvinces) {
        var provinces = window.BioData.getZambiaProvinces();
        return [''].concat(provinces);
    }
    return ['', 'Central Province', 'Copperbelt Province', 'Eastern Province', 'Luapula Province', 'Lusaka Province', 'Muchinga Province', 'Northern Province', 'North-Western Province', 'Southern Province', 'Western Province'];
}

function saveChanges() {
    if (!window.BioData) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    if (!obsId) return;

    function getEditValue(id) {
        var editEl = document.getElementById(id + '-edit');
        if (editEl) return editEl.value;
        var displayEl = document.getElementById(id);
        return displayEl ? displayEl.textContent : '';
    }

    var count = parseInt(getEditValue('fldPopulation'), 10) || 0;
    var activity = getEditValue('fldActivity');
    var dateVal = getEditValue('fldDate');
    var timeVal = getEditValue('fldTime');
    var timestamp = dateVal ? dateVal + 'T' + (timeVal || '00:00') + ':00Z' : obs.timestamp;
    var country = getEditValue('fldCountry');
    var province = getEditValue('fldProvince');
    var city = getEditValue('fldCity');
    var habitat = getEditValue('fldHabitat');
    var protectedArea = getEditValue('fldProtectedArea');
    var gpsStr = getEditValue('fldGps');
    var locality = getEditValue('fldLocality');
    var fieldNotes = getEditValue('fldFieldNotes');

    // Parse GPS
    var lat = null, lng = null;
    if (gpsStr && gpsStr !== '—') {
        var coords = parseCoords(gpsStr);
        if (coords) { lat = coords.lat; lng = coords.lng; }
    }

    var updates = {
        count: count,
        activity: activity,
        timestamp: timestamp,
        field_notes: fieldNotes,
        location: {
            latitude: lat,
            longitude: lng,
            country: country,
            administrative_area: province,
            city: city,
            habitat_type: habitat,
            protected_area: protectedArea,
            locality_description: locality
        }
    };

    window.BioData.updateObservation(obsId, updates);

    // Exit edit mode and refresh the view
    cancelEdit();
    viewRecordById(obsId);
    renderObsTable();
}

function parseCoords(str) {
    // Supports formats: "15.6000°S, 29.4000°E" and "15.6000, 29.4000"
    var regex = /([\-0-9.]+)\s*(?:°)?([NSEWnsew])?[, ]+\s*([\-0-9.]+)\s*(?:°)?([NSEWnsew])?/;
    var match = str.match(regex);
    if (!match) {
        // Try simple "lat, lng"
        var parts = str.split(',');
        if (parts.length === 2) {
            var lat = parseFloat(parts[0].trim());
            var lng = parseFloat(parts[1].trim());
            if (!isNaN(lat) && !isNaN(lng)) return { lat: lat, lng: lng };
        }
        return null;
    }
    var lat = parseFloat(match[1]);
    var lng = parseFloat(match[3]);
    if (isNaN(lat) || isNaN(lng)) return null;
    if (match[2] && (match[2].toUpperCase() === 'S' || match[2].toUpperCase() === 'W')) lat = -Math.abs(lat);
    if (match[4] && (match[4].toUpperCase() === 'S' || match[4].toUpperCase() === 'W')) lng = -Math.abs(lng);
    return { lat: lat, lng: lng };
}

// Handle delete action
function handleDelete() {
    if (!window.BioData) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    var speciesName = document.getElementById('modalSpeciesTitle').textContent;
    if (!obsId) return;
    if (confirm('Are you sure you want to delete the observation for ' + speciesName + '?')) {
        window.BioData.deleteObservation(obsId);
        closeViewModal();
        renderObsTable();
    }
}

// Open add modal
function openAddModal() {
    if (!window.BioData) return;
    document.getElementById('addModal').classList.add('active');
}

// Close add modal
function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
}

// Initialize page when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        if (!window.BioData) {
            console.warn('BioData not loaded. Observations page cannot render.');
            return;
        }

        renderObsTable();

        // Search input
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', handleObsSearch);
        }

        // Search field filter dropdown
        var filterBtn = document.getElementById('obsFilterBtn');
        var searchDropdown = document.getElementById('obsSearchDropdown');
        if (filterBtn && searchDropdown) {
            filterBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                searchDropdown.classList.toggle('open');
                filterBtn.classList.toggle('active');
            });

            // Radio change triggers re-search
            var radios = searchDropdown.querySelectorAll('input[type="radio"]');
            radios.forEach(function(radio) {
                radio.addEventListener('change', function() {
                    searchDropdown.classList.remove('open');
                    filterBtn.classList.remove('active');
                    handleObsSearch();
                });
            });

            // Close dropdown on outside click
            document.addEventListener('click', function(e) {
                if (!searchDropdown.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target)) {
                    searchDropdown.classList.remove('open');
                    filterBtn.classList.remove('active');
                }
            });
        }

        // Add record button
        var btnAdd = document.getElementById('btnAddRecord');
        if (btnAdd) btnAdd.addEventListener('click', openAddModal);

        // Previous/Next buttons
        var prevBtn = document.getElementById('prevBtn');
        var nextBtn = document.getElementById('nextBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (obsCurrentPage > 1) {
                    obsCurrentPage--;
                    renderObsTable();
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                var totalPages = Math.ceil(obsFilteredData.length / obsRecordsPerPage);
                if (obsCurrentPage < totalPages) {
                    obsCurrentPage++;
                    renderObsTable();
                }
            });
        }

        // View Modal buttons
        var closeViewBtn = document.getElementById('closeViewModalBtn');
        if (closeViewBtn) closeViewBtn.addEventListener('click', closeViewModal);

        // Edit button
        var btnEdit = document.getElementById('btnEditRecord');
        if (btnEdit) btnEdit.addEventListener('click', enableEditMode);

        // Approve button
        var btnApprove = document.getElementById('btnApproveRecord');
        if (btnApprove) btnApprove.addEventListener('click', handleApprove);

        // Flag button
        var btnFlag = document.getElementById('btnFlagRecord');
        if (btnFlag) btnFlag.addEventListener('click', handleFlag);

        // Close add modal buttons
        var closeAddBtn = document.getElementById('closeAddModalBtn');
        var closeAddFooterBtn = document.getElementById('closeAddModalFooterBtn');
        if (closeAddBtn) closeAddBtn.addEventListener('click', closeAddModal);
        if (closeAddFooterBtn) closeAddFooterBtn.addEventListener('click', closeAddModal);

        // Close modals on overlay click
        var viewModal = document.getElementById('viewModal');
        var addModal = document.getElementById('addModal');
        if (viewModal) {
            viewModal.addEventListener('click', function(e) {
                if (e.target === this) closeViewModal();
            });
        }
        if (addModal) {
            addModal.addEventListener('click', function(e) {
                if (e.target === this) closeAddModal();
            });
        }

        // Keyboard escape to close modals
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeViewModal();
                closeAddModal();
            }
        });
    });
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderObsTable, handleObsSearch, viewRecordById, closeViewModal, handleDelete, openAddModal, closeAddModal, toggleSection };
}