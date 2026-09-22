/* The one counting path. Every population figure in the app comes from here,
   because four separate read paths previously produced four totals from one
   dataset, and twelve sightings of the same three zebras summed to 36. */

(function () {
  'use strict';

  var DAY_MS = 86400000;
  var WINDOW_DAYS = 30;
  var DEFAULT_STATUSES = ['Approved'];

  function parseTs(value) {
    if (!value) return NaN;
    var parsed = Date.parse(value);
    return isNaN(parsed) ? NaN : parsed;
  }

  function rounds(value, places) {
    var factor = Math.pow(10, places == null ? 1 : places);
    return Math.round(value * factor) / factor;
  }

  // Counts are only ever summed within one abundance kind. A flora row measured
  // as cover must never be added to an animal count.
  function isCountable(obs) {
    return (obs.abundance_kind || 'individuals') === 'individuals';
  }

  function isLive(obs) {
    return !obs.deleted_at;
  }

  function inStatuses(obs, statuses) {
    if (!statuses || !statuses.length) return true;
    return statuses.indexOf(obs.verification_status) !== -1;
  }

  // A row exists only where somebody looked, so the row's existence is the search
  // and `not_detected` is the zero. A zone with no row contributes nothing.
  function countOf(obs) {
    return obs.detection === 'not_detected' ? 0 : (obs.count || 0);
  }

  function datasetMaxTimestamp(observations) {
    var newest = NaN;
    (observations || []).forEach(function (obs) {
      if (!isLive(obs)) return;
      var at = parseTs(obs.timestamp);
      if (!isNaN(at) && (isNaN(newest) || at > newest)) newest = at;
    });
    return newest;
  }

  // Rows that exist but can never be counted, so the caller can say so rather than
  // silently dropping them.
  function nonCountableRows(observations) {
    return (observations || []).filter(function (obs) {
      return isLive(obs) && !isCountable(obs);
    });
  }

  function latestPerZone(observations, speciesId, options) {
    var statuses = options.statuses || DEFAULT_STATUSES;
    var surveysById = options.surveysById || {};
    var held = {};

    (observations || []).forEach(function (obs) {
      if (!isLive(obs) || !isCountable(obs) || !inStatuses(obs, statuses)) return;
      if (!obs.species_id || obs.species_id !== speciesId) return;
      if (!obs.zone_id) return;

      var at = parseTs(obs.timestamp);
      if (isNaN(at)) return;

      var current = held[obs.zone_id];
      if (current && at <= current.at) return;

      var survey = obs.survey_id ? surveysById[obs.survey_id] : null;
      held[obs.zone_id] = {
        zoneId: obs.zone_id,
        at: at,
        count: countOf(obs),
        detection: obs.detection || 'present',
        surveyId: obs.survey_id || null,
        effortStatus: survey ? survey.effort_status : null
      };
    });

    return held;
  }

  // A park total needs every zone searched inside the window. Anything less is a
  // partial count, and a partial count divided into a whole-park denominator makes
  // the park look less pressured than it is.
  function speciesPopulation(observations, zones, speciesId, options) {
    options = options || {};
    var windowDays = options.windowDays == null ? WINDOW_DAYS : options.windowDays;
    var maxTs = options.asOfTs == null ? datasetMaxTimestamp(observations) : options.asOfTs;
    var byZone = latestPerZone(observations, speciesId, options);

    var searched = [];
    var missing = [];
    var entries = {};
    var newest = NaN;

    (zones || []).forEach(function (zone) {
      var zoneId = zone && zone.id;
      if (!zoneId) return;
      var found = byZone[zoneId];
      if (!found) {
        missing.push(zoneId);
        return;
      }
      var ageDays = isNaN(maxTs) ? null : (maxTs - found.at) / DAY_MS;
      if (ageDays != null && ageDays > windowDays) {
        missing.push(zoneId);
        return;
      }
      searched.push(zoneId);
      entries[zoneId] = {
        zoneId: zoneId,
        count: found.count,
        detection: found.detection,
        surveyId: found.surveyId,
        effortStatus: found.effortStatus,
        ageDays: ageDays == null ? null : rounds(ageDays, 1),
        recordedAt: new Date(found.at).toISOString()
      };
      if (isNaN(newest) || found.at > newest) newest = found.at;
    });

    var status;
    if (!(zones || []).length) status = 'no_data';
    else if (!searched.length) status = Object.keys(byZone).length ? 'stale' : 'no_data';
    else if (missing.length) status = 'partial';
    else status = 'ok';

    var total = null;
    if (status === 'ok') {
      total = searched.reduce(function (sum, zoneId) {
        return sum + entries[zoneId].count;
      }, 0);
    }

    return {
      speciesId: speciesId,
      status: status,
      value: total,
      zones: entries,
      zonesSearched: searched,
      zonesMissing: missing,
      asOf: isNaN(newest) ? null : new Date(newest).toISOString(),
      windowDays: windowDays,
      datasetMax: isNaN(maxTs) ? null : new Date(maxTs).toISOString()
    };
  }

  function parkPopulation(observations, zones, speciesIds, options) {
    var result = {};
    (speciesIds || []).forEach(function (speciesId) {
      result[speciesId] = speciesPopulation(observations, zones, speciesId, options);
    });
    return result;
  }

  // The species that actually appear in the data, so a caller does not have to
  // build the list by hand and get it wrong.
  function speciesInDataset(observations, options) {
    options = options || {};
    var statuses = options.statuses || DEFAULT_STATUSES;
    var seen = [];
    var index = {};

    (observations || []).forEach(function (obs) {
      if (!isLive(obs) || !isCountable(obs) || !inStatuses(obs, statuses)) return;
      if (!obs.species_id || index[obs.species_id]) return;
      index[obs.species_id] = true;
      seen.push(obs.species_id);
    });

    return seen.sort();
  }

  var api = {
    WINDOW_DAYS: WINDOW_DAYS,
    datasetMaxTimestamp: datasetMaxTimestamp,
    nonCountableRows: nonCountableRows,
    speciesPopulation: speciesPopulation,
    parkPopulation: parkPopulation,
    speciesInDataset: speciesInDataset
  };

  if (typeof window !== 'undefined') window.BioEcology = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
