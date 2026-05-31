/**
 * Users Page Logic
 * Manages user table, search, and modal interactions
 */

// Mock user data
const usersData = [
    { id: 1, name: 'Sarah Chen', email: 'sarah.chen@biodiversity.org', role: 'Administrator', created: '11/15/2025' },
    { id: 2, name: 'James Wilson', email: 'james.wilson@biodiversity.org', role: 'Field Officer', created: '12/1/2025' },
    { id: 3, name: 'Maria Garcia', email: 'maria.garcia@biodiversity.org', role: 'Field Officer', created: '12/10/2025' },
    { id: 4, name: 'David Kim', email: 'david.kim@biodiversity.org', role: 'Field Officer', created: '1/5/2026' },
    { id: 5, name: 'Aisha Patel', email: 'aisha.patel@biodiversity.org', role: 'Field Officer', created: '1/20/2026' },
    { id: 6, name: 'Carlos Mbeki', email: 'carlos.mbeki@biodiversity.org', role: 'Field Officer', created: '2/10/2026' },
    { id: 7, name: 'Elena Volkov', email: 'elena.volkov@biodiversity.org', role: 'Administrator', created: '12/5/2025' },
    { id: 8, name: 'Kwame Asante', email: 'kwame.asante@biodiversity.org', role: 'Field Officer', created: '3/1/2026' }
];

let filteredData = [...usersData];
let currentPage = 1;
const recordsPerPage = 8;

function renderTable() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    if (searchTerm) {
        filteredData = usersData.filter(user =>
            user.name.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm)
        );
    } else {
        filteredData = [...usersData];
    }

    const totalPages = Math.ceil(filteredData.length / recordsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * recordsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + recordsPerPage);

    const tbody = document.getElementById('userTableBody');
    const footer = document.getElementById('paginationFooter');

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="table-empty-cell">No users found</td></tr>';
        footer.textContent = 'Showing 0 of 0 users';
        return;
    }

    let html = '';
    pageData.forEach(user => {
        const roleClass = user.role === 'Administrator' ? 'admin' : 'officer';
        html += `
            <tr>
                <td class="name-cell">${user.name}</td>
                <td class="email-cell">${user.email}</td>
                <td><span class="role-badge ${roleClass}">${user.role}</span></td>
                <td class="date-cell">${user.created}</td>
                <td class="actions-cell">
                    <button class="action-icon-btn edit-user" data-id="${user.id}" title="Edit">
                        <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                    </button>
                    <button class="action-icon-btn delete delete-user" data-id="${user.id}" title="Delete">
                        <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;

    const start = startIdx + 1;
    const end = Math.min(startIdx + recordsPerPage, filteredData.length);
    footer.textContent = `Showing ${start}–${end} of ${filteredData.length} users`;
}

function handleSearch() {
    currentPage = 1;
    renderTable();
}

function openAddUserModal() {
    document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('active');
}

// Simple edit/delete handlers (placeholders)
document.addEventListener('click', (e) => {
    if (e.target.closest('.edit-user')) {
        const id = e.target.closest('.edit-user').getAttribute('data-id');
        alert(`Edit user ID ${id} – coming soon.`);
    }
    if (e.target.closest('.delete-user')) {
        const id = e.target.closest('.delete-user').getAttribute('data-id');
        if (confirm(`Delete user ID ${id}?`)) {
            const index = usersData.findIndex(u => u.id == id);
            if (index !== -1) usersData.splice(index, 1);
            renderTable();
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('btnAddUser').addEventListener('click', openAddUserModal);
    document.getElementById('closeAddUserModalBtn').addEventListener('click', closeAddUserModal);
    document.getElementById('closeAddUserModalFooterBtn').addEventListener('click', closeAddUserModal);
    // Close modal on overlay click
    const modal = document.getElementById('addUserModal');
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAddUserModal();
    });
});