/* The survey flow, modelled once. A walk is one survey of one type, recorded zone
   by zone, and this is the only module that turns a walk into rows. Nothing here
   reads the clock, the DOM or the network, so the rules it enforces are testable. */

(function () {
  'use strict';

  // What each type collects, and the effort basis it may honestly claim. A survey
  // whose effort basis is `unmeasured` can never enter a denominator, so the
  // default has to be true rather than convenient.
  // V1 deliberately collects one defensible thing: repeatable wildlife walks.
  // Environmental modules remain in the data model for later, but must not be
  // offered as a field protocol before their methods and equipment are approved.
  var TYPES = [
    { id: 'wildlife_census', label: 'Wildlife census', collects: 'Record sightings and searched absences by zone', effortBasis: 'distance_transect', method: 'Transect walk, on foot' }
  ];

  // The three states of the absence control. A species nobody touched stores no
  // row at all, which is a different fact from a stored zero and must stay so.
  var STATE = {
    notRecorded: 'not_recorded',
    present: 'present',
    notDetected: 'not_detected'
  };

  var ROLES = ['dominant', 'present', 'invasive'];
  var CONFIDENCE = ['certain', 'probable', 'uncertain'];
  var FLOW = ['flowing', 'still'];
  var APPEARANCE = ['clear', 'turbid', 'green', 'brown'];
  var BANK = ['vegetated', 'trampled', 'eroded'];
  var COMPACTION = ['soft', 'firm', 'hard'];
  var EROSION = ['none', 'sheet', 'rills', 'gullies'];
  var SURFACE = ['intact', 'crusted', 'cracked', 'loose'];
  var ZONE_SOURCES = ['gps', 'manual'];

  function typeFor(id) {
    for (var i = 0; i < TYPES.length; i++) {
      if (TYPES[i].id === id) return TYPES[i];
    }
    return null;
  }

  function isType(id) {
    return !!typeFor(id);
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function num(value) {
    var parsed = typeof value === 'number' ? value : parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function slug(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40);
  }

  // An unregistered taxon is still a valid record, so a species without a registry
  // id is keyed on its typed name. Keeping the key stable is what stops the same
  // animal typed three ways from becoming three rows in one zone.
  function speciesKey(entry) {
    if (!entry) return '';
    if (entry.speciesId) return 'id:' + entry.speciesId;
    return 'name:' + slug(entry.commonName);
  }

  function makeSurveyId(startedAt, salt) {
    var d = new Date(startedAt);
    var stamp = d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      '_' + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes());
    var tail = salt || Math.random().toString(36).slice(2, 5);
    return 'survey_' + stamp + '_' + tail;
  }

  function oneOf(value, allowed, label) {
    if (value == null || value === '') return null;
    if (allowed.indexOf(value) === -1) {
      throw new Error('Unrecognised ' + label + ': ' + value);
    }
    return value;
  }

  function assertType(survey, expected, message) {
    if (survey.surveyType !== expected) {
      throw new Error(message);
    }
  }

  function blankZone(surveyType, zoneId, zoneSource) {
    var zone = {
      zoneId: zoneId || null,
      zoneSource: oneOf(zoneSource, ZONE_SOURCES, 'zone source') || 'manual',
      note: '',
      wildlife: null,
      vegetation: null,
      water: null,
      soil: null
    };

    if (surveyType === 'wildlife_census') zone.wildlife = { species: [] };
    if (surveyType === 'vegetation') {
      zone.vegetation = {
        taps: { grass: 0, litter: 0, bare: 0, woody: 0 },
        grassHeightMeanCm: null,
        sward: []
      };
    }
    if (surveyType === 'water_quality') {
      zone.water = { levelPct: null, flow: null, appearance: null, odourOrFoam: false, bankCondition: null };
    }
    if (surveyType === 'soil_condition') {
      zone.soil = { surfaceCondition: null, compaction: null, erosionSigns: null };
    }

    return zone;
  }

  function createSurvey(input) {
    input = input || {};
    if (!isType(input.surveyType)) {
      throw new Error('Unknown survey type: ' + input.surveyType);
    }
    if (!input.startedAt) {
      throw new Error('A survey needs a start time; it is never taken from the clock here');
    }

    var type = typeFor(input.surveyType);
    return {
      surveyId: input.surveyId || makeSurveyId(input.startedAt),
      surveyType: type.id,
      recordedBy: input.recordedBy || '',
      userId: input.userId || null,
      institutionName: input.institutionName || '',
      method: input.method || type.method,
      effortBasis: input.effortBasis || type.effortBasis,
      effortStatus: 'known',
      startedAt: input.startedAt,
      endedAt: null,
      distanceM: null,
      rainfallOfficerFlag: false,
      provenance: 'measured',
      zones: []
    };
  }

  // A zone is opened once. Asking for one already open returns it, which is how
  // "I saw two more zebras" edits the zone instead of starting a second one.
  function zoneOf(survey, zoneId, zoneSource) {
    var i;
    for (i = 0; i < survey.zones.length; i++) {
      if (survey.zones[i].zoneId === zoneId) {
        if (zoneSource) survey.zones[i].zoneSource = oneOf(zoneSource, ZONE_SOURCES, 'zone source');
        return survey.zones[i];
      }
    }
    var entry = blankZone(survey.surveyType, zoneId, zoneSource);
    survey.zones.push(entry);
    return entry;
  }

  function wildlifeZone(survey, zoneId) {
    assertType(survey, 'wildlife_census', 'Only a wildlife census records species counts');
    return zoneOf(survey, zoneId).wildlife;
  }

  // The counting rule, enforced here rather than remembered: one row per species
  // per zone per survey. Recording the same species again replaces its count, so
  // twelve sightings of the same three zebras stays three.
  function recordSpecies(survey, zoneId, entry) {
    entry = entry || {};
    var zone = wildlifeZone(survey, zoneId);
    var notDetected = entry.detection === STATE.notDetected;
    var count = notDetected ? 0 : Math.round(num(entry.count));

    if (count < 0) {
      throw new Error('Count cannot be negative');
    }

    // A present row with a zero is exactly the confusion the three state control
    // exists to prevent, so it is refused rather than stored. Checked after the
    // sign so a negative reports itself rather than reading as a missing count.
    if (!notDetected && count < 1) {
      throw new Error('A present sighting needs a count above zero; use not detected for a searched and empty zone');
    }

    var row = {
      speciesId: entry.speciesId || null,
      commonName: entry.commonName || '',
      scientificName: entry.scientificName || '',
      count: count,
      detection: notDetected ? STATE.notDetected : STATE.present,
      juveniles: notDetected || entry.juveniles == null ? null : Math.round(num(entry.juveniles)),
      confidence: oneOf(entry.confidence, CONFIDENCE, 'identification confidence') || 'certain'
    };

    var key = speciesKey(row);
    for (var i = 0; i < zone.species.length; i++) {
      if (speciesKey(zone.species[i]) === key) {
        zone.species[i] = row;
        return row;
      }
    }
    zone.species.push(row);
    return row;
  }

  function markNotSeen(survey, zoneId, entry) {
    entry = entry || {};
    return recordSpecies(survey, zoneId, {
      speciesId: entry.speciesId,
      commonName: entry.commonName,
      scientificName: entry.scientificName,
      detection: STATE.notDetected
    });
  }

  // Back to "nobody looked": the row goes, rather than becoming a zero.
  function clearSpecies(survey, zoneId, entry) {
    var zone = wildlifeZone(survey, zoneId);
    var key = speciesKey(entry);
    zone.species = zone.species.filter(function (row) {
      return speciesKey(row) !== key;
    });
  }

  function speciesInZone(survey, zoneId, entry) {
    var zone = wildlifeZone(survey, zoneId);
    var key = speciesKey(entry);
    for (var i = 0; i < zone.species.length; i++) {
      if (speciesKey(zone.species[i]) === key) return zone.species[i];
    }
    return null;
  }

  function setTaps(survey, zoneId, counts) {
    assertType(survey, 'vegetation', 'Only a vegetation survey records point intercept taps');
    counts = counts || {};
    var taps = {};
    ['grass', 'litter', 'bare', 'woody'].forEach(function (name) {
      var value = Math.round(num(counts[name]));
      if (value < 0) throw new Error('Tap counts cannot be negative');
      taps[name] = value;
    });
    zoneOf(survey, zoneId).vegetation.taps = taps;
    return taps;
  }

  function setGrassHeight(survey, zoneId, cm) {
    assertType(survey, 'vegetation', 'Only a vegetation survey records grass height');
    var value = cm == null || cm === '' ? null : num(cm);
    if (value != null && value < 0) throw new Error('Grass height cannot be negative');
    zoneOf(survey, zoneId).vegetation.grassHeightMeanCm = value;
    return value;
  }

  // One dominant per zone, because "the dominant grass species" is singular and two
  // of them is not an answer. Setting a new dominant demotes the old one rather
  // than refusing, so the officer is never stuck.
  function addSwardSpecies(survey, zoneId, speciesId, role) {
    assertType(survey, 'vegetation', 'Only a vegetation survey records sward species');
    if (!speciesId) throw new Error('A sward species needs a registry id');
    var wanted = oneOf(role, ROLES, 'sward role') || 'present';
    var zone = zoneOf(survey, zoneId);
    var sward = zone.vegetation.sward;

    if (wanted === 'dominant') {
      sward.forEach(function (row) {
        if (row.role === 'dominant') row.role = 'present';
      });
    }

    for (var i = 0; i < sward.length; i++) {
      if (sward[i].speciesId === speciesId) {
        sward[i].role = wanted;
        return sward[i];
      }
    }
    sward.push({ speciesId: speciesId, role: wanted });
    return sward[sward.length - 1];
  }

  function removeSwardSpecies(survey, zoneId, speciesId) {
    assertType(survey, 'vegetation', 'Only a vegetation survey records sward species');
    var zone = zoneOf(survey, zoneId);
    zone.vegetation.sward = zone.vegetation.sward.filter(function (row) {
      return row.speciesId !== speciesId;
    });
  }

  function setWater(survey, zoneId, values) {
    assertType(survey, 'water_quality', 'Only a water survey records water readings');
    values = values || {};
    var water = zoneOf(survey, zoneId).water;
    var level = values.levelPct == null || values.levelPct === '' ? null : num(values.levelPct);

    if (level != null && (level < 0 || level > 100)) {
      throw new Error('Water level must be between 0 and 100 percent');
    }

    water.levelPct = level;
    water.flow = oneOf(values.flow, FLOW, 'flow');
    water.appearance = oneOf(values.appearance, APPEARANCE, 'appearance');
    water.bankCondition = oneOf(values.bankCondition, BANK, 'bank condition');
    if (values.odourOrFoam != null) water.odourOrFoam = !!values.odourOrFoam;
    return water;
  }

  function setSoil(survey, zoneId, values) {
    assertType(survey, 'soil_condition', 'Only a soil survey records soil readings');
    values = values || {};
    var soil = zoneOf(survey, zoneId).soil;
    soil.surfaceCondition = oneOf(values.surfaceCondition, SURFACE, 'surface condition');
    soil.compaction = oneOf(values.compaction, COMPACTION, 'compaction');
    soil.erosionSigns = oneOf(values.erosionSigns, EROSION, 'erosion signs');
    return soil;
  }

  function setNote(survey, zoneId, text) {
    zoneOf(survey, zoneId).note = String(text == null ? '' : text).slice(0, 1000);
  }

  // When the officer finished recording a zone. Kept per zone because a walk
  // crosses them at different times, and one timestamp for the whole walk would
  // claim every sighting happened when the walk ended.
  function markZoneRecorded(survey, zoneId, at) {
    if (!at) throw new Error('A zone needs the time it was recorded');
    zoneOf(survey, zoneId).recordedAt = at;
    return at;
  }

  function endSurvey(survey, patch) {
    patch = patch || {};
    if (!patch.endedAt) {
      throw new Error('A survey needs an end time');
    }
    survey.endedAt = patch.endedAt;
    if (patch.distanceM != null && patch.distanceM !== '') {
      var distance = num(patch.distanceM);
      if (distance < 0) throw new Error('Distance cannot be negative');
      survey.distanceM = distance;
    }
    if (patch.rainfallOfficerFlag != null) {
      survey.rainfallOfficerFlag = !!patch.rainfallOfficerFlag;
    }
    return survey;
  }

  // Derived, never stored: a typed duration can disagree with the times it came
  // from, and then nobody can say which is right.
  function durationMinutes(survey) {
    var start = Date.parse(survey.startedAt);
    var end = Date.parse(survey.endedAt);
    if (isNaN(start) || isNaN(end)) return null;
    return Math.round((end - start) / 60000);
  }

  // Cover is a ratio of counts. It is computed wherever it is needed and never
  // written down, so it cannot end up disagreeing with the taps behind it.
  function coverFromTaps(taps) {
    var t = taps || {};
    var grass = num(t.grass);
    var litter = num(t.litter);
    var bare = num(t.bare);
    var woody = num(t.woody);
    var total = grass + litter + bare + woody;

    if (!total) {
      return { total: 0, grassPct: null, litterPct: null, barePct: null, woodyPct: null };
    }

    return {
      total: total,
      grassPct: round1(grass * 100 / total),
      litterPct: round1(litter * 100 / total),
      barePct: round1(bare * 100 / total),
      woodyPct: round1(woody * 100 / total)
    };
  }

  function standingForageFromCover(coverPct, calibration) {
    if (coverPct == null || !calibration) return null;
    var slope = num(calibration.slope);
    var intercept = num(calibration.intercept);
    var value = slope * coverPct + intercept;
    return value < 0 ? null : round1(value);
  }

  function summary(survey) {
    var recorded = 0;
    var absent = 0;
    var animals = 0;

    survey.zones.forEach(function (zone) {
      if (!zone.wildlife) return;
      zone.wildlife.species.forEach(function (row) {
        if (row.detection === STATE.notDetected) absent += 1;
        else {
          recorded += 1;
          animals += row.count;
        }
      });
    });

    return {
      zones: survey.zones.length,
      speciesRecorded: recorded,
      speciesNotSeen: absent,
      animals: animals,
      durationMinutes: durationMinutes(survey)
    };
  }

  function toSurveyRow(survey) {
    return {
      survey_id: survey.surveyId,
      survey_type: survey.surveyType,
      user_id: survey.userId || null,
      recorded_by: survey.recordedBy || '',
      method: survey.method || '',
      effort_basis: survey.effortBasis,
      effort_status: survey.effortStatus,
      started_at: survey.startedAt,
      ended_at: survey.endedAt,
      distance_m: survey.distanceM,
      rainfall_officer_flag: survey.rainfallOfficerFlag,
      provenance: survey.provenance
    };
  }

  function toSurveyZoneRows(survey) {
    return survey.zones.map(function (zone) {
      return {
        survey_id: survey.surveyId,
        zone_id: zone.zoneId,
        zone_source: zone.zoneSource,
        note: zone.note || null
      };
    });
  }

  // The id is built from the survey, the zone and the species, so re-pushing the
  // same walk upserts instead of duplicating. That is what lets the offline queue
  // retry safely.
  function observationIdFor(survey, zone, row) {
    return ['obs', survey.surveyId, zone.zoneId || 'unzoned', slug(row.speciesId || row.commonName || 'unknown')].join('_');
  }

  function toObservationRows(survey, options) {
    options = options || {};
    var context = options.context || {};
    var rows = [];

    survey.zones.forEach(function (zone) {
      if (!zone.wildlife) return;
      zone.wildlife.species.forEach(function (row) {
        rows.push({
          observation_id: observationIdFor(survey, zone, row),
          count: row.count,
          verification_status: 'Pending',
          source: 'field_observation',
          scientific_name: row.scientificName || '',
          common_name: row.commonName || '',
          latitude: context.latitude != null ? context.latitude : null,
          longitude: context.longitude != null ? context.longitude : null,
          country: context.country || 'Zambia',
          administrative_area: context.administrativeArea || 'Copperbelt Province',
          city: context.city || 'Kitwe',
          focus_area: context.focusArea || null,
          habitat_type: context.habitatType || '',
          locality_description: '',
          recorded_by: survey.recordedBy || '',
          timestamp: zone.recordedAt || survey.endedAt || survey.startedAt,
          institution_name: survey.institutionName || '',
          activity: '',
          field_notes: '',
          species_id: row.speciesId,
          site_id: context.siteId || null,
          survey_id: survey.surveyId,
          zone_id: zone.zoneId,
          abundance_kind: 'individuals',
          detection: row.detection,
          juveniles: row.juveniles,
          identification_confidence: row.confidence,
          provenance: survey.provenance
        });
      });
    });

    return rows;
  }

  function toReadingRow(survey, zone) {
    if (survey.surveyType === 'vegetation') {
      var taps = zone.vegetation.taps;
      return {
        survey_id: survey.surveyId,
        zone_id: zone.zoneId,
        grass_hits: taps.grass,
        litter_hits: taps.litter,
        bare_hits: taps.bare,
        woody_hits: taps.woody,
        grass_height_mean_cm: zone.vegetation.grassHeightMeanCm
      };
    }
    if (survey.surveyType === 'water_quality') {
      return {
        survey_id: survey.surveyId,
        zone_id: zone.zoneId,
        level_pct: zone.water.levelPct,
        flow: zone.water.flow,
        appearance: zone.water.appearance,
        odour_or_foam: zone.water.odourOrFoam,
        bank_condition: zone.water.bankCondition
      };
    }
    if (survey.surveyType === 'soil_condition') {
      return {
        survey_id: survey.surveyId,
        zone_id: zone.zoneId,
        surface_condition: zone.soil.surfaceCondition,
        compaction: zone.soil.compaction,
        erosion_signs: zone.soil.erosionSigns
      };
    }
    return null;
  }

  function toSwardRows(survey, zone) {
    assertType(survey, 'vegetation', 'Only a vegetation survey records sward species');
    return zone.vegetation.sward.map(function (row) {
      return {
        survey_id: survey.surveyId,
        zone_id: zone.zoneId,
        species_id: row.speciesId,
        role: row.role
      };
    });
  }

  var api = {
    TYPES: TYPES,
    STATE: STATE,
    ROLES: ROLES,
    CONFIDENCE: CONFIDENCE,
    FLOW: FLOW,
    APPEARANCE: APPEARANCE,
    BANK: BANK,
    COMPACTION: COMPACTION,
    EROSION: EROSION,
    SURFACE: SURFACE,
    ZONE_SOURCES: ZONE_SOURCES,
    isType: isType,
    typeFor: typeFor,
    speciesKey: speciesKey,
    createSurvey: createSurvey,
    zoneOf: zoneOf,
    recordSpecies: recordSpecies,
    markNotSeen: markNotSeen,
    clearSpecies: clearSpecies,
    speciesInZone: speciesInZone,
    setTaps: setTaps,
    setGrassHeight: setGrassHeight,
    addSwardSpecies: addSwardSpecies,
    removeSwardSpecies: removeSwardSpecies,
    setWater: setWater,
    setSoil: setSoil,
    setNote: setNote,
    markZoneRecorded: markZoneRecorded,
    endSurvey: endSurvey,
    durationMinutes: durationMinutes,
    coverFromTaps: coverFromTaps,
    standingForageFromCover: standingForageFromCover,
    summary: summary,
    toSurveyRow: toSurveyRow,
    toSurveyZoneRows: toSurveyZoneRows,
    toObservationRows: toObservationRows,
    toReadingRow: toReadingRow,
    toSwardRows: toSwardRows
  };

  if (typeof window !== 'undefined') window.BioSurvey = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
