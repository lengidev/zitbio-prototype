/*
 * ZitBio qualitative ecosystem model.
 *
 * This is deliberately a small, deterministic model rather than a calibrated
 * population simulator. It combines exact scenario arithmetic with an
 * evidence-bounded signed interaction network. Every edge says what it means,
 * under which conditions it applies, and where the ecological claim came from.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.BioEcosystem = factory();
  }
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var MODEL_VERSION = 'cbu-qualitative-v2';
  var DEFAULT_AREA_HA = 6.6;
  var MAX_PATH_DEPTH = 3;

  var SOURCES = {
    CBU_BASELINE: {
      id: 'cbu-baseline-2023',
      tier: 'A',
      label: 'CBU verified',
      title: 'Copperbelt University Nature Park animal donation (2023)',
      url: 'https://www.cbu.ac.zm/schoolsAndUnits/tc/2023/09/12/the-copperbelt-university-receives-wildlife-animals-from-kansanshi-mining-plc-to-promote-conservation-and-education/'
    },
    MWEKERA: {
      id: 'mwekera-wet-miombo',
      tier: 'B',
      label: 'Regional evidence',
      title: 'Wet Miombo physiology near Kitwe',
      url: 'https://academic.oup.com/treephys/article/39/1/104/5038979'
    },
    AFRICAN_HERBIVORE_PARTITION: {
      id: 'african-herbivore-partition',
      tier: 'C',
      label: 'African analogue',
      title: 'African herbivore diet and resource partitioning',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4491742/'
    },
    PUKU_IMPALA: {
      id: 'puku-impala-coexistence',
      tier: 'C',
      label: 'African analogue',
      title: 'Puku and impala seasonal niche partitioning',
      url: 'https://www.sciencedirect.com/science/article/abs/pii/S1616504716300209'
    },
    SOIL_HERBIVORE: {
      id: 'herbivore-soil-feedback',
      tier: 'C',
      label: 'African analogue',
      title: 'Herbivore effects on soil nutrients and tree-grass balance',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3057003/'
    },
    WATER_GRAZING: {
      id: 'grazing-water-quality',
      tier: 'C',
      label: 'African analogue',
      title: 'Grazing pressure and water quality',
      url: 'https://www.frontiersin.org/journals/environmental-science/articles/10.3389/fenvs.2022.972153/full'
    },
    QUALITATIVE_NETWORK: {
      id: 'qualitative-network-method',
      tier: 'C',
      label: 'Method evidence',
      title: 'Qualitative signed interaction networks for data-limited systems',
      url: 'https://www.sciencedirect.com/science/article/abs/pii/S0304380000002179'
    },
    SASSCAL: {
      id: 'sasscal-cbu-station',
      tier: 'A',
      label: 'Station source',
      title: 'SASSCAL CBU Kitwe weather station',
      url: 'https://dev.sasscalweathernet.org/index/daily/61014'
    },
    SEASON_CALENDAR: {
      id: 'zambia-season-calendar',
      tier: 'C',
      label: 'Compiled reference',
      title: 'Zambia season calendar and dry-season ecology (compiled)',
      url: 'https://en.wikipedia.org/wiki/Climate_of_Zambia'
    }
  };

  var SPECIES = [
    { key: 'zebra', label: 'Zebra', scientificName: 'Equus quagga', baseline: 3, source: SOURCES.CBU_BASELINE },
    { key: 'waterbuck', label: 'Waterbuck', scientificName: 'Kobus ellipsiprymnus', baseline: 3, source: SOURCES.CBU_BASELINE },
    { key: 'puku', label: 'Puku', scientificName: 'Kobus vardonii', baseline: 5, source: SOURCES.CBU_BASELINE },
    { key: 'impala', label: 'Impala', scientificName: 'Aepyceros melampus', baseline: 8, source: SOURCES.CBU_BASELINE }
  ];

  var COMPONENTS = {
    zebra: 'Zebra',
    waterbuck: 'Waterbuck',
    puku: 'Puku',
    impala: 'Impala',
    forage: 'Grass / available forage',
    competition: 'Shared-forage competition',
    woody: 'Woody vegetation',
    water: 'Water availability',
    waterQuality: 'Water quality',
    soil: 'Soil condition',
    erosion: 'Erosion pressure',
    rainfall: 'Rainfall / seasonal dryness',
    health: 'Animal condition'
  };

  /*
   * An edge direction describes the effect of an increase in `from` on `to`.
   * `conditional` is intentionally not converted into a definite up/down claim.
   */
  var EDGES = [
    {
      from: 'zebra', to: 'forage', direction: 'down', directOrIndirect: 'direct',
      mechanism: 'Bulk grazing removes grass biomass and increases forage demand.',
      conditions: 'Direction is clearest when the herd shares the same sward and intake is not supplemented.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'forage', to: 'zebra', direction: 'up', directOrIndirect: 'feedback',
      mechanism: 'More available forage supports herbivore body condition and persistence.',
      conditions: 'This is a support relationship, not a population-growth forecast.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'forage', to: 'waterbuck', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Waterbuck share grass resources, especially in moist or riparian areas.',
      conditions: 'The park must actually contain accessible forage used by waterbuck.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'forage', to: 'puku', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Puku depend on palatable grass and wetland-edge forage.',
      conditions: 'The direction is conditional on available wet habitat and shared forage.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'forage', to: 'impala', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Impala use fresh grass and switch to browse or fallen material seasonally.',
      conditions: 'The effect can be buffered where browse is available.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'waterbuck', to: 'forage', direction: 'down', directOrIndirect: 'direct',
      mechanism: 'Waterbuck grazing removes part of the shared grass resource.',
      conditions: 'The direction assumes the animals are using the same measured sward.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'puku', to: 'forage', direction: 'down', directOrIndirect: 'direct',
      mechanism: 'Puku grazing draws down palatable grass in wet or riparian areas.',
      conditions: 'The local wet-habitat association must be confirmed by field walks.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'impala', to: 'forage', direction: 'down', directOrIndirect: 'direct',
      mechanism: 'Impala grazing and mixed feeding contribute to shared forage demand.',
      conditions: 'Browse can buffer pressure when it is available; its quantity is not measured.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'waterbuck', to: 'competition', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'More waterbuck increase demand on forage shared with other grazers.',
      conditions: 'The magnitude depends on diet overlap and seasonal access to grass.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'puku', to: 'competition', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'More puku increase pressure on shared palatable grass.',
      conditions: 'Spatial and seasonal partitioning may reduce the realised competition.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'impala', to: 'competition', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'More impala increase shared forage demand while retaining a browse option.',
      conditions: 'The balance between grass and browse is currently unmeasured.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'zebra', to: 'competition', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'More zebra create greater demand on resources shared with other herbivores.',
      conditions: 'Competition is a pressure indicator, not a predicted displacement count.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'competition', to: 'waterbuck', direction: 'down', directOrIndirect: 'indirect',
      mechanism: 'Shared forage demand can reduce the resource available to other grazers.',
      conditions: 'The result depends on overlap in diet, space, and season.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'competition', to: 'puku', direction: 'down', directOrIndirect: 'indirect',
      mechanism: 'Greater overlap in palatable grass use can increase competition pressure on puku.',
      conditions: 'Puku may partition space or season, so the outcome is context-dependent.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'competition', to: 'impala', direction: 'down', directOrIndirect: 'indirect',
      mechanism: 'Reduced shared forage can push impala toward lower-quality or alternative browse.',
      conditions: 'Browse availability can buffer this pathway.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'zebra', to: 'soil', direction: 'conditional', directOrIndirect: 'direct',
      mechanism: 'Repeated grazing and trampling can alter soil cover and nutrient distribution.',
      conditions: 'The direction depends on stocking pressure, ground cover, and dung distribution.',
      source: SOURCES.SOIL_HERBIVORE
    },
    {
      from: 'soil', to: 'erosion', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Reduced soil cover can expose ground to runoff and erosion.',
      conditions: 'The pathway strengthens during intense rainfall after vegetation loss.',
      source: SOURCES.SOIL_HERBIVORE
    },
    {
      from: 'erosion', to: 'waterQuality', direction: 'down', directOrIndirect: 'indirect',
      mechanism: 'Sediment and disturbed banks can reduce water clarity and quality.',
      conditions: 'A connected water body and runoff pathway must be present.',
      source: SOURCES.WATER_GRAZING
    },
    {
      from: 'zebra', to: 'waterQuality', direction: 'conditional', directOrIndirect: 'direct',
      mechanism: 'More animals at a shared water point can increase bank disturbance and contamination pressure.',
      conditions: 'No pond size, bank-use, or water-quality measurement is currently available.',
      source: SOURCES.WATER_GRAZING
    },
    {
      from: 'rainfall', to: 'forage', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'Rainfall supports grass growth and replenishes seasonal forage.',
      conditions: 'The response is seasonal and depends on soil and prior moisture.',
      source: SOURCES.MWEKERA
    },
    {
      from: 'rainfall', to: 'water', direction: 'up', directOrIndirect: 'direct',
      mechanism: 'Rainfall can increase water availability in surface and soil stores.',
      conditions: 'The park water feature and catchment are not yet measured in ZitBio.',
      source: SOURCES.SASSCAL
    },
    {
      from: 'water', to: 'waterbuck', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Water availability supports water-dependent herbivore activity and condition.',
      conditions: 'This indicates support, not an abundance prediction.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'water', to: 'puku', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Puku use moist grassland and water-associated habitat.',
      conditions: 'The local habitat association must be confirmed by field walks.',
      source: SOURCES.PUKU_IMPALA
    },
    {
      from: 'forage', to: 'soil', direction: 'up', directOrIndirect: 'feedback',
      mechanism: 'Vegetation cover protects soil and returns organic material.',
      conditions: 'This is a support relationship, not a measured soil-carbon result.',
      source: SOURCES.SOIL_HERBIVORE
    },
    {
      from: 'impala', to: 'woody', direction: 'down', directOrIndirect: 'direct',
      mechanism: 'Browsing and mixed feeding can reduce some palatable woody growth.',
      conditions: 'The direction depends on browse availability and plant species.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    {
      from: 'woody', to: 'forage', direction: 'conditional', directOrIndirect: 'indirect',
      mechanism: 'Woody cover can compete with grass or provide shade and habitat depending on density.',
      conditions: 'The local vegetation structure is not currently quantified.',
      source: SOURCES.MWEKERA
    }
  ];

  /*
   * Zambian seasons, from the standard season calendar: rainy season Nov to
   * Apr (the Copperbelt sits in the wetter northern rainfall zone), cool dry
   * season May to Aug, hot dry season Sep to Oct/Nov. `seeds` are the initial
   * signals pushed into the signed network, and `notes` feed the management
   * lines. Selecting a season is the user's choice; nothing is read from the
   * current date or from a live weather feed.
   */
  var SEASONS = {
    none: {
      key: 'none',
      label: 'No seasonal adjustment',
      seeds: [],
      notes: [],
      source: null
    },
    rainy: {
      key: 'rainy',
      label: 'Rainy season (Nov to Apr)',
      seeds: [{ node: 'rainfall', sign: 1 }],
      notes: ['During the rainy season, check whether new grass is actually accessible and whether runoff is changing water clarity.'],
      source: SOURCES.SEASON_CALENDAR
    },
    coolDry: {
      key: 'coolDry',
      label: 'Cool dry season (May to Aug)',
      seeds: [{ node: 'rainfall', sign: -1 }],
      notes: ['In the cool dry season grass does not regrow, so the standing crop is the whole of the supply until the rains.'],
      source: SOURCES.SEASON_CALENDAR
    },
    hotDry: {
      key: 'hotDry',
      label: 'Hot dry season (Sep to Oct/Nov)',
      seeds: [{ node: 'rainfall', sign: -1 }, { node: 'water', sign: -1 }],
      notes: ['In the hot dry season watch the fire window, and expect animals to concentrate at water; check bank disturbance and body condition.'],
      source: SOURCES.SEASON_CALENDAR
    }
  };

  function cleanCount(value, fallback) {
    var parsed = Number(value);
    if (!isFinite(parsed)) return fallback == null ? 0 : fallback;
    return Math.max(0, Math.round(parsed));
  }

  function cleanArea(value) {
    var parsed = Number(value);
    return isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function percentChange(from, to) {
    if (from === 0) return to === 0 ? 0 : null;
    return ((to - from) / from) * 100;
  }

  function signFor(value) {
    return value > 0 ? 1 : (value < 0 ? -1 : 0);
  }

  function invertSign(sign) {
    return sign === 1 ? -1 : (sign === -1 ? 1 : 0);
  }

  function signLabel(sign) {
    if (sign > 0) return 'increases';
    if (sign < 0) return 'decreases';
    return 'does not change';
  }

  function statusFromSigns(signs, conditional) {
    var seen = {};
    signs.forEach(function (sign) { seen[sign] = true; });
    if (seen[1] && seen[-1]) return 'uncertain';
    if (seen[1]) return 'increases';
    if (seen[-1]) return 'decreases';
    if (conditional) return 'conditional';
    return 'unchanged';
  }

  function registeredCounts() {
    var out = {};
    SPECIES.forEach(function (species) { out[species.key] = species.baseline; });
    return out;
  }

  function mapRegistryCounts(registry) {
    var out = registeredCounts();
    (registry || []).forEach(function (row) {
      var scientific = String(row.scientific_name || '').toLowerCase();
      SPECIES.forEach(function (species) {
        if (scientific === species.scientificName.toLowerCase() && row.baseline_count != null) {
          out[species.key] = cleanCount(row.baseline_count, species.baseline);
        }
      });
    });
    return out;
  }

  function latestApprovedObservationCounts(observations) {
    var latest = {};
    (observations || []).filter(function (row) {
      return String(row.source || '').toLowerCase() !== 'gbif' &&
        String(row.provenance || '').toLowerCase() !== 'external' &&
        String(row.verification_status || '').toLowerCase() === 'approved';
    }).forEach(function (row) {
      var scientific = String(row.species_details && row.species_details.scientific_name || row.scientific_name || '').toLowerCase();
      var match = SPECIES.filter(function (species) { return scientific === species.scientificName.toLowerCase(); })[0];
      if (!match) return;
      var at = Date.parse(row.timestamp || '');
      if (!latest[match.key] || (!isNaN(at) && at > latest[match.key].at)) {
        latest[match.key] = { count: cleanCount(row.count, 0), at: isNaN(at) ? 0 : at, row: row };
      }
    });
    return latest;
  }

  function baselineContext(options) {
    options = options || {};
    var registered = mapRegistryCounts(options.registry);
    var latest = latestApprovedObservationCounts(options.observations);
    return SPECIES.map(function (species) {
      return {
        key: species.key,
        label: species.label,
        scientificName: species.scientificName,
        registeredCount: registered[species.key],
        latestObservedCount: latest[species.key] ? latest[species.key].count : null,
        latestObservedAt: latest[species.key] ? latest[species.key].row.timestamp : null,
        source: species.source
      };
    });
  }

  function edgeDirection(edge, incomingSign) {
    if (edge.direction === 'conditional') return null;
    return incomingSign === 1 ? (edge.direction === 'up' ? 1 : -1) : invertSign(edge.direction === 'up' ? 1 : -1);
  }

  /*
   * Scenario populations are interventions: once a user sets a population, the
   * same calculation must not feed a resource response back into that population
   * and then count the return path as a second prediction. All population inputs
   * are therefore held fixed for this comparative scenario. Paths may continue
   * through derived variables, but may not revisit a node or enter a fixed input.
   */
  function deriveEffects(speciesChanges, driver) {
    var results = {};
    var queue = [];
    var season = SEASONS[driver] || SEASONS.none;
    var fixedInputs = {};
    SPECIES.forEach(function (species) { fixedInputs[species.key] = true; });

    speciesChanges.forEach(function (change) {
      var sign = signFor(change.delta);
      if (sign !== 0) queue.push({ node: change.key, sign: sign, path: [], nodes: [change.key], depth: 0 });
    });

    season.seeds.forEach(function (seed) {
      queue.push({ node: seed.node, sign: seed.sign, path: [], nodes: [seed.node], depth: 0 });
    });

    var edgeStates = {};
    while (queue.length) {
      var item = queue.shift();
      if (item.depth >= MAX_PATH_DEPTH) continue;
      var outgoing = EDGES.filter(function (edge) { return edge.from === item.node; });
      outgoing.forEach(function (edge) {
        if (fixedInputs[edge.to]) return;
        if (item.nodes.indexOf(edge.to) !== -1) return;
        var newPath = item.path.concat([edge]);
        var newNodes = item.nodes.concat([edge.to]);
        var nextSign = edgeDirection(edge, item.sign);
        var key = edge.to;
        if (!results[key]) {
          results[key] = { key: key, label: COMPONENTS[key] || key, signs: [], paths: [], conditional: false };
        }
        if (nextSign == null) {
          results[key].conditional = true;
        } else if (nextSign !== 0) {
          results[key].signs.push(nextSign);
        }
        results[key].paths.push({ edges: newPath, status: nextSign == null ? 'conditional' : signLabel(nextSign) });

        var edgeKey = edge.from + '>' + edge.to;
        if (!edgeStates[edgeKey]) edgeStates[edgeKey] = { signs: [], conditional: false };
        if (nextSign == null) edgeStates[edgeKey].conditional = true;
        else if (nextSign !== 0) edgeStates[edgeKey].signs.push(nextSign);

        if (nextSign !== 0 && nextSign != null) {
          queue.push({ node: key, sign: nextSign, path: newPath, nodes: newNodes, depth: item.depth + 1 });
        }
      });
    }

    Object.keys(edgeStates).forEach(function (key) {
      edgeStates[key].status = statusFromSigns(edgeStates[key].signs, edgeStates[key].conditional);
    });

    return {
      effects: Object.keys(results).map(function (key) {
        var item = results[key];
        item.status = statusFromSigns(item.signs, item.conditional);
        item.direct = item.paths.some(function (path) { return path.edges.length === 1; });
        item.indirect = item.paths.some(function (path) { return path.edges.length > 1; });
        item.hasConditionalInfluence = item.conditional;
        item.unknownMagnitude = item.status !== 'unchanged';
        return item;
      }),
      edgeStates: edgeStates
    };
  }

  function pathText(path) {
    var labels = [];
    if (!path || !path.edges || !path.edges.length) return '';
    labels.push(COMPONENTS[path.edges[0].from] || path.edges[0].from);
    path.edges.forEach(function (edge) { labels.push(COMPONENTS[edge.to] || edge.to); });
    return labels.join(' -> ');
  }

  function managementInterpretation(changedKeys, driver) {
    var lines = [];
    if (changedKeys.indexOf('zebra') !== -1) {
      lines.push('Prioritise repeatable grass-cover and bare-ground measurements before treating the zebra scenario as a carrying-capacity claim.');
      lines.push('Record where animals use water and whether bank disturbance is visible; no internal pond sections are assumed.');
    }
    var season = SEASONS[driver] || SEASONS.none;
    season.notes.forEach(function (note) { lines.push(note); });
    lines.push('Use the result to choose the next field measurement, not to announce an exact future population.');
    return lines;
  }

  function evaluateScenario(input) {
    input = input || {};
    var registered = input.baselineCounts || registeredCounts();
    var targets = input.targetCounts || registered;
    var area = cleanArea(input.estimatedAreaHa == null ? DEFAULT_AREA_HA : input.estimatedAreaHa);
    var driver = SEASONS[input.environmentalDrivers] ? input.environmentalDrivers : 'none';
    var speciesChanges = SPECIES.map(function (species) {
      var from = cleanCount(registered[species.key], species.baseline);
      var to = cleanCount(targets[species.key], from);
      return {
        key: species.key,
        label: species.label,
        scientificName: species.scientificName,
        from: from,
        to: to,
        delta: to - from,
        percent: percentChange(from, to),
        densityFrom: area == null ? null : from / area,
        densityTo: area == null ? null : to / area,
        source: species.source
      };
    });
    var changedKeys = speciesChanges.filter(function (item) { return item.delta !== 0; }).map(function (item) { return item.key; });
    var totalFrom = speciesChanges.reduce(function (sum, item) { return sum + item.from; }, 0);
    var totalTo = speciesChanges.reduce(function (sum, item) { return sum + item.to; }, 0);
    var selected = speciesChanges.filter(function (item) { return item.delta !== 0; });
    var selectedPrimary = selected[0] || null;
    var primaryMultiplier = selectedPrimary && selectedPrimary.from > 0 ? selectedPrimary.to / selectedPrimary.from : null;
    var derived = deriveEffects(speciesChanges, driver);
    var edges = derived.effects;
    var pathways = [];
    edges.forEach(function (effect) {
      effect.paths.forEach(function (path) {
        pathways.push({
          target: effect.label,
          targetKey: effect.key,
          status: path.status,
          depth: path.edges.length,
          text: pathText(path),
          edgeKeys: path.edges.map(function (edge) { return edge.from + '>' + edge.to; }),
          mechanism: path.edges[path.edges.length - 1].mechanism,
          conditions: path.edges[path.edges.length - 1].conditions,
          source: path.edges[path.edges.length - 1].source,
          directOrIndirect: path.edges.length === 1 ? 'direct' : 'indirect'
        });
      });
    });

    var unknowns = [
      'Grass biomass and water demand are not converted into an invented percentage because the park has no validated intake, forage, water-volume, or boundary measurements.',
      'The 6.6 ha figure is an estimated whole-park area supplied for this prototype, not a surveyed polygon.',
      'A pathway direction does not establish that the outcome will occur at a particular magnitude or date.',
      'Population inputs are held at the scenario values for this comparison; feedback relationships are not iterated as a time-series forecast.'
    ];
    if (driver !== 'none') unknowns.push('The season is a scenario driver you selected; it is not read from the current date or from a live SASSCAL forecast in this version.');

    return {
      modelVersion: MODEL_VERSION,
      estimatedAreaHa: area,
      areaLabel: area == null ? 'Area not available' : 'Estimated whole-park area',
      driver: driver,
      driverLabel: SEASONS[driver].label,
      speciesChanges: speciesChanges,
      totals: {
        from: totalFrom,
        to: totalTo,
        delta: totalTo - totalFrom,
        percent: percentChange(totalFrom, totalTo),
        densityFrom: area == null ? null : totalFrom / area,
        densityTo: area == null ? null : totalTo / area
      },
      primaryMultiplier: primaryMultiplier,
      selectedSpecies: selectedPrimary ? selectedPrimary.label : null,
      effects: edges,
      edgeStates: derived.edgeStates,
      pathways: pathways,
      feedbackLoops: pathways.filter(function (path) { return path.depth > 1 && path.text.indexOf('forage ->') !== -1; }),
      unknownMagnitudes: unknowns,
      managementInterpretation: managementInterpretation(changedKeys, driver),
      evidence: SOURCES
    };
  }

  return {
    MODEL_VERSION: MODEL_VERSION,
    DEFAULT_AREA_HA: DEFAULT_AREA_HA,
    MAX_PATH_DEPTH: MAX_PATH_DEPTH,
    SOURCES: SOURCES,
    SPECIES: SPECIES,
    COMPONENTS: COMPONENTS,
    EDGES: EDGES,
    SEASONS: SEASONS,
    registeredCounts: registeredCounts,
    baselineContext: baselineContext,
    latestApprovedObservationCounts: latestApprovedObservationCounts,
    evaluateScenario: evaluateScenario
  };
}));
