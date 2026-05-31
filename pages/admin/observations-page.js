/**
 * BioMonitor - Observations Page Logic
 * Handles table rendering, pagination (numbered), search, and modal interactions
 */

// Observation data
const allObservations = [
    { date: "4/7/2026", species: "Buffalo", count: 19, location: "Grassland, Sector O6", recordedBy: "Kwame Asante", habitat: "Open plain", temp: "26°C", rainfall: "0 mm", created: "April 7, 2026 at 04:20 PM" },
    { date: "4/7/2026", species: "African Wild Dog", count: 5, location: "Pack Territory, Sector W14", recordedBy: "Carlos Mbeki", habitat: "Dense woodland", temp: "24°C", rainfall: "2 mm", created: "April 7, 2026 at 03:45 PM" },
    { date: "4/6/2026", species: "Rhinoceros (Black)", count: 1, location: "Thornbush Thicket, Sector N5", recordedBy: "Aisha Patel", habitat: "Dense thicket", temp: "22°C", rainfall: "5 mm", created: "April 6, 2026 at 09:15 AM" },
    { date: "4/6/2026", species: "Spotted Hyena", count: 3, location: "Grassland, Sector U12", recordedBy: "David Kim", habitat: "Open grassland", temp: "25°C", rainfall: "0 mm", created: "April 6, 2026 at 11:30 AM" },
    { date: "4/5/2026", species: "Leopard", count: 1, location: "Riverine Forest, Sector T11", recordedBy: "James Wilson", habitat: "Riverine forest", temp: "21°C", rainfall: "8 mm", created: "April 5, 2026 at 06:50 AM" },
    { date: "4/5/2026", species: "Zebra", count: 18, location: "Southern Plains, Sector L3", recordedBy: "Maria Garcia", habitat: "Open plain", temp: "27°C", rainfall: "0 mm", created: "April 5, 2026 at 10:10 AM" },
    { date: "4/4/2026", species: "African Elephant", count: 9, location: "Waterhole, Sector M4", recordedBy: "Carlos Mbeki", habitat: "Woodland edge", temp: "28°C", rainfall: "0 mm", created: "April 4, 2026 at 05:30 PM" },
    { date: "4/4/2026", species: "Hippopotamus", count: 6, location: "Mara River, Sector J1", recordedBy: "Kwame Asante", habitat: "Riverine", temp: "23°C", rainfall: "3 mm", created: "April 4, 2026 at 07:00 AM" },
    { date: "4/3/2026", species: "Cheetah", count: 2, location: "Open Grasslands, Sector I4", recordedBy: "Aisha Patel", habitat: "Open plain", temp: "29°C", rainfall: "0 mm", created: "April 3, 2026 at 06:15 AM" },
    { date: "4/3/2026", species: "Giraffe", count: 6, location: "Acacia Savanna, Sector R9", recordedBy: "David Kim", habitat: "Acacia woodland", temp: "26°C", rainfall: "1 mm", created: "April 3, 2026 at 09:45 AM" },
    { date: "4/2/2026", species: "Lion", count: 4, location: "Kopje, Sector P7", recordedBy: "Maria Garcia", habitat: "Rocky outcrop", temp: "30°C", rainfall: "0 mm", created: "April 2, 2026 at 05:20 PM" },
    { date: "4/1/2026", species: "Buffalo", count: 27, location: "Grassland, Sector O6", recordedBy: "James Wilson", habitat: "Open plain", temp: "25°C", rainfall: "4 mm", created: "April 1, 2026 at 08:30 AM" },
    { date: "3/27/2026", species: "African Wild Dog", count: 8, location: "Pack Territory, Sector W14", recordedBy: "Carlos Mbeki", habitat: "Dense woodland", temp: "23°C", rainfall: "6 mm", created: "March 27, 2026 at 07:00 AM" },
    { date: "3/23/2026", species: "Rhinoceros (White)", count: 3, location: "Grassland, Sector V13", recordedBy: "Aisha Patel", habitat: "Open grassland", temp: "24°C", rainfall: "0 mm", created: "March 23, 2026 at 10:45 AM" },
    { date: "3/19/2026", species: "Zebra", count: 42, location: "Southern Plains, Sector L3", recordedBy: "Maria Garcia", habitat: "Open plain", temp: "27°C", rainfall: "0 mm", created: "March 19, 2026 at 11:20 AM" },
    { date: "3/15/2026", species: "Spotted Hyena", count: 4, location: "Grassland, Sector U12", recordedBy: "David Kim", habitat: "Open grassland", temp: "22°C", rainfall: "10 mm", created: "March 15, 2026 at 04:50 PM" },
    { date: "3/11/2026", species: "Leopard", count: 1, location: "Riverine Forest, Sector T11", recordedBy: "James Wilson", habitat: "Riverine forest", temp: "20°C", rainfall: "12 mm", created: "March 11, 2026 at 06:30 AM" },
    { date: "3/7/2026", species: "African Elephant", count: 7, location: "Woodland, Sector S10", recordedBy: "Carlos Mbeki", habitat: "Woodland", temp: "21°C", rainfall: "7 mm", created: "March 7, 2026 at 08:15 AM" },
    { date: "3/3/2026", species: "Hippopotamus", count: 11, location: "Mara River, Sector J1", recordedBy: "Aisha Patel", habitat: "Riverine", temp: "24°C", rainfall: "0 mm", created: "March 3, 2026 at 09:00 AM" },
    { date: "2/28/2026", species: "Giraffe", count: 5, location: "Acacia Savanna, Sector R9", recordedBy: "Kwame Asante", habitat: "Acacia woodland", temp: "28°C", rainfall: "0 mm", created: "February 28, 2026 at 10:30 AM" },
    { date: "2/25/2026", species: "Cheetah", count: 3, location: "Short Grass Plains, Sector Q8", recordedBy: "Maria Garcia", habitat: "Open plain", temp: "31°C", rainfall: "0 mm", created: "February 25, 2026 at 05:45 PM" },
    { date: "2/19/2026", species: "Lion", count: 6, location: "Kopje, Sector P7", recordedBy: "James Wilson", habitat: "Rocky outcrop", temp: "29°C", rainfall: "0 mm", created: "February 19, 2026 at 06:00 PM" },
    { date: "2/14/2026", species: "Buffalo", count: 34, location: "Grassland, Sector O6", recordedBy: "Carlos Mbeki", habitat: "Open plain", temp: "26°C", rainfall: "3 mm", created: "February 14, 2026 at 07:30 AM" },
    { date: "2/8/2026", species: "Rhinoceros (Black)", count: 2, location: "Thornbush Thicket, Sector N5", recordedBy: "Aisha Patel", habitat: "Dense thicket", temp: "23°C", rainfall: "5 mm", created: "February 8, 2026 at 08:45 AM" },
    { date: "2/2/2026", species: "Buffalo", count: 15, location: "Grassland, Sector O6", recordedBy: "Kwame Asante", habitat: "Open plain", temp: "25°C", rainfall: "2 mm", created: "February 2, 2026 at 09:15 AM" },
    { date: "1/28/2026", species: "Zebra", count: 22, location: "Southern Plains, Sector L3", recordedBy: "Aisha Patel", habitat: "Open plain", temp: "27°C", rainfall: "0 mm", created: "January 28, 2026 at 10:00 AM" },
    { date: "1/25/2026", species: "Lion", count: 3, location: "Kopje, Sector P7", recordedBy: "James Wilson", habitat: "Rocky outcrop", temp: "30°C", rainfall: "0 mm", created: "January 25, 2026 at 04:30 PM" },
    { date: "1/20/2026", species: "Giraffe", count: 4, location: "Acacia Savanna, Sector R9", recordedBy: "David Kim", habitat: "Acacia woodland", temp: "26°C", rainfall: "1 mm", created: "January 20, 2026 at 11:00 AM" },
    { date: "1/15/2026", species: "African Wild Dog", count: 6, location: "Pack Territory, Sector W14", recordedBy: "Carlos Mbeki", habitat: "Dense woodland", temp: "22°C", rainfall: "8 mm", created: "January 15, 2026 at 06:45 AM" },
    { date: "1/10/2026", species: "Spotted Hyena", count: 5, location: "Grassland, Sector U12", recordedBy: "Maria Garcia", habitat: "Open grassland", temp: "24°C", rainfall: "0 mm", created: "January 10, 2026 at 03:20 PM" },
    { date: "1/5/2026", species: "Rhinoceros (White)", count: 2, location: "Grassland, Sector V13", recordedBy: "Kwame Asante", habitat: "Open grassland", temp: "23°C", rainfall: "4 mm", created: "January 5, 2026 at 08:00 AM" },
    { date: "1/1/2026", species: "Hippopotamus", count: 8, location: "Mara River, Sector J1", recordedBy: "Aisha Patel", habitat: "Riverine", temp: "25°C", rainfall: "0 mm", created: "January 1, 2026 at 07:30 AM" }
];

// State management
let currentPage = 1;
let filteredData = [...allObservations];
const recordsPerPage = 8;

// Get filtered data based on search term
function getFilteredData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!searchTerm) return allObservations;
    return allObservations.filter(obs =>
        obs.species.toLowerCase().includes(searchTerm) ||
        obs.location.toLowerCase().includes(searchTerm) ||
        obs.recordedBy.toLowerCase().includes(searchTerm) ||
        obs.date.toLowerCase().includes(searchTerm)
    );
}

// Render the table
function renderTable() {
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
    pageData.forEach((obs, index) => {
        html += `
            <tr>
                <td>${obs.date}</td>
                <td class="species-cell">${obs.species}</td>
                <td class="count-cell">${obs.count}</td>
                <td class="location-cell">${obs.location}</td>
                <td class="recorded-by-cell">${obs.recordedBy}</td>
                <td class="actions-cell">
                    <button class="btn-view btnViewRecord" data-index="${startIdx + index}">View</button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    // Attach event listeners to View buttons
    const viewButtons = document.querySelectorAll('.btnViewRecord');
    viewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            viewRecord(index);
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
        const activeClass = i === currentPage ? 'active' : '';
        html += `<div class="page-item ${activeClass}" data-page="${i}">${i}</div>`;
    }
    container.innerHTML = html;

    // Attach click handlers to page items
    document.querySelectorAll('.page-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = parseInt(item.getAttribute('data-page'), 10);
            if (!isNaN(page) && page !== currentPage) {
                currentPage = page;
                renderTable();
            }
        });
    });

    // Update prev/next button states
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
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
    const obs = filteredData[index];
    if (!obs) return;

    document.getElementById('modalSpeciesTitle').textContent = obs.species;
    document.getElementById('modalSubtitle').textContent = `Observation details recorded on ${obs.date}`;

    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <div class="detail-section">
            <div class="detail-row">
                <div>
                    <div class="detail-label">Population Count</div>
                    <div class="detail-value">${obs.count}</div>
                </div>
                <div>
                    <div class="detail-label">Observation Date</div>
                    <div class="detail-value">${formatDate(obs.date)}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-header">Location</div>
            <div class="detail-section-value">${obs.location}</div>
        </div>
        <div class="detail-section">
            <div class="detail-section-header">Habitat Description</div>
            <div class="detail-section-value">${obs.habitat}</div>
        </div>
        <div class="detail-section">
            <div class="detail-row">
                <div>
                    <div class="detail-label">Temperature</div>
                    <div class="detail-value">${obs.temp}</div>
                </div>
                <div>
                    <div class="detail-label">Rainfall</div>
                    <div class="detail-value">${obs.rainfall}</div>
                </div>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-section-header">Recorded By</div>
            <div class="detail-section-value">${obs.recordedBy}</div>
        </div>
        <div class="detail-section">
            <div class="detail-section-header">Created</div>
            <div class="detail-section-value">${obs.created}</div>
        </div>
    `;

    document.getElementById('viewModal').classList.add('active');
}

// Format date for display
function formatDate(dateStr) {
    const months = {
        '1': 'January', '2': 'February', '3': 'March', '4': 'April',
        '5': 'May', '6': 'June', '7': 'July', '8': 'August',
        '9': 'September', '10': 'October', '11': 'November', '12': 'December'
    };
    const parts = dateStr.split('/');
    const month = parseInt(parts[0]);
    const day = parseInt(parts[1]);
    const year = parts[2];
    return `${months[month]} ${day}, ${year}`;
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
}

// Handle delete action
function handleDelete() {
    const speciesName = document.getElementById('modalSpeciesTitle').textContent;
    if (confirm(`Are you sure you want to delete the observation for ${speciesName}?`)) {
        const dateStr = document.getElementById('modalSubtitle').textContent.replace('Observation details recorded on ', '');
        const idx = allObservations.findIndex(o => o.species === speciesName && o.date === dateStr);
        if (idx !== -1) {
            allObservations.splice(idx, 1);
            closeViewModal();
            renderTable();
        }
    }
}

// Open add modal
function openAddModal() {
    document.getElementById('addModal').classList.add('active');
}

// Close add modal
function closeAddModal() {
    document.getElementById('addModal').classList.remove('active');
}

// Initialize page when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        renderTable();

        // Search input
        document.getElementById('searchInput').addEventListener('input', handleSearch);

        // Add record button
        document.getElementById('btnAddRecord').addEventListener('click', openAddModal);

        // Previous/Next buttons – connect to existing pagination
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    renderTable();
                }
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(filteredData.length / recordsPerPage);
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