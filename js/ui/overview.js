var UIOverview = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;

  function sectorBadge(sector) {
    var cls = D.sectorBadgeClass(sector);
    return '<span class="' + cls + '">' + esc(sector) + '</span>';
  }

  function avatarHtml(analyst, sizeClass) {
    var score = D.unifiedScore(analyst);
    var cls = sizeClass || D.scoreAvatarClass(score);
    if (analyst.photo) {
      return '<div class="avatar ' + cls + '"><img src="' + esc(analyst.photo) + '" alt="' + esc(analyst.name) + '"></div>';
    }
    return '<div class="avatar ' + cls + '">' + esc(D.nameInitials(analyst.name)) + '</div>';
  }

  function scoreBoxes(analyst, fontSize) {
    var fs = fontSize ? 'font-size:' + fontSize + ';' : '';
    var tech = D.techScore(analyst.scores);
    var provaColor = analyst.provaAvg != null ? D.scoreColor(analyst.provaAvg) : 'var(--muted)';
    var zColor     = analyst.zendesk  != null ? D.scoreColor(analyst.zendesk)  : 'var(--muted)';
    return (
      '<div class="score-box"><div class="score-box-label">Técnica</div>' +
        '<div class="score-box-val" style="' + fs + 'color:' + D.scoreColor(tech) + '">' + tech.toFixed(1) + '</div></div>' +
      '<div class="score-box"><div class="score-box-label">Prova</div>' +
        '<div class="score-box-val" style="' + fs + 'color:' + provaColor + '">' +
          (analyst.provaAvg != null ? analyst.provaAvg.toFixed(1) : '—') + '</div></div>' +
      '<div class="score-box" style="cursor:pointer" onclick="App.openZendeskTickets(' + analyst.id + ')" title="Ver atendimentos negativados">' +
        '<div class="score-box-label">Zendesk <i class="ti ti-chevron-down" style="font-size:8px;vertical-align:middle;opacity:.5"></i></div>' +
        '<div class="score-box-val" style="' + fs + 'color:' + zColor + '">' +
          (analyst.zendesk != null ? analyst.zendesk.toFixed(1) : '—') +
        '</div>' +
      '</div>'
    );
  }

  function criticCard(analyst, modules) {
    var u = D.unifiedScore(analyst);
    var worst = modules.slice()
      .map(function(m) { return { name: m, score: analyst.scores[m] || 0 }; })
      .sort(function(a, b) { return a.score - b.score; })
      .slice(0, 3);
    return (
      '<div class="ccard">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
          avatarHtml(analyst, 'av-r') +
          '<div>' +
            '<div style="font-size:14px;font-weight:500;color:var(--white)">' + esc(analyst.name) + '</div>' +
            '<div style="margin-top:3px">' + sectorBadge(analyst.sector) + '</div>' +
          '</div>' +
          '<div style="margin-left:auto;text-align:right">' +
            '<div style="font-size:22px;font-weight:700;color:#FF5555">' + u.toFixed(1) + '</div>' +
            '<div style="font-size:10px;color:var(--muted)">unificada</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px">' + scoreBoxes(analyst, '13px') + '</div>' +
        worst.map(function(x, i) {
          return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(204,0,0,.2);font-size:12px;color:var(--white)">' +
            '<span>' +
              '<span style="background:var(--red);color:#fff;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-right:4px">' + (i + 1) + '</span>' +
              esc(x.name) +
            '</span>' +
            '<span style="color:#FF5555;font-weight:500">Nota ' + x.score + '</span>' +
          '</div>';
        }).join('') +
      '</div>'
    );
  }

  function analystCard(analyst, modules) {
    var u = D.unifiedScore(analyst);
    var uColor = D.scoreColor(u);
    var borderCls = D.scoreBorderClass(u);
    var avatarCls = D.scoreAvatarClass(u);

    var moduleBars = modules.map(function(m) {
      var sv = analyst.scores[m] || 0;
      return '<div style="margin-bottom:4px">' +
        '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted)">' +
          '<span>' + esc(m) + '</span><span>' + sv + '/5</span>' +
        '</div>' +
        '<div class="bar-bg"><div class="bar-fill ' + D.scoreBarClass(sv) + '" style="width:' + (sv * 20) + '%"></div></div>' +
      '</div>';
    }).join('');

    var urgentModules = modules.filter(function(m) {
      var s = analyst.scores[m] || 0; return s > 0 && s <= 2;
    });
    var recommendedModules = modules.filter(function(m) {
      return (analyst.scores[m] || 0) === 3;
    });

    var trainingPlan = urgentModules.map(function(m) {
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--white)"><span>' + esc(m) + '</span><span class="tag-u">Urgente</span></div>';
    }).join('') + recommendedModules.map(function(m) {
      return '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);font-size:11px;color:var(--white)"><span>' + esc(m) + '</span><span class="tag-r">Recomendado</span></div>';
    }).join('');

    var commentHtml = analyst.comment
      ? '<div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic">' + esc(analyst.comment) + '</div>'
      : '';

    var attachmentHtml = '';
    if (analyst.anexos && analyst.anexos.length) {
      attachmentHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
        analyst.anexos.map(function(src) {
          return '<img src="' + esc(src) + '" style="width:56px;height:56px;border-radius:6px;object-fit:cover;border:1px solid var(--border)" alt="Anexo">';
        }).join('') +
      '</div>';
    }

    var avatar = analyst.photo
      ? '<div class="avatar ' + avatarCls + '"><img src="' + esc(analyst.photo) + '" alt="' + esc(analyst.name) + '"></div>'
      : '<div class="avatar ' + avatarCls + '">' + esc(D.nameInitials(analyst.name)) + '</div>';

    return (
      '<div class="acard ' + borderCls + '">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
          avatar +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:500;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(analyst.name) + '</div>' +
            '<div style="margin-top:3px">' + sectorBadge(analyst.sector) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:5px;margin-bottom:10px">' + scoreBoxes(analyst, '13px') + '</div>' +
        '<div style="border-top:1px solid var(--border);padding-top:10px;display:flex;align-items:center;justify-content:space-between">' +
          '<div>' +
            '<div style="font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">Nota Unificada</div>' +
            '<div style="font-size:24px;font-weight:700;color:' + uColor + '">' + u.toFixed(1) + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:4px">' +
            '<button class="edit-btn" onclick="App.openEditModal(' + analyst.id + ')" title="Editar" aria-label="Editar ' + esc(analyst.name) + '"><i class="ti ti-pencil"></i></button>' +
            '<button class="edit-btn" onclick="App.removeAnalyst(' + analyst.id + ')" style="color:#FF5555" title="Remover" aria-label="Remover ' + esc(analyst.name) + '"><i class="ti ti-trash"></i></button>' +
            '<button class="edit-btn" onclick="App.toggleExpand(' + analyst.id + ')" title="Detalhes" aria-label="Detalhes ' + esc(analyst.name) + '"><i class="ti ti-chevron-down"></i></button>' +
          '</div>' +
        '</div>' +
        commentHtml +
        '<div class="expand-section" id="exp-' + analyst.id + '">' +
          '<div style="font-size:10px;font-weight:500;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Módulos técnicos</div>' +
          moduleBars +
          (trainingPlan ? '<div style="margin-top:10px;font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Treinamentos necessários</div>' + trainingPlan : '') +
          attachmentHtml +
        '</div>' +
      '</div>'
    );
  }

  function render(state) {
    var filtered = state.currentSector === 'all'
      ? state.analysts
      : state.analysts.filter(function(a) { return a.sector === state.currentSector; });

    var sorted = filtered.slice().sort(function(a, b) {
      return D.unifiedScore(a) - D.unifiedScore(b);
    });

    var best = filtered.slice().sort(function(a, b) {
      return D.unifiedScore(b) - D.unifiedScore(a);
    })[0];

    var modAvgs = D.moduleAverages(state.modules, filtered);
    var avgTech = filtered.length
      ? (filtered.reduce(function(s, a) { return s + D.techScore(a.scores); }, 0) / filtered.length).toFixed(1)
      : '—';
    var criticalCount = filtered.filter(function(a) { return D.unifiedScore(a) < 5; }).length;
    var mostCriticalModule = modAvgs[0] ? modAvgs[0].name.slice(0, 12) : '—';

    var sectorLabel = state.currentSector === 'all' ? 'Todos os Analistas' : state.currentSector;

    var h = '';

    // --- Sector filter tabs ---
    var sectorDot = function(s) {
      var cls = D.sectorBadgeClass(s);
      return cls === 'bc' ? '#60AAFF' : cls === 'bt' ? '#4ADE80' : '#FCD34D';
    };
    var allSectors = [{ key: 'all', label: 'Todos', color: '#8AADDB' }].concat(
      state.sectors.map(function(s) { return { key: s, label: s, color: sectorDot(s) }; })
    );
    h += '<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">';
    allSectors.forEach(function(tab) {
      var active = state.currentSector === tab.key;
      var count  = tab.key === 'all'
        ? state.analysts.length
        : state.analysts.filter(function(a) { return a.sector === tab.key; }).length;
      h += '<button onclick="App.setSector(\'' + esc(tab.key) + '\',this)" style="' +
        'padding:8px 18px;border-radius:22px;cursor:pointer;font-size:13px;font-family:inherit;' +
        'font-weight:' + (active ? '600' : '400') + ';' +
        'border:1.5px solid ' + (active ? tab.color : 'var(--border)') + ';' +
        'background:' + (active ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)') + ';' +
        'color:' + (active ? tab.color : 'var(--muted)') + ';' +
        'display:inline-flex;align-items:center;gap:7px;transition:all .15s">' +
        (tab.key !== 'all'
          ? '<span style="width:9px;height:9px;border-radius:50%;background:' + tab.color + ';flex-shrink:0"></span>'
          : '') +
        esc(tab.label) +
        '<span style="font-size:11px;padding:1px 7px;border-radius:10px;background:rgba(255,255,255,.08);color:' +
          (active ? tab.color : 'var(--muted)') + '">' + count + '</span>' +
      '</button>';
    });
    h += '</div>';

    // Header
    h += '<div style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">' +
      '<div>' +
        '<div style="font-size:20px;font-weight:600;color:var(--white)">Nível Técnico — ' + esc(sectorLabel) + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:4px">' + filtered.length + ' analistas · ' + state.modules.length + ' módulos · nota unificada 0–10</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn-secondary" style="font-size:12px" onclick="App.openAddAnalystModal()"><i class="ti ti-user-plus"></i> Adicionar Analista</button>' +
        '<button class="btn-secondary" style="font-size:12px" onclick="App.openManageModal()"><i class="ti ti-settings"></i> Gerenciar</button>' +
      '</div>' +
    '</div>';

    // KPI strip
    h += '<div class="stat-strip">' +
      '<div class="stat-card"><div class="stat-val" style="color:var(--blue)">' + filtered.length + '</div><div class="stat-lbl">Analistas</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:#4ADE80">' + avgTech + '</div><div class="stat-lbl">Média técnica</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:var(--red)">' + criticalCount + '</div><div class="stat-lbl">Críticos (&lt;5)</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:#FCD34D;font-size:16px;margin-top:4px">' + esc(mostCriticalModule) + '</div><div class="stat-lbl">Módulo mais crítico</div></div>' +
    '</div>';

    // Highlight card (best analyst — always from all analysts, not filtered)
    if (best) {
      var us = D.unifiedScore(best);
      var tech = D.techScore(best.scores);
      var bestAvatar = best.photo
        ? '<div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:2px solid var(--blue)"><img src="' + esc(best.photo) + '" style="width:100%;height:100%;object-fit:cover" alt=""></div>'
        : '<div style="width:44px;height:44px;border-radius:50%;background:rgba(2,104,205,.3);border:2px solid var(--blue);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--white)">' + esc(D.nameInitials(best.name)) + '</div>';
      h += '<div class="hbox">' +
        '<div style="display:flex;align-items:center;gap:12px">' +
          bestAvatar +
          '<div>' +
            '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px">🏆 Destaque — Maior nota unificada</div>' +
            '<div style="font-size:20px;font-weight:600;color:var(--white);margin-top:2px">' + esc(best.name) + '</div>' +
            '<div style="margin-top:4px">' + sectorBadge(best.sector) + '</div>' +
          '</div>' +
          '<div style="margin-left:auto;text-align:right">' +
            '<div style="font-size:30px;font-weight:700;color:' + D.scoreColor(us) + '">' + us.toFixed(1) + '</div>' +
            '<div style="font-size:10px;color:var(--muted)">nota unificada</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:10px;margin-top:14px">' + scoreBoxes(best) + '</div>' +
      '</div>';
    }

    // Critical highlight
    h += '<div class="sectitle" style="color:#FF5555"><i class="ti ti-alert-circle"></i> Destaque Crítico</div>' +
      '<div class="critic-grid">';
    sorted.slice(0, 2).forEach(function(a) {
      h += criticCard(a, state.modules);
    });
    h += '</div>';

    // All analysts grid
    h += '<div class="sectitle"><i class="ti ti-users"></i> Todos os Analistas</div>';
    h += '<div class="cards-grid">';
    sorted.forEach(function(a) {
      h += analystCard(a, state.modules);
    });
    h += '</div>';

    // Module ranking table
    h += '<div style="margin-top:28px"><div class="sectitle"><i class="ti ti-list-numbers"></i> Ranking de Módulos</div>' +
      '<table class="tbl"><thead><tr><th>#</th><th>Módulo</th><th>Média (1–5)</th><th>Status</th></tr></thead><tbody>';
    modAvgs.forEach(function(x, i) {
      var statusBg   = x.avg < 3 ? 'rgba(204,0,0,.25)'      : x.avg < 4 ? 'rgba(245,158,11,.2)'   : 'rgba(34,197,94,.15)';
      var statusColor = x.avg < 3 ? '#FF8080'                : x.avg < 4 ? '#FCD34D'               : '#4ADE80';
      var statusBorder = x.avg < 3 ? 'rgba(204,0,0,.3)'     : x.avg < 4 ? 'rgba(245,158,11,.3)'   : 'rgba(34,197,94,.3)';
      h += '<tr>' +
        '<td style="color:var(--muted)">' + (i + 1) + '</td>' +
        '<td>' + esc(x.name) + '</td>' +
        '<td style="color:' + (x.avg >= 4 ? '#4ADE80' : x.avg >= 3 ? '#FCD34D' : '#FF5555') + ';font-weight:600">' + x.avg.toFixed(2) + '</td>' +
        '<td><span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;padding:2px 10px;border-radius:99px;border:1px solid ' + statusBorder + '">' + D.scoreStatusLabel(x.avg) + '</span></td>' +
      '</tr>';
    });
    h += '</tbody></table></div>';

    document.getElementById('page-visao').innerHTML = h;
  }

  return { render: render };
})();
