// lib/data.js
// One source of truth for all application data: defaults are embedded so the app
// works offline, and pages subscribe to shared state that updates after CRUD.

window.BioData = (function() {
  // EVENT BUS
  var subscribers = {};

  function subscribe(eventName, eventHandler) {
    if (!subscribers[eventName]) subscribers[eventName] = [];
    subscribers[eventName].push(eventHandler);
    return function unsubscribeReturned() {
      var handlerList = subscribers[eventName];
      if (!handlerList) return;
      var position = handlerList.indexOf(eventHandler);
      if (position !== -1) handlerList.splice(position, 1);
    };
  }

  function unsubscribe(eventName, eventHandler) {
    var handlerList = subscribers[eventName];
    if (!handlerList) return;
    var position = handlerList.indexOf(eventHandler);
    if (position !== -1) handlerList.splice(position, 1);
  }

  function publish(eventName, eventData) {
    var handlerList = subscribers[eventName];
    if (!handlerList) return;
    handlerList.slice().forEach(function(handler) {
      try {
        handler(eventData);
      } catch (error) {
        console.error('Error in subscriber for "' + eventName + '":', error);
      }
    });
  }

  var eventNames = {
    OBSERVATION_CREATED: 'observation:created',
    USER_CREATED: 'user:created'
  };

  // localStorage persistence helpers. The 'biodata_' prefix keeps these keys from
  // colliding with other apps on the same domain.

  // Bump STORAGE_VERSION whenever the default data shape changes. A mismatch means
  // the saved data is stale and would block newer accounts from logging in, so we
  // discard it and re-seed from defaults.
  var STORAGE_VERSION = 6;
  var STORAGE_VERSION_KEY = 'biodata_version';

  function clearStaleStorage() {
    try {
      var savedVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY), 10);
      if (savedVersion === STORAGE_VERSION) return;
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('biodata_') === 0) keysToRemove.push(k);
      }
      keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
    } catch(e) { /* storage unavailable, fall back to in-memory defaults */ }
  }

  function loadFromStorage(key, fallback) {
    try {
      var parsedData = localStorage.getItem('biodata_' + key);
      if (parsedData) return JSON.parse(parsedData);
    } catch(e) { /* corrupt or unparseable data, fall back to defaults */ }
    return fallback;
  }

  function saveToStorage(key, data) {
    try {
      localStorage.setItem('biodata_' + key, JSON.stringify(data));
    } catch(e) {
      // TODO: Notify the user when localStorage quota is exceeded so they can
      // clear space rather than losing data silently.
    }
  }

  function persist() {
    saveToStorage('users', users);
    saveToStorage('observations', observations);
  }

  // PAD HELPER
  // String.prototype.padStart (ES2017) throws on older engines/webviews, which
  // would take down this file and the whole app with it.
  function padZero(num, len) {
    var s = String(num);
    while (s.length < len) s = '0' + s;
    return s;
  }

  /**
   * One account-code formatter for the whole app, so the same person is never
   * shown two different codes. Returns an em dash rather than a guess, because a
   * made-up code (the old static "ADM-001" placeholder) is worse than none.
   */
  function formatAccountId(id, role) {
    var prefix = role === 'admin' ? 'ADMIN' : 'FO';
    var value = id == null ? '' : String(id);
    if (!value) return '\u2014';
    if (/^\d+$/.test(value)) return prefix + '-' + padZero(value, 3);
    return prefix + '-' + value.replace(/-/g, '').slice(0, 4).toUpperCase();
  }

  // DEFAULT DATA (fallback when no localStorage exists)
  var defaultUsers = [
    { id: 1, name: 'Lenganji Sinyangwe', email: 'lenganji@zitbio.org',   role: 'admin',         institution_name: 'The Copperbelt University', created: '1/15/2026',  lastLogin: null },
    { id: 2, name: 'Jeromy Ngoma',       email: 'jeromy@zitbio.org',      role: 'admin',         institution_name: 'The Copperbelt University', created: '1/15/2026',  lastLogin: null },
    { id: 3, name: 'Wangu Ng\'ambi',     email: 'wangu@zitbio.org',       role: 'field_officer', institution_name: 'The Copperbelt University', created: '2/1/2026',   lastLogin: null },
    { id: 4, name: 'Emmanuel Chate',     email: 'emmanuel@zitbio.org',    role: 'field_officer', institution_name: 'The Copperbelt University', created: '2/1/2026',   lastLogin: null },
    { id: 5, name: 'Lenson Mulaga',      email: 'lenson@zitbio.org',      role: 'field_officer', institution_name: 'The Copperbelt University', created: '2/1/2026',   lastLogin: null }
  ];

  // ZAMBIA GEOGRAPHIC REFERENCE DATA
  // Current scope: Copperbelt Province only (single-site campus deployment).
  var zambiaProvinces = [
    { name: 'Copperbelt Province',  reserves: ['Chembe Bird Sanctuary', 'Mwekera National Forest'] }
  ];

  var focusAreas = [
    'The CBU Nature Park',
    'CBU Campus'
  ];

  // DEFAULT OBSERVATIONS (v3 schema), scoped to The CBU Nature Park.
  var defaultObservations = [
    // Counts sit near the research-documented populations (Zebra 3, Waterbuck 3,
    // Puku 5, Impala 8) so the low-population estimate stays at/above baseline.
    { observation_id: 'obs_000001', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-14T07:20:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000002', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-06-15T16:15:00Z', institution_name: 'The Copperbelt University', activity: 'Drinking at the pond', field_notes: 'Herd calm and feeding normally.' },
    { observation_id: 'obs_000003', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-16T07:10:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing near the water', field_notes: 'All animals appeared healthy and alert.' },
    { observation_id: 'obs_000004', count: 8, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-06-17T17:00:00Z', institution_name: 'The Copperbelt University', activity: 'Resting under the trees', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000005', count: 4, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80224, longitude: 28.23922, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at Jambo Drive' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-06-18T08:30:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing along the fence line', field_notes: 'No signs of distress observed.' },
    { observation_id: 'obs_000006', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-20T17:40:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing near the water', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000007', count: 6, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-06-22T16:30:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing, looking healthy', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000008', count: 7, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80192, longitude: 28.24088, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'close to the antenna' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-24T07:55:00Z', institution_name: 'The Copperbelt University', activity: 'Moving through the woodland', field_notes: 'No issues observed.' },
    { observation_id: 'obs_000009', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-26T15:45:00Z', institution_name: 'The Copperbelt University', activity: 'Drinking at the pond', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000010', count: 2, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80192, longitude: 28.24088, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'close to the antenna' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-06-28T08:10:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing, looking healthy', field_notes: 'No signs of distress observed.' },
    { observation_id: 'obs_000011', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-06-30T07:35:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'Herd calm and feeding normally.' },
    { observation_id: 'obs_000012', count: 8, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80224, longitude: 28.23922, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at Jambo Drive' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-02T16:10:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing along the fence line', field_notes: 'All animals appeared healthy and alert.' },
    { observation_id: 'obs_000013', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-04T08:20:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000014', count: 4, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-06T17:25:00Z', institution_name: 'The Copperbelt University', activity: 'Drinking at the pond', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000015', count: 4, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80224, longitude: 28.23922, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at Jambo Drive' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-08T06:50:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing along the fence line', field_notes: 'No issues observed.' },
    { observation_id: 'obs_000016', count: 9, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-10T08:40:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'Herd calm and feeding normally.' },
    { observation_id: 'obs_000017', count: 2, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-12T16:55:00Z', institution_name: 'The Copperbelt University', activity: 'Resting under the trees', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000018', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-14T07:45:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing near the water', field_notes: 'No signs of distress observed.' },
    { observation_id: 'obs_000019', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80192, longitude: 28.24088, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'close to the antenna' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-16T18:00:00Z', institution_name: 'The Copperbelt University', activity: 'Moving through the woodland', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000020', count: 8, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-18T06:55:00Z', institution_name: 'The Copperbelt University', activity: 'Resting under the trees', field_notes: 'All animals appeared healthy and alert.' },
    { observation_id: 'obs_000021', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80224, longitude: 28.23922, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at Jambo Drive' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-20T15:35:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing along the fence line', field_notes: 'Herd calm and feeding normally.' },
    { observation_id: 'obs_000022', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-22T08:05:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000023', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-24T17:15:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing near the water', field_notes: 'No issues observed.' },
    { observation_id: 'obs_000024', count: 8, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80192, longitude: 28.24088, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'close to the antenna' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-26T07:10:00Z', institution_name: 'The Copperbelt University', activity: 'Moving through the woodland', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000025', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-07-28T16:20:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000026', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-07-30T07:30:00Z', institution_name: 'The Copperbelt University', activity: 'Drinking at the pond', field_notes: 'Herd calm and feeding normally.' },
    { observation_id: 'obs_000027', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-08-01T18:10:00Z', institution_name: 'The Copperbelt University', activity: 'Resting under the trees', field_notes: 'All animals appeared healthy and alert.' },
    { observation_id: 'obs_000028', count: 8, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80224, longitude: 28.23922, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at Jambo Drive' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-08-03T08:25:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing along the fence line', field_notes: 'No signs of distress observed.' },
    { observation_id: 'obs_000029', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Zebra' },
      location: { latitude: -12.80262, longitude: 28.23955, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the pond' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-08-05T07:05:00Z', institution_name: 'The Copperbelt University', activity: 'Drinking at the pond', field_notes: 'All individuals looked healthy.' },
    { observation_id: 'obs_000030', count: 3, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.80160, longitude: 28.23962, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the fence at the main gate' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-08-07T16:35:00Z', institution_name: 'The Copperbelt University', activity: 'Grazing', field_notes: 'Herd in good condition.' },
    { observation_id: 'obs_000031', count: 5, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.80192, longitude: 28.24088, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'close to the antenna' },
      recorded_by: 'Lenson Mulaga', timestamp: '2026-08-10T07:50:00Z', institution_name: 'The Copperbelt University', activity: 'Moving through the woodland', field_notes: 'No issues observed.' },
    { observation_id: 'obs_000032', count: 9, verification_status: 'Approved', source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.80272, longitude: 28.24042, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'near the trees at the basketball court' },
      recorded_by: 'Lenganji Sinyangwe', timestamp: '2026-08-14T08:15:00Z', institution_name: 'The Copperbelt University', activity: 'Resting under the trees', field_notes: 'Herd calm and feeding normally.' }
  ];

  // SPECIES REFERENCE: Common Name to Scientific Name
  // Scoped to the research-verified CBU Nature Park inventory: managed ungulates
  // plus Miombo woodland flora.
  var speciesReference = {
    // Mammals: park managed ungulate assemblage (19 individuals, Sept 2023)
    'Zebra': 'Equus quagga',
    'Waterbuck': 'Kobus ellipsiprymnus',
    'Puku': 'Kobus vardonii',
    'Impala': 'Aepyceros melampus',

    // Flora: Miombo woodland strata
    'Miombo Tree': 'Brachystegia spiciformis',
    'Zebrawood': 'Brachystegia spiciformis',
    'Musasa': 'Brachystegia spiciformis',
    'Blue-leaved Brachystegia': 'Brachystegia floribunda',
    'Mutondo': 'Julbernardia paniculata',
    'Munali Tree': 'Julbernardia paniculata',
    'Isoberlinia': 'Isoberlinia angolensis',
    'Mpundu': 'Isoberlinia angolensis',
    'Mobola Plum': 'Parinari curatellifolia',
    'Mahobohobo': 'Uapaca spp.',
    'Wild Loquat': 'Uapaca spp.',
    'Water Berry': 'Syzygium guineense',
    'Musiko': 'Syzygium guineense',
    'Wild Rubber Tree': 'Diplorhynchus condylocarpon',
    "Elephant's Apple": 'Anisophyllea boehmii'
  };

  /** Partial and case-insensitive, because officers may know only part of a name. */
  function lookupScientificName(commonName) {
    if (!commonName) return null;
    var normalized = commonName.trim();
    if (speciesReference[normalized]) return speciesReference[normalized];
    var lower = normalized.toLowerCase();
    var keys = Object.keys(speciesReference);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === lower) return speciesReference[keys[i]];
    }
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase().includes(lower)) return speciesReference[keys[j]];
    }
    return null;
  }

  function getSpeciesReference() {
    return speciesReference;
  }

  // SPECIES ECOLOGY: a species with no entry still gets a data-driven status from
  // BioAnalytics.ecosystemInsights.
  var SPECIES_ECOLOGY = {
    'equus quagga': {
      role: 'Non-ruminant bulk roughage grazer',
      impact: 'Crops tall, fibrous grass and exposes nutrient-rich lower foliage for smaller ruminants.',
      up: 'More intense grass cropping helps smaller grazers, but an over-large herd can overgraze beyond carrying capacity.',
      down: 'Tall, coarse grass builds up and less forage is exposed for smaller grazers; sward quality declines.'
    },
    'kobus ellipsiprymnus': {
      role: 'Ruminant selective mesic grazer',
      impact: 'Feeds on taller riverine grasses near water, keeping riparian vegetation in check.',
      up: 'Heavier grazing on riverine grasses; may pressure moisture-dependent vegetation.',
      down: 'Riparian grasses grow unchecked and mesic vegetation thickens along watercourses.'
    },
    'kobus vardonii': {
      role: 'Specialized floodplain / riparian grazer',
      impact: 'Grazes tender, high-moisture grasses at water margins, maintaining open wetland edges.',
      up: 'Keeps water margins open, though localised overgrazing near water is possible.',
      down: 'Water-margin grasses thicken and riparian edges become overgrown, reducing habitat quality for water-dependent species.'
    },
    'aepyceros melampus': {
      role: 'Intermediate mixed feeder (grazer / browser)',
      impact: 'Feeds on fresh grasses in the wet season and woody browse, fallen leaves and pods in the dry season — balancing grass and shrub growth.',
      up: 'Stronger control of woody encroachment and grass, but high numbers may reduce regeneration of palatable plants.',
      down: 'Less browsing lets woody shrubs expand, shifting the woodland–grassland balance.'
    },
    'brachystegia spiciformis': {
      role: 'Upper-canopy nitrogen-fixing legume',
      impact: 'Dominant Miombo canopy tree; enriches nutrient-poor soils via ectomycorrhizal nitrogen fixation.',
      up: 'More canopy cover, shade and soil nitrogen for the understorey.',
      down: 'Less nitrogen fixation and canopy cover; soil fertility and understorey decline.'
    },
    'brachystegia floribunda': {
      role: 'Upper-canopy co-dominant legume',
      impact: 'Co-dominates the Miombo canopy and contributes to soil enrichment.',
      up: 'Increases canopy cover and nitrogen input alongside the other legume canopy trees.',
      down: 'Reduces canopy continuity and soil enrichment.'
    },
    'julbernardia paniculata': {
      role: 'Upper-canopy nitrogen-fixing legume',
      impact: 'Canopy dominant that fixes nitrogen and supports the broader Miombo community.',
      up: 'Stronger nitrogen input and canopy structure.',
      down: 'Weaker nitrogen fixation and canopy; drier, more open woodland.'
    },
    'isoberlinia angolensis': {
      role: 'Wet-Miombo canopy co-dominant',
      impact: 'Canopy co-dominant in wetter Miombo tracts; shades and stabilises the understorey.',
      up: 'Increases canopy cover in wet zones.',
      down: 'Opens the canopy in wet tracts, increasing understorey exposure.'
    },
    'parinari curatellifolia': {
      role: 'Evergreen canopy associate (fruit producer)',
      impact: 'Supplies fruit during dry-season bottlenecks, feeding wildlife when herbaceous cover is low.',
      up: 'More dry-season fruit resources for frugivores.',
      down: 'Fewer dry-season fruits; wildlife food scarcity in lean periods.'
    },
    'uapaca spp.': {
      role: 'Fruit-bearing sub-canopy tree',
      impact: 'Provides seasonal fruit resources for wildlife.',
      up: 'More fruit available to wildlife.',
      down: 'Reduced fruit supply for frugivores.'
    },
    'syzygium guineense': {
      role: 'Sub-canopy associate of moist micro-sites',
      impact: 'Stabilises moist micro-sites along drainage lines.',
      up: 'Reinforces moisture-loving micro-habitats.',
      down: 'Moist micro-sites lose structure and shade.'
    },
    'diplorhynchus condylocarpon': {
      role: 'Fire-resistant understorey small tree',
      impact: 'Corky bark resists seasonal fires, keeping the understorey stable.',
      up: 'Stronger fire resistance and understorey stability.',
      down: 'Understorey more vulnerable to fire and disturbance.'
    },
    'anisophyllea boehmii': {
      role: 'Understorey structural component',
      impact: 'Adds vertical structure and habitat complexity in the understorey.',
      up: 'More understorey structure and cover for wildlife.',
      down: 'Simpler understorey with less cover.'
    }
  };

  function getSpeciesEcology() {
    return SPECIES_ECOLOGY;
  }

  // SPECIES & SITE REGISTRIES (analytics layer)
  // Older observations carry only string fields, so the resolvers fall back to
  // string matching and existing localStorage data keeps working untouched.

  // Keys are lowercased to match the lookup in buildDefaultSpeciesRegistry:
  // title-cased keys silently classified all flora as fauna.
  var FLORA_SCIENTIFIC_NAMES = {
    'brachystegia spiciformis': true,
    'brachystegia floribunda': true,
    'julbernardia paniculata': true,
    'isoberlinia angolensis': true,
    'parinari curatellifolia': true,
    'uapaca spp.': true,
    'syzygium guineense': true,
    'diplorhynchus condylocarpon': true,
    'anisophyllea boehmii': true
  };

  // Research-sourced park populations seed authoritative baselines for the
  // low-population warning system; every other species keeps null and is derived.
  var PARK_BASELINES = {
    'equus quagga': 3,
    'kobus ellipsiprymnus': 3,
    'kobus vardonii': 5,
    'aepyceros melampus': 8
  };

  function buildDefaultSpeciesRegistry() {
    var seen = {};
    var registry = [];
    var idCounter = 1;

    function addEntry(commonName, scientificName) {
      if (!scientificName) return;
      var key = scientificName.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      registry.push({
        id: 'sp_' + padZero(idCounter, 3),
        scientific_name: scientificName,
        common_name: commonName,
        taxon_type: FLORA_SCIENTIFIC_NAMES[key] ? 'flora' : 'fauna',
        baseline_count: (PARK_BASELINES[key] != null ? PARK_BASELINES[key] : null),
        baseline_updated_at: null,
        baseline_updated_by: null,
        conservation_status: null,   // never fabricated
        baseline_by_site: null
      });
      idCounter++;
    }

    // Seed-observation species first, then the rest of the reference table so
    // every lookup entry gets an id.
    defaultObservations.forEach(function(obs) {
      var sd = obs.species_details || {};
      addEntry(sd.common_name, sd.scientific_name);
    });

    Object.keys(speciesReference).forEach(function(commonName) {
      addEntry(commonName, speciesReference[commonName]);
    });

    return registry;
  }

  function buildDefaultSites() {
    // These two predate the park-to-zone hierarchy, so their `kind` is stated
    // rather than defaulted: a fallback of 'zone' would make the park itself a
    // zone and put a whole park in the zone picker.
    return [
      { id: 'site_001', name: 'The CBU Nature Park', short_name: 'Nature Park', habitat_type_default: 'Miombo Woodland', established: null, kind: 'park', parent_site_id: null, sort_order: null, latitude: null, longitude: null },
      { id: 'site_002', name: 'CBU Campus', short_name: 'Campus', habitat_type_default: 'Urban', established: null, kind: 'campus', parent_site_id: null, sort_order: null, latitude: null, longitude: null }
    ];
  }

  // Persisted so admin baseline edits survive a refresh.
  var speciesRegistry = loadFromStorage('speciesRegistry', buildDefaultSpeciesRegistry());
  var sites = loadFromStorage('sites', buildDefaultSites());

  // Fills fields missing from older localStorage snapshots.
  var speciesIdCounter = 1;
  speciesRegistry.forEach(function(s) {
    if (!s.id) s.id = 'sp_' + padZero(speciesIdCounter++, 3);
    if (!s.taxon_type) {
      s.taxon_type = FLORA_SCIENTIFIC_NAMES[(s.scientific_name || '').toLowerCase()] ? 'flora' : 'fauna';
    }
    if (s.baseline_count === undefined) s.baseline_count = null;
    if (s.baseline_updated_at === undefined) s.baseline_updated_at = null;
    if (s.baseline_updated_by === undefined) s.baseline_updated_by = null;
    if (s.conservation_status === undefined) s.conservation_status = null;
    if (s.baseline_by_site === undefined) s.baseline_by_site = null;
  });
  try { saveToStorage('speciesRegistry', speciesRegistry); } catch (e) { /* storage unavailable */ }

  sites.forEach(function(site) {
    if (!site.id) site.id = 'site_' + padZero(parseInt((site.name || '').replace(/\D/g, '') || '1', 10), 3);
    if (site.habitat_type_default === undefined) site.habitat_type_default = '';
    if (site.established === undefined) site.established = null;
    // `kind` is deliberately NOT defaulted to 'zone'. A site stored before the
    // hierarchy existed has no kind, and calling it a zone would put the park
    // itself in the zone picker. Unknown stays unknown until the cloud answers.
    if (site.kind === undefined) site.kind = null;
    if (site.parent_site_id === undefined) site.parent_site_id = null;
    if (site.sort_order === undefined) site.sort_order = null;
    if (site.latitude === undefined) site.latitude = null;
    if (site.longitude === undefined) site.longitude = null;
  });
  try { saveToStorage('sites', sites); } catch (e) { /* storage unavailable */ }

  // Resolvers (id-first with string fallback)

  // Accepts an observation object, a species object, or a plain string.
  function resolveSpeciesId(candidate) {
    var id = candidate && typeof candidate === 'object' ? candidate.species_id : null;
    if (id) {
      var direct = speciesRegistry.find(function(s) { return s.id === id; });
      if (direct) return id;
    }
    var commonName = candidate && typeof candidate === 'object'
      ? ((candidate.species_details && candidate.species_details.common_name) || '')
      : String(candidate || '');
    var sciName = candidate && typeof candidate === 'object'
      ? ((candidate.species_details && candidate.species_details.scientific_name) || '')
      : '';
    if (!commonName && !sciName) return null;
    var commonLower = commonName.toLowerCase();
    var sciLower = sciName.toLowerCase();
    var match = null;
    speciesRegistry.forEach(function(s) {
      if (match) return;
      if ((s.common_name || '').toLowerCase() === commonLower ||
          (s.scientific_name || '').toLowerCase() === sciLower ||
          (s.scientific_name || '').toLowerCase() === commonLower) {
        match = s;
      }
    });
    if (!match && commonLower) {
      speciesRegistry.forEach(function(s) {
        if (match) return;
        if ((s.common_name || '').toLowerCase().indexOf(commonLower) !== -1 ||
            (s.scientific_name || '').toLowerCase().indexOf(commonLower) !== -1) {
          match = s;
        }
      });
    }
    return match ? match.id : null;
  }

  function resolveSiteId(candidate) {
    // Prefer the STORED id. Re-deriving the site from the `focus_area` text would
    // ignore `site_id`, so the column could not be trusted and renaming
    // `sites.name` would silently orphan every linked record.
    var id = candidate && typeof candidate === 'object' ? candidate.site_id : null;
    if (id) {
      var direct = sites.find(function(s) { return s.id === id; });
      if (direct) return id;
    }
    var name = candidate && typeof candidate === 'object'
      ? ((candidate.location && candidate.location.focus_area) || '')
      : String(candidate || '');
    if (!name) return null;
    var lower = name.toLowerCase();
    var exact = sites.find(function(s) { return (s.name || '').toLowerCase() === lower; });
    if (exact) return exact.id;
    // Lenient fallback so two spellings of the campus resolve to the same site.
    // Without it those records vanish from the per-site charts.
    if (/nature park/.test(lower)) {
      var park = sites.find(function(s) { return /nature park/.test((s.name || '').toLowerCase()); });
      return park ? park.id : null;
    }
    if (/campus|copperbelt university/.test(lower)) {
      var campus = sites.find(function(s) { return /campus/.test((s.name || '').toLowerCase()); });
      return campus ? campus.id : null;
    }
    return null;
  }

  // Verified-data gate
  // Canonical rule: analytics/reports use Approved observations only.
  // Pending/Flagged are excluded unless explicitly requested in UI.
  function getVerifiedObservations() {
    return observations.filter(function(o) {
      return o.verification_status === 'Approved';
    });
  }

  // Baseline management (admin override of the derived default)
  function updateSpeciesBaseline(speciesId, value) {
    var entry = speciesRegistry.find(function(s) { return s.id === speciesId; });
    if (!entry) return null;
    entry.baseline_count = (value == null || value === '') ? null : Math.max(0, parseInt(value, 10) || 0);
    var session = _session;
    entry.baseline_updated_at = new Date().toISOString();
    entry.baseline_updated_by = (session && (session.email || session.id)) || null;
    saveSpeciesRegistry();
    return entry;
  }

  // Species-wide value is used for the Nature Park focus; this allows a
  // campus-specific population later.
  function updateSiteBaselineOverride(speciesId, siteId, value) {
    var entry = speciesRegistry.find(function(s) { return s.id === speciesId; });
    if (!entry) return null;
    entry.baseline_by_site = entry.baseline_by_site || {};
    if (value == null || value === '') {
      delete entry.baseline_by_site[siteId];
    } else {
      entry.baseline_by_site[siteId] = Math.max(0, parseInt(value, 10) || 0);
    }
    entry.baseline_updated_at = new Date().toISOString();
    var session = _session;
    entry.baseline_updated_by = (session && (session.email || session.id)) || null;
    saveSpeciesRegistry();
    return entry;
  }

  function saveSpeciesRegistry() {
    try { saveToStorage('speciesRegistry', speciesRegistry); } catch (e) { /* storage unavailable */ }
  }

  // Cloud seeding hook, called by BioSync.loadRegistries in lib/supabase-sync.js.
  // Replaces the local registries with the authoritative cloud rows, mapped into
  // the in-app shape.
  function seedRegistries(cloudSpecies, cloudSites) {
    if (Array.isArray(cloudSpecies)) {
      var newRegistry = cloudSpecies.map(function(row) {
        var entry = {
          id: row.id || '',
          scientific_name: row.scientific_name || '',
          common_name: row.common_name || '',
          taxon_type: row.taxon_type || (FLORA_SCIENTIFIC_NAMES[(row.scientific_name || '').toLowerCase()] ? 'flora' : 'fauna'),
          baseline_count: row.baseline_count != null ? row.baseline_count : null,
          baseline_updated_at: row.baseline_updated_at || null,
          baseline_updated_by: row.baseline_updated_by || null,
          conservation_status: row.conservation_status || null,
          baseline_by_site: row.baseline_by_site || null
        };
        return entry;
      });
      if (newRegistry.length > 0) {
        speciesRegistry = newRegistry;
        try { saveToStorage('speciesRegistry', speciesRegistry); } catch (e) { /* storage unavailable */ }
      }
    }
    if (Array.isArray(cloudSites)) {
      // Every column the app reads is copied here. A field left out of this map
      // is dropped silently, which is how `kind` went missing and left the zone
      // picker with nothing in it: the database rows carried the column, the
      // cache did not.
      var newSites = cloudSites.map(function(row) {
        return {
          id: row.id || '',
          name: row.name || '',
          // Without this the client falls back to the full ceremonial name.
          short_name: row.short_name || '',
          habitat_type_default: row.habitat_type_default || '',
          established: row.established || null,
          kind: row.kind || null,
          parent_site_id: row.parent_site_id || null,
          sort_order: row.sort_order == null ? null : row.sort_order,
          latitude: row.latitude == null ? null : row.latitude,
          longitude: row.longitude == null ? null : row.longitude
        };
      });
      if (newSites.length > 0) {
        sites = newSites;
        try { saveToStorage('sites', sites); } catch (e) { /* storage unavailable */ }
      }
    }
  }

  // TEXT NORMALIZATION: applied at the data layer so every page gets clean values.

  function titleCase(str) {
    if (str == null) return '';
    return String(str)
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map(function(word) {
        if (!word) return word;
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function sentenceCase(str) {
    if (str == null) return '';
    return String(str).replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, function(m) {
      return m.toUpperCase();
    });
  }

  // Proper binomial: genus capitalized, species lowercase, authorship stripped.
  function normalizeScientificName(str) {
    if (str == null) return '';
    var cleaned = String(str)
      .replace(/\([^)]*\)/g, ' ')   // drop parenthetical authorship
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ');
    var kept = [cleaned[0]];
    if (cleaned.length > 1 && /^[a-z]/.test(cleaned[1])) {
      kept.push(cleaned[1]);
    }
    return kept.map(function(part, i) {
      var lower = part.toLowerCase();
      if (i === 0 && lower) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    }).join(' ');
  }

  // Display fallback for GBIF-imported records that carry no vernacular name.
  var GBIF_COMMON_NAMES = {
    'apus affinis': 'Little Swift',
    'ardea cinerea': 'Grey Heron',
    'ardea melanocephala': 'Black-headed Heron',
    'atimastillas flavigula': 'Yellow-throated Leaflove',
    'bycanistes bucinator': 'Trumpeter Hornbill',
    'cecropis abyssinica': 'Lesser Striped Swallow',
    'cecropis senegalensis': 'West African Swallow',
    'centropus superciliosus': 'White-browed Coucal',
    'chalcomitra amethystina': 'Amethyst Sunbird',
    'chrysococcyx klaas': "Klaas's Cuckoo",
    'cinnyricinclus leucogaster': 'Violet-backed Starling',
    'cisticola woosnami': 'White-tailed Cisticola',
    'colius striatus': 'Speckled Mousebird',
    'columba livia': 'Rock Dove',
    'corvus albus': 'Pied Crow',
    'cossypha heuglini': 'White-browed Robin-Chat',
    'crithagra mozambica': 'Yellow-fronted Canary',
    'cypsiurus parvus': 'African Palm Swift',
    'dendropicos fuscescens': 'Cardinal Woodpecker',
    'dicrurus adsimilis': 'Fork-tailed Drongo',
    'dryoscopus cubla': 'Black-backed Puffback',
    'duranta erecta': 'Golden Dewdrop',
    'egretta garzetta': 'Little Egret',
    'elanus caeruleus': 'Black-winged Kite',
    'euplectes ardens': 'Red-collared Widowbird',
    'gymnoris superciliaris': 'Yellow-spotted Bush Sparrow',
    'hedydipna collaris': 'Collared Sunbird',
    'hirundo rustica': 'Barn Swallow',
    'hirundo smithii': 'Wire-tailed Swallow',
    'ipomoea cairica': 'Coast Morning Glory',
    'lagonosticta nitidula': 'Brown Firefinch',
    'lagonosticta rubricata': 'African Firefinch',
    'laniarius major': 'Tropical Boubou',
    'lybius torquatus': 'Black-collared Barbet',
    'melia azedarach': 'Chinaberry Tree',
    'merops pusillus': 'Little Bee-eater',
    'motacilla aguimp': 'African Pied Wagtail',
    'naja nigricollis': 'Black-necked Spitting Cobra',
    'oriolus auratus': 'African Golden Oriole',
    'passer domesticus': 'House Sparrow',
    'passer griseus': 'Grey-headed Sparrow',
    'phyllastrephus terrestris': 'Terrestrial Brownbul',
    'ploceus ocularis': 'Spectacled Weaver',
    'ploceus xanthops': "Holub's Golden Weaver",
    'pogoniulus chrysoconus': 'Yellow-fronted Tinkerbird',
    'pogonornis minor': 'Black-breasted Barbet',
    'prinia subflava': 'Tawny-flanked Prinia',
    'psammophis angolensis': 'Dwarf Sand Snake',
    'psidium guajava': 'Guava',
    'pycnonotus barbatus': 'Dark-capped Bulbul',
    'scopus umbretta': 'Hamerkop',
    'spermestes cucullata': 'Bronze Mannikin',
    'streptopelia semitorquata': 'Red-eyed Dove',
    'tauraco schalowi': "Schalow's Turaco",
    'terpsiphone viridis': 'African Paradise Flycatcher',
    'tithonia diversifolia': 'Mexican Sunflower',
    'turdus litsitsirupa': 'Groundscraper Thrush',
    'turtur chalcospilos': 'Emerald-spotted Wood Dove',
    'upupa epops': 'Common Hoopoe',
    'uraeginthus angolensis': 'Blue Waxbill',
    'urocolius indicus': 'Red-faced Mousebird',
    'zosterops anderssoni': 'Southern Yellow White-eye'
  };

  // Normalize the human-readable fields of an observation in place.
  function normalizeObservation(obs) {
    if (!obs) return obs;
    var sd = obs.species_details || (obs.species_details = {});
    var loc = obs.location || (obs.location = {});
    if (sd.scientific_name) sd.scientific_name = normalizeScientificName(sd.scientific_name);
    if (sd.common_name) {
      sd.common_name = titleCase(sd.common_name);
    } else if (sd.scientific_name) {
      var gbifCommon = GBIF_COMMON_NAMES[sd.scientific_name.toLowerCase()];
      if (gbifCommon) sd.common_name = gbifCommon;
    }
    if (obs.recorded_by) obs.recorded_by = titleCase(obs.recorded_by);
    if (obs.institution_name) obs.institution_name = titleCase(obs.institution_name);
    if (loc.city) loc.city = titleCase(loc.city);
    if (loc.focus_area) loc.focus_area = titleCase(loc.focus_area);
    if (loc.habitat_type) loc.habitat_type = titleCase(loc.habitat_type);
    if (loc.locality_description) loc.locality_description = sentenceCase(loc.locality_description);
    if (obs.field_notes) obs.field_notes = sentenceCase(obs.field_notes);
    return obs;
  }

  // LIVE STATE
  clearStaleStorage(); // discard stale biodata_* before loading
  var users = loadFromStorage('users', defaultUsers);
  var observations = loadFromStorage('observations', defaultObservations);

  // The survey plane and the Sourced Register live in memory only, refetched on
  // every load. Persisting them would add a second cache with its own staleness
  // problem for data that is small and cheap to fetch. No STORAGE_VERSION bump is
  // needed for this, and deliberately none was made: a bump would wipe every
  // local cache and force a re-login for a shape change that `lib/ecology.js`
  // already defaults its way through.
  var surveyPlane = { surveys: [], zones: [], vegetation: [], water: [], soil: [], sward: [] };
  var register = { parameters: [], values: [], relationships: [] };

  // Normalize existing records so field-officer input displays uniformly, and
  // legacy lowercase data is fixed on load.
  observations.forEach(function(obs) { normalizeObservation(obs); });
  saveToStorage('observations', observations);

  // SESSION MANAGEMENT
  // Bridges to the real Supabase Auth session when configured, falling back to
  // the legacy localStorage mock otherwise.
  var _session = loadFromStorage('session', null);
  var _supabaseProfileCache = null;

  // Map a Supabase user + profile row into the legacy session shape every page
  // understands. `role` stays null while the profile is unknown: the old
  // `|| 'field_officer'` fallback invented a role for a real person, which is how
  // an admin was labelled "Field Officer" in the dropdown. Unknown must stay
  // unknown, and the verified role is the route guard's, never this cache.
  function buildSessionFromAuth(sbUser, profile) {
    sbUser = sbUser || {};
    var metadata = sbUser.user_metadata || {};
    var fullName = (profile && profile.full_name) || metadata.full_name ||
      (profile && profile.email) || sbUser.email || '';
    return {
      id: sbUser.id || (profile && profile.id) || '',
      name: fullName,
      email: sbUser.email || (profile && profile.email) || '',
      role: (profile && profile.role) || null,
      institution_name: (profile && profile.institution_name) || '',
      loggedInAt: new Date().toISOString()
    };
  }

  // Synchronously reads supabase-js's persisted session so getSession() works on
  // first paint instead of waiting for the async client.
  function readSupabaseSessionSync() {
    try {
      if (typeof localStorage === 'undefined') return null;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k)) {
          var raw = localStorage.getItem(k);
          if (!raw) continue;
          var parsed = JSON.parse(raw);
          if (parsed && parsed.access_token) {
            // Decode the JWT payload to extract the user id (no deps).
            var payload = parsed.access_token.split('.')[1];
            if (!payload) continue;
            var json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
            parsed._user = {
              id: json.sub || '',
              email: json.email || '',
              user_metadata: json.user_metadata || {}
            };
            return parsed;
          }
        }
      }
    } catch (e) { /* ignore, fall back to legacy session */ }
    return null;
  }

  // Resolves the profile row so role/institution show correctly. Cached.
  function hydrateSupabaseProfile(sbUser) {
    if (!window.BioSupabase || !sbUser) return Promise.resolve(null);
    // Shared, cached fetch on BioSupabase: dedupes with auth-guard's profile lookup
    // so the current user's profile is fetched once per load.
    return window.BioSupabase.getProfile(sbUser.id).then(function(profile) {
      _supabaseProfileCache = profile || null;
      return _supabaseProfileCache;
    }).catch(function() {
      return null;
    });
  }

  /**
   * Adopt the guard's verified profile as this session's identity, so the dropdown
   * and Settings show the verified role on first paint instead of waiting for this
   * module's own background fetch. Display only: nothing here grants privilege from
   * a session, and the guard never reads the value back out.
   */
  function seedVerifiedProfile(profile) {
    if (!profile) return null;
    // Offline the guard downgrades the *privilege* to field officer on purpose.
    // That is a statement about what the app may do, not about who the person is,
    // so it is not adopted as identity: the persisted session keeps the last role
    // that was actually verified.
    if (profile._offlineCached) return _session;
    _supabaseProfileCache = profile;
    _session = buildSessionFromAuth({ id: profile.id, email: profile.email }, profile);
    saveToStorage('session', _session);
    publish('session:changed', _session);
    return _session;
  }

  function getSession() {
    if (window.BioSupabase && window.BioSupabase.isConfigured()) {
      var sb = readSupabaseSessionSync();
      if (sb && sb._user) {
        // Role may not be cached yet: hydrate in the background and update _session.
        // The `session:changed` publish matters because the shell has already mounted
        // by the time this resolves, so anything showing the role needs the nudge to
        // repaint or the pre-hydration value is what the user keeps.
        if (!_supabaseProfileCache) {
          hydrateSupabaseProfile(sb._user).then(function(profile) {
            if (profile) {
              _session = buildSessionFromAuth(sb._user, profile);
              saveToStorage('session', _session);
              publish('session:changed', _session);
            }
          });
        }
        var sessionForReturn = _session && _session.email === sb._user.email ? _session : null;
        if (!sessionForReturn) {
          sessionForReturn = buildSessionFromAuth(sb._user, _supabaseProfileCache);
        }
        return sessionForReturn;
      }
    }
    return _session;
  }

  function login(email, password) {
    if (window.BioSupabase && window.BioSupabase.isConfigured()) {
      return {
        success: false,
        error: 'Please use the sign-in form — real authentication is handled by Supabase.'
      };
    }

    // Legacy mock fallback (only used when Supabase is not configured).
    var user = users.find(function(u) { return u.email.toLowerCase() === email.toLowerCase(); });
    if (!user) {
      return { success: false, error: 'No account found with that email address.' };
    }

    var now = new Date();
    user.lastLogin = now.toISOString();

    _session = {
      name: user.name,
      email: user.email,
      role: user.role,
      institution_name: user.institution_name || '',
      loggedInAt: now.toISOString()
    };
    saveToStorage('session', _session);
    persist();

    var redirect;
    if (user.role === 'admin') {
      redirect = 'pages/admin/dashboard/dashboard.html';
    } else {
      redirect = 'pages/field-officer/field-officer.html';
    }

    return { success: true, user: user, redirect: redirect };
  }

  function logout() {
    // Always clear the local session cache so the UI logs out immediately.
    if (window.BioSupabase && window.BioSupabase.isConfigured()) {
      try { BioSupabase.signOut(); } catch (e) { /* ignore */ }
    }
    _session = null;
    _supabaseProfileCache = null;
    saveToStorage('session', null);
  }

  // Keeps the in-memory session in sync with client auth state changes.
  if (window.BioSupabase && window.BioSupabase.isConfigured() && window.BioSupabase.onAuthStateChange) {
    window.BioSupabase.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session && session.user) {
          hydrateSupabaseProfile(session.user).then(function(profile) {
            _session = buildSessionFromAuth(session.user, profile);
            saveToStorage('session', _session);
            publish('session:changed', _session);
          });
        }
      } else if (event === 'SIGNED_OUT') {
        _session = null;
        _supabaseProfileCache = null;
        saveToStorage('session', null);
        publish('session:changed', null);
      }
    });
  }

  // CROSS-TAB SESSION SYNC: one active session across all tabs of the origin.
  // The `storage` event fires only in tabs other than the writer, so there is no
  // loop. A session change elsewhere re-authenticates, so a Field Officer login
  // cannot take over an Admin tab.
  function redirectToLogin() {
    if (typeof window === 'undefined' || !window.location) return;
    var path = window.location.pathname;
    var parts = path.split('/').filter(Boolean);
    // Anchor the depth on the 'pages' segment: everything before it is the site
    // subpath (e.g. '/Zitbio/' on GitHub Pages) and must NOT be counted as a
    // folder, or we climb past the site root and land on the wrong page.
    var pagesIndex = -1;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === 'pages') { pagesIndex = i; break; }
    }
    var depth;
    if (pagesIndex !== -1) {
      depth = (parts.length - 1) - pagesIndex;
    } else {
      // Fallback: no 'pages' segment, so assume no subpath (local dev).
      depth = parts.length > 0 ? parts.length - 1 : 0;
    }
    var prefix = '';
    for (var j = 0; j < depth; j++) prefix += '../';
    window.location.href = prefix + 'index.html';
  }

  window.addEventListener('storage', function(e) {
    // saveToStorage prefixes keys with 'biodata_', so the raw
    // localStorage key (what the event reports) is 'biodata_session'.
    if (e.key !== 'biodata_session') return;
    var incoming = e.newValue === null ? 'null' : e.newValue;
    var current = JSON.stringify(_session);
    if (incoming === current) return;
    // Session changed in another tab; skip the redirect when already on login.
    var path = window.location.pathname;
    if (path.indexOf('index.html', path.length - 'index.html'.length) !== -1) return;
    redirectToLogin();
  });

  // COMPUTED HELPERS

  function totalUsers() { return users.length; }
  function totalObservations() { return observations.length; }

  function pendingObservations() {
    return observations.filter(function(obs) {
      return obs.verification_status === 'Pending';
    }).length;
  }

  function totalIndividuals() {
    return observations.reduce(function(total, obs) {
      return total + (Number(obs.count) || 0);
    }, 0);
  }

  function observationsLast7Days() {
    var now = new Date();
    var sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return observations.filter(function(obs) {
      var ts = new Date(obs.timestamp);
      return ts >= sevenDaysAgo && ts <= now;
    }).length;
  }

  function uniqueSpecies() {
    var speciesSet = {};
    observations.forEach(function(obs) {
      if (obs.species_details && obs.species_details.scientific_name) {
        speciesSet[obs.species_details.scientific_name] = true;
      }
    });
    return Object.keys(speciesSet).length;
  }

  function activeObservers() {
    var observerSet = {};
    observations.forEach(function(obs) { observerSet[obs.recorded_by] = true; });
    return Object.keys(observerSet).length;
  }

  function recentActivity(count) {
    count = count || 5;
    return observations.slice(0, count).map(function(obs) {
      var loc = obs.location || {};
      var city = loc.city || '';
      var province = loc.administrative_area || '';
      var locationStr = [city, province].filter(Boolean).join(', ') || loc.locality_description || '';
      return {
        // Through BioDate, not sliced: `split('T')[0]` took the raw UTC date, so a
        // 00:06 local submission showed the previous day. The fallback exists
        // because the login page loads this file but not lib/date.js.
        date: obs.timestamp
          ? (window.BioDate ? window.BioDate.mediumDate(obs.timestamp) : obs.timestamp.split('T')[0])
          : '',
        species: obs.species_details ? obs.species_details.common_name : '',
        location: locationStr,
        officer: obs.recorded_by
      };
    });
  }

  // USER CRUD (with persistence)

  function addUser(userData) {
    var maxId = 0;
    users.forEach(function(u) { if (u.id > maxId) maxId = u.id; });
    var newUser = {
      id: maxId + 1,
      name: userData.name,
      email: userData.email,
      role: userData.role || 'field_officer',
      institution_name: userData.institution_name || '',
      created: userData.created || (window.BioDate ? window.BioDate.mediumDate(new Date()) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })),
      lastLogin: null
    };
    users.push(newUser);
    persist();
    publish(eventNames.USER_CREATED, newUser);
    return newUser;
  }

  function deleteUser(id) {
    var idx = users.findIndex(function(u) { return u.id == id; });
    if (idx !== -1) {
      users.splice(idx, 1);
      persist();
      return true;
    }
    return false;
  }

  function getUserById(id) {
    return users.find(function(u) { return u.id == id; });
  }

  function getUserByEmail(email) {
    return users.find(function(u) { return u.email === email; });
  }

  function updateUser(id, updates) {
    var user = users.find(function(u) { return u.id == id; });
    if (!user) return null;
    if (updates.name !== undefined) user.name = updates.name;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.institution_name !== undefined) user.institution_name = updates.institution_name;
    persist();
    return user;
  }

  // OBSERVATION CRUD (with persistence)

  function addObservation(obs) {
    var maxId = 0;
    observations.forEach(function(o) {
      var num = parseInt(o.observation_id.replace('obs_', ''), 10) || 0;
      if (num > maxId) maxId = num;
    });

    var newObs = {
      observation_id: 'obs_' + padZero(maxId + 1, 6),
      count: obs.count || 0,
      verification_status: 'Pending',
      source: obs.source || 'field_observation',
      species_details: {
        scientific_name: (obs.species_details && obs.species_details.scientific_name) || '',
        common_name: (obs.species_details && obs.species_details.common_name) || ''
      },
      location: {
        latitude: (obs.location && obs.location.latitude) != null ? obs.location.latitude : null,
        longitude: (obs.location && obs.location.longitude) != null ? obs.location.longitude : null,
        country: (obs.location && obs.location.country) || 'Zambia',
        administrative_area: (obs.location && obs.location.administrative_area) || 'Copperbelt Province',
        city: (obs.location && obs.location.city) || 'Kitwe',
        focus_area: (obs.location && obs.location.focus_area) || null,
        habitat_type: (obs.location && obs.location.habitat_type) || '',
        locality_description: (obs.location && obs.location.locality_description) || ''
      },
      recorded_by: obs.recorded_by || '',
      timestamp: obs.timestamp || new Date().toISOString(),
      institution_name: obs.institution_name || 'The Copperbelt University',
      activity: obs.activity || '',
      field_notes: obs.field_notes || ''
    };
    normalizeObservation(newObs);
    // Optional analytics identifiers. Falls back to string matching when a
    // species/site is not in the registry yet, so older records keep working.
    newObs.species_id = resolveSpeciesId(newObs.species_details) || null;
    newObs.site_id = resolveSiteId(newObs.location) || null;
    observations.unshift(newObs);
    persist();
    publish(eventNames.OBSERVATION_CREATED, newObs);
    return newObs;
  }

  function deleteObservation(id) {
    var idx = observations.findIndex(function(o) { return o.observation_id === id; });
    if (idx !== -1) {
      observations.splice(idx, 1);
      persist();
      return true;
    }
    return false;
  }

  function getObservationById(id) {
    return observations.find(function(o) { return o.observation_id === id; }) || null;
  }

  function updateObservation(id, updates) {
    var idx = observations.findIndex(function(o) { return o.observation_id === id; });
    if (idx === -1) return null;
    var obs = observations[idx];
    if (updates.count != null) obs.count = updates.count;
    if (updates.activity != null) obs.activity = updates.activity;
    if (updates.verification_status != null) obs.verification_status = updates.verification_status;
    if (updates.source != null) obs.source = updates.source;
    if (updates.timestamp != null) obs.timestamp = updates.timestamp;
    if (updates.field_notes != null) obs.field_notes = updates.field_notes;
    if (updates.species_details) {
      obs.species_details = obs.species_details || {};
      if (updates.species_details.common_name != null) obs.species_details.common_name = updates.species_details.common_name;
      if (updates.species_details.scientific_name != null) obs.species_details.scientific_name = updates.species_details.scientific_name;
    }
    if (updates.location) {
      obs.location = obs.location || {};
      if (updates.location.latitude != null) obs.location.latitude = updates.location.latitude;
      if (updates.location.longitude != null) obs.location.longitude = updates.location.longitude;
      if (updates.location.country != null) obs.location.country = updates.location.country;
      if (updates.location.administrative_area != null) obs.location.administrative_area = updates.location.administrative_area;
      if (updates.location.city != null) obs.location.city = updates.location.city;
      if (updates.location.focus_area != null) obs.location.focus_area = updates.location.focus_area;
      if (updates.location.habitat_type != null) obs.location.habitat_type = updates.location.habitat_type;
      if (updates.location.locality_description != null) obs.location.locality_description = updates.location.locality_description;
    }
    normalizeObservation(obs);
    persist();
    return obs;
  }

  // GEOGRAPHIC REFERENCE DATA

  function getZambiaProvinces() {
    return zambiaProvinces.map(function(p) { return p.name; });
  }

  function getFocusAreas() {
    return focusAreas;
  }

  // Registry-backed focus-area label, so a displayed name can never drift from
  // the stored one. Unknown values pass through unchanged.
  function getSiteLabel(name, style) {
    var wanted = String(name == null ? '' : name);
    if (!wanted) return '';
    var match = sites.find(function(s) {
      return (s.name || '').toLowerCase() === wanted.toLowerCase();
    });
    if (!match) return wanted;
    return style === 'short' ? (match.short_name || match.name) : match.name;
  }

  function getReservesByProvince(provinceName) {
    var match = zambiaProvinces.find(function(p) {
      return p.name.toLowerCase() === provinceName.toLowerCase();
    });
    return match ? match.reserves : [];
  }

  // HABITAT SYSTEM: two canonical options app-wide, reduced from a free-form list.
  // The habitat is auto-selected from the focus area so officers never have to
  // reason about habitat types.
  var HABITAT_TYPES = [
    'Miombo Woodland',
    'Urban'
  ];

  function getHabitatForFocusArea(focusArea) {
    var name = String(focusArea || '').toLowerCase();
    if (name.indexOf('nature park') !== -1) {
      return HABITAT_TYPES[0];
    }
    return HABITAT_TYPES[1];
  }

  // RESET
  function reset() {
    users = JSON.parse(JSON.stringify(defaultUsers));
    observations = JSON.parse(JSON.stringify(defaultObservations));
    _session = null;
    localStorage.removeItem('biodata_users');
    localStorage.removeItem('biodata_observations');
    localStorage.removeItem('biodata_session');
  }

  // NOTIFICATIONS SYSTEM
  var notifications = loadFromStorage('notifications', []);
  var notificationIdCounter = loadFromStorage('notificationIdCounter', 0);

  function persistNotifications() {
    saveToStorage('notifications', notifications);
    saveToStorage('notificationIdCounter', notificationIdCounter);
  }

  function addNotification(type, title, message, link, relatedId) {
    notificationIdCounter++;
    var notification = {
      id: 'notif_' + notificationIdCounter,
      type: type,
      title: title,
      message: message,
      link: link || null,
      related_id: relatedId || null,
      created_at: new Date().toISOString(),
      read: false
    };
    notifications.unshift(notification);
    persistNotifications();
    return notification;
  }

  function getNotifications(options) {
    options = options || {};
    var unreadOnly = options.unread || false;
    var limit = options.limit || 0;
    var result = notifications;
    if (unreadOnly) {
      result = result.filter(function(n) { return !n.read; });
    }
    if (limit > 0) {
      result = result.slice(0, limit);
    }
    return result;
  }

  function getUnreadNotificationCount() {
    return notifications.filter(function(n) { return !n.read; }).length;
  }

  function markNotificationRead(id) {
    var idx = notifications.findIndex(function(n) { return n.id === id; });
    if (idx !== -1) {
      notifications[idx].read = true;
      persistNotifications();
      return true;
    }
    return false;
  }

  function markAllNotificationsRead() {
    notifications.forEach(function(n) { n.read = true; });
    persistNotifications();
  }

  function clearNotifications() {
    notifications = [];
    persistNotifications();
  }

  // Seeding runs once per browser, not once per page load: "seed when the list is
  // empty" re-seeded after every clear, so the entries could never be dismissed.
  // The flag shares the local store, so a STORAGE_VERSION bump resets it too.
  var seededNotifications = loadFromStorage('notificationsSeeded', false);

  function seedNotifications() {
    if (seededNotifications) return;
    seededNotifications = true;
    saveToStorage('notificationsSeeded', true);

    if (notifications.length > 0) return;

    observations.forEach(function(obs) {
      if (obs.verification_status === 'Pending') {
        var species = obs.species_details ? (obs.species_details.common_name || obs.species_details.scientific_name) : 'Unknown';
        var loc = obs.location ? (obs.location.focus_area || obs.location.administrative_area || '') : '';
        addNotification(
          'pending_observation',
          'Pending Observation',
          species + ' recorded by ' + obs.recorded_by + ' in ' + loc + ' needs review.',
          '../observations/observations.html?obs=' + obs.observation_id,
          obs.observation_id
        );
      }
    });

    observations.forEach(function(obs) {
      if (obs.verification_status === 'Flagged') {
        var species = obs.species_details ? (obs.species_details.common_name || obs.species_details.scientific_name) : 'Unknown';
        addNotification(
          'flagged_observation',
          'Flagged Observation',
          species + ' observation requires attention.',
          '../observations/observations.html?obs=' + obs.observation_id,
          obs.observation_id
        );
      }
    });
  }

  // Replace the survey plane with a fresh delivery. An empty survey list is
  // treated as "nothing arrived" rather than "there are no surveys", for the same
  // reason seedData does: RLS answers a read made without a session with an empty
  // array and no error, and adopting that would erase what the page already has.
  function seedSurveyPlane(plane) {
    plane = plane || {};
    if (Array.isArray(plane.surveys) && plane.surveys.length === 0) return surveyPlane;
    surveyPlane = {
      surveys: plane.surveys || [],
      zones: plane.zones || [],
      vegetation: plane.vegetation || [],
      water: plane.water || [],
      soil: plane.soil || [],
      sward: plane.sward || []
    };
    return surveyPlane;
  }

  // The Register is different from the survey plane: an empty vocabulary is a
  // meaningful answer, because parameters are names rather than measurements, so
  // this adopts whatever arrives.
  function seedRegister(next) {
    next = next || {};
    register = {
      parameters: next.parameters || [],
      values: next.values || [],
      relationships: next.relationships || []
    };
    return register;
  }

  function getSurveyPlane() { return surveyPlane; }
  function getRegister() { return register; }

  seedNotifications();

  // PUBLIC API

  return {
    // Session
    login: login,
    logout: logout,
    getSession: getSession,

    // Raw data
    getUsers: function() { return users; },
    getObservations: function() { return observations; },

    // Supabase sync hook: replaces the in-memory caches with authoritative data
    // fetched from the cloud (used by lib/supabase-sync.js on startup).
    seedData: function(seedUsers, seedObservations) {
      // RLS answers a read made without a session with an empty array and no error,
      // so an empty result means "nothing was delivered", not "the database is
      // empty". Adopting it would erase the only dataset an offline admin has, and
      // would persist that emptiness for the next reload.
      if (Array.isArray(seedObservations) && seedObservations.length > 0) {
        observations = seedObservations.map(function(o) { return normalizeObservation(o); });
        saveToStorage('observations', observations);
      }
      if (Array.isArray(seedUsers) && seedUsers.length > 0) {
        users = seedUsers;
        saveToStorage('users', users);
      }
    },

    // The survey plane and the Sourced Register, both held in memory only.
    seedSurveyPlane: seedSurveyPlane,
    seedRegister: seedRegister,
    getSurveyPlane: getSurveyPlane,
    getSurveys: function() { return surveyPlane.surveys; },
    getSurveyZones: function() { return surveyPlane.zones; },
    getSurveyReadings: function(surveyId) {
      if (surveyId == null) return surveyPlane;
      var wanted = String(surveyId);
      var mine = function(rows, key) {
        return (rows || []).filter(function(row) { return String(row[key]) === wanted; });
      };
      return {
        vegetation: mine(surveyPlane.vegetation, 'survey_id'),
        water: mine(surveyPlane.water, 'survey_id'),
        soil: mine(surveyPlane.soil, 'survey_id'),
        sward: mine(surveyPlane.sward, 'survey_id'),
        zones: mine(surveyPlane.zones, 'survey_id')
      };
    },
    getRegister: getRegister,
    getParameters: function() { return register.parameters; },
    getRegisterValues: function() { return register.values; },
    getSpeciesRelationships: function() { return register.relationships; },

    // Computed stats
    totalUsers: totalUsers,
    totalObservations: totalObservations,
    pendingObservations: pendingObservations,
    totalIndividuals: totalIndividuals,
    observationsLast7Days: observationsLast7Days,
    uniqueSpecies: uniqueSpecies,
    activeObservers: activeObservers,
    recentActivity: recentActivity,

    // User CRUD
    addUser: addUser,
    deleteUser: deleteUser,
    updateUser: updateUser,
    getUserById: getUserById,
    getUserByEmail: getUserByEmail,

    // Observation CRUD
    addObservation: addObservation,
    deleteObservation: deleteObservation,
    getObservationById: getObservationById,
    updateObservation: updateObservation,

    filterObservations: function(filters) {
        if (!filters) return observations.slice();
        return observations.filter(function(obs) {
            var loc = obs.location || {};
            var sd = obs.species_details || {};
            var ts = obs.timestamp ? new Date(obs.timestamp) : null;

            if (filters.dateFrom && ts) {
                var from = new Date(filters.dateFrom);
                if (ts < from) return false;
            }
            if (filters.dateTo && ts) {
                var to = new Date(filters.dateTo);
                to.setHours(23, 59, 59, 999);
                if (ts > to) return false;
            }
            if (filters.province) {
                if ((loc.administrative_area || '').toLowerCase() !== filters.province.toLowerCase()) return false;
            }
            if (filters.focusArea) {
                var fa = (loc.focus_area || '').toLowerCase();
                var want = filters.focusArea.toLowerCase();
                var isPark = /nature park/.test(fa);
                if (/nature park/.test(want)) {
                    if (!isPark) return false;
                } else {
                    // Campus / university bucket: campus focus areas plus the GBIF
                    // import, excluding the park. Mirrors the lenient matching in
                    // resolveSiteId() so every stored variant resolves to the bucket.
                    if (isPark) return false;
                    if (!/campus|copperbelt university/.test(fa)) return false;
                }
            }
            if (filters.status) {
                if ((obs.verification_status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
            }
            if (filters.species) {
                var q = filters.species.toLowerCase();
                var common = (sd.common_name || '').toLowerCase();
                var sci = (sd.scientific_name || '').toLowerCase();
                if (!common.includes(q) && !sci.includes(q)) return false;
            }
            if (filters.source) {
                if ((obs.source || '').toLowerCase() !== filters.source.toLowerCase()) return false;
            }
            return true;
        });
    },

    searchObservations: function(query, field) {
        if (!query || !query.trim()) return observations.slice();
        var q = query.toLowerCase().trim();
        return observations.filter(function(obs) {
            var sd = obs.species_details || {};
            var loc = obs.location || {};

            if (field === 'species') {
                return (sd.common_name || '').toLowerCase().includes(q) ||
                       (sd.scientific_name || '').toLowerCase().includes(q);
            }
            if (field === 'province') {
                return (loc.administrative_area || '').toLowerCase().includes(q);
            }
            if (field === 'officer') {
                return (obs.recorded_by || '').toLowerCase().includes(q);
            }
            if (field === 'institution') {
                return (obs.institution_name || '').toLowerCase().includes(q);
            }
            if (field === 'focus_area') {
                return (loc.focus_area || '').toLowerCase().includes(q);
            }

            var searchable = [
                sd.scientific_name || '',
                sd.common_name || '',
                loc.city || '',
                loc.administrative_area || '',
                loc.country || '',
                loc.habitat_type || '',
                loc.focus_area || '',
                obs.recorded_by || '',
                obs.institution_name || '',
                obs.source || '',
                obs.timestamp || ''
            ].join(' ').toLowerCase();
            return searchable.includes(q);
        });
    },

    // Species reference lookup
    lookupScientificName: lookupScientificName,
    getSpeciesReference: getSpeciesReference,
    // Curated ecological roles (research-backed) for the Ecosystem Insights report
    getSpeciesEcology: getSpeciesEcology,
    // Text normalization (used by the sync layer for cloud rows)
    normalizeObservation: normalizeObservation,

    // Species & Site registries (analytics layer)
    getSpeciesRegistry: function() { return speciesRegistry; },
    getSiteRegistry: function() { return sites; },
    resolveSpeciesId: resolveSpeciesId,
    resolveSiteId: resolveSiteId,
    getVerifiedObservations: getVerifiedObservations,
    updateSpeciesBaseline: updateSpeciesBaseline,
    updateSiteBaselineOverride: updateSiteBaselineOverride,
    seedRegistries: seedRegistries,

    // Pad helper
    padZero: padZero,

    // Verified identity adopted from the route guard
    seedVerifiedProfile: seedVerifiedProfile,

    // Display code for the current user's account (dropdown + Settings)
    formatAccountId: formatAccountId,

    // Geographic reference data
    getZambiaProvinces: getZambiaProvinces,
    getFocusAreas: getFocusAreas,
    getSiteLabel: getSiteLabel,
    getReservesByProvince: getReservesByProvince,

    // Habitat system (two canonical options)
    HABITAT_TYPES: HABITAT_TYPES,
    getHabitatForFocusArea: getHabitatForFocusArea,

    // Notifications
    addNotification: addNotification,
    getNotifications: getNotifications,
    getUnreadNotificationCount: getUnreadNotificationCount,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    clearNotifications: clearNotifications,

    // Event bus
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    publish: publish,
    eventNames: eventNames,

    // Admin
    reset: reset
  };

})();