var UIEvolution = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;
  var chartInstances = {};

  var CHART_COLORS = [
    '#0268CD','#22C55E','#F59E0B','#CC0000','#8B5CF6','#EC4899',
    '#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#D97706',
    '#FF5555','#7C3AED','#059669','#60AAFF'
  ];

  function destroyAll() {
    Object.keys(chartInstances).forEach(function(k) {
      try { chartInstances[k].destroy(); } catch (e) {}
    });
    chartInstances = {};
  }

  function sectorBadge(sector) {
    var cls = D.sectorBadgeClass(sector);
    return '<span class="' + cls + '">' + esc(sector) + '</span>';
  }

  function render(state) {
    destroyAll();

    var list = state.currentSector === 'all'
      ? state.analysts
      : state.analysts.filter(function(a) { return a.sector === state.currentSector; });

    var sectorLabel = state.currentSector === 'all' ? 'Todos' : state.currentSector;

    var h = '<div style="font-size:18px;font-weight:600;color:var(--white);margin-bottom:18px">Evolução por Analista — ' + esc(sectorLabel) + '</div>';

    list.forEach(function(analyst, idx) {
      var u = D.unifiedScore(analyst);
      var tech = D.techScore(analyst.scores);
      var provaColor = analyst.provaAvg != null ? D.scoreColor(analyst.provaAvg) : 'var(--muted)';
      var zColor     = analyst.zendesk  != null ? D.scoreColor(analyst.zendesk)  : 'var(--muted)';
      var avatarHtml = analyst.photo
        ? '<div class="avatar ' + D.scoreAvatarClass(u) + '"><img src="' + esc(analyst.photo) + '" alt=""></div>'
        : '<div class="avatar ' + D.scoreAvatarClass(u) + '">' + esc(D.nameInitials(analyst.name)) + '</div>';

      h += '<div class="evo-card">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          avatarHtml +
          '<div>' +
            '<div style="font-size:14px;font-weight:500;color:var(--white)">' + esc(analyst.name) + ' ' + sectorBadge(analyst.sector) + '</div>' +
            '<div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap">' +
              '<span style="font-size:12px;color:var(--muted)">Técnica: <b style="color:' + D.scoreColor(tech) + '">' + tech.toFixed(1) + '</b></span>' +
              '<span style="font-size:12px;color:var(--muted)">Prova: <b style="color:' + provaColor + '">' + (analyst.provaAvg != null ? analyst.provaAvg.toFixed(1) : '—') + '</b></span>' +
              '<span style="font-size:12px;color:var(--muted)">Zendesk: <b style="color:' + zColor + '">' + (analyst.zendesk != null ? analyst.zendesk.toFixed(1) : '—') + '</b></span>' +
              '<span style="font-size:12px;font-weight:600;color:' + D.scoreColor(u) + '">Unificada: ' + u.toFixed(1) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="position:relative;height:180px"><canvas id="evo-' + analyst.id + '"></canvas></div>' +
      '</div>';
    });

    document.getElementById('page-evolucao').innerHTML = h;

    Chart.defaults.color = '#8AADDB';

    list.forEach(function(analyst, idx) {
      var ctx = document.getElementById('evo-' + analyst.id);
      if (!ctx) return;

      var colorIdx = state.analysts.indexOf(analyst) % CHART_COLORS.length;
      var color = CHART_COLORS[colorIdx];
      var scores = state.modules.map(function(m) { return analyst.scores[m] || 0; });
      var pointColors = scores.map(function(s) {
        return s <= 2 ? '#CC0000' : s === 3 ? '#F59E0B' : '#22C55E';
      });

      chartInstances['e' + analyst.id] = new Chart(ctx, {
        type: 'line',
        data: {
          labels: state.modules,
          datasets: [{
            label: 'Técnica',
            data: scores,
            borderColor: color,
            backgroundColor: 'transparent',
            pointBackgroundColor: pointColors,
            pointRadius: 3,
            tension: 0.3,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: '#8AADDB', font: { size: 9 }, maxRotation: 55, autoSkip: true, maxTicksLimit: 14 },
              grid: { color: 'rgba(14,48,96,.4)' }
            },
            y: {
              min: 0, max: 5,
              ticks: { stepSize: 1, color: '#8AADDB', font: { size: 10 } },
              grid: { color: 'rgba(14,48,96,.4)' }
            }
          }
        }
      });
    });
  }

  return { render: render, destroyAll: destroyAll };
})();
