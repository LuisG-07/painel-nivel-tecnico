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
    UIModals.renderNameMap = function(analystNames, sectors) {
      var found     = ZendeskSync.getFoundNames();
      var nameMap   = ZendeskSync.getConfig().nameMap || {};
      var container = document.getElementById('zdNameMapContainer');
      var rows      = document.getElementById('zdNameMapRows');
      if (!container || !rows || !found.length) return;

      // Filtra apenas nomes que ainda não foram vinculados
      var unmapped = found.filter(function(zdName) {
        return !nameMap[zdName] || nameMap[zdName] === '';
      });

      // Se todos já foram vinculados, esconde o container
      if (!unmapped.length) {
        container.style.display = 'none';
        return;
      }

      var sectorList = (sectors && sectors.length) ? sectors : ['Chat','Telefone','Notas'];
      var selStyle   = 'background:#1e1e2e;border:1px solid var(--border);color:#e2e2e2;border-radius:5px;padding:3px 6px;font-size:11px;font-family:inherit';
      var optStyle   = 'background:#1e1e2e;color:#e2e2e2';
      var sectorOpts = sectorList.map(function(s) { return '<option style="' + optStyle + '">' + D.escapeHtml(s) + '</option>'; }).join('');

      rows.innerHTML = unmapped.map(function(zdName) {
        var current = nameMap[zdName] || '';
        var isNew   = current === '__NEW__';
        var options = '<option value="" style="' + optStyle + ';color:#888">— não vincular —</option>' +
          '<option value="__NEW__"' + (isNew ? ' selected' : '') + ' style="background:#1e1e2e;color:#4ADE80;font-weight:600">+ Cadastrar novo analista</option>' +
          analystNames.map(function(n) {
            return '<option value="' + D.escapeHtml(n) + '" style="' + optStyle + '"' + (current === n ? ' selected' : '') + '>' + D.escapeHtml(n) + '</option>';
          }).join('');
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<span style="font-size:11px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + D.escapeHtml(zdName) + '">' + D.escapeHtml(zdName) + '</span>' +
          '<span style="font-size:11px;color:var(--muted)">→</span>' +
          '<select data-zdname="' + D.escapeHtml(zdName) + '" style="' + selStyle + ';flex:1" onchange="UIModals._zdMapChange(this)">' + options + '</select>' +
          '<select data-sector style="' + selStyle + ';min-width:90px;' + (isNew ? '' : 'display:none') + '">' + sectorOpts + '</select>' +
        '</div>';
      }).join('');

      container.style.display = unmapped.length ? 'block' : 'none';
    };

    UIModals._zdMapChange = function(sel) {
      var sectorSel = sel.parentElement.querySelector('select[data-sector]');
      if (sectorSel) sectorSel.style.display = sel.value === '__NEW__' ? '' : 'none';
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
            resEl.style.color = '#4ADE80';
          }
        })
        .catch(function(err) {
          if (resEl) {
            resEl.textContent = '✗ ' + err.message;
            resEl.style.color = '#FF5555';
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
          '<button class="edit-btn" style="color:#FF8080" onclick="UIModals._removeListItem(' + i + ',\'modules\')" title="Remover"><i class="ti ti-x"></i></button>' +
        '</div>';
      }).join('');
    }

    function renderManageSectors(list) {
      document.getElementById('sectorsList').innerHTML = list.map(function(s, i) {
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px;color:var(--white)">' +
          '<span>' + esc(s) + '</span>' +
          '<button class="edit-btn" style="color:#FF8080" onclick="UIModals._removeListItem(' + i + ',\'sectors\')" title="Remover"><i class="ti ti-x"></i></button>' +
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

  function openZendeskTickets(analyst, ticketData, onSave) {
    var modal = document.getElementById('zdTicketsModal');
    if (!modal) return;

    var zdSubdomain = (ZendeskSync.getConfig().subdomain || '').trim();

    document.getElementById('zdTicketsAnalystName').textContent = analyst.name;

    var body      = document.getElementById('zdTicketsBody');
    var scoreEl   = document.getElementById('zdNewScore');
    var scoreLbl  = document.getElementById('zdScoreLabel');

    // Working copy — mutated in-place on toggle
    var pending = ticketData
      ? { good_count: ticketData.good_count, bad_tickets: ticketData.bad_tickets.map(function(t) { return Object.assign({}, t); }) }
      : null;

    // Filtro de data — padrão: últimos 30 dias
    function toInputVal(d) {
      var m   = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return d.getFullYear() + '-' + m + '-' + day;
    }
    var today    = new Date();
    var thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    var filterFrom   = null;
    var filterTo     = null;
    var _defaultFrom = toInputVal(thirtyDaysAgo);
    var _defaultTo   = toInputVal(today);

    // Converte 'dd/mm/yyyy' ou 'dd/mm' → inteiro YYYYMMDD para comparação
    function dateToInt(d) {
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    }
    function parseTicketDate(str) {
      if (!str) return null;
      var p = str.split('/');
      if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
      if (p.length === 2) return new Date(2026, +p[1] - 1, +p[0]);
      return null;
    }
    function ticketVisible(ticket) {
      if (!filterFrom && !filterTo) return true;
      var d = parseTicketDate(ticket.date);
      if (!d) return true;
      var n = dateToInt(d);
      if (filterFrom && n < dateToInt(filterFrom)) return false;
      if (filterTo   && n > dateToInt(filterTo))   return false;
      return true;
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
          : newScore >= 7 ? '#4ADE80' : newScore >= 5 ? '#FCD34D' : '#FF5555';
      }
      if (scoreLbl && orig !== null && newScore !== null) {
        var diff = parseFloat((newScore - orig).toFixed(1));
        scoreLbl.textContent = diff > 0 ? '(+' + diff + ' excluindo comportamentais)'
          : diff < 0 ? '(' + diff + ')' : '';
        scoreLbl.style.color = diff > 0 ? '#4ADE80' : diff < 0 ? '#FF5555' : 'var(--muted)';
      }
    }

    // Atualiza apenas a lista de tickets (sem sobrescrever o filtro de data)
    function renderList() {
      var listEl = document.getElementById('zdTicketList');
      if (!listEl) return;

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
          (filtered ? ' <span style="color:#FCD34D">· ' + visible.length + ' de ' + pending.bad_tickets.length + ' exibidos</span>' : '') +
        '</div>' +
        (visible.length === 0
          ? '<div style="padding:16px;text-align:center;color:var(--muted);font-size:12px">Nenhum ticket nesse período.</div>'
          : visible.map(function(ticket) {
              var idx        = pending.bad_tickets.indexOf(ticket);
              var isConsider = ticket.consider;
              var borderCol  = isConsider ? 'rgba(255,85,85,.4)' : 'var(--border)';
              var tagBg      = isConsider ? 'rgba(255,85,85,.15)' : 'rgba(255,255,255,.05)';
              var tagColor   = isConsider ? '#FF8080' : 'var(--muted)';
              return (
                '<div style="border:1px solid ' + borderCol + ';border-radius:8px;padding:10px 12px;margin-bottom:8px;background:rgba(0,0,0,.15)">' +
                  '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">' +
                    '<div style="flex:1;min-width:0">' +
                      (zdSubdomain
                        ? '<a href="https://' + esc(zdSubdomain) + '.zendesk.com/agent/tickets/' + esc(String(ticket.id)) + '" target="_blank" rel="noopener noreferrer" style="font-size:10px;color:var(--blue);text-decoration:none" title="Abrir ticket no Zendesk">#' + esc(String(ticket.id)) + ' <i class="ti ti-external-link" style="font-size:9px"></i></a>'
                        : '<span style="font-size:10px;color:var(--muted)">#' + esc(String(ticket.id)) + '</span>') +
                      '<span style="font-size:10px;color:var(--muted)"> · ' + esc(ticket.date) + '</span>' +
                      (ticket.category ? ' <span style="font-size:10px;padding:1px 7px;border-radius:4px;background:' + tagBg + ';color:' + tagColor + '">' + esc(ticket.category) + '</span>' : '') +
                    '</div>' +
                    '<button style="flex-shrink:0;font-size:10px;padding:3px 10px;border-radius:6px;border:1px solid ' + (isConsider ? '#FF5555' : 'var(--border)') + ';background:' + (isConsider ? 'rgba(255,85,85,.2)' : 'rgba(255,255,255,.05)') + ';color:' + (isConsider ? '#FF8080' : 'var(--muted)') + ';cursor:pointer;white-space:nowrap;font-family:inherit" ' +
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
      var inputStyle = 'background:rgba(255,255,255,.06);border:1px solid var(--border);color:var(--white);border-radius:6px;padding:4px 8px;font-size:11px;font-family:inherit;color-scheme:dark';
      body.innerHTML =
        '<div style="background:rgba(252,211,77,.07);border:1px solid rgba(252,211,77,.25);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:11px;color:#FCD34D;line-height:1.5">' +
          '<i class="ti ti-info-circle"></i> <strong>Marque apenas questões técnicas</strong> para compor a nota. Comportamentais ficam com a supervisão.' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
          '<i class="ti ti-calendar-search" style="color:var(--muted);font-size:14px"></i>' +
          '<span style="font-size:11px;color:var(--muted)">De</span>' +
          '<input type="date" id="zdDateFrom" value="' + _defaultFrom + '" style="' + inputStyle + ';cursor:pointer">' +
          '<span style="font-size:11px;color:var(--muted)">até</span>' +
          '<input type="date" id="zdDateTo" value="' + _defaultTo + '" style="' + inputStyle + ';cursor:pointer">' +
          '<button type="button" onclick="UIModals._zdApplyFilter()" style="font-size:11px;padding:5px 12px;border-radius:6px;border:1px solid var(--blue);background:rgba(59,130,246,.15);color:var(--blue);cursor:pointer;font-family:inherit;font-weight:500">🔍 Filtrar</button>' +
          '<button type="button" onclick="UIModals._zdClearFilter()" style="font-size:10px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;font-family:inherit">Limpar</button>' +
        '</div>' +
        '<div id="zdTicketList"></div>';
    }

    UIModals._zdToggle = function(idx) {
      if (!pending) return;
      pending.bad_tickets[idx].consider = !pending.bad_tickets[idx].consider;
      renderList();
    };

    UIModals._zdApplyFilter = function() {
      var fromEl = document.getElementById('zdDateFrom');
      var toEl   = document.getElementById('zdDateTo');
      filterFrom = fromEl && fromEl.value ? new Date(fromEl.value) : null;
      filterTo   = toEl   && toEl.value   ? new Date(toEl.value)   : null;
      renderList();
    };

    UIModals._zdClearFilter = function() {
      filterFrom = null; filterTo = null;
      var f = document.getElementById('zdDateFrom');
      var t = document.getElementById('zdDateTo');
      if (f) f.value = '';
      if (t) t.value = '';
      renderList();
    };

    setupBody();
    // Aplica filtro padrão (últimos 30 dias)
    filterFrom = new Date(_defaultFrom);
    filterTo   = new Date(_defaultTo);
    renderList();

    modal.style.display = 'flex';

    document.getElementById('zdTicketsSaveBtn').onclick = function() {
      if (!pending) { modal.style.display = 'none'; return; }
      var newScore = ZendeskSync.recalcScore(pending.good_count, pending.bad_tickets);
      onSave(newScore, pending);
      modal.style.display = 'none';
    };
  }

  return {
    openEdit:            openEdit,
    openAdd:             openAdd,
    openTraining:        openTraining,
    openProva:           openProva,
    openManage:          openManage,
    openZendeskTickets:  openZendeskTickets,
    init:                init,
    switchModalTab:      switchModalTab,
    _setScore:           setScore,
    _removeAnexo:        removeAnexo,
    _removeListItem:     function() {},
    _zdToggle:           function() {}
  };
})();
