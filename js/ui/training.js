var UITraining = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;

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
              '<div style="font-size:12px;color:var(--muted);margin-top:4px">📅 ' + esc(t.date) + ' · 👤 Líder: ' + esc(t.leader) + '</div>' +
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
            '</div>' +
          '</div>' +
        '</div>';
      });
    } else {
      h += '<div style="font-size:13px;color:var(--muted);padding:20px;text-align:center;border:1px dashed var(--border);border-radius:10px">Nenhum treinamento agendado.</div>';
    }

    if (done.length) {
      h += '<div class="sectitle" style="margin-top:20px;color:#15803D"><i class="ti ti-checks"></i> Finalizados</div>';
      done.forEach(function(t) {
        var provaEntries = t.provas ? Object.entries(t.provas) : [];
        h += '<div class="done-card">' +
          '<div style="font-size:13px;font-weight:500;color:#15803D">✅ ' + esc(t.module) + '</div>' +
          '<div style="font-size:12px;color:#15803D;margin-top:3px">' + esc(t.date) + ' · ' + esc(t.leader) + '</div>' +
          '<div style="font-size:12px;color:#15803D">Participantes: ' + esc((t.analysts || []).join(', ') || '—') + '</div>' +
          (provaEntries.length
            ? '<div style="font-size:12px;color:#0268CD;margin-top:4px">Notas: ' +
                provaEntries.map(function(e) { return esc(e[0]) + ': ' + e[1] + '/10'; }).join(' · ') +
              '</div>'
            : '') +
        '</div>';
      });
    }

    document.getElementById('page-treinamento').innerHTML = h;
  }

  return { render: render };
})();
