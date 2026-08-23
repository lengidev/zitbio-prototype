/**
 * ZitBio — Users Page Logic
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
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty-cell">No users found</td></tr>';
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
            '<td class="institution-cell">' + (user.institution_name || '—') + '</td>' +
            '<td class="date-cell">' + user.created + '</td>' +
            '<td class="last-login-cell">' +
                '<span class="last-login-wrapper">' +
                    '<svg class="material-symbols-outlined last-login-icon" aria-hidden="true"><use href="#i-schedule"/></svg>' +
                    relativeTime +
                '</span>' +
            '</td>' +
            '<td class="actions-cell">' +
                '<button class="action-icon-btn edit-user" data-id="' + user.id + '" title="Edit">' +
                    '<svg class="material-symbols-outlined" style="width:18px;height:18px;" aria-hidden="true"><use href="#i-edit"/></svg>' +
                '</button>' +
                '<button class="action-icon-btn delete delete-user" data-id="' + user.id + '" title="Delete">' +
                    '<svg class="material-symbols-outlined" style="width:18px;height:18px;" aria-hidden="true"><use href="#i-delete"/></svg>' +
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
    var pwdEl = document.getElementById('addUserPassword');
    if (pwdEl) pwdEl.value = '';
    document.getElementById('addUserRole').value = 'field_officer';
    document.getElementById('addUserInstitution').value = '';
    document.getElementById('addUserModal').classList.add('active');
}

function closeAddUserModal() {
    document.getElementById('addUserModal').classList.remove('active');
}

function openEditUserModal(id) {
    if (!window.BioData) return;
    // Cloud-backed profiles use UUID string ids; legacy seeded users use
    // numeric ids. getUserById handles both via loose equality.
    var user = window.BioData.getUserById(String(id)) || window.BioData.getUserById(parseInt(id, 10));
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

// Create a REAL Supabase Auth user via the admin-users Edge Function, then
// refresh the table from the cloud. Falls back to the local cache if the
// function is not deployed yet.
function handleSaveAddUser() {
    if (!window.BioData) return;
    var name = document.getElementById('addUserName').value.trim();
    var email = document.getElementById('addUserEmail').value.trim();
    var passwordEl = document.getElementById('addUserPassword');
    var password = passwordEl ? passwordEl.value : '';
    var role = document.getElementById('addUserRole').value;
    var institution = document.getElementById('addUserInstitution').value.trim();

    function notice(text, isError) {
        if (isError && typeof showToast === 'function') {
            showToast(text, 'error');
        } else if (typeof showToast === 'function') {
            showToast(text, 'success');
        } else {
            alert(text);
        }
    }

    if (!name) { alert('Please enter a name.'); return; }
    if (!email) { alert('Please enter an email.'); return; }
    if (!password || password.length < 8) {
        alert('Please set a temporary password of at least 8 characters.');
        return;
    }

    if (window.BioSync && typeof window.BioSync.adminUsers === 'function' && window.BioSync.getAdminUsersUrl()) {
        window.BioSync.adminUsers('create', {
            email: email,
            password: password,
            full_name: name,
            role: role,
            institution: institution
        }).then(function() {
            notice('User created. They can sign in now.');
            closeAddUserModal();
            // Refresh from cloud so the table shows the real auth user + profile.
            return window.BioSync.loadFromCloud();
        }).then(function() {
            renderTable();
        }).catch(function(err) {
            alert(err && err.message ? err.message : 'Unable to create user.');
        });
    } else {
        // Function not deployed — keep local-cache behaviour so the page
        // still works, and tell the admin the cloud step is pending.
        window.BioData.addUser({ name: name, email: email, role: role, institution_name: institution });
        notice('User saved locally. Deploy admin-users function to create in Supabase.');
        closeAddUserModal();
        renderTable();
    }
}

// Persist edits to an existing user through the admin-users Edge Function,
// then refresh the table from the cloud. Falls back to the local cache if
// the function is not deployed yet.
function handleSaveEditUser() {
    if (!window.BioData) return;
    // Preserve the id as a string — cloud-backed profiles use UUIDs, while
    // legacy seeded users use numeric ids.
    var id = document.getElementById('editUserId').value;
    var name = document.getElementById('editUserName').value.trim();
    var role = document.getElementById('editUserRole').value;
    var institution = document.getElementById('editUserInstitution').value.trim();

    if (!name) {
        alert('Please enter a name.');
        return;
    }

    if (window.BioSync && typeof window.BioSync.adminUsers === 'function' && window.BioSync.getAdminUsersUrl()) {
        window.BioSync.adminUsers('update', {
            id: id,
            full_name: name,
            role: role,
            institution: institution
        }).then(function() {
            closeEditUserModal();
            return window.BioSync.loadFromCloud();
        }).then(function() {
            renderTable();
        }).catch(function(err) {
            alert(err && err.message ? err.message : 'Unable to update user.');
        });
    } else {
        window.BioData.updateUser(id, { name: name, role: role, institution_name: institution });
        closeEditUserModal();
        renderTable();
    }
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
        // Look up by string (cloud UUID) or numeric (legacy) id.
        var user = window.BioData.getUserById(String(id)) || window.BioData.getUserById(parseInt(id, 10));
        if (user && confirm('Delete user "' + user.name + '" (ID: ' + id + ')?')) {
            var doDelete = function() {
                if (window.BioSync && typeof window.BioSync.adminUsers === 'function' && window.BioSync.getAdminUsersUrl()) {
                    return window.BioSync.adminUsers('delete', { id: id });
                }
                return Promise.resolve({ ok: false, skipped: true });
            };
            doDelete().then(function() {
                // Remove from local cache regardless (cloud deleted or fallback),
                // then refresh from the cloud to reflect the authoritative state.
                window.BioData.deleteUser(String(id));
                return window.BioSync && typeof window.BioSync.loadFromCloud === 'function'
                    ? window.BioSync.loadFromCloud()
                    : Promise.resolve();
            }).then(function() {
                renderTable();
            }).catch(function(err) {
                alert(err && err.message ? err.message : 'Unable to delete user.');
            });
        }
    }
});

// Re-render the table after the Supabase sync layer seeds cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    renderTable();
  });
}

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