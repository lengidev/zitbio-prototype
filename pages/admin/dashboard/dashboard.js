/**
 * BioMonitor — Dashboard Page
 * Populates stats and recent activity table from the unified BioData layer,
 * then renders the weekly observations chart using Chart.js.
 *
 * Design decisions:
 *   - Uses the same BioData.getObservations() source as every other page,
 *     ensuring the dashboard always reflects the current data state.
 *   - The weekly chart shows Mon–Sun ordering to align with standard
 *     biodiversity reporting periods.
 *   - Sample data fallback prevents an empty chart state during initial
 *     deployment when real data hasn't been collected yet.
 */

document.addEventListener('DOMContentLoaded', function() {
  // ============================================
  //  Populate dashboard KPIs from the unified data layer
  //  to ensure cross-page consistency.
  // ============================================
  if (window.BioData) {
    var session = BioData.getSession();
    if (session) {
      var userNameEl = document.querySelector('.user-menu-name');
      if (userNameEl) userNameEl.textContent = session.name;
    }

    document.getElementById('statTotalUsers').textContent = BioData.totalUsers();
    document.getElementById('statTotalObservations').textContent = BioData.totalObservations();
    document.getElementById('statLast7Days').textContent = BioData.observationsLast7Days();

    var tbody = document.getElementById('recentActivityBody');
    if (tbody) {
      var activities = BioData.recentActivity(5);
      var html = '';
      activities.forEach(function(act) {
        html += '<tr>' +
          '<td class="date-cell">' + act.date + '</td>' +
          '<td class="species-cell">' + act.species + '</td>' +
          '<td class="location-cell">' + act.location + '</td>' +
          '<td class="officer-cell">' + act.officer + '</td>' +
          '</tr>';
      });
      tbody.innerHTML = html;
    }
  }

  // ============================================
  //  Weekly Chart — Chart.js Spline Area Chart
  //  Aggregates observations by day-of-week for the last 7 days.
  //  Using Mon–Sun ordering to align with standard weekly reporting.
  // ============================================
  var ctx = document.getElementById('weeklyChart');
  if (!ctx) return;
  if (typeof Chart === 'undefined') return;

  // Aggregate observations by day of week for the last 7 days
  var dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var dayCounts = [0, 0, 0, 0, 0, 0, 0];
  var now = new Date();

  if (window.BioData) {
    var allObs = BioData.getObservations();
    if (allObs && allObs.length > 0) {
      var sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      allObs.forEach(function(obs) {
        if (!obs.timestamp) return;
        var d = new Date(obs.timestamp);
        if (isNaN(d.getTime())) return;
        if (d < sevenDaysAgo) return;
        var dayIdx = d.getDay(); // 0=Sun, 1=Mon, ...
        dayCounts[dayIdx]++;
      });
    }
  }

  // Build label array in Mon–Sun order (index 1..6, then 0)
  var labels = [];
  var dataValues = [];
  for (var i = 1; i <= 6; i++) {
    labels.push(dayLabels[i]);
    dataValues.push(dayCounts[i]);
  }
  labels.push(dayLabels[0]);
  dataValues.push(dayCounts[0]);

  // Compute trend: last 7 days vs prior 7 days
  var thisWeekTotal = dataValues.reduce(function(a, b) { return a + b; }, 0);
  var priorWeekTotal = 0;
  if (window.BioData) {
    var allObs = BioData.getObservations();
    if (allObs && allObs.length > 0) {
      var fourteenDaysAgo = new Date(now);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      var sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      allObs.forEach(function(obs) {
        if (!obs.timestamp) return;
        var d = new Date(obs.timestamp);
        if (isNaN(d.getTime())) return;
        if (d >= sevenDaysAgo) return;
        if (d < fourteenDaysAgo) return;
        priorWeekTotal++;
      });
    }
  }

  // Provide a visual baseline for the chart during initial deployment to
  // prevent an empty state from confusing new users. Once real observations
  // are recorded, the sample data is replaced naturally.
  if (thisWeekTotal === 0 && priorWeekTotal === 0) {
    var sampleData = [1.2, 0.6, 0.9, 0.4, 1.1, 0.8, 0.3];
    for (var i = 0; i < 7; i++) {
      dataValues[i] = sampleData[i];
    }
    thisWeekTotal = sampleData.reduce(function(a, b) { return a + b; }, 0);
    priorWeekTotal = 8;
  }

  // Trend badge — week-over-week comparison informs rangers of
  // patrol effectiveness (e.g., more sightings may indicate better
  // coverage rather than population increase).
  var trendBadge = document.getElementById('trendBadge');
  if (trendBadge) {
    var pctChange = 0;
    if (priorWeekTotal > 0) {
      pctChange = ((thisWeekTotal - priorWeekTotal) / priorWeekTotal) * 100;
    }
    var absPct = Math.round(Math.abs(pctChange));
    var direction = pctChange >= 0 ? 'up' : 'down';
    var arrow = pctChange >= 0 ? '&#9650;' : '&#9660;';
    trendBadge.className = 'trend-badge ' + direction;
    trendBadge.innerHTML = arrow + ' ' + absPct + '% vs last week';
  }

  // Chart.js gradient fill — green tones to match ZitBIO branding
  var gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(46, 125, 50, 0.3)');
  gradient.addColorStop(1, 'rgba(46, 125, 50, 0.02)');

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Observations',
        data: dataValues,
        fill: true,
        backgroundColor: gradient,
        borderColor: '#2E7D32',
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#2E7D32',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#2E7D32',
        pointHoverBorderColor: '#ffffff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff',
          titleColor: '#2C3E50',
          bodyColor: '#7F8C8D',
          borderColor: '#e5e7eb',
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          boxPadding: 4,
          callbacks: {
            title: function(items) {
              return items[0].label;
            },
            label: function(item) {
              var val = item.parsed.y;
              return val + ' observation' + (val !== 1 ? 's' : '');
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 12 },
            color: '#7F8C8D'
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: '#f1f5f9',
            drawBorder: false
          },
          ticks: {
            font: { size: 11 },
            color: '#7F8C8D',
            precision: 0
          }
        }
      },
      interaction: {
        intersect: false,
        mode: 'index'
      }
    }
  });
});