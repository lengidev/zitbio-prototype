/**
 * ZitBIO — Analytics Engine (pure functions)
 * =========================================
 * Gap-3/analytics layer from the analytics brief.
 *
 * Design rule (brief §5): PURE FUNCTIONS. Every function takes the data it
 * needs as parameters and returns computed results. This module NEVER calls
 * BioData methods internally and NEVER touches the DOM — so it:
 *   - survives the (async) Supabase migration untouched,
 *   - is trivially testable against fixed datasets,
 *   - is reusable from the Report tab, Graphs tab, and warning evaluation.
 *
 * Honesty boundary (supervisor framing): trend = linear regression on the
 * data points we actually have, clearly labelled as a trend — NOT a forecast.
 * No ML. No fabricated baselines or conservation statuses.
 */

window.BioAnalytics = (function() {
  'use strict';

  // =====================================================
  // CONFIGURABLE THRESHOLDS (brief: constants block, not
  // magic numbers buried in logic). Tune these against
  // real output at the Step-3 check-in.
  // =====================================================
  var THRESHOLDS = {
    // Low-population warnings: current estimate compared to baseline.
    //   current < warningRatio × baseline        → 'warning'
    //   current < criticalRatio × baseline       → 'critical'
    WARNING_RATIO: 0.7,
    CRITICAL_RATIO: 0.4,

    // Trend classification: |slope| per bucket below STABLE_EPSILON is
    // considered 'stable'. Slope units are individuals per bucket.
    STABLE_EPSILON: 0.15,

    // Population trend bucketing: fewer than MIN_POINTS buckets cannot be
    // regressed meaningfully — return direction 'insufficient_data'.
    MIN_POINTS: 2,

    // "Current estimate" = rolling mean of the last N verified records for
    // a species/site (Option C baseline derivation).
    RECENT_WINDOW: 3,

    // Recency: a species whose most recent record is older than STALE_DAYS
    // (relative to the dataset's latest record) is shown as "No recent
    // records" — absence of recording must not be read as a decline.
    STALE_DAYS: 30,

    // Co-occurrence window: two species "co-occur" if recorded at the same
    // site within the same N-day window.
    CO_OCCURRENCE_DAYS: 7
  };

  // =====================================================
  // INTERNAL HELPERS
  // =====================================================

  // Species key: prefer species_id when present, else scientific name.
  // Observations without either are grouped as 'unknown'.
  function speciesKey(obs) {
    if (obs && obs.species_id) return obs.species_id;
    if (obs && obs.species_details && obs.species_details.scientific_name) {
      return obs.species_details.scientific_name;
    }
    return 'unknown';
  }

  // Site key: prefer site_id when present, else focus_area string.
  function siteKey(obs) {
    if (obs && obs.site_id) return obs.site_id;
    if (obs && obs.location && obs.location.focus_area) {
      return obs.location.focus_area;
    }
    return 'unknown';
  }

  // Return the month bucket ('YYYY-MM') for an observation timestamp.
  function monthBucket(obs) {
    if (!obs || !obs.timestamp) return '';
    var d = new Date(obs.timestamp);
    if (isNaN(d.getTime())) return '';
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1);
    while (m.length < 2) m = '0' + m;
    return y + '-' + m;
  }

  // Return the week bucket (ISO-ish week start = Monday) as a Date.
  function weekBucket(obs) {
    if (!obs || !obs.timestamp) return null;
    var d = new Date(obs.timestamp);
    if (isNaN(d.getTime())) return null;
    var day = d.getDay();               // 0=Sun
    var diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday of this week
    var monday = new Date(d.getFullYear(), d.getMonth(), diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  // Sum species counts (each observation contributes its `count`).
  function aggregateCounts(observations) {
    var counts = {};
    observations.forEach(function(obs) {
      if (!obs) return;
      var key = speciesKey(obs);
      var c = obs.count || 0;
      counts[key] = (counts[key] || 0) + c;
    });
    return counts;
  }

  // Least-squares linear regression on [x, y] pairs where x = 0..n-1
  // (index into the sorted bucket list). Returns { slope, intercept, n }.
  function linearRegression(buckets) {
    var n = buckets.length;
    if (n < 1) return { slope: 0, intercept: 0, n: 0 };
    var sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (var i = 0; i < n; i++) {
      sumX += i;
      sumY += buckets[i].value;
      sumXY += i * buckets[i].value;
      sumXX += i * i;
    }
    var denom = (n * sumXX) - (sumX * sumX);
    var slope = denom !== 0 ? ((n * sumXY) - (sumX * sumY)) / denom : 0;
    var intercept = n > 0 ? (sumY - (slope * sumX)) / n : 0;
    return { slope: slope, intercept: intercept, n: n };
  }

  // Classify a slope into rising/declining/stable using STABLE_EPSILON.
  function classifyDirection(slope) {
    var eps = THRESHOLDS.STABLE_EPSILON;
    if (slope > eps) return 'increasing';
    if (slope < -eps) return 'declining';
    return 'stable';
  }

  // =====================================================
  // 1. SPECIES RICHNESS
  // =====================================================
  function speciesRichness(observations) {
    var keys = {};
    (observations || []).forEach(function(obs) {
      keys[speciesKey(obs)] = true;
    });
    return Object.keys(keys).length;
  }

  // =====================================================
  // 2. SHANNON DIVERSITY INDEX
  // -----------------------------------------------------
  // H' = -Σ pᵢ · ln(pᵢ) over species. The core "ecological
  // make-up" metric — real ecologists quantify ecosystem
  // degradation as a declining Shannon index over time.
  // =====================================================
  function shannonDiversityIndex(observations) {
    var list = observations || [];
    if (list.length === 0) return 0;

    var counts = aggregateCounts(list);
    var total = 0;
    for (var key in counts) {
      if (counts.hasOwnProperty(key)) total += counts[key];
    }
    if (total <= 0) return 0;

    var hindex = 0;
    for (var k in counts) {
      if (!counts.hasOwnProperty(k)) continue;
      var p = counts[k] / total;
      if (p > 0) hindex -= p * Math.log(p);
    }
    return hindex;
  }

  // =====================================================
  // 3. POPULATION TREND (per species/site, OLS regression)
  // -----------------------------------------------------
  // Buckets by week (or month for spans > 13 weeks), sums counts per
  // bucket, fits a straight line, and classifies the direction. Returns
  // the raw data points so charts can overlay the fitted line.
  // =====================================================
  function populationTrend(observations, speciesId, siteId) {
    var list = (observations || []).filter(function(obs) {
      if (speciesId && speciesKey(obs) !== speciesId) return false;
      if (siteId && siteKey(obs) !== siteId) return false;
      return true;
    });
    if (list.length === 0) {
      return { slope: 0, direction: 'insufficient_data', dataPoints: [], fitted: [] };
    }

    // Decide bucket span: week buckets by default; if the earliest and
    // latest records span more than 13 weeks, fall back to months.
    var timestamps = list.map(function(o) { return new Date(o.timestamp); })
      .filter(function(d) { return !isNaN(d.getTime()); })
      .sort(function(a, b) { return a - b; });

    var spanDays = timestamps.length >= 2
      ? (timestamps[timestamps.length - 1] - timestamps[0]) / (1000 * 60 * 60 * 24)
      : 0;

    var bucketMap = {};
    list.forEach(function(obs) {
      var key;
      var date;
      if (spanDays > 91) {
        key = monthBucket(obs);
        date = new Date(key + '-01T00:00:00Z');
      } else {
        var monday = weekBucket(obs);
        key = monday ? monday.toISOString().split('T')[0] : '';
        date = monday;
      }
      if (!key) return;
      if (!bucketMap[key]) bucketMap[key] = { value: 0, date: date };
      bucketMap[key].value += obs.count || 0;
    });

    // Sort buckets chronologically and index x = 0..n-1.
    var keys = Object.keys(bucketMap).sort();
    var buckets = keys.map(function(k) {
      return { label: k, value: bucketMap[k].value, date: bucketMap[k].date };
    });

    if (buckets.length < THRESHOLDS.MIN_POINTS) {
      return {
        slope: 0,
        direction: 'insufficient_data',
        dataPoints: buckets,
        fitted: [],
        note: 'Only ' + buckets.length + ' time bucket(s) — need at least ' + THRESHOLDS.MIN_POINTS + ' for a trend.'
      };
    }

    var reg = linearRegression(buckets);
    var fitted = buckets.map(function(b, i) {
      return { label: b.label, value: reg.intercept + (reg.slope * i) };
    });

    return {
      slope: reg.slope,
      direction: classifyDirection(reg.slope),
      dataPoints: buckets,
      fitted: fitted,
      n: reg.n,
      note: 'Linear trend on observed buckets — descriptive, not a forecast.'
    };
  }

  // =====================================================
  // 4. LOW-POPULATION WARNINGS
  // -----------------------------------------------------
  // For each species/site combination present in the dataset, compare the
  // current estimate (rolling mean of the last RECENT_WINDOW verified
  // records) against the resolved baseline. Baseline resolution:
  //   1. per-site override (speciesRegistry[x].baseline_by_site[siteId])
  //   2. species-wide baseline_count (admin-set)
  //   3. derived baseline (mean of ALL approved counts for that species)
  //   4. none → "insufficient_data" (no fabricated numbers)
  //
  // `options` may carry the registry data from the caller:
  //   { speciesRegistry: [...], sites: [...], includeAll: bool }
  // This keeps the function pure while letting the Report tab / warning
  // evaluation pass authoritative registry + baseline values.
  // =====================================================
  function lowPopulationWarnings(observations, options) {
    options = options || {};
    var registry = options.speciesRegistry || [];
    var siteList = options.sites || [];
    var list = observations || [];

    // Group observations by species+site.
    var groups = {};
    list.forEach(function(obs) {
      if (!obs) return;
      var sp = speciesKey(obs);
      var st = siteKey(obs);
      var gk = sp + '::' + st;
      if (!groups[gk]) groups[gk] = [];
      groups[gk].push(obs);
    });

    var warnings = [];
    Object.keys(groups).forEach(function(gk) {
      var group = groups[gk];
      // Sort by timestamp ascending so the "recent window" means latest.
      group.sort(function(a, b) {
        var ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        var tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
      });

      var sp = group[0] && speciesKey(group[0]);
      var st = group[0] && siteKey(group[0]);

      // Friendly site name (e.g. 'site_001' → 'The CBU Nature Park').
      var siteName = st;
      if (siteList.length) {
        var siteMatch = siteList.find(function(s) {
          return (s.id && s.id === st) ||
                 (s.name && s.name.toLowerCase() === String(st).toLowerCase());
        });
        if (siteMatch) siteName = siteMatch.name;
      }

      // Resolve registry entry by id OR scientific name.
      var regEntry = null;
      if (registry && registry.length) {
        var sci = group[0] && group[0].species_details && group[0].species_details.scientific_name;
        regEntry = registry.find(function(r) {
          return (r.id && r.id === sp) ||
                 (sci && r.scientific_name && r.scientific_name.toLowerCase() === sci.toLowerCase());
        }) || null;
      }

      // Current estimate: mean of the most recent RECENT_WINDOW counts.
      var recent = group.slice(-THRESHOLDS.RECENT_WINDOW);
      var currentCount = recent.reduce(function(sum, o) { return sum + (o.count || 0); }, 0) / recent.length;

      // Resolve baseline:
      //   1. site override
      //   2. species-wide admin baseline
      //   3. derived = mean of all group counts (Option C default)
      var baseline = null;
      var baselineSource = null;
      if (regEntry && regEntry.baseline_by_site && regEntry.baseline_by_site[st] != null) {
        baseline = regEntry.baseline_by_site[st];
        baselineSource = 'site-override';
      } else if (regEntry && regEntry.baseline_count != null) {
        baseline = regEntry.baseline_count;
        baselineSource = 'admin-set';
      } else if (group.length > 0) {
        baseline = group.reduce(function(sum, o) { return sum + (o.count || 0); }, 0) / group.length;
        baselineSource = 'derived';
      }

      var severity = null;
      if (baseline == null || baseline <= 0) {
        severity = 'insufficient_data';
      } else if (currentCount < THRESHOLDS.CRITICAL_RATIO * baseline) {
        severity = 'critical';
      } else if (currentCount < THRESHOLDS.WARNING_RATIO * baseline) {
        severity = 'warning';
      }

      // Only emit warnings for warning/critical; insufficient_data and
      // healthy states are returned with severity so the UI can decide.
      warnings.push({
        speciesId: sp,
        siteId: st,
        speciesName: (group[0] && group[0].species_details && group[0].species_details.common_name) || sp,
        siteName: siteName,
        currentCount: Math.round(currentCount * 100) / 100,
        baseline: baseline != null ? Math.round(baseline * 100) / 100 : null,
        baselineSource: baselineSource,
        ratio: baseline != null && baseline > 0 ? Math.round((currentCount / baseline) * 1000) / 1000 : null,
        pctOfBaseline: baseline != null && baseline > 0 ? Math.round((currentCount / baseline) * 100) : null,
        severity: severity,
        observations: group.length
      });
    });

    return warnings;
  }

  // =====================================================
  // 5. SITE COMPARISON OVER TIME (degradation signal)
  // -----------------------------------------------------
  // Buckets a single site's observations by month and computes richness +
  // Shannon index per bucket. A declining Shannon index over time is the
  // direct, credible answer to "is this area being degraded".
  // =====================================================
  function siteComparisonOverTime(observations, siteId) {
    var list = (observations || []).filter(function(obs) {
      return siteKey(obs) === siteId;
    });

    var buckets = {};
    list.forEach(function(obs) {
      var key = monthBucket(obs);
      if (!key) return;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(obs);
    });

    var keys = Object.keys(buckets).sort();
    return keys.map(function(key) {
      var bucketObs = buckets[key];
      return {
        month: key,
        speciesRichness: speciesRichness(bucketObs),
        shannonIndex: shannonDiversityIndex(bucketObs),
        observations: bucketObs.length
      };
    });
  }

  // =====================================================
  // 6. SPECIES CO-OCCURRENCE (Tier 2)
  // -----------------------------------------------------
  // Pairs of species recorded at the same site within a CO_OCCURRENCE_DAYS
  // window. Returns a map { "speciesA::speciesB": count } (keys sorted to
  // keep ordering canonical), plus a list of pair objects for charting.
  // =====================================================
  function speciesCoOccurrence(observations) {
    var windowMs = THRESHOLDS.CO_OCCURRENCE_DAYS * 24 * 60 * 60 * 1000;
    var list = (observations || []).filter(function(o) {
      return o && o.timestamp && !isNaN(new Date(o.timestamp).getTime());
    });

    var pairCounts = {};
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      var ta = new Date(a.timestamp).getTime();
      var siteA = siteKey(a);
      var spA = speciesKey(a);
      if (spA === 'unknown') continue;
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        var tb = new Date(b.timestamp).getTime();
        if (Math.abs(tb - ta) > windowMs) continue;
        if (siteKey(b) !== siteA) continue;
        var spB = speciesKey(b);
        if (spB === 'unknown' || spB === spA) continue;
        var key = spA < spB ? spA + '::' + spB : spB + '::' + spA;
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }

    var pairs = Object.keys(pairCounts).map(function(key) {
      var parts = key.split('::');
      return {
        speciesA: parts[0],
        speciesB: parts[1],
        key: key,
        count: pairCounts[key]
      };
    }).sort(function(x, y) { return y.count - x.count; });

    return { matrix: pairCounts, pairs: pairs, windowDays: THRESHOLDS.CO_OCCURRENCE_DAYS };
  }

  // =====================================================
  // 7. ECOSYSTEM INSIGHTS (report)
  // -----------------------------------------------------
  // Combines data-driven status (per-species estimate vs baseline, trend,
  // warnings) with curated ecological roles (options.ecology) to answer: each
  // species' ecological role, its environmental impact, what happens if a
  // population rises or falls, and management recommendations. Trees
  // (permanent woodland flora) are treated as assumed-present so they don't
  // need repeated observation; they're only flagged if a removal/damage
  // record exists.
  // =====================================================
  function ecosystemInsights(observations, options) {
    options = options || {};
    var ecology = options.ecology || {};
    var registry = options.speciesRegistry || [];
    var list = observations || [];

    var warnings = lowPopulationWarnings(list, options);

    var nameBySci = {};
    var flora = {};
    var idBySci = {};
    registry.forEach(function(s) {
      if (!s.scientific_name) return;
      nameBySci[s.scientific_name.toLowerCase()] = s.common_name || s.scientific_name;
      if (s.taxon_type === 'flora') flora[s.scientific_name.toLowerCase()] = true;
      if (s.id) idBySci[s.scientific_name.toLowerCase()] = s.id;
    });

    // Scientific names present in the data, plus the last recorded timestamp
    // per species and the dataset's most recent record — used to detect
    // staleness so that absence of recording is never treated as a decline.
    var present = {};
    var lastSeen = {};
    var datasetMaxTs = 0;
    list.forEach(function(o) {
      var sci = o && o.species_details && o.species_details.scientific_name;
      if (!sci) return;
      sci = sci.toLowerCase();
      present[sci] = true;
      var ts = o.timestamp ? new Date(o.timestamp).getTime() : 0;
      if (ts > (lastSeen[sci] || 0)) lastSeen[sci] = ts;
      if (ts > datasetMaxTs) datasetMaxTs = ts;
    });

    // Per-species status + curated role. Include ALL curated species (park
    // inventory) so trees without observation records still show their
    // ecological role; `present` flags whether live data exists.
    var species = [];
    Object.keys(ecology).forEach(function(sci) {
      var eco = ecology[sci];
      var isPresent = !!present[sci];
      var warn = null;
      var trend = null;
      if (isPresent) {
        // Observations may carry a registry species_id (the report path
        // enriches them via enrichWithRegistryIds), so match warnings by
        // scientific name OR species id, and resolve the trend against the
        // same key speciesKey() produces.
        var sciId = idBySci[sci];
        for (var i = 0; i < warnings.length; i++) {
          var wid = (warnings[i].speciesId || '').toLowerCase();
          if (wid === sci || (sciId && wid === sciId.toLowerCase())) { warn = warnings[i]; break; }
        }
        trend = populationTrend(list, sciId || sci, null);
      }

      // Condition drives the dynamic impact text. Recency matters: a species
      // with no recent records is 'stale' ("No recent records") and is never
      // labelled down/up/healthy on old data — absence of recording must not
      // be read as a decline. Trees with no records are assumed present;
      // a below-baseline warning shows 'down'; an increasing trend shows
      // 'up'; everything else is healthy.
      var isFlora = !!flora[sci];
      var isStale = false;
      if (isPresent && datasetMaxTs > 0) {
        var lastTs = lastSeen[sci] || 0;
        if (lastTs > 0) isStale = (datasetMaxTs - lastTs) / 86400000 > THRESHOLDS.STALE_DAYS;
      }
      var condition;
      if (isFlora && !isPresent) {
        condition = 'assumed';
      } else if (!isPresent) {
        condition = 'nodata';
      } else if (isStale) {
        condition = 'stale';
      } else if (warn && (warn.severity === 'warning' || warn.severity === 'critical')) {
        condition = 'down';
      } else if (trend && trend.direction === 'increasing') {
        condition = 'up';
      } else {
        condition = 'healthy';
      }

      species.push({
        scientific: sci,
        common: nameBySci[sci] || sci,
        present: isPresent,
        flora: isFlora,
        condition: condition,
        lastRecordedAt: lastSeen[sci] ? new Date(lastSeen[sci]).toISOString() : null,
        role: eco.role,
        impact: eco.impact,
        up: eco.up,
        down: eco.down,
        estimate: warn ? warn.currentCount : null,
        baseline: warn ? warn.baseline : null,
        pctOfBaseline: warn ? warn.pctOfBaseline : null,
        severity: warn ? warn.severity : null,
        trendDirection: (trend && trend.direction !== 'insufficient_data') ? trend.direction : null,
        trendSlope: trend ? trend.slope : null
      });
    });

    // Species the warning system has flagged. Used internally to drive
    // recommendations; the on-screen alert list lives in the dedicated
    // "Low Population Warnings" card to avoid duplication.
    var alerts = warnings.filter(function(w) {
      return w.severity === 'warning' || w.severity === 'critical';
    }).map(function(w) {
      return {
        scientific: w.speciesId,
        common: w.speciesName,
        siteName: w.siteName,
        severity: w.severity,
        estimate: w.currentCount,
        baseline: w.baseline,
        pctOfBaseline: w.pctOfBaseline
      };
    });

    // Recommendations — rule-based on severity + curated ecology.
    var recommendations = [];
    alerts.forEach(function(a) {
      var eco = ecology[(a.scientific || '').toLowerCase()] || null;
      var action;
      if (a.severity === 'critical') {
        action = 'Critical: field-verify ' + a.common + ' observations and review the baseline; investigate possible causes (habitat, disease, carrying capacity) before any management action.';
      } else {
        action = 'Warning: re-check recent ' + a.common + ' sightings and confirm the population estimate; review the baseline in Settings \u2192 Species & Baselines.';
      }
      if (eco && eco.down) action += ' Ecological note: ' + eco.down;
      recommendations.push({ species: a.common, severity: a.severity, action: action });
    });
    if (recommendations.length === 0 && list.length > 0) {
      recommendations.push({
        species: 'All monitored species',
        severity: 'healthy',
        action: 'No species are below their expected baseline. Continue scheduled monitoring and keep baselines under review as more data is collected.'
      });
    }

    return {
      summary: {
        speciesCount: speciesRichness(list),
        parkSpeciesCount: Object.keys(ecology).length,
        observations: list.length,
        shannonIndex: shannonDiversityIndex(list)
      },
      species: species,
      recommendations: recommendations
    };
  }

  // =====================================================
  // PUBLIC API
  // =====================================================
  return {
    speciesRichness: speciesRichness,
    shannonDiversityIndex: shannonDiversityIndex,
    populationTrend: populationTrend,
    lowPopulationWarnings: lowPopulationWarnings,
    siteComparisonOverTime: siteComparisonOverTime,
    speciesCoOccurrence: speciesCoOccurrence,
    ecosystemInsights: ecosystemInsights,
    thresholds: THRESHOLDS
  };

})();