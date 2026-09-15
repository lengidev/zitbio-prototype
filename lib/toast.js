// lib/toast.js: the app's shared toast surface, replacing three half
// implementations. `window.showToast` is still installed for the call sites that
// already used that name, because every one of them guards on `typeof`.

(function () {
  'use strict';

  var DEFAULT_MS = 4000;
  var ERROR_MS = 7000;   // errors are worth reading twice
  var EXIT_MS = 200;     // must match the .toast-out transition in toast.css

  function getContainer() {
    var el = document.getElementById('toastContainer');
    if (el) return el;

    el = document.createElement('div');
    el.className = 'toast-container';
    el.id = 'toastContainer';
    document.body.appendChild(el);
    return el;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * The cross is inlined rather than referenced from the page's icon sprite:
   * this module is loaded by pages that do not all define the same symbols, so
   * a <use href="#i-close"> would resolve to nothing on some of them.
   */
  function buildCloseButton(onActivate) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-close';
    btn.setAttribute('aria-label', 'Dismiss notification');

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'toast-close-icon');

    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z');
    svg.appendChild(path);
    btn.appendChild(svg);

    btn.addEventListener('click', onActivate);
    return btn;
  }

  /**
   * The `dismissed` flag stops a manual dismissal and the auto-dismiss timer
   * from both running.
   */
  function dismiss(toast) {
    if (!toast || toast.dismissed) return;
    toast.dismissed = true;
    toast.classList.add('toast-out');
    window.setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, EXIT_MS);
  }

  function show(message, type, duration) {
    if (!message) return null;

    var kind = type || 'success';

    var toast = document.createElement('div');
    toast.className = 'toast toast-' + kind;
    // Errors interrupt a screen reader; confirmations wait their turn.
    toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', kind === 'error' ? 'assertive' : 'polite');

    var text = document.createElement('span');
    text.className = 'toast-message';
    // `message` is plain text, never HTML (set via textContent).
    text.textContent = message;
    toast.appendChild(text);

    toast.appendChild(buildCloseButton(function () { dismiss(toast); }));

    getContainer().appendChild(toast);

    var ms = duration || (kind === 'error' ? ERROR_MS : DEFAULT_MS);
    window.setTimeout(function () { dismiss(toast); }, ms);

    return toast;
  }

  window.BioToast = {
    show: show,
    dismiss: dismiss,
    success: function (m, d) { return show(m, 'success', d); },
    error: function (m, d) { return show(m, 'error', d); },
    warning: function (m, d) { return show(m, 'warning', d); }
  };

  // Alias for the existing guarded call sites. Only installed when nothing else
  // has claimed the name, so the field-officer page keeps its own implementation.
  if (typeof window.showToast !== 'function') {
    window.showToast = show;
  }
}());
