// lib/escape.js: the app's only HTML escaper. The one it replaced returned its
// input unchanged, so every call site read as protected while none were.
// CommonJS export kept so node --test exercises this copy, not a second one.

(function (root) {
  'use strict';

  // Single pass: chained replaces would turn &lt; into &amp;lt;. "'" is here
  // because attributes in this codebase are written with both quote styles.
  var ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  // null/undefined become '' so a missing field never prints "null" into the DOM.
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
