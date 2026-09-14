/**
 * ZitBIO — Early theme bootstrap
 * ==============================
 * The single implementation of "which palette is this user on", and the only
 * thing that has to answer it before the first paint.
 *
 * Why this file exists
 * --------------------
 * The palette was applied by `pages/admin/layout/admin-layout.js` on
 * DOMContentLoaded — i.e. after the document was parsed and every deferred
 * script had run. Measured on a real navigation, `data-theme="dark"` landed at
 * ~1300ms, so the first frames of a dark-mode session were painted with the
 * light `:root` tokens in `styles/theme.css` (`--color-bg: #F5F7FA`). The user
 * saw a plain white page, then a plain dark one, then content: two colour
 * changes and a content change inside the same second.
 *
 * This file is loaded as a BLOCKING script in `<head>` BEFORE the stylesheets,
 * so the attribute is already on `<html>` when the first style resolution
 * happens. There is no flash to suppress, which is why there is no
 * "anti-FOUC" hack here.
 *
 * Loading
 * -------
 *   <script src=".../lib/theme-init.js"></script>   <!-- no defer, no async -->
 *
 * It is deliberately NOT `<script defer>`: deferring it puts it back in the
 * same queue that caused the bug.
 *
 * It also exports through CommonJS when available, so the same implementation
 * is exercised by `node --test` (see `tests/theme-init.test.js`) instead of the
 * resolution rules existing twice.
 */

(function (root) {
  'use strict';

  var STORAGE_KEY = 'biodata_theme';
  var LIGHT = 'light';
  var DARK = 'dark';
  var SYSTEM = 'system';

  // Mirrors `--color-bg` in styles/theme.css. Kept here because
  // `<meta name="theme-color">` is the one surface CSS cannot reach (the mobile
  // address bar), and it has to be correct before the stylesheet is parsed.
  var THEME_COLORS = {
    light: '#F5F7FA',
    dark: '#17211b'
  };

  function doc() {
    return typeof document !== 'undefined' ? document : null;
  }

  /**
   * The user's stored preference: 'light', 'dark', or 'system' (also the
   * answer for "never chose", "storage blocked", and "stored nonsense").
   */
  function readPreference() {
    try {
      var storage = root.localStorage;
      if (!storage) return SYSTEM;
      var saved = storage.getItem(STORAGE_KEY);
      if (saved === LIGHT || saved === DARK) return saved;
    } catch (err) {
      /* Storage can throw outright (private mode, blocked cookies). Following
         the OS is the right fallback — it is what 'system' means anyway. */
    }
    return SYSTEM;
  }

  /** Whether the OS asks for a dark UI. */
  function systemPrefersDark() {
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /**
   * Resolve a preference + an OS signal into the palette to paint.
   * Pure on purpose: this is the rule that decides what every page looks like,
   * and it is the part worth asserting in a test.
   */
  function resolve(preference, prefersDark) {
    if (preference === DARK) return DARK;
    if (preference === LIGHT) return LIGHT;
    return prefersDark ? DARK : LIGHT;
  }

  /** The palette this user should be on right now. */
  function current() {
    return resolve(readPreference(), systemPrefersDark());
  }

  /**
   * Keep the browser's own chrome in step with the theme.
   * `<meta name="theme-color">` ships statically in every page so it is already
   * roughly right, but a dark-mode user must not get a light address bar.
   */
  function syncMeta(theme) {
    var document_ = doc();
    if (!document_ || typeof document_.querySelector !== 'function') return;
    var meta = document_.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    meta.setAttribute('content', theme === DARK ? THEME_COLORS.dark : THEME_COLORS.light);
  }

  /**
   * Put a palette on `<html>` and return it. With no argument, resolves the
   * user's current preference — which is what both the pre-paint call below
   * and admin-layout.js's own post-load call want.
   */
  function apply(theme) {
    var document_ = doc();
    if (!document_ || !document_.documentElement) return theme || current();
    var next = theme || current();
    document_.documentElement.setAttribute('data-theme', next);
    syncMeta(next);
    return next;
  }

  /**
   * Record an explicit choice (the appearance toggle) and apply it. Only ever
   * called with 'light' or 'dark': an explicit choice is being made, so it must
   * not be re-resolved against the OS.
   */
  function set(theme) {
    try {
      if (root.localStorage) root.localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      /* The palette still applies for this page; only the memory is lost. */
    }
    return apply(theme);
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    LIGHT: LIGHT,
    DARK: DARK,
    SYSTEM: SYSTEM,
    readPreference: readPreference,
    resolve: resolve,
    current: current,
    apply: apply,
    set: set,
    syncMeta: syncMeta
  };

  root.BioTheme = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  // The point of the file. Runs at parse time, before the first stylesheet is
  // applied, so the very first painted frame is already the right palette.
  apply();
})(typeof window !== 'undefined' ? window : globalThis);
