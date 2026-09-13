/**
 * ZitBio — Field Officer Page Logic
 * Handles the biodiversity observation submission form.
 *
 * Design decisions:
 *   - Reads from the unified BioData layer (CentralDataStore) so all
 *     observations are immediately available to admin dashboards after
 *     submission — no sync or import step required.
 *   - Species auto-detect reduces taxonomic misidentification by field
 *     officers with varying levels of expertise.
 *   - GPS reverse-geocode auto-fills province/city to minimise manual
 *     data entry errors when officers are working in the field.
 */

// Format numbers to at least 2 digits (e.g. 5 -> "05").
// Dependency-free replacement for String.prototype.padStart, which
// throws on older engines/webviews and can take the page down.
function pad2(num) {
  var s = String(num);
  return s.length < 2 ? '0' + s : s;
}

/* ============================================
   TOAST UTILITY
   Displays transient notifications without blocking the user's workflow.
   Designed to work alongside (but independently of) the BioData notification
   system — toast is for ephemeral UX feedback, not persistent alerts.
   ============================================ */
function showToast(message, type) {
  var container = document.getElementById('toastContainer');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'fo-toast fo-toast-' + (type || 'success');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { toast.classList.add('fo-toast-out'); }, 2700);
  setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
}

/* ============================================
   FORM VALIDATION
   Checks all required fields before submission so incomplete records
   never enter the data layer. Error messages appear inline next to
   each field rather than as a single blocking alert.
   ============================================ */
function validateForm() {
  var isValid = true;
  var requiredFields = [
    { id: 'officerName', errorId: 'officerNameError', message: 'Officer name is required' },
    { id: 'institutionName', errorId: 'institutionNameError', message: 'Institution is required' },
    { id: 'obsDate', errorId: 'obsDateError', message: 'Date is required' },
    { id: 'obsTime', errorId: 'obsTimeError', message: 'Time is required' },
    { id: 'commonName', errorId: 'commonNameError', message: 'Common name is required' },
    { id: 'scientificName', errorId: 'scientificNameError', message: 'Scientific name is required' },
    { id: 'populationCount', errorId: 'populationCountError', message: 'Count is required' },
    { id: 'provinceState', errorId: 'provinceStateError', message: 'Province is required' },
    { id: 'country', errorId: 'countryError', message: 'Country is required' },
    { id: 'focusArea', errorId: 'focusAreaError', message: 'Focus area is required' },
    { id: 'habitatType', errorId: 'habitatTypeError', message: 'Habitat type is required' }
  ];

  requiredFields.forEach(function(field) {
    var input = document.getElementById(field.id);
    var error = document.getElementById(field.errorId);
    if (!input) return;

    // Ensure error element exists
    if (!error) {
      error = document.createElement('span');
      error.id = field.errorId;
      error.className = 'fo-error';
      error.textContent = field.message || 'This field is required';
      input.parentNode.parentNode.appendChild(error);
    }

    if (!input.value.trim()) {
      input.classList.add('error');
      error.classList.add('show');
      isValid = false;
    } else {
      input.classList.remove('error');
      error.classList.remove('show');
    }
  });

  return isValid;
}

/* ============================================
   FIELD OFFICER INITIALIZATION
   Wires up session auto-fill, species auto-detect, GPS capture,
   count stepper, and form submission to the unified data layer.
   ============================================ */
function initFieldOfficer() {
  var page = document.querySelector('.page-fieldofficer-v2');
  if (!page) return;

  // Reads from unified BioData layer so submissions appear instantly
  // in admin dashboards — no sync step required.
  var CentralDataStore = (window.BioData) ? window.BioData : null;
  var observationForm = document.getElementById('observationForm');
  if (!observationForm) return;

  // --- Pre-populate session data to reduce field entry errors ---
  if (CentralDataStore) {
    var session = CentralDataStore.getSession();
    if (session) {
      var userNameEl = document.querySelector('.user-menu-name');
      if (userNameEl) userNameEl.textContent = session.name;

      var officerEl = document.getElementById('officerName');
      if (officerEl) officerEl.value = session.name;

      var instEl = document.getElementById('institutionName');
      if (instEl) instEl.value = session.institution_name || '';
    }

    // Province and Country are locked to Copperbelt/Zambia for current scope.
    // See [[futureupdates#10-Province Expansion|futureupdates.md]] for expansion plans.
  }

  // --- Default date/time to now ---
  var dateEl = document.getElementById('obsDate');
  var timeEl = document.getElementById('obsTime');
  setDateTimeToNow();

  // --- Shared date/time + validation-error helpers ---
  // "Reset to now" is reused by initial load, Cancel, and Submit so the
  // field-officer form always behaves identically.
  function setDateTimeToNow() {
    if (dateEl) {
      var n = new Date();
      dateEl.value = n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
    }
    if (timeEl) {
      var tn = new Date();
      timeEl.value = pad2(tn.getHours()) + ':' + pad2(tn.getMinutes());
    }
  }

  function resetDateTimeAndErrors() {
    setDateTimeToNow();
    document.querySelectorAll('.fo-input.error').forEach(function(el) { el.classList.remove('error'); });
    document.querySelectorAll('.fo-error.show').forEach(function(el) { el.classList.remove('show'); });
  }

  // --- Species auto-detect from common name ---
  // Maps typed common names to scientific names to reduce taxonomic
  // misidentification by field officers with varying expertise.
  var commonNameEl = document.getElementById('commonName');
  var scientificNameEl = document.getElementById('scientificName');
  if (commonNameEl && scientificNameEl) {
    var autoDetectLocked = false;
    commonNameEl.addEventListener('input', function() {
      if (autoDetectLocked) return;
      var match = CentralDataStore ? CentralDataStore.lookupScientificName(this.value) : null;
      if (match) {
        scientificNameEl.value = match;
      }
    });
    // If user manually edits scientific name, don't overwrite
    scientificNameEl.addEventListener('input', function() {
      if (this.value && commonNameEl.value) {
        autoDetectLocked = true;
      }
    });
    commonNameEl.addEventListener('change', function() {
      autoDetectLocked = false;
    });
  }

  // --- Habitat auto-select from focus area ---
  // Habitat is derived from the selected focus area (app-wide 2-option
  // system): the Nature Park → park habitat; campus → urban. Officers
  // never need to pick a habitat manually.
  var focusAreaEl = document.getElementById('focusArea');
  var habitatTypeEl = document.getElementById('habitatType');

  // --- Focus area options come from the site registry (Layer 1) ---
  // The dropdown used to be hardcoded in the HTML and offered
  // 'The Copperbelt University Campus', which matches no row in `sites` and no
  // value in `observations.focus_area` — so anything submitted with it would
  // resolve to no site at all. Options are now built from the registry, which
  // is the single source of truth for site names. The HTML keeps a corrected
  // copy purely as a no-JS fallback.
  function populateFocusAreaOptions() {
    if (!focusAreaEl || !CentralDataStore || typeof CentralDataStore.getSiteRegistry !== 'function') return;
    var siteRegistry = CentralDataStore.getSiteRegistry() || [];
    if (siteRegistry.length === 0) return;

    // Preserve whatever the officer had selected (this also re-runs when the
    // cloud sync swaps the registry in).
    var previous = focusAreaEl.value;
    focusAreaEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select focus area...';
    focusAreaEl.appendChild(placeholder);

    siteRegistry.forEach(function(site) {
      if (!site || !site.name) return;
      var opt = document.createElement('option');
      // The option value IS the site name, because that is what
      // observations.focus_area stores.
      opt.value = site.name;
      opt.textContent = site.name;
      focusAreaEl.appendChild(opt);
    });

    if (previous) focusAreaEl.value = previous;
  }

  populateFocusAreaOptions();
  // The registry is seeded locally, then replaced by the cloud copy during
  // hydration — re-populate so newly added sites appear without a reload.
  window.addEventListener('biodata:synced', populateFocusAreaOptions);

  if (focusAreaEl && habitatTypeEl && CentralDataStore && CentralDataStore.getHabitatForFocusArea) {
    var syncHabitatFromFocus = function() {
      if (focusAreaEl.value) {
        habitatTypeEl.value = CentralDataStore.getHabitatForFocusArea(focusAreaEl.value);
      }
    };
    focusAreaEl.addEventListener('change', syncHabitatFromFocus);
    // Also run once in case a focus area is already selected on load.
    syncHabitatFromFocus();
  }

  // --- GPS capture with reverse-geocode ---
  // Captures device GPS, then reverse-geocodes via Nominatim to auto-fill
  // province and city — reducing manual data entry in the field.
  var gpsBtn = document.getElementById('gpsCaptureBtn');
  var gpsIcon = document.getElementById('gpsIcon');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', function() {
      if (!navigator.geolocation) {
        showToast('GPS is not supported by your browser.', 'error');
        return;
      }
      if (gpsIcon) {
        gpsIcon.querySelector('use').setAttribute('href', '#i-progress_activity');
        gpsIcon.classList.add('fo-spin');
      }
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          var latEl = document.getElementById('latitude');
          var lngEl = document.getElementById('longitude');
          if (latEl) latEl.value = lat.toFixed(6);
          if (lngEl) lngEl.value = lng.toFixed(6);
          if (gpsIcon) { gpsIcon.querySelector('use').setAttribute('href', '#i-explore'); gpsIcon.classList.remove('fo-spin'); }
          showToast('GPS coordinates captured successfully!', 'success');

          // Reverse-geocode to auto-fill Province and City —
          // simplifies workflow for officers who may not know the
          // administrative boundaries of remote areas.
          var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng;
          fetch(url, { headers: { 'User-Agent': 'BioSystem/1.0' } })
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
              if (!data || !data.address) return;
              var addr = data.address;

              // City — try city, town, village, county
              var cityVal = addr.city || addr.town || addr.village || addr.county || '';
              var cityEl = document.getElementById('city');
              if (cityEl && cityVal) {
                cityEl.value = cityVal;
              }

              // Province/State — match against Zambia province list
              var stateVal = addr.state || '';
              var provEl = document.getElementById('provinceState');
              if (provEl && stateVal) {
                var options = provEl.options;
                for (var i = 0; i < options.length; i++) {
                  if (options[i].text.toLowerCase() === stateVal.toLowerCase()) {
                    options[i].selected = true;
                    break;
                  }
                }
              }
            })
            .catch(function() { /* silently fail — coordinates already captured */ });
        },
        function(err) {
          if (gpsIcon) { gpsIcon.querySelector('use').setAttribute('href', '#i-explore'); gpsIcon.classList.remove('fo-spin'); }
          showToast('GPS error: ' + err.message, 'error');
        }
      );
    });
  }

  // --- Count stepper ---
  var countMinus = document.getElementById('countMinus');
  var countPlus = document.getElementById('countPlus');
  var countInput = document.getElementById('populationCount');
  if (countMinus && countInput) {
    countMinus.addEventListener('click', function() {
      var v = parseInt(countInput.value, 10) || 1;
      if (v > 1) countInput.value = v - 1;
    });
  }
  if (countPlus && countInput) {
    countPlus.addEventListener('click', function() {
      countInput.value = (parseInt(countInput.value, 10) || 1) + 1;
    });
  }

  // --- Cancel button — reset form ---
  var btnCancel = document.getElementById('btnCancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', function() {
      document.getElementById('observationForm').reset();
      resetDateTimeAndErrors();
      showToast('Form cleared.', 'success');
    });
  }

  // --- Form Submit — persists to data layer and resets for next entry ---
  observationForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

    var session = CentralDataStore ? CentralDataStore.getSession() : null;
    var officerName = document.getElementById('officerName').value;
    var institutionName = document.getElementById('institutionName').value;
    var date = document.getElementById('obsDate').value;
    var time = document.getElementById('obsTime').value;
    var timestamp = null;
    try {
      timestamp = new Date(date + 'T' + time + ':00').toISOString();
    } catch (err) {
      timestamp = new Date().toISOString();
    }

    var latEl = document.getElementById('latitude');
    var lngEl = document.getElementById('longitude');
    var lat = latEl && latEl.value ? parseFloat(latEl.value) : null;
    var lng = lngEl && lngEl.value ? parseFloat(lngEl.value) : null;

    // Build the observation object per spec
    var observation = {
      observation_id: 'obs_' + Date.now(),
      taxon: {
        scientific_name: document.getElementById('scientificName').value,
        common_name: document.getElementById('commonName').value
      },
      location: {
        latitude: lat,
        longitude: lng,
        country: document.getElementById('country').value,
        administrative_area: document.getElementById('provinceState').value,
        city: document.getElementById('city').value || '',
        focus_area: document.getElementById('focusArea').value || null,
        habitat_type: document.getElementById('habitatType').value,
        locality_description: document.getElementById('localityDescription').value || ''
      },
      recorded_by: officerName,
      timestamp: timestamp,
      institution_name: institutionName,
      activity: document.getElementById('activity').value || '',
      field_notes: document.getElementById('fieldNotes').value || ''
    };

    // Log to console per spec
    console.log(observation);

    // Persist to the unified data layer so the observation appears in
    // admin dashboards immediately — no separate import step needed.
    if (CentralDataStore) {
      CentralDataStore.addObservation({
        count: parseInt(document.getElementById('populationCount').value, 10),
        source: 'field_observation',
        species_details: observation.taxon,
        location: observation.location,
        recorded_by: observation.recorded_by,
        timestamp: observation.timestamp,
        institution_name: observation.institution_name,
        activity: observation.activity,
        field_notes: observation.field_notes
      });
    }

    showToast('Observation recorded successfully!', 'success');

    // Reset form but preserve session values so officer can
    // immediately submit the next observation without re-entering
    // their personal details.
    observationForm.reset();
    if (session) {
      var officerEl = document.getElementById('officerName');
      if (officerEl) officerEl.value = session.name;

      var instEl = document.getElementById('institutionName');
      if (instEl) instEl.value = session.institution_name || '';
    }

    // Reset date/time to now and clear validation errors
    resetDateTimeAndErrors();
  });

  // --- Live error clearing as user types ---
  document.querySelectorAll('.fo-input').forEach(function(input) {
    input.addEventListener('input', function() {
      this.classList.remove('error');
      var errorEl = document.getElementById(this.id + 'Error');
      if (errorEl) errorEl.classList.remove('show');
    });
  });
}

/* ============================================
   PAGE INITIALIZATION
   Guarded: only runs on the field-officer page
   (detected by .page-fieldofficer-v2 class).
   ============================================ */
document.addEventListener('DOMContentLoaded', function() {
  initFieldOfficer();
});