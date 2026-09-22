/* The ecological state: what the park can currently carry, and where every number
   behind that answer came from. Read only, and derived values are never stored.

   The chain this page closes is the whole point of the survey rework:
     a vegetation walk records taps
     -> cover is a ratio of those taps, computed here and never written down
     -> the Register supplies the line that turns cover into standing forage
     -> capacity compares that supply with the demand of the counted animals
   Every step carries an origin, and a step with no origin is reported as missing
   rather than assumed. */

(function () {
  'use strict';

  var el = {};
  var state = { plane: null, register: null };

  var REFERENCE_SPECIES = 'sp_007';

  // The recorded assessment per zone, kept so a what-if can be recomputed from the
  // same inputs rather than a second copy that could drift away from them.
  var zoneData = {};
  // zoneId -> { speciesId: count }. Empty means "show what was recorded".
  var whatIf = {};

  // The record plane holds every survey ever backfilled, which on this project is
  // 211 rows and 209 of them are the same legacy import. Rendering all of them
  // buries the handful of walks that carry readings, so the table is a window onto
  // the newest and says out loud how many it is not showing.
  var WALKS_SHOWN = 20;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    if (window.BioEscape && window.BioEscape.escapeHtml) return window.BioEscape.escapeHtml(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function num(value, places) {
    var parsed = typeof value === 'number' ? value : parseFloat(value);
    if (value == null || isNaN(parsed)) return 'not recorded';
    var factor = Math.pow(10, places == null ? 1 : places);
    return String(Math.round(parsed * factor) / factor);
  }

  function dayOf(value) {
    if (!value) return 'not recorded';
    var d = new Date(value);
    return isNaN(d.getTime()) ? 'not recorded' : d.toISOString().slice(0, 10);
  }

  function registry(kind) {
    var data = window.BioData;
    if (!data) return [];
    var rows = (kind === 'species' ? data.getSpeciesRegistry() : data.getSiteRegistry()) || [];
    return rows;
  }

  function zones() {
    return registry('site').filter(function (site) { return site && site.kind === 'zone'; });
  }

  function zoneLabel(zoneId) {
    var found = zones().filter(function (zone) { return zone.id === zoneId; })[0];
    return found ? (found.short_name || found.name || zoneId) : String(zoneId || '');
  }

  function speciesLabel(speciesId) {
    var found = registry('species').filter(function (item) { return item.id === speciesId; })[0];
    return found ? (found.common_name || found.scientific_name || speciesId) : String(speciesId || '');
  }

  // A park scoped Register value: the fallback the engine descends to when no
  // more specific row matches.
  function parkValue(values, key) {
    var rows = (values || []).filter(function (row) {
      return row.parameter_key === key && !row.scope_zone_id && !row.scope_species_id && !row.scope_season;
    });
    return rows.length ? rows[rows.length - 1] : null;
  }

  // The cover to forage line. Without it a tap count stays a tap count, so the
  // absent case is reported rather than defaulted.
  function calibration(values) {
    var slope = parkValue(values, 'cover_to_forage_slope');
    var intercept = parkValue(values, 'cover_to_forage_intercept');
    if (!slope || !intercept || slope.value_num == null || intercept.value_num == null) return null;
    return { slope: slope.value_num, intercept: intercept.value_num };
  }

  /* A vegetation walk measures cover, which is a fact about the ground. Turning
     it into an amount of grass needs the Register's line, and the result arrives
     as a zone scoped row. Zone scoped beats the park wide placeholder on
     specificity alone, so a measured walk always wins without any special case.
     `authority` is set to admin purely as a ranking device, because a measurement
     is the strongest evidence on the page and should also win a tie. It is not a
     claim about who typed anything. */
  function measuredForageRows(values, plane) {
    var line = calibration(values);
    if (!line || !window.BioSurvey) return [];
    var out = [];
    (plane.vegetation || []).forEach(function (reading) {
      var cover = window.BioSurvey.coverFromTaps({
        grass: reading.grass_hits,
        litter: reading.litter_hits,
        bare: reading.bare_hits,
        woody: reading.woody_hits
      });
      var forage = window.BioSurvey.standingForageFromCover(cover.grassPct, line);
      if (forage == null || !reading.zone_id) return;
      out.push({
        parameter_key: 'standing_forage_kg_per_ha',
        scope_species_id: null,
        scope_zone_id: reading.zone_id,
        scope_season: null,
        value_num: forage,
        source: 'Measured on a vegetation walk, ' + num(cover.grassPct, 1) + ' per cent grass cover',
        provenance: 'measured',
        authority: 'admin',
        measuredCoverPct: cover.grassPct
      });
    });
    return out;
  }

  function verdictLabel(verdict) {
    if (verdict === 'within_capacity') return 'Within what the sward can give';
    if (verdict === 'above_capacity') return 'Above what the sward can give';
    if (verdict === 'cannot_conclude') return 'Not proven either way';
    return 'Cannot be assessed yet';
  }

  function verdictTone(verdict) {
    if (verdict === 'within_capacity') return 'ok';
    if (verdict === 'above_capacity') return 'bad';
    if (verdict === 'cannot_conclude') return 'partial';
    return 'unknown';
  }

  function inputRow(item) {
    if (item.missing) {
      return '<tr class="state-row-missing">' +
        '<td>' + esc(item.label) + '</td>' +
        '<td>' + esc(item.unit) + '</td>' +
        '<td>Not recorded</td>' +
        '<td>The assessment is waiting for this</td>' +
        '</tr>';
    }
    var shown = item.value != null
      ? num(item.value, item.unit === 'fraction' || item.unit === 'kg DM/day' ? 2 : 1)
      : num(item.min, 1) + ' to ' + num(item.max, 1);
    return '<tr>' +
      '<td>' + esc(item.label) + '</td>' +
      '<td>' + esc(item.unit) + '</td>' +
      '<td>' + esc(shown) + '</td>' +
      '<td>' + esc(item.source) + ' <span class="state-kind state-kind--' + esc(item.kind || 'unknown') + '">' + esc(item.kind || 'no origin') + '</span></td>' +
      '</tr>';
  }

  // The headline for a result, in the words the reader needs. Kept out of the
  // card markup because the what-if recomputes it in place.
  function headlineFor(result) {
    if (result.verdict === 'above_capacity') {
      return 'The standing forage covers ' + num(result.sustainsDays, 1) + ' days of the ' +
        num(result.drySeasonDays, 0) + ' still to run, a shortfall of ' + num(result.shortfallPct, 0) +
        ' per cent. The constraint is ' + esc(result.bindsOn || 'unknown') + '.';
    }
    if (result.verdict === 'within_capacity') {
      return 'The standing forage covers the ' + num(result.drySeasonDays, 0) + ' days of dry season still to run.';
    }
    if (result.verdict === 'cannot_conclude') {
      return 'The forage would last ' + num(result.sustainsDays, 1) + ' days against the animals that were ' +
        'counted, which is longer than the ' + num(result.drySeasonDays, 0) + ' days of dry season left. ' +
        'It is not proven either way, because the species nobody counted could still tip it over.';
    }
    if (result.reason === 'no_demand') {
      return 'No count here is recent enough to use, so there is nothing to weigh the forage against.';
    }
    if (result.reason === 'missing_supply') {
      return 'The forage available cannot be worked out yet, so there is nothing to compare the demand against.';
    }
    return 'Not enough recorded here yet.';
  }

  /* The couplings that the changed species takes part in. This is what turns the
     what-if from a sum into an answer: the arithmetic says how much less grass is
     left, and this says what that does to the other animals and to the ground. */
  function couplingsHtml(overrides) {
    if (!overrides) return '';
    var rows = [];
    (state.register.relationships || []).forEach(function (row) {
      if (overrides[row.from_species_id] == null) return;
      var target = row.to_kind === 'species'
        ? speciesLabel(row.to_species_id)
        : String(row.to_resource || '').replace(/_/g, ' ');
      var verb = row.direction === 'down' ? 'presses down on' : (row.direction === 'up' ? 'raises' : 'affects');
      rows.push('<li><strong>' + esc(speciesLabel(row.from_species_id)) + '</strong> ' + esc(verb) + ' ' +
        esc(target) + ': ' + esc(row.mechanism) + '</li>');
    });
    if (!rows.length) return '';
    return '<div class="state-mechanisms"><p class="state-note">What that change also does, from the Register:</p>' +
      '<ul>' + rows.join('') + '</ul></div>';
  }

  // Everything that changes when a count changes. The species inputs are NOT in
  // here, so replacing this markup cannot steal focus from a field being typed in.
  function figuresHtml(result, isWhatIf, overrides) {
    var figures = '<dl class="state-figures">' +
      '<div><dt>Forage available</dt><dd>' + num(result.forageAvailable, 0) + ' <span>kg DM</span></dd></div>' +
      '<div><dt>' + (result.demandBasis === 'at_least' ? 'Demand, at least' : 'Daily demand') + '</dt><dd>' +
        num(result.dailyDemand, 1) + ' <span>kg DM/day</span></dd></div>' +
      '<div><dt>Lasts</dt><dd>' + (result.sustainsDays == null ? 'not worked out' : num(result.sustainsDays, 1) + ' <span>days</span>') + '</dd></div>' +
      '<div><dt>Dry season left</dt><dd>' + (result.drySeasonDays == null ? 'not recorded' : num(result.drySeasonDays, 0) + ' <span>days</span>') + '</dd></div>' +
      '</dl>';

    var equivalents = '';
    if (result.zebraEquivalents) {
      equivalents = '<p class="state-note">Holds ' + num(result.zebraEquivalents.carried, 1) +
        ' zebra equivalents against a supportable ' + num(result.zebraEquivalents.supportable, 1) + '.</p>';
    }

    // The gaps, in the direction they lean. A number that does not say whether it is
    // a floor or a measurement is a claim, not a reading.
    var caveats = '';
    if ((result.caveats || []).length) {
      caveats = '<ul class="state-caveats">' + result.caveats.map(function (text) {
        return '<li>' + esc(text) + '</li>';
      }).join('') + '</ul>';
    }

    var partial = result.demandBasis === 'at_least'
      ? '<span class="state-verdict state-verdict--partial">' +
        (result.countedSpecies || []).length + ' of ' +
        ((result.countedSpecies || []).length + (result.excludedSpecies || []).length) + ' species counted</span>'
      : '';

    return '<div class="state-zone-headline">' +
        '<span class="state-verdict state-verdict--' + verdictTone(result.verdict) + '">' + esc(verdictLabel(result.verdict)) + '</span>' +
        (isWhatIf ? '<span class="state-verdict state-verdict--whatif">What if</span>' : '') +
        partial +
      '</div>' +
      '<p class="state-zone-lede">' + (isWhatIf ? 'If the counts were as set here: ' : '') + headlineFor(result) + '</p>' +
      figures + caveats + equivalents + couplingsHtml(overrides);
  }

  function zoneCard(zone, result, population) {
    var measured = (result.inputs || []).some(function (item) {
      return item.kind === 'measured' && item.key === 'standing_forage_kg_per_ha';
    });

    return '<article class="state-zone">' +
      '<div class="state-zone-head">' +
      '<h3 class="state-zone-name">' + esc(zoneLabel(zone.id)) + '</h3>' +
      (measured ? '<span class="state-verdict state-verdict--measured">Forage measured on a walk</span>' : '') +
      '<span class="state-whatif-marker" id="zoneWhatIf_' + esc(zone.id) + '"></span>' +
      '<button type="button" class="state-reset" id="zoneReset_' + esc(zone.id) + '" data-reset-zone="' + esc(zone.id) + '" hidden>Back to the recorded counts</button>' +
      '</div>' +
      '<div id="zoneFigures_' + esc(zone.id) + '">' + figuresHtml(result, false, null) + '</div>' +
      '<div class="state-table-wrap"><table class="state-table" aria-label="Inputs for ' + esc(zoneLabel(zone.id)) + '">' +
      '<thead><tr><th scope="col">Input</th><th scope="col">Unit</th><th scope="col">Value</th><th scope="col">Origin</th></tr></thead>' +
      '<tbody>' + (result.inputs || []).map(inputRow).join('') + '</tbody></table></div>' +
      speciesTable(result, zone.id, population) +
      '</article>';
  }

  /* A count is only usable as part of a set taken at one moment, so every zone has
     to have been walked inside the same short window before the set can be read as
     a population. The window ends at the newest record in the dataset, which is why
     the date behind each number matters as much as the number. */
  function countAge(population, speciesId, zoneId) {
    var row = (population || {})[speciesId] || {};
    return (row.zones || {})[zoneId] || null;
  }

  /* A standing count is editable only where the zone has a usable one. Varying a
     count nobody took would be inventing a baseline as well as a scenario, and the
     engine refuses a zone with no baseline for exactly that reason. */
  function speciesTable(result, zoneId, population) {
    var editable = 0;

    var rows = (result.perSpecies || []).map(function (item) {
      var intake = item.intake && !item.intake.missing ? num(item.intake.value, 2) : 'not recorded';
      var entry = countAge(population, item.speciesId, zoneId);
      var counted = entry && entry.recordedAt ? dayOf(entry.recordedAt) : 'not counted';
      var standing;
      if (item.populationStatus === 'ok') {
        editable++;
        standing = '<input type="number" min="0" step="1" class="state-count-input"' +
          ' data-zone="' + esc(zoneId) + '" data-species="' + esc(item.speciesId) + '"' +
          ' aria-label="Count for ' + esc(speciesLabel(item.speciesId)) + ' in ' + esc(zoneLabel(zoneId)) + '"' +
          ' value="' + esc(String(item.population)) + '">';
      } else {
        standing = esc(String(item.populationStatus || 'no_data').replace(/_/g, ' '));
      }
      return '<tr' + (item.populationStatus === 'ok' ? '' : ' class="state-row-missing"') + '>' +
        '<td>' + esc(speciesLabel(item.speciesId)) + '</td>' +
        '<td>' + standing + '</td>' +
        '<td>' + intake + '</td>' +
        '<td>' + esc(counted) + '</td>' +
        '</tr>';
    });

    if (!rows.length) {
      return '<p class="state-empty">No animal has been counted in this zone yet.</p>';
    }

    var hint = editable
      ? '<p class="state-note">Change a count to ask what would happen. This changes nothing that was recorded.</p>'
      : '<p class="state-note">No count in this zone is recent enough to vary, so there is nothing to ask a what-if about yet.</p>';

    return '<div class="state-table-wrap"><table class="state-table" aria-label="Species in this zone">' +
      '<thead><tr><th scope="col">Species</th><th scope="col">Standing count</th><th scope="col">Daily intake</th><th scope="col">Counted</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody></table></div>' + hint;
  }

  function renderStrip() {
    var plane = state.plane;
    var register = state.register;
    var byType = {};
    (plane.surveys || []).forEach(function (survey) {
      byType[survey.survey_type] = (byType[survey.survey_type] || 0) + 1;
    });
    var placeholders = (register.values || []).filter(function (row) {
      return row.provenance === 'prototype';
    }).length;

    el.tileSurveys.textContent = String((plane.surveys || []).length);
    var parts = Object.keys(byType).map(function (type) {
      return type.replace(/_/g, ' ') + ' ' + byType[type];
    });
    el.tileSurveysNote.textContent = parts.length ? parts.join(', ') : 'none recorded';

    var observations = window.BioData && window.BioData.getObservations ? window.BioData.getObservations() : [];
    el.tileObservations.textContent = String((observations || []).length);
    el.tileObservationsNote.textContent = 'countable animal records';

    el.tileParameters.textContent = String((register.parameters || []).length);
    el.tileParametersNote.textContent = 'names, carrying no value themselves';

    el.tilePlaceholders.textContent = String(placeholders);
    el.tilePlaceholdersNote.textContent = 'replace before quoting any result';
  }

  function renderCapacity() {
    if (!el.capacityBody) return;
    var list = zones();
    if (!list.length) {
      el.capacityBody.innerHTML = '<p class="state-empty">No zones are set up, so there is nothing to assess.</p>';
      return;
    }
    if (!window.BioCapacity || !window.BioEcology) {
      el.capacityBody.innerHTML = '<p class="state-empty">The assessment engine did not load.</p>';
      return;
    }

    var values = (state.register.values || []).concat(measuredForageRows(state.register.values, state.plane));
    var observations = (window.BioData && window.BioData.getObservations ? window.BioData.getObservations() : []) || [];
    var surveysById = {};
    (state.plane.surveys || []).forEach(function (survey) { surveysById[survey.survey_id] = survey; });
    var animalIds = registry('species')
      .filter(function (item) { return item.taxon_type === 'fauna'; })
      .map(function (item) { return item.id; });

    zoneData = {};
    var html = list.map(function (zone) {
      var population = window.BioEcology.parkPopulation(observations, [zone], animalIds, { surveysById: surveysById });
      var result = assessZone(zone.id, population, values);
      zoneData[zone.id] = { values: values, population: population };
      return zoneCard(zone, result, population);
    }).join('');

    el.capacityBody.innerHTML = html;
    wireWhatIf();
  }

  function assessZone(zoneId, population, values) {
    return window.BioCapacity.assess({
      values: values,
      population: population,
      zoneId: zoneId,
      referenceSpeciesId: REFERENCE_SPECIES
    });
  }

  // The recorded population with whatever the reader has changed laid over it. A
  // species brought into the what-if is treated as counted, because the alternative
  // is a scenario in which the engine refuses and says nothing useful.
  function withOverrides(zoneId) {
    var ctx = zoneData[zoneId];
    var overrides = whatIf[zoneId] || {};
    var population = {};
    Object.keys(ctx.population).forEach(function (speciesId) {
      var base = ctx.population[speciesId] || {};
      population[speciesId] = overrides[speciesId] == null
        ? base
        : Object.assign({}, base, { status: 'ok', value: overrides[speciesId] });
    });
    return population;
  }

  /* Repaints only the parts a count change affects. The species inputs live outside
     this region on purpose: rebuilding a card containing the field being typed in is
     how the tap counter on the field officer page lost focus on every keystroke. */
  function paintWhatIf(zoneId) {
    var ctx = zoneData[zoneId];
    if (!ctx) return null;
    var overrides = whatIf[zoneId] || {};
    var active = Object.keys(overrides).length > 0;
    var result = assessZone(zoneId, withOverrides(zoneId), ctx.values);

    var host = $('zoneFigures_' + zoneId);
    if (host) host.innerHTML = figuresHtml(result, active, active ? overrides : null);

    var marker = $('zoneWhatIf_' + zoneId);
    if (marker) marker.textContent = active ? 'What if, not the recorded counts' : '';

    var reset = $('zoneReset_' + zoneId);
    if (reset) reset.hidden = !active;

    return result;
  }

  function setWhatIf(zoneId, speciesId, count) {
    if (!zoneData[zoneId] || !speciesId) return null;
    whatIf[zoneId] = whatIf[zoneId] || {};
    whatIf[zoneId][speciesId] = Math.max(0, parseInt(count, 10) || 0);
    return paintWhatIf(zoneId);
  }

  function resetWhatIf(zoneId) {
    var ctx = zoneData[zoneId];
    if (!ctx) return null;
    whatIf[zoneId] = {};
    if (document.querySelector) {
      Object.keys(ctx.population).forEach(function (speciesId) {
        var base = ctx.population[speciesId] || {};
        if (base.status !== 'ok') return;
        var input = document.querySelector('.state-count-input[data-zone="' + zoneId + '"][data-species="' + speciesId + '"]');
        if (input) input.value = String(base.value);
      });
    }
    return paintWhatIf(zoneId);
  }

  function onCountInput(event) {
    var input = event && event.target;
    if (!input || !input.classList || !input.classList.contains('state-count-input')) return;
    setWhatIf(input.getAttribute('data-zone'), input.getAttribute('data-species'), input.value);
  }

  function onCountReset(event) {
    var target = event && event.target;
    var button = target && target.closest ? target.closest('[data-reset-zone]') : null;
    if (button) resetWhatIf(button.getAttribute('data-reset-zone'));
  }

  function wireWhatIf() {
    if (!el.capacityBody || typeof el.capacityBody.addEventListener !== 'function') return;
    if (el.capacityBody.dataset && el.capacityBody.dataset.whatIfBound) return;
    if (el.capacityBody.dataset) el.capacityBody.dataset.whatIfBound = '1';
    el.capacityBody.addEventListener('input', onCountInput);
    el.capacityBody.addEventListener('click', onCountReset);
  }

  function newestRecordAt() {
    var observations = (window.BioData && window.BioData.getObservations ? window.BioData.getObservations() : []) || [];
    var newest = NaN;
    observations.forEach(function (row) {
      if (row.deleted_at) return;
      var at = Date.parse(row.timestamp);
      if (!isNaN(at) && (isNaN(newest) || at > newest)) newest = at;
    });
    return newest;
  }

  /* The window ends at the newest record in the dataset, not at today. That is the
     right anchor for a coherent set of zone counts, but it means a dataset nobody
     has added to keeps reporting its last moment as if it were now. Saying the date
     out loud is the difference between a reading and a claim. */
  function renderDatasetNote() {
    if (!el.datasetNote) return;
    var windowDays = (window.BioEcology && window.BioEcology.WINDOW_DAYS) || 30;
    var newest = newestRecordAt();

    if (isNaN(newest)) {
      el.datasetNote.textContent = 'No record has been made yet, so there is nothing to read.';
      el.datasetNote.classList.remove('state-asof--stale');
      return;
    }

    var ageDays = Math.floor((Date.now() - newest) / 86400000);
    var asOf = dayOf(new Date(newest).toISOString());
    var stale = ageDays > windowDays;
    var ageText = ageDays === 0
      ? 'recorded today'
      : (ageDays === 1 ? '1 day old today' : ageDays + ' days old today');

    el.datasetNote.textContent = 'Counts are read from the ' + windowDays +
      ' days ending at the newest record in this dataset, ' + asOf + ', ' + ageText + '. ' +
      (stale
        ? 'That is older than the window, so this describes the park as it was then and not as it is now. A walk would bring it up to date.'
        : 'This window is current.');

    el.datasetNote.classList.toggle('state-asof--stale', stale);
  }

  /* A walk that has been recorded and not yet approved is invisible to everything
     above, with nothing on this page saying so. Found by walking the workflow: the
     assessment can look empty while a correct walk sits waiting. */
  function renderPendingNote() {
    if (!el.pendingNote) return;
    var observations = (window.BioData && window.BioData.getObservations ? window.BioData.getObservations() : []) || [];
    var pending = observations.filter(function (row) {
      return (row.verification_status || '') === 'Pending';
    }).length;
    if (!pending) {
      el.pendingNote.hidden = true;
      el.pendingNote.textContent = '';
      return;
    }
    el.pendingNote.hidden = false;
    el.pendingNote.textContent = pending + ' record' + (pending === 1 ? ' is' : 's are') +
      ' waiting for review and not counted below. Approve them on the Observations page before this assessment can use them.';
  }

  function renderCoupling() {
    if (!el.couplingBody) return;
    var relationships = state.register.relationships || [];
    if (!relationships.length) {
      el.couplingBody.innerHTML = '<tr><td colspan="5">No relationship has been recorded yet.</td></tr>';
      return;
    }
    el.couplingBody.innerHTML = relationships.map(function (row) {
      var target = row.to_kind === 'species'
        ? esc(speciesLabel(row.to_species_id))
        : esc(String(row.to_resource || '').replace(/_/g, ' '));
      var arrow = row.direction === 'up' ? 'rises' : (row.direction === 'down' ? 'falls' : row.direction);
      return '<tr>' +
        '<td>' + esc(speciesLabel(row.from_species_id)) + '</td>' +
        '<td class="state-direction state-direction--' + esc(row.direction) + '">' + esc(arrow) + '</td>' +
        '<td>' + target + '</td>' +
        '<td>' + esc(row.mechanism) + '</td>' +
        '<td>' + esc(row.source) + ' <span class="state-kind state-kind--' + esc(row.provenance) + '">' + esc(row.provenance) + '</span>' +
        (row.magnitude == null ? ' <span class="state-kind state-kind--nofigure">no magnitude</span>' : '') + '</td>' +
        '</tr>';
    }).join('');
  }

  function readingSummary(survey) {
    var rows = window.BioData.getSurveyReadings(survey.id) || {};
    if (survey.survey_type === 'vegetation') {
      var veg = (rows.vegetation || [])[0];
      if (!veg) return 'no reading';
      var cover = window.BioSurvey ? window.BioSurvey.coverFromTaps({
        grass: veg.grass_hits, litter: veg.litter_hits, bare: veg.bare_hits, woody: veg.woody_hits
      }) : null;
      var sward = (rows.sward || []).length;
      return 'grass ' + num(veg.grass_hits, 0) + ' of ' + num(cover ? cover.total : null, 0) + ' taps, height ' +
        num(veg.grass_height_mean_cm, 1) + ' cm' + (sward ? ', ' + sward + ' sward species' : '');
    }
    if (survey.survey_type === 'water_quality') {
      var water = (rows.water || [])[0];
      if (!water) return 'no reading';
      return 'level ' + num(water.level_pct, 1) + ' per cent, ' + esc(water.flow || 'flow not recorded') +
        ', ' + esc(water.appearance || 'appearance not recorded');
    }
    if (survey.survey_type === 'soil_condition') {
      var soil = (rows.soil || [])[0];
      if (!soil) return 'no reading';
      return esc(soil.surface_condition || 'surface not recorded') + ', ' +
        esc(soil.compaction || 'compaction not recorded') + ', erosion ' + esc(soil.erosion_signs || 'not recorded');
    }
    return 'counted animals are recorded as observations';
  }

  function renderWalks() {
    if (!el.walksBody) return;
    var surveys = state.plane.surveys || [];
    if (!surveys.length) {
      el.walksBody.innerHTML = '<tr><td colspan="5">No walk has been recorded yet.</td></tr>';
      if (el.walksNote) el.walksNote.textContent = '';
      return;
    }

    var shown = surveys.slice(0, WALKS_SHOWN);
    var hidden = surveys.length - shown.length;

    el.walksBody.innerHTML = shown.map(function (survey) {
      var where = (window.BioData.getSurveyZones() || [])
        .filter(function (row) { return row.survey_id === survey.id; })
        .map(function (row) { return zoneLabel(row.zone_id); });
      return '<tr>' +
        '<td>' + esc(String(survey.survey_type || '').replace(/_/g, ' ')) + '</td>' +
        '<td>' + (where.length ? esc(where.join(', ')) : 'no zone recorded') + '</td>' +
        '<td>' + esc(survey.recorded_by || 'not recorded') + '</td>' +
        '<td>' + esc(dayOf(survey.started_at)) + '</td>' +
        '<td>' + esc(readingSummary(survey)) + '</td>' +
        '</tr>';
    }).join('');

    if (el.walksNote) {
      el.walksNote.textContent = hidden > 0
        ? 'Showing the newest ' + shown.length + ' of ' + surveys.length +
          '. The remaining ' + hidden + ' are older records, most of them a single import without a zone.'
        : 'Showing all ' + surveys.length + '.';
    }
  }

  function renderRegisterWarning() {
    if (!el.registerWarning) return;
    var placeholders = (state.register.values || []).filter(function (row) {
      return row.provenance === 'prototype';
    }).length;
    if (!placeholders) {
      el.registerWarning.hidden = true;
      return;
    }
    el.registerWarning.hidden = false;
    el.registerWarning.textContent = placeholders + ' of the values behind this page are placeholders ' +
      'assumed for the prototype, not researched. Each one says so in its Origin column. Treat every verdict ' +
      'below as a demonstration of the method rather than a statement about the park.';
  }

  function renderAll() {
    renderStrip();
    renderDatasetNote();
    renderRegisterWarning();
    renderPendingNote();
    renderCapacity();
    renderCoupling();
    renderWalks();
  }

  function cacheElements() {
    [
      'tileSurveys', 'tileSurveysNote', 'tileObservations', 'tileObservationsNote',
      'tileParameters', 'tileParametersNote', 'tilePlaceholders', 'tilePlaceholdersNote',
      'capacityBody', 'couplingBody', 'walksBody', 'walksNote', 'registerWarning', 'pendingNote',
      'datasetNote'
    ].forEach(function (id) { el[id] = $(id); });
  }

  function load() {
    var sync = window.BioSync;
    if (!sync || typeof sync.loadSurveyPlane !== 'function') {
      return Promise.resolve(null);
    }
    // The registries are fetched here too, because nothing else on this page asks
    // for them and every zone and species label depends on them.
    return Promise.all([sync.loadSurveyPlane(), sync.loadRegister(), sync.loadRegistries()])
      .then(function () {
        state.plane = window.BioData.getSurveyPlane();
        state.register = window.BioData.getRegister();
        renderAll();
      })
      .catch(function (err) {
        if (el.capacityBody) {
          el.capacityBody.innerHTML = '<p class="state-empty">The assessment could not be loaded: ' +
            esc(err && err.message ? err.message : 'unknown error') + '.</p>';
        }
      });
  }

  function init() {
    cacheElements();
    // Render from whatever the data layer already holds, so the page is never a
    // blank rectangle while the network is still answering.
    state.plane = window.BioData ? window.BioData.getSurveyPlane() : { surveys: [] };
    state.register = window.BioData ? window.BioData.getRegister() : { parameters: [], values: [], relationships: [] };
    renderAll();
    // The shell syncs observations for every admin page. Repainting on its event
    // is what turns a first paint of "no count recorded" into a real assessment.
    window.addEventListener('biodata:synced', renderAll);
    load();
  }

  if (typeof window !== 'undefined') {
    window.BioState = {
      init: init,
      render: renderAll,
      setWhatIf: setWhatIf,
      resetWhatIf: resetWhatIf
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init: init, render: renderAll, setWhatIf: setWhatIf, resetWhatIf: resetWhatIf };
  }
})();
