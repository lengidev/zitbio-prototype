/*
 * ZitBio ecosystem scenario brief.
 *
 * The ecosystem engine owns the science. This module takes one immutable result
 * snapshot and turns it into a readable, paginated PDF without scraping the DOM
 * or re-running the model. It is CommonJS-compatible so the data contract can be
 * tested without a browser or jsPDF.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BioScenarioBrief = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var COLORS = {
    forest: [31, 92, 50],
    green: [46, 125, 50],
    ink: [39, 55, 47],
    muted: [94, 109, 100],
    line: [217, 225, 219],
    pale: [239, 247, 241],
    paper: [250, 250, 247],
    amber: [150, 91, 0],
    amberPale: [255, 247, 229],
    red: [166, 38, 32],
    redPale: [255, 238, 235],
    white: [255, 255, 255]
  };

  function asNumber(value) {
    if (value == null || value === '') return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  function safeText(value) {
    return String(value == null ? '' : value)
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
      .replace(/\u2192/g, '->')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\u2026/g, '...')
      .replace(/\u00b7/g, '|');
  }

  function copySource(source) {
    if (!source) return null;
    return {
      id: safeText(source.id),
      tier: safeText(source.tier),
      label: safeText(source.label),
      title: safeText(source.title),
      url: String(source.url || '')
    };
  }

  function copySpecies(item) {
    return {
      key: safeText(item.key),
      label: safeText(item.label),
      scientificName: safeText(item.scientificName),
      from: asNumber(item.from),
      to: asNumber(item.to),
      delta: asNumber(item.delta),
      percent: asNumber(item.percent),
      densityFrom: asNumber(item.densityFrom),
      densityTo: asNumber(item.densityTo),
      source: copySource(item.source)
    };
  }

  function stableHash(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
  }

  function scenarioIdFor(result) {
    var species = (result.speciesChanges || []).map(function (item) {
      return [item.key, item.from, item.to].join(':');
    }).sort().join('|');
    var payload = [
      result.modelVersion || '',
      result.driver || '',
      result.estimatedAreaHa == null ? 'area:none' : 'area:' + result.estimatedAreaHa,
      species,
      stableJson(result.conditions || {}),
      stableJson(result.waterQuality ? { values: result.waterQuality.values, sampleId: result.waterQuality.sampleId, provenance: result.waterQuality.provenance, site: result.waterQuality.site, sampledAt: result.waterQuality.sampledAt, contamination: result.waterQuality.contamination, bloom: result.waterQuality.bloom, availability: result.waterQuality.availability } : {})
    ].join('|');
    return 'ECO-' + stableHash(payload);
  }

  function stableJson(value) {
    if (value == null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + stableJson(value[key]); }).join(',') + '}';
  }

  function copyData(value) { return value == null ? null : JSON.parse(JSON.stringify(value)); }

  function copySourceRef(source) {
    return source ? { id: safeText(source.id), tier: safeText(source.tier), label: safeText(source.label) } : null;
  }

  function copyLeg(leg) {
    return {
      route: safeText(leg.route),
      depth: Number(leg.depth || 0),
      driver: safeText(leg.driver),
      driverLabel: safeText(leg.driverLabel),
      driverShort: safeText(leg.driverShort),
      via: (leg.via || []).map(safeText),
      why: safeText(leg.why),
      conditions: safeText(leg.conditions),
      source: copySourceRef(leg.source)
    };
  }

  /*
   * The hypotheticals are copied whole rather than re-derived, so the brief and
   * the inspector cannot describe one state two different ways.
   */
  function copyHypothetical(item) {
    return {
      key: safeText(item.key),
      label: safeText(item.label),
      short: safeText(item.short || item.label),
      state: safeText(item.state),
      direction: safeText(item.direction || ''),
      inherited: item.inherited ? { key: safeText(item.inherited.key), label: safeText(item.inherited.label), short: safeText(item.inherited.short || item.inherited.label) } : null,
      camps: (item.camps || []).map(function (camp) {
        return {
          direction: safeText(camp.direction),
          drivers: (camp.drivers || []).map(safeText),
          legs: (camp.legs || []).map(copyLeg)
        };
      }),
      branches: (item.branches || []).map(function (branch) {
        return {
          edge: safeText(branch.edge),
          conditions: safeText(branch.conditions),
          options: (branch.options || []).map(function (option) {
            return {
              when: safeText(option.when),
              direction: safeText(option.direction),
              because: safeText(option.because),
              source: copySourceRef(option.source)
            };
          })
        };
      }),
      because: (item.because || []).map(copyLeg),
      drivers: (item.drivers || []).map(safeText),
      holds: (item.holds || []).map(safeText),
      settles: item.settles ? {
        observable: safeText(item.settles.observable),
        how: safeText(item.settles.how),
        readings: (item.settles.readings || []).map(function (reading) {
          return { reading: safeText(reading.reading), direction: safeText(reading.direction || ''), then: safeText(reading.then) };
        }),
        source: copySourceRef(item.settles.source)
      } : null
    };
  }

  function buildSnapshot(options) {
    options = options || {};
    var result = options.result;
    if (!result) throw new Error('A synchronized ecosystem scenario result is required.');
    if (result.inputErrors && result.inputErrors.length) throw new Error('Correct scenario inputs before exporting a brief.');

    var generatedAt = options.generatedAt || new Date().toISOString();
    var defaultArea = asNumber(options.defaultAreaHa);
    var speciesChanges = (result.speciesChanges || []).map(copySpecies);
    var context = (options.context || []).map(function (item) {
      return {
        key: safeText(item.key),
        label: safeText(item.label),
        registeredCount: asNumber(item.registeredCount),
        latestObservedCount: asNumber(item.latestObservedCount),
        latestObservedAt: item.latestObservedAt || null
      };
    });
    var evidence = Object.keys(result.evidence || {}).map(function (key) {
      return copySource(result.evidence[key]);
    }).filter(Boolean).sort(function (a, b) {
      return a.tier.localeCompare(b.tier) || a.title.localeCompare(b.title);
    });
    var recommendations = (result.managementRecommendations || []).map(function (item) {
      return {
        id: safeText(item.id),
        priority: safeText(item.priority || 'medium'),
        trigger: safeText(item.trigger),
        action: safeText(item.action),
        rationale: safeText(item.rationale),
        evidenceIds: (item.evidenceIds || []).map(safeText),
        decides: safeText(item.decides || ''),
        outcomes: (item.outcomes || []).map(function (outcome) {
          return { when: safeText(outcome.when), direction: safeText(outcome.direction || ''), then: safeText(outcome.then || '') };
        })
      };
    });
    if (!recommendations.length) {
      recommendations = (result.managementInterpretation || []).map(function (text, index) {
        return {
          id: 'legacy-' + index,
          priority: 'medium',
          trigger: 'Current scenario',
          action: safeText(text),
          rationale: 'Generated from the scenario model guidance.',
          evidenceIds: []
        };
      });
    }

    var area = asNumber(result.estimatedAreaHa);
    var changedPopulationCount = speciesChanges.filter(function (item) { return item.delta !== 0; }).length;
    var changedContextCount = (result.driver && result.driver !== 'none' ? 1 : 0) +
      (defaultArea != null && area !== defaultArea ? 1 : 0) + (result.waterQuality && result.waterQuality.hasInput ? 1 : 0) +
      Object.keys(result.conditions || {}).filter(function (key) { return result.conditions[key] !== 'unmeasured'; }).length;

    return {
      scenarioId: scenarioIdFor(result),
      generatedAt: generatedAt,
      generatedBy: safeText(options.generatedBy || 'ZitBio administrator'),
      revision: Number(options.revision || 0),
      modelVersion: safeText(result.modelVersion || 'Unknown model'),
      driver: safeText(result.driver || 'none'),
      driverLabel: safeText(result.driverLabel || 'No seasonal adjustment'),
      waterQuality: copyData(result.waterQuality),
      conditions: copyData(result.conditions),
      decision: copyData(result.decision),
      estimatedAreaHa: area,
      defaultAreaHa: defaultArea,
      approvedObservationCount: Math.max(0, Number(options.approvedObservationCount || 0)),
      changedPopulationCount: changedPopulationCount,
      changedContextCount: changedContextCount,
      changedInputCount: changedPopulationCount + changedContextCount,
      speciesChanges: speciesChanges,
      totals: {
        from: asNumber(result.totals && result.totals.from),
        to: asNumber(result.totals && result.totals.to),
        delta: asNumber(result.totals && result.totals.delta),
        percent: asNumber(result.totals && result.totals.percent),
        densityFrom: asNumber(result.totals && result.totals.densityFrom),
        densityTo: asNumber(result.totals && result.totals.densityTo)
      },
      effects: (result.effects || []).map(function (effect) {
        return {
          key: safeText(effect.key),
          label: safeText(effect.label),
          status: safeText(effect.status),
          decision: copyData(effect.decision),
          direct: !!effect.direct,
          indirect: !!effect.indirect,
          hasConditionalInfluence: !!effect.hasConditionalInfluence
        };
      }).sort(function (a, b) { return a.label.localeCompare(b.label); }),
      pathways: (result.pathways || []).map(function (path) {
        return {
          target: safeText(path.target),
          targetKey: safeText(path.targetKey),
          status: safeText(path.status),
          depth: Number(path.depth || 0),
          text: safeText(path.text),
          mechanism: safeText(path.mechanism),
          conditions: safeText(path.conditions),
          directOrIndirect: safeText(path.directOrIndirect),
          source: copySource(path.source)
        };
      }).sort(function (a, b) {
        return a.depth - b.depth || a.text.localeCompare(b.text);
      }),
      recommendations: recommendations,
      hypotheticals: (result.hypotheticals || []).map(copyHypothetical),
      unknownMagnitudes: (result.unknownMagnitudes || []).map(safeText),
      evidence: evidence,
      context: context
    };
  }

  function formatNumber(value, places) {
    if (value == null || !isFinite(value)) return 'Not available';
    var digits = places == null ? 0 : places;
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function signed(value, places) {
    if (value == null || !isFinite(value)) return 'Not available';
    if (value === 0) return formatNumber(0, places);
    return (value > 0 ? '+' : '-') + formatNumber(Math.abs(value), places);
  }

  function percent(value) {
    return value == null ? 'New value' : signed(value, 1) + '%';
  }

  function statusLabel(status) {
    if (!status) return 'Unchanged';
    if (status === 'uncertain') return 'Competing pressures';
    if (status === 'conditional') return 'Conditional risk';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function directionPhrase(direction) {
    if (direction === 'up' || direction === 'increases') return 'the response rises';
    if (direction === 'down' || direction === 'decreases') return 'the response falls';
    return 'the response does not change';
  }

  function branchPhrase(direction) {
    if (direction === 'up') return 'it rises';
    if (direction === 'down') return 'it falls';
    return 'it does not change';
  }

  function lowerFirst(text) {
    return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }

  function joinWords(values) {
    if (!values || !values.length) return '';
    if (values.length === 1) return values[0];
    return values.slice(0, -1).join(', ') + ' and ' + values[values.length - 1];
  }

  /* Outcomes arrive structured, so the reading sentence is phrased once here and
     the same words appear whether the reader is looking at the card or the app. */
  function outcomeText(outcome) {
    var when = String(outcome.when || '');
    if (when) when = when.charAt(0).toLowerCase() + when.slice(1);
    if (outcome.then) return 'if ' + when + ', ' + outcome.then;
    return 'if ' + when + ', ' + directionPhrase(outcome.direction);
  }

  function dateTimeLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return safeText(iso);
    return date.toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function reportFilename(snapshot) {
    var date = String(snapshot.generatedAt || '').slice(0, 10) || 'undated';
    return 'zitbio-scenario-brief_' + date + '_' + snapshot.scenarioId.toLowerCase() + '.pdf';
  }

  function summaryText(snapshot) {
    if (snapshot.decision) return snapshot.decision.title + '. ' + snapshot.decision.action + ' ' + snapshot.decision.basis;
    var first = snapshot.changedInputCount
      ? 'This scenario changes ' + snapshot.changedInputCount + ' input' + (snapshot.changedInputCount === 1 ? '' : 's') +
        ' from the registered reference state.'
      : 'This scenario records the registered reference state without edited population or seasonal inputs.';
    var total = ' Total animals move from ' + formatNumber(snapshot.totals.from) + ' to ' + formatNumber(snapshot.totals.to) +
      ' (' + signed(snapshot.totals.delta) + ', ' + percent(snapshot.totals.percent) + ').';
    var network = snapshot.effects.length
      ? ' The evidence network identifies ' + snapshot.effects.length + ' affected component' + (snapshot.effects.length === 1 ? '' : 's') +
        ' across ' + snapshot.pathways.length + ' active pathway' + (snapshot.pathways.length === 1 ? '' : 's') + '.'
      : ' No ecological pathways are activated until a population or seasonal input changes.';
    return first + total + network + ' Responses are directional and conditional, not forecasts of magnitude or date.';
  }

  function createWriter(doc, snapshot) {
    var pageW = doc.internal.pageSize.getWidth();
    var pageH = doc.internal.pageSize.getHeight();
    var marginX = 48;
    var contentW = pageW - marginX * 2;
    var y = 54;

    function color(method, value) {
      doc[method](value[0], value[1], value[2]);
    }

    function setFont(size, style, textColor) {
      doc.setFont('helvetica', style || 'normal');
      doc.setFontSize(size);
      color('setTextColor', textColor || COLORS.ink);
    }

    function pageChrome() {
      color('setFillColor', COLORS.forest);
      doc.rect(0, 0, pageW, 7, 'F');
      setFont(8, 'bold', COLORS.forest);
      doc.text('ZITBIO  /  ECOSYSTEM SCENARIO BRIEF', marginX, 30);
      setFont(8, 'normal', COLORS.muted);
      doc.text(snapshot.scenarioId, pageW - marginX, 30, { align: 'right' });
    }

    function addPage() {
      doc.addPage();
      pageChrome();
      y = 54;
    }

    function ensure(needed) {
      if (y + needed > pageH - 58) addPage();
    }

    function wrappedLines(text, width, size, style) {
      setFont(size || 10, style || 'normal');
      return doc.splitTextToSize(safeText(text), width);
    }

    function paragraph(text, options) {
      options = options || {};
      var size = options.size || 10;
      var lineHeight = options.lineHeight || 14;
      var width = options.width || contentW;
      var x = options.x == null ? marginX : options.x;
      var lines = wrappedLines(text, width, size, options.style || 'normal');
      lines.forEach(function (line) {
        ensure(lineHeight + 2);
        setFont(size, options.style || 'normal', options.color || COLORS.ink);
        doc.text(line, x, y);
        y += lineHeight;
      });
      if (options.after !== false) y += options.gap == null ? 6 : options.gap;
    }

    function section(title, kicker) {
      ensure(42);
      if (kicker) {
        setFont(8, 'bold', COLORS.green);
        doc.text(safeText(kicker).toUpperCase(), marginX, y);
        y += 13;
      }
      setFont(15, 'bold', COLORS.ink);
      doc.text(safeText(title), marginX, y);
      y += 8;
      color('setDrawColor', COLORS.line);
      doc.setLineWidth(0.8);
      doc.line(marginX, y, pageW - marginX, y);
      y += 18;
    }

    function table(headers, rows, widths) {
      var lineHeight = 11;
      var headerHeight = 25;

      function drawHeader() {
        ensure(headerHeight + 4);
        color('setFillColor', COLORS.pale);
        doc.rect(marginX, y, contentW, headerHeight, 'F');
        var x = marginX;
        headers.forEach(function (header, index) {
          setFont(8.5, 'bold', COLORS.forest);
          doc.text(safeText(header), x + 6, y + 16);
          x += widths[index];
        });
        y += headerHeight;
      }

      drawHeader();
      rows.forEach(function (row, rowIndex) {
        var cells = row.map(function (cell, index) {
          return wrappedLines(cell, widths[index] - 12, 9, 'normal');
        });
        var lines = cells.reduce(function (max, item) { return Math.max(max, item.length); }, 1);
        var height = Math.max(26, lines * lineHeight + 10);
        if (y + height > pageH - 58) {
          addPage();
          drawHeader();
        }
        if (rowIndex % 2) {
          color('setFillColor', COLORS.paper);
          doc.rect(marginX, y, contentW, height, 'F');
        }
        var x = marginX;
        cells.forEach(function (cellLines, index) {
          setFont(9, index === 0 ? 'bold' : 'normal', COLORS.ink);
          doc.text(cellLines, x + 6, y + 16);
          x += widths[index];
        });
        color('setDrawColor', COLORS.line);
        doc.setLineWidth(0.4);
        doc.line(marginX, y + height, pageW - marginX, y + height);
        y += height;
      });
      y += 12;
    }

    function bulletList(items) {
      (items || []).forEach(function (item) {
        var lines = wrappedLines(item, contentW - 20, 9.5, 'normal');
        ensure(lines.length * 13 + 8);
        color('setFillColor', COLORS.green);
        doc.circle(marginX + 4, y - 3, 2, 'F');
        setFont(9.5, 'normal', COLORS.ink);
        doc.text(lines, marginX + 16, y);
        y += lines.length * 13 + 7;
      });
      y += 5;
    }

    /* A fork card is the inspector's hypothetical block in print: the worlds the
       state allows, then the reading that would close the question. */
    function hypothesisCard(item) {
      var state = item.state === 'conditional' ? 'CONDITIONAL' : 'UNDECIDED';
      var bullets = [];
      if (item.state === 'undecided') {
        item.camps.forEach(function (camp) {
          var verb = camp.direction === 'increases' ? 'rises' : 'falls';
          var leg = camp.legs[0];
          var why = leg ? ' ' + leg.why : '';
          /* A short name and a plain phrase keep the sentence readable; the full
             label and the step-by-step route stay in the response table and in
             Appendix A, where they are identifiers rather than prose. */
          var via = leg && leg.via && leg.via.length ? ' Reaches it through ' + joinWords(leg.via.map(lowerFirst)) + '.' : '';
          bullets.push('If ' + camp.drivers.join(' and ') + ' dominates: ' + lowerFirst(item.short) + ' ' + verb + '.' + why + via);
        });
        if (item.inherited) {
          bullets.push('One question rather than several: every route passes through ' + lowerFirst(item.inherited.short) + ', so the reading that settles that settles this too.');
        }
      } else {
        item.branches.forEach(function (branch) {
          branch.options.forEach(function (option) {
            bullets.push('If ' + option.when + ': ' + branchPhrase(option.direction) + '. ' + option.because);
          });
        });
      }
      var notes = [];
      if (item.settles) {
        notes.push('What would settle it: ' + item.settles.observable + '. ' + item.settles.how);
        item.settles.readings.forEach(function (reading) {
          notes.push(reading.reading + ': ' + reading.then + '.');
        });
      }
      var headingLines = wrappedLines(item.label + '  |  ' + state, contentW - 24, 9, 'bold');
      var bulletLines = bullets.map(function (text) { return wrappedLines(text, contentW - 46, 9, 'normal'); });
      var noteLines = notes.map(function (text) { return wrappedLines(text, contentW - 34, 8.5, 'italic'); });
      var height = 16 + headingLines.length * 11 + 6;
      bulletLines.forEach(function (lines) { height += lines.length * 11 + 5; });
      if (noteLines.length) {
        height += 5;
        noteLines.forEach(function (lines) { height += lines.length * 10 + 4; });
      }
      height += 8;
      ensure(height + 8);

      color('setFillColor', COLORS.amberPale);
      color('setDrawColor', COLORS.line);
      doc.roundedRect(marginX, y, contentW, height, 5, 5, 'FD');
      color('setFillColor', COLORS.amber);
      doc.rect(marginX, y, 3, height, 'F');

      var cardY = y + 14;
      setFont(8, 'bold', COLORS.amber);
      doc.text(headingLines, marginX + 12, cardY);
      cardY += headingLines.length * 11 + 5;
      bulletLines.forEach(function (lines) {
        color('setFillColor', COLORS.amber);
        doc.circle(marginX + 16, cardY - 3, 1.6, 'F');
        setFont(9, 'normal', COLORS.ink);
        doc.text(lines, marginX + 26, cardY);
        cardY += lines.length * 11 + 5;
      });
      if (noteLines.length) {
        cardY += 2;
        noteLines.forEach(function (lines) {
          setFont(8.5, 'italic', COLORS.muted);
          doc.text(lines, marginX + 16, cardY);
          cardY += lines.length * 10 + 4;
        });
      }
      y += height + 8;
    }

    function recommendationCard(item, evidenceById) {
      var triggerLines = wrappedLines(item.trigger, contentW - 108, 8.5, 'bold');
      var actionLines = wrappedLines(item.action, contentW - 24, 10, 'bold');
      var rationaleLines = wrappedLines(item.rationale, contentW - 24, 9, 'normal');
      var sourceNames = item.evidenceIds.map(function (id) {
        return evidenceById[id] ? evidenceById[id].title : id;
      });
      var evidenceLines = sourceNames.length
        ? wrappedLines('Evidence: ' + sourceNames.join('; '), contentW - 24, 8, 'normal')
        : ['Evidence: model limitation / local measurement gap'];
      var decideLines = item.decides ? wrappedLines('What it decides: ' + item.decides + '.', contentW - 24, 8.5, 'italic') : [];
      var outcomeLines = (item.outcomes || []).length
        ? wrappedLines('Readings: ' + item.outcomes.map(outcomeText).join('; ') + '.', contentW - 24, 8, 'normal')
        : [];
      var height = 22 + triggerLines.length * 11 + actionLines.length * 13 + rationaleLines.length * 12 + evidenceLines.length * 10 + decideLines.length * 10 + outcomeLines.length * 10 + 16;
      ensure(height + 10);

      var fill = item.priority === 'high' ? COLORS.redPale : (item.priority === 'medium' ? COLORS.amberPale : COLORS.pale);
      var accent = item.priority === 'high' ? COLORS.red : (item.priority === 'medium' ? COLORS.amber : COLORS.green);
      color('setFillColor', fill);
      color('setDrawColor', COLORS.line);
      doc.roundedRect(marginX, y, contentW, height, 6, 6, 'FD');
      color('setFillColor', accent);
      doc.rect(marginX, y, 4, height, 'F');

      var cardY = y + 16;
      setFont(8, 'bold', accent);
      doc.text(item.priority.toUpperCase(), marginX + 14, cardY);
      setFont(8.5, 'bold', COLORS.muted);
      doc.text(triggerLines, marginX + 88, cardY);
      cardY += Math.max(12, triggerLines.length * 11) + 6;
      setFont(10, 'bold', COLORS.ink);
      doc.text(actionLines, marginX + 14, cardY);
      cardY += actionLines.length * 13 + 5;
      setFont(9, 'normal', COLORS.ink);
      doc.text(rationaleLines, marginX + 14, cardY);
      cardY += rationaleLines.length * 12 + 5;
      if (decideLines.length) {
        setFont(8.5, 'italic', COLORS.ink);
        doc.text(decideLines, marginX + 14, cardY);
        cardY += decideLines.length * 10 + 3;
      }
      if (outcomeLines.length) {
        setFont(8, 'normal', COLORS.ink);
        doc.text(outcomeLines, marginX + 14, cardY);
        cardY += outcomeLines.length * 10 + 3;
      }
      setFont(8, 'italic', COLORS.muted);
      doc.text(evidenceLines, marginX + 14, cardY);
      y += height + 10;
    }

    function pathwayCard(path, index) {
      var route = wrappedLines(path.text, contentW - 24, 10, 'bold');
      var mechanism = wrappedLines('Mechanism: ' + path.mechanism, contentW - 24, 8.5, 'normal');
      var conditions = wrappedLines('Conditions: ' + path.conditions, contentW - 24, 8.5, 'normal');
      var evidence = wrappedLines('Evidence: ' + (path.source ? path.source.title + ' (Tier ' + path.source.tier + ')' : 'No source attached'), contentW - 24, 8, 'normal');
      var height = 23 + route.length * 13 + mechanism.length * 11 + conditions.length * 11 + evidence.length * 10 + 15;
      ensure(height + 8);
      color('setDrawColor', COLORS.line);
      doc.roundedRect(marginX, y, contentW, height, 5, 5, 'S');
      var cardY = y + 15;
      setFont(8, 'bold', COLORS.green);
      doc.text('PATH ' + String(index + 1).padStart(2, '0') + '  |  ' + statusLabel(path.status).toUpperCase() + '  |  ' + (path.directOrIndirect === 'direct' ? 'DIRECT' : path.depth + ' STEPS'), marginX + 12, cardY);
      cardY += 15;
      setFont(10, 'bold', COLORS.ink);
      doc.text(route, marginX + 12, cardY);
      cardY += route.length * 13 + 5;
      setFont(8.5, 'normal', COLORS.ink);
      doc.text(mechanism, marginX + 12, cardY);
      cardY += mechanism.length * 11 + 4;
      setFont(8.5, 'normal', COLORS.ink);
      doc.text(conditions, marginX + 12, cardY);
      cardY += conditions.length * 11 + 5;
      setFont(8, 'italic', COLORS.muted);
      doc.text(evidence, marginX + 12, cardY);
      y += height + 8;
    }

    function sourceEntry(source, index) {
      var title = wrappedLines((index + 1) + '. ' + source.title, contentW - 96, 9.5, 'bold');
      var height = Math.max(45, title.length * 12 + 25);
      ensure(height);
      setFont(9.5, 'bold', COLORS.ink);
      doc.text(title, marginX, y);
      setFont(8, 'bold', COLORS.green);
      doc.text('TIER ' + source.tier, pageW - marginX, y, { align: 'right' });
      y += title.length * 12 + 2;
      setFont(8.5, 'normal', COLORS.muted);
      doc.text(source.label, marginX, y);
      if (source.url && typeof doc.textWithLink === 'function') {
        doc.textWithLink('Open source online', pageW - marginX, y, { url: source.url, align: 'right' });
      }
      y += 18;
      color('setDrawColor', COLORS.line);
      doc.line(marginX, y - 7, pageW - marginX, y - 7);
    }

    function finishFooters() {
      var totalPages = doc.getNumberOfPages();
      for (var page = 1; page <= totalPages; page++) {
        doc.setPage(page);
        color('setDrawColor', COLORS.line);
        doc.setLineWidth(0.6);
        doc.line(marginX, pageH - 37, pageW - marginX, pageH - 37);
        setFont(7.5, 'normal', COLORS.muted);
        doc.text(snapshot.modelVersion + '  |  ' + snapshot.scenarioId, marginX, pageH - 23);
        doc.text('Page ' + page + ' of ' + totalPages, pageW - marginX, pageH - 23, { align: 'right' });
      }
    }

    return {
      getY: function () { return y; },
      setY: function (value) { y = value; },
      pageChrome: pageChrome,
      ensure: ensure,
      paragraph: paragraph,
      section: section,
      table: table,
      bulletList: bulletList,
      hypothesisCard: hypothesisCard,
      recommendationCard: recommendationCard,
      pathwayCard: pathwayCard,
      sourceEntry: sourceEntry,
      finishFooters: finishFooters,
      font: setFont,
      fill: function (value) { color('setFillColor', value); },
      draw: function (value) { color('setDrawColor', value); },
      text: function (text, x, atY, options) { doc.text(safeText(text), x, atY, options); },
      rect: function (x, atY, width, height, style) { doc.rect(x, atY, width, height, style); },
      marginX: marginX,
      contentW: contentW,
      pageW: pageW
    };
  }

  function writeReport(doc, snapshot) {
    var writer = createWriter(doc, snapshot);
    var marginX = writer.marginX;
    var pageW = writer.pageW;

    writer.fill(COLORS.forest);
    writer.rect(0, 0, pageW, 12, 'F');
    writer.font(9, 'bold', COLORS.green);
    writer.text('ZITBIO  /  BIODIVERSITY MONITORING SYSTEM', marginX, 47);
    writer.font(24, 'bold', COLORS.ink);
    writer.text('Ecosystem Scenario Brief', marginX, 76);
    writer.font(10, 'normal', COLORS.muted);
    writer.text(snapshot.scenarioId + '  |  ' + snapshot.modelVersion, marginX, 98);
    writer.setY(124);
    writer.paragraph(summaryText(snapshot), { size: 11, lineHeight: 16, width: writer.contentW, gap: 12 });

    writer.fill(COLORS.pale);
    writer.draw(COLORS.line);
    var metaY = writer.getY();
    writer.rect(marginX, metaY, writer.contentW, 54, 'FD');
    writer.font(8, 'bold', COLORS.green);
    writer.text('GENERATED', marginX + 14, metaY + 17);
    writer.text('PREPARED BY', marginX + 176, metaY + 17);
    writer.text('SEASON', marginX + 338, metaY + 17);
    writer.font(9.5, 'normal', COLORS.ink);
    writer.text(dateTimeLabel(snapshot.generatedAt), marginX + 14, metaY + 36);
    writer.text(snapshot.generatedBy, marginX + 176, metaY + 36);
    writer.text(snapshot.driverLabel, marginX + 338, metaY + 36);
    writer.setY(metaY + 76);

    writer.section('Scenario at a glance', '01 / Inputs');
    writer.table(
      ['Measure', 'Reference', 'Scenario', 'Change'],
      [[
        'Total animals',
        formatNumber(snapshot.totals.from),
        formatNumber(snapshot.totals.to),
        signed(snapshot.totals.delta) + '  |  ' + percent(snapshot.totals.percent)
      ], [
        'Estimated density',
        snapshot.totals.densityFrom == null ? 'Not available' : formatNumber(snapshot.totals.densityFrom, 2) + ' / ha',
        snapshot.totals.densityTo == null ? 'Not available' : formatNumber(snapshot.totals.densityTo, 2) + ' / ha',
        snapshot.totals.densityFrom == null || snapshot.totals.densityTo == null
          ? 'Not available'
          : signed(snapshot.totals.densityTo - snapshot.totals.densityFrom, 2) + ' / ha'
      ]],
      [150, 110, 110, 129]
    );

    writer.paragraph(
      'Context: ' + snapshot.driverLabel + '. Estimated whole-park area: ' +
      (snapshot.estimatedAreaHa == null ? 'not available' : formatNumber(snapshot.estimatedAreaHa, 1) + ' ha') +
      '. Approved operational observations available: ' + snapshot.approvedObservationCount + '.',
      { size: 9.5, lineHeight: 13, color: COLORS.muted, gap: 10 }
    );

    writer.section('Population inputs', 'Baseline compared with scenario');
    writer.table(
      ['Species', 'Reference', 'Scenario', 'Change', 'Percent'],
      snapshot.speciesChanges.map(function (item) {
        return [item.label + '\n' + item.scientificName, formatNumber(item.from), formatNumber(item.to), signed(item.delta), percent(item.percent)];
      }),
      [169, 82, 82, 82, 84]
    );

    if (snapshot.waterQuality) {
      var water = snapshot.waterQuality;
      writer.section('Water quality in this scenario', 'Sample and screening basis');
      writer.paragraph(water.sampleLabel + ' | ' + water.provenance + (water.site ? ' | ' + water.site : '') + (water.sampledAt ? ' | ' + water.sampledAt : ''), { size: 9.5, lineHeight: 14 });
      if (water.note) writer.paragraph(water.note, { size: 9, lineHeight: 13, color: COLORS.muted });
      if (water.readings.length) writer.table(['Parameter', 'Entered value', 'Unit'], water.readings.map(function (reading) { return [reading.label, String(reading.value), reading.unit]; }), [250, 125, 124]);
      writer.paragraph('Unmeasured: ' + (water.missing.length ? water.missing.join(', ') : 'none of the displayed numeric inputs') + '.', { size: 9, lineHeight: 13 });
      var waterConditions = { unmeasured: 'not assessed', notObserved: 'no indication observed', suspected: 'suspected', adequate: 'at reference level', limited: 'limited', dry: 'water point dry' };
      writer.paragraph('Access: ' + waterConditions[water.availability] + '. Contamination: ' + waterConditions[water.contamination] + '. Bloom: ' + waterConditions[water.bloom] + '.', { size: 9, lineHeight: 13 });
      writer.paragraph(water.label + '. ' + water.summary, { size: 9.5, lineHeight: 14 });
      writer.paragraph(water.basis, { size: 9, lineHeight: 13, style: 'italic', color: COLORS.muted });
      writer.bulletList(water.gaps);
    }
    if (snapshot.conditions) {
      var descriptions = { unmeasured: 'not measured', exposed: 'exposed ground / trampling dominates', nutrientReturn: 'cover retained / nutrient return dominates', disturbed: 'disturbed banks connected to water', protected: 'banks protected from animal disturbance', dense: 'dense woody cover competes with grass', open: 'open woody cover shelters grass' };
      writer.paragraph('Scenario conditions: ' + Object.keys(snapshot.conditions).map(function (key) { return key + ': ' + descriptions[snapshot.conditions[key]]; }).join('; ') + '.', { size: 9, lineHeight: 13 });
    }

    writer.section('Ecosystem response and action', '02 / Model response');
    if (!snapshot.effects.length) {
      writer.paragraph('No pathways are active because the scenario matches the reference state and no seasonal driver is selected.', { size: 10.5, lineHeight: 15 });
    } else {
      writer.table(
        ['Component', 'Response / possible outcomes', 'Action / basis'],
        snapshot.effects.map(function (effect) {
          var pathType = effect.direct && effect.indirect ? 'Direct + indirect' : (effect.direct ? 'Direct' : 'Indirect');
          if (effect.hasConditionalInfluence) pathType += ' + conditional';
          return effect.decision ? [effect.label, effect.decision.response + '\n' + effect.decision.possibilities.join(' / '), effect.decision.action + '\n' + effect.decision.basis] : [effect.label, statusLabel(effect.status), pathType];
        }),
        [130, 150, 219]
      );
      writer.paragraph('Every component receives an action. Competing pathways retain their possible outcomes; the precautionary action is not a claim that the adverse outcome will occur. Directional agreement is conditional on the entered scenario and does not quantify size, probability or timing.', { size: 9, lineHeight: 13, style: 'italic', color: COLORS.muted });
      var openForks = snapshot.hypotheticals.filter(function (item) { return item.state !== 'settled'; });
      var settledReadings = snapshot.hypotheticals.filter(function (item) { return item.state === 'settled'; });
      if (openForks.length) {
        writer.paragraph('Undecided and conditional responses, and what would settle them', { size: 11, lineHeight: 15, style: 'bold', color: COLORS.ink, gap: 8 });
        writer.paragraph('A question mark is not a missing number. It is a fork the network cannot close on its own, so each one is stated with the field reading that would close it.', { size: 9, lineHeight: 13, style: 'italic', color: COLORS.muted });
        openForks.forEach(function (item) { writer.hypothesisCard(item); });
      }
      if (settledReadings.length) {
        writer.paragraph('What would change the settled readings', { size: 11, lineHeight: 15, style: 'bold', color: COLORS.ink, gap: 8 });
        writer.table(
          ['Component', 'Response', 'Reads differently if'],
          settledReadings.map(function (item) {
            var condition = item.drivers.length
              ? item.drivers.join(' or ') + ' moves the other way'
              : 'an opposing influence appears';
            if (item.branches.length) condition += '; a conditional relationship also points here';
            return [item.label, statusLabel(item.direction), condition];
          }),
          [170, 96, 233]
        );
      }
    }

    writer.section('Recommended field and management actions', '03 / Decision guidance');
    var evidenceById = {};
    snapshot.evidence.forEach(function (source) { evidenceById[source.id] = source; });
    snapshot.recommendations.forEach(function (item) { writer.recommendationCard(item, evidenceById); });

    writer.section('Interpretation limits', 'Read before acting');
    writer.bulletList(snapshot.unknownMagnitudes);

    writer.ensure(170);
    writer.section('Active pathway register', 'Appendix A');
    if (!snapshot.pathways.length) {
      writer.paragraph('No pathways are active for this reference scenario.', { size: 10 });
    } else {
      writer.paragraph('Every active pathway is listed below. Direct pathways appear before longer chains.', { size: 9.5, color: COLORS.muted });
      snapshot.pathways.forEach(function (path, index) { writer.pathwayCard(path, index); });
    }

    writer.section('Research evidence register', 'Appendix B');
    writer.paragraph('The model uses local, regional, analogous and method evidence. Source tiers describe provenance, not certainty for this park. Links are included for review.', { size: 9.5, lineHeight: 14, color: COLORS.muted });
    snapshot.evidence.forEach(function (source, index) { writer.sourceEntry(source, index); });

    writer.section('Method and use boundary', 'Appendix C');
    writer.paragraph('This brief is a snapshot of one administrator-defined scenario. Population arithmetic is exact for the entered values. Ecological responses are qualitative directions produced by an evidence-linked signed network. The report must not be read as a carrying-capacity calculation, a forecast, or proof that a response has occurred.', { size: 9.5, lineHeight: 14 });
    writer.paragraph('Recommended actions prioritise measurements that can confirm or reject the active pathways. Management decisions should be revisited when field measurements, surveyed boundaries or calibrated intake and resource data become available.', { size: 9.5, lineHeight: 14 });

    writer.finishFooters();
  }

  function createPdf(options) {
    options = options || {};
    if (typeof options.jsPDF !== 'function') throw new Error('The PDF library is unavailable.');
    var snapshot = options.snapshot || buildSnapshot(options);
    var doc = new options.jsPDF({ unit: 'pt', format: 'a4', compress: true });
    if (typeof doc.setProperties === 'function') {
      doc.setProperties({
        title: 'ZitBio Ecosystem Scenario Brief - ' + snapshot.scenarioId,
        subject: 'Evidence-bounded ecosystem scenario report',
        author: 'ZitBio Biodiversity Monitoring System',
        creator: 'ZitBio'
      });
    }
    writeReport(doc, snapshot);
    var filename = reportFilename(snapshot);
    if (options.save !== false) doc.save(filename);
    return { doc: doc, snapshot: snapshot, filename: filename };
  }

  return {
    buildSnapshot: buildSnapshot,
    createPdf: createPdf,
    reportFilename: reportFilename,
    safeText: safeText,
    scenarioIdFor: scenarioIdFor
  };
}));
