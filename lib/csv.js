/**
 * ZitBIO — Shared CSV export
 * ==========================
 * One implementation of CSV building and download for the whole app.
 *
 * `downloadCsv()` previously existed only inside
 * `pages/admin/analytics/analytics.js` — private to that file — so the
 * Observations page's Export button had nothing to call and was never bound at
 * all (issue #69). It lives here so both pages share the same escaping and the
 * same download path.
 *
 * CSV injection matters here: every field is user-entered (species names,
 * localities, field notes), and spreadsheet apps execute a cell that begins with
 * `=`, `+`, `-` or `@`. Fields are therefore quoted **and** formula characters are
 * defused.
 *
 * Loaded as a classic script (no build step); also exports via CommonJS so it can
 * be unit-tested with `node --test`.
 */

(function (root) {
  'use strict';

  /**
   * Quote one CSV field.
   * Doubles embedded quotes and neutralises a leading formula character.
   */
  function escapeCsvField(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) {
      // Prefixing with an apostrophe is the conventional defusal: the cell still
      // shows the original text, but spreadsheets treat it as a string.
      s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /**
   * Build CSV text from an array of rows.
   *
   * `columns` accepts either plain keys or `{ key, label, get }` objects, where
   * `get(row)` handles values that live in a nested object (the app stores
   * observations with `location.*` and `species_details.*`).
   */
  function buildCsv(rows, columns) {
    var header = columns.map(function (c) {
      return escapeCsvField(c.label || c.key || c);
    }).join(',');

    var body = (rows || []).map(function (row) {
      return columns.map(function (c) {
        var value = c.get ? c.get(row) : row[c.key || c];
        return escapeCsvField(value);
      }).join(',');
    });

    return [header].concat(body).join('\n');
  }

  /** Offer CSV text as a file download. */
  function downloadCsv(csv, filename) {
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  var api = {
    escapeCsvField: escapeCsvField,
    buildCsv: buildCsv,
    downloadCsv: downloadCsv
  };

  root.BioCsv = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
