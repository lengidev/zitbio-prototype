/* Capacity as a calculation over sourced inputs, never a stored ceiling. Every
   input is measured, sourced or absent, and when absent the engine names it
   rather than guessing. */

(function () {
  'use strict';

  var KEYS = {
    area: 'grazable_area_ha',
    forage: 'standing_forage_kg_per_ha',
    utilizable: 'utilizable_fraction',
    intake: 'daily_intake_kg_dm',
    drySeason: 'dry_season_days'
  };

  function rounds(value, places) {
    var factor = Math.pow(10, places == null ? 1 : places);
    return Math.round(value * factor) / factor;
  }

  // A row matches when every scope column it fills agrees with the request. The
  // count of filled columns is its specificity, so the most specific match wins
  // and a park-wide row is the fallback rather than the default assumption.
  function specificity(row, scope) {
    var filled = 0;
    var pairs = [
      ['scope_species_id', 'speciesId'],
      ['scope_zone_id', 'zoneId'],
      ['scope_season', 'season']
    ];

    for (var i = 0; i < pairs.length; i++) {
      var have = row[pairs[i][0]];
      if (have == null || have === '') continue;
      var want = scope[pairs[i][1]];
      if (want == null || String(have) !== String(want)) return -1;
      filled++;
    }

    return filled;
  }

  // Admin outranks the analysis service, then the most recent wins. Neither row is
  // deleted, so a difference stays visible instead of disappearing.
  function betterOf(candidate, held) {
    var candidateAdmin = candidate.authority === 'admin' ? 1 : 0;
    var heldAdmin = held.authority === 'admin' ? 1 : 0;
    if (candidateAdmin !== heldAdmin) return candidateAdmin > heldAdmin ? candidate : held;
    return String(candidate.written_at || '') > String(held.written_at || '') ? candidate : held;
  }

  function resolveValue(values, key, scope) {
    scope = scope || {};
    var best = null;
    var bestScore = -1;

    (values || []).forEach(function (row) {
      if (row.parameter_key !== key) return;
      var score = specificity(row, scope);
      if (score < 0) return;
      if (score > bestScore) {
        bestScore = score;
        best = row;
        return;
      }
      if (score === bestScore && best) best = betterOf(row, best);
    });

    return best;
  }

  function inputFrom(values, key, scope, label, unit) {
    var row = resolveValue(values, key, scope);
    if (!row) return { key: key, label: label, unit: unit, missing: true };

    return {
      key: key,
      label: label,
      unit: unit,
      missing: false,
      value: row.value_num == null ? null : row.value_num,
      min: row.value_min == null ? null : row.value_min,
      max: row.value_max == null ? null : row.value_max,
      source: row.source || '',
      kind: row.provenance || '',
      authority: row.authority || '',
      scope: {
        speciesId: row.scope_species_id || null,
        zoneId: row.scope_zone_id || null,
        season: row.scope_season || null
      }
    };
  }

  // `population` is BioEcology.parkPopulation output, so a partial count cannot be
  // mistaken for a park total: a species that is not 'ok' makes the whole
  // assessment refuse rather than understate demand.
  function assess(input) {
    input = input || {};
    var values = input.values || [];
    var population = input.population || {};
    var zoneId = input.zoneId || null;
    var zoneScope = { zoneId: zoneId };

    var inputs = [];
    var missing = [];
    var notAssessable = [];

    var area = inputFrom(values, KEYS.area, zoneScope, 'Grazable area', 'ha');
    var forage = inputFrom(values, KEYS.forage, zoneScope, 'Standing forage', 'kg DM/ha');
    var utilizable = inputFrom(values, KEYS.utilizable, zoneScope, 'Utilizable fraction', 'fraction');
    var drySeason = inputFrom(values, KEYS.drySeason, {}, 'Dry season remaining', 'days');

    [area, forage, utilizable, drySeason].forEach(function (item) {
      inputs.push(item);
      if (item.missing) missing.push(item.key);
    });

    var speciesIds = Object.keys(population).sort();
    var perSpecies = [];
    var demand = 0;

    speciesIds.forEach(function (speciesId) {
      var standing = population[speciesId] || {};
      var intake = inputFrom(values, KEYS.intake, { speciesId: speciesId }, 'Daily intake', 'kg DM/day');
      inputs.push(intake);

      if (intake.missing) missing.push(KEYS.intake + ':' + speciesId);
      if (standing.status !== 'ok') {
        notAssessable.push({ speciesId: speciesId, status: standing.status || 'no_data' });
      }

      perSpecies.push({
        speciesId: speciesId,
        populationStatus: standing.status || 'no_data',
        population: standing.value,
        intake: intake
      });

      if (!intake.missing && standing.status === 'ok') {
        demand += standing.value * intake.value;
      }
    });

    var forageAvailable = null;
    if (!area.missing && !forage.missing && !utilizable.missing) {
      forageAvailable = area.value * forage.value * utilizable.value;
    }

    /* Only the SUPPLY can stop the arithmetic, because without it there is nothing
       to compare against. A gap on the demand side does not stop it, it makes the
       demand a FLOOR, and a floor is usable because it leans in one known direction.
       That asymmetry is what lets a partial count still say something true.

       A shortfall computed on too little demand is a shortfall a fortiori: the
       uncounted animals can only shorten the forage further. So "above capacity" is
       sound on partial data, and "within capacity" is not, which is exactly the
       distinction the old all-or-nothing refusal threw away. */
    var supplyKnown = forageAvailable != null;
    var dryDays = drySeason.missing ? null : drySeason.value;
    var dryKnown = dryDays != null && dryDays >= 0;

    var countedSpecies = [];
    var excluded = [];

    speciesIds.forEach(function (speciesId) {
      var standing = population[speciesId] || {};
      var intakeFor = inputFrom(values, KEYS.intake, { speciesId: speciesId }, 'Daily intake', 'kg DM/day');
      if (standing.status === 'ok' && !intakeFor.missing) {
        countedSpecies.push(speciesId);
      } else {
        excluded.push({
          speciesId: speciesId,
          status: standing.status || 'no_data',
          intakeMissing: !!intakeFor.missing
        });
      }
    });

    var demandIsFloor = excluded.length > 0;

    var sustainsDays = null;
    var shortfallPct = null;
    var verdict = 'cannot_assess';
    var bindsOn = null;
    var reason = null;

    if (!supplyKnown) {
      reason = 'missing_supply';
    } else if (!dryKnown) {
      reason = 'missing_dry_season';
    } else if (!(demand > 0)) {
      reason = 'no_demand';
    } else {
      // The LONGEST the forage could last, because the demand is at least what was
      // counted and may turn out to be more.
      sustainsDays = rounds(forageAvailable / demand, 1);
      if (sustainsDays < dryDays) {
        verdict = 'above_capacity';
        bindsOn = 'forage';
        shortfallPct = Math.round((1 - sustainsDays / dryDays) * 100);
      } else if (demandIsFloor) {
        // Adequacy cannot be shown from a partial demand: the species nobody counted
        // may be the ones that tip it over.
        verdict = 'cannot_conclude';
        reason = 'partial_demand';
        shortfallPct = 0;
      } else {
        verdict = 'within_capacity';
        shortfallPct = 0;
      }
    }

    // Said out loud, in the direction the gap leans, so a reader is never left to
    // work out whether a number is a floor, a ceiling or a measurement.
    var caveats = [];
    if (demandIsFloor && (demand > 0)) {
      caveats.push('Counted ' + countedSpecies.length + ' of ' + speciesIds.length +
        ' species, so the demand is at least ' + rounds(demand, 1) +
        ' kg of dry matter a day. Whatever the uncounted species eat comes on top.');
    }
    if (verdict === 'above_capacity' && demandIsFloor) {
      caveats.push('The shortfall is therefore a minimum. Counting the rest can only make it larger, never smaller.');
    }
    if (verdict === 'cannot_conclude') {
      caveats.push('The forage covers the animals that were counted, but not every species was counted, so the park cannot yet be called within capacity.');
    }
    if (reason === 'no_demand') {
      caveats.push('No species here has a count recent enough to use, so there is no demand to weigh the forage against.');
    }
    if (reason === 'missing_supply') {
      caveats.push('The forage available cannot be worked out yet, so there is nothing to compare the demand against.');
    }

    // Zebra-equivalents convert every species to one currency. Optional: a missing
    // reference intake leaves it null rather than blocking an otherwise sound
    // verdict.
    var reference = null;
    var zebraEquivalents = null;

    if (input.referenceSpeciesId) {
      reference = inputFrom(values, KEYS.intake, { speciesId: input.referenceSpeciesId }, 'Reference intake', 'kg DM/day');
      if (!reference.missing && reference.value > 0 && demand > 0 && forageAvailable != null && dryDays > 0) {
        zebraEquivalents = {
          carried: rounds(demand / reference.value, 1),
          supportable: rounds(forageAvailable / (dryDays * reference.value), 1)
        };
      }
    }

    return {
      verdict: verdict,
      reason: reason,
      // True when the verdict holds despite the gaps. A shortfall on a floor demand
      // is conclusive; adequacy on a floor demand is not.
      conclusive: verdict === 'above_capacity' || verdict === 'within_capacity',
      demandBasis: demandIsFloor ? 'at_least' : 'complete',
      countedSpecies: countedSpecies,
      excludedSpecies: excluded,
      caveats: caveats,
      bindsOn: bindsOn,
      missing: missing,
      notAssessable: notAssessable,
      inputs: inputs,
      perSpecies: perSpecies,
      forageAvailable: forageAvailable == null ? null : rounds(forageAvailable, 0),
      dailyDemand: rounds(demand, 1),
      sustainsDays: sustainsDays,
      drySeasonDays: dryDays,
      shortfallPct: shortfallPct,
      zebraEquivalents: zebraEquivalents,
      zoneId: zoneId,
      notes: [
        'Only forage is evaluated. Water quantity, water quality, soil and space are not yet computed.',
        'Directions are reported without magnitudes where the relationship has no sourced magnitude.'
      ]
    };
  }

  var api = {
    KEYS: KEYS,
    resolveValue: resolveValue,
    assess: assess
  };

  if (typeof window !== 'undefined') window.BioCapacity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
