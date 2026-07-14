/**
 * BioMonitor — Unified Data Layer
 * Single source of truth for ALL application data.
 *
 * Schema v2.0 — Structured nested fields for species, location, and metadata.
 * Designed so every page reads from the same in-memory store, with
 * localStorage used only for persistence — never as the primary data source.
 *
 * Why a unified layer?
 *   - Eliminates stale/copied data between admin and field-officer views.
 *   - Any page can subscribe to the same observation array and see updates
 *     immediately after a CRUD operation.
 *   - Offline-first: defaults are embedded so the app works without a network.
 *
 * External reference for protected-area data:
 *   Zambia DNPW (Department of National Parks and Wildlife) — 2025 revision
 *   https://www.zawa.org.zm/protected-areas
 *
 * Design decisions:
 *   - Notifications are seeded from existing observations on first load so
 *     admins see context immediately rather than an empty inbox.
 *   - speciesReference supports partial/case-insensitive matching because
 *     field officers frequently type approximations of common names.
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
  // DEFAULT DATA (fallback when no localStorage exists)
  // =====================================================
  var defaultUsers = [
    { id: 1,  name: 'Sarah Chen',    email: 'sarah.chen@biodiversity.org',    role: 'admin',         institution_name: 'Wildlife Conservation Trust',  created: '11/15/2025', lastLogin: null },
    { id: 2,  name: 'James Wilson',  email: 'james.wilson@biodiversity.org',  role: 'field_officer', institution_name: 'Wildlife Conservation Trust',  created: '12/1/2025',  lastLogin: null },
    { id: 3,  name: 'Maria Garcia',  email: 'maria.garcia@biodiversity.org',  role: 'field_officer', institution_name: 'Wildlife Conservation Trust',  created: '12/10/2025', lastLogin: null },
    { id: 4,  name: 'David Kim',     email: 'david.kim@biodiversity.org',     role: 'field_officer', institution_name: 'Zambia Wildlife Authority',      created: '1/5/2026',   lastLogin: null },
    { id: 5,  name: 'Aisha Patel',   email: 'aisha.patel@biodiversity.org',   role: 'field_officer', institution_name: 'Zambia Wildlife Authority',      created: '1/20/2026',  lastLogin: null },
    { id: 6,  name: 'Carlos Mbeki',  email: 'carlos.mbeki@biodiversity.org',  role: 'field_officer', institution_name: 'The Copperbelt University',        created: '2/10/2026',  lastLogin: null },
    { id: 7,  name: 'Elena Volkov',  email: 'elena.volkov@biodiversity.org',  role: 'admin',         institution_name: 'The Copperbelt University',        created: '12/5/2025',  lastLogin: null },
    { id: 8,  name: 'Kwame Asante',  email: 'kwame.asante@biodiversity.org',  role: 'field_officer', institution_name: 'Zambia Wildlife Authority',      created: '3/1/2026',   lastLogin: null }
  ];

  // =====================================================
  // ZAMBIA GEOGRAPHIC REFERENCE DATA
  // =====================================================
  var zambiaProvinces = [
    {
      name: 'Central Province',
      reserves: ['Blue Lagoon National Park', 'Kafue National Park (Central Sector)', 'Lukanga Swamps']
    },
    {
      name: 'Copperbelt Province',
      reserves: ['Kafue National Park (North Sector)', 'Chembe Bird Sanctuary', 'Mwekera National Forest']
    },
    {
      name: 'Eastern Province',
      reserves: ['South Luangwa National Park', 'Lukusuzi National Park', 'Luambe National Park']
    },
    {
      name: 'Luapula Province',
      reserves: ['Lusenga Plain National Park', 'Lake Bangweulu Wetlands', 'Isangano National Park']
    },
    {
      name: 'Lusaka Province',
      reserves: ['Lower Zambezi National Park', 'Lusaka National Park', 'Lochinvar National Park']
    },
    {
      name: 'Muchinga Province',
      reserves: ['North Luangwa National Park', 'Lavushi Manda National Park', 'Nsumbu National Park']
    },
    {
      name: 'Northern Province',
      reserves: ['Nsumbu National Park', 'Mweru Wantipa National Park', 'Kalambo Falls']
    },
    {
      name: 'North-Western Province',
      reserves: ['West Lunga National Park', 'Zambezi Source National Forest', 'Jiwundu Swamp']
    },
    {
      name: 'Southern Province',
      reserves: ['Mosi-oa-Tunya National Park', 'Kafue National Park (South Sector)', 'Siavonga Game Management Area', 'Batoka Gorge']
    },
    {
      name: 'Western Province',
      reserves: ['Liuwa Plain National Park', 'Sioma Ngwezi National Park', 'Zambezi National Forest']
    }
  ];

  // =====================================================
  // DEFAULT OBSERVATIONS — v2 schema
  // =====================================================
  var defaultObservations = [
    // ====================================================================
    // 40 RECORDS — ZAMBIA ONLY (4 per province × 10 provinces)
    // ====================================================================

    // --- Central Province (4) ---
    {
      observation_id: 'obs_000001',
      count: 23,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Kobus leche', common_name: 'Red Lechwe' },
      location: { latitude: -14.350, longitude: 27.180, country: 'Zambia', administrative_area: 'Central Province', city: 'Mumbwa', protected_area: 'Blue Lagoon National Park', habitat_type: 'Wetland', locality_description: 'Floodplain marsh grazing herd near main lagoon' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-28T06:30:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000002',
      count: 8,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Hippopotamus amphibius', common_name: 'Hippopotamus' },
      location: { latitude: -14.420, longitude: 27.250, country: 'Zambia', administrative_area: 'Central Province', city: 'Mumbwa', protected_area: 'Lukanga Swamps', habitat_type: 'Wetland', locality_description: 'Pod of hippos in deep channel near eastern bank' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-25T08:15:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000003',
      count: 2,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Haliaeetus vocifer', common_name: 'African Fish Eagle' },
      location: { latitude: -14.380, longitude: 27.210, country: 'Zambia', administrative_area: 'Central Province', city: 'Chibombo', protected_area: 'Kafue National Park (Central Sector)', habitat_type: 'Riverine Forest', locality_description: 'Perched on dead tree overlooking Kafue River' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-05-22T11:00:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000004',
      count: 31,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Syncerus caffer', common_name: 'African Buffalo' },
      location: { latitude: -14.500, longitude: 27.350, country: 'Zambia', administrative_area: 'Central Province', city: 'Kabwe', protected_area: null, habitat_type: 'Grassland', locality_description: 'Large herd crossing the M9 road towards Lukanga' },
      recorded_by: 'David Kim', timestamp: '2026-05-18T16:45:00Z', institution_name: 'Zambia Wildlife Authority'
    },

    // --- Copperbelt Province (4) ---
    {
      observation_id: 'obs_000005',
      count: 42,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Brachystegia spiciformis', common_name: 'Miombo Tree' },
      location: { latitude: -12.810, longitude: 28.210, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', protected_area: 'Mwekera National Forest', habitat_type: 'Woodland', locality_description: 'Mature miombo stand 2km from Mwekera main gate' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-06-01T07:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000006',
      count: 5,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Cercopithecus mitis', common_name: 'Blue Monkey' },
      location: { latitude: -12.822, longitude: 28.230, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', protected_area: 'Chembe Bird Sanctuary', habitat_type: 'Riverine Forest', locality_description: 'Troop feeding near Chembe shore, Riverside suburb' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-28T14:20:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000007',
      count: 1,
      verification_status: 'Flagged',
      species_details: { scientific_name: 'Panthera leo', common_name: 'Lion' },
      location: { latitude: -12.840, longitude: 28.225, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', protected_area: 'Kafue National Park (North Sector)', habitat_type: 'Savanna', locality_description: 'Single male tracked near Kafue River tributary' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-15T06:10:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000008',
      count: 3,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Halcyon senegalensis', common_name: 'Woodland Kingfisher' },
      location: { latitude: -12.812, longitude: 28.185, country: 'Zambia', administrative_area: 'Copperbelt Province', city: 'Kitwe', protected_area: null, habitat_type: 'Woodland', locality_description: 'Perched on power line near CBU campus entrance' },
      recorded_by: 'James Wilson', timestamp: '2026-06-03T08:45:00Z', institution_name: 'Wildlife Conservation Trust'
    },

    // --- Eastern Province (4) ---
    {
      observation_id: 'obs_000009',
      count: 1,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Panthera pardus', common_name: 'Leopard' },
      location: { latitude: -13.050, longitude: 31.800, country: 'Zambia', administrative_area: 'Eastern Province', city: 'Mfuwe', protected_area: 'South Luangwa National Park', habitat_type: 'Riverine Forest', locality_description: 'Resting in large ebony tree near Luangwa River bend' },
      recorded_by: 'James Wilson', timestamp: '2026-05-30T17:30:00Z', institution_name: 'Wildlife Conservation Trust'
    },
    {
      observation_id: 'obs_000010',
      count: 7,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Giraffa camelopardalis thornicrofti', common_name: "Thornicroft's Giraffe" },
      location: { latitude: -13.120, longitude: 31.850, country: 'Zambia', administrative_area: 'Eastern Province', city: 'Mfuwe', protected_area: 'South Luangwa National Park', habitat_type: 'Savanna', locality_description: 'Browsing acacia near Lion Plain, Sector A3' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-29T10:15:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000011',
      count: 4,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Lycaon pictus', common_name: 'African Wild Dog' },
      location: { latitude: -13.080, longitude: 31.780, country: 'Zambia', administrative_area: 'Eastern Province', city: 'Mfuwe', protected_area: 'South Luangwa National Park', habitat_type: 'Savanna', locality_description: 'Pack of 4 spotted near Chibembe airstrip' },
      recorded_by: 'David Kim', timestamp: '2026-05-26T06:00:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000012',
      count: 2,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Crocodylus niloticus', common_name: 'Nile Crocodile' },
      location: { latitude: -12.900, longitude: 32.150, country: 'Zambia', administrative_area: 'Eastern Province', city: 'Chipata', protected_area: 'Lukusuzi National Park', habitat_type: 'Wetland', locality_description: 'Large crocs basking on sandbank in Lukusuzi River' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-05-20T11:30:00Z', institution_name: 'The Copperbelt University'
    },

    // --- Luapula Province (4) ---
    {
      observation_id: 'obs_000013',
      count: 3,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Tragelaphus spekii', common_name: 'Sitatunga' },
      location: { latitude: -9.850, longitude: 28.600, country: 'Zambia', administrative_area: 'Luapula Province', city: 'Samfya', protected_area: 'Lusenga Plain National Park', habitat_type: 'Wetland', locality_description: 'Wading through papyrus reed beds at dawn' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-27T05:45:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000014',
      count: 1,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Balaeniceps rex', common_name: 'Shoebill' },
      location: { latitude: -9.720, longitude: 28.550, country: 'Zambia', administrative_area: 'Luapula Province', city: 'Samfya', protected_area: 'Lake Bangweulu Wetlands', habitat_type: 'Wetland', locality_description: 'Standing motionless in tall reeds, eastern marsh section' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-23T09:00:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000015',
      count: 6,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Loxodonta africana', common_name: 'African Elephant' },
      location: { latitude: -9.680, longitude: 28.520, country: 'Zambia', administrative_area: 'Luapula Province', city: 'Mansa', protected_area: 'Isangano National Park', habitat_type: 'Grassland', locality_description: 'Family herd crossing open plain towards woodland fringe' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-19T15:30:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000016',
      count: 14,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Kobus leche smithemani', common_name: 'Black Lechwe' },
      location: { latitude: -9.750, longitude: 28.580, country: 'Zambia', administrative_area: 'Luapula Province', city: 'Samfya', protected_area: null, habitat_type: 'Wetland', locality_description: 'Herd grazing on floating grass mats near Bangweulu shore' },
      recorded_by: 'David Kim', timestamp: '2026-05-17T07:20:00Z', institution_name: 'Zambia Wildlife Authority'
    },

    // --- Lusaka Province (4) ---
    {
      observation_id: 'obs_000017',
      count: 12,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Loxodonta africana', common_name: 'African Elephant' },
      location: { latitude: -15.600, longitude: 29.400, country: 'Zambia', administrative_area: 'Lusaka Province', city: 'Chirundu', protected_area: 'Lower Zambezi National Park', habitat_type: 'Riverine Forest', locality_description: 'Herd drinking at Zambezi River edge opposite Mana Pools' },
      recorded_by: 'James Wilson', timestamp: '2026-05-31T07:00:00Z', institution_name: 'Wildlife Conservation Trust'
    },
    {
      observation_id: 'obs_000018',
      count: 3,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Panthera leo', common_name: 'Lion' },
      location: { latitude: -15.550, longitude: 29.350, country: 'Zambia', administrative_area: 'Lusaka Province', city: 'Chirundu', protected_area: 'Lower Zambezi National Park', habitat_type: 'Savanna', locality_description: 'Pride resting under winterthorn trees near Jeki Camp' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-28T16:45:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000019',
      count: 9,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Equus quagga', common_name: 'Plains Zebra' },
      location: { latitude: -15.480, longitude: 28.350, country: 'Zambia', administrative_area: 'Lusaka Province', city: 'Lusaka', protected_area: 'Lusaka National Park', habitat_type: 'Grassland', locality_description: 'Herd grazing in open area near park headquarters' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-24T10:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000020',
      count: 4,
      verification_status: 'Flagged',
      species_details: { scientific_name: 'Struthio camelus', common_name: 'Common Ostrich' },
      location: { latitude: -15.500, longitude: 28.370, country: 'Zambia', administrative_area: 'Lusaka Province', city: 'Lusaka', protected_area: 'Lochinvar National Park', habitat_type: 'Grassland', locality_description: 'Pair with juveniles near northern floodplain boundary' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-21T13:15:00Z', institution_name: 'Zambia Wildlife Authority'
    },

    // --- Muchinga Province (4) ---
    {
      observation_id: 'obs_000021',
      count: 2,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Diceros bicornis', common_name: 'Black Rhinoceros' },
      location: { latitude: -11.450, longitude: 31.900, country: 'Zambia', administrative_area: 'Muchinga Province', city: 'Mpika', protected_area: 'North Luangwa National Park', habitat_type: 'Thicket', locality_description: 'Mother and calf near Mwaleshi River crossing' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-29T06:30:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000022',
      count: 8,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Hippotragus equinus', common_name: 'Roan Antelope' },
      location: { latitude: -11.520, longitude: 31.850, country: 'Zambia', administrative_area: 'Muchinga Province', city: 'Mpika', protected_area: 'North Luangwa National Park', habitat_type: 'Woodland', locality_description: 'Herd moving through miombo woodland opening' },
      recorded_by: 'David Kim', timestamp: '2026-05-26T08:00:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000023',
      count: 4,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Panthera leo', common_name: 'Lion' },
      location: { latitude: -11.380, longitude: 31.780, country: 'Zambia', administrative_area: 'Muchinga Province', city: 'Mpika', protected_area: 'Lavushi Manda National Park', habitat_type: 'Savanna', locality_description: 'Sub-adult coalition of 4 males near Lake Waka Waka' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-05-23T17:10:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000024',
      count: 11,
      verification_status: 'Flagged',
      species_details: { scientific_name: 'Papio cynocephalus', common_name: 'Yellow Baboon' },
      location: { latitude: -11.440, longitude: 31.810, country: 'Zambia', administrative_area: 'Muchinga Province', city: 'Mpika', protected_area: null, habitat_type: 'Woodland', locality_description: 'Troop foraging near Mpika-Kasama road junction' },
      recorded_by: 'James Wilson', timestamp: '2026-05-20T12:30:00Z', institution_name: 'Wildlife Conservation Trust'
    },

    // --- Northern Province (4) ---
    {
      observation_id: 'obs_000025',
      count: 19,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Syncerus caffer', common_name: 'African Buffalo' },
      location: { latitude: -8.530, longitude: 30.550, country: 'Zambia', administrative_area: 'Northern Province', city: 'Mpulungu', protected_area: 'Nsumbu National Park', habitat_type: 'Grassland', locality_description: 'Herd grazing lakeshore plains near Lake Tanganyika' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-27T06:45:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000026',
      count: 7,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Loxodonta africana', common_name: 'African Elephant' },
      location: { latitude: -8.580, longitude: 30.480, country: 'Zambia', administrative_area: 'Northern Province', city: 'Mpulungu', protected_area: 'Nsumbu National Park', habitat_type: 'Woodland', locality_description: 'Small herd moving through Itabu Valley corridor' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-24T14:00:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000027',
      count: 1,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Python sebae', common_name: 'African Rock Python' },
      location: { latitude: -8.460, longitude: 30.600, country: 'Zambia', administrative_area: 'Northern Province', city: 'Kasama', protected_area: 'Mweru Wantipa National Park', habitat_type: 'Wetland', locality_description: '5m specimen basking near marsh edge after heavy rain' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-22T09:30:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000028',
      count: 2,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Ardea goliath', common_name: 'Goliath Heron' },
      location: { latitude: -8.550, longitude: 30.520, country: 'Zambia', administrative_area: 'Northern Province', city: 'Mpulungu', protected_area: null, habitat_type: 'Wetland', locality_description: 'Wading at lake edge near Nsumbu lodge' },
      recorded_by: 'David Kim', timestamp: '2026-05-19T07:15:00Z', institution_name: 'Zambia Wildlife Authority'
    },

    // --- North-Western Province (4) ---
    {
      observation_id: 'obs_000029',
      count: 3,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Philantomba monticola', common_name: 'Blue Duiker' },
      location: { latitude: -12.100, longitude: 24.600, country: 'Zambia', administrative_area: 'North-Western Province', city: 'Mwinilunga', protected_area: 'West Lunga National Park', habitat_type: 'Forest', locality_description: 'Shy pair spotted near dense undergrowth by West Lunga River' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-05-25T08:20:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000030',
      count: 1,
      verification_status: 'Flagged',
      species_details: { scientific_name: 'Cephalophus silvicultor', common_name: 'Yellow-backed Duiker' },
      location: { latitude: -12.150, longitude: 24.550, country: 'Zambia', administrative_area: 'North-Western Province', city: 'Mwinilunga', protected_area: 'West Lunga National Park', habitat_type: 'Forest', locality_description: 'Lone individual grazing on fallen fruits, dense canopy area' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-23T11:45:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000031',
      count: 1,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Leptailurus serval', common_name: 'Serval' },
      location: { latitude: -12.080, longitude: 24.480, country: 'Zambia', administrative_area: 'North-Western Province', city: 'Mwinilunga', protected_area: 'Zambezi Source National Forest', habitat_type: 'Grassland', locality_description: 'Hunting in tall grass near Zambezi headwaters' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-20T18:00:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000032',
      count: 37,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Brachystegia boehmii', common_name: 'Miombo Tree' },
      location: { latitude: -12.130, longitude: 24.520, country: 'Zambia', administrative_area: 'North-Western Province', city: 'Mwinilunga', protected_area: null, habitat_type: 'Woodland', locality_description: 'Extensive miombo woodland with rich understory near Solwezi road' },
      recorded_by: 'James Wilson', timestamp: '2026-05-18T10:00:00Z', institution_name: 'Wildlife Conservation Trust'
    },

    // --- Southern Province (4) ---
    {
      observation_id: 'obs_000033',
      count: 3,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Ceratotherium simum', common_name: 'White Rhinoceros' },
      location: { latitude: -17.920, longitude: 25.850, country: 'Zambia', administrative_area: 'Southern Province', city: 'Livingstone', protected_area: 'Mosi-oa-Tunya National Park', habitat_type: 'Grassland', locality_description: 'Grazing near Zambezi River viewpoint, 500m from falls' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-30T07:30:00Z', institution_name: 'The Copperbelt University'
    },
    {
      observation_id: 'obs_000034',
      count: 1,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Crocodylus niloticus', common_name: 'Nile Crocodile' },
      location: { latitude: -17.850, longitude: 25.880, country: 'Zambia', administrative_area: 'Southern Province', city: 'Livingstone', protected_area: 'Batoka Gorge', habitat_type: 'Wetland', locality_description: 'Large croc patrolling gorge pool below rapid section' },
      recorded_by: 'David Kim', timestamp: '2026-05-27T14:30:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000035',
      count: 7,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Gyps africanus', common_name: 'White-backed Vulture' },
      location: { latitude: -15.700, longitude: 26.000, country: 'Zambia', administrative_area: 'Southern Province', city: 'Kalomo', protected_area: 'Kafue National Park (South Sector)', habitat_type: 'Savanna', locality_description: 'Circling above carcass near Nanzhila Plains' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-24T10:15:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000036',
      count: 16,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Aepyceros melampus', common_name: 'Impala' },
      location: { latitude: -15.650, longitude: 25.950, country: 'Zambia', administrative_area: 'Southern Province', city: 'Kalomo', protected_area: 'Kafue National Park (South Sector)', habitat_type: 'Savanna', locality_description: 'Mixed herd grazing on short grass near dambo edge' },
      recorded_by: 'Carlos Mbeki', timestamp: '2026-05-22T08:30:00Z', institution_name: 'The Copperbelt University'
    },

    // --- Western Province (4) ---
    {
      observation_id: 'obs_000037',
      count: 28,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Connochaetes taurinus', common_name: 'Blue Wildebeest' },
      location: { latitude: -14.550, longitude: 22.500, country: 'Zambia', administrative_area: 'Western Province', city: 'Kalabo', protected_area: 'Liuwa Plain National Park', habitat_type: 'Grassland', locality_description: 'Large herd on seasonal migration across Liuwa floodplain' },
      recorded_by: 'Kwame Asante', timestamp: '2026-05-29T06:00:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000038',
      count: 2,
      verification_status: 'Pending',
      species_details: { scientific_name: 'Acinonyx jubatus', common_name: 'Cheetah' },
      location: { latitude: -14.600, longitude: 22.450, country: 'Zambia', administrative_area: 'Western Province', city: 'Kalabo', protected_area: 'Liuwa Plain National Park', habitat_type: 'Grassland', locality_description: 'Brothers hunting on open plain, 3km south of camp' },
      recorded_by: 'James Wilson', timestamp: '2026-05-26T17:20:00Z', institution_name: 'Wildlife Conservation Trust'
    },
    {
      observation_id: 'obs_000039',
      count: 4,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Crocuta crocuta', common_name: 'Spotted Hyena' },
      location: { latitude: -17.480, longitude: 23.300, country: 'Zambia', administrative_area: 'Western Province', city: 'Sesheke', protected_area: 'Sioma Ngwezi National Park', habitat_type: 'Savanna', locality_description: 'Clan active near den site at dusk, Sioma area' },
      recorded_by: 'Aisha Patel', timestamp: '2026-05-23T18:45:00Z', institution_name: 'Zambia Wildlife Authority'
    },
    {
      observation_id: 'obs_000040',
      count: 5,
      verification_status: 'Approved',
      species_details: { scientific_name: 'Balearica regulorum', common_name: 'Grey Crowned Crane' },
      location: { latitude: -14.580, longitude: 22.470, country: 'Zambia', administrative_area: 'Western Province', city: 'Kalabo', protected_area: 'Zambezi National Forest', habitat_type: 'Wetland', locality_description: 'Pairs foraging in shallow flood waters near Zambezi plains' },
      recorded_by: 'Maria Garcia', timestamp: '2026-05-21T09:10:00Z', institution_name: 'The Copperbelt University'
    }
  ];

  // =====================================================
  // SPECIES REFERENCE — Common Name → Scientific Name
  // Used for auto-detection when field officer enters a common name
  // =====================================================
  var speciesReference = {
    'African Buffalo': 'Syncerus caffer',
    'African Elephant': 'Loxodonta africana',
    'African Fish Eagle': 'Haliaeetus vocifer',
    'African Wild Dog': 'Lycaon pictus',
    'African Rock Python': 'Python sebae',
    'Black Lechwe': 'Kobus leche smithemani',
    'Black Rhinoceros': 'Diceros bicornis',
    'Blue Duiker': 'Philantomba monticola',
    'Blue Monkey': 'Cercopithecus mitis',
    'Blue Wildebeest': 'Connochaetes taurinus',
    'Cheetah': 'Acinonyx jubatus',
    'Common Ostrich': 'Struthio camelus',
    'Giraffe': 'Giraffa camelopardalis',
    'Goliath Heron': 'Ardea goliath',
    'Grey Crowned Crane': 'Balearica regulorum',
    'Hippopotamus': 'Hippopotamus amphibius',
    'Impala': 'Aepyceros melampus',
    'Leopard': 'Panthera pardus',
    'Lichtenstein\'s Hartebeest': 'Alcelaphus buselaphus',
    'Lion': 'Panthera leo',
    'Miombo Tree': 'Brachystegia spiciformis',
    'Munali Tree': 'Julbernardia paniculata',
    'Nile Crocodile': 'Crocodylus niloticus',
    'Plains Zebra': 'Equus quagga',
    'Red Lechwe': 'Kobus leche',
    'Red-necked Buzzard': 'Buteo auguralis',
    'Roan Antelope': 'Hippotragus equinus',
    'Serval': 'Leptailurus serval',
    'Shoebill': 'Balaeniceps rex',
    'Sitatunga': 'Tragelaphus spekii',
    'Southern Black Tit': 'Parus niger',
    'Spotted Hyena': 'Crocuta crocuta',
    'Thornicroft\'s Giraffe': 'Giraffa camelopardalis thornicrofti',
    'White Rhinoceros': 'Ceratotherium simum',
    'White-backed Vulture': 'Gyps africanus',
    'Woodland Kingfisher': 'Halcyon senegalensis',
    'Yellow Baboon': 'Papio cynocephalus',
    'Yellow-backed Duiker': 'Cephalophus silvicultor',
    'Masai Giraffe': 'Giraffa tippelskirchi',
    'Hartebeest': 'Alcelaphus buselaphus',
    'Blue Wildebeest': 'Connochaetes taurinus',
    // Additional common Zambian species
    'Bushbuck': 'Tragelaphus scriptus',
    'Greater Kudu': 'Tragelaphus strepsiceros',
    'Eland': 'Taurotragus oryx',
    'Sable Antelope': 'Hippotragus niger',
    'Waterbuck': 'Kobus ellipsiprymnus',
    'Puku': 'Kobus vardonii',
    'Reedbuck': 'Redunca arundinum',
    'Oribi': 'Ourebia ourebi',
    'Steenbok': 'Raphicerus campestris',
    'Common Duiker': 'Sylvicapra grimmia',
    'Warthog': 'Phacochoerus africanus',
    'Bushpig': 'Potamochoerus larvatus',
    'Honey Badger': 'Mellivora capensis',
    'Civet': 'Civettictis civetta',
    'Genet': 'Genetta genetta',
    'Mongoose': 'Herpestes ichneumon',
    'Aardvark': 'Orycteropus afer',
    'Pangolin': 'Smutsia temminckii',
    'Porcupine': 'Hystrix africaeaustralis',
    'Vervet Monkey': 'Chlorocebus pygerythrus',
    'Chacma Baboon': 'Papio ursinus',
    'Side-striped Jackal': 'Canis adustus',
    'Bat-eared Fox': 'Otocyon megalotis',
    'Caracal': 'Caracal caracal',
    'African Wild Cat': 'Felis lybica',
    'Zebra': 'Equus quagga',
    'Buffalo': 'Syncerus caffer',
    'Elephant': 'Loxodonta africana',
    'Rhino': 'Ceratotherium simum',
    'Hippo': 'Hippopotamus amphibius',
    'Crocodile': 'Crocodylus niloticus',
    'Python': 'Python sebae',
    'Baboon': 'Papio cynocephalus',
    'Fish Eagle': 'Haliaeetus vocifer',
    'Kingfisher': 'Halcyon senegalensis',
    'Vulture': 'Gyps africanus',
    'Crane': 'Balearica regulorum',
    'Heron': 'Ardea goliath',
    'Ostrich': 'Struthio camelus',
    'Wildebeest': 'Connochaetes taurinus'
  };

  /**
   * Attempts to find a scientific name based on a common name string.
   * Supports case-insensitive and partial matches to assist field officers
   * who may only know part of a species name (e.g., typing "Buffalo" matches
   * "African Buffalo").
   *
   * Why three-tier matching?
   *   1. Exact key match — fast path for known entries.
   *   2. Case-insensitive — users type inconsistently (e.g., "lion" vs "Lion").
   *   3. Partial substring — officers often abbreviate or remember only part
   *      of a compound name during a quick field sighting.
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
  // LIVE STATE — loaded from localStorage or defaults
  // =====================================================
  var users = loadFromStorage('users', defaultUsers);
  var observations = loadFromStorage('observations', defaultObservations);

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
        species: obs.species_details ? obs.species_details.scientific_name : '',
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
      observation_id: 'obs_' + String(maxId + 1).padStart(6, '0'),
      count: obs.count || 0,
      verification_status: 'Pending',
      species_details: {
        scientific_name: (obs.species_details && obs.species_details.scientific_name) || '',
        common_name: (obs.species_details && obs.species_details.common_name) || ''
      },
      location: {
        latitude: (obs.location && obs.location.latitude) != null ? obs.location.latitude : null,
        longitude: (obs.location && obs.location.longitude) != null ? obs.location.longitude : null,
        country: (obs.location && obs.location.country) || '',
        administrative_area: (obs.location && obs.location.administrative_area) || '',
        city: (obs.location && obs.location.city) || '',
        protected_area: (obs.location && obs.location.protected_area) || null,
        habitat_type: (obs.location && obs.location.habitat_type) || '',
        locality_description: (obs.location && obs.location.locality_description) || ''
      },
      recorded_by: obs.recorded_by || '',
      timestamp: obs.timestamp || new Date().toISOString(),
      institution_name: obs.institution_name || '',
      field_notes: obs.field_notes || ''
    };
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
      if (updates.location.protected_area != null) obs.location.protected_area = updates.location.protected_area;
      if (updates.location.habitat_type != null) obs.location.habitat_type = updates.location.habitat_type;
      if (updates.location.locality_description != null) obs.location.locality_description = updates.location.locality_description;
    }
    persist();
    return obs;
  }

  // =====================================================
  // GEOGRAPHIC REFERENCE DATA — public access
  // =====================================================

  function getZambiaProvinces() {
    return zambiaProvinces.map(function(p) { return p.name; });
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
      type: type,               // 'pending_observation', 'flagged_observation', 'new_user'
      title: title,
      message: message,
      link: link || null,       // URL to navigate to when clicked
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

  /**
   * Generate seed notifications from existing observations data.
   * Called once on first load to populate initial notifications.
   */
  function seedNotifications() {
    if (notifications.length > 0) return; // Already seeded

    // Generate from existing Pending observations
    observations.forEach(function(obs) {
      if (obs.verification_status === 'Pending') {
        var species = obs.species_details ? (obs.species_details.common_name || obs.species_details.scientific_name) : 'Unknown';
        var loc = obs.location ? (obs.location.administrative_area || obs.location.city || '') : '';
        addNotification(
          'pending_observation',
          'Pending Observation',
          species + ' recorded by ' + obs.recorded_by + ' in ' + loc + ' needs review.',
          'pages/admin/observations/observations.html',
          obs.observation_id
        );
      }
    });

    // Generate from existing Flagged observations
    observations.forEach(function(obs) {
      if (obs.verification_status === 'Flagged') {
        var species = obs.species_details ? (obs.species_details.common_name || obs.species_details.scientific_name) : 'Unknown';
        addNotification(
          'flagged_observation',
          'Flagged Observation',
          species + ' observation requires attention.',
          'pages/admin/observations/observations.html',
          obs.observation_id
        );
      }
    });
  }

  // Call seed on load
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
    getUserById: getUserById,
    getUserByEmail: getUserByEmail,

    // Observation CRUD
    addObservation: addObservation,
    deleteObservation: deleteObservation,
    getObservationById: getObservationById,
    updateObservation: updateObservation,

    /**
     * Filter observations by criteria. Returns filtered copy.
     * @param {Object} filters - { dateFrom, dateTo, province, status, species }
     * @returns {Array} Filtered observations.
     */
    filterObservations: function(filters) {
        if (!filters) return observations.slice();
        return observations.filter(function(obs) {
            var loc = obs.location || {};
            var sd = obs.species_details || {};
            var ts = obs.timestamp ? new Date(obs.timestamp) : null;

            // Date From
            if (filters.dateFrom && ts) {
                var from = new Date(filters.dateFrom);
                if (ts < from) return false;
            }
            // Date To
            if (filters.dateTo && ts) {
                var to = new Date(filters.dateTo);
                to.setHours(23, 59, 59, 999);
                if (ts > to) return false;
            }
            // Province
            if (filters.province) {
                if ((loc.administrative_area || '').toLowerCase() !== filters.province.toLowerCase()) return false;
            }
            // Status
            if (filters.status) {
                if ((obs.verification_status || '').toLowerCase() !== filters.status.toLowerCase()) return false;
            }
            // Species
            if (filters.species) {
                var q = filters.species.toLowerCase();
                var common = (sd.common_name || '').toLowerCase();
                var sci = (sd.scientific_name || '').toLowerCase();
                if (!common.includes(q) && !sci.includes(q)) return false;
            }
            return true;
        });
    },

    /**
     * Search observations across all searchable fields, optionally scoped to a specific field.
     * @param {string} query - The search term to filter by.
     * @param {string} [field] - Optional field to scope search: 'species', 'province', 'officer', 'institution', or undefined for all.
     * @returns {Array} Filtered observations matching the query.
     */
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

            // Default: all fields
            var searchable = [
                sd.scientific_name || '',
                sd.common_name || '',
                loc.city || '',
                loc.administrative_area || '',
                loc.country || '',
                loc.habitat_type || '',
                obs.recorded_by || '',
                obs.institution_name || '',
                obs.timestamp || ''
            ].join(' ').toLowerCase();
            return searchable.includes(q);
        });
    },

    // Species reference lookup
    lookupScientificName: lookupScientificName,
    getSpeciesReference: getSpeciesReference,

    // Geographic reference data (Zambia)
    getZambiaProvinces: getZambiaProvinces,
    getReservesByProvince: getReservesByProvince,

    // Notifications
    addNotification: addNotification,
    getNotifications: getNotifications,
    getUnreadNotificationCount: getUnreadNotificationCount,
    markNotificationRead: markNotificationRead,
    markAllNotificationsRead: markAllNotificationsRead,
    clearNotifications: clearNotifications,

    // Event bus — used by NotificationService and other listeners
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    publish: publish,
    eventNames: eventNames,

    // Admin
    reset: reset
  };

})();