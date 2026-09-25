/* Deterministic teaching assumptions for the Ecosystem Scenario demo.
 *
 * Values in this module are visible scenario assumptions, not measurements of
 * the CBU park. They turn a deliberately qualitative network into a complete
 * demonstration by resolving each component from explicit inputs and a small
 * set of published screening rules.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BioEcosystemDemo = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var VERSION = 'demo-assumptions-v2';
  var HORIZON_DAYS = 30;
  var DRY_MATTER_RATE = 0.02;
  var ALLOWABLE_USE = 0.25;

  var SOURCES = {
    FAO_FEED_ASSESSMENT: {
      id: 'fao-feed-assessment', tier: 'C', label: 'Calculation method',
      title: 'FAO: Conducting national feed assessments',
      url: 'https://www.fao.org/4/i3043e/i3043e.pdf'
    },
    FAO_SAVANNA_BIOMASS: {
      id: 'fao-savanna-biomass', tier: 'C', label: 'African savanna analogue',
      title: 'FAO: Fodder resources and management in African savannas',
      url: 'https://www.fao.org/4/x5539e/x5539e05.htm'
    },
    FAO_SOIL_PROTECTION: {
      id: 'fao-dry-season-biomass', tier: 'C', label: 'Southern African management reference',
      title: 'FAO: Dry-season feeding in Central and Southern Africa',
      url: 'https://www.fao.org/4/AC152E/AC152E01.htm'
    },
    NRCS_GROUND_COVER: {
      id: 'nrcs-ground-cover-erosion', tier: 'C', label: 'Rangeland screening reference',
      title: 'USDA NRCS Rangeland Processes Handbook: Hydrology and Soil Erosion',
      url: 'https://directives.nrcs.usda.gov/sites/default/files2/1712930328/33930.pdf'
    },
    EPA_ACID_RAIN: {
      id: 'epa-acid-rain-effects', tier: 'C', label: 'Rain chemistry reference',
      title: 'US EPA: Effects of Acid Rain',
      url: 'https://www.epa.gov/acidrain/effects-acid-rain'
    },
    USGS_RAIN_PH: {
      id: 'usgs-rain-ph', tier: 'C', label: 'Rain chemistry reference',
      title: 'USGS: pH and Water',
      url: 'https://www.usgs.gov/water-science-school/science/ph-and-water'
    },
    ZEBRA_BODY_MASS: {
      id: 'zebra-body-mass', tier: 'C', label: 'Species parameter reference',
      title: 'Frontiers: Testing Equid Body Mass Estimate Equations on Modern Zebras',
      url: 'https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2021.622412/full'
    },
    PUKU_BODY_MASS: {
      id: 'puku-body-mass', tier: 'C', label: 'Zambian species parameter reference',
      title: 'Mammalian Species: Kobus vardonii',
      url: 'https://academic.oup.com/mspecies/article/52/994/86/6035131'
    },
    IMPALA_BODY_MASS: {
      id: 'impala-body-mass', tier: 'C', label: 'Species parameter reference',
      title: 'Journal of the Science of Food and Agriculture: Impala live weight',
      url: 'https://pubmed.ncbi.nlm.nih.gov/29345781/'
    },
    AFRICAN_UNGULATE_WATER: {
      id: 'african-ungulate-water', tier: 'C', label: 'African ungulate reference',
      title: 'Ecological Monographs: Quantifying water requirements of African ungulates',
      url: 'https://doi.org/10.1002/ecm.1404'
    }
  };

  var SPECIES_MASS_KG = {
    zebra: { value: 280, basis: 'Published mean for Equus quagga.' },
    waterbuck: { value: 211, basis: 'Representative adult screening mass; sex, age and condition vary.' },
    puku: { value: 68, basis: 'Rounded mixed-sex value within published Zambian means.' },
    impala: { value: 44.3, basis: 'Published mixed-sex mean live weight.' }
  };

  var FIELDS = [
    {
      key: 'usableHabitat', label: 'Usable Habitat Inside Boundary',
      note: 'Share of the entered park area available to this herd.',
      options: [
        { id: 'restricted', label: 'Restricted · 40%', value: 40 },
        { id: 'partial', label: 'Partial · 70%', value: 70 },
        { id: 'full', label: 'Full Area · 100%', value: 100 }
      ]
    },
    {
      key: 'grassBiomass', label: 'Standing Grass Biomass',
      note: 'Dry matter measured before applying the conservative allowable-use share.',
      options: [
        { id: 'low', label: 'Low · 300 kg DM/ha', value: 300 },
        { id: 'moderate', label: 'Moderate · 1,000 kg DM/ha', value: 1000 },
        { id: 'high', label: 'High · 2,500 kg DM/ha', value: 2500 }
      ]
    },
    {
      key: 'groundCover', label: 'Protective Ground Cover',
      note: 'Living vegetation, litter and other cover protecting the soil surface.',
      options: [
        { id: 'low', label: 'Exposed · 30%', value: 30 },
        { id: 'moderate', label: 'Mixed · 60%', value: 60 },
        { id: 'high', label: 'Protective · 80%', value: 80 }
      ]
    },
    {
      key: 'woodyCover', label: 'Woody Canopy Cover',
      note: 'Canopy structure used to resolve shelter, browse and grass competition.',
      options: [
        { id: 'open', label: 'Open · 20%', value: 20 },
        { id: 'mixed', label: 'Mixed · 40%', value: 40 },
        { id: 'dense', label: 'Dense · 70%', value: 70 }
      ]
    },
    {
      key: 'bankDisturbance', label: 'Water-Point Bank Disturbance',
      note: 'Observed share of the accessible bank showing disturbance.',
      options: [
        { id: 'low', label: 'Low · 10%', value: 10 },
        { id: 'moderate', label: 'Moderate · 40%', value: 40 },
        { id: 'high', label: 'High · 70%', value: 70 }
      ]
    },
    {
      key: 'rainAmount', label: 'Seasonal Rainfall Total',
      note: 'Generalized scenario amount; it is not a live weather reading.',
      options: [
        { id: 'low', label: 'Low · 300 mm', value: 300 },
        { id: 'moderate', label: 'Moderate · 500 mm', value: 500 },
        { id: 'high', label: 'High · 700 mm', value: 700 }
      ]
    },
    {
      key: 'rainChemistry', label: 'Rain Chemistry',
      note: 'Acidic deposition blocks a simple “more rain means more growth” conclusion.',
      options: [
        { id: 'acidic', label: 'Acidic Deposition · pH 4.2', value: 4.2 },
        { id: 'typical', label: 'Typical Rain · pH 5.6', value: 5.6 }
      ]
    }
  ];

  var DEFAULTS = {
    usableHabitat: 'full',
    grassBiomass: 'moderate',
    groundCover: 'moderate',
    woodyCover: 'mixed',
    bankDisturbance: 'moderate',
    rainAmount: 'moderate',
    rainChemistry: 'typical'
  };

  var SEASONS = {
    none: { key: 'none', label: 'No seasonal adjustment', short: 'no seasonal modifier' },
    rainy: { key: 'rainy', label: 'Rainy season (Nov to Apr)', short: 'rainy season' },
    coolDry: { key: 'coolDry', label: 'Cool dry season (May to Aug)', short: 'cool dry season' },
    hotDry: { key: 'hotDry', label: 'Hot dry season (Sep to Oct/Nov)', short: 'hot dry season' }
  };

  function copyDefaults() {
    var result = {};
    Object.keys(DEFAULTS).forEach(function (key) { result[key] = DEFAULTS[key]; });
    return result;
  }

  function fieldByKey(key) {
    return FIELDS.filter(function (field) { return field.key === key; })[0] || null;
  }

  function optionFor(key, id) {
    var field = fieldByKey(key);
    if (!field) return null;
    return field.options.filter(function (option) { return option.id === id; })[0] || null;
  }

  function normalize(input) {
    var values = {};
    var errors = [];
    input = input || {};
    FIELDS.forEach(function (field) {
      var id = input[field.key] || DEFAULTS[field.key];
      var option = optionFor(field.key, id);
      if (!option) {
        errors.push('Choose a valid ' + field.label.toLowerCase() + ' value.');
        option = optionFor(field.key, DEFAULTS[field.key]);
      }
      values[field.key] = { id: option.id, label: option.label, value: option.value };
    });
    return { values: values, errors: errors };
  }

  function rounded(value, places) {
    var scale = Math.pow(10, places == null ? 1 : places);
    return Math.round(value * scale) / scale;
  }

  /* Rain amount sets the two extremes. At the moderate preset, season supplies
     the missing direction: recharge in the rainy season and drawdown in either
     dry season. This keeps an unusual high-rain dry-season scenario possible
     without pretending that season overrides an explicit rainfall amount. */
  function hydroStateFor(rainId, seasonKey) {
    if (rainId === 'low') return -1;
    if (rainId === 'high') return 1;
    if (seasonKey === 'rainy') return 1;
    if (seasonKey === 'coolDry' || seasonKey === 'hotDry') return -1;
    return 0;
  }

  function regrowthStateFor(rainId, seasonKey, acidicRain, woodyId) {
    if (acidicRain) return -1;
    var state = hydroStateFor(rainId, seasonKey);
    if (woodyId === 'dense') state = Math.max(-1, state - 1);
    if (woodyId === 'open') state = Math.min(1, state + 1);
    return state;
  }

  function influence(from, to, sign, basis) {
    return { from: from, to: to, sign: sign, basis: basis };
  }

  function contextFor(input) {
    var normalized = normalize(input).values;
    return {
      soil: normalized.groundCover.value < 50 ? 'exposed' : (normalized.groundCover.value >= 75 ? 'nutrientReturn' : 'stable'),
      bank: normalized.bankDisturbance.value >= 60 ? 'disturbed' : (normalized.bankDisturbance.value <= 20 ? 'protected' : 'managed'),
      woody: normalized.woodyCover.value >= 60 ? 'dense' : (normalized.woodyCover.value <= 30 ? 'open' : 'balanced')
    };
  }

  function component(key, sign, label, basis, action, evidenceIds) {
    return { key: key, sign: sign, label: label, basis: basis, action: action, evidenceIds: evidenceIds || [] };
  }

  function assess(options) {
    options = options || {};
    var normalized = normalize(options.input);
    var selected = normalized.values;
    var season = SEASONS[options.seasonKey] || SEASONS.none;
    var areaHa = Number(options.areaHa);
    var counts = options.counts || {};
    var water = options.water || {};
    var errors = normalized.errors.slice();
    if (!isFinite(areaHa) || areaHa <= 0) errors.push('A positive park area is required for the forage balance.');

    var usableHabitatHa = isFinite(areaHa) && areaHa > 0 ? areaHa * selected.usableHabitat.value / 100 : 0;
    var standingForageKg = usableHabitatHa * selected.grassBiomass.value;
    var availableForageKg = standingForageKg * ALLOWABLE_USE;
    var dailyDemandKg = 0;
    Object.keys(SPECIES_MASS_KG).forEach(function (key) {
      dailyDemandKg += Math.max(0, Number(counts[key]) || 0) * SPECIES_MASS_KG[key].value * DRY_MATTER_RATE;
    });
    var horizonDemandKg = dailyDemandKg * HORIZON_DAYS;
    var forageDays = dailyDemandKg > 0 ? availableForageKg / dailyDemandKg : null;
    var acidicRain = selected.rainChemistry.value <= 4.4;
    var lowRain = selected.rainAmount.id === 'low';
    var highRain = selected.rainAmount.id === 'high';
    var hydroState = hydroStateFor(selected.rainAmount.id, season.key);
    var regrowthState = regrowthStateFor(selected.rainAmount.id, season.key, acidicRain, selected.woodyCover.id);
    var herdPresent = dailyDemandKg > 0;
    var forageDeficit = herdPresent && forageDays < HORIZON_DAYS;
    var observedWaterRestricted = water.availability === 'dry' || water.availability === 'limited';
    var inferredWaterRestricted = water.availability === 'unmeasured';
    var waterRestricted = observedWaterRestricted || inferredWaterRestricted || !!water.drinkingConcern;
    var waterScreenIncomplete = !water.hasInput || !!(water.gaps && water.gaps.length);

    var resourceConcentration = herdPresent && (forageDeficit || waterRestricted);
    var soilSign = selected.groundCover.value < 50 ? -1 :
      selected.groundCover.value >= 75 && !resourceConcentration ? 1 :
        selected.groundCover.value < 75 && resourceConcentration ? -1 : 0;
    var erosionHigh = soilSign < 0 || selected.bankDisturbance.id === 'high';
    var erosionLow = soilSign > 0 && selected.bankDisturbance.id === 'low';
    var runoffConnected = erosionHigh && (season.key === 'rainy' || highRain);
    var waterQualityAdverse = Number(water.severity || 0) > 0 || acidicRain || selected.bankDisturbance.id === 'high' || runoffConnected;

    var waterSign = observedWaterRestricted ? -1 : hydroState;
    var usableWaterSign = waterRestricted || waterSign < 0 ? -1 : (waterSign > 0 ? 1 : 0);
    var forageSign = !herdPresent ? 0 : forageDeficit || acidicRain ? -1 : regrowthState < 0 ? 0 : 1;
    var competitionHigh = herdPresent && (forageDeficit || waterRestricted);
    var competitionElevated = herdPresent && !competitionHigh && (waterSign < 0 || forageSign === 0);
    var competitionLow = herdPresent && !competitionHigh && !competitionElevated && forageDays >= HORIZON_DAYS * 2 && usableWaterSign >= 0;
    var competitionSign = competitionHigh || competitionElevated ? 1 : competitionLow ? -1 : 0;
    var healthSign = !herdPresent ? 0 : forageDeficit || waterRestricted ? -1 : competitionElevated || forageSign === 0 ? 0 : 1;

    var rainfallLabel = hydroState < 0
      ? (season.key === 'rainy' ? 'Rainy-season shortfall' : season.key === 'hotDry' ? 'Hot-dry drawdown' : season.key === 'coolDry' ? 'Cool-dry drawdown' : 'Low rainfall input')
      : hydroState > 0
        ? ((season.key === 'coolDry' || season.key === 'hotDry') ? 'Unseasonal recharge' : season.key === 'rainy' ? 'Rainy-season recharge' : 'High rainfall input')
        : 'Moderate rainfall balance';
    var rainfallAction = hydroState < 0
      ? 'Conserve water and soil moisture; do not rely on recharge or grass regrowth.'
      : hydroState > 0
        ? 'Retain ground cover and inspect recharge, runoff and water clarity after rain.'
        : 'Maintain cover and verify that rainfall reaches the soil and water point.';
    var forageLabel = !herdPresent ? 'No herd demand' : forageDeficit ? '30-day forage deficit' : acidicRain ? 'Current forage; acidic regrowth stress' : regrowthState < 0 ? '30-day buffer; regrowth constrained' : regrowthState > 0 ? '30-day buffer with regrowth support' : '30-day forage buffer';
    var drawdownLabel = season.key === 'hotDry' ? 'hot-dry drawdown' : season.key === 'coolDry' ? 'cool-dry drawdown' : season.key === 'rainy' ? 'rainy-season shortfall' : 'declining outlook';
    var waterLabel = water.availability === 'dry' ? 'Water point dry' : water.availability === 'limited' ? 'Water access limited' : hydroState < 0 ? (water.availability === 'adequate' ? 'Available now; ' + drawdownLabel : 'Water supply declining') : hydroState > 0 ? (water.availability === 'adequate' ? 'Available with recharge' : 'Water recharge supported') : water.availability === 'adequate' ? 'Water available' : 'Moderate supply outlook';

    var components = {};
    components.rainfall = component(
      'rainfall', hydroState,
      rainfallLabel,
      selected.rainAmount.label + ' combined with ' + season.label + '.',
      rainfallAction,
      ['zambia-season-calendar', SOURCES.FAO_SOIL_PROTECTION.id]
    );
    components.rainChemistry = component(
      'rainChemistry', acidicRain ? -1 : 0,
      acidicRain ? 'Acidic deposition stress' : 'Typical rain chemistry',
      selected.rainChemistry.label + '. Chemistry is evaluated separately from rainfall quantity.',
      acidicRain ? 'Investigate deposition sources and protect soil and water while confirming local rain chemistry.' : 'Retain the reference chemistry assumption until local rain is sampled.',
      [SOURCES.USGS_RAIN_PH.id, SOURCES.EPA_ACID_RAIN.id]
    );
    components.forage = component(
      'forage', forageSign,
      forageLabel,
      rounded(availableForageKg, 1) + ' kg DM available at 25% allowable use versus ' + rounded(horizonDemandKg, 1) + ' kg DM demand for ' + HORIZON_DAYS + ' days' + (forageDays == null ? '.' : ' (' + rounded(forageDays, 1) + ' days screened).') + ' Regrowth outlook: ' + (regrowthState < 0 ? 'constrained' : regrowthState > 0 ? 'supported' : 'neutral') + ' from season, rain chemistry and woody cover.',
      !herdPresent ? 'Maintain the habitat measurement.' : forageDeficit ? 'Do not add animals; reduce pressure or provide verified supplemental forage.' : acidicRain ? 'Protect the current forage and verify regrowth after the acidic-rain scenario.' : regrowthState < 0 ? 'Hold the entered herd and remeasure standing biomass because the model gives no regrowth credit.' : 'Maintain the entered herd while repeating biomass measurements before expansion.',
      [SOURCES.FAO_FEED_ASSESSMENT.id, SOURCES.FAO_SAVANNA_BIOMASS.id, SOURCES.FAO_SOIL_PROTECTION.id]
    );
    components.woody = component(
      'woody', selected.woodyCover.id === 'dense' ? 1 : selected.woodyCover.id === 'open' ? -1 : 0,
      selected.woodyCover.id === 'dense' ? 'Dense woody cover' : selected.woodyCover.id === 'open' ? 'Open woody cover' : 'Mixed woody cover',
      selected.woodyCover.label + ' resolves the grass-woody pathway for this demo.',
      selected.woodyCover.id === 'dense' ? 'Check grass beneath canopy and manage encroachment only after confirming species and regeneration.' : 'Retain a mixed shelter-and-forage structure and monitor change.',
      [SOURCES.FAO_SAVANNA_BIOMASS.id]
    );
    components.soil = component(
      'soil', soilSign,
      soilSign < 0 ? (selected.groundCover.value < 50 ? 'Exposed soil' : 'Cover under resource pressure') : soilSign > 0 ? 'Protective cover' : 'Moderate cover',
      selected.groundCover.label + '; the forage and usable-water screens ' + (resourceConcentration ? 'indicate concentration pressure.' : 'do not add concentration pressure.'),
      soilSign < 0 ? 'Protect exposed ground and reduce concentration on vulnerable patches.' : 'Retain cover and repeat fixed-point cover estimates.',
      [SOURCES.NRCS_GROUND_COVER.id]
    );
    components.erosion = component(
      'erosion', erosionHigh ? 1 : erosionLow ? -1 : 0,
      erosionHigh ? 'High erosion pressure' : erosionLow ? 'Low erosion pressure' : 'Moderate erosion pressure',
      selected.groundCover.label + ', ' + selected.bankDisturbance.label + ', ' + rainfallLabel + '.',
      erosionHigh ? 'Protect exposed ground and disturbed banks before the next runoff event.' : 'Maintain cover and inspect fixed points after heavy rain.',
      [SOURCES.NRCS_GROUND_COVER.id]
    );
    components.water = component(
      'water', waterSign,
      waterLabel,
      (water.availability === 'unmeasured' ? 'No access observation was entered.' : 'Entered water access: ' + (water.availabilityLabel || water.availability) + '.') + ' The ' + season.short + ' and ' + selected.rainAmount.label.toLowerCase() + ' set the 30-day recharge or drawdown outlook.',
      observedWaterRestricted ? 'Secure an alternative water source before adding pressure.' : waterSign < 0 ? 'Keep the current source under level and persistence checks and prepare an alternative before access declines.' : 'Maintain access and record persistence through the scenario period.',
      [SOURCES.AFRICAN_UNGULATE_WATER.id]
    );
    components.waterQuality = component(
      'waterQuality', waterQualityAdverse ? -1 : 0,
      waterQualityAdverse ? 'Water-quality stress' : waterScreenIncomplete ? 'Water screen incomplete' : 'Reference screen met',
      (water.summary || 'Water screen complete.') + (acidicRain ? ' Acidic rainfall adds a connected chemistry concern.' : '') + (selected.bankDisturbance.id === 'high' ? ' High bank disturbance adds sediment and runoff pressure.' : '') + (runoffConnected ? ' Erosion pressure is connected to a rainy or high-rainfall runoff scenario.' : ''),
      waterQualityAdverse ? 'Repeat the flagged measurements and inspect runoff, banks and likely pollution sources.' : waterScreenIncomplete ? 'Complete the missing water screen before using this scenario to support expansion.' : 'Maintain comparable sampling at the same marked water point.',
      [SOURCES.EPA_ACID_RAIN.id, SOURCES.NRCS_GROUND_COVER.id]
    );
    components.usableWater = component(
      'usableWater', usableWaterSign,
      water.availability === 'dry' ? 'No usable water at this point' : waterRestricted ? 'Usable water restricted' : waterSign < 0 ? 'Usable now; drawdown risk' : 'Usable water available',
      water.drinkingConcern ? 'An explicit contamination or bloom concern restricts reliance on this water point.' : observedWaterRestricted ? 'The entered access condition restricts supply.' : inferredWaterRestricted ? 'No water-access observation was entered, so the model does not treat inferred recharge as verified usable water.' : waterSign < 0 ? 'The point is available now, but the season-rain combination indicates declining supply.' : 'Water access is available and no mammal drinking concern is flagged.',
      waterRestricted ? 'Provide verified alternative water and investigate the affected point.' : waterSign < 0 ? 'Track level and access frequently and prepare a verified fallback source.' : 'Maintain access and continue the water-quality screen.',
      [SOURCES.AFRICAN_UNGULATE_WATER.id]
    );
    components.competition = component(
      'competition', competitionSign,
      !herdPresent ? 'No herd competition' : competitionHigh ? 'High resource competition' : competitionElevated ? (season.key === 'hotDry' ? 'Elevated hot-dry competition' : 'Elevated seasonal competition') : competitionLow ? 'Low resource competition' : 'Moderate resource competition',
      !herdPresent ? 'No animals are entered.' : competitionHigh ? 'The herd exceeds the 30-day forage screen or usable water is restricted.' : competitionElevated ? 'Current forage passes 30 days, but regrowth or water supply is declining.' : competitionLow ? 'The forage screen exceeds 60 days and water is usable.' : 'The herd passes the 30-day screen without a 60-day buffer.',
      competitionHigh ? 'Hold or reduce animal pressure and separate access to constrained resources.' : competitionElevated ? 'Keep animal numbers unchanged and monitor concentration at forage and water points.' : 'Maintain distribution across available forage and water.',
      [SOURCES.FAO_FEED_ASSESSMENT.id]
    );
    components.health = component(
      'health', healthSign,
      !herdPresent ? 'No herd in scenario' : healthSign < 0 ? 'Animal condition at risk' : healthSign === 0 ? (season.key === 'hotDry' ? 'Condition support under hot-dry pressure' : 'Condition support under pressure') : 'Animal condition supported',
      !herdPresent ? 'No animal condition is inferred without animals.' : forageDeficit && waterRestricted ? 'Both the forage balance and usable-water screen fail.' : forageDeficit ? 'The 30-day forage balance is in deficit.' : waterRestricted ? 'Usable water is restricted.' : healthSign === 0 ? 'The 30-day forage balance passes, but seasonal regrowth or water persistence is declining.' : 'The 30-day forage screen passes and usable water remains available.',
      !herdPresent ? 'Retain habitat monitoring.' : healthSign < 0 ? 'Check body condition now and correct forage or water access before adding animals.' : healthSign === 0 ? 'Keep the herd unchanged and repeat body-condition, forage and water-level checks.' : 'Maintain the entered herd and repeat body-condition observations.',
      [SOURCES.FAO_FEED_ASSESSMENT.id, SOURCES.AFRICAN_UNGULATE_WATER.id]
    );
    var aquaticAdverse = waterQualityAdverse || observedWaterRestricted;
    components.aquaticHealth = component(
      'aquaticHealth', aquaticAdverse ? -1 : waterSign > 0 && !waterScreenIncomplete ? 1 : 0,
      aquaticAdverse ? 'Aquatic habitat stressed' : waterScreenIncomplete ? 'Aquatic screen incomplete' : waterSign > 0 ? 'Aquatic habitat supported by recharge' : waterSign < 0 ? 'Aquatic support under drawdown pressure' : 'Aquatic screen supported',
      aquaticAdverse ? 'Water quality is adverse or the entered water access is restricted.' : waterScreenIncomplete ? 'No adverse trigger is entered, but one or more aquatic screening readings are missing.' : 'No adverse aquatic screening trigger is active; the water-quantity outlook is ' + (waterSign > 0 ? 'recharging.' : waterSign < 0 ? 'declining.' : 'stable.'),
      aquaticAdverse ? 'Investigate aquatic stress and repeat oxygen, pH and turbidity at comparable times.' : waterScreenIncomplete ? 'Complete the aquatic screen at comparable times.' : 'Maintain comparable aquatic observations.',
      [SOURCES.EPA_ACID_RAIN.id]
    );

    var influences = [
      influence('rainfall', 'forage', hydroState, rainfallLabel + ' supplies the rainfall-and-season contribution to regrowth; chemistry and woody cover are evaluated on their own paths.'),
      influence('rainfall', 'water', hydroState, rainfallLabel + ' sets recharge or drawdown.'),
      influence('rainfall', 'erosion', highRain && soilSign < 0 ? 1 : 0, 'High rainfall increases runoff pressure only where the ground screen is already exposed or under resource pressure.'),
      influence('rainChemistry', 'forage', acidicRain ? -1 : 0, 'Acidic deposition constrains regrowth; typical rain chemistry adds no stress.'),
      influence('rainChemistry', 'waterQuality', acidicRain ? -1 : 0, 'Acidic deposition adds a connected surface-water chemistry concern.'),
      influence('woody', 'forage', selected.woodyCover.id === 'dense' ? -1 : selected.woodyCover.id === 'open' ? 1 : 0, 'Dense canopy competes with grass; open cover supplies the shelter-side branch.'),
      influence('forage', 'soil', forageSign, 'Forage and cover protect the soil; a deficit removes that support.'),
      influence('forage', 'competition', forageDeficit ? 1 : competitionLow ? -1 : 0, 'A 30-day forage deficit raises competition; only a buffer above 60 days lowers it in this demo.'),
      influence('soil', 'erosion', soilSign < 0 ? 1 : soilSign > 0 ? -1 : 0, 'Poor soil cover raises erosion pressure; protective cover lowers it.'),
      influence('erosion', 'waterQuality', runoffConnected ? -1 : erosionLow ? 1 : 0, 'Erosion reaches water quality only in the entered rainy or high-rainfall runoff case.'),
      influence('waterQuality', 'aquaticHealth', waterQualityAdverse ? -1 : 0, 'The aquatic screen follows the resolved water-quality state.'),
      influence('water', 'aquaticHealth', observedWaterRestricted ? -1 : waterSign, 'The aquatic habitat follows the entered water restriction or the resolved recharge-drawdown direction.'),
      influence('waterQuality', 'usableWater', water.drinkingConcern ? -1 : 0, 'Only an explicit contamination or bloom concern restricts mammal use through this pathway.'),
      influence('water', 'usableWater', observedWaterRestricted || inferredWaterRestricted ? -1 : waterSign, 'The water-quantity and verified-access outlook passes into usable-water access; contamination is evaluated on the separate water-quality path.'),
      influence('usableWater', 'health', usableWaterSign, 'Usable water supports animal condition; restriction removes that support.'),
      influence('usableWater', 'competition', usableWaterSign < 0 ? 1 : usableWaterSign > 0 ? -1 : 0, 'Restricted water concentrates animals; improving access releases that pressure.'),
      influence('competition', 'soil', competitionSign > 0 && selected.groundCover.value < 50 ? -1 : 0, 'Elevated competition affects soil only where the entered ground-cover screen is exposed.'),
      influence('forage', 'health', forageSign, 'The resolved forage balance passes into animal-condition support.'),
      influence('competition', 'health', competitionSign > 0 ? -1 : competitionSign < 0 ? 1 : 0, 'Higher resource competition reduces condition support.' )
    ];

    return {
      version: VERSION,
      input: Object.keys(selected).reduce(function (out, key) { out[key] = selected[key].id; return out; }, {}),
      selections: selected,
      errors: errors,
      assumptions: {
        horizonDays: HORIZON_DAYS,
        dryMatterRate: DRY_MATTER_RATE,
        allowableUse: ALLOWABLE_USE,
        seasonRule: 'Rainfall amount controls low and high extremes; season resolves the direction of the moderate-rainfall preset.',
        bodyMassKg: Object.keys(SPECIES_MASS_KG).reduce(function (out, key) { out[key] = SPECIES_MASS_KG[key].value; return out; }, {})
      },
      metrics: {
        parkAreaHa: rounded(areaHa || 0, 2),
        usableHabitatPercent: selected.usableHabitat.value,
        usableHabitatHa: rounded(usableHabitatHa, 2),
        grassBiomassKgHa: selected.grassBiomass.value,
        standingForageKg: rounded(standingForageKg, 1),
        availableForageKg: rounded(availableForageKg, 1),
        dailyDemandKg: rounded(dailyDemandKg, 1),
        horizonDemandKg: rounded(horizonDemandKg, 1),
        forageDays: forageDays == null ? null : rounded(forageDays, 1),
        densityPerUsableHa: usableHabitatHa > 0 ? rounded(Object.keys(counts).reduce(function (sum, key) { return sum + (Number(counts[key]) || 0); }, 0) / usableHabitatHa, 2) : null,
        seasonKey: season.key,
        seasonLabel: season.label,
        rainMm: selected.rainAmount.value,
        rainPh: selected.rainChemistry.value,
        hydroState: hydroState,
        waterOutlook: waterLabel,
        regrowthState: regrowthState,
        regrowthOutlook: regrowthState < 0 ? 'Constrained' : regrowthState > 0 ? 'Supported' : 'Neutral',
        groundCoverPercent: selected.groundCover.value,
        woodyCoverPercent: selected.woodyCover.value,
        bankDisturbancePercent: selected.bankDisturbance.value
      },
      context: contextFor(options.input),
      components: components,
      influences: influences
    };
  }

  return {
    VERSION: VERSION,
    HORIZON_DAYS: HORIZON_DAYS,
    DRY_MATTER_RATE: DRY_MATTER_RATE,
    ALLOWABLE_USE: ALLOWABLE_USE,
    SOURCES: SOURCES,
    SPECIES_MASS_KG: SPECIES_MASS_KG,
    SEASONS: SEASONS,
    FIELDS: FIELDS,
    DEFAULTS: DEFAULTS,
    defaultInput: copyDefaults,
    normalize: normalize,
    contextFor: contextFor,
    assess: assess
  };
}));
