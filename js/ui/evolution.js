var UIEvolution = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;
  var chartInstances = {};
  var _state = null;

  var CHART_COLORS = [
    '#0268CD','#22C55E','#F59E0B','#CC0000','#8B5CF6','#EC4899',
    '#06B6D4','#84CC16','#F97316','#6366F1','#14B8A6','#D97706',
    '#FF5555','#7C3AED','#059669','#60AAFF'
  ];

  // Modo de visualização por módulo: 'bars' (barras horizontais) ou 'line'
  // (gráfico de linha original). Preferência salva no navegador.
  var MODE_KEY = 'skm6_evomode';
  function getMode() {
    try { return localStorage.getItem(MODE_KEY) === 'line' ? 'line' : 'bars'; }
    catch (e) { return 'bars'; }
  }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, m === 'line' ? 'line' : 'bars'); } catch (e) {}
    if (_state) render(_state);
  }

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

  // Cor pela nota do módulo (1–5). 0/sem nota → cinza.
  function modColor(s) {
    return s <= 0 ? '#94A3B8' : s <= 2 ? '#CC0000' : s === 3 ? '#F59E0B' : '#22C55E';
  }

  // --- Comparativo por data (melhorou / piorou) ----------------------------
  var CMP_KEY = 'skm6_evocmp';
  function getCmp() { try { return localStorage.getItem(CMP_KEY) || '30'; } catch (e) { return '30'; } }
  function setCmp(v) { try { localStorage.setItem(CMP_KEY, v); } catch (e) {} if (_state) render(_state); }

  function snapIso(s) {
    var d = String((s && s.date) || '');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
    return d.slice(0, 10);
  }
  function fmtIso(iso) { return iso.length >= 10 ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso; }
  function ov(s) { return s && s.unified != null ? s.unified : (s && s.avg != null ? s.avg : null); }

  // Snapshot de referência para comparar: 'first' = 1º registro; número = N dias atrás.
  function baselineSnap(hist, cmp) {
    if (!Array.isArray(hist) || hist.length < 2) return null;
    var cur = hist[hist.length - 1];
    var base;
    if (cmp === 'first') {
      base = hist[0];
    } else {
      var cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (parseInt(cmp, 10) || 30));
      var cutIso = cutoff.getFullYear() + '-' + String(cutoff.getMonth() + 1).padStart(2, '0') + '-' + String(cutoff.getDate()).padStart(2, '0');
      base = null;
      for (var i = 0; i < hist.length; i++) { if (snapIso(hist[i]) <= cutIso) base = hist[i]; }
      if (!base) base = hist[0]; // janela cobre todo o histórico → compara com o começo
    }
    return snapIso(base) === snapIso(cur) ? null : base;
  }

  // Badge ▲/▼ da nota unificada: agora vs baseline.
  function deltaBadge(cur, base) {
    if (!base) return '<span style="font-size:11px;color:var(--muted)">sem histórico p/ comparar ainda</span>';
    var c = ov(cur), b = ov(base);
    if (c == null || b == null) return '';
    var d = Math.round((c - b) * 10) / 10;
    var color = d > 0 ? '#15803D' : d < 0 ? '#CC0000' : '#64748B';
    var arrow = d > 0 ? '▲' : d < 0 ? '▼' : '▬';
    var sign = d > 0 ? '+' : '';
    var when = fmtIso(snapIso(base));
    return '<span style="font-size:12px;font-weight:600;color:' + color + '" title="Nota unificada agora comparada com ' + when + '">' +
      arrow + ' ' + sign + d.toFixed(1) +
      ' <span style="font-weight:400;color:var(--muted)">desde ' + when + '</span></span>';
  }

  // Seta pequena de variação de um módulo (pontos 1–5) vs baseline.
  function modDelta(cur, base) {
    if (base == null) return '';
    var d = cur - base;
    if (d === 0) return '';
    var color = d > 0 ? '#15803D' : '#CC0000';
    var arrow = d > 0 ? '▲' : '▼';
    return '<span style="font-size:10px;color:' + color + ';margin-left:3px" title="' + (d > 0 ? '+' : '') + d + ' desde a data comparada">' + arrow + Math.abs(d) + '</span>';
  }

  // Barras horizontais por módulo, ordenadas do pior para o melhor.
  // baseMods (opcional): notas por módulo da data comparada → mostra ▲/▼.
  function barsHtml(analyst, modules, baseMods) {
    var rows = modules.map(function(m) { return { name: m, score: analyst.scores[m] || 0 }; })
      .sort(function(a, b) { return a.score - b.score || a.name.localeCompare(b.name); });
    if (!rows.length) {
      return '<div style="font-size:12px;color:var(--muted);padding:8px">Sem módulos cadastrados.</div>';
    }
    return '<div style="display:flex;flex-direction:column;gap:7px">' +
      rows.map(function(r) {
        var color = modColor(r.score);
        var pct = Math.max(0, Math.min(100, (r.score / 5) * 100));
        var delta = (baseMods && typeof baseMods[r.name] === 'number') ? modDelta(r.score, baseMods[r.name]) : '';
        return '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:11px;color:var(--muted);width:130px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
          '<div style="flex:1;height:14px;background:#EEF2F7;border-radius:7px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:7px"></div>' +
          '</div>' +
          '<span style="width:44px;text-align:right;flex-shrink:0"><b style="font-size:12px;color:' + color + '">' + (r.score || '—') + '</b>' + delta + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function render(state) {
    destroyAll();
    _state = state;
    var mode = getMode();
    var cmp = getCmp();

    var list = state.currentSector === 'all'
      ? state.analysts
      : state.analysts.filter(function(a) { return a.sector === state.currentSector; });

    if (state.search) {
      list = list.filter(function(a) {
        return a.name.toLowerCase().indexOf(state.search) !== -1;
      });
    }

    var sectorLabel = state.currentSector === 'all' ? 'Todos' : state.currentSector;

    // Cabeçalho + toggle de visualização (Barras | Linha)
    function tabBtn(m, label, icon) {
      var on = mode === m;
      return '<button onclick="UIEvolution.setMode(\'' + m + '\')" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:5px;' +
        (on ? 'background:var(--blue);color:#fff;border-color:var(--blue)' : 'background:#fff;color:var(--ink)') + '">' +
        '<i class="ti ' + icon + '"></i> ' + label + '</button>';
    }

    var cmpOpts = [['30', '30 dias'], ['60', '60 dias'], ['90', '90 dias'], ['first', 'Primeiro registro']];
    var cmpSelect = '<label style="font-size:12px;color:var(--muted);display:inline-flex;align-items:center;gap:6px">Comparar com:' +
      '<select onchange="UIEvolution.setCmp(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--ink);font-family:inherit;cursor:pointer">' +
      cmpOpts.map(function(o) { return '<option value="' + o[0] + '"' + (cmp === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label>';

    var h = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px">' +
      '<div style="font-size:20px;font-weight:600;color:var(--ink);letter-spacing:-.3px">Evolução por Analista — ' + esc(sectorLabel) + '</div>' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        cmpSelect +
        '<div style="display:inline-flex;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px var(--border)">' +
          tabBtn('bars', 'Barras', 'ti-chart-bar') + tabBtn('line', 'Linha', 'ti-chart-line') +
        '</div>' +
      '</div>' +
    '</div>';

    list.forEach(function(analyst) {
      var u = D.unifiedScore(analyst);
      var tech = D.techScore(analyst.scores);
      var provaColor = analyst.provaAvg != null ? D.scoreColor(analyst.provaAvg) : 'var(--muted)';
      var zColor     = analyst.zendesk  != null ? D.scoreColor(analyst.zendesk)  : 'var(--muted)';
      var avatarHtml = analyst.photo
        ? '<div class="avatar ' + D.scoreAvatarClass(u) + '"><img src="' + esc(analyst.photo) + '" alt=""></div>'
        : '<div class="avatar ' + D.scoreAvatarClass(u) + '">' + esc(D.nameInitials(analyst.name)) + '</div>';

      var hist = (state.history && state.history[analyst.id]) || [];
      var base = baselineSnap(hist, cmp);
      var cur  = hist.length ? hist[hist.length - 1] : null;

      var body = mode === 'bars'
        ? barsHtml(analyst, state.modules, base ? base.mods : null)
        : '<div style="position:relative;height:180px"><canvas id="evo-' + analyst.id + '"></canvas></div>';

      h += '<div class="evo-card">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
          avatarHtml +
          '<div>' +
            '<div style="font-size:14px;font-weight:600;color:var(--ink);display:flex;align-items:center;gap:6px;flex-wrap:wrap">' + esc(analyst.name) + ' ' + sectorBadge(analyst.sector) +
              ' <span class="lvl ' + (analyst.level === 'Sênior' ? 'lvl-sr' : analyst.level === 'Pleno' ? 'lvl-pl' : 'lvl-jr') + '">' + esc(analyst.level || 'Júnior') + '</span>' +
              ' <span class="stp">Step ' + (analyst.step || 1) + '</span></div>' +
            '<div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;align-items:center">' +
              '<span style="font-size:12px;color:var(--muted)">Técnica: <b style="color:' + D.scoreColor(tech) + '">' + tech.toFixed(1) + '</b></span>' +
              '<span style="font-size:12px;color:var(--muted)">Prova: <b style="color:' + provaColor + '">' + (analyst.provaAvg != null ? analyst.provaAvg.toFixed(1) : '—') + '</b></span>' +
              '<span style="font-size:12px;color:var(--muted)">Zendesk: <b style="color:' + zColor + '">' + (analyst.zendesk != null ? analyst.zendesk.toFixed(1) : '—') + '</b></span>' +
              '<span style="font-size:12px;font-weight:600;color:' + D.scoreColor(u) + '">Unificada: ' + u.toFixed(1) + '</span>' +
              '<span style="border-left:1px solid var(--border);padding-left:12px">' + deltaBadge(cur, base) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        body +
      '</div>';
    });

    document.getElementById('page-evolucao').innerHTML = h;

    // Gráficos de linha só quando o modo é 'line'
    if (mode !== 'line') return;
    Chart.defaults.color = '#64748B';

    list.forEach(function(analyst) {
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
              ticks: { color: '#64748B', font: { size: 9 }, maxRotation: 55, autoSkip: true, maxTicksLimit: 14 },
              grid: { color: 'rgba(2,104,205,.08)' }
            },
            y: {
              min: 0, max: 5,
              ticks: { stepSize: 1, color: '#64748B', font: { size: 10 } },
              grid: { color: 'rgba(2,104,205,.08)' }
            }
          }
        }
      });
    });
  }

  return { render: render, destroyAll: destroyAll, setMode: setMode, setCmp: setCmp };
})();
