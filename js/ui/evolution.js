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
  var MODES = { placar: 1, tabela: 1, bars: 1 };
  function getMode() {
    try {
      var m = localStorage.getItem(MODE_KEY);
      return MODES[m] ? m : 'placar'; // 'line' (antigo) e vazio -> placar
    } catch (e) { return 'placar'; }
  }
  function setMode(m) {
    try { localStorage.setItem(MODE_KEY, MODES[m] ? m : 'placar'); } catch (e) {}
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
  function getCmp() {
    try {
      var v = localStorage.getItem(CMP_KEY) || 'prev';
      if (/^\d+$/.test(v)) return 'prev'; // migra valores antigos (30/60/90 dias)
      return v;
    } catch (e) { return 'prev'; }
  }
  function setCmp(v) { try { localStorage.setItem(CMP_KEY, v); } catch (e) {} if (_state) render(_state); }

  function snapIso(s) {
    var d = String((s && s.date) || '');
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d.slice(6, 10) + '-' + d.slice(3, 5) + '-' + d.slice(0, 2);
    return d.slice(0, 10);
  }
  function fmtIso(iso) { return iso.length >= 10 ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : iso; }
  function ov(s) { return s && s.unified != null ? s.unified : (s && s.avg != null ? s.avg : null); }

  // Snapshot de referência para comparar. cmp pode ser:
  //   'prev'  = registro imediatamente anterior
  //   'first' = 1º registro
  //   'YYYY-MM-DD' = data específica (usa o registro daquela data ou o anterior a ela)
  function baselineSnap(hist, cmp) {
    if (!Array.isArray(hist) || hist.length < 2) return null;
    var cur = hist[hist.length - 1];
    var base;
    if (cmp === 'first') {
      base = hist[0];
    } else if (cmp === 'prev') {
      base = hist[hist.length - 2];
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(cmp)) {
      base = null;
      for (var i = 0; i < hist.length; i++) { if (snapIso(hist[i]) <= cmp) base = hist[i]; }
      if (!base) base = hist[0]; // a data escolhida é anterior a todo o histórico
    } else {
      base = hist[0];
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
        var hasBase = baseMods && typeof baseMods[r.name] === 'number';
        var baseVal = hasBase ? baseMods[r.name] : null;
        var delta = hasBase ? modDelta(r.score, baseVal) : '';
        // Marcador "antes": linha vertical na posição da nota anterior, para
        // enxergar de imediato se a barra cresceu (passou do marcador) ou caiu.
        var marker = '';
        if (hasBase && baseVal !== r.score) {
          var basePct = Math.max(0, Math.min(100, (baseVal / 5) * 100));
          marker = '<div title="Antes: ' + baseVal + '" style="position:absolute;top:-2px;bottom:-2px;left:' + basePct + '%;width:2px;background:#0F172A;opacity:.55"></div>';
        }
        return '<div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-size:11px;color:var(--muted);width:130px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(r.name) + '">' + esc(r.name) + '</span>' +
          '<div style="position:relative;flex:1;height:14px;background:#EEF2F7;border-radius:7px">' +
            '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:7px"></div>' +
            marker +
          '</div>' +
          '<span style="width:44px;text-align:right;flex-shrink:0"><b style="font-size:12px;color:' + color + '">' + (r.score || '—') + '</b>' + delta + '</span>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  // Dados de comparação de um analista: nota unificada agora vs baseline.
  function compare(analyst, hist, cmp) {
    var base = baselineSnap(hist, cmp);
    var cur  = hist.length ? hist[hist.length - 1] : null;
    var now  = D.unifiedScore(analyst);
    var was  = base ? ov(base) : null;
    var delta = (now != null && was != null) ? Math.round((now - was) * 10) / 10 : null;
    return { base: base, cur: cur, now: now, was: was, delta: delta };
  }

  // Etiqueta ▲/▼ +X colorida da variação.
  function deltaTag(d, size) {
    var fs = size || 12;
    if (d == null) return '<span style="font-size:' + fs + 'px;color:var(--muted)">—</span>';
    var color = d > 0 ? '#15803D' : d < 0 ? '#CC0000' : '#64748B';
    var arrow = d > 0 ? '▲' : d < 0 ? '▼' : '▬';
    var sign  = d > 0 ? '+' : '';
    return '<span style="font-size:' + fs + 'px;font-weight:700;color:' + color + '">' + arrow + ' ' + sign + d.toFixed(1) + '</span>';
  }

  // "O que mudou" por módulo (agora vs baseline), do maior movimento p/ o menor.
  function moduleChanges(analyst, base, modules, limit) {
    if (!base || !base.mods) return '<span style="color:var(--muted)">—</span>';
    var chg = [];
    modules.forEach(function(m) {
      var now = analyst.scores[m] || 0;
      var was = typeof base.mods[m] === 'number' ? base.mods[m] : null;
      if (was != null && now !== was) chg.push({ m: m, now: now, was: was, d: now - was });
    });
    if (!chg.length) return '<span style="color:var(--muted)">sem mudança</span>';
    chg.sort(function(a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var shown = chg.slice(0, limit || 3);
    var html = shown.map(function(c) {
      var up = c.d > 0;
      var color = up ? '#15803D' : '#CC0000';
      return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:' + color + ';white-space:nowrap">' +
        (up ? '↑' : '↓') + ' ' + esc(c.m) + ' <b>' + c.was + '→' + c.now + '</b></span>';
    }).join('<span style="color:var(--border);margin:0 6px">·</span>');
    if (chg.length > shown.length) html += '<span style="color:var(--muted);font-size:11px;margin-left:6px">+' + (chg.length - shown.length) + '</span>';
    return html;
  }

  // --- Placar: quem mais evoluiu × quem caiu -------------------------------
  function placarHtml(list, state, cmp) {
    var rows = list.map(function(a) {
      var hist = (state.history && state.history[a.id]) || [];
      return { a: a, cmp: compare(a, hist, cmp) };
    }).filter(function(r) { return r.cmp.delta != null; });

    var ups = rows.filter(function(r) { return r.cmp.delta > 0; }).sort(function(x, y) { return y.cmp.delta - x.cmp.delta; });
    var downs = rows.filter(function(r) { return r.cmp.delta < 0; }).sort(function(x, y) { return x.cmp.delta - y.cmp.delta; });
    var stable = rows.length - ups.length - downs.length;

    if (!rows.length) {
      return '<div class="evo-card" style="color:var(--muted);font-size:13px">Ainda não há histórico suficiente para comparar. Assim que houver registros em duas datas diferentes, o placar aparece aqui.</div>';
    }

    function line(r) {
      var a = r.a;
      var av = a.photo
        ? '<div class="avatar avatar-sm"><img src="' + esc(a.photo) + '" alt=""></div>'
        : '<div class="avatar avatar-sm">' + esc(D.nameInitials(a.name)) + '</div>';
      return '<div style="display:flex;align-items:center;gap:9px;padding:7px 2px;border-bottom:1px solid var(--border)">' +
        av +
        '<span style="flex:1;min-width:0;font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.name) + '</span>' +
        '<span style="font-size:12px;color:var(--muted)">' + (r.cmp.was != null ? r.cmp.was.toFixed(1) : '—') + ' → ' + r.cmp.now.toFixed(1) + '</span>' +
        deltaTag(r.cmp.delta, 13) +
      '</div>';
    }

    function col(title, arr, empty) {
      return '<div class="evo-card" style="flex:1;min-width:260px">' +
        '<div style="font-size:14px;font-weight:600;color:var(--ink);margin-bottom:8px">' + title + '</div>' +
        (arr.length ? arr.map(line).join('') : '<div style="color:var(--muted);font-size:12px;padding:8px 0">' + empty + '</div>') +
      '</div>';
    }

    var note = stable > 0 ? '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + stable + ' analista(s) sem variação no período.</div>' : '';
    return '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">' +
      col('📈 Mais evoluíram', ups, 'Ninguém subiu no período.') +
      col('📉 Precisam de atenção', downs, 'Ninguém caiu no período. 👏') +
    '</div>' + note;
  }

  // --- Tabela comparativa: Antes → Agora, por analista ---------------------
  function tableHtml(list, state, cmp) {
    var rows = list.map(function(a) {
      var hist = (state.history && state.history[a.id]) || [];
      return { a: a, hist: hist, cmp: compare(a, hist, cmp) };
    }).sort(function(x, y) {
      var dx = x.cmp.delta, dy = y.cmp.delta;
      if (dx == null && dy == null) return x.a.name.localeCompare(y.a.name);
      if (dx == null) return 1;
      if (dy == null) return -1;
      return dy - dx; // maior evolução no topo
    });

    var body = rows.map(function(r) {
      var a = r.a, c = r.cmp;
      var lvl = a.level === 'Sênior' ? 'lvl-sr' : a.level === 'Pleno' ? 'lvl-pl' : 'lvl-jr';
      return '<tr>' +
        '<td style="text-align:left"><div style="display:flex;align-items:center;gap:8px">' +
          '<span style="font-weight:600;color:var(--ink)">' + esc(a.name) + '</span>' +
          '<span class="lvl ' + lvl + '">' + esc(a.level || 'Júnior') + '</span></div></td>' +
        '<td>' + (c.was != null ? c.was.toFixed(1) : '—') + '</td>' +
        '<td><b style="color:' + D.scoreColor(c.now) + '">' + c.now.toFixed(1) + '</b></td>' +
        '<td>' + deltaTag(c.delta) + '</td>' +
        '<td style="text-align:left">' + moduleChanges(a, c.base, state.modules, 3) + '</td>' +
      '</tr>';
    }).join('');

    var baseLabel = cmp === 'first' ? 'primeiro registro' : cmp === 'prev' ? 'registro anterior' : fmtIso(cmp);
    return '<div class="evo-card" style="overflow-x:auto;padding:0">' +
      '<table class="tbl" style="width:100%;min-width:640px">' +
        '<thead><tr>' +
          '<th style="text-align:left">Analista</th>' +
          '<th>Antes<div style="font-weight:400;font-size:10px;color:var(--muted)">' + esc(baseLabel) + '</div></th>' +
          '<th>Agora</th>' +
          '<th>Variação</th>' +
          '<th style="text-align:left">O que mudou (módulos)</th>' +
        '</tr></thead>' +
        '<tbody>' + (body || '<tr><td colspan="5" style="color:var(--muted)">Sem analistas.</td></tr>') + '</tbody>' +
      '</table>' +
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

    // Datas reais em que há registro (união de todos os analistas), para o
    // usuário comparar "agora" com uma data específica do histórico.
    var dateSet = {};
    (state.analysts || []).forEach(function(a) {
      var hh = (state.history && state.history[a.id]) || [];
      hh.forEach(function(s) { dateSet[snapIso(s)] = true; });
    });
    var allDates = Object.keys(dateSet).filter(function(d) { return d; }).sort(); // ascendente
    var cmpOpts = [['prev', 'Registro anterior'], ['first', 'Primeiro registro']];
    // datas mais recentes primeiro, pulando a última (que é o "agora")
    allDates.slice().reverse().forEach(function(iso, idx) {
      if (idx === 0) return;
      cmpOpts.push([iso, fmtIso(iso)]);
    });
    var cmpSelect = '<label style="font-size:12px;color:var(--muted);display:inline-flex;align-items:center;gap:6px">Comparar com:' +
      '<select onchange="UIEvolution.setCmp(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--ink);font-family:inherit;cursor:pointer">' +
      cmpOpts.map(function(o) { return '<option value="' + o[0] + '"' + (cmp === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label>';

    var h = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px">' +
      '<div style="font-size:20px;font-weight:600;color:var(--ink);letter-spacing:-.3px">Evolução por Analista — ' + esc(sectorLabel) + '</div>' +
      '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
        cmpSelect +
        '<div style="display:inline-flex;border-radius:8px;overflow:hidden;box-shadow:0 0 0 1px var(--border)">' +
          tabBtn('placar', 'Placar', 'ti-trophy') + tabBtn('tabela', 'Tabela', 'ti-table') + tabBtn('bars', 'Barras', 'ti-chart-bar') +
        '</div>' +
      '</div>' +
    '</div>';

    // Placar (B) e Tabela (A): visões de "antes → depois" sem gráfico.
    if (mode === 'placar') {
      document.getElementById('page-evolucao').innerHTML = h + placarHtml(list, state, cmp);
      return;
    }
    if (mode === 'tabela') {
      document.getElementById('page-evolucao').innerHTML = h + tableHtml(list, state, cmp);
      return;
    }

    // Barras (por analista, com marcador da nota anterior)
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

      var body = barsHtml(analyst, state.modules, base ? base.mods : null);

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
  }

  return { render: render, destroyAll: destroyAll, setMode: setMode, setCmp: setCmp };
})();
