/* Field officer survey flow: what are you doing today, that type's form, the
   zones so far, and the end. The rules live in lib/survey.js; this file only
   moves data between that model, the DOM and the sync layer. */

(function () {
  'use strict';

  var Survey = window.BioSurvey;

  // How close the officer must be to a zone anchor to be placed in it. This is a
  // UI tolerance for choosing a zone, not a measurement of anything.
  var ANCHOR_RADIUS_M = 250;

  var el = {};
  var state = {
    survey: null,
    zoneId: null,
    zoneSource: null,
    position: null,
    speciesDraft: null,
    rainedOn: false,
    sending: false
  };

  function $(id) { return document.getElementById(id); }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function minutesText(value) {
    return value + (value === 1 ? ' minute' : ' minutes');
  }

  function escapeHtml(value) {
    if (window.BioEscape && typeof window.BioEscape.escapeHtml === 'function') {
      return window.BioEscape.escapeHtml(value);
    }
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function store() {
    return window.BioData || null;
  }

  function zones() {
    var data = store();
    var sites = (data && typeof data.getSiteRegistry === 'function') ? (data.getSiteRegistry() || []) : [];
    return sites.filter(function (site) { return site && site.kind === 'zone'; });
  }

  function zoneById(id) {
    var found = zones().filter(function (zone) { return zone.id === id; });
    return found.length ? found[0] : null;
  }

  function parentSiteName(zoneRow) {
    var data = store();
    var sites = (data && typeof data.getSiteRegistry === 'function') ? (data.getSiteRegistry() || []) : [];
    var parent = sites.filter(function (site) { return site.id === zoneRow.parent_site_id; })[0];
    return parent ? (parent.name || parent.short_name || null) : null;
  }

  function zoneLabel(id) {
    var zone = id ? zoneById(id) : null;
    if (!zone) return id || 'No zone';
    return zone.short_name || zone.name || id;
  }

  function registry() {
    var data = store();
    return (data && typeof data.getSpeciesRegistry === 'function') ? (data.getSpeciesRegistry() || []) : [];
  }

  function session() {
    var data = store();
    return (data && typeof data.getSession === 'function') ? data.getSession() : null;
  }

  function speciesName(speciesId) {
    var match = registry().filter(function (item) { return item.id === speciesId; })[0];
    return match ? (match.common_name || match.scientific_name || speciesId) : speciesId;
  }

  function roleLabel(role) {
    if (role === 'dominant') return 'Dominant';
    if (role === 'invasive') return 'Invasive';
    return 'Present';
  }

  // A wildlife census offers fauna and a vegetation survey offers flora. Without
  // this the sward picker offered Zebra as a candidate dominant grass species.
  function expectedTaxonType() {
    var type = state.survey ? state.survey.surveyType : null;
    if (type === 'wildlife_census') return 'fauna';
    if (type === 'vegetation') return 'flora';
    return null;
  }

  function officerName() {
    var s = session();
    return (s && s.name) || 'Field officer';
  }

  function officerInstitution() {
    var s = session();
    return (s && s.institution_name) || '';
  }

  function officerId() {
    var s = session();
    return (s && (s.id || s.user_id)) || null;
  }

  function nowIso() { return new Date().toISOString(); }

  function formatClock(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function formatDay(iso) {
    if (!iso) return '';
    if (window.BioDate && typeof window.BioDate.mediumDate === 'function') {
      return window.BioDate.mediumDate(iso);
    }
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // Local for now, but it must carry the same announcement contract as the shared
  // toast in lib/toast.js: without role and aria-live the only error surface in
  // this flow, including "sending failed", is silent to a screen reader.
  function showToast(message, type) {
    var container = $('toastContainer');
    if (!container) return;
    var isError = type === 'error';
    var toast = document.createElement('div');
    toast.className = 'fo-toast fo-toast-' + (type || 'success');
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(function () { toast.classList.add('fo-toast-out'); }, 3400);
    setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3800);
  }

  function show(screenId) {
    ['screenStart', 'screenForm', 'screenProgress', 'screenEnd', 'screenDone'].forEach(function (id) {
      if (el[id]) el[id].hidden = (id !== screenId);
    });
    window.scrollTo(0, 0);
  }

  function metresBetween(a, b) {
    var R = 6371000;
    var toRad = function (deg) { return deg * Math.PI / 180; };
    var dLat = toRad(b.lat - a.lat);
    var dLng = toRad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // The nearest zone anchor wins, and only inside the radius. With no anchor
  // placed, or no fix from the device, this returns nothing and the officer is
  // asked instead.
  function nearestZone() {
    if (!state.position) return null;
    var best = null;
    zones().forEach(function (zone) {
      if (zone.latitude == null || zone.longitude == null) return;
      var distance = metresBetween(state.position, { lat: Number(zone.latitude), lng: Number(zone.longitude) });
      if (distance > ANCHOR_RADIUS_M) return;
      if (!best || distance < best.distance) best = { zone: zone, distance: distance };
    });
    return best ? best.zone : null;
  }

  function capturePosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        function () {
          // No fix means no position. Generating one would put a fabricated
          // measurement into the record, which is worse than an absent one.
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  function applySessionIdentity() {
    if (el.startIdentity) {
      var institution = officerInstitution();
      el.startIdentity.textContent = 'Signed in as ' + officerName() +
        (institution ? ', ' + institution : '');
    }
    var nameEl = document.querySelector('.user-menu-name');
    if (nameEl) nameEl.textContent = officerName();
  }

  function renderTypeGrid() {
    if (!el.typeGrid) return;
    el.typeGrid.innerHTML = Survey.TYPES.map(function (type) {
      return '<button type="button" class="fo-type-btn" data-type="' + escapeHtml(type.id) + '">' +
        '<span class="fo-type-label">' + escapeHtml(type.label) + '</span>' +
        '<span class="fo-type-collects">' + escapeHtml(type.collects) + '</span>' +
        '</button>';
    }).join('');
  }

  function renderZoneChip() {
    if (!el.zoneChip) return;
    if (!state.zoneId) {
      el.zoneChip.textContent = 'Choose a monitoring zone';
      el.zoneChip.classList.add('fo-zone-chip--empty');
    } else {
      var origin = state.zoneSource === 'gps' ? 'from GPS' : 'set by hand';
      el.zoneChip.textContent = zoneLabel(state.zoneId) + ' · ' + origin;
      el.zoneChip.classList.remove('fo-zone-chip--empty');
    }
    if (el.zoneHelp) {
      el.zoneHelp.textContent = state.position
        ? 'Tap to change the zone.'
        : 'GPS is unavailable, so choose the zone manually.';
    }
  }

  function openZoneDialog(suggestedZoneId) {
    if (!el.zoneDialog || !el.zoneOptions) return;

    var covered = {};
    (state.survey ? state.survey.zones : []).forEach(function (zone) { covered[zone.zoneId] = true; });
    var fromGps = nearestZone();
    var suggestion = fromGps;
    if (!suggestion && suggestedZoneId) {
      suggestion = zones().filter(function (zone) { return zone.id === suggestedZoneId; })[0] || null;
    }
    var list = zones();

    if (!list.length) {
      el.zoneDialogText.textContent = 'No park zones are set up yet. Ask an admin to add them in Settings.';
      el.zoneOptions.innerHTML = '';
    } else {
      el.zoneDialogText.textContent = fromGps
        ? 'You appear to be at ' + (fromGps.short_name || fromGps.name) + '. Change it if that is wrong.'
        : (suggestion
            ? 'This is the only zone left on this walk, so it is highlighted. Change it if that is wrong.'
            : 'Pick the zone you are standing in.');
      el.zoneOptions.innerHTML = list.map(function (zone) {
        var isSuggestion = suggestion && suggestion.id === zone.id;
        var isCovered = covered[zone.id];
        return '<button type="button" class="fo-zone-option' + (isSuggestion ? ' fo-zone-option--suggested' : '') + '"' +
          ' data-zone="' + escapeHtml(zone.id) + '">' +
          '<span class="fo-zone-option-name">' + escapeHtml(zone.name || zone.id) + '</span>' +
          (isCovered ? '<span class="fo-zone-option-note">Already recorded on this walk</span>' : '') +
          '</button>';
      }).join('');
    }
    if (typeof el.zoneDialog.showModal === 'function') el.zoneDialog.showModal();
  }

  function chooseZone(zoneId, source) {
    state.zoneId = zoneId;
    state.zoneSource = source || 'manual';
    Survey.zoneOf(state.survey, zoneId, state.zoneSource);
    renderZoneChip();
    renderPanel();
  }

  function renderPanel() {
    var type = state.survey ? state.survey.surveyType : null;
    if (el.panelWildlife) el.panelWildlife.hidden = type !== 'wildlife_census';
    if (el.panelVegetation) el.panelVegetation.hidden = type !== 'vegetation';
    if (el.panelWater) el.panelWater.hidden = type !== 'water_quality';
    if (el.panelSoil) el.panelSoil.hidden = type !== 'soil_condition';

    if (type === 'wildlife_census') renderWildlifeRows();
    if (type === 'vegetation') renderVegetation();
    if (type === 'water_quality') renderWater();
    if (type === 'soil_condition') renderSoil();

    // Repopulate the note from the model. It used to keep whatever was typed for
    // the previous zone, and `collectZoneFields` then committed that text onto
    // the next zone the officer opened.
    if (el.zoneNote) {
      el.zoneNote.value = state.zoneId ? (Survey.zoneOf(state.survey, state.zoneId).note || '') : '';
    }
  }

  // One row per species per zone. Tapping a row reopens it, so seeing more
  // animals edits the record rather than adding a second one.
  function renderWildlifeRows() {
    if (!el.wildlifeRows) return;
    if (!state.zoneId) {
      el.wildlifeRows.innerHTML = '<div class="fo-empty-state"><strong>Choose a zone first</strong><span>Once the location is confirmed, you can add sightings or record a searched absence.</span></div>';
      return;
    }
    var rows = Survey.zoneOf(state.survey, state.zoneId).wildlife.species;
    if (!rows.length) {
      el.wildlifeRows.innerHTML = '<div class="fo-empty-state"><strong>No observations recorded in ' + escapeHtml(zoneLabel(state.zoneId)) + ' yet</strong><span>Use “Record a sighting” to begin this zone.</span></div>';
      return;
    }

    el.wildlifeRows.innerHTML = rows.map(function (row) {
      var key = escapeHtml(Survey.speciesKey(row));
      var absent = row.detection === Survey.STATE.notDetected;
      var detail = absent ? 'None seen' : (row.count + (row.count === 1 ? ' animal' : ' animals'));
      if (!absent && row.juveniles) {
        detail += ', ' + row.juveniles + ' juvenile' + (row.juveniles === 1 ? '' : 's');
      }
      if (row.confidence && row.confidence !== 'certain') detail += ' · ' + escapeHtml(row.confidence);
      var name = row.commonName || 'Unnamed';
      if (!row.speciesId) name += ' (not in the inventory)';

      return '<div class="fo-species-row' + (absent ? ' fo-species-row--absent' : '') + '">' +
        '<button type="button" class="fo-species-main" data-edit="' + key + '">' +
        '<span class="fo-species-name">' + escapeHtml(name) + '</span>' +
        '<span class="fo-species-detail">' + detail + '</span>' +
        '</button>' +
        '<button type="button" class="fo-species-clear" data-clear="' + key + '">Remove</button>' +
        '</div>';
    }).join('');
  }

  function renderVegetation() {
    if (!el.tapGrid) return;
    if (!state.zoneId) {
      // Half a panel is worse than an explanation. The counters used to vanish
      // with no word about why they were not there.
      el.tapGrid.innerHTML = '';
      if (el.tapTotal) el.tapTotal.textContent = 'Pick the zone you are in, then count what is under your toe.';
      if (el.grassHeight) el.grassHeight.value = '';
      if (el.swardRows) el.swardRows.innerHTML = '<p class="fo-empty">Pick the zone you are in first.</p>';
      return;
    }
    var taps = Survey.zoneOf(state.survey, state.zoneId).vegetation.taps;
    var labels = { grass: 'Grass', litter: 'Litter', bare: 'Bare soil', woody: 'Woody' };

    el.tapGrid.innerHTML = ['grass', 'litter', 'bare', 'woody'].map(function (name) {
      return '<div class="fo-tap" data-tap="' + name + '">' +
        '<span class="fo-tap-name">' + labels[name] + '</span>' +
        '<span class="fo-tap-count">' + taps[name] + '</span>' +
        '<div class="fo-tap-buttons">' +
        '<button type="button" class="fo-tap-add" data-tap-plus="' + name + '">Under my toe</button>' +
        '<button type="button" class="fo-stepper-btn" data-tap-minus="' + name + '" aria-label="One fewer ' + labels[name] + '">−</button>' +
        '</div></div>';
    }).join('');

    updateTapTotal();
    if (el.grassHeight) {
      el.grassHeight.value = Survey.zoneOf(state.survey, state.zoneId).vegetation.grassHeightMeanCm == null
        ? '' : Survey.zoneOf(state.survey, state.zoneId).vegetation.grassHeightMeanCm;
    }
    renderSwardRows();
  }

  // Updates the numbers in place. Rebuilding the grid on every tap destroyed the
  // focus ring on each of about a hundred taps, which made the counter unusable
  // from a keyboard and re-created every button on each press.
  function refreshTapCounts() {
    if (!el.tapGrid || !state.zoneId) return;
    var taps = Survey.zoneOf(state.survey, state.zoneId).vegetation.taps;
    Object.keys(taps).forEach(function (name) {
      var cell = el.tapGrid.querySelector('[data-tap="' + name + '"] .fo-tap-count');
      if (cell) cell.textContent = taps[name];
    });
    updateTapTotal();
  }

  function updateTapTotal() {
    if (!el.tapTotal || !state.zoneId) return;
    var cover = Survey.coverFromTaps(Survey.zoneOf(state.survey, state.zoneId).vegetation.taps);
    // Litter is named because it is one of the four counters and the soil survey
    // no longer records it, so this line is the only place it is reported.
    el.tapTotal.textContent = cover.total
      ? cover.total + ' points. Grass ' + cover.grassPct + ' percent, litter ' + cover.litterPct +
        ' percent, bare ' + cover.barePct + ' percent, woody ' + cover.woodyPct + ' percent.'
      : 'No taps yet. The percentage is worked out from the taps, so you never estimate it.';
  }

  function renderSwardRows() {
    if (!el.swardRows || !state.zoneId) return;
    var rows = Survey.zoneOf(state.survey, state.zoneId).vegetation.sward;
    if (!rows.length) {
      el.swardRows.innerHTML = '<p class="fo-empty">No grass species recorded in ' + escapeHtml(zoneLabel(state.zoneId)) + ' yet.</p>';
      return;
    }
    el.swardRows.innerHTML = rows.map(function (row) {
      return '<div class="fo-species-row">' +
        '<span class="fo-species-name">' + escapeHtml(speciesName(row.speciesId)) + '</span>' +
        '<span class="fo-role-tag">' + escapeHtml(roleLabel(row.role)) + '</span>' +
        '<button type="button" class="fo-species-clear" data-sward-clear="' + escapeHtml(row.speciesId) + '">Remove</button>' +
        '</div>';
    }).join('');
  }

  function setToggle(button, pressed, onText, offText) {
    if (!button) return;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    button.textContent = pressed ? onText : offText;
    button.classList.toggle('fo-toggle--on', !!pressed);
  }

  function renderWater() {
    if (!el.waterLevel || !state.zoneId) return;
    var water = Survey.zoneOf(state.survey, state.zoneId).water;
    el.waterLevel.value = water.levelPct == null ? '' : water.levelPct;
    el.waterFlow.value = water.flow || '';
    el.waterAppearance.value = water.appearance || '';
    el.waterBank.value = water.bankCondition || '';
    setToggle(el.waterOdour, water.odourOrFoam, 'Odour or foam seen', 'None seen');
  }

  function renderSoil() {
    if (!el.soilSurface || !state.zoneId) return;
    var soil = Survey.zoneOf(state.survey, state.zoneId).soil;
    el.soilSurface.value = soil.surfaceCondition || '';
    el.soilCompaction.value = soil.compaction || '';
    el.soilErosion.value = soil.erosionSigns || '';
  }

  function renderProgress() {
    if (!el.zoneList || !state.survey) return;
    var survey = state.survey;
    var summary = Survey.summary(survey);

    if (el.progressTitle) {
      el.progressTitle.textContent = Survey.typeFor(survey.surveyType).label + ' on ' + formatDay(survey.startedAt);
    }
    if (el.progressMeta) {
      el.progressMeta.textContent = summary.zones
        ? summary.zones + (summary.zones === 1 ? ' zone' : ' zones') + ', recorded by ' + survey.recordedBy
        : 'No zones recorded yet.';
    }

    el.zoneList.innerHTML = survey.zones.map(function (zone) {
      var lines = '';
      if (zone.wildlife) {
        lines = zone.wildlife.species.map(function (row) {
          var absent = row.detection === Survey.STATE.notDetected;
          return '<li>' + escapeHtml(row.commonName || 'Unnamed') + ' ' +
            (absent ? 'none seen' : escapeHtml(String(row.count))) + '</li>';
        }).join('');
        if (!lines) lines = '<li class="fo-zone-none">Nothing recorded</li>';
      }
      if (zone.vegetation) {
        var cover = Survey.coverFromTaps(zone.vegetation.taps);
        lines = '<li>' + (cover.total ? 'Grass ' + cover.grassPct + ' percent of ' + cover.total + ' points' : 'No taps') + '</li>';
        if (zone.vegetation.grassHeightMeanCm != null) {
          lines += '<li>Mean height ' + zone.vegetation.grassHeightMeanCm + ' cm</li>';
        }
        zone.vegetation.sward.forEach(function (row) {
          lines += '<li>' + escapeHtml(roleLabel(row.role)) + ': ' + escapeHtml(speciesName(row.speciesId)) + '</li>';
        });
      }
      if (zone.water) {
        var bits = [];
        if (zone.water.levelPct != null) bits.push(zone.water.levelPct + ' percent full');
        if (zone.water.flow) bits.push(zone.water.flow);
        if (zone.water.appearance) bits.push(zone.water.appearance);
        if (zone.water.bankCondition) bits.push('bank ' + zone.water.bankCondition);
        lines = '<li>' + (bits.length ? escapeHtml(bits.join(', ')) : 'Nothing recorded') + '</li>';
      }
      if (zone.soil) {
        var soilBits = [];
        if (zone.soil.surfaceCondition) soilBits.push('surface ' + zone.soil.surfaceCondition);
        if (zone.soil.compaction) soilBits.push('compaction ' + zone.soil.compaction);
        if (zone.soil.erosionSigns) soilBits.push('erosion ' + zone.soil.erosionSigns);
        lines = '<li>' + (soilBits.length ? escapeHtml(soilBits.join(', ')) : 'Nothing recorded') + '</li>';
      }

      return '<div class="fo-zone-card">' +
        '<div class="fo-zone-card-head">' +
        '<span class="fo-zone-card-name">' + escapeHtml(zoneLabel(zone.zoneId)) + '</span>' +
        '<span class="fo-zone-card-origin">' + (zone.zoneSource === 'gps' ? 'from GPS' : 'set by hand') + '</span>' +
        '</div>' +
        '<ul class="fo-zone-card-lines">' + lines + '</ul>' +
        (zone.note ? '<p class="fo-zone-card-note">' + escapeHtml(zone.note) + '</p>' : '') +
        '</div>';
    }).join('');
  }

  function renderEnd() {
    if (!el.endSummary || !state.survey) return;
    var summary = Survey.summary(state.survey);
    var parts = [];

    if (el.endMeta) {
      // Measured from now, not from `endedAt`: the survey is still open at this
      // point, so reading the end time gave a blank where the officer most wants
      // to know how long they have been out.
      var startedMs = Date.parse(state.survey.startedAt);
      var soFar = isNaN(startedMs) ? null : Math.round((Date.now() - startedMs) / 60000);
      el.endMeta.textContent = 'Started ' + formatClock(state.survey.startedAt) +
        (soFar == null ? '' : ', ' + minutesText(soFar) + ' so far');
    }

    parts.push('<p>Zones: ' + (summary.zones
      ? state.survey.zones.map(function (zone) { return escapeHtml(zoneLabel(zone.zoneId)); }).join(', ')
      : 'none recorded') + '</p>');

    if (state.survey.surveyType === 'wildlife_census') {
      parts.push('<p>' + summary.speciesRecorded + ' species recorded, ' + summary.speciesNotSeen +
        ' searched and not seen, ' + summary.animals + ' animals in total.</p>');
    }

    el.endSummary.innerHTML = parts.join('');
  }

  // Species picker. Matches come from the registry; the escape hatch accepts a
  // typed name for a taxon genuinely absent from it.
  function openSpeciesDialog(role, editingKey) {
    state.speciesDraft = { role: role || 'present', editingKey: editingKey || null };
    if (el.speciesSearch) el.speciesSearch.value = '';
    if (el.speciesMatches) el.speciesMatches.innerHTML = '';
    if (el.escapeHatch) el.escapeHatch.hidden = true;
    renderSpeciesMatches();
    if (typeof el.speciesDialog.showModal === 'function') el.speciesDialog.showModal();
    if (el.speciesSearch) el.speciesSearch.focus();
  }

  function renderSpeciesMatches() {
    if (!el.speciesMatches || !el.speciesSearch) return;
    var query = el.speciesSearch.value.trim().toLowerCase();
    var wanted = expectedTaxonType();
    var matches = registry().filter(function (item) {
      if (wanted && item.taxon_type && item.taxon_type !== wanted) return false;
      if (!query) return true;
      var hay = ((item.common_name || '') + ' ' + (item.scientific_name || '') + ' ' + (item.id || '')).toLowerCase();
      return hay.indexOf(query) !== -1;
    }).slice(0, 12);

    el.speciesMatches.innerHTML = matches.map(function (item) {
      return '<button type="button" class="fo-species-option" data-species="' + escapeHtml(item.id) + '">' +
        '<span class="fo-species-option-name">' + escapeHtml(item.common_name || item.scientific_name) + '</span>' +
        '<span class="fo-species-option-sci">' + escapeHtml(item.scientific_name || '') + '</span>' +
        '</button>';
    }).join('');

    if (!el.escapeHatch) return;
    var typed = el.speciesSearch.value.trim();
    var exact = matches.some(function (item) {
      return (item.common_name || '').toLowerCase() === query;
    });

    // Only a wildlife census can take a typed name. The sward list needs a
    // registry reference, because a plant cannot be recorded as free text and
    // then grouped by anything. Offering the hatch there promised something the
    // model refuses.
    if (typed.length < 3 || exact || expectedTaxonType() !== 'fauna') {
      el.escapeHatch.hidden = true;
      return;
    }
    el.escapeHatch.hidden = false;
    el.escapeHatchText.textContent = '"' + typed + '" is not in the park inventory. It will be recorded as you typed it, and an admin will be asked to review it.';
    el.btnUseTypedName.textContent = 'Record "' + typed + '"';
  }

  function chooseSpecies(speciesId) {
    var draft = state.speciesDraft;
    if (state.survey.surveyType === 'vegetation') {
      Survey.addSwardSpecies(state.survey, state.zoneId, speciesId, draft.role);
      renderSwardRows();
      closeDialog(el.speciesDialog);
      return;
    }
    var match = registry().filter(function (item) { return item.id === speciesId; })[0] || {};
    closeDialog(el.speciesDialog);
    openCountDialog({
      speciesId: speciesId,
      commonName: match.common_name || match.scientific_name || speciesId,
      scientificName: match.scientific_name || ''
    });
  }

  function openCountDialog(draft) {
    state.speciesDraft = draft;
    // Looked up by species key rather than by whether a row was tapped open.
    // Recording an existing species through the picker used to reset its count
    // to the default of 1, silently losing the number it already had.
    var existing = Survey.speciesInZone(state.survey, state.zoneId, {
      speciesId: draft.speciesId,
      commonName: draft.commonName
    });

    if (el.confirmTitle) el.confirmTitle.textContent = 'How many ' + draft.commonName + '?';
    if (el.confirmText) {
      el.confirmText.innerHTML =
        '<span class="fo-count-line">' +
        '<button type="button" class="fo-stepper-btn" id="draftMinus" aria-label="One fewer">−</button>' +
        '<input type="number" min="0" step="1" id="draftCount" class="fo-input fo-count-input" value="' +
        (existing ? existing.count : 1) + '">' +
        '<button type="button" class="fo-stepper-btn" id="draftPlus" aria-label="One more">+</button>' +
        '</span>' +
        '<label class="fo-checkbox"><input type="checkbox" id="draftAbsent"> I searched and saw none</label>' +
        '<span class="fo-helper">A zone you searched and found empty is recorded as none seen, which is a different fact from leaving it out.</span>';
    }
    if (el.btnConfirmYes) el.btnConfirmYes.textContent = 'Record it';
    if (el.btnConfirmNo) el.btnConfirmNo.textContent = 'Cancel';
    el.confirmDialog.setAttribute('data-mode', 'count');
    if (typeof el.confirmDialog.showModal === 'function') el.confirmDialog.showModal();
  }

  function saveCount() {
    var countEl = $('draftCount');
    var absentEl = $('draftAbsent');
    var draft = state.speciesDraft;
    var payload = {
      speciesId: draft.speciesId || null,
      commonName: draft.commonName,
      scientificName: draft.scientificName || ''
    };

    try {
      if (absentEl && absentEl.checked) {
        Survey.markNotSeen(state.survey, state.zoneId, payload);
        showToast('None seen recorded for ' + draft.commonName + ' in ' + zoneLabel(state.zoneId) + '.');
      } else {
        payload.count = countEl ? countEl.value : 1;
        Survey.recordSpecies(state.survey, state.zoneId, payload);
        showToast(draft.commonName + ' recorded in ' + zoneLabel(state.zoneId) + '.');
      }
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    closeDialog(el.confirmDialog);
    renderWildlifeRows();
  }

  function closeDialog(dialog) {
    if (dialog && typeof dialog.close === 'function' && dialog.open) dialog.close();
  }

  function collectZoneFields() {
    var type = state.survey.surveyType;
    if (type === 'vegetation' && el.grassHeight) {
      Survey.setGrassHeight(state.survey, state.zoneId, el.grassHeight.value);
    }
    if (type === 'water_quality') {
      Survey.setWater(state.survey, state.zoneId, {
        levelPct: el.waterLevel.value === '' ? null : el.waterLevel.value,
        flow: el.waterFlow.value || null,
        appearance: el.waterAppearance.value || null,
        bankCondition: el.waterBank.value || null,
        odourOrFoam: el.waterOdour.getAttribute('aria-pressed') === 'true'
      });
    }
    if (type === 'soil_condition') {
      Survey.setSoil(state.survey, state.zoneId, {
        surfaceCondition: el.soilSurface.value || null,
        compaction: el.soilCompaction.value || null,
        erosionSigns: el.soilErosion.value || null
      });
    }
    if (el.zoneNote) Survey.setNote(state.survey, state.zoneId, el.zoneNote.value);
  }

  function hasContent(zone) {
    if (zone.wildlife) return zone.wildlife.species.length > 0;
    if (zone.vegetation) {
      return Survey.coverFromTaps(zone.vegetation.taps).total > 0 || zone.vegetation.sward.length > 0;
    }
    if (zone.water) {
      return zone.water.levelPct != null || !!zone.water.flow || !!zone.water.appearance || !!zone.water.bankCondition;
    }
    if (zone.soil) {
      return !!zone.soil.surfaceCondition || !!zone.soil.compaction || !!zone.soil.erosionSigns;
    }
    return false;
  }

  function saveZone() {
    if (!state.zoneId) {
      showToast('Pick the zone you are in before saving it.', 'error');
      openZoneDialog();
      return;
    }

    // Collect BEFORE judging the zone empty. `collectZoneFields` is the only
    // writer of the water, soil, height and note values, so guarding on the model
    // first made those four fields unsaveable: the zone always looked empty and
    // water and soil walks could never leave this screen at all.
    try {
      collectZoneFields();
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    var zone = Survey.zoneOf(state.survey, state.zoneId);
    if (!hasContent(zone) && !zone.note) {
      showToast('Nothing recorded for ' + zoneLabel(state.zoneId) + ' yet. Add what you saw there, or pick another zone.', 'error');
      return;
    }

    Survey.markZoneRecorded(state.survey, state.zoneId, nowIso());
    renderProgress();
    show('screenProgress');
  }

  function openZoneForRecording() {
    var uncovered = zones().filter(function (zone) {
      return !state.survey.zones.some(function (covered) { return covered.zoneId === zone.id; });
    });
    var suggestion = nearestZone();

    // With a fix the zone is placed and the chip says so. Without one the officer
    // always confirms: silently selecting the only remaining zone and stamping it
    // "set by hand" claimed a choice nobody made.
    if (suggestion) {
      chooseZone(suggestion.id, 'gps');
      show('screenForm');
      return;
    }

    renderZoneChip();
    renderPanel();
    openZoneDialog(uncovered.length === 1 ? uncovered[0].id : null);
    show('screenForm');
  }

  function buildPayload() {
    var survey = state.survey;
    var zone = state.zoneId ? Survey.zoneOf(survey, state.zoneId) : null;
    var zoneRow = zone ? zoneById(zone.zoneId) : null;

    // Read the park and the habitat off the site record instead of retyping them
    // here. The old block hard-coded the park, the habitat and the city, and the
    // observation row then carried them as measured at that spot.
    // Province and city are constants of this deployment: no site record holds
    // them yet, and every zone in this park is inside the same two.
    var context = {
      latitude: state.position ? state.position.lat : null,
      longitude: state.position ? state.position.lng : null,
      focusArea: zoneRow ? parentSiteName(zoneRow) : null,
      habitatType: zoneRow ? (zoneRow.habitat_type_default || '') : '',
      administrativeArea: 'Copperbelt Province',
      city: 'Kitwe'
    };

    return {
      surveyRow: Survey.toSurveyRow(survey),
      zoneRows: Survey.toSurveyZoneRows(survey),
      observationRows: Survey.toObservationRows(survey, { context: context }),
      readingRows: survey.zones.map(function (zone) {
        return Survey.toReadingRow(survey, zone);
      }).filter(Boolean),
      swardRows: survey.surveyType === 'vegetation'
        ? survey.zones.reduce(function (all, zone) {
            return all.concat(Survey.toSwardRows(survey, zone));
          }, [])
        : []
    };
  }

  function submitWalk() {
    // A second tap while the first send is still in flight posts the walk twice:
    // two survey upserts race and the zone rows are written against whichever
    // returned last.
    if (state.sending) return;

    var survey = state.survey;
    var where = survey.zones.map(function (zone) { return zoneLabel(zone.zoneId); }).join(' and ') || 'no zone';
    var what = Survey.typeFor(survey.surveyType).label.toLowerCase();

    try {
      Survey.endSurvey(survey, {
        endedAt: nowIso(),
        distanceM: el.endDistance && el.endDistance.value !== '' ? el.endDistance.value : null,
        rainfallOfficerFlag: state.rainedOn
      });
    } catch (err) {
      showToast(err.message, 'error');
      return;
    }

    // Summarised AFTER ending. Duration is derived from the end time, so reading
    // it before `endSurvey` always reported nothing.
    var summary = Survey.summary(survey);

    if (!window.BioSync || typeof window.BioSync.submitSurvey !== 'function') {
      showToast('This walk has not been sent: this page cannot reach the record store. Keep this screen open and do not reload.', 'error');
      return;
    }

    state.sending = true;
    window.BioSync.submitSurvey(buildPayload()).then(function () {
      if (el.doneTitle) el.doneTitle.textContent = 'Walk recorded';
      if (el.doneText) {
        el.doneText.textContent = 'A ' + what + ' covering ' + where + ', recorded by ' +
          survey.recordedBy + ' on ' + formatDay(survey.startedAt) +
          (summary.durationMinutes == null ? '' : ', ' + minutesText(summary.durationMinutes)) + '.';
      }
      show('screenDone');
    }).catch(function (err) {
      // The send failed, so the walk can be sent again. Leaving the flag set would
      // make the retry the copy asks for silently do nothing.
      state.sending = false;
      // The walk is only in memory, so the copy must not promise it is stored.
      // Saying so was a lie in a field app where a reload is one tap away.
      showToast('The walk was not sent: ' +
        (err && err.message ? err.message : 'unknown error') +
        '. It is still open on this screen, so try End survey again.', 'error');
    });
  }

  function startSurvey(surveyType) {
    // The send guard belongs to one walk, not to the session. Leaving it set
    // after a successful send made every later walk in the same session silently
    // impossible to submit, which is what happened on the second walk recorded.
    state.sending = false;

    state.survey = Survey.createSurvey({
      surveyType: surveyType,
      startedAt: nowIso(),
      recordedBy: officerName(),
      userId: officerId(),
      institutionName: officerInstitution()
    });
    state.zoneId = null;
    state.zoneSource = null;
    state.rainedOn = false;

    var type = Survey.typeFor(surveyType);
    if (el.formTypeTitle) el.formTypeTitle.textContent = type.label;
    if (el.formMeta) {
      el.formMeta.textContent = 'Started ' + formatClock(state.survey.startedAt) + ', recorded by ' + state.survey.recordedBy;
    }

    renderZoneChip();
    openZoneForRecording();

    capturePosition().then(function (position) {
      state.position = position;
      var suggestion = nearestZone();

      // Only place the officer if they have not already chosen. A late fix used to
      // overwrite a hand-picked zone and silently re-file everything already
      // recorded in that panel under a different zone.
      if (suggestion && state.zoneId === null) {
        chooseZone(suggestion.id, 'gps');
        showToast('You are at ' + (suggestion.short_name || suggestion.name) + '. Change it if that is wrong.');
        return;
      }
      renderZoneChip();
    });
  }

  function wireEvents() {
    if (el.typeGrid) {
      el.typeGrid.addEventListener('click', function (event) {
        var button = event.target.closest('[data-type]');
        if (button) startSurvey(button.getAttribute('data-type'));
      });
    }

    if (el.zoneChip) el.zoneChip.addEventListener('click', openZoneDialog);

    if (el.zoneOptions) {
      el.zoneOptions.addEventListener('click', function (event) {
        var button = event.target.closest('[data-zone]');
        if (!button) return;
        var chosen = button.getAttribute('data-zone');
        var suggestion = nearestZone();
        chooseZone(chosen, suggestion && suggestion.id === chosen ? 'gps' : 'manual');
        closeDialog(el.zoneDialog);
      });
    }

    if (el.btnZoneCancel) el.btnZoneCancel.addEventListener('click', function () { closeDialog(el.zoneDialog); });
    if (el.btnSpeciesCancel) el.btnSpeciesCancel.addEventListener('click', function () { closeDialog(el.speciesDialog); });

    if (el.btnAddSpecies) {
      el.btnAddSpecies.addEventListener('click', function () {
        if (!state.zoneId) {
          showToast('Pick the zone first, so the record says where you were.', 'error');
          openZoneDialog();
          return;
        }
        openSpeciesDialog('present', null);
      });
    }

    if (el.btnAddSward) {
      el.btnAddSward.addEventListener('click', function () {
        // Saying nothing when no zone is open made the button look broken.
        if (!state.zoneId) {
          showToast('Pick the zone first, so the record says where you were.', 'error');
          openZoneDialog();
          return;
        }
        openSpeciesDialog('dominant', null);
      });
    }

    if (el.speciesSearch) {
      el.speciesSearch.addEventListener('input', renderSpeciesMatches);
      el.speciesSearch.addEventListener('focus', renderSpeciesMatches);
    }

    if (el.speciesMatches) {
      el.speciesMatches.addEventListener('click', function (event) {
        var button = event.target.closest('[data-species]');
        if (button) chooseSpecies(button.getAttribute('data-species'));
      });
    }

    if (el.btnUseTypedName) {
      el.btnUseTypedName.addEventListener('click', function () {
        var typed = (el.speciesSearch.value || '').trim();
        if (!typed || expectedTaxonType() !== 'fauna') return;
        closeDialog(el.speciesDialog);
        openCountDialog({ speciesId: null, commonName: typed, scientificName: '' });
      });
    }

    if (el.wildlifeRows) {
      el.wildlifeRows.addEventListener('click', function (event) {
        var rows = Survey.zoneOf(state.survey, state.zoneId).wildlife.species;
        var findByKey = function (key) {
          return rows.filter(function (item) { return Survey.speciesKey(item) === key; })[0];
        };

        var edit = event.target.closest('[data-edit]');
        if (edit) {
          var row = findByKey(edit.getAttribute('data-edit'));
          if (row) {
            openCountDialog({
              speciesId: row.speciesId,
              commonName: row.commonName,
              scientificName: row.scientificName,
              editingKey: Survey.speciesKey(row)
            });
          }
          return;
        }

        var clear = event.target.closest('[data-clear]');
        if (clear) {
          var target = findByKey(clear.getAttribute('data-clear'));
          if (target) {
            Survey.clearSpecies(state.survey, state.zoneId, target);
            renderWildlifeRows();
          }
        }
      });
    }

    if (el.swardRows) {
      el.swardRows.addEventListener('click', function (event) {
        var clear = event.target.closest('[data-sward-clear]');
        if (!clear) return;
        Survey.removeSwardSpecies(state.survey, state.zoneId, clear.getAttribute('data-sward-clear'));
        renderSwardRows();
      });
    }

    if (el.tapGrid) {
      el.tapGrid.addEventListener('click', function (event) {
        if (!state.zoneId) return;
        var plus = event.target.closest('[data-tap-plus]');
        var minus = event.target.closest('[data-tap-minus]');
        if (!plus && !minus) return;

        var current = Object.assign({}, Survey.zoneOf(state.survey, state.zoneId).vegetation.taps);
        var name = plus ? plus.getAttribute('data-tap-plus') : minus.getAttribute('data-tap-minus');
        current[name] = Math.max(0, (current[name] || 0) + (plus ? 1 : -1));
        Survey.setTaps(state.survey, state.zoneId, current);
        refreshTapCounts();
      });
    }

    if (el.waterOdour) {
      el.waterOdour.addEventListener('click', function () {
        var on = el.waterOdour.getAttribute('aria-pressed') === 'true';
        setToggle(el.waterOdour, !on, 'Odour or foam seen', 'None seen');
      });
    }

    if (el.rainFlag) {
      el.rainFlag.addEventListener('click', function () {
        state.rainedOn = !state.rainedOn;
        setToggle(el.rainFlag, state.rainedOn, 'Rained on this walk', 'Not rained on');
      });
    }

    if (el.btnDoneZone) el.btnDoneZone.addEventListener('click', saveZone);
    if (el.btnAnotherZone) el.btnAnotherZone.addEventListener('click', openZoneForRecording);

    if (el.btnLeaveWalk) {
      el.btnLeaveWalk.addEventListener('click', function () {
        state.survey = null;
        state.zoneId = null;
        show('screenStart');
      });
    }

    if (el.btnEndSurvey) {
      el.btnEndSurvey.addEventListener('click', function () {
        renderEnd();
        show('screenEnd');
      });
    }
    if (el.btnBackToProgress) el.btnBackToProgress.addEventListener('click', function () { show('screenProgress'); });
    if (el.btnConfirmEnd) el.btnConfirmEnd.addEventListener('click', submitWalk);

    if (el.btnNewWalk) {
      el.btnNewWalk.addEventListener('click', function () {
        state.survey = null;
        state.zoneId = null;
        state.position = null;
        state.rainedOn = false;
        if (el.endDistance) el.endDistance.value = '';
        setToggle(el.rainFlag, false, 'Rained on this walk', 'Not rained on');
        show('screenStart');
      });
    }

    if (el.confirmText) {
      el.confirmText.addEventListener('click', function (event) {
        var count = $('draftCount');
        if (!count) return;
        if (event.target.closest('#draftMinus')) count.value = Math.max(0, (parseInt(count.value, 10) || 0) - 1);
        if (event.target.closest('#draftPlus')) count.value = (parseInt(count.value, 10) || 0) + 1;
      });
    }

    if (el.btnConfirmYes) {
      el.btnConfirmYes.addEventListener('click', function () {
        if (el.confirmDialog.getAttribute('data-mode') === 'count') saveCount();
      });
    }
    if (el.btnConfirmNo) el.btnConfirmNo.addEventListener('click', function () { closeDialog(el.confirmDialog); });
  }

  function cacheElements() {
    [
      'startIdentity', 'typeGrid',
      'screenStart', 'screenForm', 'screenProgress', 'screenEnd', 'screenDone',
      'formTypeTitle', 'formMeta', 'zoneChip', 'zoneHelp', 'typeFields',
      'panelWildlife', 'panelVegetation', 'panelWater', 'panelSoil',
      'wildlifeRows', 'btnAddSpecies', 'tapGrid', 'tapTotal', 'grassHeight',
      'swardRows', 'btnAddSward', 'waterLevel', 'waterFlow', 'waterAppearance',
      'waterBank', 'waterOdour', 'soilSurface', 'soilCompaction', 'soilErosion',
      'zoneNote', 'btnLeaveWalk', 'btnDoneZone', 'progressTitle', 'progressMeta',
      'zoneList', 'btnAnotherZone', 'btnEndSurvey', 'endMeta', 'endDistance',
      'rainFlag', 'endSummary', 'btnBackToProgress', 'btnConfirmEnd',
      'doneTitle', 'doneText', 'btnNewWalk',
      'zoneDialog', 'zoneDialogText', 'zoneOptions', 'btnZoneCancel',
      'speciesDialog', 'speciesSearch', 'speciesMatches', 'escapeHatch',
      'escapeHatchText', 'btnUseTypedName', 'btnSpeciesCancel',
      'confirmDialog', 'confirmTitle', 'confirmText', 'btnConfirmYes', 'btnConfirmNo'
    ].forEach(function (id) { el[id] = $(id); });
  }

  function init() {
    if (!document.querySelector('.page-fieldofficer-v2')) return;
    if (!Survey) return;

    cacheElements();
    applySessionIdentity();
    renderTypeGrid();
    renderZoneChip();
    wireEvents();
    show('screenStart');

    if (store() && typeof store().subscribe === 'function') {
      store().subscribe('session:changed', applySessionIdentity);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
