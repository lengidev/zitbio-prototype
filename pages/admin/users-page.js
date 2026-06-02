/**
 * Users Page Logic
 * Reads/writes from unified BioData layer instead of local array.
 */

/**
 * Converts a Date object into a relative time string (e.g., "1 hour ago").
 * @param {Date} date
 * @returns {string}
 */
function getRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date; // milliseconds difference
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
    if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
    return `${Math.floor(diffMonths / 12)} year${Math.floor(diffMonths / 12) === 1 ? '' : 's'} ago`;
}

let filteredData = [];
let currentPage = 1;
const recordsPerPage = 8;

function getRoleDisplayName(role) {
    if (role === 'admin') return 'Administrator';
    if (role === 'field_officer') return 'Field Officer';
    return role;
}

function renderTable() {
    if (!window.BioData) return;

    const allUsers = window.BioData.getUsers();
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();

    if (searchTerm) {
        filteredData = allUsers.filter(function(user) {
            return user.name.toLowerCase().includes(searchTerm) ||
                   user.email.toLowerCase().includes(searchTerm);
        });
    } else {
        filteredData = allUsers.slice();
    }

    // Update the total user count badge (always shows total registered, not filtered)
    document.getElementById('userCountBadge').textContent = window.BioData.totalUsers();

    const totalPages = Math.ceil(filteredData.length / recordsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * recordsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + recordsPerPage);

    const tbody = document.getElementById('userTableBody');
    const footer = document.getElementById('paginationFooter');

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty-cell">No users found</td></tr>';
        footer.textContent = 'Showing 0 of 0 users';
        return;
    }

    var html = '';
    pageData.forEach(function(user) {
        var roleDisplay = getRoleDisplayName(user.role);
        var roleClass = roleDisplay === 'Administrator' ? 'admin' : 'officer';

        // Use real lastLogin from data layer, or show "Never" if null
        var relativeTime;
        if (user.lastLogin) {
          relativeTime = getRelativeTime(new Date(user.lastLogin));
        } else {
          relativeTime = 'Never';
        }

        html += '<tr>' +
            '<td class="name-cell">' + user.name + '</td>' +
            '<td class="email-cell">' + user.email + '</td>' +
            '<td><span class="role-badge ' + roleClass + '">' + roleDisplay + '</span></td>' +
            '<td class="date-cell">' + user.created + '</td>' +
            '<td class="last-login-cell">' +
                '<span class="last-login-wrapper">' +
                    '<span class="material-symbols-outlined last-login-icon">schedule</span>' +
                    relativeTime +
                '</span>' +
            '</td>' +
            '<td class="actions-cell">' +
                '<button class="action-icon-btn edit-user" data-id="' + user.id + '" title="Edit">' +
                    '<span class="material-symbols-outlined" style="font-size: 18px;">edit</span>' +
                '</button>' +
                '<button class="action-icon-btn delete delete-user" data-id="' + user.id + '" title="Delete">' +
                    '<span class="material-symbols-outlined" style="font-size: 18px;">delete</span>' +
                '</button>' +
            '</td>' +
            '</tr>';
    });
    tbody.innerHTML = html;

    var start = startIdx + 1;
    var end = Math.min(startIdx + recordsPerPage, filteredData.length);
    footer.textContent = 'Showing ' + start + '\u2013' + end + ' of ' + filteredData.length + ' users';
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

// Edit/delete handlers
document.addEventListener('click', function(e) {
    if (!window.BioData) return;

    if (e.target.closest('.edit-user')) {
        var id = e.target.closest('.edit-user').getAttribute('data-id');
        var user = window.BioData.getUserById(parseInt(id, 10));
        if (user) {
            alert('Edit user: ' + user.name + '\n(email: ' + user.email + ') \u2013 coming soon.');
        }
    }
    if (e.target.closest('.delete-user')) {
        var id = e.target.closest('.delete-user').getAttribute('data-id');
        var user = window.BioData.getUserById(parseInt(id, 10));
        if (user && confirm('Delete user "' + user.name + '" (ID: ' + id + ')?')) {
            window.BioData.deleteUser(parseInt(id, 10));
            renderTable();
        }
    }
});

document.addEventListener('DOMContentLoaded', function() {
    if (!window.BioData) {
        console.warn('BioData not loaded. Users page cannot render.');
        return;
    }

    renderTable();
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    document.getElementById('btnAddUser').addEventListener('click', openAddUserModal);
    document.getElementById('closeAddUserModalBtn').addEventListener('click', closeAddUserModal);
    document.getElementById('closeAddUserModalFooterBtn').addEventListener('click', closeAddUserModal);

    // Close modal on overlay click
    var modal = document.getElementById('addUserModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeAddUserModal();
        });
    }
});