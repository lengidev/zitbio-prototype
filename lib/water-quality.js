/* Water screening for scenario exploration. These are aquatic screening
 * references, not Zambia compliance limits or wildlife drinking-water limits.
 * A missing reading stays missing; a passing screen never certifies safety. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.BioWaterQuality = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SOURCES = {
    WATER_PH: { id: 'epa-aquatic-ph', tier: 'C', label: 'Aquatic screening reference', title: 'US EPA CADDIS: pH', url: 'https://www.epa.gov/caddis/ph' },
    WATER_OXYGEN: { id: 'epa-aquatic-oxygen', tier: 'C', label: 'Aquatic screening reference', title: 'US EPA: Indicators — Dissolved Oxygen', url: 'https://www.epa.gov/national-aquatic-resource-surveys/indicators-dissolved-oxygen' },
    WATER_COPPER: { id: 'epa-copper-bioavailability', tier: 'C', label: 'Chemistry limitation', title: 'US EPA: Copper bioavailability and water chemistry', url: 'https://www.epa.gov/wqc/supplementary-training-materials-aquatic-life-criteria-copper-background' },
    WATER_BLOOM: { id: 'cdc-bloom-animals', tier: 'C', label: 'Animal precaution reference', title: 'CDC: Preventing pet and livestock illnesses caused by harmful algal blooms', url: 'https://www.cdc.gov/harmful-algal-blooms/prevention/preventing-pet-and-livestock-illnesses.html' },
    WATER_SEDIMENT: { id: 'usgs-turbidity', tier: 'C', label: 'Water measurement reference', title: 'USGS: Turbidity and Water', url: 'https://www.usgs.gov/water-science-school/science/turbidity-and-water' },
    KAFUE_SAMPLES: { id: 'unza-kafue-454-2018', tier: 'B', label: 'Historical regional samples', title: 'UNZA repository: Appendix 9, Sampling Point 454 (Kafue River Water), July 2018', url: 'https://dspace.unza.zm/bitstream/handle/123456789/8063/Main%20document.pdf?sequence=1' }
  };

  var FIELDS = [
    { key: 'ph', label: 'pH', unit: 'pH units', min: 0, max: 14, step: '0.1' },
    { key: 'oxygen', label: 'Dissolved oxygen', unit: 'mg/L', min: 0, max: 30, step: '0.1' },
    { key: 'turbidity', label: 'Turbidity', unit: 'NTU', min: 0, max: 100000, step: '0.1' },
    { key: 'referenceTurbidity', label: 'Comparable reference turbidity', unit: 'NTU', min: 0, max: 100000, step: '0.1' },
    { key: 'copper', label: 'Dissolved copper', unit: 'mg/L', min: 0, max: 10000, step: '0.001' },
    { key: 'tss', label: 'Total suspended solids', unit: 'mg/L', min: 0, max: 1000000, step: '0.1' }
  ];

  var SAMPLES = [
    { id: 'none', label: 'No water sample', provenance: 'none', values: {} },
    { id: 'demo-reference', label: 'Demo · within pH / oxygen screens', provenance: 'demonstration', values: { ph: 7.2, oxygen: 7, turbidity: 4, referenceTurbidity: 4 }, note: 'Invented teaching values; not a field sample or proof of safe drinking water.' },
    { id: 'demo-oxygen', label: 'Demo · low oxygen and cloudy water', provenance: 'demonstration', values: { ph: 7.2, oxygen: 2, turbidity: 40, referenceTurbidity: 4 }, note: 'Invented teaching values. Low oxygen affects aquatic organisms; it does not establish toxicity to mammals.' },
    { id: 'demo-contamination', label: 'Demo · suspected contamination', provenance: 'demonstration', values: { ph: 5.5, oxygen: 4, turbidity: 30, referenceTurbidity: 4, contamination: 'suspected' }, note: 'Invented contamination scenario. The contamination flag is an explicit assumption, not inferred from pH alone.' },
    { id: 'kafue-2018-07-31', label: 'Kafue · 31 Jul 2018 · published', provenance: 'regional', sampledAt: '2018-07-31', site: 'Kafue River, sampling point 454', source: SOURCES.KAFUE_SAMPLES, values: { ph: 8.3, copper: 0.01, tss: 7 }, note: 'Historical regional analogue, not CBU park water. Appendix 9 reports pH 8.30, dissolved Cu 0.01 mg/L and TSS 7 mg/L. Oxygen and turbidity were not reported in this row; TSS is not NTU.' },
    { id: 'kafue-2018-07-24', label: 'Kafue · 24 Jul 2018 · published', provenance: 'regional', sampledAt: '2018-07-24', site: 'Kafue River, sampling point 454', source: SOURCES.KAFUE_SAMPLES, values: { ph: 6.8, copper: 0.02, tss: 19 }, note: 'Historical regional analogue, not CBU park water. Appendix 9 reports pH 6.80, dissolved Cu 0.02 mg/L and TSS 19 mg/L. Missing parameters are left blank.' },
    { id: 'custom', label: 'Custom scenario / enter sample values', provenance: 'user-entered', values: {}, note: 'User-entered scenario values. Record the site and sample date if transcribing measurements; this does not verify the sample.' }
  ];

  function sampleById(id) {
    return SAMPLES.filter(function (sample) { return sample.id === id; })[0] || SAMPLES[0];
  }

  function sampleInput(id) {
    var sample = sampleById(id);
    var input = { sampleId: sample.id, site: sample.site || '', sampledAt: sample.sampledAt || '', contamination: 'unmeasured', bloom: 'unmeasured', availability: 'unmeasured' };
    FIELDS.forEach(function (field) { input[field.key] = sample.values[field.key] == null ? '' : sample.values[field.key]; });
    Object.keys(sample.values).forEach(function (key) { input[key] = sample.values[key]; });
    return input;
  }

  function assess(input) {
    input = input || {};
    var sample = sampleById(input.sampleId);
    var errors = [];
    var readings = [];
    var values = {};
    var missing = [];
    var alerts = [];
    var gaps = [];
    var severity = 0;
    FIELDS.forEach(function (field) {
      var raw = input[field.key];
      if (raw == null || String(raw).trim() === '') { values[field.key] = null; missing.push(field.label); return; }
      var value = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : NaN;
      if (!isFinite(value) || value < field.min || value > field.max) {
        errors.push(field.label + ' must be between ' + field.min + ' and ' + field.max + ' ' + field.unit + '.');
        values[field.key] = null;
        missing.push(field.label);
        return;
      }
      values[field.key] = value;
      readings.push({ key: field.key, label: field.label, value: value, unit: field.unit });
    });
    function choice(key, allowed) {
      var value = input[key] || 'unmeasured';
      if (allowed.indexOf(value) === -1) { errors.push('Choose a valid ' + key + ' condition.'); return 'unmeasured'; }
      return value;
    }
    var contamination = choice('contamination', ['unmeasured', 'notObserved', 'suspected']);
    var bloom = choice('bloom', ['unmeasured', 'notObserved', 'suspected']);
    var availability = choice('availability', ['unmeasured', 'adequate', 'limited', 'dry']);
    var drinkingConcern = contamination === 'suspected' || bloom === 'suspected';
    function alert(level, text, source) {
      severity = Math.max(severity, level);
      alerts.push({ severity: level, text: text, source: source || null });
    }
    if (values.ph != null && (values.ph < 6.5 || values.ph > 9)) alert(2, 'pH is outside the 6.5–9 freshwater aquatic screening range. Verify the reading and investigate the source.', SOURCES.WATER_PH);
    if (values.oxygen != null && values.oxygen < 5) alert(values.oxygen < 3 ? 3 : 2, values.oxygen < 3 ? 'Dissolved oxygen is below 3 mg/L: urgent aquatic stress screening trigger.' : 'Dissolved oxygen is below 5 mg/L: aquatic stress screening trigger.', SOURCES.WATER_OXYGEN);
    if (values.turbidity != null && values.referenceTurbidity != null && values.turbidity > values.referenceTurbidity) alert(1, 'Turbidity exceeds the entered reference. Check comparability, measurement variability and sediment sources; no universal NTU toxicity limit is assumed.', SOURCES.WATER_SEDIMENT);
    if (values.turbidity != null && values.referenceTurbidity == null) gaps.push('Turbidity needs a comparable site, season and method reference before interpreting a change.');
    if (values.copper != null) gaps.push('Copper needs dissolved organic carbon, hardness and other chemistry to assess bioavailability; this model does not assign a toxicity threshold.');
    if (values.tss != null) gaps.push('TSS is recorded in mg/L and is not converted into turbidity (NTU).');
    if (contamination === 'suspected') alert(3, 'Suspected contamination: provide an alternative verified water source and investigate before relying on this water point.');
    if (bloom === 'suspected') alert(3, 'Suspected bloom: verify species and toxins and provide alternative water pending assessment. Green appearance alone does not confirm toxins.', SOURCES.WATER_BLOOM);
    if (values.ph == null || values.oxygen == null) gaps.push('The pH / oxygen screen is incomplete. Missing readings do not count as passing results.');
    if (contamination === 'unmeasured' || bloom === 'unmeasured') gaps.push('Contamination and bloom observations have not both been supplied.');
    var hasInput = readings.length > 0 || contamination !== 'unmeasured' || bloom !== 'unmeasured' || availability !== 'unmeasured';
    // Published provenance survives only while the quoted measurements and flags
    // are untouched. A caller cannot give edited values a published sample ID.
    var altered = sample.provenance === 'regional' && (FIELDS.some(function (field) {
      return values[field.key] !== (sample.values[field.key] == null ? null : sample.values[field.key]);
    }) || contamination !== 'unmeasured' || bloom !== 'unmeasured' || availability !== 'unmeasured' ||
      String(input.site || '') !== sample.site || String(input.sampledAt || '') !== sample.sampledAt);
    var provenance = altered ? 'user-entered' : (sample.id === 'none' && hasInput ? 'user-entered' : sample.provenance);
    var label = errors.length ? 'Correct water inputs' : severity >= 3 ? 'Act on water risk' : severity >= 1 ? 'Investigate water stress' : hasInput ? 'Complete water verification' : 'Collect a water sample';
    var summary = severity ? alerts.map(function (item) { return item.text; }).join(' ') : hasInput ? 'No adverse pH / oxygen trigger was found in the supplied values. This limited screen does not establish drinking-water safety or a complete ecological assessment.' : 'No water measurement is selected. Establish a local baseline before using water quality to justify a management change.';
    if (errors.length) summary = errors.join(' ');
    return {
      sampleId: altered ? 'custom' : sample.id, label: label, provenance: provenance,
      sampleLabel: altered ? 'Edited regional sample — custom scenario' : sample.label,
      site: String(input.site || '').trim(), sampledAt: String(input.sampledAt || '').trim(),
      source: altered ? null : sample.source || null, note: altered ? 'Values were changed from the published row and are now scenario assumptions.' : sample.note || '',
      values: values, readings: readings, missing: missing, errors: errors, alerts: alerts, gaps: gaps,
      severity: severity, summary: summary, hasInput: hasInput, drinkingConcern: drinkingConcern,
      contamination: contamination, bloom: bloom, availability: availability,
      qualitySign: severity > 0 ? -1 : 0,
      qualitySigns: alerts.some(function (item) { return item.source === SOURCES.WATER_PH || item.source === SOURCES.WATER_OXYGEN; }) ? [-1] : severity > 0 ? [-1, 0] : [0],
      basis: 'Water readings screen the scenario against reference conditions; a single sample is not a measured trend. Aquatic screens are not wildlife drinking-water standards.'
    };
  }

  return { SOURCES: SOURCES, FIELDS: FIELDS, SAMPLES: SAMPLES, sampleInput: sampleInput, assess: assess };
}));
