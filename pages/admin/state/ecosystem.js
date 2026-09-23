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

  var el = {};
  var PATH_PREVIEW_LIMIT = 7;
  var GRAPH_VIEW = { width: 880, height: 520 };
  var NODE_HALF_HEIGHT = 22;

  var COMPONENT_META = {
    rainfall: {
      category: 'environment', role: 'Scenario driver', unit: 'Seasonal signal',
      description: 'A qualitative rainfall and dryness signal set by the selected season. It is not a live weather measurement.'
    },
    forage: {
      category: 'resource', role: 'Derived variable', unit: 'Direction only',
      description: 'Available grass and forage represented through supported grazing, rainfall, vegetation, and soil relationships.'
    },
    water: {
      category: 'resource', role: 'Derived variable', unit: 'Direction only',
      description: 'Water availability represented as a qualitative resource. The park water feature and catchment are not measured here.'
    },
    woody: {
      category: 'resource', role: 'Derived variable', unit: 'Direction only',
      description: 'Woody vegetation that may provide browse, shade, or competition with grass depending on local structure.'
    },
    competition: {
      category: 'pressure', role: 'Derived variable', unit: 'Direction only',
      description: 'Pressure created when herbivores overlap in their use of shared forage across space and season.'
    },
    soil: {
      category: 'pressure', role: 'Derived variable', unit: 'Direction only',
      description: 'Soil condition as supported by vegetation cover and affected conditionally by grazing and trampling.'
    },
    erosion: {
      category: 'pressure', role: 'Derived variable', unit: 'Direction only',
      description: 'Potential erosion pressure associated with exposed ground and runoff; no erosion magnitude is calculated.'
    },
    waterQuality: {
      category: 'pressure', role: 'Derived variable', unit: 'Direction only',
      description: 'Qualitative water-quality pressure associated with sediment, bank disturbance, and connected runoff.'
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
    resource: 'Habitat & resources',
    pressure: 'Interactions & condition',
    wildlife: 'Wildlife populations'
  };

  var GRAPH_NODES = [
    { key: 'rainfall', x: 440, y: 67, w: 166, label: 'Rainfall / dryness' },
    { key: 'forage', x: 165, y: 178, w: 148, label: 'Available forage' },
    { key: 'water', x: 440, y: 178, w: 132, label: 'Water availability' },
    { key: 'woody', x: 715, y: 178, w: 148, label: 'Woody vegetation' },
    { key: 'competition', x: 112, y: 310, w: 168, label: 'Forage competition' },
    { key: 'soil', x: 330, y: 310, w: 126, label: 'Soil condition' },
    { key: 'erosion', x: 546, y: 310, w: 132, label: 'Erosion pressure' },
    { key: 'waterQuality', x: 760, y: 310, w: 148, label: 'Water quality' },
    { key: 'zebra', x: 112, y: 449, w: 126, label: 'Zebra' },
    { key: 'waterbuck', x: 330, y: 449, w: 138, label: 'Waterbuck' },
    { key: 'puku', x: 546, y: 449, w: 126, label: 'Puku' },
    { key: 'impala', x: 760, y: 449, w: 126, label: 'Impala' }
  ];

  var EDGE_KEYS = {};
  (model.EDGES || []).forEach(function (edge) { EDGE_KEYS[edge.from + '>' + edge.to] = true; });

  function cloneCounts(counts) {
    var copy = {};
    model.SPECIES.forEach(function (species) { copy[species.key] = Number(counts[species.key]); });
    return copy;
  }

  var initialCounts = model.registeredCounts();

  var state = {
    baseline: model.registeredCounts(),
    draft: { counts: initialCounts, area: model.DEFAULT_AREA_HA, driver: 'none' },
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
    if (status === 'uncertain' || status === 'conflicting' || status === 'mixed') return 'Direction uncertain';
    if (status === 'conditional') return 'Conditional';
    return 'No modeled change';
  }

  function statusSymbol(status) {
    if (status === 'increases') return '+';
    if (status === 'decreases') return '\u2212';
    if (status === 'uncertain' || status === 'mixed') return '?';
    if (status === 'conditional') return '?';
    return '\u00b7';
  }

  function nodeStatus(key, result) {
    var change = speciesChange(key, result);
    if (change && change.delta !== 0) return change.delta > 0 ? 'increases' : 'decreases';
    if (key === 'rainfall') {
      var season = model.SEASONS && model.SEASONS[result.driver];
      if (season && season.seeds.length) {
        var seed = season.seeds.filter(function (item) { return item.node === 'rainfall'; })[0];
        if (seed) return seed.sign > 0 ? 'increases' : 'decreases';
      }
    }
    var effect = effectFor(key, result);
    return effect ? effect.status : 'unchanged';
  }

  function sourceBadge(source) {
    if (!source) return '<span class="eco-badge eco-badge--assumption">No source attached</span>';
    return '<span class="eco-badge">Tier ' + esc(source.tier) + ' · ' + esc(source.label) + '</span>';
  }

  function changeMarkup(from, to) {
    var delta = Number(to) - Number(from);
    var pct = from === 0 ? (to === 0 ? 0 : null) : delta / from * 100;
    var cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'same');
    return '<span class="eco-change eco-change--' + cls + '"><b>' + signed(delta, 0) + '</b><small>' + (pct == null ? 'new value' : percent(pct)) + '</small></span>';
  }

  function renderSpeciesControls() {
    if (!el.speciesControls) return;
    var rows = model.SPECIES.map(function (species) {
      var baseline = state.baseline[species.key];
      var target = state.draft.counts[species.key];
      return '<tr>' +
        '<th scope="row"><strong>' + esc(species.label) + '</strong><small>' + esc(species.scientificName) + '</small></th>' +
        '<td class="eco-baseline"><span class="sr-only">Baseline </span>' + esc(baseline) + '</td>' +
        '<td><label class="eco-field"><span class="sr-only">Scenario count for ' + esc(species.label) + '</span><input type="number" min="0" step="1" inputmode="numeric" value="' + esc(target) + '" data-eco-target="' + esc(species.key) + '" aria-label="Scenario count for ' + esc(species.label) + '"></label></td>' +
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

  function renderContext() {
    var observations = (window.BioData && window.BioData.getObservations) ? window.BioData.getObservations() : [];
    var approved = (observations || []).filter(function (row) {
      return String(row.verification_status || '').toLowerCase() === 'approved';
    }).length;
    if (!el.dataContext) return;
    el.dataContext.innerHTML = approved
      ? '<strong>Data context</strong><span>' + approved + ' approved operational observation' + (approved === 1 ? '' : 's') + ' available. GBIF records are excluded from this baseline.</span>'
      : '<strong>Data context</strong><span>No approved operational observations are available. Registered reference values remain in use.</span>';
  }

  function changedInputSummary(result) {
    var populationCount = result.speciesChanges.filter(function (item) { return item.delta !== 0; }).length;
    var contextCount = (result.driver !== 'none' ? 1 : 0) + (Number(state.applied.area) !== Number(model.DEFAULT_AREA_HA) ? 1 : 0);
    return {
      total: populationCount + contextCount,
      populationCount: populationCount,
      contextCount: contextCount
    };
  }

  function renderSummary(result) {
    if (!el.summary) return;
    var changes = changedInputSummary(result);
    var density = result.totals.densityTo == null ? 'Not available' : number(result.totals.densityTo, 2);
    var densityNote = result.totals.densityTo == null ? 'A positive area is required' : 'animals per estimated ha';
    if (el.summarySub) {
      el.summarySub.textContent = 'Synchronized with the working scenario · ' + result.driverLabel + (result.estimatedAreaHa == null ? '' : ' · ' + number(result.estimatedAreaHa, 1) + ' ha estimate');
    }
    if (el.modelTag) el.modelTag.textContent = result.modelVersion;
    el.summary.innerHTML = '<div class="eco-outcome-lead"><span>Current interpretation</span><strong>' +
      (changes.total ? changes.total + ' input' + (changes.total === 1 ? ' differs' : 's differ') + ' from the reference state.' : 'The working scenario matches the reference state.') +
      '</strong><p>The network reports supported directions and conditions. It does not predict an exact future abundance, resource loss, or date.</p></div>' +
      '<dl class="eco-metric-grid">' +
        '<div class="eco-metric"><dt>Inputs changed</dt><dd>' + changes.total + '</dd><small>' + changes.populationCount + ' population' + (changes.populationCount === 1 ? '' : 's') + (changes.contextCount ? ' · ' + changes.contextCount + ' context' : '') + '</small></div>' +
        '<div class="eco-metric"><dt>Total animals</dt><dd>' + number(result.totals.from, 0) + '<span aria-hidden="true">→</span>' + number(result.totals.to, 0) + '</dd><small>' + signed(result.totals.delta, 0) + ' · ' + percent(result.totals.percent) + '</small></div>' +
        '<div class="eco-metric"><dt>Scenario density</dt><dd>' + density + '</dd><small>' + densityNote + '</small></div>' +
        '<div class="eco-metric"><dt>Network response</dt><dd>' + result.effects.length + '</dd><small>components · ' + result.pathways.length + ' active pathways</small></div>' +
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
      '<rect x="12" y="385" width="856" height="119" rx="10"></rect><text x="30" y="409">WILDLIFE POPULATIONS</text>' +
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
        ? 'The response depends on conditions that are not measured in this scenario.'
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
      var current = info ? statusLabel(info.status) : 'Inactive in this scenario';
      return '<button type="button" data-edge="' + esc(edgeKey) + '"><span><b>' + esc(model.COMPONENTS[edge.from] || edge.from) + '</b><i aria-hidden="true">→</i><b>' + esc(model.COMPONENTS[edge.to] || edge.to) + '</b></span><small>' + esc(current) + '</small></button>';
    }).join('') + (rows.length > 6 ? '<p>' + (rows.length - 6) + ' more direct relationships are available in the full pathway view.</p>' : '') + '</div>';
  }

  function nodePanelHtml(key, result) {
    var label = model.COMPONENTS[key] || key;
    var meta = COMPONENT_META[key] || { category: 'pressure', role: 'Model variable', unit: 'Direction only', description: '' };
    var change = speciesChange(key, result);
    var status = nodeStatus(key, result);
    var statusText = statusLabel(status);
    var values = comparisonHtml(change);
    if (key === 'rainfall') {
      values = '<dl class="eco-inspector-values eco-inspector-values--two"><div><dt>Scenario signal</dt><dd>' + esc(result.driverLabel) + '</dd></div><div><dt>Network state</dt><dd>' + esc(statusText) + '</dd></div></dl>';
    } else if (!change) {
      values = '<dl class="eco-inspector-values eco-inspector-values--two"><div><dt>Model response</dt><dd>' + esc(statusText) + '</dd></div><div><dt>Magnitude</dt><dd>Not quantified</dd></div></dl>';
    }
    var sources = [];
    if (change && change.source) sources.push(change.source);
    if (key === 'rainfall' && result.driver !== 'none' && model.SEASONS[result.driver] && model.SEASONS[result.driver].source) {
      sources.push(model.SEASONS[result.driver].source);
    }
    (model.EDGES || []).forEach(function (edge) {
      if ((edge.from === key || edge.to === key) && edge.source && !sources.some(function (source) { return source.id === edge.source.id; })) sources.push(edge.source);
    });
    return '<div class="eco-inspector-head"><p>' + esc(CATEGORY_LABELS[meta.category]) + '</p><h4>' + esc(label) + '</h4><div><span class="eco-role-label">' + esc(meta.role) + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(status) + '">' + esc(statusText) + '</span></div></div>' +
      values +
      '<section><h5>What this variable represents</h5><p>' + esc(meta.description) + '</p></section>' +
      ((key === 'forage' || key === 'competition') ? '<section><h5>Scenario basis</h5>' + scenarioBasisHtml(key, result, status) + '</section>' : '') +
      '<section><h5>Direct relationships</h5>' + directRelationshipsHtml(key, result) + '</section>' +
      '<section><h5>Data &amp; interpretation</h5><p>Unit: ' + esc(meta.unit) + '. ' + (change ? 'The population comparison is exact for the values entered.' : 'The response is qualitative; no unsupported magnitude is calculated.') + '</p><div class="eco-inspector-sources">' + sources.slice(0, 3).map(sourceBadge).join('') + '</div></section>';
  }

  function edgePanelHtml(key, result) {
    var edge = null;
    (model.EDGES || []).forEach(function (item) { if (edgeKeyOf(item) === key) edge = item; });
    if (!edge) return '<p class="eco-empty">Relationship not found.</p>';
    var info = result.edgeStates && result.edgeStates[key];
    var status = info ? info.status : 'unchanged';
    var direction = edge.direction === 'up' ? 'Supports' : (edge.direction === 'down' ? 'Reduces' : 'Conditional direction');
    return '<div class="eco-inspector-head"><p>Ecological relationship</p><h4>' + esc(model.COMPONENTS[edge.from] || edge.from) + ' <span aria-hidden="true">→</span> ' + esc(model.COMPONENTS[edge.to] || edge.to) + '</h4><div><span class="eco-role-label">' + esc(direction) + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(status) + '">' + esc(info ? statusLabel(status) : 'Inactive in this scenario') + '</span></div></div>' +
      '<section><h5>Mechanism</h5><p>' + esc(edge.mechanism) + '</p></section>' +
      '<section><h5>Conditions</h5><p>' + esc(edge.conditions) + '</p></section>' +
      '<section><h5>Evidence</h5><div class="eco-inspector-sources">' + sourceBadge(edge.source) + '</div></section>';
  }

  function pathPanelHtml(path) {
    return '<div class="eco-inspector-head"><p>Ecological pathway</p><h4>' + esc(path.text) + '</h4><div><span class="eco-role-label">' + (path.directOrIndirect === 'direct' ? 'Direct relationship' : path.depth + '-step pathway') + '</span><span class="eco-status-text eco-status-text--' + statusClassFor(path.status) + '">' + esc(statusLabel(path.status)) + '</span></div></div>' +
      '<section><h5>Final mechanism in this path</h5><p>' + esc(path.mechanism) + '</p></section>' +
      '<section><h5>Conditions</h5><p>' + esc(path.conditions) + '</p></section>' +
      '<section><h5>Evidence for final relationship</h5><div class="eco-inspector-sources">' + sourceBadge(path.source) + '</div></section>';
  }

  function renderPanel(result) {
    if (!el.graphPanel) return;
    var selection = state.selected;
    if (!selection) {
      el.graphPanel.innerHTML = '<div class="eco-inspector-empty"><span aria-hidden="true">◎</span><h4>Select a model variable</h4><p>Choose a variable in the network to inspect its role, current state, direct relationships, and evidence.</p></div>';
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
        ? 'No pathways are active for the current scenario.'
        : (state.pathScope === 'relevant'
          ? 'Showing ' + visible.length + ' of ' + allMatches.length + ' pathways relevant to ' + focusLabel + '.'
          : 'Showing ' + visible.length + ' of ' + state.orderedPaths.length + ' active pathways.');
    }
    if (el.pathScopeRelevant) {
      el.pathScopeRelevant.className = state.pathScope === 'relevant' ? 'is-active' : '';
      el.pathScopeRelevant.setAttribute('aria-pressed', state.pathScope === 'relevant' ? 'true' : 'false');
    }
    if (el.pathScopeAll) {
      el.pathScopeAll.className = state.pathScope === 'all' ? 'is-active' : '';
      el.pathScopeAll.setAttribute('aria-pressed', state.pathScope === 'all' ? 'true' : 'false');
      el.pathScopeAll.textContent = 'All active' + (state.orderedPaths.length ? ' (' + state.orderedPaths.length + ')' : '');
    }
    if (!visible.length) {
      el.pathways.innerHTML = '<li class="eco-empty">' + (state.orderedPaths.length ? 'No pathways match this focus and search.' : 'Change a population or choose a season to activate pathways.') + '</li>';
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
      driver: state.draft.driver
    };
    state.revision += 1;
    var result = model.evaluateScenario({
      baselineCounts: state.baseline,
      targetCounts: state.applied.counts,
      estimatedAreaHa: state.applied.area,
      environmentalDrivers: state.applied.driver
    });
    state.lastResult = result;
    renderSummary(result);
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
    if (String(value).trim() === '') return;
    var parsed = Number(value);
    if (!isFinite(parsed) || parsed < 0) return;
    state.draft.counts[key] = Math.round(parsed);
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

  function downloadBrief() {
    var result = state.lastResult;
    if (!result) return;
    var lines = [
      'ZitBio ecosystem scenario brief',
      'Model: ' + result.modelVersion,
      'Scenario revision: ' + state.revision,
      'Context: ' + result.driverLabel,
      'Estimated whole-park area: ' + (result.estimatedAreaHa == null ? 'not available' : result.estimatedAreaHa + ' ha'),
      '',
      'Population inputs:'
    ];
    result.speciesChanges.forEach(function (item) { lines.push('- ' + item.label + ': ' + item.from + ' -> ' + item.to + ' (' + percent(item.percent) + ')'); });
    lines.push('', 'Evidence-supported pathways:');
    result.pathways.forEach(function (path) { lines.push('- ' + path.text + ': ' + path.status + '. ' + path.mechanism); });
    lines.push('', 'Unknown magnitudes:');
    result.unknownMagnitudes.forEach(function (text) { lines.push('- ' + text); });
    var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'zitbio-ecosystem-scenario.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
      state.draft = { counts: cloneCounts(state.baseline), area: model.DEFAULT_AREA_HA, driver: 'none' };
      if (el.area) el.area.value = String(model.DEFAULT_AREA_HA);
      if (el.driver) el.driver.value = 'none';
      renderSpeciesControls();
      applyScenario('Scenario reset to the registered reference');
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
    if (el.download) el.download.addEventListener('click', downloadBrief);
  }

  function cache() {
    var ids = {
      speciesControls: 'ecoSpeciesControls', area: 'ecoArea', driver: 'ecoDriver',
      summary: 'ecoSummary', summarySub: 'ecoSummarySub', modelTag: 'ecoModelTag',
      graphWrap: 'ecoGraphWrap', mobileDirectory: 'ecoMobileDirectory', graphPanel: 'ecoGraphPanel',
      pathways: 'ecoPathways', pathwayStatus: 'ecoPathwayStatus', pathScopeRelevant: 'ecoPathScopeRelevant',
      pathScopeAll: 'ecoPathScopeAll', pathSearch: 'ecoPathSearch', unknowns: 'ecoUnknowns',
      management: 'ecoManagement', evidence: 'ecoEvidence', dataContext: 'ecoDataContext',
      scenarioStatus: 'ecoScenarioStatus', reset: 'ecoReset', download: 'ecoDownload'
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
