// lib/theme-init.js
// Puts data-theme on <html> before the first paint, so a dark-mode session never
// paints light tokens first. Blocking, never deferred; exported for node --test.

(function (root) {
  'use strict';

  var STORAGE_KEY = 'biodata_theme';
  var LIGHT = 'light';
  var DARK = 'dark';
  var SYSTEM = 'system';

  // Mirrors `--color-bg` in styles/theme.css. Duplicated because
  // <meta name="theme-color"> is the one surface CSS cannot reach (the mobile
  // address bar) and it must be right before the stylesheet is parsed.
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
         the OS is what 'system' means anyway. */
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
   * user's current preference, which is what both the pre-paint call below
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
