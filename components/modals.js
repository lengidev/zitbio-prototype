// components/modals.js: one dialog implementation for the whole app: focus entry,
// focus trap, background inerting, Escape, focus return. A page that marks a
// dialog `.active` itself leaves the close paths here dead.

const ModalManager = {
  /** Innermost last. A stack, so a dialog opened from inside another still
   *  closes back to the right place. */
  stack: [],

  FOCUSABLE: 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',

  /** Back-compat accessor: the topmost dialog, or null. */
  get activeModal() {
    return this.stack.length ? this.stack[this.stack.length - 1].card : null;
  },

  /** The `.modal-overlay` element's id. */
  open: function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.warn(`Modal with ID "${modalId}" not found`);
      return;
    }
    // Guard on the visible state, not the stack: a stack-based check made a
    // dialog permanently unreachable once its `.active` class was removed
    // outside close(), with nothing to explain why.
    if (modal.classList.contains('active')) return;

    // Drop a stale record, or a re-open pushes a duplicate and later restores
    // focus to the wrong place.
    const staleIndex = this.stack.map(function(entry) { return entry.card; }).lastIndexOf(modal);
    if (staleIndex !== -1) this.stack.splice(staleIndex, 1);

    const entry = {
      card: modal,
      // Remembered so focus can be handed back to whatever opened the dialog.
      opener: document.activeElement,
      onKeydown: null
    };

    this.stack.push(entry);
    modal.classList.add('active');

    document.body.style.overflow = 'hidden';

    this.setBackgroundInert(modal, true);
    this.bindKeys(entry);
    this.focusFirst(modal);
  },

  close: function() {
    const entry = this.stack.pop();
    if (!entry) return;

    entry.card.classList.remove('active');
    if (entry.onKeydown) entry.card.removeEventListener('keydown', entry.onKeydown);

    if (this.stack.length === 0) {
      document.body.style.overflow = '';
      this.clearBackgroundInert();
    } else {
      // A dialog underneath is revealed: its background stays inert and focus
      // belongs back inside it.
      const revealed = this.stack[this.stack.length - 1].card;
      this.setBackgroundInert(revealed, true);
      this.focusFirst(revealed);
    }

    // Guarded on the opener still being in the document: otherwise focus lands
    // on <body> and a keyboard user is dumped at the top of the page.
    const opener = entry.opener;
    if (opener && document.contains(opener) && typeof opener.focus === 'function') {
      opener.focus();
    }
  },

  /** Closes anything opened on top of it too. */
  closeById: function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const index = this.stack.map(function(entry) { return entry.card; }).lastIndexOf(modal);
    if (index === -1) {
      // Never tracked, because legacy page code opened it directly.
      modal.classList.remove('active');
      return;
    }
    while (this.stack.length > index) this.close();
  },

  /** The body-level ancestor: the thing to inert. */
  bodyChildOf: function(el) {
    let node = el;
    while (node && node.parentNode && node.parentNode !== document.body) {
      node = node.parentNode;
    }
    return node;
  },

  /** `inert` does the heavy lifting; bindKeys' Tab trap covers browsers without it. */
  setBackgroundInert: function(card, on) {
    const top = this.bodyChildOf(card);
    Array.prototype.forEach.call(document.body.children, function(child) {
      if (child === top) {
        // Clear it, don't skip it: an earlier pass inerted every other body child,
        // so a dialog opened on top of another is already inert, and skipping it
        // left it unclickable and unable to take focus.
        if (on) child.removeAttribute('inert');
        return;
      }
      // Toasts stay interactive: inerting them would make "dismiss" unclickable
      // exactly when those messages appear.
      if (child.classList && child.classList.contains('toast-container')) return;
      if (on) child.setAttribute('inert', '');
      else child.removeAttribute('inert');
    });
  },

  clearBackgroundInert: function() {
    Array.prototype.forEach.call(document.body.children, function(child) {
      child.removeAttribute('inert');
    });
  },

  /** A field is preferred over the close button: that is what the dialog is for. */
  focusFirst: function(card) {
    // Only painted fields. One inside a collapsed section answers querySelector
    // but focus() on it does nothing, stranding keyboard users on <body>.
    const fields = card.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    let field = null;
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].getClientRects().length > 0) { field = fields[i]; break; }
    }
    const target = field || card.querySelector(this.FOCUSABLE);
    if (!target) return;
    // Deferred: focusing a still-hidden element (display:none) does nothing.
    window.setTimeout(function() {
      if (document.contains(target)) target.focus();
    }, 0);
  },

  /**
   * Trap Tab inside the dialog; close on Escape.
   * Bound to the dialog, not the document: a nested input that calls
   * stopPropagation() on Escape would never reach a document-level listener, so
   * its handler would be bypassed.
   */
  bindKeys: function(entry) {
    const self = this;
    entry.onKeydown = function(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        self.close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusables = Array.prototype.filter.call(
        entry.card.querySelectorAll(self.FOCUSABLE),
        // More reliable than offsetParent, which is null for position:fixed.
        function(el) { return el.getClientRects().length > 0; }
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = entry.card.contains(active);

      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    entry.card.addEventListener('keydown', entry.onKeydown);
  }
};

function initModals() {
  const modalOverlays = document.querySelectorAll('.modal-overlay');
  if (modalOverlays.length === 0) {
    return;
  }

  const openModalBtns = document.querySelectorAll('[data-modal-open]');
  openModalBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const modalId = btn.getAttribute('data-modal-open');
      ModalManager.open(modalId);
    });
  });

  const closeModalBtns = document.querySelectorAll('[data-modal-close], .modal-close');
  closeModalBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      ModalManager.close();
    });
  });

  modalOverlays.forEach(function(overlay) {
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        ModalManager.close();
      }
    });
  });

  // Escape is handled per-dialog in bindKeys(), not here: a document-level
  // handler could not see the keydown from a nested input that stops
  // propagation on Escape to cancel itself.
}

function initViewObservationModal() {
  const viewButtons = document.querySelectorAll('[data-view-observation]');
  if (viewButtons.length === 0) return;

  viewButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const observationId = btn.getAttribute('data-view-observation');
      ModalManager.open('viewObservationModal');
    });
  });
}

function initConfirmDeleteModal() {
  const deleteButtons = document.querySelectorAll('[data-delete]');
  if (deleteButtons.length === 0) return;

  deleteButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const itemId = btn.getAttribute('data-delete');
      const itemType = btn.getAttribute('data-type') || 'item';
      
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      if (confirmBtn) {
        confirmBtn.onclick = function() {
          ModalManager.close();
          // Reported the same way as everywhere else, instead of a blocking alert().
          if (typeof showToast === 'function') showToast(itemType + ' deleted.', 'success');
          else console.warn(itemType + ' deleted.');
        };
      }
      
      ModalManager.open('confirmDeleteModal');
    });
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initModals();
    initViewObservationModal();
    initConfirmDeleteModal();
  });
}

// CommonJS export so the file can be required outside the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ModalManager, initModals, initViewObservationModal, initConfirmDeleteModal };
}
