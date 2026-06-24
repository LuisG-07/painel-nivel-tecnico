var UITraining = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;

  // Estado do filtro do Log de Treinamentos (data + analista). Mantido no módulo
  // para sobreviver às re-renderizações parciais do log.
  var _state = null;
  var logFilter = { from: '', to: '', analyst: 'all' };

  function sectorBadge(sector) {
    var cls = D.sectorBadgeClass(sector);
    return '<span class="' + cls + '">' + esc(sector) + '</span>';
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

    var modAvgs = D.moduleAverages(state.modules, filtered);

    var h = '<div style="font-size:20px;font-weight:600;color:var(--ink);margin-bottom:18px;letter-spacing:-.3px">Painel de Treinamentos</div>';

    // Critical vs mastered modules
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">';

    // Most critical
    h += '<div><div class="sectitle" style="color:#CC0000"><i class="ti ti-alert-triangle"></i> Módulos mais críticos</div>';
    modAvgs.slice(0, 5).forEach(function(x) {
      var safeId = 'md_' + x.name.replace(/[^a-z0-9]/gi, '_');
      var needTraining = filtered.filter(function(a) {
        var s = a.scores[x.name] || 0;
        return s > 0 && s <= 3;
      }).sort(function(a, b) {
        return (a.scores[x.name] || 0) - (b.scores[x.name] || 0);
      });

      h += '<div onclick="App.toggleModuleDetail(\'' + safeId + '\')" style="cursor:pointer;padding:9px 12px;border:1px solid #F2C4C4;border-radius:10px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;align-items:center;background:#FBEAEA;color:var(--white);transition:border-color .15s">' +
        '<span>' + esc(x.name) + '</span>' +
        '<span style="color:#CC0000;font-weight:500">' + x.avg.toFixed(2) + ' <i class="ti ti-chevron-down" style="font-size:11px"></i></span>' +
      '</div>' +
      '<div id="' + safeId + '" style="display:none;" class="mod-detail-block">' +
        '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Precisam de treinamento</div>' +
        needTraining.map(function(a) {
          var s = a.scores[x.name] || 0;
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;border-bottom:1px solid var(--border);color:var(--white);font-size:12px">' +
            '<span>' + esc(a.name) + ' ' + sectorBadge(a.sector) + '</span>' +
            '<span class="' + (s <= 2 ? 'tag-u' : 'tag-r') + '">' + (s <= 2 ? 'Urgente' : 'Recomendado') + ' (' + s + ')</span>' +
          '</div>';
        }).join('') +
      '</div>';
    });
    h += '</div>';

    // Most mastered
    h += '<div><div class="sectitle" style="color:#15803D"><i class="ti ti-star"></i> Módulos dominados</div>';
    modAvgs.slice(-5).reverse().forEach(function(x) {
      h += '<div style="padding:9px 12px;border:1px solid #C9E7D4;border-radius:10px;margin-bottom:6px;font-size:13px;display:flex;justify-content:space-between;background:#E9F5EE;color:var(--white)">' +
        '<span>' + esc(x.name) + '</span>' +
        '<span style="color:#15803D;font-weight:500">' + x.avg.toFixed(2) + '</span>' +
      '</div>';
    });
    h += '</div></div>';

    // Training schedule header
    var pending = state.trainings.filter(function(t) { return t.status !== 'done'; });
    var done    = state.trainings.filter(function(t) { return t.status === 'done'; });

    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div class="sectitle" style="margin:0"><i class="ti ti-calendar-plus"></i> Agenda de Treinamentos</div>' +
      '<button class="btn-primary" style="font-size:12px" onclick="App.openTrainingModal()"><i class="ti ti-plus"></i> Agendar</button>' +
    '</div>';

    if (pending.length) {
      pending.forEach(function(t) {
        var idx = state.trainings.indexOf(t);
        var provaEntries = t.provas ? Object.entries(t.provas) : [];
        h += '<div class="train-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;gap:12px">' +
            '<div>' +
              '<div style="font-size:14px;font-weight:500;color:var(--white)">' + esc(t.module) + '</div>' +
              '<div style="font-size:12px;color:var(--muted);margin-top:4px">📅 ' + whenLabel(t) + ' · 👤 Líder: ' + esc(t.leader) + '</div>' +
              (t.obs ? '<div style="font-size:12px;color:var(--muted)">' + esc(t.obs) + '</div>' : '') +
              '<div style="font-size:12px;color:var(--muted);margin-top:3px">Participantes: ' + esc((t.analysts || []).join(', ') || '—') + '</div>' +
              (provaEntries.length
                ? '<div style="font-size:12px;color:#0268CD;margin-top:5px"><i class="ti ti-clipboard-check"></i> ' +
                    provaEntries.map(function(e) { return esc(e[0]) + ': ' + e[1]; }).join(' · ') +
                  '</div>'
                : '') +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">' +
              '<button class="btn-secondary" style="font-size:11px;padding:5px 10px;border-color:var(--blue);color:#0268CD" onclick="App.openProvaModal(' + idx + ')"><i class="ti ti-clipboard-check"></i> Nota prova</button>' +
              '<button class="btn-primary" style="font-size:11px;padding:5px 10px;background:#15803D;border-color:#15803D" onclick="App.finishTraining(' + idx + ')"><i class="ti ti-check"></i> Finalizar</button>' +
              '<button class="btn-secondary" style="font-size:11px;padding:5px 10px" onclick="App.editTraining(' + idx + ')"><i class="ti ti-pencil"></i> Editar</button>' +
              '<button class="btn-danger" style="font-size:11px;padding:5px 10px" onclick="App.deleteTraining(' + idx + ')"><i class="ti ti-trash"></i> Excluir</button>' +
            '</div>' +
          '</div>' +
          inviteButtons(state, t) +
        '</div>';
      });
    } else {
      h += '<div style="font-size:13px;color:var(--muted);padding:20px;text-align:center;border:1px dashed var(--border);border-radius:10px">Nenhum treinamento agendado.</div>';
    }

    if (done.length) {
      h += '<div class="sectitle" style="margin-top:20px;color:#15803D"><i class="ti ti-checks"></i> Finalizados</div>';
      done.forEach(function(t) {
        var idx = state.trainings.indexOf(t);
        var provaEntries = t.provas ? Object.entries(t.provas) : [];
        h += '<div class="done-card">' +
          '<div style="display:flex;justify-content:space-between;align-items:start;gap:10px">' +
            '<div style="flex:1">' +
              '<div style="font-size:13px;font-weight:500;color:#15803D">✅ ' + esc(t.module) + '</div>' +
              '<div style="font-size:12px;color:#15803D;margin-top:3px">' + whenLabel(t) + ' · ' + esc(t.leader) + '</div>' +
              '<div style="font-size:12px;color:#15803D">Participantes: ' + esc((t.analysts || []).join(', ') || '—') + '</div>' +
              (provaEntries.length
                ? '<div style="font-size:12px;color:#0268CD;margin-top:4px">Notas: ' +
                    provaEntries.map(function(e) { return esc(e[0]) + ': ' + e[1] + '/10'; }).join(' · ') +
                  '</div>'
                : '') +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-shrink:0">' +
              '<button class="btn-secondary" style="font-size:11px;padding:4px 9px" onclick="App.editTraining(' + idx + ')" title="Editar"><i class="ti ti-pencil"></i></button>' +
              '<button class="btn-danger" style="font-size:11px;padding:4px 9px" onclick="App.deleteTraining(' + idx + ')" title="Excluir"><i class="ti ti-trash"></i></button>' +
            '</div>' +
          '</div>' +
        '</div>';
      });
    }

    h += renderLog(state);

    _state = state;
    document.getElementById('page-treinamento').innerHTML = h;
    renderLogBody();
  }

  // --- Log de Treinamentos -------------------------------------------------
  // Quantas vezes cada analista CADASTRADO já fez cada treinamento (finalizados),
  // com filtro por intervalo de data e por analista.

  function fmtDate(d) { // 'YYYY-MM-DD' -> 'DD/MM/YYYY'
    if (!d || d.length < 10) return d || '—';
    return d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  }

  // --- Caminho A: convite por Google Agenda + e-mail (client-side) ----------
  function pad2(n) { return String(n).padStart(2, '0'); }

  // E-mails dos participantes (analistas cadastrados, casados pelo nome).
  function inviteEmails(state, t) {
    var byName = {};
    (state.analysts || []).forEach(function(a) {
      if (a.email) byName[(a.name || '').trim().toLowerCase()] = a.email;
    });
    var emails = [], missing = [];
    (t.analysts || []).forEach(function(n) {
      var e = byName[(n || '').trim().toLowerCase()];
      if (e) { if (emails.indexOf(e) === -1) emails.push(e); }
      else missing.push(n);
    });
    return { emails: emails, missing: missing };
  }

  // Parâmetro "dates" do Google Agenda. Com horário → evento marcado; sem
  // horário → evento de dia inteiro (fim exclusivo no dia seguinte).
  function calDates(t) {
    var d = (t.date || '').replace(/-/g, '');
    if (!d) return '';
    if (!t.time) {
      var dt = new Date(t.date + 'T00:00:00');
      dt.setDate(dt.getDate() + 1);
      return d + '/' + (dt.getFullYear() + pad2(dt.getMonth() + 1) + pad2(dt.getDate()));
    }
    var p = t.date.split('-'), tp = t.time.split(':');
    var start = new Date(+p[0], +p[1] - 1, +p[2], +tp[0], +tp[1]);
    var end;
    if (t.timeEnd) { var ep = t.timeEnd.split(':'); end = new Date(+p[0], +p[1] - 1, +p[2], +ep[0], +ep[1]); }
    else { end = new Date(start.getTime() + 3600000); } // +1h padrão
    function f(x) { return x.getFullYear() + pad2(x.getMonth() + 1) + pad2(x.getDate()) + 'T' + pad2(x.getHours()) + pad2(x.getMinutes()) + '00'; }
    return f(start) + '/' + f(end);
  }

  function calUrl(state, t) {
    var inv = inviteEmails(state, t);
    var details = 'Líder: ' + (t.leader || '') + (t.obs ? '\n' + t.obs : '') +
      '\nParticipantes: ' + ((t.analysts || []).join(', ') || '—');
    var u = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent('Treinamento: ' + (t.module || '')) +
      '&details=' + encodeURIComponent(details);
    var dates = calDates(t);
    if (dates) u += '&dates=' + dates;
    if (inv.emails.length) u += '&add=' + encodeURIComponent(inv.emails.join(','));
    return u;
  }

  function inviteButtons(state, t) {
    var inv = inviteEmails(state, t);
    var bs = 'font-size:11px;padding:5px 10px;border-radius:6px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border)';
    // Só Google Agenda: ao salvar o evento, o Google já envia o convite por e-mail
    // aos participantes (campo "add"). Não precisa de e-mail separado.
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">' +
      '<a href="' + calUrl(state, t) + '" target="_blank" rel="noopener" style="' + bs + ';background:#1A73E8;color:#fff;border-color:#1A73E8"><i class="ti ti-calendar-plus"></i> Google Agenda</a>' +
      (inv.missing.length
        ? '<span style="font-size:11px;color:#B45309" title="' + esc(inv.missing.join(', ')) + '"><i class="ti ti-alert-triangle"></i> ' + inv.missing.length + ' sem e-mail (não recebem convite)</span>'
        : '') +
    '</div>';
  }

  function whenLabel(t) {
    return esc(fmtDate(t.date)) + (t.time ? ' ' + esc(t.time) + (t.timeEnd ? '–' + esc(t.timeEnd) : '') : '');
  }

  function renderLog(state) {
    var inputStyle = 'background:#fff;border:1px solid var(--border);color:#0F2440;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit';
    var analystOpts = '<option value="all">Todos os analistas</option>' +
      state.analysts.slice().sort(function(a, b) { return a.name.localeCompare(b.name); })
        .map(function(a) {
          return '<option value="' + esc(a.name) + '"' + (logFilter.analyst === a.name ? ' selected' : '') + '>' + esc(a.name) + '</option>';
        }).join('');

    return '<div class="sectitle" style="margin-top:26px"><i class="ti ti-history"></i> Log de Treinamentos</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Quantas vezes cada analista cadastrado já fez cada treinamento (finalizados).</div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">' +
        '<div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">De</div>' +
          '<input type="date" id="trainLogFrom" value="' + esc(logFilter.from) + '" onchange="UITraining.applyLogFilter()" style="' + inputStyle + ';cursor:pointer"></div>' +
        '<div><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Até</div>' +
          '<input type="date" id="trainLogTo" value="' + esc(logFilter.to) + '" onchange="UITraining.applyLogFilter()" style="' + inputStyle + ';cursor:pointer"></div>' +
        '<div style="flex:1;min-width:200px"><div style="font-size:11px;color:var(--muted);margin-bottom:3px">Analista</div>' +
          '<select id="trainLogAnalyst" onchange="UITraining.applyLogFilter()" style="' + inputStyle + ';width:100%;cursor:pointer">' + analystOpts + '</select></div>' +
        '<button class="btn-secondary" style="font-size:11px;padding:7px 12px" onclick="UITraining.clearLogFilter()"><i class="ti ti-x"></i> Limpar</button>' +
      '</div>' +
      '<div id="trainLogBody"></div>';
  }

  function computeLog(state) {
    var regNames = {};
    (state.analysts || []).forEach(function(a) { regNames[a.name] = true; });
    var from = logFilter.from, to = logFilter.to, who = logFilter.analyst;
    var map = {}; // 'analista||treinamento' -> { analyst, module, count, last }
    (state.trainings || []).forEach(function(t) {
      if (t.status !== 'done') return;            // só finalizados ("já fez")
      var d = t.date || '';
      if (from && (!d || d < from)) return;       // datas em 'YYYY-MM-DD' comparam direto
      if (to && (!d || d > to)) return;
      (t.analysts || []).forEach(function(name) {
        if (!regNames[name]) return;              // só analistas cadastrados
        if (who !== 'all' && name !== who) return;
        var key = name + '||' + t.module;
        if (!map[key]) map[key] = { analyst: name, module: t.module, count: 0, last: '' };
        map[key].count++;
        if (d > map[key].last) map[key].last = d;
      });
    });
    return Object.keys(map).map(function(k) { return map[k]; })
      .sort(function(a, b) {
        return a.analyst.localeCompare(b.analyst) || (b.count - a.count) || a.module.localeCompare(b.module);
      });
  }

  function renderLogBody() {
    var el = document.getElementById('trainLogBody');
    if (!el || !_state) return;
    var rows = computeLog(_state);
    if (!rows.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:18px;text-align:center;border:1px dashed var(--border);border-radius:10px">Nenhum treinamento finalizado para o filtro selecionado.</div>';
      return;
    }
    var t = '<table class="tbl"><thead><tr>' +
      '<th>Analista</th><th>Treinamento</th>' +
      '<th style="text-align:center;white-space:nowrap">Vezes</th><th style="white-space:nowrap">Última vez</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function(r) {
      t += '<tr>' +
        '<td style="font-weight:500">' + esc(r.analyst) + '</td>' +
        '<td>' + esc(r.module) + '</td>' +
        '<td style="text-align:center;font-weight:700;color:var(--blue)">' + r.count + '</td>' +
        '<td style="color:var(--muted);white-space:nowrap">' + esc(fmtDate(r.last)) + '</td>' +
      '</tr>';
    });
    el.innerHTML = t + '</tbody></table>';
  }

  function applyLogFilter() {
    var f  = document.getElementById('trainLogFrom');
    var to = document.getElementById('trainLogTo');
    var an = document.getElementById('trainLogAnalyst');
    logFilter.from    = f  ? f.value  : '';
    logFilter.to      = to ? to.value : '';
    logFilter.analyst = an ? an.value : 'all';
    renderLogBody();
  }

  function clearLogFilter() {
    logFilter = { from: '', to: '', analyst: 'all' };
    var f  = document.getElementById('trainLogFrom');    if (f)  f.value  = '';
    var to = document.getElementById('trainLogTo');      if (to) to.value = '';
    var an = document.getElementById('trainLogAnalyst'); if (an) an.value = 'all';
    renderLogBody();
  }

  return {
    render: render,
    applyLogFilter: applyLogFilter,
    clearLogFilter: clearLogFilter
  };
})();
