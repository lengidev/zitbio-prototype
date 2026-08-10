/**
 * BioMonitor — Unified Data Layer
 * Single source of truth for ALL application data.
 *
 * Schema v3.0 — Scoped to The Copperbelt University Campus.
 * Source field distinguishes field_observation from admin_entry.
 *
 * Why a unified layer?
 *   - Eliminates stale/copied data between admin and field-officer views.
 *   - Any page can subscribe to the same observation array and see updates
 *     immediately after a CRUD operation.
 *   - Offline-first: defaults are embedded so the app works without a network.
 *
 * Design decisions:
 *   - Notifications are seeded from existing observations on first load so
 *     admins see context immediately rather than an empty inbox.
 *   - speciesReference supports partial/case-insensitive matching because
 *     field officers frequently type approximations of common names.
 *   - source field is automatically determined by the submission pathway
 *     (field_officer form = 'field_observation', admin panel = 'admin_entry').
 */

window.BioData = (function() {
  // =====================================================
  // EVENT BUS
  // Data layer functions call publish(), and other modules
  // (like NotificationService) can subscribe() to listen.
  // =====================================================
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

  // =====================================================
  // localStorage persistence helpers
  // Persistence uses localStorage so data survives page refreshes
  // without requiring a backend. The 'biodata_' prefix prevents
  // collisions with other apps on the same domain.
  // =====================================================

  // Bump STORAGE_VERSION whenever the default data shape changes
  // (e.g., new user fields, re-seeded accounts). A mismatch means
  // the saved data is stale and would block newer accounts from
  // logging in, so we discard it and re-seed from defaults.
  var STORAGE_VERSION = 3;
  var STORAGE_VERSION_KEY = 'biodata_version';

  function clearStaleStorage() {
    try {
      var savedVersion = parseInt(localStorage.getItem(STORAGE_VERSION_KEY), 10);
      if (savedVersion === STORAGE_VERSION) return; // up to date — keep saved data
      // Stale or missing version: wipe all biodata_* keys and re-seed.
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('biodata_') === 0) keysToRemove.push(k);
      }
      keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
    } catch(e) { /* storage unavailable — fall back to in-memory defaults */ }
  }

  function loadFromStorage(key, fallback) {
    try {
      var parsedData = localStorage.getItem('biodata_' + key);
      if (parsedData) return JSON.parse(parsedData);
    } catch(e) { /* Corrupt or unparseable data — fall back to defaults */ }
    return fallback;
  }

  function saveToStorage(key, data) {
    try {
      localStorage.setItem('biodata_' + key, JSON.stringify(data));
    } catch(e) {
      // TODO: Issue #42 — Notify user when localStorage quota is exceeded so
      // they can clear space rather than losing data silently.
    }
  }

  function persist() {
    saveToStorage('users', users);
    saveToStorage('observations', observations);
  }

  // =====================================================
  // PAD HELPER
  // String.prototype.padStart (ES2017) throws on older
  // engines/webviews and can silently take down this file —
  // the whole app's foundation. This dependency-free
  // alternative works everywhere.
  // =====================================================
  function padZero(num, len) {
    var s = String(num);
    while (s.length < len) s = '0' + s;
    return s;
  }

  // =====================================================
  // DEFAULT DATA (fallback when no localStorage exists)
  // =====================================================
  var defaultUsers = [
    { id: 1, name: 'Lenganji Sinyangwe', email: 'lenganji@zitbio.org',   role: 'admin',         institution_name: 'The Copperbelt University', created: '1/15/2026',  lastLogin: null },
    { id: 2, name: 'Jeromy Ngoma',       email: 'jeromy@zitbio.org',      role: 'admin',         institution_name: 'The Copperbelt University', created: '1/15/2026',  lastLogin: null },
    { id: 3, name: 'Wangu Ng\'ambi',     email: 'wangu@zitbio.org',       role: 'field_officer', institution_name: 'The Copperbelt University', created: '2/1/2026',   lastLogin: null },
    { id: 4, name: 'Emmanuel Chate',     email: 'emmanuel@zitbio.org',    role: 'field_officer', institution_name: 'The Copperbelt University', created: '2/1/2026',   lastLogin: null }
  ];

  // =====================================================
  // ZAMBIA GEOGRAPHIC REFERENCE DATA
  // Current scope: Copperbelt Province only.
  // Full 10-province data preserved for future expansion.
  // =====================================================
  var zambiaProvinces = [
    { name: 'Central Province',     reserves: ['Blue Lagoon National Park', 'Kafue National Park (Central Sector)', 'Lukanga Swamps'] },
    { name: 'Copperbelt Province',  reserves: ['Chembe Bird Sanctuary', 'Mwekera National Forest'] },
    { name: 'Eastern Province',     reserves: ['South Luangwa National Park', 'Lukusuzi National Park', 'Luambe National Park'] },
    { name: 'Luapula Province',     reserves: ['Lusenga Plain National Park', 'Lake Bangweulu Wetlands', 'Isangano National Park'] },
    { name: 'Lusaka Province',      reserves: ['Lower Zambezi National Park', 'Lusaka National Park', 'Lochinvar National Park'] },
    { name: 'Muchinga Province',    reserves: ['North Luangwa National Park', 'Lavushi Manda National Park', 'Nsumbu National Park'] },
    { name: 'Northern Province',    reserves: ['Nsumbu National Park', 'Mweru Wantipa National Park', 'Kalambo Falls'] },
    { name: 'North-Western Province', reserves: ['West Lunga National Park', 'Zambezi Source National Forest', 'Jiwundu Swamp'] },
    { name: 'Southern Province',    reserves: ['Mosi-oa-Tunya National Park', 'Kafue National Park (South Sector)', 'Siavonga Game Management Area', 'Batoka Gorge'] },
    { name: 'Western Province',     reserves: ['Liuwa Plain National Park', 'Sioma Ngwezi National Park', 'Zambezi National Forest'] }
  ];

  // CBU Campus Focus Areas
  var focusAreas = [
    'The CBU Nature Park',
    'CBU Campus'
  ];

  // =====================================================
  // DEFAULT OBSERVATIONS — v3 schema
  // 10 records: 5 per field officer.
  // All scoped to The Copperbelt University Campus, Copperbelt Province.
  // Admins have zero recorded observations.
  // =====================================================
  var defaultObservations = [
    // --- Wangu Ng'ambi (5 observations) ---
    {
      observation_id: 'obs_000001',
      count: 7,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Plains Zebra' },
      location: { latitude: -12.813, longitude: 28.215, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Grassland', locality_description: 'Small herd grazing near the Park open field, 200m from main gate' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-10T07:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000002',
      count: 3,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.816, longitude: 28.212, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Riverine Forest', locality_description: 'Near the stream crossing, browsing on riverine vegetation' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-08T08:15:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000003',
      count: 1,
      verification_status: 'Pending',
      source: 'field_observation',
      species_details: { scientific_name: 'Crocodylus niloticus', common_name: 'Nile Crocodile' },
      location: { latitude: -12.818, longitude: 28.210, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'CBU Campus', habitat_type: 'Riverine Forest', locality_description: 'Medium-sized crocodile basking on stream bank near the basketball court' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-05T14:00:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000004',
      count: 12,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.814, longitude: 28.216, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Woodland', locality_description: 'Mixed herd moving through miombo woodland near the Park trail' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-03T06:45:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000005',
      count: 1,
      verification_status: 'Flagged',
      source: 'field_observation',
      species_details: { scientific_name: 'Varanus niloticus', common_name: 'Nile Monitor Lizard' },
      location: { latitude: -12.815, longitude: 28.213, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'CBU Campus', habitat_type: 'Riverine Forest', locality_description: 'Large monitor lizard crossing footpath near the stream, appeared to be ~1.5m length' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-01T10:30:00Z', institution_name: 'The Copperbelt University'
    },

    // --- Emmanuel Chate (5 observations) ---
    {
      observation_id: 'obs_000006',
      count: 5,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Plains Zebra' },
      location: { latitude: -12.812, longitude: 28.214, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'CBU Campus', habitat_type: 'Grassland', locality_description: 'Zebra near the campus sports field, grazing on short grass early morning' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-09T07:00:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000007',
      count: 2,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Tragelaphus scriptus', common_name: 'Bushbuck' },
      location: { latitude: -12.817, longitude: 28.211, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Woodland', locality_description: 'Pair of bushbuck in thicket near the Park western boundary' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-07T16:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000008',
      count: 4,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.813, longitude: 28.215, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Woodland', locality_description: 'Small herd near the miombo tree line, late afternoon movement' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-06T17:15:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000009',
      count: 1,
      verification_status: 'Pending',
      source: 'field_observation',
      species_details: { scientific_name: 'Ardea goliath', common_name: 'Goliath Heron' },
      location: { latitude: -12.818, longitude: 28.212, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'CBU Campus', habitat_type: 'Riverine Forest', locality_description: 'Standing at stream edge, fishing. Observed for ~20 minutes near basketball court' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-04T09:20:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000010',
      count: 1,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Sylvicapra grimmia', common_name: 'Common Duiker' },
      location: { latitude: -12.814, longitude: 28.217, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Woodland', locality_description: 'Single duiker darting into undergrowth near the northern woodland patch' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-02T06:10:00Z', institution_name: 'The Copperbelt University'
    }
  ];

  // =====================================================
  // SPECIES REFERENCE — Common Name → Scientific Name
  // Scoped to CBU Campus and Nature Park species.
  // Birds are provisional — see [[futureupdates]].
  // =====================================================
  var speciesReference = {
    // Mammals
    'Plains Zebra': 'Equus quagga',
    'Zebra': 'Equus quagga',
    'Waterbuck': 'Kobus ellipsiprymnus',
    'Impala': 'Aepyceros melampus',
    'Bushbuck': 'Tragelaphus scriptus',
    'Common Duiker': 'Sylvicapra grimmia',
    'Duiker': 'Sylvicapra grimmia',

    // Reptiles
    'Nile Crocodile': 'Crocodylus niloticus',
    'Crocodile': 'Crocodylus niloticus',
    'Nile Monitor Lizard': 'Varanus niloticus',
    'Monitor Lizard': 'Varanus niloticus',

    // Birds (provisional — pending verification)
    'African Fish Eagle': 'Haliaeetus vocifer',
    'Fish Eagle': 'Haliaeetus vocifer',
    'Grey Crowned Crane': 'Balearica regulorum',
    'Crane': 'Balearica regulorum',
    'Woodland Kingfisher': 'Halcyon senegalensis',
    'Kingfisher': 'Halcyon senegalensis',
    'White-backed Vulture': 'Gyps africanus',
    'Vulture': 'Gyps africanus',
    'Goliath Heron': 'Ardea goliath',
    'Heron': 'Ardea goliath',

    // Flora
    'Miombo Tree': 'Brachystegia spiciformis',
    'Munali Tree': 'Julbernardia paniculata',
    'Couch Grass': 'Cynodon dactylon'
  };

  /**
   * Attempts to find a scientific name based on a common name string.
   * Supports case-insensitive and partial matches to assist field officers
   * who may only know part of a species name.
   *
   * @param {string} commonName - The user-provided common name.
   * @returns {string|null} The scientific name, or null if no match is found.
   */
  function lookupScientificName(commonName) {
    if (!commonName) return null;
    var normalized = commonName.trim();
    // Direct match — fastest path
    if (speciesReference[normalized]) return speciesReference[normalized];
    // Case-insensitive exact match
    var lower = normalized.toLowerCase();
    var keys = Object.keys(speciesReference);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === lower) return speciesReference[keys[i]];
    }
    // Partial match (e.g., typing "Buffalo" matches "African Buffalo")
    for (var j = 0; j < keys.length; j++) {
      if (keys[j].toLowerCase().includes(lower)) return speciesReference[keys[j]];
    }
    return null;
  }

  function getSpeciesReference() {
    return speciesReference;
  }

  // =====================================================
  // TEXT NORMALIZATION
  // Applied at the data layer so field-officer input displays
  // uniformly across every page (tables, modals, map popups,
  // notifications, dashboard). All readers get clean values.
  // =====================================================

  // Title case — capitalize the first letter of each word.
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

  // Sentence case — capitalize the first letter of each sentence.
  function sentenceCase(str) {
    if (str == null) return '';
    return String(str).replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, function(m) {
      return m.toUpperCase();
    });
  }

  // Proper binomial — genus capitalized, species lowercase
  // ("equus quagga" / "EQUUS QUAGGA" → "Equus quagga").
  function normalizeScientificName(str) {
    if (str == null) return '';
    var parts = String(str).replace(/\s+/g, ' ').trim().split(' ');
    return parts.map(function(part, i) {
      var lower = part.toLowerCase();
      if (i === 0 && lower) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      return lower;
    }).join(' ');
  }

  // Normalize the human-readable fields of an observation in place.
  function normalizeObservation(obs) {
    if (!obs) return obs;
    var sd = obs.species_details || (obs.species_details = {});
    var loc = obs.location || (obs.location = {});
    if (sd.common_name) sd.common_name = titleCase(sd.common_name);
    if (sd.scientific_name) sd.scientific_name = normalizeScientificName(sd.scientific_name);
    if (obs.recorded_by) obs.recorded_by = titleCase(obs.recorded_by);
    if (obs.institution_name) obs.institution_name = titleCase(obs.institution_name);
    if (loc.city) loc.city = titleCase(loc.city);
    if (loc.focus_area) loc.focus_area = titleCase(loc.focus_area);
    if (loc.habitat_type) loc.habitat_type = titleCase(loc.habitat_type);
    if (loc.locality_description) loc.locality_description = sentenceCase(loc.locality_description);
    if (obs.field_notes) obs.field_notes = sentenceCase(obs.field_notes);
    return obs;
  }

  // =====================================================
  // LIVE STATE — loaded from localStorage or defaults
  // =====================================================
  clearStaleStorage(); // discard stale biodata_* before loading
  var users = loadFromStorage('users', defaultUsers);
  var observations = loadFromStorage('observations', defaultObservations);

  // Normalize existing records so field-officer input displays
  // uniformly everywhere (also fixes legacy lowercase data).
  observations.forEach(function(obs) { normalizeObservation(obs); });
  saveToStorage('observations', observations);

  // =====================================================
  // SESSION MANAGEMENT
  // =====================================================
  var _session = loadFromStorage('session', null);

  function getSession() {
    return _session;
  }

  function login(email, password) {
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
    _session = null;
    saveToStorage('session', null);
  }

  // =====================================================
  // CROSS-TAB SESSION SYNC
  // Enforces a single active session across all tabs of
  // the same origin (Issue #34). The browser fires the
  // `storage` event ONLY in tabs OTHER than the one that
  // wrote, so the writing tab never triggers itself — no
  // loop. When the shared session changes elsewhere, this
  // tab re-authenticates to prevent privilege confusion
  // (e.g. a Field Officer login taking over an Admin tab).
  // =====================================================
  function redirectToLogin() {
    if (typeof window === 'undefined' || !window.location) return;
    var path = window.location.pathname;
    var parts = path.split('/').filter(Boolean);
    // Anchor the depth on the 'pages' segment. Everything before it is the
    // site subpath (e.g. '/Zitbio/' on GitHub Pages) and must NOT be counted
    // as a folder — otherwise we climb past the site root and land on the
    // wrong page. Every app page lives under 'pages/'.
    var pagesIndex = -1;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === 'pages') { pagesIndex = i; break; }
    }
    var depth;
    if (pagesIndex !== -1) {
      depth = (parts.length - 1) - pagesIndex;
    } else {
      // Fallback: no 'pages' segment — assume no subpath (local dev).
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
    if (incoming === current) return; // session unchanged for this tab
    // Session changed (login or logout) in another tab.
    // Already on the login page? Nothing to do.
    var path = window.location.pathname;
    if (path.indexOf('index.html', path.length - 'index.html'.length) !== -1) return;
    redirectToLogin();
  });

  // =====================================================
  // COMPUTED HELPERS
  // =====================================================

  function totalUsers() { return users.length; }
  function totalObservations() { return observations.length; }

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
        date: obs.timestamp ? obs.timestamp.split('T')[0] : '',
        species: obs.species_details ? obs.species_details.common_name : '',
        location: locationStr,
        officer: obs.recorded_by
      };
    });
  }

  // =====================================================
  // USER CRUD (with persistence)
  // =====================================================

  function addUser(userData) {
    var maxId = 0;
    users.forEach(function(u) { if (u.id > maxId) maxId = u.id; });
    var newUser = {
      id: maxId + 1,
      name: userData.name,
      email: userData.email,
      role: userData.role || 'field_officer',
      institution_name: userData.institution_name || '',
      created: userData.created || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }),
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

  // =====================================================
  // OBSERVATION CRUD (with persistence)
  // =====================================================

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

  // =====================================================
  // GEOGRAPHIC REFERENCE DATA — public access
  // =====================================================

  function getZambiaProvinces() {
    return zambiaProvinces.map(function(p) { return p.name; });
  }

  function getFocusAreas() {
    return focusAreas;
  }

  function getReservesByProvince(provinceName) {
    var match = zambiaProvinces.find(function(p) {
      return p.name.toLowerCase() === provinceName.toLowerCase();
    });
    return match ? match.reserves : [];
  }

  // =====================================================
  // RESET (clear localStorage, restore defaults)
  // =====================================================
  function reset() {
    users = JSON.parse(JSON.stringify(defaultUsers));
    observations = JSON.parse(JSON.stringify(defaultObservations));
    _session = null;
    localStorage.removeItem('biodata_users');
    localStorage.removeItem('biodata_observations');
    localStorage.removeItem('biodata_session');
  }

  // =====================================================
  // NOTIFICATIONS SYSTEM
  // =====================================================
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

  function seedNotifications() {
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

  seedNotifications();

  // =====================================================
  // PUBLIC API
  // =====================================================

  return {
    // Session
    login: login,
    logout: logout,
    getSession: getSession,

    // Raw data
    getUsers: function() { return users; },
    getObservations: function() { return observations; },

    // Computed stats
    totalUsers: totalUsers,
    totalObservations: totalObservations,
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

    // Pad helper (dependency-free replacement for String.padStart)
    padZero: padZero,

    // Geographic reference data
    getZambiaProvinces: getZambiaProvinces,
    getFocusAreas: getFocusAreas,
    getReservesByProvince: getReservesByProvince,

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