/* Field officer observation form: session auto-fill, species auto-detect, GPS
   capture and submission into the unified BioData layer (CentralDataStore). */

// Dependency-free replacement for String.prototype.padStart, which throws on
// older engines/webviews and can take the page down.
function pad2(num) {
  var s = String(num);
  return s.length < 2 ? '0' + s : s;
}

/* TOAST UTILITY: ephemeral UX feedback, kept separate from BioData's persistent
   notification system. */
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

/* FORM VALIDATION: required fields are checked before submission so incomplete
   records never enter the data layer; errors render inline, not as one alert. */
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

/* FIELD OFFICER INITIALIZATION */
function initFieldOfficer() {
  var page = document.querySelector('.page-fieldofficer-v2');
  if (!page) return;

  // Unified BioData layer, so submissions reach the admin dashboards instantly.
  var CentralDataStore = (window.BioData) ? window.BioData : null;
  var observationForm = document.getElementById('observationForm');
  if (!observationForm) return;

  /**
   * Paint the signed-in officer's identity into the read-only observer fields.
   * Must be re-run whenever the identity settles: this page's scripts run before
   * the route guard resolves, so the first call can find no session at all and
   * leave the markup's placeholder name in a field that is **submitted as the
   * observation's attribution**. The fields are `readonly`, so repainting them
   * can never discard anything the officer typed.
   */
  function applySessionIdentity() {
    var session = CentralDataStore ? CentralDataStore.getSession() : null;
    if (!session) return;

    var userNameEl = document.querySelector('.user-menu-name');
    if (userNameEl && session.name) userNameEl.textContent = session.name;

    var officerEl = document.getElementById('officerName');
    if (officerEl) officerEl.value = session.name || '';

    var instEl = document.getElementById('institutionName');
    if (instEl) instEl.value = session.institution_name || '';
  }

  applySessionIdentity();
  if (CentralDataStore && typeof CentralDataStore.subscribe === 'function') {
    CentralDataStore.subscribe('session:changed', applySessionIdentity);
  }

  // Province and Country are locked to Copperbelt/Zambia for current scope.

  var dateEl = document.getElementById('obsDate');
  var timeEl = document.getElementById('obsTime');
  setDateTimeToNow();

  // "Reset to now" is shared by initial load, Cancel and Submit so the form
  // always behaves identically.
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

  // Species auto-detect from the typed common name, to reduce taxonomic
  // misidentification.
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

  // A datalist, not a closed picker: the officer stays free to record a species
  // that is not in the registry (a correctly-entered new species is still a
  // valid record), while the known names are one keystroke away, which keeps
  // `common_name` matching the registry instead of drifting.
  // The registry is hydrated from the cloud, so this also runs on
  // `biodata:synced`; on a cold load it would otherwise be empty.
  function populateSpeciesOptions() {
    var commonList = document.getElementById('commonNameOptions');
    var sciList = document.getElementById('scientificNameOptions');
    if (!commonList || !sciList) return;

    var registry = (CentralDataStore && CentralDataStore.getSpeciesRegistry)
      ? CentralDataStore.getSpeciesRegistry() : [];

    var seen = {};
    var commonHtml = '';
    var sciHtml = '';
    registry.forEach(function(sp) {
      var common = (sp.common_name || '').trim();
      if (common && !seen['c:' + common.toLowerCase()]) {
        seen['c:' + common.toLowerCase()] = true;
        commonHtml += '<option value="' + escapeFoOption(common) + '"></option>';
      }
      var sci = (sp.scientific_name || '').trim();
      if (sci && !seen['s:' + sci.toLowerCase()]) {
        seen['s:' + sci.toLowerCase()] = true;
        sciHtml += '<option value="' + escapeFoOption(sci) + '"></option>';
      }
    });

    commonList.innerHTML = commonHtml;
    sciList.innerHTML = sciHtml;
  }

  // Registry values are data, not markup, so they are escaped before being
  // interpolated. Falls back to a local escaper if lib/escape.js did not load.
  function escapeFoOption(value) {
    if (window.BioEscape && typeof window.BioEscape.escapeHtml === 'function') {
      return window.BioEscape.escapeHtml(value);
    }
    return String(value).replace(/[&<>"']/g, function(c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  populateSpeciesOptions();

  // Habitat auto-select from focus area
  // Habitat is derived from the selected focus area (app-wide 2-option
  // system): the Nature Park → park habitat; campus → urban. Officers
  // never need to pick a habitat manually.
  var focusAreaEl = document.getElementById('focusArea');
  var habitatTypeEl = document.getElementById('habitatType');

  // Focus area options are built from the site registry, the single source of
  // truth for site names: a name in `observations.focus_area` that matches no
  // `sites` row resolves to no site at all. The HTML copy is only a no-JS
  // fallback.
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
  // hydration, so re-populate rather than requiring a reload.
  window.addEventListener('biodata:synced', populateFocusAreaOptions);
  window.addEventListener('biodata:synced', populateSpeciesOptions);

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

  // GPS capture with reverse-geocode
  // Captures device GPS, then reverse-geocodes via Nominatim to auto-fill the
  // city, reducing manual data entry in the field.
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

          // Reverse-geocode to auto-fill the city, for officers who may not know
          // the administrative boundaries of remote areas.
          var url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lng;
          fetch(url, { headers: { 'User-Agent': 'BioSystem/1.0' } })
            .then(function(resp) { return resp.json(); })
            .then(function(data) {
              if (!data || !data.address) return;
              var addr = data.address;

              // City falls back through town, village, county.
              var cityVal = addr.city || addr.town || addr.village || addr.county || '';
              var cityEl = document.getElementById('city');
              if (cityEl && cityVal) {
                cityEl.value = cityVal;
              }

              // Province/State is deliberately NOT auto-filled: the field is a
              // `readonly` input pinned to "Copperbelt Province" for current scope.
              // This block used to iterate `provEl.options` as though the field
              // were a <select>; on an <input> `.options` is undefined, so
              // `.length` threw a TypeError on every successful reverse geocode,
              // swallowed by the .catch() below. There is no option list to select
              // from and the field is locked, so there is nothing to do.
            })
            .catch(function() { /* best-effort: coordinates are already captured */ });
        },
        function(err) {
          if (gpsIcon) { gpsIcon.querySelector('use').setAttribute('href', '#i-explore'); gpsIcon.classList.remove('fo-spin'); }
          showToast('GPS error: ' + err.message, 'error');
        }
      );
    });
  }

  // Count stepper
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

  // Cancel button: reset form
  var btnCancel = document.getElementById('btnCancel');
  if (btnCancel) {
    btnCancel.addEventListener('click', function() {
      document.getElementById('observationForm').reset();
      resetDateTimeAndErrors();
      showToast('Form cleared.', 'success');
    });
  }

  // Form Submit: persists to the data layer and resets for the next entry.
  observationForm.addEventListener('submit', function(e) {
    e.preventDefault();
    if (!validateForm()) {
      showToast('Please fill in all required fields.', 'error');
      return;
    }

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

    // Re-apply the session identity after the reset, so the next record is
    // attributed to the officer actually signed in.
    observationForm.reset();
    applySessionIdentity();

    // Reset date/time to now and clear validation errors
    resetDateTimeAndErrors();
  });

  // Live error clearing as user types
  document.querySelectorAll('.fo-input').forEach(function(input) {
    input.addEventListener('input', function() {
      this.classList.remove('error');
      var errorEl = document.getElementById(this.id + 'Error');
      if (errorEl) errorEl.classList.remove('show');
    });
  });
}

/* PAGE INITIALIZATION: only runs when .page-fieldofficer-v2 is present. */
document.addEventListener('DOMContentLoaded', function() {
  initFieldOfficer();
});