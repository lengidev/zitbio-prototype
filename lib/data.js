/**
 * ZitBio — Unified Data Layer
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
  var STORAGE_VERSION = 5;
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
  // Current scope: Copperbelt Province only (single-site
  // deployment at The Copperbelt University campus).
  // =====================================================
  var zambiaProvinces = [
    { name: 'Copperbelt Province',  reserves: ['Chembe Bird Sanctuary', 'Mwekera National Forest'] }
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
    // --- Seed observations aligned to the research-documented park population ---
    // One record per park species at its actual population
    // (Plains Zebra 3 · Waterbuck 3 · Puku 5 · Impala 8 = 19 individuals).
    // Recording the full population per species keeps the low-population
    // warning estimate (mean of verified counts) equal to the research
    // baseline — no false warnings.
    {
      observation_id: 'obs_000001',
      count: 3,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Plains Zebra' },
      location: { latitude: -12.813, longitude: 28.215, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'Small herd grazing near the Park open field, 200m from main gate' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-10T07:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000002',
      count: 3,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Kobus ellipsiprymnus', common_name: 'Waterbuck' },
      location: { latitude: -12.816, longitude: 28.212, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'Near the stream crossing, browsing on riverine vegetation' },
      recorded_by: 'Wangu Ng\'ambi', timestamp: '2026-06-08T08:15:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000003',
      count: 5,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Kobus vardonii', common_name: 'Puku' },
      location: { latitude: -12.815, longitude: 28.211, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'Herd grazing on tender high-moisture grasses along the internal drainage channel' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-06T17:15:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000004',
      count: 8,
      verification_status: 'Approved',
      source: 'field_observation',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -12.814, longitude: 28.216, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', focus_area: 'The CBU Nature Park', habitat_type: 'Miombo Woodland', locality_description: 'Mixed herd moving through miombo woodland near the Park trail' },
      recorded_by: 'Emmanuel Chate', timestamp: '2026-06-03T06:45:00Z', institution_name: 'The Copperbelt University'
    }
  ];

  // =====================================================
  // SPECIES REFERENCE — Common Name → Scientific Name
  // Scoped to the CBU Nature Park inventory (research-verified):
  // managed ungulates + Miombo woodland flora. Aligned with
  // "CBU Nature Park Species Research.md".
  // =====================================================
  var speciesReference = {
    // Mammals — park managed ungulate assemblage (19 individuals, Sept 2023)
    'Plains Zebra': 'Equus quagga',
    'Zebra': 'Equus quagga',
    'Waterbuck': 'Kobus ellipsiprymnus',
    'Puku': 'Kobus vardonii',
    'Impala': 'Aepyceros melampus',

    // Flora — Miombo woodland strata (upper canopy → sub-canopy)
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
  // SPECIES & SITE REGISTRIES (analytics layer)
  // -----------------------------------------------------
  // Gap-1 fix from the analytics brief: species and sites
  // become first-class entities instead of free text. Old
  // observations keep their string fields; new ones also
  // carry species_id / site_id. Resolvers fall back to
  // string matching so existing localStorage data keeps
  // working untouched.
  // =====================================================

  // Keys are lowercased scientific names to match the lowercase lookup in
  // buildDefaultSpeciesRegistry (was previously title-cased, silently
  // classifying all flora as fauna).
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

  // Build the default species registry from the species reference +
  // seed observations. One entry per unique scientific name.
  //
  // Research-sourced park populations (CBU Nature Park, Sept 2023
  // translocation — see "CBU Nature Park Species Research.md") are seeded
  // as authoritative baselines for the low-population warning system. All
  // other species keep null (auto-derived).
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
        baseline_count: (PARK_BASELINES[key] != null ? PARK_BASELINES[key] : null), // research-sourced
        baseline_updated_at: null,
        baseline_updated_by: null,
        conservation_status: null,   // never fabricated
        baseline_by_site: null       // optional per-site override map
      });
      idCounter++;
    }

    // 1) Species actually present in the seed observations.
    defaultObservations.forEach(function(obs) {
      var sd = obs.species_details || {};
      addEntry(sd.common_name, sd.scientific_name);
    });

    // 2) Remaining reference species (full lookup table coverage).
    Object.keys(speciesReference).forEach(function(commonName) {
      addEntry(commonName, speciesReference[commonName]);
    });

    return registry;
  }

  function buildDefaultSites() {
    return [
      { id: 'site_001', name: 'The CBU Nature Park', habitat_type_default: 'Miombo Woodland', established: null },
      { id: 'site_002', name: 'CBU Campus', habitat_type_default: 'Urban', established: null }
    ];
  }

  // Registries are persisted so admin baseline edits survive refreshes,
  // mirroring how users/observations use loadFromStorage/saveToStorage.
  var speciesRegistry = loadFromStorage('speciesRegistry', buildDefaultSpeciesRegistry());
  var sites = loadFromStorage('sites', buildDefaultSites());

  // Defensive normalize of persisted registries (fills fields that may
  // be missing from older localStorage snapshots).
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
  });
  try { saveToStorage('sites', sites); } catch (e) { /* storage unavailable */ }

  // --- Resolvers (id-first with string fallback) -------------------

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
    // Partial match for approximations (e.g. "Zeb" → Plains Zebra).
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
    var name = candidate && typeof candidate === 'object'
      ? ((candidate.location && candidate.location.focus_area) || '')
      : String(candidate || '');
    if (!name) return null;
    var lower = name.toLowerCase();
    // Exact match first (e.g. 'The CBU Nature Park' → site_001, 'CBU Campus' → site_002).
    var exact = sites.find(function(s) { return (s.name || '').toLowerCase() === lower; });
    if (exact) return exact.id;
    // Lenient fallback so campus-style focus areas — the field-officer form
    // ('The Copperbelt University Campus') and the GBIF import
    // ('Copperbelt University') — resolve to the campus site, and nature-park
    // areas to the park site. Without this, those records were invisible in
    // the per-site charts/reports.
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

  // --- Verified-data gate (Gap-2 fix) ------------------------------
  // Canonical rule: analytics/reports use Approved observations only.
  // Pending/Flagged are excluded unless explicitly requested in UI.
  function getVerifiedObservations() {
    return observations.filter(function(o) {
      return o.verification_status === 'Approved';
    });
  }

  // --- Baseline management (admin override of derived default) -----
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

  // Optional per-site override. Species-wide value is used for the
  // Nature Park focus; this allows a campus-specific population later.
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

  // Cloud seeding hook — used by lib/supabase-sync.js (BioSync.loadRegistries)
  // to replace the local registries with the authoritative cloud rows while
  // preserving the in-app shape (flat species_registry/sites columns → legacy).
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
      var newSites = cloudSites.map(function(row) {
        return {
          id: row.id || '',
          name: row.name || '',
          habitat_type_default: row.habitat_type_default || '',
          established: row.established || null
        };
      });
      if (newSites.length > 0) {
        sites = newSites;
        try { saveToStorage('sites', sites); } catch (e) { /* storage unavailable */ }
      }
    }
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

  // Proper binomial — genus capitalized, species lowercase, author/year
  // stripped. Handles GBIF-style names with authorship:
  //   "Scopus umbretta Gmelin, 1789" / "Scopus umbretta (Gmelin, 1789)"
  //   → "Scopus umbretta". Plain names pass through unchanged.
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

  // Common names for GBIF-imported species (cleaned scientific → common).
  // Display fallback so records imported without a vernacular name still
  // show a friendly common name.
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
  // Supabase-aware: when BioSupabase is configured, the session is bridged to
  // the real Supabase Auth session so every existing page reads live data.
  // Falls back to the legacy localStorage mock when Supabase is unavailable.
  // =====================================================
  var _session = loadFromStorage('session', null);
  var _supabaseProfileCache = null;

  // Map a Supabase user + profile row into the legacy BioData session shape
  // that every page already understands ({ name, email, role, ... }).
  function buildSessionFromAuth(sbUser, profile) {
    var fullName = profile && profile.full_name
      ? profile.full_name
      : (sbUser.user_metadata && sbUser.user_metadata.full_name) || sbUser.email || '';
    return {
      name: fullName,
      email: sbUser.email || '',
      role: (profile && profile.role) || 'field_officer',
      institution_name: (profile && profile.institution_name) || '',
      loggedInAt: new Date().toISOString()
    };
  }

  // Synchronously read supabase-js's persisted session from localStorage so
  // getSession() works immediately on page load (supabase-js stores under
  // "sb-<project-ref>-auth-token"). Returns the raw object or null.
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
    } catch (e) { /* ignore — fall back to legacy session */ }
    return null;
  }

  // Asynchronously resolve the profile row for the current Supabase user so
  // role/institution show correctly. Cached after first success.
  function hydrateSupabaseProfile(sbUser) {
    if (!window.BioSupabase || !sbUser) return Promise.resolve(null);
    // Shared, cached fetch on BioSupabase — dedupes with auth-guard's profile
    // lookup so the current user's profile is fetched once per load.
    return window.BioSupabase.getProfile(sbUser.id).then(function(profile) {
      _supabaseProfileCache = profile || null;
      return _supabaseProfileCache;
    }).catch(function() {
      return null;
    });
  }

  function getSession() {
    // If Supabase is configured, prefer the real auth session.
    if (window.BioSupabase && window.BioSupabase.isConfigured()) {
      var sb = readSupabaseSessionSync();
      if (sb && sb._user) {
        // Role may not be cached yet — hydrate in background and update _session.
        if (!_supabaseProfileCache) {
          hydrateSupabaseProfile(sb._user).then(function(profile) {
            if (profile) {
              _session = buildSessionFromAuth(sb._user, profile);
              saveToStorage('session', _session);
            }
          });
        }
        // Use cached profile if available; otherwise use metadata-only session.
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
    // Real auth path: delegate to Supabase when configured.
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
    // End the real Supabase session when configured; always clear the local
    // session cache so the UI logs out immediately.
    if (window.BioSupabase && window.BioSupabase.isConfigured()) {
      try { BioSupabase.signOut(); } catch (e) { /* ignore */ }
    }
    _session = null;
    _supabaseProfileCache = null;
    saveToStorage('session', null);
  }

  // When Supabase is configured, keep the in-memory session in sync with auth
  // state changes (login/logout/token refresh) fired by the client.
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
    // Optional analytics identifiers (Gap-1). Falls back to string matching
    // when a species/site isn't in the registry yet. Older records keep
    // working without these — analytics resolves them on read.
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
  // HABITAT SYSTEM — two canonical options (app-wide)
  // Reduced from the previous free-form list to exactly two
  // habitats. The correct one is auto-selected from the focus
  // area, so officers never have to reason about habitat types.
  // =====================================================
  var HABITAT_TYPES = [
    'Miombo Woodland',
    'Urban'
  ];

  // Auto-select a habitat from a focus area:
  //   * focus area is the Nature Park  → park habitat
  //   * focus area is campus/anything → urban habitat
  function getHabitatForFocusArea(focusArea) {
    var name = String(focusArea || '').toLowerCase();
    if (name.indexOf('nature park') !== -1) {
      return HABITAT_TYPES[0];
    }
    return HABITAT_TYPES[1];
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

    // Supabase sync hook — replaces the in-memory caches with authoritative
    // data fetched from the cloud (used by lib/supabase-sync.js on startup).
    seedData: function(seedUsers, seedObservations) {
      if (Array.isArray(seedObservations)) {
        observations = seedObservations.map(function(o) { return normalizeObservation(o); });
        saveToStorage('observations', observations);
      }
      if (Array.isArray(seedUsers)) {
        users = seedUsers;
        saveToStorage('users', users);
      }
    },

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
                    // Nature Park bucket — any focus area containing 'nature park'.
                    if (!isPark) return false;
                } else {
                    // Campus / university bucket — campus focus areas plus the GBIF
                    // import ('Copperbelt University'), excluding the park. Mirrors
                    // the lenient matching in resolveSiteId() so every stored variant
                    // of the focus area resolves to the right bucket.
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

    // Pad helper (dependency-free replacement for String.padStart)
    padZero: padZero,

    // Geographic reference data
    getZambiaProvinces: getZambiaProvinces,
    getFocusAreas: getFocusAreas,
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