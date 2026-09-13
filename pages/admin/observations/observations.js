/**
 * ZitBio — Observations Page Logic
 * Reads from unified BioData layer via shared observationsRenderer.
 * Handles table rendering, pagination, search, and modal interactions.
 * Uses the same renderer as the Analytics tab to ensure visual consistency
 * between the two views.
 */

// View-model state for the observations page — tracks pagination,
// the currently filtered dataset, and the observation being viewed/edited.
var obsCurrentPage = 1;
var obsFilteredData = [];
var obsRecordsPerPage = 8;
var currentObsId = null; // Tracks the currently viewed observation ID
var obsStatusFilter = ''; // '' = all; otherwise a verification_status value (#70)

// Get filtered data from unified data layer using shared search
function getObsFilteredData() {
    if (!window.BioData) return [];
    var searchInput = document.getElementById('searchInput');
    var rows;

    if (!searchInput) {
        rows = window.BioData.getObservations().slice();
    } else {
        var selectedField = document.querySelector('input[name="obsSearchField"]:checked');
        var field = selectedField ? selectedField.value : '';
        rows = window.BioData.searchObservations(searchInput.value, field || undefined);
    }

    // Status filter (#70). Applied after search so the two compose: the queue's
    // primary question is "what is awaiting review?". A record with no status is
    // treated as Pending, matching how its badge renders.
    if (obsStatusFilter) {
        rows = rows.filter(function(o) {
            return (o.verification_status || 'Pending') === obsStatusFilter;
        });
    }

    return rows;
}

/* ───── REVIEW-QUEUE STATUS FILTER (#70) ───── */

/**
 * Set the queue's status filter, then sync the URL and the table. The URL
 * matters: "the records awaiting review" becomes a shareable link, and the
 * Dashboard's Pending KPI can point straight at it.
 *
 * The filter control lives in the column header and its active state is part of
 * the header markup, so re-rendering is what refreshes the control — there is no
 * separate chip list to keep in step.
 */
function applyStatusFilter(status) {
    obsStatusFilter = status || '';
    obsCurrentPage = 1;
    syncStatusFilterToUrl();
    renderObsTable();
}

/** Keep ?status= (and any existing ?obs=) in the address bar without a reload. */
function syncStatusFilterToUrl() {
    if (!window.history || !window.history.replaceState) return;
    var params = [];
    if (obsStatusFilter) params.push('status=' + encodeURIComponent(obsStatusFilter));
    var obsParam = getObsParam();
    if (obsParam) params.push('obs=' + encodeURIComponent(obsParam));
    window.history.replaceState(null, '', window.location.pathname +
        (params.length ? '?' + params.join('&') : ''));
}

/** Read ?status= with a manual fallback (URLSearchParams is ES2017). */
function readStatusFilterFromUrl() {
    var found = '';
    if (typeof URLSearchParams === 'function') {
        found = new URLSearchParams(window.location.search).get('status') || '';
    } else {
        var qs = window.location.search.replace(/^\?/, '').split('&');
        for (var i = 0; i < qs.length; i++) {
            var kv = qs[i].split('=');
            if (kv[0] === 'status' && kv.length > 1) found = decodeURIComponent(kv[1]);
        }
    }
    return found;
}

/**
 * Wire the status filter mounted on the "Verification Status" column header.
 *
 * Clicks are delegated from the table because the <thead> is rebuilt on every
 * render (search, filter, paging) — binding the buttons directly would lose the
 * handlers on the first interaction.
 */
function initStatusFilter() {
    var table = document.querySelector('.page-observations .data-table');
    if (table) {
        table.addEventListener('click', function(e) {
            var target = e.target;
            while (target && target !== table) {
                if (target.getAttribute) {
                    if (target.getAttribute('data-filter-value') !== null) {
                        applyStatusFilter(target.getAttribute('data-filter-value'));
                        return;
                    }
                    if (target.classList && target.classList.contains('th-filter-btn')) {
                        toggleStatusFilterMenu(target);
                        return;
                    }
                }
                target = target.parentNode;
            }
        });
    }

    // Dismiss the menu on Escape or on a click anywhere outside it.
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeStatusFilterMenus();
    });
    document.addEventListener('click', function(e) {
        if (!isInsideStatusFilter(e.target)) closeStatusFilterMenus();
    });
    // The menu is fixed-positioned, so it must not be left floating once its
    // trigger moves. Capture phase catches scrolls in inner containers too.
    window.addEventListener('scroll', closeStatusFilterMenus, true);
    window.addEventListener('resize', closeStatusFilterMenus);

    // Honour a deep link (?status=Pending) on load.
    var initial = readStatusFilterFromUrl();
    if (initial) {
        applyStatusFilter(initial);
    } else {
        syncStatusFilterToUrl();
    }
}

/** Open the filter menu on `btn`, or close it if it is already open. */
function toggleStatusFilterMenu(btn) {
    var menu = btn.parentNode ? btn.parentNode.querySelector('.th-filter-menu') : null;
    if (!menu) return;
    var willOpen = menu.hasAttribute('hidden');
    closeStatusFilterMenus();
    if (willOpen) {
        menu.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        positionStatusFilterMenu(btn, menu);
    }
}

/**
 * Anchor the open menu under its trigger.
 *
 * The menu is position:fixed because the table's container scrolls
 * horizontally, which clips vertically as well — an absolutely positioned menu
 * would be cut off by it. Fixed positioning is measured against the viewport, so
 * it also has to be recomputed on scroll; closeStatusFilterMenus() is bound to
 * scroll/resize for exactly that reason.
 */
function positionStatusFilterMenu(btn, menu) {
    var r = btn.getBoundingClientRect();
    menu.style.left = Math.round(r.left) + 'px';
    menu.style.top = Math.round(r.bottom + 6) + 'px';
}

function closeStatusFilterMenus() {
    var menus = document.querySelectorAll('.th-filter-menu');
    Array.prototype.forEach.call(menus, function(m) { m.setAttribute('hidden', ''); });
    var btns = document.querySelectorAll('.th-filter-btn');
    Array.prototype.forEach.call(btns, function(b) { b.setAttribute('aria-expanded', 'false'); });
}

/** Walk up from a node looking for the filter wrapper (avoids closest(), ES5 style). */
function isInsideStatusFilter(node) {
    while (node && node.classList) {
        if (node.classList.contains('th-filter')) return true;
        node = node.parentNode;
    }
    return false;
}

/* ───── EXPORT THE FILTERED DATASET (#69) ───── */

/**
 * Export exactly what the admin is looking at — the filtered and searched queue,
 * not the whole table. Uses the shared CSV module (lib/csv.js) so escaping and
 * download behaviour match the analytics report export.
 */
function handleExportObservations() {
    if (!(window.BioCsv && window.BioCsv.buildCsv)) {
        console.warn('Export unavailable: lib/csv.js did not load.');
        return;
    }

    var rows = getObsFilteredData();
    if (rows.length === 0) {
        setExportFeedback('Nothing to export for the current filters.');
        return;
    }

    var columns = [
        { label: 'observation_id', key: 'observation_id' },
        { label: 'common_name', get: function(o) { return (o.species_details || {}).common_name; } },
        { label: 'scientific_name', get: function(o) { return (o.species_details || {}).scientific_name; } },
        { label: 'count', key: 'count' },
        { label: 'verification_status', key: 'verification_status' },
        { label: 'source', key: 'source' },
        { label: 'focus_area', get: function(o) { return (o.location || {}).focus_area; } },
        { label: 'habitat_type', get: function(o) { return (o.location || {}).habitat_type; } },
        { label: 'latitude', get: function(o) { return (o.location || {}).latitude; } },
        { label: 'longitude', get: function(o) { return (o.location || {}).longitude; } },
        { label: 'locality_description', get: function(o) { return (o.location || {}).locality_description; } },
        { label: 'recorded_by', key: 'recorded_by' },
        { label: 'institution_name', key: 'institution_name' },
        { label: 'timestamp', key: 'timestamp' },
        { label: 'field_notes', key: 'field_notes' }
    ];

    var csv = window.BioCsv.buildCsv(rows, columns);
    var parts = ['observations'];
    if (obsStatusFilter) parts.push(obsStatusFilter.toLowerCase());
    parts.push(new Date().toISOString().slice(0, 10));
    window.BioCsv.downloadCsv(csv, parts.join('-') + '.csv');

    setExportFeedback('Exported ' + rows.length + ' record' + (rows.length === 1 ? '' : 's') + '.');
}

/**
 * Brief confirmation beside the queue. A download gives no other feedback, so a
 * silent success is indistinguishable from a dead button — which is exactly how
 * #69 went unnoticed.
 */
function setExportFeedback(message) {
    var el = document.getElementById('exportFeedback');
    if (!el) {
        var anchor = document.querySelector('.page-observations .controls-row');
        if (!anchor || !anchor.parentNode) return;
        el = document.createElement('span');
        el.id = 'exportFeedback';
        el.className = 'export-feedback';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
    el.textContent = message;
    window.setTimeout(function() { el.textContent = ''; }, 4000);
}

// Render the table using shared renderer
// Column definitions for the Admin Observations table (7 columns + Actions)
function getObsColumns() {
    return [
        {
            label: 'Species',
            cellClass: 'species-cell',
            render: function(obs) {
                var sd = obs.species_details || {};
                return '<span class="species-common">' + escapeHtmlObs(sd.common_name || sd.scientific_name) + '</span>' +
                    '<span class="species-scientific">' + escapeHtmlObs(sd.scientific_name) + '</span>';
            }
        },
        {
            label: 'Count',
            cellClass: 'count-cell',
            render: function(obs) {
                return obs.count || 0;
            }
        },
        {
            label: 'Location',
            cellClass: 'location-cell',
            render: function(obs) {
                var loc = obs.location || {};
                var locationDisplay = loc.city || '';
                if (loc.administrative_area) {
                    locationDisplay += (locationDisplay ? ', ' : '') + loc.administrative_area;
                }
                if (loc.country && !locationDisplay) {
                    locationDisplay = loc.country;
                }
                return escapeHtmlObs(locationDisplay || '—');
            }
        },
        {
            label: 'Date',
            cellClass: 'date-cell',
            render: function(obs) {
                var dateStr = obs.timestamp ? obs.timestamp.split('T')[0] : null;
                return formatObsDate(dateStr);
            }
        },
        {
            label: 'Recorded By',
            cellClass: 'recorded-by-cell',
            render: function(obs) {
                return escapeHtmlObs(obs.recorded_by);
            }
        },
        {
            label: 'Verification Status',
            // The queue's primary question is "what is awaiting review?", so the
            // filter sits on the column it filters rather than in a separate bar
            // (#70). "Rejected" was retired — see the note on submitReview.
            filter: {
                ariaLabel: 'Filter the review queue by verification status',
                active: obsStatusFilter,
                options: [
                    { value: '', label: 'All statuses' },
                    { value: 'Pending', label: 'Pending' },
                    { value: 'Approved', label: 'Approved' },
                    { value: 'Flagged', label: 'Flagged' }
                ]
            },
            render: function(obs) {
                var status = obs.verification_status || 'Pending';
                var statusClass = 'status-' + status.toLowerCase();
                return '<span class="status-badge ' + statusClass + '">' + escapeHtmlObs(status) + '</span>';
            }
        }
    ];
}

function renderObsTable() {
    if (!window.BioData) return;

    obsFilteredData = getObsFilteredData();
    var totalPages = Math.ceil(obsFilteredData.length / obsRecordsPerPage);

    if (obsCurrentPage > totalPages) obsCurrentPage = totalPages || 1;

    var result = renderObservationsTable({
        data: obsFilteredData,
        page: obsCurrentPage,
        perPage: obsRecordsPerPage,
        tableSelector: '.page-observations .data-table',
        paginationSelector: '.page-observations .observations-pagination',
        paginationStyle: 'bar',
        columns: getObsColumns(),
        rowActions: [
            {
                label: 'View',
                class: 'btn-view btnViewRecord',
                attrName: 'data-id',
                attrValue: function(obs) { return obs.observation_id; }
            }
        ],
        onPageChange: function(page) {
            obsCurrentPage = page;
            renderObsTable();
        }
    });

    // Attach event listeners to View buttons
    var viewButtons = document.querySelectorAll('.page-observations .btnViewRecord');
    viewButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var id = this.getAttribute('data-id');
            viewRecordById(id);
        });
    });
}

// Handle search input
function handleObsSearch() {
    obsCurrentPage = 1;
    renderObsTable();
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
    // Load the append-only decision log for this record (issue #73). Done here
    // rather than at the call sites, so every path that opens the modal — row
    // click, ?obs= deep link, notification — shows the history.
    renderReviewHistory(id);
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
    document.getElementById('fldDate').textContent = formatObsDate(dateStr);
    document.getElementById('fldTime').textContent = formatTimeStr(obs.timestamp);

    // Location fields
    document.getElementById('fldCountry').textContent = loc.country || '—';
    document.getElementById('fldProvince').textContent = loc.administrative_area || '—';
    document.getElementById('fldCity').textContent = loc.city || '—';
    document.getElementById('fldHabitat').textContent = loc.habitat_type || '—';
    document.getElementById('fldProtectedArea').textContent = loc.focus_area || 'None';
    document.getElementById('fldGps').textContent = formatCoords(loc.latitude, loc.longitude);

    // Record Details (collapsible)
    document.getElementById('fldLocality').textContent = loc.locality_description || 'Not recorded';
    document.getElementById('fldFieldNotes').textContent = obs.field_notes || 'Not recorded';
    document.getElementById('fldRecordedBy').textContent = obs.recorded_by || '—';
    document.getElementById('fldInstitution').textContent = obs.institution_name || '—';
    
    // Format observation ID nicely
    var displayId = obs.observation_id ? obs.observation_id.replace('obs_', 'OBS-') : '—';
    document.getElementById('fldRecordId').textContent = displayId;
    // GBIF-imported records show "Imported" rather than "Active".
    document.getElementById('fldRecordStatus').textContent = (obs.source === 'gbif') ? 'Imported' : 'Active';

    // Cancel any active edit mode, and any half-made decision, so reopening a
    // record never inherits the previous one's in-progress state.
    cancelEdit();
    cancelReviewDecision();

    // Store current observation ID for actions
    document.getElementById('viewModal').setAttribute('data-obs-id', obs.observation_id);
    document.getElementById('viewModal').classList.add('active');
}

// Close view modal
function closeViewModal() {
    cancelEdit();
    cancelReviewDecision();
    document.getElementById('viewModal').classList.remove('active');
    currentObsId = null;
}

// Toggle collapsible section
function toggleSection(id) {
    var el = document.getElementById(id);
    if (el) el.classList.toggle('open');
}

// ───── APPROVE / FLAG ACTIONS ─────
// These update the verification_status in the data layer, which immediately
// refreshes the table and sends a notification to the admin sidebar.
// Approve = verified as accurate; Flag = suspected issue (e.g., wrong species ID).

function handleApprove() {
    // Approving needs no reason, so any half-started flag is abandoned rather
    // than silently attached to the approval.
    cancelReviewDecision();
    submitReview('Approved', null);
}

/**
 * Send a review decision through the audited path (issue #73).
 *
 * This goes through the `review_observation` RPC rather than patching
 * `verification_status` directly: an AFTER trigger writes the decision to
 * `observation_reviews`, and it can only record the reason if the reason is in
 * the same transaction as the status change. A direct column update would change
 * the status and leave the audit trail empty.
 *
 * The local store is updated first so the UI responds immediately, and the cloud
 * write stays non-fatal — matching the previous behaviour.
 *
 * "Rejected" was retired on review: it duplicated "Flagged" as a second negative
 * state, had zero rows in production, and "Flagged" is the incumbent — it predates
 * this work, carries the existing data, and is already the status the Analytics
 * map filters by. One negative state, not two.
 */
function submitReview(toStatus, reason) {
    if (!window.BioData || !currentObsId) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    if (!obsId) return;

    // Capture the pre-decision status so a failed write can be undone. Without
    // this, the optimistic update below would leave the table asserting a
    // decision the server never accepted — the frontend and the database
    // disagreeing while the admin is told nothing.
    var badgeEl = document.getElementById('modalStatusBadge');
    var previousStatus = badgeEl && badgeEl.textContent ? badgeEl.textContent.trim() : 'Pending';

    var species = reviewSpeciesLabel();

    window.BioData.updateObservation(obsId, { verification_status: toStatus });
    setBadge(toStatus);
    renderObsTable();
    clearReviewNote();

    if (!(window.BioSync && window.BioSync.reviewObservation)) {
        // Local-only mode: say so plainly rather than implying it was recorded.
        reviewToast(reviewOfflineMessage(toStatus, species, reason), 'warning');
        closeViewModal();
        return;
    }

    window.BioSync.reviewObservation(obsId, toStatus, reason).then(function(res) {
        if (res && res.error) throw res.error;
        // Refresh before closing so the count is correct if the record is
        // reopened (renderReviewHistory guards on currentObsId, so it is also
        // safe to call just before the modal goes away).
        renderReviewHistory(obsId);
        closeViewModal();
        reviewToast(reviewSavedMessage(toStatus, species, reason), 'success');
    }).catch(function(err) {
        // The decision never reached the server, so undo it rather than leaving
        // the UI asserting a decision that is absent from the audit log. The
        // modal deliberately stays open, so the admin can retry in place.
        window.BioData.updateObservation(obsId, { verification_status: previousStatus });
        setBadge(previousStatus);
        renderObsTable();
        reviewToast('Could not ' + reviewVerbInfinitive(toStatus) + ' ' + species + ' — ' +
            ((err && err.message) || 'unknown error') + '. Nothing was recorded.', 'error');
    });
}

/* ───── REVIEW OUTCOME REPORTING ───── */

/**
 * Report the outcome of a decision as a colour-coded toast rather than as a line
 * of text inside the modal.
 *
 * The confirmation has to outlive the modal it describes, and small grey text
 * inside a dialog is easy to miss — which is how "Saved and logged.", "Saved
 * locally only" and "NOT saved" ended up as three differently-worded messages
 * buried in the same slot.
 *
 * Falls back to the console if the toast module did not load, so an outcome is
 * never silently swallowed.
 */
function reviewToast(message, type) {
    if (window.BioToast && typeof window.BioToast.show === 'function') {
        window.BioToast.show(message, type);
        return;
    }
    console.warn('Review: ' + message);
}

/**
 * Confirmation wording for a decision that reached the server.
 *   Approved -> "Impala has been Approved and saved."
 *   Flagged  -> "Impala Flagged, wrong species identification."
 * The reason is part of the flagged message on purpose: the decision is only
 * meaningful with it, and it is the one thing the admin typed.
 */
function reviewSavedMessage(toStatus, species, reason) {
    if (toStatus === 'Flagged') {
        return reason ? (species + ' Flagged, ' + reason + '.') : (species + ' Flagged.');
    }
    return species + ' has been ' + toStatus + ' and saved.';
}

/**
 * Same information for the local-only path, but honest about persistence — the
 * word "saved" on its own would imply it reached the server.
 */
function reviewOfflineMessage(toStatus, species, reason) {
    if (toStatus === 'Flagged') {
        return species + ' Flagged, ' + reason +
            ' — on this device only, the server was not reached.';
    }
    return species + ' has been ' + toStatus +
        ' on this device only — the server was not reached.';
}
/**
 * Infinitive verb, for the failure message. "Could not approve Zebra" reads
 * correctly where the past tense used for confirmations would not.
 */
function reviewVerbInfinitive(toStatus) {
    if (toStatus === 'Approved') return 'approve';
    if (toStatus === 'Flagged') return 'flag';
    return 'save';
}

/** The species name shown in the modal title, for use in messages. */
function reviewSpeciesLabel() {
    var el = document.getElementById('modalSpeciesTitle');
    var name = el && el.textContent ? el.textContent.trim() : '';
    return name || 'The record';
}

/** The reason typed into the modal's review note field, trimmed. */
function reviewNoteValue() {
    var input = document.getElementById('reviewNoteInput');
    return input && input.value ? input.value.trim() : '';
}

function clearReviewNote() {
    var input = document.getElementById('reviewNoteInput');
    if (!input) return;
    input.value = '';
    input.classList.remove('review-note-input-error');
    input.removeAttribute('aria-invalid');
}

/**
 * Flag is a decision *about* the record, so it needs a reason. Rather than a
 * native dialog (already logged as debt under #52), the field is marked invalid
 * and focused so the correction is obvious in place.
 */
function requireReviewNote() {
    var reason = reviewNoteValue();
    if (reason) return reason;
    var input = document.getElementById('reviewNoteInput');
    if (input) {
        input.classList.add('review-note-input-error');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
    }
    // The field is marked in place as well as announced: the red border says
    // where, the toast says why.
    reviewToast('A reason is required to flag a record.', 'warning');
    return null;
}

/* ───── REVIEW DECISION PANEL (#80) ───── */

/** Status awaiting a reason while the decision panel is open. */
var pendingReviewStatus = null;

/**
 * Flag opens the reason panel instead of demanding a reason up front.
 *
 * The old flow had it backwards: the note field was always on screen, so the
 * admin had to type a reason *before* finding the button, and an editable input
 * sat permanently inside what is otherwise a read-only record view.
 */
function handleFlag() {
    openReviewDecision('Flagged');
}

function openReviewDecision(toStatus) {
    var panel = document.getElementById('reviewDecision');
    if (!panel) return;

    pendingReviewStatus = toStatus;

    var isFlag = toStatus === 'Flagged';
    var label = document.getElementById('reviewDecisionLabel');
    if (label) label.textContent = isFlag ? 'Reason for flagging' : 'Reason';

    var confirmBtn = document.getElementById('btnConfirmReview');
    if (confirmBtn) confirmBtn.textContent = isFlag ? 'Confirm flag' : 'Confirm';

    var input = document.getElementById('reviewNoteInput');
    if (input) {
        input.value = '';
        input.classList.remove('review-note-input-error');
        input.removeAttribute('aria-invalid');
    }

    panel.removeAttribute('hidden');
    if (input) input.focus();
}

/** Abandon an in-progress decision and return the modal to its read state. */
function cancelReviewDecision() {
    var panel = document.getElementById('reviewDecision');
    if (panel) panel.setAttribute('hidden', '');
    pendingReviewStatus = null;

    var input = document.getElementById('reviewNoteInput');
    if (input) {
        input.value = '';
        input.classList.remove('review-note-input-error');
        input.removeAttribute('aria-invalid');
    }
}

/** Commit the pending decision. The reason is required, validated here. */
function confirmReviewDecision() {
    var reason = requireReviewNote();
    if (!reason) return;

    var status = pendingReviewStatus || 'Flagged';
    var panel = document.getElementById('reviewDecision');
    if (panel) panel.setAttribute('hidden', '');
    pendingReviewStatus = null;

    submitReview(status, reason);
}

/** Decision count shown beside the collapsed Review history heading. */
function setReviewHistoryCount(count) {
    var el = document.getElementById('reviewHistoryCount');
    if (!el) return;
    el.textContent = (count > 0)
        ? (count === 1 ? '1 decision' : count + ' decisions')
        : '';
}

// ───── EDIT MODE ─────

var isEditing = false;

function enableEditMode() {
    if (isEditing) return;
    isEditing = true;

    // Replace Edit button with Save + Cancel
    var editBtn = document.getElementById('btnEditRecord');
    editBtn.innerHTML = '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-check"/></svg>';
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
        cancelBtn.innerHTML = '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-close"/></svg>';
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
    editBtn.innerHTML = '<svg class="material-symbols-outlined" aria-hidden="true"><use href="#i-edit"/></svg>';
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
        { id: 'fldHabitat', type: 'select', value: loc.habitat_type || '', options: getHabitatOptions() },
        { id: 'fldProtectedArea', type: 'text', value: loc.focus_area || '' },
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

    // Habitat auto-select: keep habitat in sync with the focus area while
    // editing (2-option app-wide system). Only runs when enabling edit mode.
    if (enable) {
        var focusEditEl = document.getElementById('fldProtectedArea-edit');
        var habitatEditEl = document.getElementById('fldHabitat-edit');
        if (focusEditEl && habitatEditEl && window.BioData && window.BioData.getHabitatForFocusArea) {
            var syncHabitatFromFocus = function() {
                if (focusEditEl.value) {
                    habitatEditEl.value = window.BioData.getHabitatForFocusArea(focusEditEl.value);
                }
            };
            focusEditEl.addEventListener('input', syncHabitatFromFocus);
            syncHabitatFromFocus();
        }
    }
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
    return ['', 'Copperbelt Province'];
}

// Habitat options — the two canonical app-wide habitats (leading '' is the
// placeholder for the select). Falls back to literals if BioData is missing.
function getHabitatOptions() {
    var types = (window.BioData && window.BioData.HABITAT_TYPES) ||
        ['Miombo Woodland', 'Urban'];
    return [''].concat(types);
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
    var focusArea = getEditValue('fldProtectedArea');
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
            focus_area: focusArea,
            locality_description: locality
        }
    };

    window.BioData.updateObservation(obsId, updates);

    // Write-through edit to Supabase (non-fatal on failure — local cache updated).
    if (window.BioSync && window.BioSync.updateObservation) {
      window.BioSync.updateObservation(obsId, updates).catch(function(err) {
        console.warn('BioSync: failed to save observation edit in Supabase:', err && err.message);
      });
    }

    // Exit edit mode and refresh the view
    cancelEdit();
    viewRecordById(obsId);
    renderObsTable();
}

function parseCoords(str) {
    // Support both human-readable (DMS-like) and decimal formats to accommodate
    // data imported from legacy GPS handhelds vs. modern browser APIs.
    // Handles formats: "15.6000°S, 29.4000°E", "-15.6, 29.4", "15.6°S, 29.4°E"
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

// Archive (not destroy) an observation. It is soft-deleted via `deleted_at` so
// it can be restored from the Archived view — a mis-click used to be
// unrecoverable (issue #74). The wording now matches what actually happens.
function handleDelete() {
    if (!window.BioData) return;
    var obsId = document.getElementById('viewModal').getAttribute('data-obs-id');
    var speciesName = document.getElementById('modalSpeciesTitle').textContent;
    if (!obsId) return;
    if (confirm('Archive the observation for ' + speciesName + '?\n\nIt will leave this list and can be restored from the Archived view.')) {
        window.BioData.deleteObservation(obsId);
        // Write-through archive to Supabase (non-fatal on failure).
        if (window.BioSync && window.BioSync.deleteObservation) {
            window.BioSync.deleteObservation(obsId).catch(function(err) {
                console.warn('BioSync: failed to archive observation in Supabase:', err && err.message);
            });
        }
        closeViewModal();
        renderObsTable();
    }
}

/**
 * Render the append-only review log for a record (issue #73).
 *
 * Read-only by design: `observation_reviews` has no INSERT/UPDATE/DELETE policy,
 * so the UI cannot fabricate or rewrite history. Field officers can read the
 * decisions on their own submissions through the RLS policy on that table.
 */
function renderReviewHistory(obsId) {
    var list = document.getElementById('reviewHistoryList');
    if (!list) return;
    list.innerHTML = '<p class="review-history-empty">Loading…</p>';
    setReviewHistoryCount(0);

    if (!(window.BioSync && window.BioSync.getObservationReviews)) {
        list.innerHTML = '<p class="review-history-empty">History needs a connection.</p>';
        return;
    }

    window.BioSync.getObservationReviews(obsId).then(function(res) {
        // A late response for a record the admin has already navigated away from
        // must not overwrite the panel for the current one.
        if (currentObsId !== obsId) return;
        if (res && res.error) throw res.error;
        var rows = (res && res.data) || [];
        if (rows.length === 0) {
            list.innerHTML = '<p class="review-history-empty">No decisions recorded yet.</p>';
            setReviewHistoryCount(0);
            return;
        }
        setReviewHistoryCount(rows.length);
        list.innerHTML = rows.map(function(r) {
            var reason = r.reason
                ? escapeHtmlObs(r.reason)
                : '<em>No reason given</em>';
            var when = (r.created_at || '').split('T')[0];
            return '<div class="review-history-item">' +
                '<div class="review-history-head">' +
                    '<span class="review-history-actor">' + escapeHtmlObs(r.actor_name || 'System') + '</span>' +
                    '<span class="review-history-when">' + escapeHtmlObs(formatObsDate(when)) + '</span>' +
                '</div>' +
                '<div class="review-history-transition">' +
                    escapeHtmlObs(r.from_status || '—') + ' → ' + escapeHtmlObs(r.to_status || '—') +
                '</div>' +
                '<div class="review-history-reason">' + reason + '</div>' +
            '</div>';
        }).join('');
    }).catch(function(err) {
        console.warn('Could not load review history:', err && err.message);
        list.innerHTML = '<p class="review-history-empty">History could not be loaded.</p>';
    });
}

/* ───── ARCHIVED RECORDS (issue #74) ───── */

function openArchivedModal() {
    var modal = document.getElementById('archivedModal');
    var list = document.getElementById('archivedList');
    if (!modal || !list) return;
    modal.classList.add('active');
    list.innerHTML = '<p class="archived-empty">Loading…</p>';

    if (!(window.BioSync && window.BioSync.loadArchivedObservations)) {
        list.innerHTML = '<p class="archived-empty">Archived records need a connection.</p>';
        return;
    }

    window.BioSync.loadArchivedObservations().then(function(res) {
        if (res && res.error) throw res.error;
        var rows = (res && res.data) || [];
        if (rows.length === 0) {
            // Say what archiving is, not just that the list is empty — "Nothing
            // archived." alone reads as a dead end with no explanation of why
            // the button exists.
            list.innerHTML = '<p class="archived-empty">Nothing archived yet.</p>' +
                '<p class="archived-hint">Archiving a record removes it from the ' +
                'observations list without destroying it. Archived records are kept ' +
                'here and can be restored at any time.</p>';
            return;
        }
        list.innerHTML = rows.map(function(r) {
            var name = r.common_name || r.scientific_name || 'Unknown species';
            var when = (r.deleted_at || '').split('T')[0];
            return '<div class="archived-item">' +
                '<div class="archived-item-meta">' +
                    '<span class="archived-item-title">' + escapeHtmlObs(name) + '</span>' +
                    '<span class="archived-item-sub">' + escapeHtmlObs(r.observation_id || '') +
                        ' · ' + escapeHtmlObs(r.focus_area || '—') +
                        ' · archived ' + escapeHtmlObs(when) + '</span>' +
                '</div>' +
                '<button class="btn-export" data-restore-id="' + escapeHtmlObs(r.observation_id || '') + '">Restore</button>' +
            '</div>';
        }).join('');
    }).catch(function(err) {
        console.warn('Could not load archived records:', err && err.message);
        list.innerHTML = '<p class="archived-empty">Archived records could not be loaded.</p>';
    });
}

function closeArchivedModal() {
    var modal = document.getElementById('archivedModal');
    if (modal) modal.classList.remove('active');
}

function restoreArchivedRecord(obsId) {
    if (!obsId) return;
    if (!(window.BioSync && window.BioSync.restoreObservation)) return;
    window.BioSync.restoreObservation(obsId).then(function(res) {
        if (res && res.error) throw res.error;
        openArchivedModal();   // refresh the archived list
        // Re-hydrate so the restored row reappears in the main list.
        if (typeof window.BioSync.loadFromCloud === 'function') {
            window.BioSync.loadFromCloud();
        } else {
            window.location.reload();
        }
    }).catch(function(err) {
        console.warn('Restore failed:', err && err.message);
    });
}

// Parse the ?obs= query param with a manual fallback (URLSearchParams is
// ES2017 — absent on some older engines).
function getObsParam() {
    var obsParam = null;
    if (typeof URLSearchParams === 'function') {
        obsParam = new URLSearchParams(window.location.search).get('obs');
    } else {
        var qsPos = window.location.search.indexOf('?');
        if (qsPos !== -1) {
            var qs = window.location.search.slice(qsPos + 1).split('&');
            for (var qi = 0; qi < qs.length; qi++) {
                var kv = qs[qi].split('=');
                if (kv[0] === 'obs' && kv.length > 1) {
                    obsParam = decodeURIComponent(kv[1]);
                    break;
                }
            }
        }
    }
    return obsParam;
}

// Open the observation record modal for the given id, if it exists.
function openObservationById(obsId) {
    if (!obsId || !window.BioData) return;
    var deepObs = window.BioData.getObservationById(obsId);
    if (deepObs) {
        viewRecordById(obsId);
    }
}

// Open the record modal implied by the current URL's ?obs= param.
// Exposed globally so the notification handler can call it even when the
// page is already loaded (Issue: notification clicks on the active
// observations page must still open the modal, not just change the URL).
function openObservationDeepLink() {
    openObservationById(getObsParam());
}
window.openObservationDeepLink = openObservationDeepLink;

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

        // Deep-link: if the URL carries ?obs=..., open that observation's
        // record modal directly (Issue #25 — notifications navigate here
        // with the observation id). Runs on first page load; the same
        // function is called by the notification handler when the page is
        // already active.
        openObservationDeepLink();

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

        // Review decision panel (#80)
        var btnConfirmReview = document.getElementById('btnConfirmReview');
        if (btnConfirmReview) btnConfirmReview.addEventListener('click', confirmReviewDecision);

        var btnCancelReview = document.getElementById('btnCancelReview');
        if (btnCancelReview) btnCancelReview.addEventListener('click', cancelReviewDecision);

        var reviewInput = document.getElementById('reviewNoteInput');
        if (reviewInput) {
            reviewInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    confirmReviewDecision();
                } else if (e.key === 'Escape') {
                    // Stop the modal's own Escape handler from closing the whole
                    // dialog when the admin only meant to abandon the decision.
                    e.preventDefault();
                    e.stopPropagation();
                    cancelReviewDecision();
                }
            });
        }

        // Review history disclosure (#80). Bound here rather than with an inline
        // onclick, keeping JS out of the markup.
        var historyToggle = document.getElementById('reviewHistoryToggle');
        if (historyToggle) {
            historyToggle.addEventListener('click', function() {
                var section = document.getElementById('sectionHistory');
                if (!section) return;
                var open = section.classList.toggle('open');
                historyToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            });
        }

        // Archived records (issue #74). Restore buttons are rendered
        // dynamically, so their clicks are delegated from the list container.
        var btnArchived = document.getElementById('btnArchivedRecords');
        if (btnArchived) btnArchived.addEventListener('click', openArchivedModal);

        // Review-queue status filter (#70)
        initStatusFilter();

        // Export the filtered queue (#69)
        var btnExportObs = document.getElementById('btnExportObs');
        if (btnExportObs) btnExportObs.addEventListener('click', handleExportObservations);

        var closeArchivedBtn = document.getElementById('closeArchivedModalBtn');
        if (closeArchivedBtn) closeArchivedBtn.addEventListener('click', closeArchivedModal);

        var archivedList = document.getElementById('archivedList');
        if (archivedList) {
            archivedList.addEventListener('click', function(e) {
                var target = e.target;
                while (target && target !== archivedList) {
                    if (target.getAttribute && target.getAttribute('data-restore-id')) {
                        restoreArchivedRecord(target.getAttribute('data-restore-id'));
                        return;
                    }
                    target = target.parentNode;
                }
            });
        }

        // Delete button
        var btnDelete = document.getElementById('btnDeleteRecord');
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

// Re-render the table after the Supabase sync layer seeds cloud data.
if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    renderObsTable();
  });
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderObsTable, handleObsSearch, viewRecordById, closeViewModal, handleDelete, openAddModal, closeAddModal, toggleSection };
}
