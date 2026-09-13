/**
 * ZitBIO — Shared HTML escaping
 * =============================
 * The single implementation of HTML escaping for the whole app.
 *
 * Why this file exists
 * --------------------
 * `lib/observations-renderer.js` documented an `escapeHtml()` that escaped
 * nothing: it ran four self-replacements (`&` → `&`, `<` → `<`, …), so every
 * string came out unchanged while the call sites looked safe. Species names,
 * locality text, field notes, officer names and account emails are all
 * interpolated into `innerHTML`, so the app had a stored-XSS sink that read as
 * protected code. This module is the one place that escaping is implemented.
 *
 * Loading
 * -------
 * Classic script (no build step, no modules). Loaded by every page that
 * renders untrusted data, before any script that needs it:
 *   <script defer src=".../lib/escape.js"></script>
 * Deferred scripts execute in document order, so an earlier tag guarantees
 * `window.BioEscape` exists by the time a later script runs.
 *
 * It also exports through CommonJS when available, so the same implementation
 * is exercised by `node --test` (see `tests/escape.test.js`) instead of a
 * second copy existing only for tests.
 */

(function (root) {
  'use strict';

  // The five characters that can break out of text content or an attribute
  // value. `'` is included because attributes in this codebase are written
  // with single quotes as well as double.
  var ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /**
   * Escape a value for safe interpolation into HTML text or an attribute.
   * Non-strings are stringified; null/undefined become '' so callers never
   * print "null" into the DOM.
   *
   * Note: `&` must be replaced in the same pass as the others (a single
   * regex), otherwise escaping an already-escaped entity would double-encode
   * `&lt;` into `&amp;lt;`.
   */
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[&<>"']/g, function (character) {
      return ENTITIES[character];
    });
  }

  var api = {
    escapeHtml: escapeHtml
  };

  root.BioEscape = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
