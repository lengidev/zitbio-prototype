/**
 * BioMonitor - Users Page Logic
 * Handles table rendering, search, and modal interactions
 */

// User data (matches the image provided)
const allUsers = [
    { name: "Sarah Chen", email: "sarah.chen@biodiversity.org", role: "Administrator", created: "11/15/2025" },
    { name: "James Wilson", email: "james.wilson@biodiversity.org", role: "Field Officer", created: "12/1/2025" },
    { name: "Maria Garcia", email: "maria.garcia@biodiversity.org", role: "Field Officer", created: "12/10/2025" },
    { name: "David Kim", email: "david.kim@biodiversity.org", role: "Field Officer", created: "1/5/2026" },
    { name: "Aisha Patel", email: "aisha.patel@biodiversity.org", role: "Field Officer", created: "1/20/2026" },
    { name: "Carlos Mbeki", email: "carlos.mbeki@biodiversity.org", role: "Field Officer", created: "2/10/2026" },
    { name: "Elena Volkov", email: "elena.volkov@biodiversity.org", role: "Administrator", created: "12/5/2025" },
    { name: "Kwame Asante", email: "kwame.asante@biodiversity.org", role: "Field Officer", created: "3/1/2026" }
];

let filteredUsers = [...allUsers];

// Get filtered data based on search term
function getFilteredData() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    if (!searchTerm) return allUsers;
    return allUsers.filter(user =>
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm) ||
        user.role.toLowerCase().includes(searchTerm)
    );
}

// Render the table
function renderTable() {
    filteredUsers = getFilteredData();
    const tbody = document.getElementById('tableBody');
    const footer = document.getElementById('paginationFooter');

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-cell">No matching users found</td></tr>';
        footer.textContent = 'Showing 0 of 0 users';
        return;
    }

    let html = '';
    filteredUsers.forEach((user, index) => {
        // Determine the badge class based on role
        let badgeClass = 'officer';
        if (user.role === 'Administrator') {
            badgeClass = 'admin';
        }

        // Actions column with edit and delete icons
        html += `
            <tr>
                <td><strong>${user.name}</strong></td>
                <td style="color: var(--color-text-secondary);">${user.email}</td>
                <td><span class="role-badge ${badgeClass}">${user.role}</span></td>
                <td style="color: var(--color-text-secondary);">${user.created}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="action-icon-btn" data-index="${index}" title="Edit User">
                        <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                    </button>
                    <button class="action-icon-btn delete" data-index="${index}" title="Delete User">
                        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    const total = filteredUsers.length;
    footer.textContent = `Showing 1–${total} of ${total} users`;

    // Attach event listeners to action buttons
    document.querySelectorAll('.action-icon-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'), 10);
            if (this.classList.contains('delete')) {
                if (confirm(`Are you sure you want to delete ${filteredUsers[index].name}?`)) {
                    // In a real app, you'd send a DELETE request to the server
                    allUsers.splice(allUsers.indexOf(filteredUsers[index]), 1);
                    renderTable(); // Re-render the table
                }
            } else {
                // Edit logic placeholder
                alert(`Edit user: ${filteredUsers[index].name}`);
            }
        });
    });
}

// Handle search input
function handleSearch() {
    renderTable();
}

// Handle Add User button
function handleAddUser() {
    document.getElementById('addUserModal').classList.add('active');
}

// Initialize page when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function() {
        // Initialize table
        renderTable();

        // Search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Add user button
        const btnAddUser = document.getElementById('btnAddUser');
        if (btnAddUser) {
            btnAddUser.addEventListener('click', handleAddUser);
        }

        // Close Add User Modal Logic
        const closeAddUserModalBtn = document.getElementById('closeAddUserModalBtn');
        const closeAddUserModalFooterBtn = document.getElementById('closeAddUserModalFooterBtn');
        const addUserModal = document.getElementById('addUserModal');

        if (closeAddUserModalBtn) {
            closeAddUserModalBtn.addEventListener('click', function() {
                addUserModal.classList.remove('active');
            });
        }
        if (closeAddUserModalFooterBtn) {
            closeAddUserModalFooterBtn.addEventListener('click', function() {
                addUserModal.classList.remove('active');
            });
        }
        if (addUserModal) {
            addUserModal.addEventListener('click', function(e) {
                if (e.target === this) {
                    this.classList.remove('active');
                }
            });
        }
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderTable, handleSearch, handleAddUser };
}