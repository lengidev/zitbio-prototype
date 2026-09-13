/**
 * ZitBio — Shared Observations Table Renderer
 * A single, configuration-driven component that renders observation tables.
 * Each page defines its own column schema, pagination style, and row actions —
 * but uses the same rendering engine.
 *
 * Usage:
 *   renderObservationsTable({
 *       data: array,                    // full dataset
 *       page: 1,                        // current page number
 *       perPage: 10,                    // records per page
 *       tableSelector: '.observations-table',   // CSS selector for the <table>
 *       paginationSelector: '.observations-pagination', // CSS selector for pagination container
 *       paginationStyle: 'bar' | 'centered',  // pagination layout style
 *       emptyMessage: 'No matching observations found', // shown when no data
 *       columns: [                      // column definitions
 *           { label: 'Species', render: fn, cellClass: 'species-cell', toggleKey: null },
 *           ...
 *       ],
 *       rowActions: [                   // optional per-row action buttons
 *           { label: 'View', class: 'btn-view btnViewRecord', attrName: 'data-id', attrValue: fn }
 *       ]
 *   });
 *
 * Returns: { pageData, totalRecords, totalPages, startRecord, endRecord }
 */

function renderObservationsTable(options) {
    var data = options.data || [];
    var page = options.page || 1;
    var perPage = options.perPage || 10;
    var tableSelector = options.tableSelector || '.observations-table';
    var paginationSelector = options.paginationSelector || '.observations-pagination';
    var paginationStyle = options.paginationStyle || 'bar';
    var emptyMessage = options.emptyMessage || 'No matching observations found';
    var columns = options.columns || [];
    var rowActions = options.rowActions || [];
    var onPageChange = options.onPageChange || null;

    var totalRecords = data.length;
    var totalPages = Math.ceil(totalRecords / perPage);
    if (page > totalPages) page = totalPages || 1;

    var startIdx = (page - 1) * perPage;
    var endIdx = Math.min(startIdx + perPage, totalRecords);
    var pageData = data.slice(startIdx, endIdx);
    var startRecord = totalRecords === 0 ? 0 : startIdx + 1;
    var endRecord = endIdx;

    // --- Render <thead> ---
    var table = document.querySelector(tableSelector);
    if (!table) {
        console.warn('Table not found: ' + tableSelector);
        return { pageData: pageData, totalRecords: totalRecords, totalPages: totalPages, startRecord: startRecord, endRecord: endRecord };
    }

    var thead = table.querySelector('thead');
    if (thead) {
        thead.innerHTML = buildTableHead(columns, rowActions);
    }

    // --- Render <tbody> ---
    var tbody = table.querySelector('tbody');
    if (!tbody) {
        tbody = document.createElement('tbody');
        table.appendChild(tbody);
    }

    if (totalRecords === 0) {
        var colspan = columns.length + (rowActions.length > 0 ? 1 : 0);
        tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="no-results">' + emptyMessage + '</td></tr>';
        renderPagination(paginationSelector, paginationStyle, page, totalPages, startRecord, endRecord, totalRecords, onPageChange);
        return { pageData: pageData, totalRecords: totalRecords, totalPages: totalPages, startRecord: startRecord, endRecord: endRecord };
    }

    var rowsHtml = '';
    for (var i = 0; i < pageData.length; i++) {
        rowsHtml += buildTableRow(pageData[i], columns, rowActions);
    }
    tbody.innerHTML = rowsHtml;

    // --- Render Pagination ---
    renderPagination(paginationSelector, paginationStyle, page, totalPages, startRecord, endRecord, totalRecords, onPageChange);

    return { pageData: pageData, totalRecords: totalRecords, totalPages: totalPages, startRecord: startRecord, endRecord: endRecord };
}

// Build <thead> from column definitions, with optional Actions column.
// A column may declare a `filter`, which renders a dropdown trigger on that
// header so the control sits on the column it filters:
//   { ariaLabel, active, options: [{ value, label }] }
// The renderer only emits markup + `data-filter-value`; the page wires behaviour.
function buildTableHead(columns, rowActions) {
    var html = '<tr>';
    for (var i = 0; i < columns.length; i++) {
        var col = columns[i];
        var toggleClass = col.toggleKey ? ' class="col-toggle col-' + col.toggleKey + '"' : '';
        html += '<th' + toggleClass + '>' + buildTableHeadCell(col) + '</th>';
    }
    if (rowActions && rowActions.length > 0) {
        html += '<th>Actions</th>';
    }
    html += '</tr>';
    return html;
}

/**
 * Header cell content: the plain label, or a filter trigger plus its menu when
 * the column defines one. Kept separate so the common path stays a one-liner.
 */
function buildTableHeadCell(col) {
    var f = col.filter;
    if (!f) return col.label;

    var active = f.active || '';
    var html = '<div class="th-filter">' +
        '<button type="button" class="th-filter-btn' + (active ? ' is-filtered' : '') + '"' +
        ' aria-haspopup="listbox" aria-expanded="false"' +
        (f.ariaLabel ? ' aria-label="' + escapeHtmlObs(f.ariaLabel) + '"' : '') + '>' +
        '<span class="th-filter-label">' + col.label + '</span>' +
        '<svg class="material-symbols-outlined th-filter-caret" aria-hidden="true"><use href="#i-keyboard_arrow_down"/></svg>' +
        '</button>' +
        '<div class="th-filter-menu" role="listbox" hidden>';

    var options = f.options || [];
    for (var i = 0; i < options.length; i++) {
        var o = options[i];
        var isActive = (o.value || '') === active;
        html += '<button type="button" class="th-filter-option' + (isActive ? ' is-active' : '') + '"' +
            ' role="option" aria-selected="' + (isActive ? 'true' : 'false') + '"' +
            ' data-filter-value="' + escapeHtmlObs(o.value || '') + '">' + o.label + '</button>';
    }

    html += '</div></div>';
    return html;
}

// Build a single <tr> from column definitions and optional row actions
function buildTableRow(obs, columns, rowActions) {
    var html = '<tr class="observation-row">';

    for (var i = 0; i < columns.length; i++) {
        var col = columns[i];
        var classes = [];
        if (col.toggleKey) classes.push('col-toggle', 'col-' + col.toggleKey);
        if (col.cellClass) classes.push(col.cellClass);
        var classAttr = classes.length > 0 ? ' class="' + classes.join(' ') + '"' : '';
        html += '<td' + classAttr + '>' + col.render(obs) + '</td>';
    }

    // Row action buttons (e.g., View button in admin mode)
    if (rowActions.length > 0) {
        html += '<td class="actions-cell">';
        for (var a = 0; a < rowActions.length; a++) {
            var action = rowActions[a];
            var attrValue = typeof action.attrValue === 'function' ? action.attrValue(obs) : '';
            html += '<button class="' + action.class + '" ' + action.attrName + '="' + escapeHtmlObs(attrValue) + '">' + action.label + '</button>';
        }
        html += '</td>';
    }

    html += '</tr>';
    return html;
}

// Escapes HTML entities to prevent XSS injection from user-supplied
// observation data rendered in tables (species names, notes, etc.).
// Delegates to lib/escape.js — the single escaping implementation. This
// function previously escaped nothing (four self-replacements), so callers
// looked protected while every value passed through unchanged.
function escapeHtmlObs(str) {
    if (str == null) return '—';
    return window.BioEscape.escapeHtml(str);
}

// Format date from YYYY-MM-DD to a readable format
function formatObsDate(dateStr) {
    if (!dateStr) return '—';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    var year = parts[0];
    var monthNum = parseInt(parts[1], 10);
    var day = parseInt(parts[2], 10);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthNum - 1] + ' ' + day + ', ' + year;
}

// ============================================================
//  Shared Pagination Renderer
//  Supports two styles:
//    'bar'      — Analytics: info left, page numbers + prev/next right
//    'centered' — Observations: centered page items, prev/next external
// ============================================================

function renderPagination(paginationSelector, style, currentPage, totalPages, startRecord, endRecord, totalRecords, onPageChange) {
    var container = document.querySelector(paginationSelector);
    if (!container) return;

    if (style === 'bar') {
        renderBarPagination(container, currentPage, totalPages, startRecord, endRecord, totalRecords, onPageChange);
    } else if (style === 'centered') {
        // Centered pagination updates are handled externally by the observations page
        // because it uses #paginationContainer with .page-item elements
        // The info text is updated here if .pagination-info exists
        var infoEl = container.querySelector('.pagination-info');
        if (infoEl) {
            infoEl.innerHTML = 'Showing <span class="bold">' + startRecord + ' - ' + endRecord + '</span> of <span class="bold">' + totalRecords.toLocaleString() + '</span> observations';
        }
    }
}

// Bar-style pagination (used by Analytics)
function renderBarPagination(container, currentPage, totalPages, startRecord, endRecord, totalRecords, onPageChange) {
    // Find or create .pagination-controls and .pagination-info
    var controlsEl = container.querySelector('.pagination-controls');
    var infoEl = container.querySelector('.pagination-info');

    // --- Update info text ---
    if (infoEl) {
        infoEl.innerHTML = 'Showing <span class="bold">' + startRecord + ' - ' + endRecord + '</span> of <span class="bold">' + totalRecords.toLocaleString() + '</span> observations';
    }

    // --- Update page numbers ---
    if (!controlsEl) return;
    var pageNumbersContainer = controlsEl.querySelector('.page-numbers');
    if (!pageNumbersContainer) {
        pageNumbersContainer = document.createElement('div');
        pageNumbersContainer.className = 'page-numbers';
        var nextBtn = controlsEl.querySelectorAll('.pagi-btn')[1];
        if (nextBtn) {
            controlsEl.insertBefore(pageNumbersContainer, nextBtn);
        } else {
            controlsEl.appendChild(pageNumbersContainer);
        }
    }

    if (totalPages <= 1) {
        pageNumbersContainer.innerHTML = '<span class="page-num active">1</span>';
    } else {
        var pageHtml = '';
        var maxVisible = 5;
        var startPage, endPage;

        if (totalPages <= maxVisible) {
            startPage = 1;
            endPage = totalPages;
        } else {
            var half = Math.floor(maxVisible / 2);
            startPage = currentPage - half;
            endPage = currentPage + half;
            if (startPage < 1) {
                startPage = 1;
                endPage = maxVisible;
            }
            if (endPage > totalPages) {
                endPage = totalPages;
                startPage = totalPages - maxVisible + 1;
            }
        }

        for (var i = startPage; i <= endPage; i++) {
            var activeClass = i === currentPage ? ' active' : '';
            pageHtml += '<span class="page-num' + activeClass + '" data-page="' + i + '">' + i + '</span>';
        }
        pageNumbersContainer.innerHTML = pageHtml;
    }

    // --- Update prev/next button states ---
    var pagiBtns = controlsEl.querySelectorAll('.pagi-btn');
    if (pagiBtns.length >= 2) {
        pagiBtns[0].disabled = (currentPage <= 1);
        pagiBtns[1].disabled = (currentPage >= totalPages);
    }

    // --- Bind page-number + prev/next clicks (shared by analytics + observations) ---
    if (typeof onPageChange === 'function') {
        var nums = container.querySelectorAll('.page-num');
        nums.forEach(function(num) {
            num.addEventListener('click', function() {
                var page = parseInt(num.getAttribute('data-page'), 10);
                if (!isNaN(page) && page !== currentPage) onPageChange(page);
            });
        });
        if (pagiBtns.length >= 2) {
            pagiBtns[0].addEventListener('click', function() {
                if (currentPage > 1) onPageChange(currentPage - 1);
            });
            pagiBtns[1].addEventListener('click', function() {
                if (currentPage < totalPages) onPageChange(currentPage + 1);
            });
        }
    }
}