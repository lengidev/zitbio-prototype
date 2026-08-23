/**
 * ZitBio - Modal Component Logic
 * Handles opening/closing all data modals
 */

// Modal state management
const ModalManager = {
  activeModal: null,

  /**
   * Open a modal by ID
   * @param {string} modalId - The ID of the modal to open
   */
  open: function(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      console.warn(`Modal with ID "${modalId}" not found`);
      return;
    }

    const overlay = modal.querySelector('.modal-overlay') || modal;
    if (overlay) {
      overlay.classList.add('active');
      this.activeModal = modal;
      
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Focus first focusable element
      const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 100);
      }
    }
  },

  /**
   * Close the currently active modal
   */
  close: function() {
    if (!this.activeModal) return;

    const overlay = this.activeModal.querySelector('.modal-overlay') || this.activeModal;
    if (overlay) {
      overlay.classList.remove('active');
      
      // Restore body scroll
      document.body.style.overflow = '';
      
      this.activeModal = null;
    }
  },

  /**
   * Close modal by ID
   * @param {string} modalId - The ID of the modal to close
   */
  closeById: function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal === this.activeModal) {
      this.close();
    } else {
      const overlay = modal ? modal.querySelector('.modal-overlay') : null;
      if (overlay) {
        overlay.classList.remove('active');
      }
    }
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

  // Close modal on Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && ModalManager.activeModal) {
      ModalManager.close();
    }
  });
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
          alert(itemType + ' deleted successfully!');
          ModalManager.close();
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
