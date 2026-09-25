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
    module.exports = factory(require('./water-quality.js'), require('./ecosystem-demo.js'));
  } else {
    root.BioEcosystem = factory(root.BioWaterQuality, root.BioEcosystemDemo);
  }
}(typeof window !== 'undefined' ? window : this, function (waterModel, demoModel) {
  'use strict';

  var MODEL_VERSION = 'cbu-scenario-decision-v7';
  var DEFAULT_AREA_HA = 6.6;
  var MAX_PATH_DEPTH;

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
      tier: 'B',
      label: 'National climate reference',
      title: 'Zambia National Rainwater Harvesting Strategy and Implementation Plan (2024)',
      url: 'https://www.mwds.gov.zm/wp-content/uploads/2024/12/MINISTRY-OF-WATER-DEVELOPMENT-AND-SANTATION-NATIONAL-RAINWATER-HARVESTING-STRATEGY-AND-IMPLEMENTATION-PLAN-2024.pdf'
    }
  };

  Object.keys(waterModel.SOURCES).forEach(function (key) { SOURCES[key] = waterModel.SOURCES[key]; });
  Object.keys(demoModel.SOURCES).forEach(function (key) { SOURCES[key] = demoModel.SOURCES[key]; });

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
    competition: 'Shared-resource competition',
    woody: 'Woody vegetation',
    water: 'Water availability',
    waterQuality: 'Water quality',
    soil: 'Soil condition',
    erosion: 'Erosion pressure',
    rainfall: 'Rainfall / seasonal dryness',
    rainChemistry: 'Rain chemistry',
    health: 'Animal condition support',
    usableWater: 'Usable water access',
    aquaticHealth: 'Aquatic habitat support'
  };

  // Every simple path is eligible. Cycle exclusion below makes this finite;
  // a fixed short cutoff would omit valid downstream responses.
  MAX_PATH_DEPTH = Object.keys(COMPONENTS).length - 1;

  /*
   * An edge direction describes the effect of an increase in `from` on `to`.
   * Conditional edges carry a set of possibilities until a scenario condition
   * resolves them. Decision rules never convert that set into a claimed fact.
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
      from: 'forage', to: 'competition', direction: 'down', directOrIndirect: 'indirect',
      mechanism: 'A forage deficit increases overlap and pressure on the remaining shared feeding resource.',
      conditions: 'The model activates the adverse branch when the 30-day forage balance fails; a buffer shorter than 60 days remains neutral rather than being called low competition.',
      source: SOURCES.AFRICAN_HERBIVORE_PARTITION
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
      conditions: 'Requires a shared water point and disturbance reaching the water; the scenario can specify the bank condition.',
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
      conditions: 'The explicit rainfall amount and season set a recharge or drawdown outlook; current access can still override immediate availability.',
      source: SOURCES.SASSCAL
    },
    {
      from: 'rainfall', to: 'erosion', direction: 'conditional', directOrIndirect: 'indirect',
      mechanism: 'Rainfall creates runoff energy that can increase erosion where protective cover or banks are vulnerable.',
      conditions: 'The model activates this pathway only when rainfall is high and the ground screen is exposed; rainfall alone does not assert high erosion.',
      source: SOURCES.NRCS_GROUND_COVER
    },
    {
      from: 'rainChemistry', to: 'forage', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Rain chemistry within the reference state avoids the deposition stress applied to grass regrowth in the acidic rain setting.',
      conditions: 'The model treats pH 4.2 as an acidic-deposition stress and pH 5.6 as typical rain; local buffering and exposure duration remain uncalibrated.',
      source: SOURCES.EPA_ACID_RAIN
    },
    {
      from: 'rainChemistry', to: 'waterQuality', direction: 'up', directOrIndirect: 'indirect',
      mechanism: 'Rain chemistry can transmit an acidity concern to connected surface water.',
      conditions: 'This is a screening pathway, not a prediction of receiving-water pH; catchment buffering is not estimated.',
      source: SOURCES.EPA_ACID_RAIN
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

  EDGES = EDGES.concat([
    { from: 'waterQuality', to: 'aquaticHealth', direction: 'up', directOrIndirect: 'indirect', mechanism: 'Water conditions support aquatic organisms; oxygen and pH stress can reduce that support.', conditions: 'Aquatic screening only. No fish abundance or species-specific tolerance is estimated.', source: SOURCES.WATER_OXYGEN },
    { from: 'water', to: 'aquaticHealth', direction: 'up', directOrIndirect: 'indirect', mechanism: 'Persistent water supports the aquatic habitat represented by the screened water point.', conditions: 'This resolves habitat availability only; it does not estimate water volume, aquatic abundance or species-specific tolerance.', source: SOURCES.SASSCAL },
    { from: 'waterQuality', to: 'usableWater', direction: 'conditional', directOrIndirect: 'indirect', mechanism: 'Suspected contamination or a suspected bloom can make reliance on a water point inappropriate until assessed.', conditions: 'Precautionary access rule, supported by animal bloom guidance. Activated only by an explicit contamination or bloom flag. Low oxygen alone does not establish toxicity to drinking mammals.', source: SOURCES.WATER_BLOOM },
    { from: 'water', to: 'usableWater', direction: 'up', directOrIndirect: 'direct', mechanism: 'Available water supports access to drinking water.', conditions: 'Water quality and physical access can still restrict its use.', source: SOURCES.AFRICAN_HERBIVORE_PARTITION },
    { from: 'usableWater', to: 'health', direction: 'up', directOrIndirect: 'indirect', mechanism: 'Access to suitable drinking water supports animal condition.', conditions: 'Condition support only; population numbers are held at the entered values.', source: SOURCES.AFRICAN_HERBIVORE_PARTITION },
    { from: 'usableWater', to: 'competition', direction: 'down', directOrIndirect: 'indirect', mechanism: 'Fewer usable water points can concentrate animals and pressure on nearby resources.', conditions: 'Assumes the herd shares the affected water point and lacks equivalent alternatives.', source: SOURCES.WATER_GRAZING },
    { from: 'competition', to: 'soil', direction: 'conditional', directOrIndirect: 'indirect', mechanism: 'Concentration around shared resources can increase trampling on vulnerable ground.', conditions: 'Ground cover and actual animal concentration determine whether this pathway applies.', source: SOURCES.WATER_GRAZING },
    { from: 'forage', to: 'health', direction: 'up', directOrIndirect: 'indirect', mechanism: 'Available forage supports body condition.', conditions: 'No intake, weight change, reproduction or mortality is calculated.', source: SOURCES.AFRICAN_HERBIVORE_PARTITION },
    { from: 'competition', to: 'health', direction: 'down', directOrIndirect: 'indirect', mechanism: 'Competition can limit an individual animal’s access to shared resources.', conditions: 'Diet overlap, access and supplementation can buffer this pathway.', source: SOURCES.AFRICAN_HERBIVORE_PARTITION }
  ]);

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
    ],
    'rainfall>erosion': [
      {
        when: 'high rainfall reaches exposed ground or a vulnerable bank',
        direction: 'up',
        because: 'Runoff energy acts on the exposed surface and raises erosion pressure.',
        source: SOURCES.NRCS_GROUND_COVER
      },
      {
        when: 'protective cover intercepts rainfall and the bank remains stable',
        direction: 'none',
        because: 'Rainfall alone does not establish an erosion increase where the entered cover screen remains protective.',
        source: SOURCES.NRCS_GROUND_COVER
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

  function uniqueSigns(signs) {
    return [-1, 0, 1].filter(function (sign) { return signs.indexOf(sign) !== -1; });
  }

  // Signed interval addition: without measured strengths opposing influences
  // permit either direction or balance. Route count is never a voting weight.
  function combineSigns(sets) {
    if (!sets.length) return [0];
    var positive = sets.some(function (set) { return set.indexOf(1) !== -1; });
    var negative = sets.some(function (set) { return set.indexOf(-1) !== -1; });
    if (positive && negative) return [-1, 0, 1];
    var definite = sets.some(function (set) { return set.length === 1 && set[0] !== 0; });
    if (positive) return definite ? [1] : [0, 1];
    if (negative) return definite ? [-1] : [-1, 0];
    return [0];
  }

  function boundedStatus(signs) {
    if (signs.length === 1) return signs[0] === 0 ? 'unchanged' : signLabel(signs[0]);
    return signs.indexOf(1) !== -1 && signs.indexOf(-1) !== -1 ? 'uncertain' : 'conditional';
  }

  function conditionFor(edge, context, water, deterministic) {
    var key = edge.from + '>' + edge.to;
    if (key === 'zebra>soil') {
      if (context.soil === 'exposed') return { signs: [-1], note: 'Scenario assumes exposed ground and trampling pressure.' };
      if (context.soil === 'nutrientReturn') return { signs: [1], note: 'Scenario assumes retained cover and beneficial nutrient return.' };
      if (context.soil === 'stable') return { signs: [0], note: 'The model assumes moderate protective cover, so this direct soil pathway is held stable.' };
      return { signs: [-1, 1], note: 'Soil cover and nutrient response have not been specified; both mechanisms remain possible.' };
    }
    if (key === 'zebra>waterQuality') {
      if (context.bank === 'disturbed') return { signs: [-1], note: 'Scenario assumes a shared, disturbed bank connected to the water.' };
      if (context.bank === 'protected') return { signs: [0], note: 'Scenario assumes protected banks; this disturbance pathway is inactive.' };
      if (context.bank === 'managed') return { signs: [0], note: 'The model assumes moderate bank disturbance without activating a direct water-quality decline.' };
      return { signs: [-1, 0], note: 'Bank connection is unmeasured: disturbance may transfer to water or may have no effect.' };
    }
    if (key === 'woody>forage') {
      if (context.woody === 'dense') return { signs: [-1], note: 'Scenario assumes dense woody cover competing with grass.' };
      if (context.woody === 'open') return { signs: [1], note: 'Scenario assumes open woody cover supporting grass through shelter.' };
      if (context.woody === 'balanced') return { signs: [0], note: 'The model assumes mixed woody cover with no net grass effect.' };
      return { signs: [-1, 1], note: 'Woody structure is unmeasured: competition and shelter remain possible.' };
    }
    if (key === 'rainfall>erosion') {
      if (context.soil === 'exposed') return { signs: [1], note: 'Exposed ground allows high rainfall to raise runoff and erosion pressure.' };
      if (context.soil === 'stable' || context.soil === 'nutrientReturn') return { signs: [0], note: 'The entered protective-cover state blocks a rainfall-only erosion increase.' };
      return { signs: [0, 1], note: 'Rainfall raises erosion only if ground cover or banks are vulnerable.' };
    }
    if (key === 'waterQuality>usableWater') {
      return water.drinkingConcern
        ? { signs: deterministic ? [1] : [0, 1], note: 'Suspected contamination or bloom: the model restricts use of the water point pending verification.' }
        : { signs: [0], note: 'No contamination or bloom flag was entered. Aquatic oxygen screening alone is not propagated as mammal drinking-water harm.' };
    }
    if (key === 'competition>soil') {
      if (context.soil === 'exposed') return { signs: [-1], note: 'Exposed ground is vulnerable to concentrated trampling.' };
      if (context.soil === 'nutrientReturn') return { signs: [0], note: 'Cover is assumed retained; no additional trampling effect is asserted.' };
      if (context.soil === 'stable') return { signs: [0], note: 'Moderate ground cover holds this crowding-to-soil pathway stable in the model.' };
      return { signs: [-1, 0], note: 'Local concentration and ground vulnerability are unmeasured; trampling pressure is a possibility.' };
    }
    return { signs: [edge.direction === 'up' ? 1 : -1], note: '' };
  }

  /*
   * Scenario populations are interventions: once a user sets a population, the
   * same calculation must not feed a resource response back into that population
   * and then count the return path as a second prediction. All population inputs
   * are therefore held fixed for this comparative scenario. Paths may continue
   * through derived variables, but may not revisit a node or enter a fixed input.
   */
  function deriveEffects(speciesChanges, driver, context, water, demo) {
    var results = {};
    var queue = [];
    var season = SEASONS[driver] || SEASONS.none;
    var noHerd = speciesChanges.every(function (change) { return change.to === 0; });
    var fixedInputs = {};
    SPECIES.forEach(function (species) { fixedInputs[species.key] = true; });
    if (!demo && water.availability !== 'unmeasured') fixedInputs.water = true;

    function resultFor(key) {
      if (!results[key]) results[key] = { key: key, label: COMPONENTS[key] || key, signs: [], paths: [], seedSets: [], seedReasons: [] };
      return results[key];
    }
    function seed(node, sign, reason, register) {
      var signs = Array.isArray(sign) ? sign : [sign];
      if (register) {
        resultFor(node).seedSets.push(signs);
        resultFor(node).seedReasons.push(reason);
      }
      if (signs.every(function (value) { return value === 0; })) return;
      queue.push({ node: node, signs: signs, path: [], nodes: [node], depth: 0, assumptions: reason ? [reason] : [] });
    }

    speciesChanges.forEach(function (change) {
      seed(change.key, signFor(change.delta), '', false);
    });

    if (demo) {
      ['rainfall', 'rainChemistry', 'forage', 'woody', 'soil', 'waterQuality', 'water'].forEach(function (key) {
        var item = demo.components[key];
        seed(key, item.sign, item.label + '. ' + item.basis, key !== 'rainfall' && key !== 'rainChemistry');
      });
    } else {
      season.seeds.forEach(function (seed) {
        // Hot-dry water is already reached from rainfall. Do not count the same
        // seasonal pressure a second time as an independent cause.
        if (seed.node === 'water') return;
        queue.push({ node: seed.node, signs: [seed.sign], path: [], nodes: [seed.node], depth: 0, assumptions: [season.label + ' is an entered scenario assumption.'] });
      });
      if (water.qualitySign) seed('waterQuality', water.qualitySigns, water.summary + ' ' + water.basis, true);
      if (water.availability === 'limited' || water.availability === 'dry') {
        seed('water', -1, water.availability === 'dry' ? 'The selected water point is dry.' : 'Water access is limited in the entered scenario.', true);
      }
      if (water.availability === 'adequate') seed('water', 0, 'Water availability is held at the level you entered; the season does not re-estimate it.', true);
    }

    var edgeStates = {};
    while (queue.length) {
      var item = queue.shift();
      if (item.depth >= MAX_PATH_DEPTH) continue;
      var outgoing = EDGES.filter(function (edge) { return edge.from === item.node; });
      outgoing.forEach(function (edge) {
        if (fixedInputs[edge.to]) return;
        if (noHerd && edge.to === 'health') return;
        if (noHerd && edge.from === 'usableWater' && edge.to === 'competition') return;
        if (item.nodes.indexOf(edge.to) !== -1) return;
        var newPath = item.path.concat([edge]);
        var newNodes = item.nodes.concat([edge.to]);
        var condition = conditionFor(edge, context, water, !!demo);
        var nextSigns = uniqueSigns(item.signs.reduce(function (all, incoming) {
          return all.concat(condition.signs.map(function (sign) { return incoming * sign; }));
        }, []));
        var assumptions = item.assumptions.concat(condition.note ? [condition.note] : []);
        var key = edge.to;
        // Record a resolved inactive edge for inspection, but do not invent an
        // active downstream response when the condition blocks transmission.
        var active = nextSigns.some(function (sign) { return sign !== 0; });
        if (active) resultFor(key).paths.push({ edges: newPath, possibleSigns: nextSigns, assumptions: assumptions, status: boundedStatus(nextSigns) });

        var edgeKey = edge.from + '>' + edge.to;
        if (!edgeStates[edgeKey]) edgeStates[edgeKey] = { sets: [], conditional: false };
        edgeStates[edgeKey].sets.push(nextSigns);
        edgeStates[edgeKey].conditional = edgeStates[edgeKey].conditional || nextSigns.length > 1;

        if (active) {
          queue.push({ node: key, signs: nextSigns, path: newPath, nodes: newNodes, depth: item.depth + 1, assumptions: assumptions });
        }
      });
    }

    Object.keys(edgeStates).forEach(function (key) {
      edgeStates[key].signs = combineSigns(edgeStates[key].sets);
      edgeStates[key].status = boundedStatus(edgeStates[key].signs);
    });

    Object.keys(COMPONENTS).forEach(function (key) { if (!fixedInputs[key] && key !== 'rainfall' && key !== 'rainChemistry') resultFor(key); });

    return {
      effects: Object.keys(results).map(function (key) {
        var item = results[key];
        item.possibleSigns = combineSigns(item.seedSets.concat(item.paths.map(function (path) { return path.possibleSigns; })));
        item.signs = item.possibleSigns.filter(function (sign) { return sign !== 0; });
        item.status = boundedStatus(item.possibleSigns);
        item.conditional = item.possibleSigns.length > 1;
        item.direct = item.seedSets.length > 0 || item.paths.some(function (path) { return path.edges.length === 1; });
        item.indirect = item.paths.some(function (path) { return path.edges.length > 1; });
        item.hasConditionalInfluence = item.paths.some(function (path) { return path.possibleSigns.length > 1; });
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
        trigger: 'Shared-resource competition ' + (competition.status === 'uncertain' ? 'has competing influences' : competition.status),
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

  var CONTEXT_OPTIONS = {
    soil: ['unmeasured', 'exposed', 'stable', 'nutrientReturn'],
    bank: ['unmeasured', 'disturbed', 'managed', 'protected'],
    woody: ['unmeasured', 'dense', 'balanced', 'open']
  };

  var RESPONSE_ACTIONS = {
    forage: { adverse: -1, action: 'Protect forage and check regrowth against grazing demand.', reading: 'Repeat grass cover and height at the same marked points; compare with use and supplementation.' },
    competition: { adverse: 1, action: 'Avoid adding resource pressure; check shared feeding and watering access.', reading: 'Record crowding, displacement, diet overlap and access to alternative resources.' },
    woody: { adverse: 1, action: 'Check browse use and woody cover before changing vegetation management.', reading: 'Compare woody cover, browse availability and grass beneath open and dense canopy.' },
    water: { adverse: -1, action: 'Verify reliable water access and prepare an alternative supply.', reading: 'Record level, flow, persistence and access at each water point.' },
    waterQuality: { adverse: -1, action: 'Sample the water and inspect connected runoff and bank disturbance.', reading: 'Measure pH, dissolved oxygen and turbidity; request targeted contaminants where indicated.' },
    soil: { adverse: -1, action: 'Protect exposed ground and check trampling pressure.', reading: 'Compare ground cover, compaction, dung distribution and erosion signs.' },
    erosion: { adverse: 1, action: 'Protect disturbed banks and inspect runoff after rain.', reading: 'Repeat fixed photographs of bare ground, rills, gullies and sediment deposits.' },
    health: { adverse: -1, action: 'Check animal condition and secure forage and suitable drinking water.', reading: 'Repeat body-condition observations and record actual access to forage and water.' },
    usableWater: { adverse: -1, action: 'Arrange verified alternative water while checking suitability and access.', reading: 'Confirm contamination or bloom concerns with appropriate laboratory tests; inspect access.' },
    aquaticHealth: { adverse: -1, action: 'Investigate aquatic stress and check oxygen at different times of day.', reading: 'Repeat pH and oxygen with temperature and time; inspect aquatic organisms and pollution sources.' }
  };

  function decisionForEffect(effect) {
    var policy = RESPONSE_ACTIONS[effect.key];
    var signs = effect.possibleSigns;
    var adverse = signs.indexOf(policy.adverse) !== -1;
    var open = signs.length > 1;
    var active = signs.some(function (sign) { return sign !== 0; });
    var response = open ? (adverse ? (policy.adverse < 0 ? 'Protect against decline' : 'Manage increase risk') : 'Monitor possible improvement') :
      signs[0] < 0 ? 'Decrease supported' : signs[0] > 0 ? 'Increase supported' : 'Maintain and monitor';
    if (effect.key === 'woody') response = open ? 'Check vegetation balance' : active ? (signs[0] < 0 ? 'Decrease supported' : 'Increase supported') : 'Maintain and monitor';
    return {
      response: response,
      action: active ? (adverse || effect.key === 'woody' ? policy.action : 'Track the supported response and retain the current safeguards.') : 'Maintain monitoring; no active scenario driver changes this component.',
      basis: open ? 'Precautionary response' : active ? 'Directional agreement' : 'Reference comparison',
      explanation: open ? 'The allowed pathways include ' + signs.map(function (sign) { return sign < 0 ? 'a decrease' : sign > 0 ? 'an increase' : 'no net change'; }).join(', ') + '. The action protects against the adverse possibility; it does not assert that this outcome will occur.' : active ? 'Active influences agree under the entered conditions. The model does not estimate the size, timing or probability of change.' : 'No active pathway changes this variable relative to the scenario reference. This does not establish a healthy current condition.',
      possibilities: signs.map(function (sign) { return sign < 0 ? 'Decrease' : sign > 0 ? 'Increase' : 'No net change'; }),
      adversePossible: adverse,
      nextReading: policy.reading
    };
  }

  function resolveEffectsFromDemo(effects, edgeStates, demo) {
    var originalEdgeStates = {};
    Object.keys(edgeStates).forEach(function (key) { originalEdgeStates[key] = edgeStates[key]; });
    var influenceByEdge = {};
    (demo.influences || []).forEach(function (item) { influenceByEdge[item.from + '>' + item.to] = item; });
    var speciesInputs = {};
    SPECIES.forEach(function (species) { speciesInputs[species.key] = true; });

    function edgeIsActive(edge) {
      var key = edge.from + '>' + edge.to;
      if (speciesInputs[edge.from]) {
        var original = originalEdgeStates[key];
        return !!(original && original.signs && original.signs.some(function (sign) { return sign !== 0; }));
      }
      return !!(influenceByEdge[key] && influenceByEdge[key].sign !== 0);
    }

    effects.forEach(function (effect) {
      var resolved = demo.components[effect.key];
      if (!resolved) return;
      var policy = RESPONSE_ACTIONS[effect.key];
      var directPaths = effect.paths.filter(function (path) {
        return path.edges.length === 1 && speciesInputs[path.edges[0].from] && edgeIsActive(path.edges[0]);
      });
      (demo.influences || []).forEach(function (item) {
        if (item.to !== effect.key || item.sign === 0) return;
        var edge = EDGES.filter(function (candidate) { return candidate.from === item.from && candidate.to === item.to; })[0];
        if (!edge) return;
        directPaths.push({ edges: [edge], possibleSigns: [item.sign], assumptions: [item.basis], status: boundedStatus([item.sign]) });
      });
      effect.paths = directPaths;
      effect.possibleSigns = [resolved.sign];
      effect.signs = resolved.sign === 0 ? [] : [resolved.sign];
      effect.status = resolved.sign < 0 ? 'decreases' : resolved.sign > 0 ? 'increases' : 'unchanged';
      effect.conditional = false;
      effect.hasConditionalInfluence = false;
      effect.unknownMagnitude = false;
      effect.direct = effect.seedSets.length > 0 || effect.paths.some(function (path) { return path.edges.length === 1; });
      effect.indirect = effect.paths.some(function (path) { return path.edges.length > 1; });
      effect.demoResolution = resolved;
      effect.decision = {
        response: resolved.label,
        action: resolved.action,
        basis: 'Resolved from the entered measurements',
        explanation: resolved.basis,
        possibilities: [resolved.label],
        adversePossible: resolved.sign === policy.adverse,
        nextReading: policy.reading,
        evidenceIds: resolved.evidenceIds.slice()
      };
    });

    Object.keys(edgeStates).forEach(function (key) { delete edgeStates[key]; });
    EDGES.forEach(function (edge) {
      var key = edge.from + '>' + edge.to;
      if (speciesInputs[edge.from] && originalEdgeStates[key]) {
        var originalSigns = originalEdgeStates[key].signs || [0];
        var resolvedSign = originalSigns.filter(function (sign) { return sign !== 0; })[0] || 0;
        edgeStates[key] = { sets: [[resolvedSign]], signs: [resolvedSign], status: boundedStatus([resolvedSign]), conditional: false };
      }
      if (influenceByEdge[key]) {
        var influenceSign = influenceByEdge[key].sign;
        edgeStates[key] = { sets: [[influenceSign]], signs: [influenceSign], status: boundedStatus([influenceSign]), conditional: false, basis: influenceByEdge[key].basis };
      }
    });
  }

  function scenarioDecision(effects, water, errors, demo) {
    var adverse = effects.filter(function (effect) { return effect.decision.adversePossible; });
    var competing = effects.filter(function (effect) { return effect.possibleSigns.length > 1; });
    var result = { code: 'monitor', priority: 'low', title: 'Maintain safeguards and monitor', action: 'Retain the current safeguards and repeat comparable field measurements.', reasons: [], basis: 'Rule-based management response; not a calibrated ecosystem forecast.' };
    if (errors.length) {
      result.code = 'correct-inputs'; result.priority = 'high'; result.title = 'Correct the scenario inputs';
      result.action = 'Resolve the listed input errors before interpreting or exporting this scenario.';
      result.reasons = errors.slice();
      return result;
    }
    if (water.drinkingConcern || water.availability === 'dry' || water.availability === 'limited') {
      result.code = 'secure-water'; result.priority = 'high'; result.title = 'Secure suitable water before increasing pressure';
      result.action = 'Provide a verified alternative water source and assess the affected water point before relying on it.';
      if (water.availability === 'dry') result.reasons.push('The selected water point is dry, even if seasonal rainfall could improve future supply.');
      if (water.availability === 'limited') result.reasons.push('The water point has limited water; future recharge does not remove the current constraint.');
      if (water.drinkingConcern) result.reasons.push('Contamination or a bloom is suspected in the entered scenario; drinking suitability needs verification.');
    } else if (water.severity >= 3) {
      result.code = 'investigate-aquatic-stress'; result.priority = 'high'; result.title = 'Investigate urgent aquatic stress';
      result.action = 'Confirm oxygen promptly, inspect aquatic life and identify the stressor. Check mammal drinking suitability separately.';
    } else if (water.severity >= 2) {
      result.code = 'investigate-water'; result.priority = 'medium'; result.title = 'Investigate water quality before increasing pressure';
      result.action = 'Repeat the flagged water measurements and investigate the source of stress before adding demand.';
    } else if (demo && (demo.components.forage.sign < 0 || demo.components.health.sign < 0)) {
      result.code = 'hold-expansion'; result.priority = 'high'; result.title = 'Hold expansion and correct the limiting resource';
      result.action = 'Do not add animals until the entered forage and usable-water screens support the herd for the 30-day scenario horizon.';
    } else if (demo && (!water.hasInput || water.gaps.length)) {
      result.code = 'complete-water-screen'; result.priority = 'medium'; result.title = 'Complete the water screen before expansion';
      result.action = 'Keep the entered herd unchanged and collect the missing water readings before using the scenario to support expansion.';
    } else if (adverse.length) {
      result.code = 'manage-pressure'; result.priority = 'medium'; result.title = 'Manage pressure before expanding the herd';
      result.action = 'Protect the affected resources and verify field conditions before adding animals or relaxing safeguards.';
    } else if (demo) {
      result.code = 'maintain-demo-balance'; result.priority = 'low'; result.title = 'Maintain the entered herd and safeguards';
      result.action = 'The entered measurements support the herd for 30 days; repeat the same measurements before any expansion.';
    } else if (!water.hasInput || water.gaps.length || water.provenance !== 'user-entered') {
      result.code = 'complete-baseline'; result.priority = 'medium'; result.title = 'Establish the local baseline before expanding';
      result.action = 'Collect comparable park water and habitat measurements before using this scenario to support herd expansion.';
    }
    water.alerts.forEach(function (alert) { result.reasons.push(alert.text); });
    if (adverse.length) result.reasons.push((demo ? 'Components resolved in an adverse state: ' : 'Components with an adverse possibility: ') + adverse.map(function (effect) { return effect.label; }).join(', ') + '.');
    if (demo) {
      result.reasons.push('Scenario result: ' + demo.components.forage.label + '; ' + demo.components.water.label + '; ' + demo.components.usableWater.label + '; ' + demo.components.competition.label + '; ' + demo.components.soil.label + '.');
      result.reasons.push('Season-rain rule: ' + demo.metrics.seasonLabel + ' with ' + demo.selections.rainAmount.label.toLowerCase() + ' resolves to ' + demo.components.rainfall.label.toLowerCase() + '.');
      result.reasons.push('The result follows the entered measurements and published screening rules, not unmeasured pathway voting.');
    } else if (competing.length) result.reasons.push('Where mechanisms compete or a condition is missing, use the adverse possibility for planning without presenting it as a forecast.');
    if (!water.hasInput) result.reasons.push('No water sample is selected.');
    else if (water.provenance === 'regional') result.reasons.push('The selected sample is historical regional evidence, not a measurement of CBU park water.');
    else if (water.provenance === 'demonstration') result.reasons.push('The selected water values are reference values chosen for this scenario.');
    else result.reasons.push('User-entered water values have not been independently verified.');
    if (!result.reasons.length) result.reasons.push('No modeled adverse direction is active; this is not a carrying-capacity or safety clearance.');
    return result;
  }

  function evaluateScenario(input) {
    input = input || {};
    var registered = input.baselineCounts || registeredCounts();
    var targets = input.targetCounts || registered;
    var area = cleanArea(input.estimatedAreaHa == null ? DEFAULT_AREA_HA : input.estimatedAreaHa);
    var driver = SEASONS[input.environmentalDrivers] ? input.environmentalDrivers : 'none';
    var water = waterModel.assess(input.waterQuality);
    var inputErrors = water.errors.slice();
    var demoRequested = !!(input.demo && typeof input.demo === 'object');
    var conditions = {};
    if (demoRequested) conditions = demoModel.contextFor(input.demo);
    else {
      Object.keys(CONTEXT_OPTIONS).forEach(function (key) {
        var value = input.conditions && input.conditions[key] || 'unmeasured';
        if (CONTEXT_OPTIONS[key].indexOf(value) === -1) { inputErrors.push('Choose a valid ' + key + ' condition.'); value = 'unmeasured'; }
        conditions[key] = value;
      });
    }
    if (input.environmentalDrivers != null && !SEASONS[input.environmentalDrivers]) inputErrors.push('Choose a supported seasonal scenario.');
    if (input.estimatedAreaHa != null && (String(input.estimatedAreaHa).trim() === '' || area == null)) inputErrors.push('Park area must be a positive number.');
    var speciesChanges = SPECIES.map(function (species) {
      [registered[species.key], targets[species.key]].forEach(function (value) {
        if (value === undefined) return;
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 1000000) inputErrors.push(species.label + ' count must be a whole number from 0 to 1,000,000.');
      });
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
    var demo = demoRequested ? demoModel.assess({
      input: input.demo,
      seasonKey: driver,
      areaHa: area,
      counts: speciesChanges.reduce(function (out, item) { out[item.key] = item.to; return out; }, {}),
      water: water
    }) : null;
    if (demo) inputErrors = inputErrors.concat(demo.errors);
    var derived = deriveEffects(speciesChanges, driver, conditions, water, demo);
    var edges = derived.effects;
    if (demo) resolveEffectsFromDemo(edges, derived.edgeStates, demo);
    edges.forEach(function (effect) {
      if (!demo) effect.decision = decisionForEffect(effect);
      if (effect.key === 'health' && totalTo === 0) {
        effect.decision.response = 'No herd in this scenario';
        effect.decision.action = 'Retain habitat monitoring; no animal-condition response is assessed for an empty herd.';
        effect.decision.basis = 'No animals entered';
        effect.decision.explanation = 'All scenario counts are zero. Resource responses remain available, but no change in animal condition is inferred.';
        effect.decision.possibilities = ['Not applicable'];
      }
    });
    var decision = scenarioDecision(edges, water, inputErrors, demo);
    var pathways = [];
    edges.forEach(function (effect) {
      effect.paths.forEach(function (path) {
        pathways.push({
          target: effect.label,
          targetKey: effect.key,
          status: path.status,
          possibleSigns: path.possibleSigns,
          depth: path.edges.length,
          text: pathText(path),
          edgeKeys: path.edges.map(function (edge) { return edge.from + '>' + edge.to; }),
          mechanism: path.edges[path.edges.length - 1].mechanism,
          conditions: uniqueList(path.assumptions.concat(path.edges.map(function (edge) { return edge.conditions; }))).join(' '),
          source: path.edges[path.edges.length - 1].source,
          directOrIndirect: path.edges.length === 1 ? 'direct' : 'indirect'
        });
      });
    });

    var unknowns = demo ? [
      'Every habitat, rainfall and water value here is a potential park measurement chosen for this scenario. Each one is stated explicitly so the model resolves, but none of them is a current survey of the park.',
      'The forage screen uses a 30-day horizon, representative species body masses, dry-matter demand at 2% of body mass per day, and a conservative 25% allowable-use share.',
      'Season and rainfall are evaluated together: low and high rainfall set the extremes, while the selected season resolves the moderate-rainfall recharge or drawdown outlook.',
      'The entered whole-park boundary is multiplied by the selected usable-habitat percentage; neither value replaces a surveyed grazing polygon.',
      'Forage days are a management screen, not a calibrated carrying capacity, population forecast or proof of diet quality.',
      'Acidic rainfall is a stress scenario based on pH 4.2; local soil buffering, exposure duration and plant sensitivity are not estimated.',
      'Population inputs stay fixed for the comparison; the model resolves resource condition and management response without predicting births, deaths or migration.',
      'Water availability reports a 30-day direction, not volume. An available point can therefore remain usable now while carrying a declining dry-season outlook.',
      'Water pH and oxygen screens concern aquatic conditions. A single sample does not certify mammal drinking-water safety.'
    ] : [
      'Grass biomass and water demand are not converted into an invented percentage because the park has no validated intake, forage, water-volume, or boundary measurements.',
      'The 6.6 ha figure is an estimated whole-park area supplied for this prototype, not a surveyed polygon.',
      'A pathway direction does not establish that the outcome will occur at a particular magnitude or date.',
      'Population inputs are held at the scenario values for this comparison; feedback relationships are not iterated as a time-series forecast.',
      'Actions use a precautionary rule when directions compete. No invented weights, probabilities, carrying capacity or toxicity thresholds are used.',
      'Water pH and oxygen screens concern aquatic conditions. A single sample is not a measured trend and does not certify mammal drinking-water safety.',
      'Published Kafue samples are historical regional analogues; the scenario samples are invented. Neither is a current measurement of the park.'
    ];
    if (driver !== 'none') unknowns.push('The season is a scenario driver you selected; it is not read from the current date or from a live SASSCAL forecast in this version.');

    /* Built from the same pathways the page lists, so a fork shown in the panel
       and the same fork named in the brief are one computation, not two. */
    var statusOf = function (key) {
      var effect = edges.filter(function (item) { return item.key === key; })[0];
      return effect ? effect.status : 'unchanged';
    };
    // v4 exposes bounded possibilities and a concrete action on every effect.
    // The older fork prose cannot describe propagated conditional sign sets.
    var hypotheticals = [];
    var recommendations = managementRecommendations(changedKeys, driver, edges, pathways, area, hypotheticals);
    recommendations.unshift({ id: 'scenario-decision', priority: decision.priority, trigger: decision.title, action: decision.action, rationale: decision.reasons.join(' '), evidenceIds: [] });
    if (water.hasInput) recommendations.splice(1, 0, { id: 'water-screen', priority: water.severity >= 3 ? 'high' : 'medium', trigger: water.label, action: water.summary, rationale: water.basis + ' ' + water.gaps.join(' '), evidenceIds: [SOURCES.WATER_PH.id, SOURCES.WATER_OXYGEN.id] });

    return {
      modelVersion: MODEL_VERSION,
      estimatedAreaHa: area,
      areaLabel: area == null ? 'Area not available' : 'Estimated whole-park area',
      driver: driver,
      driverLabel: SEASONS[driver].label,
      conditions: conditions,
      demo: demo,
      waterQuality: water,
      decision: decision,
      inputErrors: inputErrors,
      speciesChanges: speciesChanges,
      totals: {
        from: totalFrom,
        to: totalTo,
        delta: totalTo - totalFrom,
        percent: percentChange(totalFrom, totalTo),
        densityFrom: area == null ? null : totalFrom / area,
        densityTo: area == null ? null : totalTo / area,
        densityPerUsableHa: demo ? demo.metrics.densityPerUsableHa : null
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
    DEMO: demoModel,
    registeredCounts: registeredCounts,
    baselineContext: baselineContext,
    latestApprovedObservationCounts: latestApprovedObservationCounts,
    evaluateScenario: evaluateScenario,
    hypotheticalFor: hypotheticalFor,
    CONDITION_BRANCHES: CONDITION_BRANCHES,
    SETTLES: SETTLES
  };
}));
