// ZitBio: Dashboard Page. KPI cards, recent activity and the weekly chart, all
// fed from the BioData layer so every page reports the same numbers.
function renderDashboardStats() {
  if (!window.BioData) return;
  document.getElementById('statTotalUsers').textContent = BioData.totalUsers();
  document.getElementById('statTotalObservations').textContent = BioData.totalObservations();
  document.getElementById('statPendingReviews').textContent = BioData.pendingObservations();
  document.getElementById('statTotalIndividuals').textContent = BioData.totalIndividuals();
  var tbody = document.getElementById('recentActivityBody');
  if (!tbody) return;
  var html = '';
  BioData.recentActivity(5).forEach(function(act) {
    html += '<tr>' +
      '<td class="date-cell">' + escapeActivity(act.date) + '</td>' +
      '<td class="species-cell">' + escapeActivity(act.species) + '</td>' +
      '<td class="location-cell">' + escapeActivity(act.location) + '</td>' +
      '<td class="officer-cell">' + escapeActivity(act.officer) + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function escapeActivity(value) { return window.BioEscape.escapeHtml(value); }

function computeWeeklyWindow() {
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var counts = [0, 0, 0, 0, 0, 0, 0];
  var labels = [];
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var windowDays = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(today.getDate() - i);
    windowDays.push(d);
    labels.push(dayNames[d.getDay()]);
  }
  var allObs = window.BioData ? BioData.getObservations() : [];
  (allObs || []).forEach(function(obs) {
    if (!obs.timestamp) return;
    var ts = new Date(obs.timestamp);
    if (isNaN(ts.getTime())) return;
    for (var w = 0; w < windowDays.length; w++) {
      if (ts.getFullYear() === windowDays[w].getFullYear() &&
          ts.getMonth() === windowDays[w].getMonth() &&
          ts.getDate() === windowDays[w].getDate()) {
        counts[w]++;
        break;
      }
    }
  });
  return { labels: labels, counts: counts };
}

document.addEventListener('DOMContentLoaded', function() {
  if (window.BioData) {
    var session = BioData.getSession();
    if (session) {
      var userNameEl = document.querySelector('.user-menu-name');
      if (userNameEl) userNameEl.textContent = session.name;
    }
  }
  renderDashboardStats();
  var ctx = document.getElementById('weeklyChart');
  if (!ctx || typeof Chart === 'undefined') return;
  var now = new Date();
  var weekly = computeWeeklyWindow();
  var labels = weekly.labels;
  var dataValues = weekly.counts;
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
        if (isNaN(d.getTime()) || d >= sevenDaysAgo || d < fourteenDaysAgo) return;
        priorWeekTotal++;
      });
    }
  }
  var trendBadge = document.getElementById('trendBadge');
  if (trendBadge) {
    if (thisWeekTotal === 0) {
      trendBadge.className = 'trend-badge flat';
      trendBadge.innerHTML = 'No sightings this week';
    } else if (priorWeekTotal === 0) {
      trendBadge.className = 'trend-badge up';
      trendBadge.innerHTML = '&#9650; New sightings this week';
    } else {
      var pctChange = ((thisWeekTotal - priorWeekTotal) / priorWeekTotal) * 100;
      var absPct = Math.round(Math.abs(pctChange));
      var direction = pctChange >= 0 ? 'up' : 'down';
      var arrow = pctChange >= 0 ? '&#9650;' : '&#9660;';
      trendBadge.className = 'trend-badge ' + direction;
      trendBadge.innerHTML = arrow + ' ' + absPct + '% vs last week';
    }
  }
  var gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(46, 125, 50, 0.3)');
  gradient.addColorStop(1, 'rgba(46, 125, 50, 0.02)');
  window.dashChart = new Chart(ctx, {
    type: 'line',
    data: { labels: labels, datasets: [{
      label: 'Observation records', data: dataValues, fill: true,
      backgroundColor: gradient, borderColor: '#2E7D32', borderWidth: 2,
      tension: 0.4, pointRadius: 4, pointBackgroundColor: '#2E7D32',
      pointBorderColor: '#ffffff', pointBorderWidth: 2,
      pointHoverRadius: 6, pointHoverBackgroundColor: '#2E7D32',
      pointHoverBorderColor: '#ffffff', pointHoverBorderWidth: 2
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#ffffff', titleColor: '#2C3E50', bodyColor: '#7F8C8D',
          borderColor: '#e5e7eb', borderWidth: 1, cornerRadius: 8, padding: 10,
          boxPadding: 4,
          callbacks: {
            title: function(items) { return items[0].label; },
            label: function(item) {
              var val = item.parsed.y;
              return val + ' record' + (val !== 1 ? 's' : '');
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 }, color: '#7F8C8D' } },
        y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { font: { size: 11 }, color: '#7F8C8D', precision: 0 } }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  });
});

if (typeof window !== 'undefined') {
  window.addEventListener('biodata:synced', function() {
    renderDashboardStats();
    if (window.dashChart && window.BioData) {
      var weekly = computeWeeklyWindow();
      window.dashChart.data.labels = weekly.labels;
      window.dashChart.data.datasets[0].data = weekly.counts;
      window.dashChart.update();
    }
  });
}
