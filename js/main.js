var App = (function() {
  // --- State ---
  var state = {
    analysts:      [],
    modules:       [],
    sectors:       [],
    trainings:     [],
    history:       {},
    currentPage:   'visao',
    currentSector: 'all',
    search:        ''
  };

  // --- Global search ---
  function setSearch(value) {
    state.search = (value || '').trim().toLowerCase();
    render();
  }

  // --- Persistence ---
  function persist() {
    captureSnapshots();
    Storage.saveAll(state);
  }

  // Registra um snapshot das notas de cada analista NA DATA DE HOJE (um por dia:
  // se já houver o de hoje, atualiza). É o que alimenta a "Evolução" no tempo —
  // permite comparar se o analista melhorou ou piorou desde uma data anterior.
  function captureSnapshots() {
    var now = new Date();
    var iso = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
    var r1 = function(n) { return Math.round(n * 10) / 10; };
    (state.analysts || []).forEach(function(a) {
      var mods = {};
      (state.modules || []).forEach(function(m) { mods[m] = a.scores[m] || 0; });
      var tech = r1(Domain.techScore(a.scores));
      var snap = {
        date:    iso,
        avg:     tech,                                   // compat com histórico antigo
        tech:    tech,
        zendesk: a.zendesk  != null ? a.zendesk  : null,
        prova:   a.provaAvg != null ? a.provaAvg : null,
        unified: r1(Domain.unifiedScore(a)),
        mods:    mods
      };
      if (!state.history[a.id]) state.history[a.id] = [];
      var arr = state.history[a.id];
      var last = arr[arr.length - 1];
      var lastIso = last ? (/^\d{2}\/\d{2}\/\d{4}$/.test(last.date)
        ? last.date.slice(6, 10) + '-' + last.date.slice(3, 5) + '-' + last.date.slice(0, 2)
        : String(last.date).slice(0, 10)) : '';
      if (last && lastIso === iso) arr[arr.length - 1] = snap; // atualiza o de hoje
      else arr.push(snap);
    });
  }

  // --- Navigation ---
  function switchPage(page, btn) {
    state.currentPage = page;
    document.querySelectorAll('.page').forEach(function(el) { el.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach(function(el) { el.classList.remove('active'); });
    document.getElementById('page-' + page).classList.add('active');
    if (btn) btn.classList.add('active');
    render();
  }

  function setSector(sector, btn) {
    state.currentSector = sector;
    document.querySelectorAll('.stab').forEach(function(el) { el.classList.remove('ca','ta','na'); });
    if (btn && btn.classList.contains('stab')) {
      var sectorClasses = { 'Chat': 'ca', 'Telefone': 'ta', 'Notas': 'na', 'all': 'ca' };
      var cls = sectorClasses[sector] || 'ca';
      btn.classList.add(cls);
    }
    render();
  }

  // --- Render ---
  function render() {
    if (state.currentPage === 'visao')       UIOverview.render(state);
    else if (state.currentPage === 'evolucao') UIEvolution.render(state);
    else if (state.currentPage === 'treinamento') UITraining.render(state);
  }

  // --- Analyst operations ---
  function openEditModal(id) {
    var analyst = state.analysts.find(function(a) { return a.id === id; });
    if (!analyst) return;
    UIModals.openEdit(analyst, state.modules, state.sectors, function(updated) {
      var idx = state.analysts.findIndex(function(a) { return a.id === id; });
      if (idx === -1) return;
      state.analysts[idx] = updated;
      persist(); // captureSnapshots() registra o snapshot de hoje
      render();
    });
  }

  function openAddAnalystModal() {
    UIModals.openAdd(state.modules, state.sectors, function(newAnalyst) {
      state.analysts.push(newAnalyst);
      persist();
      render();
    });
  }

  function removeAnalyst(id) {
    if (!confirm('Remover este analista? Esta ação não pode ser desfeita.')) return;
    state.analysts = state.analysts.filter(function(a) { return a.id !== id; });
    persist();
    render();
  }

  function toggleExpand(id) {
    var el = document.getElementById('exp-' + id);
    if (el) el.classList.toggle('open');
  }

  // --- Training operations ---
  function openTrainingModal() {
    UIModals.openTraining(state.analysts, function(newTraining) {
      state.trainings.push(newTraining);
      persist();
      render();
    });
  }

  function editTraining(idx) {
    var t = state.trainings[idx];
    if (!t) return;
    UIModals.openTraining(state.analysts, function(updated) {
      state.trainings[idx] = updated;
      Domain.applyTrainingScores(state.analysts, state.trainings);
      persist();
      render();
    }, t);
  }

  function deleteTraining(idx) {
    var t = state.trainings[idx];
    if (!t) return;
    if (!confirm('Excluir o treinamento "' + (t.module || '') + '" de ' + (t.date || '') + '?')) return;
    state.trainings.splice(idx, 1);
    Domain.applyTrainingScores(state.analysts, state.trainings);
    persist();
    render();
  }

  function openProvaModal(idx) {
    var training = state.trainings[idx];
    if (!training) return;
    UIModals.openProva(training, idx, function(trainingIndex, provas) {
      state.trainings[trainingIndex].provas = provas;
      Domain.applyTrainingScores(state.analysts, state.trainings);
      persist();
      render();
    });
  }

  function finishTraining(idx) {
    if (!state.trainings[idx]) return;
    state.trainings[idx].status = 'done';
    Domain.applyTrainingScores(state.analysts, state.trainings);
    persist();
    render();
  }

  // --- Module detail toggle (training page) ---
  function toggleModuleDetail(safeId) {
    var el = document.getElementById(safeId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  // --- Manage modal (modules + sectors) ---
  function openManageModal() {
    UIModals.openManage(state.modules, state.sectors, ZendeskSync.getConfig(), function(updated) {
      state.modules  = updated.modules;
      state.sectors  = updated.sectors;
      if (updated.zendeskCfg) ZendeskSync.saveConfig(updated.zendeskCfg);
      state.analysts.forEach(function(a) {
        state.modules.forEach(function(m) {
          if (!(m in a.scores)) a.scores[m] = 1;
        });
      });
      persist();
      renderSectorTabs();
      render();
    });
  }

  function renderSectorTabs() {
    var container = document.getElementById('sectorTabsContainer');
    if (!container) return;
    var html = '<button class="stab" id="tab-all" onclick="App.setSector(\'all\',this)">Todos</button>';
    state.sectors.forEach(function(s) {
      var cls = Domain.sectorBadgeClass(s);
      var dotColor = cls === 'bc' ? '#60AAFF' : cls === 'bt' ? '#4ADE80' : '#FCD34D';
      html += '<button class="stab" id="tab-' + Domain.escapeHtml(s) + '" onclick="App.setSector(\'' + Domain.escapeHtml(s) + '\',this)">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:' + dotColor + ';display:inline-block"></span>' +
        Domain.escapeHtml(s) +
      '</button>';
    });
    container.innerHTML = html;
    // Re-apply active state
    state.currentSector = 'all';
    var allBtn = document.getElementById('tab-all');
    if (allBtn) allBtn.classList.add('ca');
  }

  // --- Export HTML ---
  function exportHTML() {
    // Read the current page source template (the shell index.html loaded this JS)
    // We regenerate the inline snapshot by capturing current state into the seed
    var analystData = JSON.stringify(state.analysts);
    var moduleData  = JSON.stringify(state.modules);
    var sectorData  = JSON.stringify(state.sectors);
    var trainData   = JSON.stringify(state.trainings);
    var histData    = JSON.stringify(state.history);

    // Build a self-contained export by injecting data into the current document
    var html = document.documentElement.outerHTML;

    // Replace seed data placeholders
    var timestamp = new Date().toLocaleString('pt-BR');

    // Replace the SEED_ANALYSTS, SEED_MODULES, SEED_SECTORS arrays in seed.js block
    html = html.replace(
      /var SEED_ANALYSTS\s*=\s*\[[\s\S]*?\];/,
      'var SEED_ANALYSTS = ' + analystData + ';'
    );
    html = html.replace(
      /var SEED_MODULES\s*=\s*\[[\s\S]*?\];/,
      'var SEED_MODULES = ' + moduleData + ';'
    );
    html = html.replace(
      /var SEED_SECTORS\s*=\s*\[[\s\S]*?\];/,
      'var SEED_SECTORS = ' + sectorData + ';'
    );

    // Inject trainings and history as additional seeds
    html = html.replace(
      /\/\/ __EXPORT_TRAININGS__[\s\S]*?\/\/ __END_EXPORT_TRAININGS__/,
      '// __EXPORT_TRAININGS__\nvar SEED_TRAININGS = ' + trainData + ';\nvar SEED_HISTORY = ' + histData + ';\n// __END_EXPORT_TRAININGS__'
    );

    // Mark export timestamp
    html = html.replace(
      /\/\/ __EXPORT_DATE__[^\n]*/,
      '// __EXPORT_DATE__ ' + timestamp
    );

    // Force exported file to load from seeds (skip localStorage)
    html = html.replace(
      '__EXPORT_MODE__ = false',
      '__EXPORT_MODE__ = true'
    );

    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'SkillMatrix_Pro_' + new Date().toISOString().slice(0, 10) + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    var btn = document.querySelector('[onclick="App.exportHTML()"]');
    if (btn) {
      var orig = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> Baixando...';
      btn.style.background = '#15803D';
      setTimeout(function() { btn.innerHTML = orig; btn.style.background = 'var(--blue)'; }, 2000);
    }
  }

  // --- Init ---
  function init() {
    var __EXPORT_MODE__ = false;
    // __EXPORT_DATE__

    // __EXPORT_TRAININGS__
    var SEED_TRAININGS = [];
    var SEED_HISTORY = {};
    // __END_EXPORT_TRAININGS__

    if (__EXPORT_MODE__) {
      // Exported file: load seeds directly, reset localStorage
      localStorage.removeItem('skm6_ana');
      localStorage.removeItem('skm6_mods');
      localStorage.removeItem('skm6_sec');
      localStorage.removeItem('skm6_train');
      localStorage.removeItem('skm6_hist');
      state.analysts  = SEED_ANALYSTS.map(Storage.migrateAnalyst);
      state.modules   = SEED_MODULES.slice();
      state.sectors   = SEED_SECTORS.slice();
      state.trainings = SEED_TRAININGS.slice();
      state.history   = SEED_HISTORY;
    } else {
      state.analysts  = Storage.loadAnalysts()  || SEED_ANALYSTS.map(Storage.migrateAnalyst);
      state.modules   = Storage.loadModules()   || SEED_MODULES.slice();
      state.sectors   = Storage.loadSectors()   || SEED_SECTORS.slice();
      state.trainings = Storage.loadTrainings();
      state.history   = Storage.loadHistory();
    }

    Domain.applyTrainingScores(state.analysts, state.trainings);

    // Recalcula notas do Zendesk com a métrica atual (positivos ÷ total × 10),
    // garantindo consistência mesmo para dados importados antes da mudança.
    ZendeskSync.recomputeAllScores(state.analysts);
    persist();

    UIModals.init();
    renderSectorTabs();
    render();

    // Zendesk CSAT sync — async, non-blocking
    updateZendeskBadge('loading');
    ZendeskSync.sync(state.analysts, function(count, err, status) {
      if (status === 'ok') {
        if (count > 0) { persist(); render(); }
        updateZendeskBadge('ok');
      } else if (status === 'error') {
        updateZendeskBadge('error', err);
      } else {
        updateZendeskBadge('off');
      }
    });
  }

  function updateZendeskBadge(syncState, msg) {
    var el = document.getElementById('zdBadge');
    if (!el) return;
    if (syncState === 'off') { el.style.display = 'none'; return; }
    el.style.display = 'inline-flex';
    var dot    = el.querySelector('.zd-dot');
    var lbl    = el.querySelector('.zd-label');
    var colors = { ok: '#4ADE80', error: '#FF5555', loading: '#FCD34D' };
    if (dot) dot.style.background = colors[syncState] || '#888';
    if (lbl) lbl.textContent = syncState === 'loading' ? 'Sincronizando…' : 'Zendesk';
    if (syncState === 'ok') {
      var st = ZendeskSync.getStatus();
      el.title = (st.updated || 0) + ' analistas atualizados — ' +
        (st.at ? new Date(st.at).toLocaleString('pt-BR') : '');
    } else if (msg) {
      el.title = 'Erro: ' + msg;
    }
  }

  function openZendeskTickets(analystId) {
    var analyst = state.analysts.find(function(a) { return a.id === analystId; });
    if (!analyst) return;
    UIModals.openZendeskTickets(analyst, ZendeskSync.getTickets(analystId), state.modules, function(newScore, updatedData) {
      analyst.zendesk = newScore;
      ZendeskSync.saveTickets(analystId, updatedData);
      persist();
      render();
    });
  }

  // Consulta os tickets negativos de uma categoria do ranking "Categorias mais
  // negativadas (Zendesk)". Recebe o índice da linha (recalcula o ranking).
  function openZdCategoryTickets(index) {
    if (!ZendeskSync.categoryRanking) return;
    var ranking = ZendeskSync.categoryRanking(state.analysts) || [];
    var row = ranking[index];
    if (!row) return;
    UIModals.openNegativesModal(
      row.category,
      ZendeskSync.negativesForCategory(state.analysts, row.category),
      ZendeskSync.getConfig().subdomain
    );
  }

  function importFromZendesk() {
    // Salva o que estiver nos campos antes de importar
    var g = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var cfg = ZendeskSync.getConfig();
    var groupIds = (function() {
      var checked = [];
      document.querySelectorAll('[data-zd-group]').forEach(function(cb) {
        if (cb.checked) checked.push(cb.getAttribute('data-zd-group'));
      });
      return checked.length ? checked : cfg.groupIds;
    })();
    var subdomain = g('zdSubdomain')
      .replace(/^https?:\/\//, '')        // Remove https:// ou http://
      .replace(/^www\./, '')               // Remove www.
      .replace(/\.zendesk\.com.*/i, '')    // Remove .zendesk.com e tudo depois
      || cfg.subdomain;

    ZendeskSync.saveConfig(Object.assign({}, cfg, {
      subdomain: subdomain,
      email:     g('zdEmail')    || cfg.email,
      apiToken:  g('zdApiToken') || cfg.apiToken,
      geminiKey: g('zdGeminiKey')|| cfg.geminiKey,
      groupIds:  groupIds,
      dateFrom:  g('zdDateFrom') || cfg.dateFrom,
      dateTo:    g('zdDateTo')   || cfg.dateTo,
      nameMap:   cfg.nameMap
    }));

    // Restaura fotos do cache antes de reimportar para não perder dados
    var photoCache = ZendeskSync.getPhotoCache();
    state.analysts.forEach(function(analyst) {
      if (!analyst.photo) {
        var cached = photoCache[analyst.name.toLowerCase()];
        if (cached) {
          analyst.photo = cached;
        }
      }
    });

    var btn     = document.getElementById('zdImportBtn');
    var progEl  = document.getElementById('zdImportProgress');
    if (btn)    { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Importando...'; }
    if (progEl) progEl.style.color = 'var(--muted)';

    ZendeskSync.importDirect(state.analysts, state.modules,
      function(msg) {
        if (progEl) progEl.textContent = msg;
      },
      function(count, err) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-cloud-download"></i> Importar do Zendesk'; }
        if (err) {
          if (progEl) { progEl.textContent = '✗ ' + err; progEl.style.color = '#FF5555'; }
          return;
        }
        if (progEl) progEl.style.color = '#4ADE80';
        if (count > 0) {
          render();
          persist(); // Salva fotos e dados no localStorage
          updateZendeskBadge('ok');
          if (progEl) progEl.textContent = '✓ Fotos e dados salvos!';
          // Mostra tabela de mapeamento para vincular nomes não reconhecidos
          var analystNames = state.analysts.map(function(a) { return a.name; });
          UIModals.renderNameMap && UIModals.renderNameMap(analystNames, state.sectors);
          if (count < state.analysts.length) {
            // Alguns analistas não foram vinculados — mantém modal aberto para mapear
            if (progEl) {
              progEl.textContent = '✓ ' + count + ' vinculados. Nomes abaixo não foram reconhecidos — vincule-os manualmente.';
              progEl.style.color = '#FCD34D';
            }
          } else {
            document.getElementById('manageModal') && (document.getElementById('manageModal').style.display = 'none');
          }
        } else {
          var analystNames = state.analysts.map(function(a) { return a.name; });
          UIModals.renderNameMap && UIModals.renderNameMap(analystNames, state.sectors);
        }
      }
    );
  }

  function saveNameMapAndReimport() {
    var selects  = document.querySelectorAll('#zdNameMapRows select[data-zdname]');
    var nameMap  = {};
    var toCreate = [];

    selects.forEach(function(sel) {
      var zdName = sel.getAttribute('data-zdname');
      var val    = sel.value;
      if (!zdName) return;
      if (val === '__NEW__') {
        toCreate.push(zdName);
      } else if (val) {
        nameMap[zdName] = val;
      }
    });

    // Cria novos analistas para cada seleção "Cadastrar"
    toCreate.forEach(function(zdName) {
      // Evita duplicata
      var existing = state.analysts.find(function(a) {
        return a.name.trim().toLowerCase() === zdName.trim().toLowerCase();
      });
      if (existing) { nameMap[zdName] = existing.name; return; }

      var agentData  = ZendeskSync.getAgentData(zdName);
      var newScores  = {};
      state.modules.forEach(function(m) { newScores[m] = 1; });

      // Lê setor do select inline (aparece ao escolher "Cadastrar")
      var mapSel    = document.querySelector('#zdNameMapRows select[data-zdname="' + zdName.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"]');
      var sectorSel = mapSel && mapSel.parentElement.querySelector('select[data-sector]');
      var sector    = (sectorSel && sectorSel.value) || state.sectors[0] || 'Chat';

      var newAnalyst = {
        id:       Date.now() + Math.floor(Math.random() * 9999),
        name:     zdName,
        sector:   sector,
        zendesk:  agentData ? agentData.score : null,
        provaAvg: null,
        photo:    agentData && agentData.photo ? agentData.photo : null,
        comment:  '',
        anexos:   [],
        scores:   newScores
      };
      state.analysts.push(newAnalyst);
      nameMap[zdName] = zdName; // vincula pelo mesmo nome
    });

    var cfg = ZendeskSync.getConfig();
    var previousNameMap = cfg.nameMap || {};
    var mergedNameMap = Object.assign({}, previousNameMap, nameMap);
    ZendeskSync.saveConfig(Object.assign({}, cfg, { nameMap: mergedNameMap }));

    // Aplica fotos do cache (skm6_zdagents) para analistas vinculados agora
    state.analysts.forEach(function(analyst) {
      if (analyst.photo) return; // já tem foto, não sobrescreve
      // Busca direto pelo nome do analista
      var direct = ZendeskSync.getAgentData(analyst.name);
      if (direct && direct.photo) { analyst.photo = direct.photo; return; }
      // Busca pelo nameMap reverso (zdName → analyst.name)
      Object.keys(nameMap).forEach(function(zdName) {
        if (nameMap[zdName] === analyst.name) {
          var d = ZendeskSync.getAgentData(zdName);
          if (d && d.photo) analyst.photo = d.photo;
        }
      });
    });

    persist(); // salva fotos imediatamente antes do reimport
    state.analysts.forEach(function(a) { a.zendesk = null; });
    localStorage.removeItem('skm6_zdtickets');

    // Mostra mensagem de sucesso
    var progEl = document.getElementById('zdImportProgress');
    if (progEl) {
      progEl.textContent = '✓ Vinculação salva! Reimportando dados...';
      progEl.style.color = '#4ADE80';
    }

    importFromZendesk();
  }

  // Public API
  return {
    init:               init,
    switchPage:         switchPage,
    setSector:          setSector,
    setSearch:          setSearch,
    openEditModal:      openEditModal,
    openAddAnalystModal: openAddAnalystModal,
    removeAnalyst:      removeAnalyst,
    toggleExpand:       toggleExpand,
    openTrainingModal:  openTrainingModal,
    editTraining:       editTraining,
    deleteTraining:     deleteTraining,
    openProvaModal:     openProvaModal,
    finishTraining:     finishTraining,
    toggleModuleDetail: toggleModuleDetail,
    openManageModal:    openManageModal,
    openZendeskTickets: openZendeskTickets,
    openZdCategoryTickets: openZdCategoryTickets,
    importFromZendesk:      importFromZendesk,
    saveNameMapAndReimport: saveNameMapAndReimport,
    exportHTML:         exportHTML
  };
})();
