/**
 * BioMonitor - Observations Page Logic
 * Reads from unified BioData layer — no local array.
 * Handles table rendering, pagination (numbered), search, and modal interactions.
 */

// State management
let currentPage = 1;
let filteredData = [];
const recordsPerPage = 8;

// Get filtered data from unified data layer
function getFilteredData() {
    if (!window.BioData) return [];
    const allObservations = window.BioData.getObservations();
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!searchTerm) return allObservations.slice();
    return allObservations.filter(function(obs) {
        return obs.species.toLowerCase().includes(searchTerm) ||
            obs.location.toLowerCase().includes(searchTerm) ||
            obs.recordedBy.toLowerCase().includes(searchTerm) ||
            obs.date.toLowerCase().includes(searchTerm);
    });
}

// Render the table
function renderTable() {
    if (!window.BioData) return;

    filteredData = getFilteredData();
    const totalPages = Math.ceil(filteredData.length / recordsPerPage);

    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * recordsPerPage;
    const endIdx = startIdx + recordsPerPage;
    const pageData = filteredData.slice(startIdx, endIdx);

    const tbody = document.getElementById('tableBody');

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="no-results">No matching observations found</td></tr>';
        renderPagination();
        return;
    }

    let html = '';
    pageData.forEach(function(obs, index) {
        html += '<tr>' +
            '<td>' + obs.date + '</td>' +
            '<td class="species-cell">' + obs.species + '</td>' +
            '<td class="count-cell">' + obs.count + '</td>' +
            '<td class="location-cell">' + obs.location + '</td>' +
            '<td class="recorded-by-cell">' + obs.recordedBy + '</td>' +
            '<td class="actions-cell">' +
                '<button class="btn-view btnViewRecord" data-index="' + (startIdx + index) + '">View</button>' +
            '</td>' +
            '</tr>';
    });
    tbody.innerHTML = html;

    // Attach event listeners to View buttons
    var viewButtons = document.querySelectorAll('.btnViewRecord');
    viewButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(this.getAttribute('data-index'), 10);
            viewRecord(idx);
        });
    });

    renderPagination();
}

// Render numbered pagination
function renderPagination() {
    const totalPages = Math.ceil(filteredData.length / recordsPerPage);
    const container = document.getElementById('paginationContainer');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    for (let i = 1; i <= totalPages; i++) {
        var activeClass = i === currentPage ? 'active' : '';
        html += '<div class="page-item ' + activeClass + '" data-page="' + i + '">' + i + '</div>';
    }
    container.innerHTML = html;

    // Attach click handlers to page items
    document.querySelectorAll('.page-item').forEach(function(item) {
        item.addEventListener('click', function() {
            var page = parseInt(item.getAttribute('data-page'), 10);
            if (!isNaN(page) && page !== currentPage) {
                currentPage = page;
                renderTable();
            }
        });
    });

    // Update prev/next button states
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.disabled = (currentPage <= 1);
    if (nextBtn) nextBtn.disabled = (currentPage >= totalPages);
}

// Handle search input
function handleSearch() {
    currentPage = 1;
    renderTable();
}

// View record details
function viewRecord(index) {
    var obs = filteredData[index];
    if (!obs) return;

    document.getElementById('modalSpeciesTitle').textContent = obs.species;
    document.getElementById('modalSubtitle').textContent = 'Observation details recorded on ' + obs.date;

    var modalBody = document.getElementById('modalBody');
    modalBody.innerHTML =
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Population Count</div>' +
                    '<div class="detail-value">' + obs.count + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Observation Date</div>' +
                    '<div class="detail-value">' + formatDate(obs.date) + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Location</div>' +
            '<div class="detail-section-value">' + obs.location + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Habitat Description</div>' +
            '<div class="detail-section-value">' + obs.habitat + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-row">' +
                '<div>' +
                    '<div class="detail-label">Temperature</div>' +
                    '<div class="detail-value">' + obs.temp + '</div>' +
                '</div>' +
                '<div>' +
                    '<div class="detail-label">Rainfall</div>' +
                    '<div class="detail-value">' + obs.rainfall + '</div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Recorded By</div>' +
            '<div class="detail-section-value">' + obs.recordedBy + '</div>' +
        '</div>' +
        '<div class="detail-section">' +
            '<div class="detail-section-header">Created</div>' +
            '<div class="detail-section-value">' + obs.created + '</div>' +
        '</div>';

    document.getElementById('viewModal').classList.add('active');
}

// Format date for display
function formatDate(dateStr) {
    var months = {
        '1': 'January', '2': 'February', '3': 'March', '4': 'April',
        '5': 'May', '6': 'June', '7': 'July', '8': 'August',
        '9': 'September', '10': 'October', '11': 'November', '12': 'December'
    };
    var parts = dateStr.split('/');
    var month = parseInt(parts[0], 10);
    var day = parseInt(parts[1], 10);
    var year = parts[2];
    return months[month] + ' ' + day + ', ' + year;
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
}

// Handle delete action
function handleDelete() {
    if (!window.BioData) return;
    var speciesName = document.getElementById('modalSpeciesTitle').textContent;
    var subtitle = document.getElementById('modalSubtitle').textContent;
    var dateStr = subtitle.replace('Observation details recorded on ', '');
    if (confirm('Are you sure you want to delete the observation for ' + speciesName + '?')) {
        window.BioData.deleteObservation(speciesName, dateStr);
        closeViewModal();
        renderTable();
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

        renderTable();

        // Search input
        document.getElementById('searchInput').addEventListener('input', handleSearch);

        // Add record button
        document.getElementById('btnAddRecord').addEventListener('click', openAddModal);

        // Previous/Next buttons
        var prevBtn = document.getElementById('prevBtn');
        var nextBtn = document.getElementById('nextBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable();
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                var totalPages = Math.ceil(filteredData.length / recordsPerPage);
                if (currentPage < totalPages) {
                    currentPage++;
                    renderTable();
                }
            });
        }

        // Close view modal buttons
        document.getElementById('closeViewModalBtn').addEventListener('click', closeViewModal);
        document.getElementById('closeViewModalFooterBtn').addEventListener('click', closeViewModal);

        // Delete button
        document.getElementById('btnDeleteObservation').addEventListener('click', handleDelete);

        // Close add modal buttons
        document.getElementById('closeAddModalBtn').addEventListener('click', closeAddModal);
        document.getElementById('closeAddModalFooterBtn').addEventListener('click', closeAddModal);

        // Close modals on overlay click
        document.getElementById('viewModal').addEventListener('click', function(e) {
            if (e.target === this) closeViewModal();
        });
        document.getElementById('addModal').addEventListener('click', function(e) {
            if (e.target === this) closeAddModal();
        });

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
    module.exports = { renderTable, handleSearch, viewRecord, closeViewModal, handleDelete, openAddModal, closeAddModal };
}