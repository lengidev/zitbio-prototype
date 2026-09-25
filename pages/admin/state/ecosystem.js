/* Ecosystem Scenarios workspace.
 *
 * The ecological engine remains deliberately separate in ecosystem-model.js.
 * This renderer owns one baseline, one editable scenario, one synchronized
 * result snapshot, and one exploration selection. Every visible value is
 * derived from one of those four states. */
(function () {
  'use strict';

  var model = window.BioEcosystem;
  if (!model) return;
  var waterModel = window.BioWaterQuality;
  var demoModel = model.DEMO || window.BioEcosystemDemo;
  if (!demoModel) return;

  var el = {};
  var PATH_PREVIEW_LIMIT = 7;
  var GRAPH_VIEW = { width: 880, height: 640 };
  var NODE_HALF_HEIGHT = 22;

  var COMPONENT_META = {
    rainfall: {
      category: 'environment', role: 'Climate input', unit: 'mm and season',
      description: 'An explicit rainfall total combined with the selected season to resolve recharge, drawdown and grass-regrowth direction. It is not a live weather measurement.'
    },
    rainChemistry: {
      category: 'environment', role: 'Scenario measurement', unit: 'pH',
      description: 'An explicit rain-chemistry value kept separate from rainfall quantity so acidic deposition cannot be mistaken for low rainfall.'
    },
    forage: {
      category: 'resource', role: 'Derived variable', unit: 'kg dry matter',
      description: 'Usable grass dry matter calculated from entered habitat area, standing biomass and the stated allowable-use share, then compared with 30-day herd demand.'
    },
    water: {
      category: 'resource', role: 'Derived variable', unit: 'Entered access state',
      description: 'The selected water-point access state. When it is not entered, climate supplies only the quantity outlook; usable access remains restricted.'
    },
    woody: {
      category: 'resource', role: 'Derived variable', unit: '% canopy cover',
      description: 'Entered woody canopy cover used to resolve shelter, browse and competition with grass.'
    },
    competition: {
      category: 'pressure', role: 'Derived variable', unit: '30-day resource screen',
      description: 'Resource pressure resolved from the calculated forage duration and selected usable-water state.'
    },
    soil: {
      category: 'pressure', role: 'Derived variable', unit: '% protective cover',
      description: 'Soil protection resolved from the entered percentage of living vegetation, litter and other ground cover.'
    },
    erosion: {
      category: 'pressure', role: 'Derived variable', unit: 'Screened pressure',
      description: 'Erosion pressure resolved from ground cover, disturbed bank share and rainfall amount. It is a screening state, not a soil-loss estimate.'
    },
    waterQuality: {
      category: 'pressure', role: 'Derived variable', unit: 'Entered sample screen',
      description: 'The selected water sample is screened with rain chemistry, bank disturbance and connected runoff. One sample is not a measured trend.'
    },
    usableWater: {
      category: 'resource', role: 'Derived variable', unit: 'Resolved access state',
      description: 'Water access after quantity and explicit contamination or bloom concerns are considered. Low oxygen alone does not imply mammal drinking-water toxicity.'
    },
    health: {
      category: 'pressure', role: 'Derived variable', unit: '30-day support screen',
      description: 'Support for animal condition through forage, usable water and competition. This applies to the scenario herd; it does not alter entered counts or predict illness or mortality.'
    },
    aquaticHealth: {
      category: 'pressure', role: 'Derived variable', unit: 'Resolved water screen',
      description: 'Aquatic habitat support affected by water quality. Screening triggers identify stress to investigate, without estimating aquatic populations.'
    },
    zebra: {
      category: 'wildlife', role: 'Scenario input', unit: 'Animals',
      description: 'Registered zebra population used as an editable driver of forage, competition, soil, and water-quality relationships.'
    },
    waterbuck: {
      category: 'wildlife', role: 'Scenario input', unit: 'Animals',
      description: 'Registered waterbuck population used as an editable driver and a recipient of forage, water, and competition relationships.'
    },
    puku: {
      category: 'wildlife', role: 'Scenario input', unit: 'Animals',
      description: 'Registered puku population used as an editable driver and a recipient of forage, water, and competition relationships.'
    },
    impala: {
      category: 'wildlife', role: 'Scenario input', unit: 'Animals',
      description: 'Registered impala population used as an editable driver with supported grass, browse, and competition relationships.'
    }
  };

  var CATEGORY_LABELS = {
    environment: 'Environment',
    resource: 'Habitat & Resources',
    pressure: 'Interactions & Condition',
    wildlife: 'Wildlife Populations'
  };

  var GRAPH_NODES = [
    { key: 'rainfall', x: 300, y: 67, w: 166, label: 'Rainfall / dryness' },
    { key: 'rainChemistry', x: 610, y: 67, w: 148, label: 'Rain chemistry' },
    { key: 'forage', x: 165, y: 178, w: 148, label: 'Available forage' },
    { key: 'water', x: 440, y: 178, w: 132, label: 'Water availability' },
    { key: 'woody', x: 715, y: 178, w: 148, label: 'Woody vegetation' },
    { key: 'competition', x: 112, y: 310, w: 168, label: 'Resource competition' },
    { key: 'soil', x: 330, y: 310, w: 126, label: 'Soil condition' },
    { key: 'erosion', x: 546, y: 310, w: 132, label: 'Erosion pressure' },
    { key: 'waterQuality', x: 760, y: 310, w: 148, label: 'Water quality' },
    { key: 'usableWater', x: 165, y: 424, w: 148, label: 'Usable water access' },
    { key: 'health', x: 440, y: 424, w: 160, label: 'Animal condition' },
    { key: 'aquaticHealth', x: 715, y: 424, w: 160, label: 'Aquatic habitat' },
    { key: 'zebra', x: 112, y: 564, w: 126, label: 'Zebra' },
    { key: 'waterbuck', x: 330, y: 564, w: 138, label: 'Waterbuck' },
    { key: 'puku', x: 546, y: 564, w: 126, label: 'Puku' },
    { key: 'impala', x: 760, y: 564, w: 126, label: 'Impala' }
  ];

  /* The graph box is where a reader first meets a variable, so the inspector
     rows use the same label they can see on the graph rather than the longer
     register name. */
  var NODE_LABELS = {};
  GRAPH_NODES.forEach(function (node) { NODE_LABELS[node.key] = node.label; });

  var EDGE_KEYS = {};
  (model.EDGES || []).forEach(function (edge) { EDGE_KEYS[edge.from + '>' + edge.to] = true; });

  function cloneCounts(counts) {
    var copy = {};
    model.SPECIES.forEach(function (species) { copy[species.key] = counts[species.key]; });
    return copy;
  }

  var initialCounts = model.registeredCounts();

  var state = {
    baseline: model.registeredCounts(),
    draft: { counts: initialCounts, area: model.DEFAULT_AREA_HA, driver: 'none', water: waterModel.sampleInput('demo-reference'), demo: demoModel.defaultInput(), conditions: demoModel.contextFor(demoModel.defaultInput()) },
    applied: null,
    context: [],
    lastResult: null,
    revision: 0,
    orderedPaths: [],
    selected: { type: 'node', key: 'zebra' },
    hoverPath: null,
    pathScope: 'relevant',
    pathQuery: ''
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    if (window.BioEscape && window.BioEscape.escapeHtml) return window.BioEscape.escapeHtml(value);
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function number(value, places) {
    if (value == null || !isFinite(Number(value))) return 'Not available';
    var factor = Math.pow(10, places == null ? 1 : places);
    return String(Math.round(Number(value) * factor) / factor);
  }

  function signed(value, places) {
    if (value == null || !isFinite(Number(value))) return 'Not available';
    var text = number(Math.abs(value), places);
    return Number(value) > 0 ? '+' + text : (Number(value) < 0 ? '\u2212' + text : '0');
  }

  function percent(value) {
    return value == null ? 'Not available' : signed(value, 1) + '%';
  }

  function groupedSigned(value, places) {
    if (value == null || !isFinite(Number(value))) return 'Not available';
    var numeric = Number(value);
    var text = Math.abs(numeric).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: places == null ? 1 : places
    });
    return numeric > 0 ? '+' + text : (numeric < 0 ? '\u2212' + text : '0');
  }

  function edgeKeyOf(edge) { return edge.from + '>' + edge.to; }

  function speciesChange(key, result) {
    var match = null;
    (result && result.speciesChanges || []).forEach(function (item) { if (item.key === key) match = item; });
    return match;
  }

  function effectFor(key, result) {
    var match = null;
    (result && result.effects || []).forEach(function (item) { if (item.key === key) match = item; });
    return match;
  }

  function statusClassFor(status) {
    if (status === 'increases') return 'up';
    if (status === 'decreases') return 'down';
    if (status === 'uncertain' || status === 'mixed' || status === 'conflicting') return 'mixed';
    if (status === 'conditional') return 'conditional';
    return 'off';
  }

  function statusLabel(status) {
    if (status === 'increases') return 'Increases';
    if (status === 'decreases') return 'Decreases';
    if (status === 'uncertain' || status === 'conflicting' || status === 'mixed') return 'Manage competing pressures';
    if (status === 'conditional') return 'Plan for conditional risk';
    return 'No modeled change';
  }

  function statusSymbol(status) {
    if (status === 'increases') return '+';
    if (status === 'decreases') return '\u2212';
    if (status === 'uncertain' || status === 'mixed') return '!';
    if (status === 'conditional') return '!';
    return '\u00b7';
  }

  function nodeStatus(key, result) {
    var change = speciesChange(key, result);
    if (change && change.delta !== 0) return change.delta > 0 ? 'increases' : 'decreases';
    if (key === 'rainfall') {
      if (result.demo && result.demo.components.rainfall) {
        var demoSign = result.demo.components.rainfall.sign;
        return demoSign > 0 ? 'increases' : demoSign < 0 ? 'decreases' : 'unchanged';
      }
      var season = model.SEASONS && model.SEASONS[result.driver];
      if (season && season.seeds.length) {
        var seed = season.seeds.filter(function (item) { return item.node === 'rainfall'; })[0];
        if (seed) return seed.sign > 0 ? 'increases' : 'decreases';
      }
    }
    if (result.demo && result.demo.components[key]) {
      var resolvedSign = result.demo.components[key].sign;
      return resolvedSign > 0 ? 'increases' : resolvedSign < 0 ? 'decreases' : 'unchanged';
    }
    var effect = effectFor(key, result);
    return effect ? effect.status : 'unchanged';
  }

  /* Card copy stays in plain words: an inspector answers one variable or one
     relationship, so it can afford to spell a state out. statusLabel() and
     statusSymbol() stay the terse vocabulary shared by the graph, the pathway
     list and the PDF export, which have no room to explain themselves. */
  var PANEL_STATUS_WORDS = {
    increases: 'Rises',
    decreases: 'Falls',
    uncertain: 'Manage competing pressures',
    conditional: 'Plan for conditional risk',
    unchanged: 'No change in this scenario'
  };

  function panelStatusLabel(status) {
    return PANEL_STATUS_WORDS[status] || PANEL_STATUS_WORDS.unchanged;
  }

  /* The role words in COMPONENT_META name the model's plumbing. Where a value
     comes from is the question a reader actually has. */
  var PANEL_ROLE_WORDS = {
    'Scenario driver': 'Set by the season you choose',
    'Climate input': 'Set by season and rainfall',
    'Scenario measurement': 'You set this value',
    'Derived variable': 'Calculated from other variables',
    'Scenario input': 'You set this number'
  };

  function panelRoleLabel(role) {
    return PANEL_ROLE_WORDS[role] || role;
  }

  /* The reason behind each state, so the response cell never repeats the badge
     word sitting directly above it. */
  var PANEL_RESPONSE_WORDS = {
    increases: { summary: 'All active paths agree', detail: 'This variable rises in the scenario you set.' },
    decreases: { summary: 'All active paths agree', detail: 'This variable falls in the scenario you set.' },
    uncertain: { summary: 'Protect against the adverse possibility', detail: 'Opposing mechanisms remain possible. Use the stated action while measuring which mechanism dominates.' },
    conditional: { summary: 'Act on the conditional risk', detail: 'The entered conditions permit a change. Follow the stated action and verify the condition.' },
    unchanged: { summary: 'Nothing moves it', detail: 'No active pathway moves this variable in the scenario you set.' }
  };

  function panelResponseWords(status) {
    return PANEL_RESPONSE_WORDS[status] || PANEL_RESPONSE_WORDS.unchanged;
  }

  /* A relationship row carries two different facts, so both get their own
     name: the registered claim, true in every scenario, and what the
     relationship did in this one. */
  function registeredDirectionWord(direction) {
    if (direction === 'up') return 'supports';
    if (direction === 'down') return 'reduces';
    return 'resolved by entered conditions';
  }

  function scenarioStateWord(info) {
    if (!info) return 'not active';
    if (info.status === 'increases') return 'raises the target';
    if (info.status === 'decreases') return 'lowers the target';
    return info.status === 'unchanged' ? 'no change passed' : 'resolved from inputs';
  }

  /* Shared closing cell: every qualitative card answers "how much" the same
     way, which is also the one place the direction-only limit is stated. */
  function howMuchHtml() {
    return '<div><dt>How Much</dt><dd>Not estimated<small>The model reports direction only: up, down, or no change.</small></dd></div>';
  }

  function demoMeasurementHtml(key, result) {
    if (!result.demo || !result.demo.components[key]) return howMuchHtml();
    var metrics = result.demo.metrics;
    var component = result.demo.components[key];
    var primary = component.label;
    var detail = component.basis;
    if (key === 'forage') {
      primary = number(metrics.availableForageKg, 1) + ' kg DM';
      detail = metrics.forageDays == null ? 'No herd demand entered' : number(metrics.forageDays, 1) + ' days for the entered herd';
    } else if (key === 'woody') {
      primary = number(metrics.woodyCoverPercent, 0) + '% canopy';
    } else if (key === 'soil') {
      primary = number(metrics.groundCoverPercent, 0) + '% cover';
    } else if (key === 'erosion') {
      primary = number(metrics.bankDisturbancePercent, 0) + '% bank disturbance';
      detail = number(metrics.groundCoverPercent, 0) + '% ground cover · ' + number(metrics.rainMm, 0) + ' mm rain';
    } else if (key === 'competition') {
      primary = number(metrics.densityPerUsableHa, 2) + ' animals / usable ha';
      detail = metrics.forageDays == null ? component.basis : number(metrics.forageDays, 1) + '-day forage screen';
    } else if (key === 'health') {
      primary = metrics.forageDays == null ? 'No herd demand' : number(metrics.forageDays, 1) + '-day forage screen';
    } else if (key === 'waterQuality' || key === 'aquaticHealth') {
      primary = result.waterQuality.label;
      detail = result.waterQuality.summary;
    } else if (key === 'water' || key === 'usableWater') {
      primary = component.label;
      detail = 'Water-point access: ' + result.waterQuality.availability;
    }
    return '<div><dt>Entered / Calculated Value</dt><dd>' + esc(primary) + '<small>' + esc(detail) + '</small></dd></div>';
  }

  function nodeLabel(key) {
    return NODE_LABELS[key] || model.COMPONENTS[key] || key;
  }

  /* "Tier C" is a provenance grade, not a confidence statement. A title keeps
     the definition one hover away instead of spending a line of the card. */
  function tierNote(source) {
    if (!source) return '';
    if (source.tier === 'A') return 'Tier A: recorded in this park or in the CBU register.';
    if (source.tier === 'B') return 'Tier B: regional evidence from a comparable site, not this park.';
    return 'Tier C: evidence from a comparable system, screening reference or method literature, not measured in this park.';
  }

  function sourceBadge(source) {
    if (!source) return '<span class="eco-badge eco-badge--assumption">No source attached</span>';
    return '<span class="eco-badge" title="' + esc(tierNote(source)) + '">Tier ' + esc(source.tier) + ' · ' + esc(source.label) + '</span>';
  }

  function sourceById(id) {
    var found = null;
    Object.keys(model.SOURCES || {}).some(function (key) {
      if (model.SOURCES[key].id !== id) return false;
      found = model.SOURCES[key];
      return true;
    });
    return found;
  }

  function changeMarkup(from, to) {
    if (String(to).trim() === '' || !Number.isSafeInteger(Number(to)) || Number(to) < 0 || Number(to) > 1000000) return '<span>Enter a valid count</span>';
    var delta = Number(to) - Number(from);
    var pct = from === 0 ? (to === 0 ? 0 : null) : delta / from * 100;
    var cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'same');
    return '<span class="eco-change eco-change--' + cls + '"><b>' + signed(delta, 0) + '</b><small>' + (pct == null ? 'new value' : percent(pct)) + '</small></span>';
  }

  /* The selected sample supplies the readings, so they are shown as values: the
     page offers four defined sample states and no free-entry state. Water access
     and bloom stay editable, because the model resolves those two through the
     water and usable-water pathways. */
  function renderWaterControls() {
    if (el.waterSample) {
      el.waterSample.innerHTML = waterModel.SAMPLES.filter(function (sample) { return sample.selectable !== false; }).map(function (sample) { return '<option value="' + esc(sample.id) + '">' + esc(sample.label) + '</option>'; }).join('');
      el.waterSample.value = state.draft.water.sampleId;
    }
    /* Only readings the selected sample actually holds are shown. The scenario
       samples carry no copper or suspended solids, and an empty "Not Measured"
       tile for a measurement this scenario cannot use is noise. */
    if (el.waterReadings) {
      var held = waterModel.FIELDS.filter(function (field) {
        var raw = state.draft.water[field.key];
        return raw != null && String(raw).trim() !== '';
      });
      el.waterReadings.innerHTML = held.length
        ? held.map(function (field) {
          return '<div class="eco-select-field"><span>' + esc(field.label) + ' (' + esc(field.unit) + ')</span>' +
            '<span class="eco-readout-value">' + esc(state.draft.water[field.key]) + '</span></div>';
        }).join('')
        : '<p class="eco-water-empty">No readings are held for this sample.</p>';
    }
    [['waterAvailability', 'availability'], ['waterBloom', 'bloom']].forEach(function (pair) {
      if (el[pair[0]]) el[pair[0]].value = state.draft.water[pair[1]] || '';
    });
  }

  function renderDemoControls() {
    if (!el.demoInputs) return;
    el.demoInputs.innerHTML = demoModel.FIELDS.map(function (field) {
      var options = field.options.map(function (option) {
        return '<option value="' + esc(option.id) + '"' + (state.draft.demo[field.key] === option.id ? ' selected' : '') + '>' + esc(option.label) + '</option>';
      }).join('');
      return '<label class="eco-select-field" for="eco-demo-' + esc(field.key) + '"><span>' + esc(field.label) + '</span><select id="eco-demo-' + esc(field.key) + '" data-demo-input="' + esc(field.key) + '">' + options + '</select><small>' + esc(field.note) + '</small></label>';
    }).join('');
  }

  function renderDemoAssessment(result) {
    if (!el.demoAssessment || !result.demo) return;
    var metrics = result.demo.metrics;
    var forageDays = metrics.forageDays == null ? 'No herd' : number(metrics.forageDays, 1) + ' days';
    el.demoAssessment.innerHTML =
      '<div><span>Usable habitat</span><strong>' + number(metrics.usableHabitatHa, 2) + ' ha</strong><small>' + number(metrics.usableHabitatPercent, 0) + '% of entered boundary</small></div>' +
      '<div><span>Available forage</span><strong>' + number(metrics.availableForageKg, 1) + ' kg DM</strong><small>25% of standing biomass</small></div>' +
      '<div><span>Herd demand</span><strong>' + number(metrics.dailyDemandKg, 1) + ' kg DM/day</strong><small>' + number(metrics.horizonDemandKg, 1) + ' kg over 30 days</small></div>' +
      '<div><span>Forage screen</span><strong>' + esc(forageDays) + '</strong><small>' + esc(result.demo.components.forage.label) + '</small></div>' +
      '<div><span>Regrowth outlook</span><strong>' + esc(metrics.regrowthOutlook) + '</strong><small>' + esc(metrics.seasonLabel) + '</small></div>' +
      '<div><span>Water outlook</span><strong>' + esc(result.demo.components.water.label) + '</strong><small>Season + ' + number(metrics.rainMm, 0) + ' mm + entered access</small></div>';
  }

  /* Access and bloom change the model rather than the sample, so the sample keeps
     its label and the deviation is reported beside it instead of being hidden. */
  function editWater(key, value) {
    state.draft.water[key] = value;
    applyScenario();
  }

  function renderWaterAssessment(result) {
    var water = result.waterQuality;
    if (el.waterSource) el.waterSource.innerHTML = '<strong>' + esc(water.sampleLabel) + '</strong> · ' + esc(water.provenanceLabel || water.provenance) +
      (water.note ? '<br>' + esc(water.note) : '') +
      (water.overrideNote ? '<br>' + esc(water.overrideNote) : '');
    if (el.waterAssessment) el.waterAssessment.innerHTML = '<strong>' + esc(water.label) + '.</strong> ' + esc(water.summary) + '<br>' + esc(water.basis) +
      (water.gaps.length ? '<br>' + water.gaps.map(esc).join(' ') : '');
  }

  function renderSpeciesControls() {
    if (!el.speciesControls) return;
    var rows = model.SPECIES.map(function (species) {
      var baseline = state.baseline[species.key];
      var target = state.draft.counts[species.key];
      return '<tr>' +
        '<th scope="row"><strong>' + esc(species.label) + '</strong><small>' + esc(species.scientificName) + '</small></th>' +
        '<td class="eco-baseline"><span class="sr-only">Baseline </span>' + esc(baseline) + '</td>' +
        '<td><label class="eco-field"><span class="sr-only">Scenario count for ' + esc(species.label) + '</span><input type="number" min="0" max="1000000" step="1" required inputmode="numeric" value="' + esc(target) + '" data-eco-target="' + esc(species.key) + '" aria-label="Scenario count for ' + esc(species.label) + '"></label></td>' +
        '<td data-eco-change="' + esc(species.key) + '">' + changeMarkup(baseline, target) + '</td>' +
        '</tr>';
    }).join('');
    el.speciesControls.innerHTML = '<div class="eco-table-wrap"><table class="eco-input-table"><thead><tr><th scope="col">Species</th><th scope="col">Baseline</th><th scope="col">Scenario</th><th scope="col">Change</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function renderSpeciesChangeCell(key) {
    if (!el.speciesControls || !el.speciesControls.querySelector) return;
    var cell = el.speciesControls.querySelector('[data-eco-change="' + key + '"]');
    if (cell) cell.innerHTML = changeMarkup(state.baseline[key], state.draft.counts[key]);
  }

  function approvedOperationalObservationCount() {
    var observations = (window.BioData && window.BioData.getObservations) ? window.BioData.getObservations() : [];
    return (observations || []).filter(function (row) {
      return String(row.verification_status || '').toLowerCase() === 'approved' &&
        String(row.source || '').toLowerCase() !== 'gbif' &&
        String(row.provenance || '').toLowerCase() !== 'external';
    }).length;
  }

  function renderContext() {
    var approved = approvedOperationalObservationCount();
    if (!el.dataContext) return;
    el.dataContext.innerHTML = approved
      ? '<strong>Data context</strong><span>' + approved + ' approved operational observation' + (approved === 1 ? '' : 's') + ' available. GBIF records are excluded from this baseline.</span>'
      : '<strong>Data context</strong><span>No approved operational observations are available. Registered reference values remain in use.</span>';
  }

  function changedInputSummary(result) {
    var populationCount = result.speciesChanges.filter(function (item) { return item.delta !== 0; }).length;
    var demoDefaults = demoModel.DEFAULTS;
    var demoCount = Object.keys(state.applied.demo || {}).filter(function (key) { return state.applied.demo[key] !== demoDefaults[key]; }).length;
    /* A hand-set water access or bloom value is a scenario change even when the
       sample itself is left at the reference state. */
    var waterChanged = result.waterQuality.sampleId !== 'demo-reference' || (result.waterQuality.overrides || []).length > 0;
    var contextCount = (result.driver !== 'none' ? 1 : 0) + (Number(state.applied.area) !== Number(model.DEFAULT_AREA_HA) ? 1 : 0) +
      (waterChanged ? 1 : 0) + demoCount;
    return {
      total: populationCount + contextCount,
      populationCount: populationCount,
      contextCount: contextCount
    };
  }

  function renderSummary(result) {
    if (!el.summary) return;
    var changes = changedInputSummary(result);
    var density = result.totals.densityPerUsableHa == null ? 'Not available' : number(result.totals.densityPerUsableHa, 2);
    var densityNote = result.totals.densityPerUsableHa == null ? 'A positive usable area is required' : 'animals per usable ha';
    if (el.summarySub) {
      el.summarySub.textContent = 'Synchronized with the working scenario · ' + result.driverLabel + (result.estimatedAreaHa == null ? '' : ' · ' + number(result.estimatedAreaHa, 1) + ' ha estimate');
    }
    var decisionHtml = '<div class="eco-outcome-lead"><span>Management response · ' + esc(result.decision.priority) + ' priority</span><strong>' + esc(result.decision.title) +
      '</strong><p>' + esc(result.decision.action) + '</p><ul class="eco-list">' + result.decision.reasons.map(function (reason) { return '<li>' + esc(reason) + '</li>'; }).join('') + '</ul></div>';
    if (result.inputErrors.length) { el.summary.innerHTML = decisionHtml; return; }
    el.summary.innerHTML = decisionHtml +
      '<dl class="eco-metric-grid">' +
        '<div class="eco-metric"><dt>Inputs changed</dt><dd>' + changes.total + '</dd><small>' + changes.populationCount + ' population' + (changes.populationCount === 1 ? '' : 's') + (changes.contextCount ? ' · ' + changes.contextCount + ' context' : '') + '</small></div>' +
        '<div class="eco-metric"><dt>Total animals</dt><dd>' + number(result.totals.from, 0) + '<span aria-hidden="true">→</span>' + number(result.totals.to, 0) + '</dd><small>' + signed(result.totals.delta, 0) + ' · ' + percent(result.totals.percent) + '</small></div>' +
        '<div class="eco-metric"><dt>Usable-area density</dt><dd>' + density + '</dd><small>' + densityNote + '</small></div>' +
        '<div class="eco-metric"><dt>Network response</dt><dd>' + result.effects.length + '</dd><small>components · ' + result.pathways.length + (result.demo ? ' resolved relationships' : ' active pathways') + '</small></div>' +
      '</dl>';
  }

  function renderUnknowns(result) {
    if (el.unknowns) el.unknowns.innerHTML = result.unknownMagnitudes.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('');
  }

  function renderManagement(result) {
    if (el.management) el.management.innerHTML = result.managementInterpretation.map(function (text) { return '<li>' + esc(text) + '</li>'; }).join('');
  }

  function nodeByKey(key) {
    for (var i = 0; i < GRAPH_NODES.length; i++) if (GRAPH_NODES[i].key === key) return GRAPH_NODES[i];
    return null;
  }

  function round1(value) { return Math.round(value * 10) / 10; }

  function rectRayPoint(node, towardsX, towardsY) {
    var dx = towardsX - node.x;
    var dy = towardsY - node.y;
    if (dx === 0 && dy === 0) return { x: node.x, y: node.y };
    var halfWidth = node.w / 2 + 7;
    var halfHeight = NODE_HALF_HEIGHT + 7;
    var scale = Math.min(dx === 0 ? Infinity : Math.abs(halfWidth / dx), dy === 0 ? Infinity : Math.abs(halfHeight / dy));
    if (!isFinite(scale)) scale = 0;
    return { x: node.x + dx * scale, y: node.y + dy * scale };
  }

  function edgePathXml(from, to) {
    var start = rectRayPoint(from, to.x, to.y);
    var end = rectRayPoint(to, from.x, from.y);
    var dx = end.x - start.x;
    var dy = end.y - start.y;
    var length = Math.sqrt(dx * dx + dy * dy) || 1;
    var bow = EDGE_KEYS[to.key + '>' + from.key] ? (from.key < to.key ? 18 : -18) : 0;
    var cx = (start.x + end.x) / 2 - (dy / length) * bow;
    var cy = (start.y + end.y) / 2 + (dx / length) * bow;
    return 'M' + round1(start.x) + ' ' + round1(start.y) + ' Q' + round1(cx) + ' ' + round1(cy) + ' ' + round1(end.x) + ' ' + round1(end.y);
  }

  function pathTouchesNode(path, key) {
    return path.edgeKeys.some(function (edgeKey) {
      var parts = edgeKey.split('>');
      return parts[0] === key || parts[1] === key;
    });
  }

  function renderGraph(result) {
    if (result.inputErrors && result.inputErrors.length) return;
    if (!el.graphWrap) return;
    var selectedEdgeKey = state.selected && state.selected.type === 'edge' ? state.selected.key : null;
    var selectedNodeKey = state.selected && state.selected.type === 'node' ? state.selected.key : null;
    var selectedPathIndex = state.selected && state.selected.type === 'path' ? state.selected.index : null;
    var highlightIndex = state.hoverPath == null ? selectedPathIndex : state.hoverPath;
    var pathEdgeKeys = {};
    var pathNodeKeys = {};
    var relatedEdgeKeys = {};

    if (highlightIndex != null && state.orderedPaths[highlightIndex]) {
      state.orderedPaths[highlightIndex].edgeKeys.forEach(function (key) {
        pathEdgeKeys[key] = true;
        var parts = key.split('>');
        pathNodeKeys[parts[0]] = true;
        pathNodeKeys[parts[1]] = true;
      });
    }
    if (selectedNodeKey) {
      (model.EDGES || []).forEach(function (edge) {
        if (edge.from === selectedNodeKey || edge.to === selectedNodeKey) relatedEdgeKeys[edgeKeyOf(edge)] = true;
      });
    }

    var lanes = '<g class="eco-lanes" aria-hidden="true">' +
      '<rect x="12" y="17" width="856" height="92" rx="10"></rect><text x="30" y="41">ENVIRONMENT</text>' +
      '<rect x="12" y="121" width="856" height="118" rx="10"></rect><text x="30" y="145">HABITAT &amp; RESOURCES</text>' +
      '<rect x="12" y="252" width="856" height="120" rx="10"></rect><text x="30" y="276">INTERACTIONS &amp; CONDITION</text>' +
      '<rect x="12" y="385" width="856" height="95" rx="10"></rect><text x="30" y="405">WATER ACCESS &amp; CONDITION SUPPORT</text>' +
      '<rect x="12" y="500" width="856" height="119" rx="10"></rect><text x="30" y="524">WILDLIFE POPULATIONS</text>' +
      '</g>';

    var edgesXml = (model.EDGES || []).map(function (edge) {
      var from = nodeByKey(edge.from);
      var to = nodeByKey(edge.to);
      if (!from || !to) return '';
      var key = edgeKeyOf(edge);
      var info = result.edgeStates ? result.edgeStates[key] : null;
      var status = info ? info.status : 'unchanged';
      var kind = statusClassFor(status);
      var cls = 'eco-edge eco-edge--' + kind;
      if (pathEdgeKeys[key]) cls += ' is-path';
      if (relatedEdgeKeys[key]) cls += ' is-related';
      if (selectedEdgeKey === key) cls += ' is-selected';
      var title = (model.COMPONENTS[edge.from] || edge.from) + ' to ' + (model.COMPONENTS[edge.to] || edge.to) + '. ' + edge.mechanism;
      return '<path class="' + cls + '" d="' + edgePathXml(from, to) + '" marker-end="url(#eco-arrow-' + kind + ')" data-edge="' + esc(key) + '" tabindex="0" role="button" aria-label="' + esc(title) + '"><title>' + esc(title) + '</title></path>';
    }).join('');

    var nodesXml = GRAPH_NODES.map(function (node) {
      var status = nodeStatus(node.key, result);
      var change = speciesChange(node.key, result);
      var meta = COMPONENT_META[node.key] || { category: 'pressure' };
      var cls = 'eco-node eco-node--' + meta.category + ' eco-node--' + statusClassFor(status);
      if (change && change.delta !== 0) cls += ' is-edited';
      if (selectedNodeKey === node.key) cls += ' is-selected';
      if (pathNodeKeys[node.key]) cls += ' is-path';
      var fullLabel = model.COMPONENTS[node.key] || node.label;
      var aria = fullLabel + '. ' + meta.role + '. ' + statusLabel(status) + (change && change.delta !== 0 ? '. Scenario count changed.' : '.');
      return '<g class="' + cls + '" data-node="' + esc(node.key) + '" transform="translate(' + node.x + ',' + node.y + ')" tabindex="0" role="button" aria-pressed="' + (selectedNodeKey === node.key ? 'true' : 'false') + '" aria-label="' + esc(aria) + '">' +
        '<rect class="eco-node-box" x="' + (-node.w / 2) + '" y="-' + NODE_HALF_HEIGHT + '" width="' + node.w + '" height="' + (NODE_HALF_HEIGHT * 2) + '" rx="8"></rect>' +
        '<rect class="eco-node-band" x="' + (-node.w / 2) + '" y="-' + NODE_HALF_HEIGHT + '" width="5" height="' + (NODE_HALF_HEIGHT * 2) + '" rx="3"></rect>' +
        '<text class="eco-node-label" x="' + (-node.w / 2 + 16) + '" y="1">' + esc(node.label) + '</text>' +
        '<g class="eco-node-signal eco-node-signal--' + statusClassFor(status) + '" transform="translate(' + (node.w / 2 - 17) + ',0)"><circle r="9"></circle><text y="1">' + esc(statusSymbol(status)) + '</text></g>' +
        (change && change.delta !== 0 ? '<circle class="eco-node-edited" cx="' + (-node.w / 2 + 5) + '" cy="-' + (NODE_HALF_HEIGHT - 4) + '" r="4"><title>Scenario value edited</title></circle>' : '') +
        '<title>' + esc(fullLabel) + '</title></g>';
    }).join('');

    var defs = ['up', 'down', 'mixed', 'conditional', 'off'].map(function (name) {
      return '<marker id="eco-arrow-' + name + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="eco-arrow eco-arrow--' + name + '" d="M0 0 L10 5 L0 10 Z"></path></marker>';
    }).join('');

    el.graphWrap.innerHTML = '<svg viewBox="0 0 ' + GRAPH_VIEW.width + ' ' + GRAPH_VIEW.height + '" role="img" aria-label="Coupled ecological system grouped by environment, resources, interactions, and wildlife populations">' +
      '<defs>' + defs + '</defs>' + lanes + edgesXml + nodesXml + '</svg>';
  }

  function renderMobileDirectory(result) {
    if (!el.mobileDirectory) return;
    var order = ['environment', 'resource', 'pressure', 'wildlife'];
    el.mobileDirectory.innerHTML = order.map(function (category) {
      var buttons = GRAPH_NODES.filter(function (node) { return COMPONENT_META[node.key].category === category; }).map(function (node) {
        var selected = state.selected && state.selected.type === 'node' && state.selected.key === node.key;
        var status = nodeStatus(node.key, result);
        return '<button type="button" data-node="' + esc(node.key) + '" class="' + (selected ? 'is-selected' : '') + '" aria-pressed="' + (selected ? 'true' : 'false') + '"><span>' + esc(node.label) + '</span><small>' + esc(statusLabel(status)) + '</small></button>';
      }).join('');
      return '<section><h5>' + esc(CATEGORY_LABELS[category]) + '</h5><div>' + buttons + '</div></section>';
    }).join('');
  }

  function comparisonHtml(change) {
    if (!change) return '';
    return '<dl class="eco-inspector-values"><div><dt>Baseline</dt><dd>' + number(change.from, 0) + '</dd></div><div><dt>Scenario</dt><dd>' + number(change.to, 0) + '</dd></div><div><dt>Change</dt><dd>' + signed(change.delta, 0) + '<small>' + percent(change.percent) + '</small></dd></div></dl>';
  }

  function scenarioBasisHtml(key, result, status) {
    if (key !== 'forage' && key !== 'competition') return '';
    var paths = (result.pathways || []).filter(function (path) { return path.targetKey === key; });
    if (!paths.length) return '<p class="eco-empty">No scenario input currently activates this response.</p>';
    var sourceKeys = [];
    paths.forEach(function (path) {
      var sourceKey = path.edgeKeys.length ? path.edgeKeys[0].split('>')[0] : '';
      if (sourceKey && sourceKeys.indexOf(sourceKey) === -1) sourceKeys.push(sourceKey);
    });
    var explanation = status === 'uncertain'
      ? 'The active pathways oppose one another. A direction cannot be chosen without measured influence strengths.'
      : (status === 'conditional'
        ? 'The response depends on conditions in this scenario; use the stated action while verifying them.'
        : 'The active scenario pathways agree on this response.');
    return '<p class="eco-response-note">' + esc(explanation) + '</p><ul class="eco-response-basis">' + sourceKeys.map(function (sourceKey) {
      var change = speciesChange(sourceKey, result);
      var detail = result.driverLabel;
      if (change) {
        detail = 'Population ' + number(change.from, 0) + ' → ' + number(change.to, 0) +
          ' (' + groupedSigned(change.delta, 0) + (change.percent == null ? '' : ' · ' + groupedSigned(change.percent, 1) + '%') + ')';
      }
      return '<li><strong>' + esc(model.COMPONENTS[sourceKey] || sourceKey) + '</strong><span>' + esc(detail) + '</span></li>';
    }).join('') + '</ul>';
  }

  function directRelationshipsHtml(key, result) {
    var rows = (model.EDGES || []).filter(function (edge) { return edge.from === key || edge.to === key; });
    if (!rows.length) return '<p class="eco-empty">No direct relationships are registered for this variable.</p>';
    return '<div class="eco-inspector-relationships">' + rows.slice(0, 6).map(function (edge) {
      var edgeKey = edgeKeyOf(edge);
      var info = result.edgeStates && result.edgeStates[edgeKey];
      return '<button type="button" data-edge="' + esc(edgeKey) + '">' +
        '<span><b>' + esc(nodeLabel(edge.from)) + '</b><i aria-hidden="true">→</i><b>' + esc(nodeLabel(edge.to)) + '</b></span>' +
        '<small>Registered: ' + esc(registeredDirectionWord(edge.direction)) + ' · In this scenario: ' + esc(scenarioStateWord(info)) + '</small></button>';
    }).join('') + (rows.length > 6 ? '<p>' + (rows.length - 6) + ' more direct relationships are available in the full pathway view.</p>' : '') + '</div>';
  }

  /* A state badge says what the model concluded, but not which worlds that
     conclusion allows. This block renders the model's hypotheticals: the two
     directions a '?' is compatible with, or the reading that would change a
     settled '+' or '-'. */
  function directionWord(status) {
    if (status === 'increases') return 'rises';
    if (status === 'decreases') return 'falls';
    return 'shows no change';
  }

  function branchWord(direction) {
    if (direction === 'up') return 'it rises';
    if (direction === 'down') return 'it falls';
    return 'it does not change';
  }

  function sourceTag(source) {
    return source ? '<em>' + esc(source.label) + '</em>' : '';
  }

  function lowerFirst(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  function joinWords(values) {
    if (!values || !values.length) return '';
    if (values.length === 1) return values[0];
    return values.slice(0, -1).join(', ') + ' and ' + values[values.length - 1];
  }

  function branchItemsHtml(branches) {
    return (branches || []).map(function (branch) {
      return branch.options.map(function (option) {
        return '<li><strong>If ' + esc(option.when) + ': ' + esc(branchWord(option.direction)) + '.</strong>' +
          '<span>' + esc(option.because) + ' ' + sourceTag(option.source) + '</span></li>';
      }).join('');
    }).join('');
  }

  function settleHtml(settles, settled) {
    if (!settles) return '';
    return '<p class="eco-hypothesis-settle"><strong>' + (settled ? 'How to check it:' : 'What would settle it:') + '</strong> ' +
      esc(settles.observable) + '. ' + esc(settles.how) + '</p>' +
      '<ul class="eco-hypothesis-readings">' + settles.readings.map(function (reading) {
        return '<li>' + esc(reading.reading) + ': ' + esc(reading.then) + '.</li>';
      }).join('') + '</ul>';
  }

  function hypotheticalHtml(key, result) {
    var effect = effectFor(key, result);
    if (effect && effect.decision) return '<p><strong>' + esc(effect.decision.response) + '.</strong> ' + esc(effect.decision.explanation) + '</p>' +
      '<p><strong>Action:</strong> ' + esc(effect.decision.action) + '</p><p><strong>Next reading:</strong> ' + esc(effect.decision.nextReading) + '</p>' +
      (!result.demo && effect.seedReasons.length ? '<p>' + effect.seedReasons.map(esc).join(' ') + '</p>' : '');
    if (result.demo && result.demo.components[key]) {
      var resolved = result.demo.components[key];
      return '<p><strong>' + esc(resolved.label) + '.</strong> ' + esc(resolved.basis) + '</p><p><strong>Action:</strong> ' + esc(resolved.action) + '</p>';
    }
    var item = null;
    ((result && result.hypotheticals) || []).forEach(function (entry) { if (entry.key === key) item = entry; });
    if (!item) return '';
    var html = '';
    if (item.state === 'undecided') {
      html += '<p class="eco-hypothesis-lead">Two active pathways point in opposite directions:</p>' +
        '<ul class="eco-hypotheses">' + item.camps.map(function (camp) {
          var details = camp.legs.slice(0, 2).map(function (leg) {
            var via = leg.via && leg.via.length ? '<span>Reaches it through ' + esc(joinWords(leg.via.map(lowerFirst))) + '.</span>' : '';
            return '<span>' + esc(leg.why) + ' ' + sourceTag(leg.source) + '</span>' + via;
          }).join('');
          var strength = camp.drivers.length > 1 ? ' are the stronger influences' : ' is the stronger influence';
          return '<li><strong>If ' + esc(camp.drivers.join(' and ')) + strength + ': ' + esc(lowerFirst(item.short)) + ' ' +
            esc(directionWord(camp.direction)) + '.</strong>' + details + '</li>';
        }).join('') + '</ul>';
      if (item.inherited) {
        html += '<p class="eco-hypothesis-note">One question rather than several: every route here passes through ' +
          esc(lowerFirst(item.inherited.short || item.inherited.label)) + ', so the reading that settles that settles this too.</p>';
      }
    } else if (item.state === 'conditional') {
      html += '<p class="eco-hypothesis-lead">Two directions are possible, depending on a condition this scenario does not measure:</p>' +
        '<ul class="eco-hypotheses">' + branchItemsHtml(item.branches) + '</ul>';
    } else {
      html += '<p class="eco-hypothesis-lead">What would change this reading:</p>';
      if (item.because.length) {
        html += '<ul class="eco-hypotheses">' + item.because.slice(0, 3).map(function (leg) {
          return '<li><strong>' + esc(leg.driverShort) + ' <i aria-hidden="true">→</i> ' + esc(item.short) + '</strong>' +
            '<span>' + esc(leg.why) + ' ' + sourceTag(leg.source) + '</span></li>';
        }).join('') + '</ul>';
      }
      if (item.drivers.length) {
        html += '<p class="eco-hypothesis-note">Every active pathway agrees, so this reads the other way only if ' +
          esc(item.drivers.join(' or ')) + ' moves the other way.</p>';
      }
      if (item.holds.length) {
        html += '<p class="eco-hypothesis-note">Recorded conditions and caveats: ' + esc(item.holds.join(' ')) + '</p>';
      }
      if (item.branches.length) {
        html += '<p class="eco-hypothesis-lead">A conditional relationship also points here:</p>' +
          '<ul class="eco-hypotheses">' + branchItemsHtml(item.branches) + '</ul>';
      }
    }
    return html + settleHtml(item.settles, item.state === 'settled');
  }

  function nodePanelHtml(key, result) {
    var label = model.COMPONENTS[key] || key;
    var meta = COMPONENT_META[key] || { category: 'pressure', role: 'Model variable', unit: 'Direction only', description: '' };
    var change = speciesChange(key, result);
    var status = nodeStatus(key, result);
    var statusText = panelStatusLabel(status);
    var effect = effectFor(key, result);
    if (effect && effect.decision) statusText = effect.decision.response;
    if (!effect && result.demo && result.demo.components[key]) statusText = result.demo.components[key].label;
    var values = comparisonHtml(change);
    if (key === 'rainfall') {
      values = result.demo
        ? '<dl class="eco-inspector-values eco-inspector-values--two"><div><dt>Seasonal Rainfall</dt><dd>' + esc(number(result.demo.metrics.rainMm, 0)) + ' mm<small>' + esc(result.driverLabel) + '</small></dd></div><div><dt>Resolved Outlook</dt><dd>' + esc(result.demo.components.rainfall.label) + '<small>Season and rainfall evaluated together</small></dd></div></dl>'
        : '<dl class="eco-inspector-values eco-inspector-values--two"><div><dt>Scenario Signal</dt><dd>' + esc(result.driverLabel) + '</dd></div>' + howMuchHtml() + '</dl>';
    } else if (key === 'rainChemistry' && result.demo) {
      values = '<dl class="eco-inspector-values eco-inspector-values--two"><div><dt>Rain Chemistry</dt><dd>pH ' + esc(number(result.demo.metrics.rainPh, 1)) + '<small>Entered scenario value</small></dd></div><div><dt>Resolved State</dt><dd>' + esc(result.demo.components.rainChemistry.label) + '<small>Quantity is evaluated separately</small></dd></div></dl>';
    } else if (!change) {
      var response = panelResponseWords(status);
      /* The badge above already names the state, so these cells explain it:
         why the model answered this way, and how far the answer goes. */
      values = '<dl class="eco-inspector-values eco-inspector-values--two">' +
        '<div><dt>Why</dt><dd>' + esc(response.summary) + '<small>' + esc(response.detail) + '</small></dd></div>' +
        demoMeasurementHtml(key, result) +
        '</dl>';
    }
    var sources = [];
    if (change && change.source) sources.push(change.source);
    if (result.demo && result.demo.components[key]) {
      result.demo.components[key].evidenceIds.forEach(function (id) {
        var source = sourceById(id);
        if (source && !sources.some(function (item) { return item.id === source.id; })) sources.push(source);
      });
    }
    if (key === 'rainfall' && result.driver !== 'none' && model.SEASONS[result.driver] && model.SEASONS[result.driver].source) {
      sources.push(model.SEASONS[result.driver].source);
    }
    (model.EDGES || []).forEach(function (edge) {
      if ((edge.from === key || edge.to === key) && edge.source && !sources.some(function (source) { return source.id === edge.source.id; })) sources.push(edge.source);
    });
    return '<div class="eco-inspector-head"><p>' + esc(CATEGORY_LABELS[meta.category]) + '</p><h4>' + esc(label) + '</h4><div><span class="eco-role-label">' + esc(panelRoleLabel(meta.role)) + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(status) + '">' + esc(statusText) + '</span></div></div>' +
      values +
      '<section><h5>What This Variable Represents</h5><p>' + esc(meta.description) + '</p></section>' +
      ((key === 'forage' || key === 'competition') ? '<section><h5>Scenario Basis</h5>' + scenarioBasisHtml(key, result, status) + '</section>' : '') +
      '<section><h5>Direct Relationships</h5>' + directRelationshipsHtml(key, result) + '</section>' +
      '<section><h5>Data &amp; Interpretation</h5>' + (change ? '<p>The population comparison is exact for the values entered. Counts stay fixed in this scenario. <button type="button" class="eco-response-select" data-node="health">Inspect condition support for the herd</button></p>' : '') + hypotheticalHtml(key, result) + '<div class="eco-inspector-sources">' + sources.slice(0, 3).map(sourceBadge).join('') + '</div></section>';
  }

  function edgePanelHtml(key, result) {
    var edge = null;
    (model.EDGES || []).forEach(function (item) { if (edgeKeyOf(item) === key) edge = item; });
    if (!edge) return '<p class="eco-empty">Relationship not found.</p>';
    var info = result.edgeStates && result.edgeStates[key];
    var status = info ? info.status : 'unchanged';
    var direction = edge.direction === 'up' ? 'Supports' : (edge.direction === 'down' ? 'Reduces' : 'Resolved by entered conditions');
    return '<div class="eco-inspector-head"><p>Ecological relationship</p><h4>' + esc(model.COMPONENTS[edge.from] || edge.from) + ' <span aria-hidden="true">→</span> ' + esc(model.COMPONENTS[edge.to] || edge.to) + '</h4><div><span class="eco-role-label">' + esc(direction) + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(status) + '">' + esc(info ? panelStatusLabel(status) : 'Not active in this scenario') + '</span></div></div>' +
      (info && info.basis ? '<section><h5>This Scenario</h5><p>' + esc(info.basis) + '</p></section>' : '') +
      '<section><h5>Mechanism</h5><p>' + esc(edge.mechanism) + '</p></section>' +
      '<section><h5>Conditions</h5><p>' + esc(edge.conditions) + '</p></section>' +
      '<section><h5>Evidence</h5><div class="eco-inspector-sources">' + sourceBadge(edge.source) + '</div></section>';
  }

  function pathPanelHtml(path) {
    return '<div class="eco-inspector-head"><p>Ecological pathway</p><h4>' + esc(path.text) + '</h4><div><span class="eco-role-label">' + (path.directOrIndirect === 'direct' ? 'Direct relationship' : path.depth + '-step pathway') + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(path.status) + '">' + esc(panelStatusLabel(path.status)) + '</span></div></div>' +
      '<section><h5>Final Mechanism In This Path</h5><p>' + esc(path.mechanism) + '</p></section>' +
      '<section><h5>Conditions</h5><p>' + esc(path.conditions) + '</p></section>' +
      '<section><h5>Evidence For Final Relationship</h5><div class="eco-inspector-sources">' + sourceBadge(path.source) + '</div></section>';
  }

  function renderPanel(result) {
    if (!el.graphPanel) return;
    var selection = state.selected;
    if (!selection) {
      el.graphPanel.innerHTML = '<div class="eco-inspector-empty"><span aria-hidden="true">◎</span><h4>Select A Model Variable</h4><p>Choose a variable in the network to inspect its role, current state, direct relationships, and evidence.</p></div>';
    } else if (selection.type === 'node') {
      el.graphPanel.innerHTML = nodePanelHtml(selection.key, result);
    } else if (selection.type === 'edge') {
      el.graphPanel.innerHTML = edgePanelHtml(selection.key, result);
    } else if (selection.type === 'path' && state.orderedPaths[selection.index]) {
      el.graphPanel.innerHTML = pathPanelHtml(state.orderedPaths[selection.index]);
    } else {
      el.graphPanel.innerHTML = '<p class="eco-empty">The selected model item is no longer active.</p>';
    }
  }

  function relevantPath(path, index) {
    if (!state.selected) return true;
    if (state.selected.type === 'node') return pathTouchesNode(path, state.selected.key);
    if (state.selected.type === 'edge') return path.edgeKeys.indexOf(state.selected.key) !== -1;
    if (state.selected.type === 'path') return index === state.selected.index;
    return true;
  }

  function routeMarkup(text) {
    return text.split(' -> ').map(function (part) { return '<span>' + esc(part) + '</span>'; }).join('<i aria-hidden="true">→</i>');
  }

  function renderPathways() {
    if (!el.pathways) return;
    var demoRelationships = !!(state.lastResult && state.lastResult.demo);
    var noun = demoRelationships ? 'resolved relationship' : 'active pathway';
    var query = state.pathQuery.toLowerCase();
    var allMatches = state.orderedPaths.map(function (path, index) { return { path: path, index: index }; }).filter(function (item) {
      var matchesScope = state.pathScope === 'all' || relevantPath(item.path, item.index);
      var haystack = (item.path.text + ' ' + item.path.mechanism + ' ' + item.path.conditions).toLowerCase();
      return matchesScope && (!query || haystack.indexOf(query) !== -1);
    });
    var visible = state.pathScope === 'relevant' ? allMatches.slice(0, PATH_PREVIEW_LIMIT) : allMatches;
    var focusLabel = 'the current scenario';
    if (state.selected && state.selected.type === 'node') focusLabel = model.COMPONENTS[state.selected.key] || state.selected.key;
    if (state.selected && state.selected.type === 'edge') focusLabel = 'the selected relationship';
    if (state.selected && state.selected.type === 'path') focusLabel = 'the selected pathway';
    if (el.pathwayStatus) {
      el.pathwayStatus.textContent = !state.orderedPaths.length
        ? (demoRelationships ? 'No relationship passes a change in the current scenario.' : 'No pathways are active for the current scenario.')
        : (state.pathScope === 'relevant'
          ? 'Showing ' + visible.length + ' of ' + allMatches.length + ' ' + noun + (allMatches.length === 1 ? '' : 's') + ' relevant to ' + focusLabel + '.'
          : 'Showing ' + visible.length + ' of ' + state.orderedPaths.length + ' ' + noun + (state.orderedPaths.length === 1 ? '' : 's') + '.');
    }
    if (el.pathScopeRelevant) {
      el.pathScopeRelevant.className = state.pathScope === 'relevant' ? 'is-active' : '';
      el.pathScopeRelevant.setAttribute('aria-pressed', state.pathScope === 'relevant' ? 'true' : 'false');
    }
    if (el.pathScopeAll) {
      el.pathScopeAll.className = state.pathScope === 'all' ? 'is-active' : '';
      el.pathScopeAll.setAttribute('aria-pressed', state.pathScope === 'all' ? 'true' : 'false');
      el.pathScopeAll.textContent = (demoRelationships ? 'All Resolved' : 'All Active') + (state.orderedPaths.length ? ' (' + state.orderedPaths.length + ')' : '');
    }
    if (!visible.length) {
      el.pathways.innerHTML = '<li class="eco-empty">' + (state.orderedPaths.length ? 'No relationships match this focus and search.' : 'Change a population, season or water condition to activate a relationship.') + '</li>';
      return;
    }
    el.pathways.innerHTML = visible.map(function (item) {
      var path = item.path;
      var selected = state.selected && state.selected.type === 'path' && state.selected.index === item.index;
      return '<li><button type="button" class="eco-path-row' + (selected ? ' is-selected' : '') + '" data-path="' + item.index + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
        '<span class="eco-path-index">' + String(item.index + 1).padStart(2, '0') + '</span>' +
        '<span class="eco-path-route">' + routeMarkup(path.text) + '<small>' + (path.directOrIndirect === 'direct' ? 'Direct relationship' : path.depth + ' steps') + ' · ' + esc(path.target) + '</small></span>' +
        '<span class="eco-path-state eco-path-state--' + statusClassFor(path.status) + '">' + esc(statusLabel(path.status)) + '</span>' +
        '</button></li>';
    }).join('');
  }

  function renderCoupling(result) {
    if (result.inputErrors && result.inputErrors.length) return;
    state.orderedPaths = result.pathways.slice().sort(function (a, b) {
      return a.depth - b.depth || a.text.localeCompare(b.text);
    });
    if (state.selected && state.selected.type === 'path' && state.selected.key) {
      var foundIndex = -1;
      state.orderedPaths.forEach(function (path, index) { if (path.edgeKeys.join('|') === state.selected.key) foundIndex = index; });
      if (foundIndex === -1) state.selected = { type: 'node', key: 'zebra' };
      else state.selected.index = foundIndex;
    }
    renderGraph(result);
    renderMobileDirectory(result);
    renderPanel(result);
    renderPathways();
  }

  function renderEvidence() {
    if (!el.evidence) return;
    var sources = Object.keys(model.SOURCES).map(function (key) { return model.SOURCES[key]; });
    el.evidence.innerHTML = sources.map(function (source) {
      return '<li><span class="eco-source-tier">Tier ' + esc(source.tier) + '</span><a href="' + esc(source.url) + '" target="_blank" rel="noopener">' + esc(source.title) + '</a><small>' + esc(source.label) + '</small></li>';
    }).join('');
  }

  function scenarioDifferenceCount(result) {
    return changedInputSummary(result).total;
  }

  function applyScenario(message) {
    state.applied = {
      counts: cloneCounts(state.draft.counts),
      area: state.draft.area,
      driver: state.draft.driver,
      water: Object.assign({}, state.draft.water),
      demo: Object.assign({}, state.draft.demo),
      conditions: Object.assign({}, state.draft.conditions)
    };
    state.revision += 1;
    var result = model.evaluateScenario({
      baselineCounts: state.baseline,
      targetCounts: state.applied.counts,
      estimatedAreaHa: state.applied.area,
      environmentalDrivers: state.applied.driver,
      waterQuality: state.applied.water,
      demo: state.applied.demo,
      conditions: state.applied.conditions
    });
    state.lastResult = result;
    renderSummary(result);
    renderDemoAssessment(result);
    renderWaterAssessment(result);
    if (el.brief) el.brief.disabled = result.inputErrors.length > 0;
    if (result.inputErrors.length) {
      state.orderedPaths = [];
      state.hoverPath = null;
      if (el.graphWrap) el.graphWrap.innerHTML = '<p class="eco-empty">Correct the inputs to evaluate the network.</p>';
      if (el.mobileDirectory) el.mobileDirectory.innerHTML = '';
      if (el.graphPanel) el.graphPanel.innerHTML = '';
      if (el.pathways) el.pathways.innerHTML = '';
      if (el.pathwayStatus) el.pathwayStatus.textContent = 'Awaiting valid inputs';
      if (el.management) el.management.innerHTML = '<li>' + esc(result.decision.action) + '</li>';
      if (el.scenarioStatus) el.scenarioStatus.textContent = 'Correct inputs · results are not ready for interpretation';
      return;
    }
    renderCoupling(result);
    renderUnknowns(result);
    renderManagement(result);
    renderContext();
    if (el.scenarioStatus) {
      var changed = scenarioDifferenceCount(result);
      el.scenarioStatus.innerHTML = '<i aria-hidden="true"></i><strong>Results synchronized</strong><span>' + (message || (changed ? changed + ' input' + (changed === 1 ? ' differs' : 's differ') + ' from baseline' : 'Scenario matches the reference state')) + '</span>';
    }
  }

  function updateTarget(key, value) {
    var parsed = Number(value);
    state.draft.counts[key] = String(value).trim() !== '' && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : value;
    renderSpeciesChangeCell(key);
    applyScenario();
  }

  function selectNode(key) {
    state.selected = { type: 'node', key: key };
    state.pathScope = 'relevant';
    if (state.lastResult) renderCoupling(state.lastResult);
  }

  function selectEdge(key) {
    state.selected = { type: 'edge', key: key };
    state.pathScope = 'relevant';
    if (state.lastResult) renderCoupling(state.lastResult);
  }

  function selectPath(index) {
    var path = state.orderedPaths[index];
    state.selected = { type: 'path', index: index, key: path ? path.edgeKeys.join('|') : null };
    if (state.lastResult) renderCoupling(state.lastResult);
  }

  function setHoverPath(index) {
    if (state.hoverPath === index) return;
    state.hoverPath = index;
    if (state.lastResult) renderGraph(state.lastResult);
  }

  function setBriefBusy(isBusy) {
    if (!el.brief) return;
    el.brief.disabled = !!isBusy;
    el.brief.classList.toggle('is-loading', !!isBusy);
    el.brief.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    var label = el.brief.querySelector('.eco-button-label');
    if (label) label.textContent = isBusy ? 'Generating...' : 'Scenario Brief';
  }

  function briefMessage(message, type) {
    if (window.BioToast && typeof window.BioToast.show === 'function') {
      window.BioToast.show(message, type || 'success');
    } else if (typeof window.showToast === 'function') {
      window.showToast(message, type || 'success');
    }
  }

  function invalidScenarioInput() {
    return document.querySelector('#eco-define input:invalid');
  }

  function generateScenarioBrief() {
    if (!state.lastResult) {
      briefMessage('The scenario is still loading. Try again in a moment.', 'warning');
      return;
    }
    if (state.lastResult.inputErrors.length) { briefMessage('Correct the scenario inputs before generating the brief.', 'error'); return; }
    var invalid = invalidScenarioInput();
    if (invalid) {
      if (typeof invalid.focus === 'function') invalid.focus();
      briefMessage('Correct the scenario inputs before generating the brief.', 'error');
      return;
    }
    if (!window.BioScenarioBrief || typeof window.BioScenarioBrief.createPdf !== 'function' ||
        !window.jspdf || typeof window.jspdf.jsPDF !== 'function') {
      briefMessage('The PDF generator did not load. Check your connection and reload.', 'error');
      return;
    }

    setBriefBusy(true);
    window.setTimeout(function () {
      try {
        var session = window.BioData && typeof window.BioData.getSession === 'function'
          ? window.BioData.getSession()
          : null;
        var report = window.BioScenarioBrief.createPdf({
          jsPDF: window.jspdf.jsPDF,
          result: state.lastResult,
          context: state.context,
          revision: state.revision,
          defaultAreaHa: model.DEFAULT_AREA_HA,
          approvedObservationCount: approvedOperationalObservationCount(),
          generatedBy: session && (session.name || session.email) ? (session.name || session.email) : 'ZitBio administrator'
        });
        briefMessage('Scenario Brief generated: ' + report.snapshot.scenarioId, 'success');
      } catch (error) {
        console.error('Scenario Brief generation failed', error);
        briefMessage('The Scenario Brief could not be generated. Please try again.', 'error');
      } finally {
        setBriefBusy(false);
      }
    }, 0);
  }

  function selectFromEvent(event) {
    var target = event.target;
    var node = target && target.closest ? target.closest('[data-node]') : null;
    if (node) { selectNode(node.getAttribute('data-node')); return true; }
    var edge = target && target.closest ? target.closest('[data-edge]') : null;
    if (edge) { selectEdge(edge.getAttribute('data-edge')); return true; }
    return false;
  }

  function wire() {
    if (el.demoInputs) el.demoInputs.addEventListener('change', function (event) {
      var key = event.target && event.target.getAttribute('data-demo-input');
      if (!key) return;
      state.draft.demo[key] = event.target.value;
      state.draft.conditions = demoModel.contextFor(state.draft.demo);
      applyScenario();
    });
    if (el.waterSample) el.waterSample.addEventListener('change', function () {
      state.draft.water = waterModel.sampleInput(el.waterSample.value);
      renderWaterControls();
      applyScenario();
    });
    [['waterAvailability', 'availability'], ['waterBloom', 'bloom']].forEach(function (pair) {
      if (el[pair[0]]) el[pair[0]].addEventListener('change', function () { editWater(pair[1], el[pair[0]].value); });
    });
    [['soilCondition', 'soil'], ['bankCondition', 'bank'], ['woodyCondition', 'woody']].forEach(function (pair) {
      if (el[pair[0]]) el[pair[0]].addEventListener('change', function () { state.draft.conditions[pair[1]] = el[pair[0]].value; applyScenario(); });
    });
    if (el.speciesControls) {
      el.speciesControls.addEventListener('input', function (event) {
        var input = event.target;
        if (input && input.getAttribute('data-eco-target')) updateTarget(input.getAttribute('data-eco-target'), input.value);
      });
      el.speciesControls.addEventListener('change', function (event) {
        var input = event.target;
        var key = input && input.getAttribute('data-eco-target');
        if (!key) return;
        updateTarget(key, input.value);
        input.value = state.draft.counts[key];
      });
    }
    if (el.area) el.area.addEventListener('input', function () { state.draft.area = el.area.value; applyScenario(); });
    if (el.driver) el.driver.addEventListener('change', function () { state.draft.driver = el.driver.value; applyScenario(); });
    if (el.reset) el.reset.addEventListener('click', function () {
      var demo = demoModel.defaultInput();
      state.draft = { counts: cloneCounts(state.baseline), area: model.DEFAULT_AREA_HA, driver: 'none', water: waterModel.sampleInput('demo-reference'), demo: demo, conditions: demoModel.contextFor(demo) };
      if (el.area) el.area.value = String(model.DEFAULT_AREA_HA);
      if (el.driver) el.driver.value = 'none';
      renderSpeciesControls();
      renderDemoControls();
      renderWaterControls();
      applyScenario('Scenario reset to the reference values');
    });
    if (el.graphWrap) {
      el.graphWrap.addEventListener('click', selectFromEvent);
      el.graphWrap.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        if (selectFromEvent(event)) event.preventDefault();
      });
    }
    if (el.mobileDirectory) el.mobileDirectory.addEventListener('click', selectFromEvent);
    if (el.graphPanel) el.graphPanel.addEventListener('click', selectFromEvent);
    if (el.pathways) {
      el.pathways.addEventListener('click', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-path]') : null;
        if (button) selectPath(Number(button.getAttribute('data-path')));
      });
      el.pathways.addEventListener('mouseover', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-path]') : null;
        if (button) setHoverPath(Number(button.getAttribute('data-path')));
      });
      el.pathways.addEventListener('mouseout', function () { setHoverPath(null); });
      el.pathways.addEventListener('focusin', function (event) {
        var button = event.target && event.target.closest ? event.target.closest('[data-path]') : null;
        if (button) setHoverPath(Number(button.getAttribute('data-path')));
      });
      el.pathways.addEventListener('focusout', function () { setHoverPath(null); });
    }
    if (el.pathScopeRelevant) el.pathScopeRelevant.addEventListener('click', function () { state.pathScope = 'relevant'; renderPathways(); });
    if (el.pathScopeAll) el.pathScopeAll.addEventListener('click', function () { state.pathScope = 'all'; renderPathways(); });
    if (el.pathSearch) el.pathSearch.addEventListener('input', function () { state.pathQuery = el.pathSearch.value || ''; renderPathways(); });
    if (el.brief) el.brief.addEventListener('click', generateScenarioBrief);
  }

  function cache() {
    var ids = {
      speciesControls: 'ecoSpeciesControls', area: 'ecoArea', driver: 'ecoDriver',
      demoInputs: 'ecoDemoInputs', demoAssessment: 'ecoDemoAssessment',
      waterSample: 'ecoWaterSample', waterReadings: 'ecoWaterReadings', waterSource: 'ecoWaterSource', waterAssessment: 'ecoWaterAssessment',
      waterAvailability: 'ecoWaterAvailability', waterBloom: 'ecoWaterBloom',
      soilCondition: 'ecoSoilCondition', bankCondition: 'ecoBankCondition', woodyCondition: 'ecoWoodyCondition',
      summary: 'ecoSummary', summarySub: 'ecoSummarySub',
      graphWrap: 'ecoGraphWrap', mobileDirectory: 'ecoMobileDirectory', graphPanel: 'ecoGraphPanel',
      pathways: 'ecoPathways', pathwayStatus: 'ecoPathwayStatus', pathScopeRelevant: 'ecoPathScopeRelevant',
      pathScopeAll: 'ecoPathScopeAll', pathSearch: 'ecoPathSearch', unknowns: 'ecoUnknowns',
      management: 'ecoManagement', evidence: 'ecoEvidence', dataContext: 'ecoDataContext',
      scenarioStatus: 'ecoScenarioStatus', reset: 'ecoReset', brief: 'ecoScenarioBrief'
    };
    Object.keys(ids).forEach(function (key) { el[key] = $(ids[key]); });
  }

  function loadBaseline(preserveDraft) {
    var registry = window.BioData && window.BioData.getSpeciesRegistry ? window.BioData.getSpeciesRegistry() : [];
    var observations = window.BioData && window.BioData.getObservations ? window.BioData.getObservations() : [];
    var oldBaseline = cloneCounts(state.baseline);
    state.context = model.baselineContext({ registry: registry, observations: observations });
    state.context.forEach(function (item) { state.baseline[item.key] = item.registeredCount; });
    if (preserveDraft) {
      model.SPECIES.forEach(function (species) {
        if (state.draft.counts[species.key] === oldBaseline[species.key]) state.draft.counts[species.key] = state.baseline[species.key];
      });
    } else {
      state.draft.counts = cloneCounts(state.baseline);
    }
  }

  function initialize() {
    cache();
    loadBaseline(false);
    state.draft.area = el.area ? el.area.value : model.DEFAULT_AREA_HA;
    state.draft.driver = el.driver ? el.driver.value : 'none';
    renderSpeciesControls();
    renderDemoControls();
    renderWaterControls();
    renderEvidence();
    wire();
    applyScenario();
    window.addEventListener('biodata:synced', function () {
      loadBaseline(true);
      renderSpeciesControls();
      applyScenario('Baseline refreshed; working edits were preserved');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
}());
