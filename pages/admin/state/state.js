/* Monitoring Readiness uses the same survey plane as the dashboard, but never
   turns incomplete inputs into an ecological prediction. */
(function () {
  'use strict';
  var WINDOW_DAYS = 30;
  var el = {};
  function $(id) { return document.getElementById(id); }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dateLabel(value) {
    var date = value && new Date(value);
    if (!date || isNaN(date.getTime())) return 'Not recorded';
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function zones() {
    return window.BioData && window.BioData.getSiteRegistry
      ? window.BioData.getSiteRegistry().filter(function (site) { return site && site.kind === 'zone'; }) : [];
  }
  function isStandardised(survey) {
    return survey && survey.survey_type === 'wildlife_census' && survey.effort_status === 'known' &&
      survey.provenance === 'measured' && !!survey.ended_at;
  }
  function isCurrent(survey) {
    var date = new Date(survey.ended_at || survey.started_at);
    return !isNaN(date.getTime()) && (Date.now() - date.getTime()) <= WINDOW_DAYS * 86400000;
  }
  function zoneName(zone) { return zone.short_name || zone.name || zone.id; }
  function setText(id, value) { if (el[id]) el[id].textContent = value; }

  function render(plane) {
    plane = plane || { surveys: [], zones: [] };
    var surveys = plane.surveys || [];
    var links = plane.zones || [];
    var standardised = surveys.filter(isStandardised);
    var legacy = surveys.filter(function (survey) { return !isStandardised(survey); });
    var surveyById = {};
    surveys.forEach(function (survey) { surveyById[survey.id] = survey; });
    var byZone = {};
    links.forEach(function (link) {
      var survey = surveyById[link.survey_id];
      if (!isStandardised(survey)) return;
      (byZone[link.zone_id] = byZone[link.zone_id] || []).push(survey);
    });
    Object.keys(byZone).forEach(function (id) {
      byZone[id].sort(function (a, b) { return new Date(b.ended_at || b.started_at) - new Date(a.ended_at || a.started_at); });
    });
    var zoneList = zones();
    var current = zoneList.filter(function (zone) { return byZone[zone.id] && isCurrent(byZone[zone.id][0]); });
    var needsWalk = zoneList.length - current.length;
    setText('tileStandardised', standardised.length);
    setText('tileStandardisedNote', 'completed wildlife walks with known effort');
    setText('tileCurrentZones', zoneList.length ? (current.length + ' / ' + zoneList.length) : '—');
    setText('tileCurrentZonesNote', zoneList.length ? ('covered in the last ' + WINDOW_DAYS + ' days') : 'no configured zones');
    setText('tileNeedsWalk', zoneList.length ? needsWalk : '—');
    setText('tileNeedsWalkNote', !zoneList.length ? 'add zones before assessment' : (needsWalk ? 'not yet current' : 'all configured zones current'));
    setText('tileLegacy', legacy.length);
    setText('tileLegacyNote', 'retained, not used for coverage');

    var action = !zoneList.length ? 'Add configured park zones before monitoring can be assessed.' :
      needsWalk ? 'Prioritise a standardised wildlife walk in each zone marked Needs walk or Repeat walk.' :
      'All configured zones are currently covered. Continue the same method on the next monitoring cycle.';
    if (el.readinessBody) el.readinessBody.innerHTML = '<p class="state-readiness-action">' + esc(action) + '</p><p class="state-note">Only completed wildlife walks with known effort enter this coverage measure. Observation totals stay available on the Dashboard.</p>';
    if (el.coverageBody) {
      el.coverageBody.innerHTML = zoneList.map(function (zone) {
        var latest = byZone[zone.id] && byZone[zone.id][0];
        var status = !latest ? 'Needs walk' : isCurrent(latest) ? 'Current' : 'Repeat walk';
        var actionText = !latest ? 'Run the first standardised walk.' : isCurrent(latest) ? 'Continue the scheduled cycle.' : 'Repeat this zone using the same protocol.';
        return '<tr><td>' + esc(zoneName(zone)) + '</td><td>' + esc(latest ? dateLabel(latest.ended_at || latest.started_at) : 'No standardised walk') + '</td><td><span class="state-readiness-status state-readiness-status--' + (status === 'Current' ? 'current' : 'due') + '">' + status + '</span></td><td>' + esc(actionText) + '</td></tr>';
      }).join('') || '<tr><td colspan="4">No configured zones are available yet.</td></tr>';
    }
    var newest = standardised.slice().sort(function (a, b) { return new Date(b.ended_at || b.started_at) - new Date(a.ended_at || a.started_at); })[0];
    setText('datasetNote', newest ? 'Latest completed standardised wildlife walk: ' + dateLabel(newest.ended_at || newest.started_at) + '.' : 'No completed standardised wildlife walk has been recorded yet.');
  }
  function load() {
    render(window.BioData && window.BioData.getSurveyPlane ? window.BioData.getSurveyPlane() : null);
    if (!window.BioSync || !window.BioSync.loadSurveyPlane) return;
    window.BioSync.loadSurveyPlane().then(render).catch(function (error) {
      if (el.readinessBody) el.readinessBody.innerHTML = '<p class="state-empty">Readiness could not be refreshed: ' + esc(error && error.message ? error.message : 'unknown error') + '.</p>';
    });
  }
  function init() {
    ['tileStandardised', 'tileStandardisedNote', 'tileCurrentZones', 'tileCurrentZonesNote', 'tileNeedsWalk', 'tileNeedsWalkNote', 'tileLegacy', 'tileLegacyNote', 'datasetNote', 'readinessBody', 'coverageBody'].forEach(function (id) { el[id] = $(id); });
    window.addEventListener('biodata:synced', load);
    load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
