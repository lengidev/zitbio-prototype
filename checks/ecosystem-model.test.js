'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../lib/ecosystem-model');
const water = require('../lib/water-quality');
const demo = require('../lib/ecosystem-demo');
const brief = require('../pages/admin/state/scenario-brief');
const baseline = model.registeredCounts();
const effect = (result, key) => result.effects.find(item => item.key === key);
const evaluate = input => model.evaluateScenario(input);

test('reference state gives an action for all ten components without inventing change', () => {
  const result = evaluate({});
  assert.equal(result.decision.code, 'complete-baseline');
  assert.equal(result.effects.length, 10);
  assert.equal(result.pathways.length, 0);
  for (const item of result.effects) {
    assert.deepEqual(item.possibleSigns, [0]);
    assert.ok(item.decision.action);
  }
});

test('opposing inputs retain alternatives and a concrete precaution, with no path voting', () => {
  const result = evaluate({ targetCounts: { zebra: 6 }, environmentalDrivers: 'rainy' });
  const forage = effect(result, 'forage');
  assert.deepEqual(forage.possibleSigns, [-1, 0, 1]);
  assert.equal(forage.decision.response, 'Protect against decline');
  assert.equal(result.decision.code, 'manage-pressure');
  assert.match(forage.decision.explanation, /does not assert/);
  const mixedHerd = evaluate({ targetCounts: { zebra: 4, impala: 7 } });
  assert.equal(mixedHerd.totals.delta, 0);
  assert.equal(effect(mixedHerd, 'forage').status, 'uncertain');
});

test('explicit ground conditions narrow possibilities and conditional effects propagate', () => {
  const open = evaluate({ targetCounts: { zebra: 6 } });
  const specified = evaluate({ targetCounts: { zebra: 6 }, conditions: { soil: 'exposed', bank: 'disturbed', woody: 'dense' } });
  assert.deepEqual(effect(open, 'soil').possibleSigns, [-1, 0, 1]);
  assert.deepEqual(effect(specified, 'soil').possibleSigns, [-1]);
  assert.deepEqual(effect(specified, 'erosion').possibleSigns, [1]);
  assert.deepEqual(effect(specified, 'waterQuality').possibleSigns, [-1]);
  assert.deepEqual(effect(specified, 'aquaticHealth').possibleSigns, [-1]);
  assert.ok(open.pathways.some(path => path.edgeKeys.includes('zebra>soil') && path.targetKey === 'aquaticHealth'));
  const protectedBank = evaluate({ targetCounts: { zebra: 6 }, conditions: { bank: 'protected' } });
  assert.equal(protectedBank.edgeStates['zebra>waterQuality'].status, 'unchanged');
  assert.ok(!protectedBank.pathways.some(path => path.edgeKeys.includes('zebra>waterQuality')));
});

test('water-only low oxygen screens aquatic support, not mammal drinking toxicity', () => {
  const result = evaluate({ waterQuality: water.sampleInput('demo-oxygen') });
  assert.equal(result.decision.code, 'investigate-aquatic-stress');
  assert.deepEqual(effect(result, 'aquaticHealth').possibleSigns, [-1]);
  assert.deepEqual(effect(result, 'health').possibleSigns, [0]);
  assert.deepEqual(effect(result, 'usableWater').possibleSigns, [0]);
  assert.deepEqual(result.speciesChanges.map(item => item.to), Object.values(baseline));
});

test('suspected contamination reaches access, condition, competition, soil and erosion', () => {
  for (const flag of ['contamination', 'bloom']) {
    const result = evaluate({ waterQuality: { [flag]: 'suspected' } });
    assert.equal(result.decision.code, 'secure-water');
    assert.equal(result.decision.priority, 'high');
    for (const key of ['usableWater', 'health', 'soil']) assert.deepEqual(effect(result, key).possibleSigns, [-1, 0]);
    assert.deepEqual(effect(result, 'competition').possibleSigns, [0, 1]);
    assert.deepEqual(effect(result, 'erosion').possibleSigns, [0, 1]);
    assert.deepEqual(effect(result, 'woody').possibleSigns, [0]);
  }
});

test('season cannot override explicit water access and favourable conditions cannot cancel urgent precautions', () => {
  const dry = evaluate({ environmentalDrivers: 'rainy', waterQuality: { availability: 'dry' } });
  assert.equal(dry.decision.code, 'secure-water');
  assert.deepEqual(effect(dry, 'water').possibleSigns, [-1]);
  assert.deepEqual(effect(dry, 'usableWater').possibleSigns, [-1]);
  const reference = evaluate({ environmentalDrivers: 'hotDry', waterQuality: { availability: 'adequate' } });
  assert.deepEqual(effect(reference, 'water').possibleSigns, [0]);
  assert.equal(reference.edgeStates['rainfall>water'], undefined);
  for (const season of Object.keys(model.SEASONS)) {
    const result = evaluate({ targetCounts: { zebra: 0, waterbuck: 0, puku: 0, impala: 0 }, environmentalDrivers: season, waterQuality: water.sampleInput('demo-contamination') });
    assert.equal(result.decision.code, 'secure-water');
    assert.equal(result.decision.priority, 'high');
    assert.equal(effect(result, 'health').decision.response, 'No herd in this scenario');
  }
});

test('screen boundaries, zero readings, omissions and chemistry limits', () => {
  for (const ph of [6.5, 7, 9]) assert.equal(water.assess({ ph }).severity, 0);
  for (const ph of [0, 6.49, 9.01, 14]) assert.equal(water.assess({ ph }).severity, 2);
  for (const [oxygen, severity] of [[0, 3], [2.99, 3], [3, 2], [4.99, 2], [5, 0], [7, 0]]) assert.equal(water.assess({ oxygen }).severity, severity);
  for (const value of [undefined, null, '', '  ']) {
    const result = water.assess({ oxygen: value, ph: value });
    assert.equal(result.values.oxygen, null);
    assert.equal(result.severity, 0);
    assert.equal(result.hasInput, false);
  }
  const copper = water.assess({ ph: 7, oxygen: 7, copper: 50, tss: 19 });
  assert.equal(copper.severity, 0); // No invented universal copper toxicity cutoff.
  assert.match(copper.gaps.join(' '), /bioavailability/);
  assert.equal(copper.values.turbidity, null);
  assert.equal(water.assess({ turbidity: 8, referenceTurbidity: 4 }).severity, 1);
  assert.equal(water.assess({ turbidity: 8 }).severity, 0);
});

test('an empty reference and scenario herd cannot crowd or trample when water is scarce', () => {
  const empty = { zebra: 0, waterbuck: 0, puku: 0, impala: 0 };
  const result = evaluate({ baselineCounts: empty, targetCounts: empty, waterQuality: { availability: 'dry' } });
  for (const key of ['competition', 'soil', 'erosion', 'health']) assert.deepEqual(effect(result, key).possibleSigns, [0]);
  assert.deepEqual(effect(result, 'water').possibleSigns, [-1]);
});

test('long valid pathways reach their endpoint without repeating a node', () => {
  const result = evaluate({ targetCounts: { impala: 9 }, conditions: { woody: 'dense', soil: 'exposed' }, waterQuality: { contamination: 'suspected' } });
  const route = ['impala>woody', 'woody>forage', 'forage>soil', 'soil>erosion', 'erosion>waterQuality', 'waterQuality>usableWater', 'usableWater>health'];
  assert.ok(result.pathways.some(path => path.edgeKeys.join('|') === route.join('|')));
});

test('published samples preserve units, missing values and provenance', () => {
  const input = water.sampleInput('kafue-2018-07-31');
  const result = water.assess(input);
  assert.equal(result.provenance, 'regional');
  assert.equal(result.values.ph, 8.3);
  assert.equal(result.values.copper, 0.01);
  assert.equal(result.values.tss, 7);
  assert.equal(result.values.oxygen, null);
  assert.equal(result.values.turbidity, null);
  assert.equal(result.sampledAt, '2018-07-31');
  for (const changes of [{ ph: 5 }, { bloom: 'suspected' }, { site: 'CBU park' }, { sampledAt: '2026-09-24' }]) {
    const edited = water.assess({ ...input, ...changes });
    assert.equal(edited.provenance, 'user-entered');
    assert.equal(edited.sampleId, 'custom');
    assert.equal(edited.source, null);
  }
});

test('invalid inputs stop interpretation/export; zero baselines do not invent percentages', () => {
  for (const input of [{ targetCounts: { zebra: -1 } }, { targetCounts: { zebra: '' } }, { targetCounts: { zebra: 1.2 } }, { targetCounts: { zebra: Infinity } }, { targetCounts: { zebra: null } }, { estimatedAreaHa: 0 }, { estimatedAreaHa: '' }, { environmentalDrivers: 'unknown' }, { conditions: { soil: 'unknown' } }, { waterQuality: { ph: -1 } }, { waterQuality: { oxygen: 'abc' } }, { waterQuality: { oxygen: false } }]) {
    const result = evaluate(input);
    assert.equal(result.decision.code, 'correct-inputs', JSON.stringify(input));
    assert.ok(result.inputErrors.length);
    assert.throws(() => brief.buildSnapshot({ result }), /Correct scenario/);
  }
  const result = evaluate({ baselineCounts: { zebra: 0 }, targetCounts: { zebra: 1 } });
  assert.equal(result.speciesChanges[0].percent, null);
  assert.equal(brief.buildSnapshot({ result }).speciesChanges[0].percent, null);
});

test('brief uses the same decisions and water inputs; IDs distinguish water and assumptions', () => {
  const result = evaluate({ waterQuality: water.sampleInput('demo-oxygen'), conditions: { bank: 'protected' } });
  const snapshot = brief.buildSnapshot({ result, defaultAreaHa: model.DEFAULT_AREA_HA });
  assert.deepEqual(snapshot.decision, result.decision);
  assert.deepEqual(snapshot.waterQuality, result.waterQuality);
  const id = brief.scenarioIdFor(result);
  assert.notEqual(id, brief.scenarioIdFor(evaluate({ waterQuality: water.sampleInput('demo-reference') })));
  assert.notEqual(id, brief.scenarioIdFor(evaluate({ waterQuality: water.sampleInput('demo-oxygen') })));
  result.waterQuality.values.oxygen = 9;
  assert.equal(snapshot.waterQuality.values.oxygen, 2);
  const a = evaluate({ conditions: { soil: 'exposed', bank: 'protected' } });
  const b = evaluate({ conditions: { bank: 'protected', soil: 'exposed' } });
  assert.equal(brief.scenarioIdFor(a), brief.scenarioIdFor(b));
});

test('demo defaults produce a measured-state response and an explicit forage balance', () => {
  const result = evaluate({ demo: demo.defaultInput(), waterQuality: water.sampleInput('demo-reference') });
  assert.equal(result.modelVersion, 'cbu-demo-decision-v6');
  assert.equal(result.decision.code, 'maintain-demo-balance');
  assert.equal(result.demo.metrics.usableHabitatHa, 6.6);
  assert.equal(result.demo.metrics.availableForageKg, 1650);
  assert.equal(result.demo.metrics.dailyDemandKg, 43.3);
  assert.equal(result.demo.metrics.horizonDemandKg, 1300.4);
  assert.equal(result.demo.metrics.forageDays, 38.1);
  assert.equal(effect(result, 'forage').decision.response, '30-day forage buffer');
  assert.equal(effect(result, 'health').decision.response, 'Animal condition supported');
  for (const item of result.effects) {
    assert.equal(item.possibleSigns.length, 1);
    assert.ok(!['uncertain', 'conditional'].includes(item.status));
    assert.ok(item.decision.action && item.decision.explanation);
  }
  const snapshot = brief.buildSnapshot({ result, defaultAreaHa: model.DEFAULT_AREA_HA });
  assert.deepEqual(snapshot.demo.metrics, result.demo.metrics);
  assert.notEqual(brief.scenarioIdFor(result), brief.scenarioIdFor(evaluate({ demo: { ...demo.defaultInput(), grassBiomass: 'low' }, waterQuality: water.sampleInput('demo-reference') })));
});

test('demo measurements resolve rainfall, park area, herd demand and usable water without either-or output', () => {
  const acidic = evaluate({
    demo: { ...demo.defaultInput(), rainAmount: 'high', rainChemistry: 'acidic' },
    waterQuality: water.sampleInput('demo-reference')
  });
  assert.equal(acidic.demo.components.rainfall.label, 'High rainfall input');
  assert.equal(acidic.demo.components.rainChemistry.label, 'Acidic deposition stress');
  assert.equal(effect(acidic, 'forage').decision.response, 'Current forage; acidic regrowth stress');
  assert.equal(effect(acidic, 'waterQuality').decision.response, 'Water-quality stress');
  assert.equal(effect(acidic, 'usableWater').decision.response, 'Usable water available');
  assert.equal(acidic.decision.code, 'hold-expansion');

  const crowded = evaluate({
    demo: { ...demo.defaultInput(), usableHabitat: 'restricted', grassBiomass: 'low' },
    targetCounts: { zebra: 10, waterbuck: 10, puku: 20, impala: 30 },
    waterQuality: water.sampleInput('demo-reference')
  });
  assert.equal(effect(crowded, 'forage').decision.response, '30-day forage deficit');
  assert.equal(effect(crowded, 'competition').decision.response, 'High resource competition');
  assert.equal(effect(crowded, 'health').decision.response, 'Animal condition at risk');
  assert.equal(crowded.decision.priority, 'high');

  const contaminated = evaluate({ demo: demo.defaultInput(), waterQuality: water.sampleInput('demo-contamination') });
  assert.equal(effect(contaminated, 'usableWater').possibleSigns.length, 1);
  assert.equal(effect(contaminated, 'usableWater').decision.response, 'Usable water restricted');
  assert.equal(contaminated.decision.code, 'secure-water');
});

test('season and rainfall jointly resolve water, regrowth and resource pressure', () => {
  const referenceWater = water.sampleInput('demo-reference');
  const run = (environmentalDrivers, rainAmount, extraDemo = {}, waterQuality = referenceWater) => evaluate({
    environmentalDrivers,
    demo: { ...demo.defaultInput(), rainAmount, ...extraDemo },
    waterQuality
  });
  const none = run('none', 'moderate');
  const rainy = run('rainy', 'moderate');
  const coolDry = run('coolDry', 'moderate');
  const hotDry = run('hotDry', 'moderate');
  assert.equal(effect(none, 'water').decision.response, 'Water available');
  assert.equal(effect(rainy, 'water').decision.response, 'Available with recharge');
  assert.equal(effect(coolDry, 'water').decision.response, 'Available now; cool-dry drawdown');
  assert.equal(effect(hotDry, 'water').decision.response, 'Available now; hot-dry drawdown');
  assert.equal(effect(rainy, 'forage').decision.response, '30-day buffer with regrowth support');
  assert.equal(effect(hotDry, 'forage').decision.response, '30-day buffer; regrowth constrained');
  assert.equal(effect(hotDry, 'competition').decision.response, 'Elevated hot-dry competition');
  assert.equal(effect(hotDry, 'health').decision.response, 'Condition support under hot-dry pressure');
  assert.equal(rainy.decision.code, 'maintain-demo-balance');
  assert.equal(hotDry.decision.code, 'manage-pressure');

  for (const season of Object.keys(model.SEASONS)) {
    const low = run(season, 'low');
    const high = run(season, 'high');
    assert.ok(effect(low, 'water').possibleSigns[0] < effect(high, 'water').possibleSigns[0]);
  }

  const dryPoint = run('rainy', 'high', {}, { ...referenceWater, availability: 'dry' });
  assert.equal(effect(dryPoint, 'water').decision.response, 'Water point dry');
  assert.equal(effect(dryPoint, 'usableWater').decision.response, 'No usable water at this point');
  assert.equal(dryPoint.decision.code, 'secure-water');

  const noAccessObservation = run('rainy', 'high', {}, water.sampleInput('none'));
  assert.equal(effect(noAccessObservation, 'water').decision.response, 'Water recharge supported');
  assert.equal(effect(noAccessObservation, 'usableWater').decision.response, 'Usable water restricted');
  assert.equal(noAccessObservation.decision.code, 'hold-expansion');
});

test('deterministic pathways preserve quantity, chemistry, cover and runoff logic', () => {
  const referenceWater = water.sampleInput('demo-reference');
  const acidicRecharge = evaluate({
    environmentalDrivers: 'rainy',
    demo: { ...demo.defaultInput(), rainAmount: 'high', rainChemistry: 'acidic' },
    waterQuality: referenceWater
  });
  assert.equal(acidicRecharge.demo.components.rainfall.sign, 1);
  assert.equal(acidicRecharge.demo.components.rainChemistry.sign, -1);
  assert.equal(effect(acidicRecharge, 'water').decision.response, 'Available with recharge');
  assert.equal(effect(acidicRecharge, 'waterQuality').decision.response, 'Water-quality stress');

  const protectedRain = evaluate({
    environmentalDrivers: 'rainy',
    demo: { ...demo.defaultInput(), groundCover: 'high', bankDisturbance: 'low', rainAmount: 'high' },
    waterQuality: referenceWater
  });
  assert.equal(effect(protectedRain, 'erosion').decision.response, 'Low erosion pressure');
  assert.equal(effect(protectedRain, 'waterQuality').decision.response, 'Reference screen met');

  const exposedRunoff = evaluate({
    environmentalDrivers: 'rainy',
    demo: { ...demo.defaultInput(), groundCover: 'low', bankDisturbance: 'moderate', rainAmount: 'high' },
    waterQuality: referenceWater
  });
  assert.equal(effect(exposedRunoff, 'erosion').decision.response, 'High erosion pressure');
  assert.equal(effect(exposedRunoff, 'waterQuality').decision.response, 'Water-quality stress');
  assert.ok(Object.values(exposedRunoff.edgeStates).every(item => !['uncertain', 'conditional'].includes(item.status)));
  assert.ok(exposedRunoff.pathways.every(path => !['uncertain', 'conditional'].includes(path.status)));
});

test('all 52,488 demo selector combinations resolve every component to one outcome', () => {
  const fieldIds = Object.fromEntries(demo.FIELDS.map(field => [field.key, field.options.map(option => option.id)]));
  const waterCases = ['demo-reference', 'demo-oxygen', 'demo-contamination'].map(water.sampleInput);
  const herdCases = [
    { zebra: 0, waterbuck: 0, puku: 0, impala: 0 },
    baseline,
    { zebra: 10, waterbuck: 10, puku: 20, impala: 30 }
  ];
  let count = 0;
  for (const usableHabitat of fieldIds.usableHabitat)
  for (const grassBiomass of fieldIds.grassBiomass)
  for (const groundCover of fieldIds.groundCover)
  for (const woodyCover of fieldIds.woodyCover)
  for (const bankDisturbance of fieldIds.bankDisturbance)
  for (const rainAmount of fieldIds.rainAmount)
  for (const rainChemistry of fieldIds.rainChemistry)
  for (const environmentalDrivers of Object.keys(model.SEASONS))
  for (const waterQuality of waterCases)
  for (const targetCounts of herdCases) {
    const result = evaluate({
      demo: { usableHabitat, grassBiomass, groundCover, woodyCover, bankDisturbance, rainAmount, rainChemistry },
      environmentalDrivers,
      waterQuality,
      targetCounts
    });
    assert.equal(result.inputErrors.length, 0);
    assert.equal(result.effects.length, 10);
    assert.ok(result.decision.code && result.decision.title && result.decision.action);
    assert.ok(!/\?|unknown|uncertain|undecided/i.test(result.decision.title));
    for (const item of result.effects) {
      assert.equal(item.possibleSigns.length, 1);
      assert.ok(!['uncertain', 'conditional'].includes(item.status));
      assert.ok(item.decision.response && item.decision.action && item.decision.explanation);
      assert.ok(!/\?|unknown|uncertain|undecided/i.test(item.decision.response));
    }
    for (const path of result.pathways) assert.ok(!['uncertain', 'conditional'].includes(path.status));
    for (const item of Object.values(result.edgeStates)) assert.ok(!['uncertain', 'conditional'].includes(item.status));
    for (const influence of result.demo.influences) {
      const state = result.edgeStates[influence.from + '>' + influence.to];
      assert.ok(state, 'missing resolved edge ' + influence.from + '>' + influence.to);
      assert.deepEqual(state.signs, [influence.sign]);
    }
    const expectedHydro = rainAmount === 'low' ? -1 : rainAmount === 'high' ? 1 : environmentalDrivers === 'rainy' ? 1 : environmentalDrivers === 'coolDry' || environmentalDrivers === 'hotDry' ? -1 : 0;
    assert.equal(result.demo.components.rainfall.sign, expectedHydro);
    assert.equal(result.demo.components.water.sign, expectedHydro);
    if (result.demo.components.waterQuality.sign < 0) assert.equal(result.demo.components.aquaticHealth.sign, -1);
    const herdTotal = Object.values(targetCounts).reduce((sum, value) => sum + value, 0);
    if (herdTotal === 0) {
      assert.equal(result.demo.components.competition.sign, 0);
      assert.equal(result.demo.components.health.sign, 0);
    } else {
      if (result.demo.metrics.forageDays < demo.HORIZON_DAYS) {
        assert.equal(result.demo.components.forage.sign, -1);
        assert.equal(result.demo.components.competition.sign, 1);
        assert.equal(result.demo.components.health.sign, -1);
      }
      if (result.demo.components.usableWater.sign < 0) assert.equal(result.demo.components.competition.sign, 1);
    }
    count++;
  }
  assert.equal(count, 52488);
});

test('all 61,236 combinations of herd directions, seasons, field conditions and water cases produce bounded actionable results', () => {
  const waterCases = ['none', 'demo-reference', 'demo-oxygen', 'demo-contamination', 'kafue-2018-07-31'].map(water.sampleInput).concat([{ availability: 'dry' }, { availability: 'limited' }]);
  const edgeKeys = new Set(model.EDGES.map(edge => edge.from + '>' + edge.to));
  const speciesKeys = model.SPECIES.map(species => species.key);
  let count = 0;
  for (let pattern = 0; pattern < 81; pattern++) {
    let remainder = pattern;
    const targetCounts = {};
    for (const key of speciesKeys) { targetCounts[key] = baseline[key] + (remainder % 3) - 1; remainder = Math.floor(remainder / 3); }
    for (const environmentalDrivers of Object.keys(model.SEASONS))
    for (const soil of ['unmeasured', 'exposed', 'nutrientReturn'])
    for (const bank of ['unmeasured', 'disturbed', 'protected'])
    for (const woody of ['unmeasured', 'dense', 'open'])
    for (const waterQuality of waterCases) {
      const result = evaluate({ targetCounts, environmentalDrivers, conditions: { soil, bank, woody }, waterQuality });
      assert.equal(result.inputErrors.length, 0);
      assert.equal(result.effects.length, 10);
      assert.ok(result.decision.code && result.decision.title && result.decision.action);
      assert.ok(!/\?|unknown|uncertain/i.test(result.decision.title));
      assert.equal(result.totals.to, Object.values(targetCounts).reduce((sum, value) => sum + value, 0));
      for (const item of result.effects) {
        assert.ok(item.possibleSigns.length > 0 && item.possibleSigns.every(sign => [-1, 0, 1].includes(sign)));
        assert.ok(item.decision.action && item.decision.response && item.decision.basis);
        assert.ok(!/\?|unknown|uncertain/i.test(item.decision.response));
      }
      for (const path of result.pathways) {
        assert.ok(path.depth <= model.MAX_PATH_DEPTH);
        assert.ok(path.edgeKeys.every(key => edgeKeys.has(key)));
        const nodes = [path.edgeKeys[0].split('>')[0], ...path.edgeKeys.map(key => key.split('>')[1])];
        assert.equal(new Set(nodes).size, nodes.length);
        assert.ok(!nodes.slice(1).some(key => speciesKeys.includes(key)));
      }
      count++;
    }
  }
  assert.equal(count, 61236);
});

test('water screening partitions remain monotone across 3,240 combinations', () => {
  let count = 0;
  for (const ph of [null, 6, 6.5, 9, 10])
  for (const oxygen of [null, 0, 2.99, 3, 5, 7])
  for (const turbidity of [null, 2, 4, 8])
  for (const copper of [null, 0, 1])
  for (const contamination of ['unmeasured', 'notObserved', 'suspected'])
  for (const bloom of ['unmeasured', 'notObserved', 'suspected']) {
    const result = water.assess({ ph, oxygen, turbidity, referenceTurbidity: 4, copper, contamination, bloom });
    const hasCritical = oxygen !== null && oxygen < 3 || contamination === 'suspected' || bloom === 'suspected';
    assert.equal(result.severity === 3, hasCritical);
    assert.equal(result.drinkingConcern, contamination === 'suspected' || bloom === 'suspected');
    assert.equal(result.errors.length, 0);
    count++;
  }
  assert.equal(count, 3240);
});
