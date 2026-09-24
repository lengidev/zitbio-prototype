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

  var MODEL_VERSION = 'cbu-qualitative-v3';
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
      /* Polarity convention for this pair, recorded so it is not inverted again:
         `soil` is a CONDITION variable (higher means better cover and structure,
         and it rises when vegetation cover protects it), while `erosion` is a
         PRESSURE variable (higher means worse). Better soil condition therefore
         means LESS erosion pressure, which is `down`. The mechanism text states
         the same claim from the other end: it is the loss of cover, not its
         presence, that exposes ground to runoff. Reading this edge as `up` would
         make erosion fall as grazing strips the sward, contradicting that text. */
      from: 'soil', to: 'erosion', direction: 'down', directOrIndirect: 'indirect',
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
   * A conditional edge carries no sign and an undecided node carries two, so both
   * leave a question open. These two tables are the only place the model says what
   * the possible worlds look like: one authored branch list per conditional edge,
   * and the field reading that closes a fork. Both are explanation, never a claim
   * that the condition was measured in this park. Each branch restates the claim
   * its own edge already registers (compete or shelter, enrich or compact,
   * disturb or leave alone), so no branch adds evidence the edge did not have.
   */
  var CONDITION_BRANCHES = {
    'zebra>soil': [
      {
        when: 'the herd moves on before ground cover is broken',
        direction: 'up',
        because: 'Dung and urine return nutrients and lightly used ground keeps its structure, so soil condition improves.',
        source: SOURCES.SOIL_HERBIVORE
      },
      {
        when: 'the same ground is grazed and trampled continuously',
        direction: 'down',
        because: 'Hoof action compacts the surface, breaks the cover and concentrates nutrient loading in one area.',
        source: SOURCES.SOIL_HERBIVORE
      }
    ],
    'zebra>waterQuality': [
      {
        when: 'animals concentrate and the bank is trampled or eroded',
        direction: 'down',
        because: 'Bank disturbance and sediment lower clarity, and dung at the waterline adds nutrient loading.',
        source: SOURCES.WATER_GRAZING
      },
      {
        when: 'use is dispersed and the bank stays vegetated',
        direction: 'none',
        because: 'Without bank disturbance or animals standing at the water, no directional change is supported at all.',
        source: SOURCES.WATER_GRAZING
      }
    ],
    'woody>forage': [
      {
        when: 'woody cover is dense enough to take light, water and space from the grass layer',
        direction: 'down',
        because: 'Competition from established woody plants lowers the grass layer underneath them.',
        source: SOURCES.MWEKERA
      },
      {
        when: 'the woody layer is open enough to shade and shelter the grass layer',
        direction: 'up',
        because: 'Scattered woody plants can favour the grass layer through shade and litter instead of suppressing it.',
        source: SOURCES.MWEKERA
      }
    ]
  };

  /*
   * Full labels identify a variable in a heading or a table, but they read as
   * punctuation inside a sentence: "through Rainfall / seasonal dryness -> Grass /
   * available forage". Anything that appears in the explanation uses a short name
   * instead, so a sentence contains only words.
   */
  var SHORT_LABELS = {
    zebra: 'Zebra',
    waterbuck: 'Waterbuck',
    puku: 'Puku',
    impala: 'Impala',
    forage: 'Forage',
    competition: 'Competition',
    woody: 'Woody cover',
    water: 'Water',
    waterQuality: 'Water quality',
    soil: 'Soil condition',
    erosion: 'Erosion pressure',
    rainfall: 'Rainfall',
    health: 'Animal condition'
  };

  function shortLabel(key) {
    return SHORT_LABELS[key] || COMPONENTS[key] || key;
  }

  function lowerFirstWord(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  /*
   * `source` on a settle entry is the source whose claim the reading tests, and
   * `how` only names work the field protocol already records. Nothing here asks
   * for an instrument the park does not have.
   */
  var SETTLES = {
    forage: {
      observable: 'Standing forage on the vegetation walk',
      how: 'The walk already records grass cover and height, and the Register calibration turns cover into kg DM per hectare.',
      readings: [
        { reading: 'Standing forage falls between the two walks', direction: 'decreases', then: 'the grazing leg dominated' },
        { reading: 'Standing forage rises between the two walks', direction: 'increases', then: 'the growth leg dominated' }
      ],
      source: SOURCES.MWEKERA
    },
    competition: {
      observable: 'Where and when each herbivore feeds',
      how: 'Record feeding location, the grass height used and the time of day for each species in the same cycle.',
      readings: [
        { reading: 'The species still overlap in place, height and hour', direction: 'increases', then: 'competition rose with the counted demand' },
        { reading: 'The species separate by place, height or hour', direction: 'decreases', then: 'partitioning released the pressure instead' }
      ],
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
    },
    soil: {
      observable: 'Ground condition at fixed inspection points',
      how: 'The soil walk already records surface condition, compaction and erosion signs at the same points.',
      readings: [
        { reading: 'Ground stays intact and soft under use', direction: 'increases', then: 'the grazing effect is enrichment and soil condition holds' },
        { reading: 'Ground reads crusted or hard and rills appear', direction: 'decreases', then: 'the grazing effect is degradation and soil condition falls' }
      ],
      source: SOURCES.SOIL_HERBIVORE
    },
    erosion: {
      observable: 'Bare ground and visible erosion at fixed ground points',
      how: 'Photograph the same points after major rain and at the end of the dry season.',
      readings: [
        { reading: 'Bare ground spreads and rills or gullies appear', direction: 'increases', then: 'erosion pressure rose' },
        { reading: 'Cover holds through the wet season', direction: 'decreases', then: 'erosion pressure did not rise, whatever the animal count' }
      ],
      source: SOURCES.SOIL_HERBIVORE
    },
    woody: {
      observable: 'Grass under woody patches compared with open ground',
      how: 'Compare cover and grass height under woody patches with open ground on the same transect.',
      readings: [
        { reading: 'Grass is sparser under the canopy', direction: 'decreases', then: 'woody cover is competing with the grass layer' },
        { reading: 'Grass is equal or taller under the canopy', direction: 'increases', then: 'woody cover is sheltering the grass layer' }
      ],
      source: SOURCES.MWEKERA
    },
    waterQuality: {
      observable: 'Bank condition and water appearance at the water point',
      how: 'The water walk already records bank condition and water appearance.',
      readings: [
        { reading: 'Trampled or eroded bank and turbid water', direction: 'decreases', then: 'water quality fell with animal concentration' },
        { reading: 'Vegetated bank and clear water', direction: 'unchanged', then: 'no directional change is supported' }
      ],
      source: SOURCES.WATER_GRAZING
    }
  };

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

  function effectForKey(effects, key) {
    return (effects || []).filter(function (effect) { return effect.key === key; })[0] || null;
  }

  function edgeByKey(key) {
    return EDGES.filter(function (edge) { return edge.from + '>' + edge.to === key; })[0] || null;
  }

  function pathNodes(path) {
    var nodes = [];
    path.edgeKeys.forEach(function (key) {
      var edge = edgeByKey(key);
      if (!edge) return;
      if (!nodes.length) nodes.push(edge.from);
      nodes.push(edge.to);
    });
    return nodes;
  }

  /*
   * A leg is described by its first edge, not its last. The route says which way
   * the signal travelled, but the mechanism that makes the claim interesting is
   * the one where it started: bulk grazing removes grass, while soil compaction
   * three steps later is a consequence of that same claim.
   */
  function uniqueList(values) {
    var out = [];
    values.forEach(function (value) { if (value && out.indexOf(value) === -1) out.push(value); });
    return out;
  }

  function legFromPath(path) {
    var first = path.edgeKeys.length ? edgeByKey(path.edgeKeys[0]) : null;
    var driver = first ? first.from : null;
    return {
      route: path.text,
      depth: path.depth,
      driver: driver,
      driverLabel: driver ? (COMPONENTS[driver] || driver) : null,
      driverShort: driver ? shortLabel(driver) : null,
      /* Nodes between the driver and the target, in sentence form, so a multi-step
         leg can say "reaches it through forage and soil" instead of printing a
         chain of labels and arrows. */
      via: pathNodes(path).slice(1, -1).map(shortLabel),
      why: first ? first.mechanism : path.mechanism,
      conditions: first ? first.conditions : path.conditions,
      source: first ? first.source : path.source
    };
  }

  function conditionalBranches(paths) {
    var out = [];
    var seen = {};
    paths.forEach(function (path) {
      if (path.status !== 'conditional' || !path.edgeKeys.length) return;
      var lastKey = path.edgeKeys[path.edgeKeys.length - 1];
      if (seen[lastKey]) return;
      var edge = edgeByKey(lastKey);
      var options = CONDITION_BRANCHES[lastKey];
      if (!edge || !options) return;
      seen[lastKey] = true;
      out.push({
        edge: lastKey,
        from: edge.from,
        to: edge.to,
        conditions: edge.conditions,
        options: options.map(function (option) {
          return { when: option.when, direction: option.direction, because: option.because, source: option.source };
        })
      });
    });
    return out;
  }

  /*
   * When every opposing route passes through one node that is itself undecided,
   * the reader is being shown the same question twice. Naming that node is what
   * stops a single unknown from looking like four separate ones.
   */
  function sharedUndecidedNode(paths, statusOf, targetKey) {
    if (paths.length < 2) return null;
    var common = pathNodes(paths[0]).filter(function (node) {
      if (node === targetKey || statusOf(node) !== 'uncertain') return false;
      return paths.every(function (path) { return pathNodes(path).indexOf(node) !== -1; });
    });
    if (!common.length) return null;
    return { key: common[0], label: COMPONENTS[common[0]] || common[0], short: shortLabel(common[0]) };
  }

  function hypotheticalFor(effect, paths, statusOf) {
    if (!effect || effect.status === 'unchanged') return null;
    var state = effect.status === 'uncertain' ? 'undecided' : (effect.status === 'conditional' ? 'conditional' : 'settled');
    var item = {
      key: effect.key,
      label: COMPONENTS[effect.key] || effect.key,
      short: shortLabel(effect.key),
      state: state,
      direction: state === 'settled' ? effect.status : null,
      camps: [],
      branches: conditionalBranches(paths),
      inherited: null,
      settles: SETTLES[effect.key] || null
    };
    if (state === 'undecided') {
      ['increases', 'decreases'].forEach(function (status) {
        var legs = paths.filter(function (path) { return path.status === status; });
        if (!legs.length) return;
        var details = legs.map(legFromPath);
        item.camps.push({
          direction: status,
          /* Sentence-form names only: these appear inside the explanation. */
          drivers: uniqueList(details.map(function (leg) { return leg.driverShort; })),
          legs: details
        });
      });
      item.inherited = sharedUndecidedNode(paths, statusOf, effect.key);
      return item;
    }
    if (state === 'conditional') return item;
    var settled = paths.filter(function (path) { return path.status === effect.status; });
    item.because = settled.map(legFromPath);
    item.drivers = uniqueList(item.because.map(function (leg) { return leg.driverShort; }));
    item.holds = item.because.map(function (leg) { return leg.conditions; }).filter(function (text, index, all) {
      return text && all.indexOf(text) === index;
    });
    return item;
  }

  function sourceIdsForTargets(pathways, targetKeys) {
    var ids = [];
    (pathways || []).forEach(function (path) {
      if (targetKeys.indexOf(path.targetKey) === -1 || !path.source || !path.source.id) return;
      if (ids.indexOf(path.source.id) === -1) ids.push(path.source.id);
    });
    return ids;
  }

  /*
   * Recommendations are structured model output, not PDF prose. Keeping the
   * trigger, action, rationale and evidence together means the page and every
   * export explain the same scenario without inventing advice in a renderer.
   */
  function managementRecommendations(changedKeys, driver, effects, pathways, area, hypotheticals) {
    var recommendations = [];
    var seen = {};

    /* Which open question each measurement answers. Advice is only advice when it
       says what the reading decides, so the decision wording is derived from the
       same hypotheticals the page shows and cannot drift from them. */
    var MONITORS = {
      'measure-forage': ['forage'],
      'observe-resource-overlap': ['competition'],
      'monitor-water-condition': ['water', 'waterQuality'],
      'inspect-ground-condition': ['soil', 'erosion'],
      'survey-woody-structure': ['woody']
    };

    function directionWord(status) {
      if (status === 'increases') return 'increasing';
      if (status === 'decreases') return 'decreasing';
      return 'no-change';
    }

    function decisionSentence(entry) {
      if (entry.branches.length) {
        /* A conditional arm outranks a settled leg as the thing to measure: the
           settled leg is already supported, the condition is not yet known. */
        var text = 'which of the registered conditions held for ' + lowerFirstWord(entry.short) + ', because a conditional relationship points at this variable and carries no direction until that is known';
        if (entry.state === 'settled') {
          text += '; the network currently supports a ' + directionWord(entry.direction) + ' response through the active pathways';
        }
        return text;
      }
      if (entry.state === 'undecided') {
        return 'which of the active influences on ' + lowerFirstWord(entry.short) + ' dominated, because the network cannot weigh them against each other';
      }
      return 'whether the reported ' + directionWord(entry.direction) + ' response of ' + lowerFirstWord(entry.short) + ' holds, which the network supports only while the stated conditions hold';
    }

    function decisionOutcomes(entry) {
      if (entry.branches.length) {
        return entry.branches[0].options.slice(0, 2).map(function (option) {
          return { when: option.when, direction: option.direction };
        });
      }
      if (entry.settles) {
        return entry.settles.readings.slice(0, 2).map(function (reading) {
          return { when: reading.reading, direction: reading.direction, then: reading.then };
        });
      }
      return [];
    }

    function decorate(item) {
      var keys = MONITORS[item.id] || [];
      var linked = keys.map(function (key) {
        return (hypotheticals || []).filter(function (entry) { return entry.key === key; })[0];
      }).filter(Boolean);
      if (!linked.length) return;
      /* A question left open outranks a settled reading when both are monitored,
         because that is the one the measurement can still change. */
      var open = linked.filter(function (entry) { return entry.state !== 'settled'; });
      var primary = (open.length ? open : linked)[0];
      item.monitors = linked.map(function (entry) { return entry.key; });
      item.decides = decisionSentence(primary);
      item.outcomes = decisionOutcomes(primary);
    }

    function add(item) {
      if (seen[item.id]) return;
      seen[item.id] = true;
      decorate(item);
      recommendations.push(item);
    }

    var changedLabels = SPECIES.filter(function (species) {
      return changedKeys.indexOf(species.key) !== -1;
    }).map(function (species) { return species.label; });

    if (changedLabels.length) {
      add({
        id: 'repeat-population-counts',
        priority: 'foundational',
        trigger: 'Edited population inputs: ' + changedLabels.join(', '),
        action: 'Repeat the same population-count protocol before and after any management action, recording survey effort, date and habitat used.',
        rationale: 'The entered counts are scenario inputs. A repeatable field series is needed before an apparent difference can be treated as ecological change.',
        evidenceIds: [SOURCES.QUALITATIVE_NETWORK.id]
      });
    } else {
      add({
        id: 'establish-reference-series',
        priority: 'foundational',
        trigger: 'Scenario populations match the registered reference state',
        action: 'Use this reference scenario to establish repeatable population, grass-cover and water-condition measurements.',
        rationale: 'A measured reference series is needed before later scenarios can be compared with observed change.',
        evidenceIds: [SOURCES.QUALITATIVE_NETWORK.id]
      });
    }

    var forage = effectForKey(effects, 'forage');
    if (forage && forage.status !== 'unchanged') {
      add({
        id: 'measure-forage',
        priority: forage.status === 'increases' ? 'medium' : 'high',
        trigger: 'Available forage ' + (forage.status === 'uncertain' ? 'has opposing active influences' : forage.status),
        action: 'Measure grass cover, standing biomass and bare ground on fixed transects before changing animal numbers or declaring spare capacity.',
        rationale: forage.status === 'uncertain'
          ? 'The active pathways do not agree on one direction, and the model has no calibrated influence strengths.'
          : 'The network identifies a direction only; local forage quantity, intake and access are not calibrated.',
        evidenceIds: sourceIdsForTargets(pathways, ['forage'])
      });
    }

    var competition = effectForKey(effects, 'competition');
    if (competition && competition.status !== 'unchanged') {
      add({
        id: 'observe-resource-overlap',
        priority: competition.status === 'increases' || competition.status === 'uncertain' ? 'high' : 'medium',
        trigger: 'Shared-forage competition ' + (competition.status === 'uncertain' ? 'is uncertain' : competition.status),
        action: 'Record feeding locations, grass-height use and time-of-day overlap for each herbivore during the next survey cycle.',
        rationale: 'Spatial and seasonal partitioning can weaken or strengthen the competition pathways shown by the scenario.',
        evidenceIds: sourceIdsForTargets(pathways, ['competition'])
      });
    }

    var water = effectForKey(effects, 'water');
    var waterQuality = effectForKey(effects, 'waterQuality');
    if ((water && water.status !== 'unchanged') || (waterQuality && waterQuality.status !== 'unchanged')) {
      add({
        id: 'monitor-water-condition',
        priority: (water && water.status === 'decreases') || (waterQuality && waterQuality.status === 'decreases') ? 'high' : 'medium',
        trigger: 'An active pathway changes water availability or water quality',
        action: 'Track water level, clarity, bank disturbance and animal concentration at the same marked locations.',
        rationale: 'The park water feature and catchment are not measured in this model, so field observations must confirm the directional response.',
        evidenceIds: sourceIdsForTargets(pathways, ['water', 'waterQuality'])
      });
    }

    var soil = effectForKey(effects, 'soil');
    var erosion = effectForKey(effects, 'erosion');
    if ((soil && soil.status !== 'unchanged') || (erosion && erosion.status !== 'unchanged')) {
      add({
        id: 'inspect-ground-condition',
        priority: erosion && erosion.status === 'increases' ? 'high' : 'medium',
        trigger: 'An active pathway changes soil condition or erosion pressure',
        action: 'Photograph fixed ground points and measure bare cover, trampling and visible erosion after major rain and at the end of the dry season.',
        rationale: 'Ground response depends on vegetation cover, stocking pressure, rainfall and dung distribution rather than animal count alone.',
        evidenceIds: sourceIdsForTargets(pathways, ['soil', 'erosion'])
      });
    }

    var woody = effectForKey(effects, 'woody');
    if (woody && woody.status !== 'unchanged') {
      add({
        id: 'survey-woody-structure',
        priority: 'medium',
        trigger: 'Woody vegetation has an active or conditional response',
        action: 'Record browse availability, woody cover and grass beneath woody patches before interpreting the forage response.',
        rationale: 'Woody vegetation can compete with grass or provide browse and shade depending on local structure.',
        evidenceIds: sourceIdsForTargets(pathways, ['woody'])
      });
    }

    if (driver === 'rainy') {
      add({
        id: 'rainy-season-checks',
        priority: 'medium',
        trigger: SEASONS.rainy.label,
        action: 'Check whether new grass is accessible and record runoff, water clarity and newly exposed erosion after rain.',
        rationale: 'Rainfall can support forage and water while runoff can transmit soil disturbance into water-quality pressure.',
        evidenceIds: [SOURCES.SEASON_CALENDAR.id, SOURCES.SASSCAL.id]
      });
    } else if (driver === 'coolDry') {
      add({
        id: 'cool-dry-season-checks',
        priority: 'medium',
        trigger: SEASONS.coolDry.label,
        action: 'Measure remaining standing grass and repeat body-condition observations because the standing crop must carry animals until the rains.',
        rationale: 'Grass does not regrow through the cool dry period, making measured remaining forage the relevant field check.',
        evidenceIds: [SOURCES.SEASON_CALENDAR.id]
      });
    } else if (driver === 'hotDry') {
      add({
        id: 'hot-dry-season-checks',
        priority: 'high',
        trigger: SEASONS.hotDry.label,
        action: 'Prioritise water-point use, body condition, bank disturbance, remaining forage and the fire-risk window.',
        rationale: 'Animals can concentrate around water while forage and water availability decline during the hottest dry period.',
        evidenceIds: [SOURCES.SEASON_CALENDAR.id, SOURCES.SASSCAL.id]
      });
    }

    if (area != null) {
      add({
        id: 'verify-area',
        priority: 'foundational',
        trigger: 'Density uses an estimated whole-park area of ' + area + ' ha',
        action: 'Confirm the surveyed boundary and usable habitat area before using density as a management threshold.',
        rationale: 'The area is a prototype estimate rather than a surveyed polygon.',
        evidenceIds: []
      });
    }

    var order = { high: 0, medium: 1, foundational: 2 };
    recommendations.sort(function (a, b) {
      return order[a.priority] - order[b.priority] || a.id.localeCompare(b.id);
    });
    return recommendations;
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

    /* Built from the same pathways the page lists, so a fork shown in the panel
       and the same fork named in the brief are one computation, not two. */
    var statusOf = function (key) {
      var effect = edges.filter(function (item) { return item.key === key; })[0];
      return effect ? effect.status : 'unchanged';
    };
    var hypotheticals = edges.map(function (effect) {
      return hypotheticalFor(effect, pathways.filter(function (path) { return path.targetKey === effect.key; }), statusOf);
    }).filter(Boolean);
    var recommendations = managementRecommendations(changedKeys, driver, edges, pathways, area, hypotheticals);

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
      hypotheticals: hypotheticals,
      feedbackLoops: pathways.filter(function (path) { return path.depth > 1 && path.text.indexOf('forage ->') !== -1; }),
      unknownMagnitudes: unknowns,
      managementRecommendations: recommendations,
      managementInterpretation: recommendations.map(function (item) { return item.action; }),
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
    evaluateScenario: evaluateScenario,
    hypotheticalFor: hypotheticalFor,
    CONDITION_BRANCHES: CONDITION_BRANCHES,
    SETTLES: SETTLES
  };
}));
