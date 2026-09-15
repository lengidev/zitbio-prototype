// lib/csv.js: the app's one CSV builder and downloader, shared by the analytics
// report and the observations export. Fields are quoted and formula-defused:
// `=`, `+`, `-` and `@` are live in spreadsheets and every field is user-entered.

(function (root) {
  'use strict';

  function escapeCsvField(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s)) {
      // Conventional defusal: the cell still shows the text, spreadsheets treat
      // it as a string.
      s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /**
   * `columns` accepts plain keys or `{ key, label, get }` objects; `get(row)` reads
   * values stored in a nested object (`location.*`, `species_details.*`).
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
