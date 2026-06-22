var UIModals = (function() {
  var D = Domain;
  var esc = Domain.escapeHtml;

  // --- Edit Analyst Modal ---

  function openEdit(analyst, modules, sectors, onSave) {
    var modal = document.getElementById('editModal');
    var pendingPhoto = analyst.photo || null;
    var pendingAnexos = (analyst.anexos || []).slice();

    // Populate Dados tab
    document.getElementById('editName').value = analyst.name;
    var secSel = document.getElementById('editSector');
    secSel.innerHTML = sectors.map(function(s) {
      return '<option' + (analyst.sector === s ? ' selected' : '') + '>' + esc(s) + '</option>';
    }).join('');
    document.getElementById('editLevel').value = analyst.level || 'Júnior';
    document.getElementById('editStep').value = String(analyst.step || 1);
    document.getElementById('editZendesk').value = analyst.zendesk != null ? analyst.zendesk : '';
    document.getElementById('editComment').value = analyst.comment || '';
    updateCommentCounter();

    // Photo preview
    var preview = document.getElementById('editPhotoPreview');
    preview.src = pendingPhoto || '';
    preview.style.display = pendingPhoto ? 'block' : 'none';
    document.getElementById('editPhotoInput').value = '';

    // Modules tab
    document.getElementById('editMods').innerHTML = modules.map(function(m) {
      var s = analyst.scores[m] || 0;
      return '<div class="mod-row">' +
        '<span style="flex:1">' + esc(m) + '</span>' +
        '<div class="score-btns">' +
          [1,2,3,4,5].map(function(n) {
            return '<button class="score-btn' + (s === n ? ' s' + n : '') + '" ' +
              'onclick="UIModals._setScore(this,' + n + ')" data-mod="' + esc(m) + '">' + n + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    // Anexos tab
    renderAnexosList(pendingAnexos, 'editAnexosList', function(updated) {
      pendingAnexos = updated;
    });

    // Switch to first tab
    switchModalTab('editModal', 'dados');

    modal.dataset.analystId = analyst.id;
    modal.style.display = 'flex';

    // Photo file input handler
    document.getElementById('editPhotoInput').onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Selecione uma imagem válida.'); return; }
      readFileAsBase64(file, function(b64) {
        pendingPhoto = b64;
        preview.src = b64;
        preview.style.display = 'block';
      });
    };

    document.getElementById('editPhotoRemove').onclick = function() {
      pendingPhoto = null;
      preview.src = '';
      preview.style.display = 'none';
      document.getElementById('editPhotoInput').value = '';
    };

    document.getElementById('editAnexoInput').onchange = function(e) {
      var files = Array.from(e.target.files);
      var remaining = files;
      function processNext() {
        if (!remaining.length) {
          renderAnexosList(pendingAnexos, 'editAnexosList', function(updated) { pendingAnexos = updated; });
          e.target.value = '';
          return;
        }
        var f = remaining.shift();
        if (!f.type.startsWith('image/')) { processNext(); return; }
        readFileAsBase64(f, function(b64) {
          pendingAnexos.push(b64);
          processNext();
        });
      }
      processNext();
    };

    document.getElementById('editSaveBtn').onclick = function() {
      var name = document.getElementById('editName').value.trim();
      if (!name) { alert('O nome não pode ser vazio.'); return; }
      var sector = document.getElementById('editSector').value;
      var level = document.getElementById('editLevel').value;
      var step = parseInt(document.getElementById('editStep').value, 10) || 1;
      var zv = parseFloat(document.getElementById('editZendesk').value);
      var comment = document.getElementById('editComment').value.slice(0, 500);

      var scores = {};
      modules.forEach(function(m) { scores[m] = analyst.scores[m] || 1; });
      document.querySelectorAll('#editMods .mod-row').forEach(function(row) {
        var active = row.querySelector('.score-btn[class*=" s"]') || row.querySelector('.score-btn.s1') || row.querySelector('.score-btn.s2') || row.querySelector('.score-btn.s3') || row.querySelector('.score-btn.s4') || row.querySelector('.score-btn.s5');
        if (active) {
          var mod = active.dataset.mod;
          var val = parseInt(active.textContent, 10);
          if (mod) scores[mod] = val;
        }
      });

      onSave({
        id:       analyst.id,
        name:     name,
        sector:   sector,
        level:    level,
        step:     step,
        zendesk:  isNaN(zv) ? null : Math.min(10, Math.max(0, zv)),
        comment:  comment,
        photo:    pendingPhoto,
        anexos:   pendingAnexos,
        scores:   scores
      });
      modal.style.display = 'none';
    };
  }

  // --- Add Analyst Modal ---

  function openAdd(modules, sectors, onSave) {
    var modal = document.getElementById('addModal');
    var pendingPhoto = null;
    var pendingAnexos = [];
    var newScores = {};

    document.getElementById('addName').value = '';
    var secSel = document.getElementById('addSector');
    secSel.innerHTML = sectors.map(function(s) {
      return '<option>' + esc(s) + '</option>';
    }).join('');
    document.getElementById('addLevel').value = 'Júnior';
    document.getElementById('addStep').value = '1';
    document.getElementById('addZendesk').value = '';
    document.getElementById('addComment').value = '';
    document.getElementById('addPhotoPreview').style.display = 'none';
    document.getElementById('addPhotoInput').value = '';

    document.getElementById('addMods').innerHTML = modules.map(function(m) {
      return '<div class="mod-row">' +
        '<span style="flex:1">' + esc(m) + '</span>' +
        '<div class="score-btns">' +
          [1,2,3,4,5].map(function(n) {
            return '<button class="score-btn" onclick="UIModals._setScore(this,' + n + ')" data-mod="' + esc(m) + '">' + n + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');

    renderAnexosList(pendingAnexos, 'addAnexosList', function(updated) { pendingAnexos = updated; });
    switchModalTab('addModal', 'dados');
    modal.style.display = 'flex';

    document.getElementById('addPhotoInput').onchange = function(e) {
      var file = e.target.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      readFileAsBase64(file, function(b64) {
        pendingPhoto = b64;
        var preview = document.getElementById('addPhotoPreview');
        preview.src = b64;
        preview.style.display = 'block';
      });
    };

    document.getElementById('addAnexoInput').onchange = function(e) {
      var files = Array.from(e.target.files);
      var remaining = files;
      function processNext() {
        if (!remaining.length) {
          renderAnexosList(pendingAnexos, 'addAnexosList', function(updated) { pendingAnexos = updated; });
          e.target.value = '';
          return;
        }
        var f = remaining.shift();
        if (!f.type.startsWith('image/')) { processNext(); return; }
        readFileAsBase64(f, function(b64) { pendingAnexos.push(b64); processNext(); });
      }
      processNext();
    };

    document.getElementById('addSaveBtn').onclick = function() {
      var name = document.getElementById('addName').value.trim();
      if (!name) { alert('Digite o nome do analista.'); return; }
      var sector = document.getElementById('addSector').value;
      var level = document.getElementById('addLevel').value;
      var step = parseInt(document.getElementById('addStep').value, 10) || 1;
      var zv = parseFloat(document.getElementById('addZendesk').value);
      var comment = document.getElementById('addComment').value.slice(0, 500);

      var scores = {};
      modules.forEach(function(m) { scores[m] = 1; });
      document.querySelectorAll('#addMods .mod-row').forEach(function(row) {
        var btns = row.querySelectorAll('.score-btn');
        btns.forEach(function(b) {
          if (b.className.indexOf(' s') !== -1 || b.className.match(/\bs[1-5]\b/)) {
            var mod = b.dataset.mod;
            var val = parseInt(b.textContent, 10);
            if (mod && val >= 1) scores[mod] = val;
          }
        });
      });

      onSave({
        id:       Date.now(),
        name:     name,
        sector:   sector,
        level:    level,
        step:     step,
        zendesk:  isNaN(zv) ? null : Math.min(10, Math.max(0, zv)),
        provaAvg: null,
        comment:  comment,
        photo:    pendingPhoto,
        anexos:   pendingAnexos,
        scores:   scores
      });
      modal.style.display = 'none';
    };
  }

  // --- Training Modal ---

  function openTraining(analysts, onSave) {
    var modal = document.getElementById('trainModal');
    document.getElementById('tDate').value = '';
    document.getElementById('tMod').value = '';
    document.getElementById('tLeader').value = '';
    document.getElementById('tObs').value = '';
    document.getElementById('tAnalysts').innerHTML = analysts.map(function(a) {
      return '<div class="prova-row">' +
        '<input type="checkbox" id="cb-' + a.id + '" value="' + esc(a.name) + '">' +
        '<label for="cb-' + a.id + '" style="flex:1;cursor:pointer">' + esc(a.name) + ' <span class="' + D.sectorBadgeClass(a.sector) + '">' + esc(a.sector) + '</span></label>' +
      '</div>';
    }).join('');
    modal.style.display = 'flex';

    document.getElementById('trainSaveBtn').onclick = function() {
      var date = document.getElementById('tDate').value;
      var mod  = document.getElementById('tMod').value.trim();
      var lead = document.getElementById('tLeader').value.trim();
      if (!mod || !lead) { alert('Preencha módulo e líder.'); return; }
      var selected = Array.from(document.querySelectorAll('#tAnalysts input[type=checkbox]:checked'))
        .map(function(i) { return i.value; });
      onSave({
        date: date, module: mod, leader: lead,
        obs: document.getElementById('tObs').value,
        analysts: selected, provas: {}, status: 'pending'
      });
      modal.style.display = 'none';
    };
  }

  // --- Prova Modal ---

  function openProva(training, trainingIndex, onSave) {
    var modal = document.getElementById('provaModal');
    document.getElementById('provaModTitle').textContent = training.module;
    document.getElementById('provaRows').innerHTML = (training.analysts || []).map(function(name) {
      var cur = training.provas && training.provas[name] != null ? training.provas[name] : '';
      var safeId = 'prova-' + name.replace(/\s/g, '_');
      return '<div class="prova-row">' +
        '<span style="flex:1">' + esc(name) + '</span>' +
        '<input type="number" class="prova-input" id="' + safeId + '" min="0" max="10" step="0.5" value="' + cur + '" placeholder="0–10">' +
      '</div>';
    }).join('');
    modal.style.display = 'flex';

    document.getElementById('provaSaveBtn').onclick = function() {
      var provas = {};
      (training.analysts || []).forEach(function(name) {
        var safeId = 'prova-' + name.replace(/\s/g, '_');
        var el = document.getElementById(safeId);
        if (el && el.value !== '') {
          var v = Math.min(10, Math.max(0, parseFloat(el.value)));
          if (!isNaN(v)) provas[name] = v;
        }
      });
      onSave(trainingIndex, provas);
      modal.style.display = 'none';
    };
  }

  // --- Manage Modal (modules + sectors) ---

  function openManage(modules, sectors, zendeskCfg, onSave) {
    var modal = document.getElementById('manageModal');
    var pendingModules = modules.slice();
    var pendingSectors = sectors.slice();

    renderManageModules(pendingModules);
    renderManageSectors(pendingSectors);

    // Populate Zendesk tab
    var zdCfg = zendeskCfg || {};
    var zdSubEl   = document.getElementById('zdSubdomain');
    var zdEmailEl = document.getElementById('zdEmail');
    var zdTokEl   = document.getElementById('zdApiToken');
    var zdGemEl     = document.getElementById('zdGeminiKey');
    var zdUrlEl     = document.getElementById('zdScriptUrl');
    var zdGrpEl     = document.getElementById('zdGroupName');
    var zdDateFromEl = document.getElementById('zdDateFrom');
    var zdDateToEl   = document.getElementById('zdDateTo');
    var zdProgEl    = document.getElementById('zdImportProgress');
    if (zdSubEl)      zdSubEl.value   = zdCfg.subdomain  || '';
    if (zdEmailEl)    zdEmailEl.value = zdCfg.email      || '';
    if (zdTokEl)      zdTokEl.value   = zdCfg.apiToken   || '';
    if (zdGemEl)      zdGemEl.value   = zdCfg.geminiKey  || '';
    if (zdUrlEl)      zdUrlEl.value   = zdCfg.scriptUrl  || '';
    // Popula checkboxes de grupos
    var selectedIds = zdCfg.groupIds || ['6441506014871', '21198035409559', '360001272933'];
    if (typeof selectedIds === 'string') selectedIds = [selectedIds];
    document.querySelectorAll('[data-zd-group]').forEach(function(cb) {
      cb.checked = selectedIds.indexOf(cb.getAttribute('data-zd-group')) !== -1;
    });
    // Datas padrão: De = dia 01 do mês vigente, Até = hoje
    if (zdDateFromEl) {
      zdDateFromEl.value = zdCfg.dateFrom || (function() {
        var today = new Date();
        return today.getFullYear() + '-' +
               String(today.getMonth() + 1).padStart(2, '0') + '-01';
      })();
    }
    if (zdDateToEl) {
      zdDateToEl.value = zdCfg.dateTo || (function() {
        var today = new Date();
        return today.getFullYear() + '-' +
               String(today.getMonth() + 1).padStart(2, '0') + '-' +
               String(today.getDate()).padStart(2, '0');
      })();
    }
    if (zdProgEl)     zdProgEl.textContent = '';

    switchManageTab('modules');
    modal.style.display = 'flex';

    document.getElementById('addModuleBtn').onclick = function() {
      var val = document.getElementById('newModuleInput').value.trim();
      if (!val) return;
      if (pendingModules.indexOf(val) !== -1) { alert('Módulo já existe.'); return; }
      pendingModules.push(val);
      document.getElementById('newModuleInput').value = '';
      renderManageModules(pendingModules);
    };

    document.getElementById('addSectorBtn').onclick = function() {
      var val = document.getElementById('newSectorInput').value.trim();
      if (!val) return;
      if (pendingSectors.indexOf(val) !== -1) { alert('Setor já existe.'); return; }
      pendingSectors.push(val);
      document.getElementById('newSectorInput').value = '';
      renderManageSectors(pendingSectors);
    };

    document.getElementById('manageSaveBtn').onclick = function() {
      if (!pendingModules.length) { alert('Deve existir pelo menos um módulo.'); return; }
      if (!pendingSectors.length) { alert('Deve existir pelo menos um setor.'); return; }
      var g = function(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };

      // Lê e persiste nameMap atual da tabela de vinculação (se visível)
      var selects = document.querySelectorAll('#zdNameMapRows select[data-zdname]');
      if (selects.length) {
        var currentNameMap = ZendeskSync.getConfig().nameMap || {};
        selects.forEach(function(sel) {
          var zdName = sel.getAttribute('data-zdname');
          var val    = sel.value;
          if (zdName && val && val !== '__NEW__') currentNameMap[zdName] = val;
          else if (zdName && !val)               delete currentNameMap[zdName];
        });
        var cfgNow = ZendeskSync.getConfig();
        ZendeskSync.saveConfig(Object.assign({}, cfgNow, { nameMap: currentNameMap }));
      }

      onSave({
        modules:    pendingModules,
        sectors:    pendingSectors,
        zendeskCfg: {
          subdomain: g('zdSubdomain').replace(/\.zendesk\.com.*/i, ''),
          email:     g('zdEmail'),
          apiToken:  g('zdApiToken'),
          geminiKey: g('zdGeminiKey'),
          scriptUrl: g('zdScriptUrl'),
          groupIds:  (function() {
            var checked = [];
            document.querySelectorAll('[data-zd-group]').forEach(function(cb) {
              if (cb.checked) checked.push(cb.getAttribute('data-zd-group'));
            });
            return checked.length ? checked : ['6441506014871', '21198035409559', '360001272933'];
          })(),
          dateFrom:  g('zdDateFrom') || '',
          dateTo:    g('zdDateTo') || ''
        }
      });
      modal.style.display = 'none';
    };

    // Renderiza tabela de mapeamento nome Zendesk → analista SkillMatrix
    // Normaliza para busca (minúsculo, sem acento)
    function _nameNorm(s) {
      return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    }

    // Monta a linha de vínculo de um nome do Zendesk
    function _nameMapRowHtml(zdName) {
      var data = UIModals._nameMapData; if (!data) return '';
      var nameMap  = ZendeskSync.getConfig().nameMap || {};
      var current  = nameMap[zdName] || '';
      var isNew    = current === '__NEW__';
      var optStyle = 'background:#fff;color:#0F2440';
      var selStyle = 'background:#fff;border:1px solid var(--border);color:#0F2440;border-radius:5px;padding:3px 6px;font-size:11px;font-family:inherit';
      var sectorOpts = data.sectors.map(function(s) { return '<option style="' + optStyle + '">' + D.escapeHtml(s) + '</option>'; }).join('');
      var options = '<option value="" style="' + optStyle + ';color:#9AA8BC">— não vincular —</option>' +
        '<option value="__NEW__"' + (isNew ? ' selected' : '') + ' style="background:#fff;color:#15803D;font-weight:600">+ Cadastrar novo analista</option>' +
        data.analystNames.map(function(n) {
          return '<option value="' + D.escapeHtml(n) + '" style="' + optStyle + '"' + (current === n ? ' selected' : '') + '>' + D.escapeHtml(n) + '</option>';
        }).join('');
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<span style="font-size:11px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + D.escapeHtml(zdName) + '">' + D.escapeHtml(zdName) + '</span>' +
        '<span style="font-size:11px;color:var(--muted)">→</span>' +
        '<select data-zdname="' + D.escapeHtml(zdName) + '" style="' + selStyle + ';flex:1" onchange="UIModals._zdMapChange(this)">' + options + '</select>' +
        '<select data-sector style="' + selStyle + ';min-width:90px;' + (isNew ? '' : 'display:none') + '">' + sectorOpts + '</select>' +
      '</div>';
    }

    // Após a importação: NÃO lista todos os agentes do Zendesk (muitos não são
    // analistas). Mostra só um campo de busca; o usuário digita o nome e vincula.
    UIModals.renderNameMap = function(analystNames, sectors) {
      var found     = ZendeskSync.getFoundNames();
      var nameMap   = ZendeskSync.getConfig().nameMap || {};
      var container = document.getElementById('zdNameMapContainer');
      var rows      = document.getElementById('zdNameMapRows');
      var hint      = document.getElementById('zdNameMapHint');
      var searchEl  = document.getElementById('zdNameMapSearch');
      if (!container || !rows || !found.length) return;

      var unmapped = found.filter(function(zdName) {
        return !nameMap[zdName] || nameMap[zdName] === '';
      });

      // Todos já vinculados → nada a exibir
      if (!unmapped.length) { container.style.display = 'none'; return; }

      UIModals._nameMapData = {
        unmapped: unmapped,
        analystNames: analystNames || [],
        sectors: (sectors && sectors.length) ? sectors : ['Chat', 'Telefone', 'Notas']
      };
      container.style.display = 'block';
      if (searchEl) searchEl.value = '';
      if (hint) hint.textContent = unmapped.length + ' usuário(s) do Zendesk sem vínculo. Digite um nome para localizar e vincular (opcional).';
      rows.innerHTML = '';
    };

    // Busca incremental: só renderiza os nomes que casam com o que foi digitado
    UIModals._zdNameMapFilter = function(query) {
      var rows = document.getElementById('zdNameMapRows');
      var data = UIModals._nameMapData;
      if (!rows || !data) return;
      var q = _nameNorm(query);
      if (!q) { rows.innerHTML = ''; return; }
      var matches = data.unmapped.filter(function(zdName) {
        return _nameNorm(zdName).indexOf(q) !== -1;
      }).slice(0, 20);
      rows.innerHTML = matches.length
        ? matches.map(_nameMapRowHtml).join('')
        : '<div style="font-size:11px;color:var(--muted);padding:4px 0">Nenhum usuário do Zendesk encontrado com esse nome.</div>';
    };

    UIModals._zdMapChange = function(sel) {
      var sectorSel = sel.parentElement.querySelector('select[data-sector]');
      if (sectorSel) sectorSel.style.display = sel.value === '__NEW__' ? '' : 'none';
      // Persiste o vínculo na hora (analista existente) para não se perder ao filtrar
      var zdName = sel.getAttribute('data-zdname');
      if (zdName && sel.value && sel.value !== '__NEW__') {
        var cfg = ZendeskSync.getConfig();
        var nm  = cfg.nameMap || {};
        nm[zdName] = sel.value;
        ZendeskSync.saveConfig(Object.assign({}, cfg, { nameMap: nm }));
      }
    };

    document.getElementById('zdTestBtn') && (document.getElementById('zdTestBtn').onclick = function() {
      var urlEl = document.getElementById('zdScriptUrl');
      var resEl = document.getElementById('zdTestResult');
      if (!urlEl || !urlEl.value.trim()) { alert('Informe a URL do Apps Script.'); return; }
      var btn = document.getElementById('zdTestBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="ti ti-loader-2"></i> Testando…';
      if (resEl) { resEl.textContent = ''; resEl.style.color = 'var(--muted)'; }
      fetch(urlEl.value.trim(), { redirect: 'follow' })
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.error) throw new Error(data.error);
          var count = Object.keys(data.agents || {}).length;
          if (resEl) {
            resEl.textContent = '✓ Conectado — ' + count + ' analistas na planilha';
            resEl.style.color = '#15803D';
          }
        })
        .catch(function(err) {
          if (resEl) {
            resEl.textContent = '✗ ' + err.message;
            resEl.style.color = '#CC0000';
          }
        })
        .finally(function() {
          btn.disabled = false;
          btn.innerHTML = '<i class="ti ti-plug-connected"></i> Testar conexão';
        });
    });

    function renderManageModules(list) {
      document.getElementById('modulesList').innerHTML = list.map(function(m, i) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--white)">' +
          '<span>' + esc(m) + '</span>' +
          '<button class="edit-btn" style="color:#CC0000" onclick="UIModals._removeListItem(' + i + ',\'modules\')" title="Remover"><i class="ti ti-x"></i></button>' +
        '</div>';
      }).join('');
    }

    function renderManageSectors(list) {
      document.getElementById('sectorsList').innerHTML = list.map(function(s, i) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--white)">' +
          '<span>' + esc(s) + '</span>' +
          '<button class="edit-btn" style="color:#CC0000" onclick="UIModals._removeListItem(' + i + ',\'sectors\')" title="Remover"><i class="ti ti-x"></i></button>' +
        '</div>';
      }).join('');
    }

    // Expose for inline onclick callbacks in the manage modal
    UIModals._removeListItem = function(idx, type) {
      if (type === 'modules') {
        pendingModules.splice(idx, 1);
        renderManageModules(pendingModules);
      } else {
        pendingSectors.splice(idx, 1);
        renderManageSectors(pendingSectors);
      }
    };
  }

  // --- Shared helpers ---

  function switchModalTab(modalId, tabName) {
    var modal = document.getElementById(modalId);
    modal.querySelectorAll('.modal-tab').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    modal.querySelectorAll('.modal-tab-panel').forEach(function(p) {
      p.classList.toggle('active', p.dataset.panel === tabName);
    });
  }

  function switchManageTab(tabName) {
    switchModalTab('manageModal', tabName);
  }

  function renderAnexosList(list, containerId, onChange) {
    var container = document.getElementById(containerId);
    container.innerHTML = list.map(function(src, i) {
      return '<div class="attachment-item">' +
        '<img src="' + esc(src) + '" alt="Anexo ' + (i + 1) + '">' +
        '<button class="attachment-remove" onclick="UIModals._removeAnexo(\'' + containerId + '\',' + i + ')" aria-label="Remover anexo">×</button>' +
      '</div>';
    }).join('');
    // Store reference for removal
    container._list = list;
    container._onChange = onChange;
  }

  function readFileAsBase64(file, callback) {
    var reader = new FileReader();
    reader.onload = function(e) { callback(e.target.result); };
    reader.readAsDataURL(file);
  }

  function updateCommentCounter() {
    var textarea = document.getElementById('editComment');
    if (!textarea) return;
    var counter = document.getElementById('editCommentCounter');
    if (!counter) return;
    var len = textarea.value.length;
    counter.textContent = len + '/500';
    counter.className = 'comment-counter' + (len > 480 ? ' char-warn' : '') + (len >= 500 ? ' char-over' : '');
  }

  function closeOnEsc(e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay').forEach(function(m) {
      if (m.style.display !== 'none') m.style.display = 'none';
    });
  }

  function closeOnOverlayClick(e) {
    if (e.target.classList.contains('modal-overlay')) {
      e.target.style.display = 'none';
    }
  }

  function init() {
    document.addEventListener('keydown', closeOnEsc);
    document.querySelectorAll('.modal-overlay').forEach(function(m) {
      m.addEventListener('click', closeOnOverlayClick);
    });
    var editComment = document.getElementById('editComment');
    if (editComment) editComment.addEventListener('input', updateCommentCounter);

    // Tab switching in edit modal
    document.querySelectorAll('.modal-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        var modalEl = tab.closest('.modal-overlay');
        if (modalEl) switchModalTab(modalEl.id, tab.dataset.tab);
      });
    });
  }

  function setScore(btn, val) {
    var row = btn.closest('.mod-row');
    row.querySelectorAll('.score-btn').forEach(function(b, i) {
      b.className = 'score-btn' + (i + 1 === val ? ' s' + (i + 1) : '');
    });
  }

  function removeAnexo(containerId, idx) {
    var container = document.getElementById(containerId);
    if (!container || !container._list) return;
    container._list.splice(idx, 1);
    renderAnexosList(container._list, containerId, container._onChange);
    if (container._onChange) container._onChange(container._list);
  }

  // --- Zendesk Tickets Modal ---

  function openZendeskTickets(analyst, ticketData, modules, onSave) {
    var modal = document.getElementById('zdTicketsModal');
    if (!modal) return;
    if (typeof modules === 'function') { onSave = modules; modules = []; }
    modules = modules || [];

    var zdSubdomain = (ZendeskSync.getConfig().subdomain || '').trim();

    document.getElementById('zdTicketsAnalystName').textContent = analyst.name;

    var body      = document.getElementById('zdTicketsBody');
    var scoreEl   = document.getElementById('zdNewScore');
    var scoreLbl  = document.getElementById('zdScoreLabel');

    // Cópia de trabalho. bad_tickets é a lista MESTRE (nunca apagada);
    // o filtro de data apenas oculta itens visualmente, sem remover.
    // Preserva module_good/category_good/all_tickets ao salvar (senão seriam perdidos,
    // pois o onSave grava o objeto inteiro de volta).
    var pending = ticketData
      ? {
          good_count:    ticketData.good_count,
          bad_tickets:   ticketData.bad_tickets.map(function(t) { return Object.assign({}, t); }),
          module_good:   ticketData.module_good   || {},
          category_good: ticketData.category_good || {},
          all_tickets:   ticketData.all_tickets   || []
        }
      : null;

    // Filtro de data (em inteiros YYYYMMDD). null = sem filtro (mostra tudo).
    var filterFromInt = null;
    var filterToInt   = null;
    var filterModule  = null; // null = todos os módulos
    var allTickets    = (ticketData && ticketData.all_tickets) || []; // todos os atendimentos (não só avaliados)
    var viewMode      = 'csat'; // 'csat' = avaliados/negativos · 'all' = todos os atendimentos

    // Notas do Zendesk por módulo (calculado da cópia de trabalho → reflete toggles)
    var modScores = {};
    function computeModScores() {
      var mg = (ticketData && ticketData.module_good) || {};
      var out = {};
      (modules || []).forEach(function(m) {
        var good = mg[m] || 0;
        var badArr = pending ? pending.bad_tickets.filter(function(x) { return x.module === m && x.consider; }) : [];
        out[m] = { good: good, bad: badArr.length, score: ZendeskSync.recalcScore(good, badArr) };
      });
      return out;
    }

    // Pré-preenche os campos com o período importado (se houver), mas NÃO aplica
    // o filtro automaticamente — ao abrir, todos os tickets aparecem.
    var cfg          = ZendeskSync.getConfig();
    var _defaultFrom = cfg.dateFrom || '';
    var _defaultTo   = cfg.dateTo   || '';

    // 'yyyy-mm-dd' (input date) → inteiro YYYYMMDD
    function inputToInt(str) {
      if (!str) return null;
      var p = str.split('-');
      if (p.length !== 3) return null;
      return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]);
    }
    // 'dd/mm/yyyy' ou 'dd/mm' (data do ticket) → inteiro YYYYMMDD
    function ticketDateToInt(str) {
      if (!str) return null;
      var p = str.split('/');
      if (p.length === 3) return (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]);
      if (p.length === 2) return 2026 * 10000 + (+p[1]) * 100 + (+p[0]);
      return null;
    }
    function ticketVisible(ticket) {
      if (filterModule !== null && (ticket.module || '') !== filterModule) return false;
      if (filterFromInt === null && filterToInt === null) return true;
      var n = ticketDateToInt(ticket.date);
      if (n === null) return true; // sem data → sempre mostra
      if (filterFromInt !== null && n < filterFromInt) return false;
      if (filterToInt   !== null && n > filterToInt)   return false;
      return true;
    }

    function scoreHex(s) {
      return s == null ? 'var(--muted)' : s >= 7 ? '#15803D' : s >= 5 ? '#B45309' : '#CC0000';
    }

    // Painel "Nota Zendesk por módulo" — clicar filtra os tickets do módulo
    function renderModuleScores() {
      var box = document.getElementById('zdModuleScores');
      if (!box) return;
      var entries = Object.keys(modScores)
        .map(function(m) { return { module: m, d: modScores[m] }; })
        .filter(function(e) { return e.d.bad > 0; }) // só módulos com avaliações negativas
        .sort(function(a, b) {
          if (b.d.bad !== a.d.bad) return b.d.bad - a.d.bad; // mais negativas primeiro
          var sa = a.d.score == null ? 99 : a.d.score, sb = b.d.score == null ? 99 : b.d.score;
          return sa - sb; // empate → pior nota primeiro
        });
      if (!entries.length) {
        box.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:4px 0">Nenhum módulo com avaliações negativas neste período.</div>';
        return;
      }
      var head = '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:7px;font-weight:600">Módulos mais negativados (Zendesk)</div>';
      var allBtn = '<button type="button" onclick="UIModals._zdFilterModule(null)" style="font-size:10px;padding:3px 10px;border-radius:99px;border:1px solid ' + (filterModule === null ? 'var(--blue)' : 'var(--border)') + ';background:' + (filterModule === null ? 'var(--blue-soft)' : '#fff') + ';color:' + (filterModule === null ? 'var(--blue)' : 'var(--muted)') + ';cursor:pointer;font-family:inherit;font-weight:600;margin:0 6px 6px 0">Todos</button>';
      var chips = entries.map(function(e) {
        var sel = filterModule === e.module;
        var sc = e.d.score == null ? '—' : e.d.score.toFixed(1);
        return '<button type="button" onclick="UIModals._zdFilterModule(\'' + esc(e.module).replace(/'/g, "\\'") + '\')" ' +
          'style="font-size:11px;padding:5px 11px;border-radius:10px;border:1px solid ' + (sel ? 'var(--blue)' : 'var(--border)') + ';background:' + (sel ? 'var(--blue-soft)' : '#fff') + ';cursor:pointer;font-family:inherit;margin:0 6px 6px 0;display:inline-flex;align-items:center;gap:7px">' +
          '<span style="color:var(--ink);font-weight:500">' + esc(e.module) + '</span>' +
          '<b style="color:' + scoreHex(e.d.score) + '">' + sc + '</b>' +
          '<span style="color:var(--muted);font-size:10px">(' + e.d.good + '👍/' + e.d.bad + '👎)</span>' +
        '</button>';
      }).join('');
      box.innerHTML = head + '<div style="display:flex;flex-wrap:wrap;align-items:center">' + allBtn + chips + '</div>';
    }

    function updateScoreDisplay() {
      if (!pending) return;
      var newScore = ZendeskSync.recalcScore(pending.good_count, pending.bad_tickets);
      var orig     = ZendeskSync.recalcScore(pending.good_count, pending.bad_tickets.map(function(t) {
        return Object.assign({}, t, { consider: true });
      }));
      if (scoreEl) {
        scoreEl.textContent = newScore !== null ? newScore.toFixed(1) : '—';
        scoreEl.style.color = newScore === null ? 'var(--muted)'
          : newScore >= 7 ? '#15803D' : newScore >= 5 ? '#B45309' : '#CC0000';
      }
      if (scoreLbl && orig !== null && newScore !== null) {
        var diff = parseFloat((newScore - orig).toFixed(1));
        scoreLbl.textContent = diff > 0 ? '(+' + diff + ' excluindo comportamentais)'
          : diff < 0 ? '(' + diff + ')' : '';
        scoreLbl.style.color = diff > 0 ? '#15803D' : diff < 0 ? '#CC0000' : 'var(--muted)';
      }
    }

    function dateInRange(dStr) {
      if (filterFromInt === null && filterToInt === null) return true;
      var n = ticketDateToInt(dStr);
      if (n === null) return true;
      if (filterFromInt !== null && n < filterFromInt) return false;
      if (filterToInt   !== null && n > filterToInt)   return false;
      return true;
    }

    // Atualiza apenas a lista de tickets (sem sobrescrever o filtro de data)
    function renderList() {
      var listEl = document.getElementById('zdTicketList');
      if (!listEl) return;

      // Modo "Todos os atendimentos" — lista completa (avaliados ou não)
      if (viewMode === 'all') {
        var vis = allTickets.filter(function(t) {
          if (filterModule !== null && (t.module || '') !== filterModule) return false;
          return dateInRange(t.date);
        });
        listEl.innerHTML =
          '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">' +
            vis.length + ' de ' + allTickets.length + ' atendimentos' + (filterModule ? ' · módulo: ' + esc(filterModule) : '') +
          '</div>' +
          (vis.length === 0
            ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Nenhum atendimento nesse filtro.</div>'
            : vis.map(function(t) {
                return '<div style="border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin-bottom:7px;background:#FAFBFD">' +
                  '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
                    (zdSubdomain
                      ? '<a href="https://' + esc(zdSubdomain) + '.zendesk.com/agent/tickets/' + esc(String(t.id)) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:var(--blue);text-decoration:none">#' + esc(String(t.id)) + ' <i class="ti ti-external-link" style="font-size:9px"></i></a>'
                      : '<span style="font-size:10px;color:var(--muted)">#' + esc(String(t.id)) + '</span>') +
                    '<span style="font-size:10px;color:var(--muted)">' + esc(t.date) + '</span>' +
                  '</div>' +
                  (t.subject ? '<div style="font-size:11px;color:var(--ink);font-weight:500;margin-top:4px">' + esc(t.subject) + '</div>' : '') +
                  '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">' +
                    (t.module ? '<span class="bc">' + esc(t.module) + '</span>' : '<span style="font-size:10px;color:var(--muted)">sem módulo</span>') +
                    (t.status ? '<span style="font-size:10px;color:var(--muted)">· ' + esc(t.status) + '</span>' : '') +
                  '</div>' +
                '</div>';
              }).join(''));
        return;
      }

      if (!pending) {
        listEl.innerHTML =
          '<div style="padding:20px;text-align:center;color:var(--muted);font-size:12px">' +
            '<i class="ti ti-cloud-off" style="font-size:28px;display:block;margin-bottom:8px"></i>' +
            'Dados de tickets não disponíveis.' +
          '</div>';
        if (scoreEl) scoreEl.textContent = analyst.zendesk != null ? analyst.zendesk.toFixed(1) : '—';
        return;
      }

      var visible  = pending.bad_tickets.filter(ticketVisible);
      var good     = pending.good_count;
      var consBad  = pending.bad_tickets.filter(function(t) { return t.consider; }).length;
      var total    = good + pending.bad_tickets.length;
      var filtered = visible.length < pending.bad_tickets.length;

      listEl.innerHTML =
        '<div style="font-size:11px;color:var(--muted);margin-bottom:10px">' +
          good + ' positivos · ' + consBad + '/' + pending.bad_tickets.length + ' considerados · total: ' + total +
          (filtered ? ' <span style="color:#B45309">· ' + visible.length + ' de ' + pending.bad_tickets.length + ' exibidos</span>' : '') +
        '</div>' +
        (visible.length === 0
          ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Nenhum ticket nesse período.</div>'
          : visible.map(function(ticket) {
              var idx        = pending.bad_tickets.indexOf(ticket);
              var isConsider = ticket.consider;
              var borderCol  = isConsider ? '#F2C4C4' : 'var(--border)';
              var tagBg      = isConsider ? '#FBEAEA' : '#F1F4F8';
              var tagColor   = isConsider ? '#CC0000' : 'var(--muted)';
              return (
                '<div style="border:1px solid ' + borderCol + ';border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#FAFBFD">' +
                  '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">' +
                    '<div style="flex:1;min-width:0">' +
                      (zdSubdomain
                        ? '<a href="https://' + esc(zdSubdomain) + '.zendesk.com/agent/tickets/' + esc(String(ticket.id)) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:var(--blue);text-decoration:none" title="Abrir ticket no Zendesk">#' + esc(String(ticket.id)) + ' <i class="ti ti-external-link" style="font-size:9px"></i></a>'
                        : '<span style="font-size:10px;color:var(--muted)">#' + esc(String(ticket.id)) + '</span>') +
                      '<span style="font-size:10px;color:var(--muted)"> · ' + esc(ticket.date) + '</span>' +
                      (ticket.category ? ' <span style="font-size:10px;padding:1px 7px;border-radius:4px;background:' + tagBg + ';color:' + tagColor + '">' + esc(ticket.category) + '</span>' : '') +
                    '</div>' +
                    '<button style="flex-shrink:0;font-size:10px;padding:3px 10px;border-radius:6px;border:1px solid ' + (isConsider ? '#CC0000' : 'var(--border)') + ';background:' + (isConsider ? '#FBEAEA' : '#F1F4F8') + ';color:' + (isConsider ? '#CC0000' : 'var(--muted)') + ';cursor:pointer;white-space:nowrap;font-family:inherit;font-weight:500" ' +
                      'onclick="UIModals._zdToggle(' + idx + ')">' +
                      (isConsider ? '<i class="ti ti-x" style="font-size:9px"></i> Técnico' : '<i class="ti ti-check" style="font-size:9px"></i> Comportamental') +
                    '</button>' +
                  '</div>' +
                  (ticket.subject ? '<div style="font-size:11px;color:var(--white);font-weight:500;margin-bottom:4px">' + esc(ticket.subject) + '</div>' : '') +
                  '<div style="font-size:11px;color:var(--muted);line-height:1.5">' +
                    (ticket.comment ? '"' + esc(ticket.comment.substring(0, 220)) + '"' : '<em>Sem comentário do cliente</em>') +
                  '</div>' +
                '</div>'
              );
            }).join(''));

      updateScoreDisplay();
    }

    // Monta o corpo do modal uma única vez (filtro + container da lista)
    function setupBody() {
      var inputStyle = 'background:#fff;border:1px solid var(--border);color:var(--ink);border-radius:8px;padding:6px 9px;font-size:11px;font-family:inherit;color-scheme:light';
      var btnBase = 'font-size:11px;padding:6px 12px;border-radius:9px;cursor:pointer;font-family:inherit';
      var toggleHtml = allTickets.length
        ? '<div style="display:flex;gap:6px;margin-bottom:12px">' +
            '<button id="zdViewCsat" type="button" onclick="UIModals._zdSetView(\'csat\')" style="' + btnBase + ';border:1px solid var(--blue);background:var(--blue-soft);color:var(--blue);font-weight:600">Avaliados (CSAT)</button>' +
            '<button id="zdViewAll" type="button" onclick="UIModals._zdSetView(\'all\')" style="' + btnBase + ';border:1px solid var(--border);background:#fff;color:var(--muted);font-weight:500">Todos os atendimentos (' + allTickets.length + ')</button>' +
          '</div>'
        : '';
      body.innerHTML =
        '<div id="zdModuleScores" style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)"></div>' +
        toggleHtml +
        '<div style="background:#FBF1E3;border:1px solid #F1DFBE;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:11px;color:#B45309;line-height:1.5">' +
          '<i class="ti ti-info-circle"></i> <strong>Marque apenas questões técnicas</strong> para compor a nota. Comportamentais ficam com a supervisão.' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
          '<i class="ti ti-calendar-search" style="color:var(--muted);font-size:14px"></i>' +
          '<span style="font-size:11px;color:var(--muted)">De</span>' +
          '<input type="date" id="zdTktDateFrom" value="' + _defaultFrom + '" style="' + inputStyle + ';cursor:pointer">' +
          '<span style="font-size:11px;color:var(--muted)">até</span>' +
          '<input type="date" id="zdTktDateTo" value="' + _defaultTo + '" style="' + inputStyle + ';cursor:pointer">' +
          '<button id="zdApplyFilterBtn" type="button" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid var(--blue);background:rgba(59,130,246,.15);color:var(--blue);cursor:pointer;font-family:inherit;font-weight:500">🔍 Filtrar</button>' +
          '<button id="zdClearFilterBtn" type="button" style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit">Limpar</button>' +
        '</div>' +
        '<div id="zdTicketList"></div>';

      // Event listeners diretos — acesso por closure às variáveis do filtro.
      var applyBtn = document.getElementById('zdApplyFilterBtn');
      var clearBtn = document.getElementById('zdClearFilterBtn');

      applyBtn.onclick = function() {
        var fromEl = document.getElementById('zdTktDateFrom');
        var toEl   = document.getElementById('zdTktDateTo');
        filterFromInt = inputToInt(fromEl && fromEl.value);
        filterToInt   = inputToInt(toEl   && toEl.value);
        renderList();
      };

      clearBtn.onclick = function() {
        filterFromInt = null;
        filterToInt   = null;
        var fromEl = document.getElementById('zdTktDateFrom');
        var toEl   = document.getElementById('zdTktDateTo');
        if (fromEl) fromEl.value = '';
        if (toEl)   toEl.value = '';
        renderList();
      };
    }

    UIModals._zdToggle = function(idx) {
      if (!pending) return;
      pending.bad_tickets[idx].consider = !pending.bad_tickets[idx].consider;
      modScores = computeModScores(); // reflete o toggle na nota por módulo
      renderModuleScores();
      renderList();
    };

    UIModals._zdFilterModule = function(mod) {
      filterModule = mod;
      renderModuleScores();
      renderList();
    };

    UIModals._zdSetView = function(mode) {
      viewMode = mode;
      var a = document.getElementById('zdViewCsat'), b = document.getElementById('zdViewAll');
      function style(btn, on) {
        if (!btn) return;
        btn.style.background  = on ? 'var(--blue-soft)' : '#fff';
        btn.style.borderColor = on ? 'var(--blue)' : 'var(--border)';
        btn.style.color       = on ? 'var(--blue)' : 'var(--muted)';
        btn.style.fontWeight  = on ? '600' : '500';
      }
      style(a, mode === 'csat'); style(b, mode === 'all');
      renderList();
    };

    setupBody();
    modScores = computeModScores();
    renderModuleScores();
    renderList(); // Mostra todos os tickets ao abrir (sem filtro aplicado)

    modal.style.display = 'flex';

    document.getElementById('zdTicketsSaveBtn').onclick = function() {
      if (!pending) { modal.style.display = 'none'; return; }
      var newScore = ZendeskSync.recalcScore(pending.good_count, pending.bad_tickets);
      onSave(newScore, pending);
      modal.style.display = 'none';
    };
  }

  // Consulta global: todos os tickets negativos de um módulo (ou "Sem módulo")
  // somando a equipe toda. Apenas leitura.
  function openModuleTickets(moduleName, analysts, subdomain) {
    var modal  = document.getElementById('zdModTktModal');
    var nameEl = document.getElementById('zdModTktName');
    var infoEl = document.getElementById('zdModTktInfo');
    var body   = document.getElementById('zdModTktBody');
    if (!modal || !body) return;

    var label = moduleName ? moduleName : 'Sem módulo';
    var list  = (ZendeskSync.negativesForModule(analysts, moduleName) || []).slice();
    // Mais recentes primeiro (data dd/mm/yyyy)
    function dInt(s) { var p = String(s || '').split('/'); return p.length === 3 ? (+p[2]) * 10000 + (+p[1]) * 100 + (+p[0]) : 0; }
    list.sort(function(a, b) { return dInt(b.date) - dInt(a.date); });

    var considered = list.filter(function(t) { return t.consider; }).length;
    var sub = (subdomain || '').trim();

    if (nameEl) nameEl.textContent = label;
    if (infoEl) infoEl.textContent = list.length + ' ticket(s) negativo(s)' +
      (moduleName ? '' : ' sem módulo identificado') + ' · ' + considered + ' considerado(s) na nota';

    body.innerHTML = list.length
      ? list.map(function(t) {
          return '<div style="border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:#FAFBFD">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
              (sub
                ? '<a href="https://' + esc(sub) + '.zendesk.com/agent/tickets/' + esc(String(t.id)) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:var(--blue);text-decoration:none">#' + esc(String(t.id)) + ' <i class="ti ti-external-link" style="font-size:9px"></i></a>'
                : '<span style="font-size:10px;color:var(--muted)">#' + esc(String(t.id)) + '</span>') +
              '<span style="font-size:10px;color:var(--muted)">' + esc(t.date) + '</span>' +
            '</div>' +
            '<div style="font-size:11px;color:var(--ink);font-weight:600;margin-top:4px">' + esc(t.analyst) +
              (t.zdCategory ? ' <span style="font-size:10px;padding:1px 7px;border-radius:4px;background:#F1F4F8;color:var(--muted);font-weight:400">' + esc(t.zdCategory) + '</span>' : '') +
              (t.consider ? '' : ' <span style="font-size:10px;color:#B45309;font-weight:400">(comportamental)</span>') +
            '</div>' +
            (t.subject ? '<div style="font-size:11px;color:var(--ink);margin-top:3px">' + esc(t.subject) + '</div>' : '') +
            '<div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:3px">' +
              (t.comment ? '"' + esc(t.comment.substring(0, 240)) + '"' : '<em>Sem comentário do cliente</em>') +
            '</div>' +
          '</div>';
        }).join('')
      : '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Nenhum ticket negativo neste grupo.</div>';

    modal.style.display = 'flex';
  }

  return {
    openEdit:            openEdit,
    openAdd:             openAdd,
    openTraining:        openTraining,
    openProva:           openProva,
    openManage:          openManage,
    openZendeskTickets:  openZendeskTickets,
    openModuleTickets:   openModuleTickets,
    init:                init,
    switchModalTab:      switchModalTab,
    _setScore:           setScore,
    _removeAnexo:        removeAnexo,
    _removeListItem:     function() {},
    _zdToggle:           function() {},
    _zdFilterModule:     function() {},
    _zdSetView:          function() {},
    openZendeskHelp:     function() {
      var m = document.getElementById('zdHelpModal');
      if (m) m.style.display = 'flex';
    }
  };
})();
