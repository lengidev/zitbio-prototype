/**
 * BioMonitor - Observations Page Logic
 * Reads from unified BioData layer via shared observationsRenderer.
 * Handles table rendering, pagination, search, and modal interactions.
 */

// State
var obsCurrentPage = 1;
var obsFilteredData = [];
var obsRecordsPerPage = 8;

// Get filtered data from unified data layer (v2 schema)
function getObsFilteredData() {
    if (!window.BioData) return [];
    var allObservations = window.BioData.getObservations();
    var searchInput = document.getElementById('searchInput');
    if (!searchInput) return allObservations.slice();
    var searchTerm = searchInput.value.toLowerCase().trim();
    if (!searchTerm) return allObservations.slice();
    return allObservations.filter(function(obs) {
        var speciesDet = obs.species_details || {};
        var scientificName = (speciesDet.scientific_name || '').toLowerCase();
        var commonName = (speciesDet.common_name || '').toLowerCase();
        var loc = obs.location || {};
        var locationStr = (loc.city || '').toLowerCase() + ' ' + (loc.administrative_area || '').toLowerCase() + ' ' + (loc.country || '').toLowerCase();
        var observer = (obs.recorded_by || '').toLowerCase();
        var dateStr = (obs.timestamp || '').toLowerCase();
        var institution = (obs.institution_name || '').toLowerCase();
        var habitat = (loc.habitat_type || '').toLowerCase();
        return scientificName.includes(searchTerm) ||
            commonName.includes(searchTerm) ||
            locationStr.includes(searchTerm) ||
            observer.includes(searchTerm) ||
            dateStr.includes(searchTerm) ||
            institution.includes(searchTerm) ||
            habitat.includes(searchTerm);
    });
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

    // The Observations page uses a different pagination structure (.pagination-container for page items)
    // and prev/next buttons are separate (#prevBtn, #nextBtn)
    // We still update the pagination info via the shared renderer for consistency,
    // but override the page numbers rendering to use the Observations layout

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

// View record details by ID (v2 schema)
function viewRecordById(id) {
    if (!window.BioData) return;
    var obs = window.BioData.getObservationById(id);
    if (!obs) return;

    var speciesDet = obs.species_details || {};
    var loc = obs.location || {};

    var speciesTitle = speciesDet.common_name || speciesDet.scientific_name || 'Unknown';
    document.getElementById('modalSpeciesTitle').textContent = speciesTitle;

    var dateStr = obs.timestamp ? obs.timestamp.split('T')[0] : '';
    document.getElementById('modalSubtitle').textContent = 'Observation details recorded on ' + formatObsDate(dateStr);

    var coordsStr = '';
    if (loc.latitude != null && loc.longitude != null) {
        coordsStr = loc.latitude.toFixed(4) + ', ' + loc.longitude.toFixed(4);
    } else {
        coordsStr = 'N/A';
    }

    var modalBody = document.getElementById('modalBody');
    modalBody.innerHTML =
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Scientific Name</div>' +
                    '<div class="detail-value">' + (speciesDet.scientific_name || '—') + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Common Name</div>' +
                    '<div class="detail-value">' + (speciesDet.common_name || '—') + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Population Count</div>' +
                    '<div class="detail-value">' + (obs.count || 0) + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Date</div>' +
                    '<div class="detail-value">' + formatObsDate(dateStr) + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Location</div>' +
            '<div class="detail-section-value">' +
                (loc.city || '') +
                (loc.administrative_area ? (loc.city ? ', ' : '') + loc.administrative_area : '') +
                (loc.country ? ', ' + loc.country : '') +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Latitude</div>' +
                    '<div class="detail-value">' + (loc.latitude != null ? loc.latitude.toFixed(4) : 'N/A') + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Longitude</div>' +
                    '<div class="detail-value">' + (loc.longitude != null ? loc.longitude.toFixed(4) : 'N/A') + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Protected Area</div>' +
            '<div class="detail-section-value">' + (loc.protected_area || 'None') + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Habitat Type</div>' +
            '<div class="detail-section-value">' + (loc.habitat_type || 'Not specified') + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Locality Description</div>' +
            '<div class="detail-section-value">' + (loc.locality_description || '—') + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Recorded By</div>' +
                    '<div class="detail-value">' + (obs.recorded_by || '—') + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Institution</div>' +
                    '<div class="detail-value">' + (obs.institution_name || '—') + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Verification Status</div>' +
            '<div class="detail-section-value">' + (obs.verification_status || 'Pending') + '</div>' +
        '</div>';

    // Store current observation ID for delete
    document.getElementById('viewModal').setAttribute('data-obs-id', obs.observation_id);
    document.getElementById('viewModal').classList.add('active');
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
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

        // Close view modal buttons
        var closeViewBtn = document.getElementById('closeViewModalBtn');
        var closeViewFooterBtn = document.getElementById('closeViewModalFooterBtn');
        if (closeViewBtn) closeViewBtn.addEventListener('click', closeViewModal);
        if (closeViewFooterBtn) closeViewFooterBtn.addEventListener('click', closeViewModal);

        // Delete button
        var btnDelete = document.getElementById('btnDeleteObservation');
        if (btnDelete) btnDelete.addEventListener('click', handleDelete);

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
    module.exports = { renderObsTable, handleObsSearch, viewRecordById, closeViewModal, handleDelete, openAddModal, closeAddModal };
}