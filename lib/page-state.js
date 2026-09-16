// Per-page view state (filters, column choices, page number) so an admin who
// navigates away and back finds the page as they left it. Storage is
// best-effort: a read that fails falls back, a write that fails is ignored.
window.BioPageState = (function() {
  var PREFIX = 'biodata_';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) { /* storage unavailable */ }
  }

  return { read: read, write: write };
})();
