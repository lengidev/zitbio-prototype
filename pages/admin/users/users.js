/**
 * BioMonitor — Users Page Logic
 * Reads/writes from unified BioData layer instead of a local array.
 * All user CRUD operations go through the data layer so changes are
 * immediately reflected across the entire application.
 */

/**
 * Converts a Date object into a relative time string (e.g., "1 hour ago").
 * Used in the "Last Login" column to give admins an at-a-glance sense of
 * user activity without needing to parse absolute timestamps.
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

    // Update the total user count badge — always shows total registered,
    // not filtered count, so admins see the overall system size at a glance.
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

        // Use real lastLogin from data layer, or show "Never" if the user
        // has never logged in (seed accounts or newly created users).
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
    // Reset fields for a fresh entry
    document.getElementById('addUserName').value = '';
    document.getElementById('addUserEmail').value = '';
    document.getElementById('addUserRole').value = 'field_officer';
    document.getElementById('addUserInstitution').value = '';
    document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('active');
}

function openEditUserModal(id) {
    if (!window.BioData) return;
    var user = window.BioData.getUserById(parseInt(id, 10));
    if (!user) return;
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.name || '';
    document.getElementById('editUserEmail').value = user.email || '';
    document.getElementById('editUserRole').value = user.role || 'field_officer';
    document.getElementById('editUserInstitution').value = user.institution_name || '';
    document.getElementById('editUserSubtitle').textContent = 'Editing ' + (user.name || 'user');
    document.getElementById('editUserModal').classList.add('active');
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('active');
}

// Persist a new user via the BioData layer, then refresh the table.
function handleSaveAddUser() {
    if (!window.BioData) return;
    var name = document.getElementById('addUserName').value.trim();
    var email = document.getElementById('addUserEmail').value.trim();
    var role = document.getElementById('addUserRole').value;
    var institution = document.getElementById('addUserInstitution').value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }
    if (!email) {
        alert('Please enter an email.');
        return;
    }

    window.BioData.addUser({
        name: name,
        email: email,
        role: role,
        institution_name: institution
    });
    closeAddUserModal();
    renderTable();
}

// Persist edits to an existing user via the BioData layer, then refresh.
function handleSaveEditUser() {
    if (!window.BioData) return;
    var id = parseInt(document.getElementById('editUserId').value, 10);
    var name = document.getElementById('editUserName').value.trim();
    var email = document.getElementById('editUserEmail').value.trim();
    var role = document.getElementById('editUserRole').value;
    var institution = document.getElementById('editUserInstitution').value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }
    if (!email) {
        alert('Please enter an email.');
        return;
    }

    window.BioData.updateUser(id, {
        name: name,
        email: email,
        role: role,
        institution_name: institution
    });
    closeEditUserModal();
    renderTable();
}

// Edit/delete handler — delegates to BioData CRUD methods
// so user deletions immediately affect the data layer and notification system.
document.addEventListener('click', function(e) {
    if (!window.BioData) return;

    if (e.target.closest('.edit-user')) {
        var id = e.target.closest('.edit-user').getAttribute('data-id');
        openEditUserModal(id);
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
    document.getElementById('saveAddUserBtn').addEventListener('click', handleSaveAddUser);

    document.getElementById('closeEditUserModalBtn').addEventListener('click', closeEditUserModal);
    document.getElementById('closeEditUserModalFooterBtn').addEventListener('click', closeEditUserModal);
    document.getElementById('saveEditUserBtn').addEventListener('click', handleSaveEditUser);

    // Close modals on overlay click
    var addModal = document.getElementById('addUserModal');
    if (addModal) {
        addModal.addEventListener('click', function(e) {
            if (e.target === addModal) closeAddUserModal();
        });
    }
    var editModal = document.getElementById('editUserModal');
    if (editModal) {
        editModal.addEventListener('click', function(e) {
            if (e.target === editModal) closeEditUserModal();
        });
    }

    // Close modals on Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAddUserModal();
            closeEditUserModal();
        }
    });
});