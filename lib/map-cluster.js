// lib/map-cluster.js: where the Analytics map puts its markers, and how many of
// them there are.
//
// The map asks this module two questions every time the zoom changes:
//
//   when the whole area is on screen - which records are close enough on screen to
//   be worth drawing as one group?
//   when the user zooms in - which of those groups were merely close, and which are
//   the same place?
//
// Two rules are deliberately not negotiable here, because getting either wrong is
// how the map stops telling the truth:
//
//   1. A group only ever contains records of ONE status. A red Flagged record must
//      never disappear inside a green Approved bubble.
//   2. A marker is drawn AT the coordinate it stands for, with ONE exception:
//      records that all share a single coordinate are spread around it when the
//      caller asks for `fanout`, because they have no separate position to be drawn
//      on and no zoom level will ever separate them. That exception is confined to
//      `fanOut` below, it never applies to records at different coordinates, and the
//      popup states how many records share the point. Everywhere else, a marker
//      sitting somewhere its record is not would be worse than a group the user has
//      to click to read, because "where is this record" is the only question the map
//      exists to answer.
//   3. A group of records at DIFFERENT coordinates is never spread. Those are
//      genuinely different places; the drill opens them up by zooming to where they
//      separate, and drawing them apart would invent a difference the data has.
//
// It works in CONTAINER PIXELS and knows nothing about Leaflet: the caller
// projects each record with `latLngToContainerPoint` on the way in and converts
// every returned `x`/`y` back with `containerPointToLatLng`. That is what makes
// the layout testable in node (tests/map-cluster.test.js), which is the only
// reason "the grouping is right" can be asserted rather than eyeballed.
//
// The grouping rule is `minDistance` PIXELS, not metres, so the same two records
// group when the whole campus is on screen and separate once you zoom in. The
// caller decides `groupNearby` from the map's zoom - the zoom window belongs to
// analytics.js, and this module should not hold a second copy of it.

(function (root) {
  'use strict';

  var DEFAULTS = {
    // Screen distance under which two records of the same status draw as one
    // group. 40px, not the 20px a world map would use: at this latitude
    // 152700 / 2^zoom metres fit in a pixel, so 20px only merges records closer
    // than ~186m at zoom 14 and ~47m at the park's own fit zoom - it would
    // almost never fire on ~19 distinct points spread over 3km.
    minDistance: 40,
    // Set by the caller from the map's zoom. False means "only records that share
    // an exact coordinate may share a marker": zoomed in far enough, two places a
    // few metres apart are two places, and merging them would hide that.
    groupNearby: true,
    // Set by the caller from the map's zoom. True means "records that share one
    // coordinate are drawn apart, around it, so each is its own marker". The one
    // case where this module deliberately moves a marker off its position, and the
    // reason it is an option rather than the default: see `fanOut`.
    fanout: false,
    // Smallest gap the fan-out will place two markers at. A dot is a 14px box with a
    // 1px border a side, so 18px is the first gap at which two never touch.
    minSpacing: 18
  };

  function options(overrides) {
    var merged = {};
    Object.keys(DEFAULTS).forEach(function (key) { merged[key] = DEFAULTS[key]; });
    if (overrides) {
      Object.keys(overrides).forEach(function (key) {
        if (overrides[key] !== undefined && overrides[key] !== null) merged[key] = overrides[key];
      });
    }
    return merged;
  }

  function planarityOf(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function coordinateKey(point) {
    return Number(point.lat).toFixed(6) + ',' + Number(point.lng).toFixed(6);
  }

  function coordinateCount(members) {
    var seen = {};
    members.forEach(function (member) { seen[coordinateKey(member)] = true; });
    return Object.keys(seen).length;
  }

  function meanOf(members, key) {
    var total = 0;
    members.forEach(function (member) { total += member[key]; });
    return total / members.length;
  }

  function idsOf(members) {
    return members.map(function (member) { return member.id; });
  }

  function item(kind, members, position) {
    var places = coordinateCount(members);
    return {
      kind: kind,
      x: position.x,
      y: position.y,
      // The coordinate the item stands for. One place means its own stored
      // coordinate, reported untouched - averaging identical values returns
      // 28.238097999999997 for 28.238098, and a marker that claims to be a
      // fraction of a nanometre off its own record is a needless lie. Several
      // places means there is no single coordinate, so the centre is the honest
      // answer, and it keeps lat/lng consistent with the x/y above it.
      lat: places === 1 ? Number(members[0].lat) : meanOf(members, 'lat'),
      lng: places === 1 ? Number(members[0].lng) : meanOf(members, 'lng'),
      status: members[0].status,
      ids: idsOf(members),
      count: members.length,
      coordinateCount: places
    };
  }

  function singleItem(member, position, sharedWith) {
    var single = item('single', [member], position || { x: member.x, y: member.y });
    // How many records sit on this one coordinate. Only set when it is more than
    // one, so the caller can tell a plain record from a spread-out one.
    if (sharedWith > 1) single.sharedWith = sharedWith;
    return single;
  }

  // Ring radii used to spread a pile of coincident records. The first is 30px and
  // they step out by 26px, so two markers on adjacent rings are at least 26px apart
  // and two on the same ring at least `minSpacing` - both clear of the 16px box a
  // 14px dot with a 1px border draws, at every angle.
  var RING_FIRST_RADIUS = 30;
  var RING_STEP = 26;
  var MAX_FANOUT_RINGS = 3;

  function ringCapacity(radius, minSpacing) {
    return Math.max(3, Math.floor((2 * Math.PI * radius) / minSpacing));
  }

  /**
   * Spread the members of a ONE-coordinate group around that coordinate so each is
   * its own marker.
   *
   * This is the single place where a marker is deliberately drawn away from the
   * coordinate it stands for, and it is confined to records that have no separate
   * coordinate to be drawn on: every member of this group is at the same pixel, so
   * there is no arrangement that shows them apart without moving them. The caller
   * decides when that trade is worth making (the map does it only above its fan-out
   * zoom), and the popup says `sharedWith` so a reader is never told nine places
   * when there is one.
   *
   * The pattern is centred on the coordinate: the ring radii are fixed, so the mean
   * of the drawn positions is the point itself, and zooming in converges the spread
   * onto a smaller patch of ground rather than following it.
   *
   * Returns `null` when the group is too big for the rings - a spread that has to
   * keep growing ends up swallowing its neighbours, and one counted marker with the
   * list in its popup says more than a blot across the map.
   */
  function fanOut(members, opts) {
    var rings = [];
    var room = 0;
    for (var i = 0; i < MAX_FANOUT_RINGS; i++) {
      var radius = RING_FIRST_RADIUS + i * RING_STEP;
      var capacity = ringCapacity(radius, opts.minSpacing);
      rings.push({ radius: radius, capacity: capacity });
      room += capacity;
    }
    if (members.length > room) return null;

    // Every member is at one pixel, so the first one's position is the group's, and
    // reading it from a member keeps the centre free of float drift.
    var originX = members[0].x;
    var originY = members[0].y;
    var remaining = members.slice();
    var placed = [];

    rings.forEach(function (ring) {
      if (!remaining.length) return;
      var take = Math.min(ring.capacity, remaining.length);
      for (var k = 0; k < take; k++) {
        // Start at the top and go clockwise, so the first ring reads as a ring and
        // the order is stable for a given input.
        var angle = -Math.PI / 2 + (k * 2 * Math.PI) / take;
        placed.push(singleItem(
          remaining[k],
          { x: originX + ring.radius * Math.cos(angle), y: originY + ring.radius * Math.sin(angle) },
          members.length
        ));
      }
      remaining = remaining.slice(take);
    });

    return placed;
  }

  /**
   * Apply `fanOut` to the groups it belongs to and leave every other item alone.
   *
   * Only a group that stands for ONE coordinate is spread: a group of several
   * distinct places is a group of genuinely different positions, which is what the
   * drill exists to open up, and drawing those apart would invent a difference the
   * data already has.
   */
  function spreadCoincident(items, usable, opts) {
    var byId = {};
    usable.forEach(function (point) { byId[point.id] = point; });
    var out = [];

    items.forEach(function (entry) {
      var spread = null;
      if (entry.kind === 'cluster' && entry.coordinateCount === 1) {
        var members = entry.ids.map(function (id) { return byId[id]; }).filter(Boolean);
        // Only when the members were all found: a partial lookup would silently
        // drop records out of the draw list.
        if (members.length === entry.count) spread = fanOut(members, opts);
      }
      if (spread) Array.prototype.push.apply(out, spread);
      else out.push(entry);
    });

    return out;
  }

  /**
   * Greedy grouping. Each record joins the nearest same-status group whose
   * centre is within `minDistance`px, else starts one. The centre is the running
   * mean of the group's members, so a group tightens around what it has already
   * collected instead of staying anchored to whichever record happened to be
   * first in the list.
   *
   * The mean is over RECORDS, not over distinct places: a group with nine
   * sightings at one spot and one at another is mostly at the first spot, and that
   * is where the marker belongs. O(n * groups); with ~19 distinct positions that
   * is nothing, and a proximity index would be a slower way to get the same
   * answer.
   */
  function groupByDistance(points, opts) {
    var groups = [];
    points.forEach(function (point) {
      var best = null;
      var bestDistance = Infinity;
      groups.forEach(function (group) {
        if (group.status !== point.status) return;
        var candidate = planarityOf(group, point);
        if (candidate <= opts.minDistance && candidate < bestDistance) {
          best = group;
          bestDistance = candidate;
        }
      });

      if (!best) {
        groups.push({ status: point.status, x: point.x, y: point.y, members: [point] });
        return;
      }
      best.members.push(point);
      best.x = meanOf(best.members, 'x');
      best.y = meanOf(best.members, 'y');
    });

    return groups.map(function (group) {
      if (group.members.length === 1) return singleItem(group.members[0]);
      return item('cluster', group.members, { x: group.x, y: group.y });
    });
  }

  /**
   * Zoomed in far enough that only an exact coordinate counts: one group per
   * coordinate, sitting on that coordinate. Records at the same place are one
   * marker because they ARE one place - no zoom level will ever separate them, and
   * a marker is not the place to enumerate them (the popup is).
   *
   * A coordinate carrying two statuses still yields one group per status, which is
   * why the grouping key is the coordinate *and* the status. They land on the same
   * pixel, which is honest: both statuses are genuinely at that one place.
   */
  function groupByCoordinate(points) {
    var piles = {};
    var order = [];
    points.forEach(function (point) {
      var key = coordinateKey(point) + '|' + point.status;
      if (!piles[key]) {
        piles[key] = [];
        order.push(key);
      }
      piles[key].push(point);
    });

    return order.map(function (key) {
      var members = piles[key];
      // Every member of a pile shares a coordinate, so any member's pixel is the
      // pile's pixel; the first one keeps the position free of float drift.
      if (members.length === 1) return singleItem(members[0]);
      return item('cluster', members, { x: members[0].x, y: members[0].y });
    });
  }

  function statsOf(items, records) {
    return {
      records: records,
      drawn: items.length,
      clusters: items.filter(function (entry) { return entry.kind === 'cluster'; }).length
    };
  }

  /**
   * `points` are `{ id, lat, lng, x, y, status }`, where x/y are container
   * pixels at the current zoom. Returns `{ items, stats }`; `items` is a flat
   * draw list, and every item carries the ids it stands for, so the caller can
   * always answer "which records is this marker?".
   */
  function plan(points, overrides) {
    var opts = options(overrides);
    // `typeof` first: isFinite(null) and isFinite('') are both true in JS (they
    // coerce to 0), so a record the caller could not project would otherwise be
    // drawn at the container's origin.
    var usable = (points || []).filter(function (point) {
      return point
        && typeof point.x === 'number' && isFinite(point.x)
        && typeof point.y === 'number' && isFinite(point.y);
    });

    var items = opts.groupNearby ? groupByDistance(usable, opts) : groupByCoordinate(usable);
    if (opts.fanout) items = spreadCoincident(items, usable, opts);
    return { items: items, stats: statsOf(items, usable.length) };
  }

  var api = {
    plan: plan,
    defaults: DEFAULTS
  };

  root.BioMapCluster = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
