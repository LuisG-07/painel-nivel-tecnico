var UIOverview = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;

  function sectorBadge(sector) {
    var cls = D.sectorBadgeClass(sector);
    return '<span class="' + cls + '">' + esc(sector) + '</span>';
  }

  function levelBadge(level) {
    var cls = level === 'Sênior' ? 'lvl-sr' : level === 'Pleno' ? 'lvl-pl' : 'lvl-jr';
    return '<span class="lvl ' + cls + '">' + esc(level || 'Júnior') + '</span>';
  }

  // Linha de metadados: setor + nível do cargo + step
  function metaRow(analyst) {
    return '<div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:5px;align-items:center">' +
      sectorBadge(analyst.sector) +
      levelBadge(analyst.level) +
      '<span class="stp">Step ' + (analyst.step || 1) + '</span>' +
    '</div>';
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
        '<div class="score-box-label">Zendesk ' +
          '<button type="button" class="help-dot" onclick="event.stopPropagation();UIModals.openZendeskHelp()" title="Como esta nota é calculada" aria-label="Como a nota do Zendesk é calculada"><i class="ti ti-help"></i></button> ' +
          '<i class="ti ti-chevron-down" style="font-size:8px;vertical-align:middle;opacity:.5"></i></div>' +
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
            metaRow(analyst) +
          '</div>' +
          '<div style="margin-left:auto;text-align:right">' +
            '<div style="font-size:22px;font-weight:700;color:#CC0000">' + u.toFixed(1) + '</div>' +
            '<div style="font-size:10px;color:var(--muted)">unificada</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:10px">' + scoreBoxes(analyst, '13px') + '</div>' +
        worst.map(function(x, i) {
          return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--white)">' +
            '<span>' +
              '<span style="background:var(--red);color:#fff;border-radius:50%;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;margin-right:4px">' + (i + 1) + '</span>' +
              esc(x.name) +
            '</span>' +
            '<span style="color:#CC0000;font-weight:500">Nota ' + x.score + '</span>' +
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
            metaRow(analyst) +
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
            '<button class="edit-btn" onclick="App.removeAnalyst(' + analyst.id + ')" style="color:#CC0000" title="Remover" aria-label="Remover ' + esc(analyst.name) + '"><i class="ti ti-trash"></i></button>' +
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

    if (state.search) {
      filtered = filtered.filter(function(a) {
        return a.name.toLowerCase().indexOf(state.search) !== -1;
      });
    }

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
      '<div class="stat-card"><div class="stat-val" style="color:#15803D">' + avgTech + '</div><div class="stat-lbl">Média técnica</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:var(--red)">' + criticalCount + '</div><div class="stat-lbl">Críticos (&lt;5)</div></div>' +
      '<div class="stat-card"><div class="stat-val" style="color:#B45309;font-size:15px;margin-top:4px">' + esc(mostCriticalModule) + '</div><div class="stat-lbl">Módulo mais crítico</div></div>' +
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
            metaRow(best) +
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
    h += '<div class="sectitle" style="color:#CC0000"><i class="ti ti-alert-circle"></i> Destaque Crítico</div>' +
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

    // Rankings: módulos (técnico) + categorias negativadas (Zendesk) lado a lado.
    // O ranking do Zendesk é por CATEGORIA do ticket (só com dados importados).
    var zdReady   = typeof ZendeskSync !== 'undefined';
    var catRank   = (zdReady && ZendeskSync.categoryRanking) ? ZendeskSync.categoryRanking(state.analysts) : [];

    // Helper de status (Zendesk) por % de negativas
    function zdStatus(pct) {
      return pct >= 30 ? { c: '#CC0000', bg: '#FBEAEA', l: 'Crítica' }
           : pct >= 15 ? { c: '#B45309', bg: '#FBF1E3', l: 'Atenção' }
           :             { c: '#15803D', bg: '#E9F5EE', l: 'Saudável' };
    }
    // Tabela de ranking negativado do Zendesk (módulos ou categorias).
    // clickFn (opcional): nome de função global chamada com o índice da linha,
    // tornando as linhas clicáveis para consultar os tickets.
    function zdNegTable(title, icon, label, rows, clickFn) {
      var info = 'Avaliações de toda a equipe, na mesma base das notas (negativos ignorados não contam). Ordenado por nº de avaliações negativas.' +
        (clickFn ? ' Clique numa linha para ver os tickets.' : '');
      var help = ' <span title="' + esc(info) + '" style="cursor:help;color:var(--muted);font-size:12px;vertical-align:middle" aria-label="Sobre este ranking"><i class="ti ti-help-circle"></i></span>';
      var t = '<div><div class="sectitle" style="margin-top:0;min-height:42px;align-items:flex-start"><i class="ti ' + icon + '"></i> ' + title + help + '</div>' +
        '<table class="tbl"><thead><tr><th>#</th><th>' + label + '</th><th>Negativas</th><th>Avaliações</th><th>% negativa</th><th>Status</th></tr></thead><tbody>';
      rows.slice(0, 15).forEach(function(r, i) {
        var pct = r.rate * 100, st = zdStatus(pct);
        var trAttr = clickFn ? ' onclick="' + clickFn + '(' + i + ')" style="cursor:pointer" title="Ver tickets"' : '';
        t += '<tr' + trAttr + '>' +
          '<td style="color:var(--muted)">' + (i + 1) + '</td>' +
          '<td style="font-weight:500">' + esc(r.name) + '</td>' +
          '<td style="color:#CC0000;font-weight:700">' + r.bad + '</td>' +
          '<td style="color:var(--muted)">' + r.total + '</td>' +
          '<td style="color:' + st.c + ';font-weight:600">' + pct.toFixed(0) + '%</td>' +
          '<td><span style="background:' + st.bg + ';color:' + st.c + ';font-size:10px;font-weight:600;padding:3px 11px;border-radius:99px">' + st.l + '</span></td>' +
        '</tr>';
      });
      return t + '</tbody></table></div>';
    }

    // 1) Ranking de Módulos (técnico, média 1–5)
    var modTable = '<div><div class="sectitle" style="margin-top:0;min-height:42px;align-items:flex-start"><i class="ti ti-list-numbers"></i> Ranking de Categorias (técnico)</div>' +
      '<table class="tbl"><thead><tr><th>#</th><th>Categoria</th><th>Média (1–5)</th><th>Status</th></tr></thead><tbody>';
    modAvgs.forEach(function(x, i) {
      var statusBg   = x.avg < 3 ? '#FBEAEA'  : x.avg < 4 ? '#FBF1E3' : '#E9F5EE';
      var statusColor = x.avg < 3 ? '#CC0000' : x.avg < 4 ? '#B45309' : '#15803D';
      modTable += '<tr>' +
        '<td style="color:var(--muted)">' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + esc(x.name) + '</td>' +
        '<td style="color:' + statusColor + ';font-weight:700">' + x.avg.toFixed(2) + '</td>' +
        '<td><span style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;font-weight:600;padding:3px 11px;border-radius:99px">' + D.scoreStatusLabel(x.avg) + '</span></td>' +
      '</tr>';
    });
    modTable += '</tbody></table></div>';

    // 2) Categorias mais negativadas (Zendesk) — ao lado do técnico. Linhas
    //    clicáveis: abrem o modal com os tickets daquela categoria, para consulta.
    var catTable = catRank.length
      ? zdNegTable('Categorias mais negativadas (Zendesk)', 'ti-mood-sad',
          'Categoria', catRank.map(function(r) { return { name: r.category, bad: r.bad, total: r.total, rate: r.rate }; }),
          'App.openZdCategoryTickets')
      : '';

    // 2 colunas quando há ranking de categorias; senão, técnico ocupa tudo.
    var rankCols = catTable ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr';
    h += '<div style="margin-top:28px;display:grid;grid-template-columns:' + rankCols + ';gap:22px;align-items:start">' +
      modTable + catTable + '</div>';

    document.getElementById('page-visao').innerHTML = h;
  }

  return { render: render };
})();
