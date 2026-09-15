// ZitBio: Users Page Logic. Reads and writes through the BioData layer so a user
// change is immediately reflected everywhere else.

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

    // Always the total, not the filtered count: the badge shows system size.
    document.getElementById('userCountBadge').textContent = window.BioData.totalUsers();

    const totalPages = Math.ceil(filteredData.length / recordsPerPage);
    if (currentPage > totalPages) currentPage = totalPages || 1;

    const startIdx = (currentPage - 1) * recordsPerPage;
    const pageData = filteredData.slice(startIdx, startIdx + recordsPerPage);

    const tbody = document.getElementById('userTableBody');
    const footer = document.getElementById('paginationFooter');

    if (filteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty-cell">No users found</td></tr>';
        footer.textContent = 'Showing 0 of 0 users';
        return;
    }

    var html = '';
    pageData.forEach(function(user) {
        var roleDisplay = getRoleDisplayName(user.role);
        var roleClass = roleDisplay === 'Administrator' ? 'admin' : 'officer';

        var isActive = user.active !== false;

        html += '<tr>' +
            '<td class="name-cell">' + escapeHtml(user.name) + '</td>' +
            '<td class="email-cell">' + escapeHtml(user.email) + '</td>' +
            '<td><span class="role-badge ' + roleClass + '">' + escapeHtml(roleDisplay) + '</span></td>' +
            '<td class="institution-cell">' + escapeHtml(user.institution_name || '—') + '</td>' +
            '<td class="date-cell">' + escapeHtml(user.created) + '</td>' +
            // No class on this cell: a global `.status-cell { display: inline-flex }`
            // rule breaks the table cell and floats the pill out of alignment.
            '<td>' +
                '<span class="user-status ' + (isActive ? 'is-active' : 'is-inactive') + '">' +
                    (isActive ? 'Active' : 'Deactivated') +
                '</span>' +
            '</td>' +
            // All three actions are text buttons: two icons plus one label read as
            // a mistake, and there is no icon for deactivate on this page.
            '<td class="actions-cell">' +
                '<button class="action-text-btn edit-user" data-id="' + escapeHtml(user.id) + '">Edit</button>' +
                '<button class="action-text-btn ' + (isActive ? 'is-deactivate' : 'is-reactivate') +
                    ' toggle-user-active" data-id="' + escapeHtml(user.id) +
                    '" data-active="' + (isActive ? 'true' : 'false') + '">' +
                    (isActive ? 'Deactivate' : 'Reactivate') +
                '</button>' +
                '<button class="action-text-btn is-delete delete-user" data-id="' + escapeHtml(user.id) + '">Delete</button>' +
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
    document.getElementById('addUserName').value = '';
    document.getElementById('addUserEmail').value = '';
    var pwdEl = document.getElementById('addUserPassword');
    if (pwdEl) pwdEl.value = '';
    document.getElementById('addUserRole').value = 'field_officer';
    document.getElementById('addUserInstitution').value = '';
    // Through the shared helper: it moves focus into the dialog, traps Tab, makes
    // the page behind inert, and returns focus here on close.
    ModalManager.open('addUserModal');
}

function closeAddUserModal() {
    ModalManager.closeById('addUserModal');
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
    ModalManager.open('editUserModal');
}

function closeEditUserModal() {
    ModalManager.closeById('editUserModal');
}

/* Form validation */

/**
 * Errors render next to the field, the field is marked invalid and described,
 * and the first error takes focus: native `alert()` gave none of that.
 */

var ADD_USER_FIELDS = ['addUserName', 'addUserEmail', 'addUserPassword'];
var EDIT_USER_FIELDS = ['editUserName'];

/**
 * Omit `message`, or pass '', to clear the field's error.
 */
function setFieldError(inputId, message) {
    var input = document.getElementById(inputId);
    if (!input) return;

    var field = input.closest('.form-field') || input.parentNode;
    var errorId = inputId + 'Error';
    var errorEl = document.getElementById(errorId);

    if (!message) {
        if (errorEl && errorEl.parentNode) errorEl.parentNode.removeChild(errorEl);
        input.classList.remove('input-error');
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
        return;
    }

    if (!errorEl) {
        errorEl = document.createElement('p');
        errorEl.id = errorId;
        errorEl.className = 'form-field-error';
        errorEl.setAttribute('role', 'alert');
        field.appendChild(errorEl);
    }
    errorEl.textContent = message;
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
}

function clearFieldErrors(ids) {
    Array.prototype.forEach.call(ids, function(id) { setFieldError(id, ''); });
}

function focusField(inputId) {
    var input = document.getElementById(inputId);
    if (input) input.focus();
}

/**
 * Deliberately permissive: catch typos, not unusual-but-valid addresses. The
 * server validates whatever gets through.
 */
function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

/**
 * Returns the first invalid field's id, or null when valid.
 */
function validateAddUserForm(fields) {
    var firstInvalid = null;
    function fail(id, message) {
        setFieldError(id, message);
        if (!firstInvalid) firstInvalid = id;
    }

    if (!fields.name) fail('addUserName', 'Enter a full name.');

    if (!fields.email) {
        fail('addUserEmail', 'Enter an email address.');
    } else if (!isValidEmail(fields.email)) {
        fail('addUserEmail', 'Enter a valid email address, for example name@zitbu.ac.zm.');
    }

    if (!fields.password || !fields.password.length) {
        fail('addUserPassword', 'Set a temporary password.');
    } else {
        // Shared policy; this form used to accept 12345678.
        var strength = window.BioPassword
            ? window.BioPassword.check(fields.password)
            : { ok: fields.password.length >= 8, message: 'Use at least 8 characters.' };
        if (!strength.ok) fail('addUserPassword', strength.message);
    }

    return firstInvalid;
}

/**
 * Raw API strings are not shown verbatim: GoTrue's "invalid format" wording for
 * a bad email reads as nonsense to the person who typed it.
 */
function friendlyUserError(err, action) {
    var raw = (err && err.message) ? String(err.message) : '';
    var lower = raw.toLowerCase();

    if (lower.indexOf('invalid format') !== -1 || lower.indexOf('validate email') !== -1) {
        return 'That email address was rejected. Check it and try again.';
    }
    if (lower.indexOf('already') !== -1 || lower.indexOf('duplicate') !== -1 || lower.indexOf('exists') !== -1) {
        return 'A user with that email already exists.';
    }
    if (lower.indexOf('not authorized') !== -1 || lower.indexOf('unauthorized') !== -1 || lower.indexOf('jwt') !== -1) {
        return 'Your session has expired. Sign in again and retry.';
    }
    if (raw) return 'Could not ' + action + ' the user — ' + raw.slice(0, 140);
    return 'Could not ' + action + ' the user.';
}

/** Toast wrapper, with a console fallback so an outcome is never swallowed. */
function userToast(message, type) {
    if (window.BioToast && typeof window.BioToast.show === 'function') {
        window.BioToast.show(message, type);
        return;
    }
    console.warn('Users: ' + message);
}

// Creates a real Auth user through the admin-users function; falls back to the
// local cache when it is not deployed.
function handleSaveAddUser() {
    if (!window.BioData) return;
    var name = document.getElementById('addUserName').value.trim();
    var email = document.getElementById('addUserEmail').value.trim();
    var passwordEl = document.getElementById('addUserPassword');
    var password = passwordEl ? passwordEl.value : '';
    var role = document.getElementById('addUserRole').value;
    var institution = document.getElementById('addUserInstitution').value.trim();

    clearFieldErrors(ADD_USER_FIELDS);
    var invalid = validateAddUserForm({ name: name, email: email, password: password });
    if (invalid) {
        // Marked in place and focused: the field says where, the message says what.
        focusField(invalid);
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
            closeAddUserModal();
            userToast(name + ' created and saved.', 'success');
            // Refresh from cloud so the table shows the real auth user + profile.
            return window.BioSync.loadFromCloud();
        }).then(function() {
            renderTable();
        }).catch(function(err) {
            userToast(friendlyUserError(err, 'create'), 'error');
        });
    } else {
        // Function not deployed: keep local-cache behaviour, but say the cloud step
        // is pending.
        window.BioData.addUser({ name: name, email: email, role: role, institution_name: institution });
        closeAddUserModal();
        renderTable();
        userToast(name + ' saved on this device only — the server was not reached.', 'warning');
    }
}

// Persists through the admin-users function, falling back to the local cache.
function handleSaveEditUser() {
    if (!window.BioData) return;
    // Keep the id a string: cloud profiles use UUIDs, legacy seeded users numeric ids.
    var id = document.getElementById('editUserId').value;
    var name = document.getElementById('editUserName').value.trim();
    var role = document.getElementById('editUserRole').value;
    var institution = document.getElementById('editUserInstitution').value.trim();

    if (!name) {
        clearFieldErrors(EDIT_USER_FIELDS);
        setFieldError('editUserName', 'Enter a full name.');
        focusField('editUserName');
        return;
    }
    clearFieldErrors(EDIT_USER_FIELDS);

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
            userToast(name + ' updated and saved.', 'success');
        }).catch(function(err) {
            userToast(friendlyUserError(err, 'update'), 'error');
        });
    } else {
        window.BioData.updateUser(id, { name: name, role: role, institution_name: institution });
        closeEditUserModal();
        renderTable();
        userToast(name + ' updated on this device only — the server was not reached.', 'warning');
    }
}

// Delegates to the BioData CRUD methods so a deletion reaches the data layer too.
document.addEventListener('click', function(e) {
    if (!window.BioData) return;

    if (e.target.closest('.edit-user')) {
        var id = e.target.closest('.edit-user').getAttribute('data-id');
        openEditUserModal(id);
    }

    // Reversible, so it is a labelled button rather than a third ambiguous icon.
    if (e.target.closest('.toggle-user-active')) {
        var toggleBtn = e.target.closest('.toggle-user-active');
        var toggleId = toggleBtn.getAttribute('data-id');
        var currentlyActive = toggleBtn.getAttribute('data-active') === 'true';
        var target = window.BioData.getUserById(String(toggleId)) || window.BioData.getUserById(parseInt(toggleId, 10));
        openStatusConfirm(toggleId, target ? target.name : 'this user', currentlyActive);
        return;
    }
    if (e.target.closest('.delete-user')) {
        var id = e.target.closest('.delete-user').getAttribute('data-id');
        // Look up by string (cloud UUID) or numeric (legacy) id.
        var user = window.BioData.getUserById(String(id)) || window.BioData.getUserById(parseInt(id, 10));
        if (user) openDeleteConfirm(id, user.name);
    }
});

/* Access requests */

/**
 * Read-only, not a queue: approval is automatic, so this only shows who joined
 * and when. Loaded on first expand because it is reference material.
 */
function renderAccessRequests() {
    var list = document.getElementById('accessRequestList');
    var count = document.getElementById('accessRequestsCount');
    if (!list) return;

    if (!(window.BioSync && typeof window.BioSync.loadAccessRequests === 'function')) {
        list.innerHTML = '<p class="access-request-empty">Access requests need a connection.</p>';
        if (count) count.textContent = '';
        return;
    }

    window.BioSync.loadAccessRequests().then(function(res) {
        if (res && res.error) throw res.error;
        var rows = (res && res.data) || [];

        if (count) {
            count.textContent = rows.length
                ? (rows.length === 1 ? '1 request' : rows.length + ' requests')
                : '';
        }

        if (rows.length === 0) {
            list.innerHTML = '<p class="access-request-empty">No requests yet. ' +
                'People who create an account from the sign-in page appear here.</p>';
            return;
        }

        list.innerHTML = rows.map(function(r) {
            var when = (r.requested_at || '').split('T')[0];
            return '<div class="access-request-item">' +
                '<span class="access-request-name">' + escapeHtml(r.full_name || 'Unnamed') + '</span>' +
                '<span class="access-request-meta">' + escapeHtml(r.email || '') +
                    (r.institution ? ' · ' + escapeHtml(r.institution) : '') +
                    (when ? ' · ' + escapeHtml(when) : '') +
                '</span>' +
            '</div>';
        }).join('');
    }).catch(function(err) {
        console.warn('Could not load access requests:', err && err.message);
        list.innerHTML = '<p class="access-request-empty">Could not load access requests.</p>';
        if (count) count.textContent = '';
    });
}

/* Status and deletion confirmation */

var pendingStatusChange = null;
var pendingDelete = null;

/**
 * Replaces window.confirm(), which blocks the page and has no room to explain
 * that deactivation, unlike delete, is reversible.
 */
function openStatusConfirm(id, name, isActive) {
    pendingStatusChange = { id: id, name: name, isActive: isActive };

    var card = document.getElementById('confirmStatusCard');
    var icon = document.getElementById('confirmStatusIcon');
    var title = document.getElementById('confirmStatusTitle');
    var lead = document.getElementById('confirmStatusSubtitle');
    var note = document.getElementById('confirmStatusNote');
    var accept = document.getElementById('acceptConfirmStatusBtn');

    if (title) title.textContent = isActive ? 'Deactivate account' : 'Reactivate account';
    if (lead) {
        lead.textContent = 'You\u2019re about to ' +
            (isActive ? 'deactivate' : 'reactivate') +
            ' \u201C' + (name || 'this account') + '\u201D.';
    }
    if (note) {
        note.textContent = isActive
            ? 'They will no longer be able to sign in. Their observations and ' +
              'review history are kept, and this can be undone at any time.'
            : 'They will be able to sign in again with their existing password.';
    }
    if (accept) {
        accept.textContent = isActive ? 'Yes, deactivate' : 'Yes, reactivate';
        // Reactivating restores access, so it is not dressed as destructive.
        accept.className = 'btn ' + (isActive ? 'btn--danger' : 'btn--primary');
    }

    // The delete dialog's warning triangle means "this destroys something";
    // reusing it here would overstate what either of these does.
    if (icon) icon.setAttribute('href', isActive ? '#i-person_off' : '#i-how_to_reg');
    if (card) card.classList.toggle('is-positive', !isActive);

    ModalManager.open('confirmStatusModal');
}

function closeStatusConfirm() {
    pendingStatusChange = null;
    ModalManager.closeById('confirmStatusModal');
}

function applyStatusChange() {
    var pending = pendingStatusChange;
    if (!pending) return;

    closeStatusConfirm();

    if (!(window.BioSync && typeof window.BioSync.adminUsers === 'function' && window.BioSync.getAdminUsersUrl())) {
        userToast('Changing account status needs the admin-users function. It is not available.', 'error');
        return;
    }

    window.BioSync.adminUsers(pending.isActive ? 'deactivate' : 'reactivate', { id: pending.id })
        .then(function() {
            return window.BioSync.loadFromCloud();
        })
        .then(function() {
            renderTable();
            userToast(pending.name + (pending.isActive ? ' deactivated.' : ' reactivated.'), 'success');
        })
        .catch(function(err) {
            userToast(friendlyUserError(err, pending.isActive ? 'deactivate' : 'reactivate'), 'error');
        });
}

/* Delete confirmation */

/**
 * window.confirm() printed the raw UUID and had no room to warn that deletion,
 * unlike deactivation, cannot be undone.
 */
function openDeleteConfirm(id, name) {
    pendingDelete = { id: id, name: name };

    var lead = document.getElementById('confirmDeleteLead');
    var detail = document.getElementById('confirmDeleteDetail');

    // textContent, not innerHTML: a display name is user-supplied data.
    if (lead) {
        lead.textContent = 'You\u2019re about to delete \u201C' +
            (name || 'this account') + '\u201D.';
    }
    if (detail) {
        detail.textContent = 'The account and its sign-in details are removed ' +
            'permanently. Their field observations are kept in the dataset, but ' +
            'are no longer linked to an account.';
    }

    ModalManager.open('confirmDeleteModal');
}

function closeDeleteConfirm() {
    pendingDelete = null;
    ModalManager.closeById('confirmDeleteModal');
}

function applyDelete() {
    var pending = pendingDelete;
    if (!pending) return;

    closeDeleteConfirm();

    if (!(window.BioSync && typeof window.BioSync.adminUsers === 'function' && window.BioSync.getAdminUsersUrl())) {
        userToast('Deleting an account needs the admin-users function. It is not available.', 'error');
        return;
    }

    window.BioSync.adminUsers('delete', { id: pending.id })
        .then(function() {
            // loadFromCloud merges rather than replaces, so without this the
            // deleted row lingers in the table.
            window.BioData.deleteUser(String(pending.id));
            return window.BioSync.loadFromCloud();
        })
        .then(function() {
            renderTable();
            userToast(pending.name + ' deleted. Their observations were kept.', 'success');
        })
        .catch(function(err) {
            userToast(friendlyUserError(err, 'delete'), 'error');
        });
}

// Re-render after the Supabase sync layer seeds cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    renderTable();
  });
  document.addEventListener('DOMContentLoaded', function() {
    var toggle = document.getElementById('accessRequestsToggle');
    var section = document.getElementById('accessRequestsSection');
    if (toggle && section) {
      toggle.addEventListener('click', function() {
        var open = section.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) renderAccessRequests();
      });
    }

    // No close button: Cancel and Escape are the exits, as on the other dialogs.
    var acceptStatus = document.getElementById('acceptConfirmStatusBtn');
    if (acceptStatus) acceptStatus.addEventListener('click', applyStatusChange);
    var cancelStatus = document.getElementById('cancelConfirmStatusBtn');
    if (cancelStatus) cancelStatus.addEventListener('click', closeStatusConfirm);

    // No close button: a destructive action wants Cancel or Escape as the exits.
    var acceptDelete = document.getElementById('acceptConfirmDeleteBtn');
    if (acceptDelete) acceptDelete.addEventListener('click', applyDelete);
    var cancelDelete = document.getElementById('cancelConfirmDeleteBtn');
    if (cancelDelete) cancelDelete.addEventListener('click', closeDeleteConfirm);
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

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAddUserModal();
            closeEditUserModal();
        }
    });
});