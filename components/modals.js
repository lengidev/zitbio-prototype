/**
 * ZitBio - Modal Component Logic
 * Handles opening/closing all data modals
 */

// Modal state management
//
// One dialog implementation for the whole app: focus entry, focus trap,
// background inerting, Escape, and handing focus back on close.
//
// Why this exists (#51): pages used to open modals by adding `.active`
// themselves, so `activeModal` was never set and this module's own close paths
// were dead code. Nothing moved focus into the dialog or trapped Tab inside it,
// so a keyboard user tabbing from the trigger walked into the table *behind*
// the modal and could never reach its fields.
const ModalManager = {
  /** Open dialogs, innermost last. A stack rather than a single slot, so a modal
   *  opened from inside another one still closes back to the right place. */
  stack: [],

  /** Everything focusable that is not explicitly removed from the tab order. */
  FOCUSABLE: 'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',

  /** Compatibility accessor — reflects the topmost dialog, or null. */
  get activeModal() {
    return this.stack.length ? this.stack[this.stack.length - 1].card : null;
  },

  /**
   * Open a modal by id.
   * @param {string} modalId - The ID of the modal (the .modal-overlay element)
   */
  open: function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.warn(`Modal with ID "${modalId}" not found`);
      return;
    }
    // Guard on the VISIBLE state, not the stack. A stack-based check made a
    // dialog permanently unreachable if its `.active` class was ever removed
    // outside close() — open() would return early forever and nothing would
    // appear, with no error to explain why.
    if (modal.classList.contains('active')) return;

    // Drop any stale record of this dialog so a re-open starts cleanly rather
    // than pushing a duplicate and restoring focus to the wrong place later.
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

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    this.setBackgroundInert(modal, true);
    this.bindKeys(entry);
    this.focusFirst(modal);
  },

  /**
   * Close the most recently opened modal.
   */
  close: function() {
    const entry = this.stack.pop();
    if (!entry) return;

    entry.card.classList.remove('active');
    if (entry.onKeydown) entry.card.removeEventListener('keydown', entry.onKeydown);

    if (this.stack.length === 0) {
      // Restore body scroll
      document.body.style.overflow = '';
      this.clearBackgroundInert();
    } else {
      // A dialog underneath is revealed again: its background must stay inert,
      // and focus belongs back inside it rather than on the page behind.
      const revealed = this.stack[this.stack.length - 1].card;
      this.setBackgroundInert(revealed, true);
      this.focusFirst(revealed);
    }

    // Hand focus back to the control that opened it. Guarded on the opener still
    // being in the document — otherwise focus lands on <body> and a keyboard user
    // is silently dumped at the top of the page.
    const opener = entry.opener;
    if (opener && document.contains(opener) && typeof opener.focus === 'function') {
      opener.focus();
    }
  },

  /**
   * Close a modal by id, including anything opened on top of it.
   * @param {string} modalId - The ID of the modal to close
   */
  closeById: function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    const index = this.stack.map(function(entry) { return entry.card; }).lastIndexOf(modal);
    if (index === -1) {
      // Never tracked (legacy page code opened it) — just hide it.
      modal.classList.remove('active');
      return;
    }
    while (this.stack.length > index) this.close();
  },

  /**
   * The body-level ancestor of an element — the thing to inert.
   */
  bodyChildOf: function(el) {
    let node = el;
    while (node && node.parentNode && node.parentNode !== document.body) {
      node = node.parentNode;
    }
    return node;
  },

  /**
   * Make everything except the open dialog inert, so neither Tab nor a click can
   * reach the page behind it. `inert` does the heavy lifting; the Tab trap below
   * still covers browsers without it.
   */
  setBackgroundInert: function(card, on) {
    const top = this.bodyChildOf(card);
    Array.prototype.forEach.call(document.body.children, function(child) {
      if (child === top) {
        // Explicitly CLEAR the dialog being opened, rather than merely skipping
        // it. An earlier pass inerted every other body child, so a dialog opened
        // on top of another one is already inert — and skipping it left it that
        // way, making it unclickable and unable to take focus. Any second dialog
        // in a stack was dead on arrival.
        if (on) child.removeAttribute('inert');
        return;
      }
      // The toast stack must stay interactive: inerting it would make the
      // "dismiss" button on a toast unclickable while a modal is open — which is
      // precisely when those messages appear.
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

  /**
   * Move focus into the dialog. A form field is preferred over the close button,
   * because that is what the person opening the dialog came to use.
   */
  focusFirst: function(card) {
    // Only fields that are actually painted. A field inside a collapsed section
    // answers querySelector but focus() on it silently does nothing, which left
    // focus on <body> and stranded keyboard users at the top of the page.
    const fields = card.querySelectorAll(
      'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
    );
    let field = null;
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].getClientRects().length > 0) { field = fields[i]; break; }
    }
    const target = field || card.querySelector(this.FOCUSABLE);
    if (!target) return;
    // Deferred: focusing an element that is still hidden (display:none) silently
    // does nothing, so this waits until the dialog has actually been painted.
    window.setTimeout(function() {
      if (document.contains(target)) target.focus();
    }, 0);
  },

  /**
   * Trap Tab inside the dialog and close on Escape.
   *
   * Bound to the dialog element rather than the document on purpose. The review
   * decision panel's input calls stopPropagation() on Escape so it cancels the
   * panel instead of the whole dialog; a document-level listener would never see
   * that event, so the input's handler would be bypassed.
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
        // getClientRects() is empty for anything not rendered, which is a more
        // reliable test than offsetParent (null for position:fixed elements).
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

/**
 * Initialize modal event listeners
 * Uses defensive guards to prevent errors on pages without modals
 */
function initModals() {
  // Guard: Check if any modals exist on the page
  const modalOverlays = document.querySelectorAll('.modal-overlay');
  if (modalOverlays.length === 0) {
    return; // No modals on this page
  }

  // Add click listeners to all open modal buttons
  const openModalBtns = document.querySelectorAll('[data-modal-open]');
  openModalBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const modalId = btn.getAttribute('data-modal-open');
      ModalManager.open(modalId);
    });
  });

  // Add click listeners to all close modal buttons
  const closeModalBtns = document.querySelectorAll('[data-modal-close], .modal-close');
  closeModalBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      ModalManager.close();
    });
  });

  // Close modal when clicking on overlay
  modalOverlays.forEach(function(overlay) {
    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        ModalManager.close();
      }
    });
  });

  // Escape is handled per-dialog in ModalManager.bindKeys(), not here.
  // A document-level handler could not see the keydown from the review decision
  // panel's input, which stops propagation on Escape so it cancels the panel
  // rather than closing the whole dialog (#51).
}

/**
 * View Observation Modal Handler
 * Specific handler for viewing observation details
 */
function initViewObservationModal() {
  const viewButtons = document.querySelectorAll('[data-view-observation]');
  if (viewButtons.length === 0) return;

  viewButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const observationId = btn.getAttribute('data-view-observation');
      // In a real app, you would fetch observation data here
      // For now, just open the modal
      ModalManager.open('viewObservationModal');
    });
  });
}

/**
 * Confirm Delete Modal Handler
 */
function initConfirmDeleteModal() {
  const deleteButtons = document.querySelectorAll('[data-delete]');
  if (deleteButtons.length === 0) return;

  deleteButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const itemId = btn.getAttribute('data-delete');
      const itemType = btn.getAttribute('data-type') || 'item';
      
      // Set up confirm button
      const confirmBtn = document.getElementById('confirmDeleteBtn');
      if (confirmBtn) {
        confirmBtn.onclick = function() {
          // In a real app, you would delete the item here
          ModalManager.close();
          // A blocking alert() was used here; the outcome is now reported the
          // same way as everywhere else (#52).
          if (typeof showToast === 'function') showToast(itemType + ' deleted.', 'success');
          else console.warn(itemType + ' deleted.');
        };
      }
      
      ModalManager.open('confirmDeleteModal');
    });
  });
}

// Initialize modals when DOM is ready
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', function() {
    initModals();
    initViewObservationModal();
    initConfirmDeleteModal();
  });
}

// Export for use in other modules (if using ES modules)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ModalManager, initModals, initViewObservationModal, initConfirmDeleteModal };
}
