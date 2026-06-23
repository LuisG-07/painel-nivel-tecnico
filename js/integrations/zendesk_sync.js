var ZendeskSync = (function() {
  var CFG_KEY     = 'skm6_zdcfg';
  var SEC_KEY     = 'skm6_zdcfg_sec';
  var STATUS_KEY  = 'skm6_zdstatus';
  var TICKETS_KEY = 'skm6_zdtickets';
  var AGENTS_KEY  = 'skm6_zdagents'; // foto + score de todos os agentes do Zendesk
  var PHOTOS_KEY  = 'skm6_zdphotos'; // cache persistente de fotos de analistas

  // Public (non-sensitive) defaults — stored in localStorage
  var DEFAULT_CFG = { subdomain: 'beteltecnologia', groupName: 'SUP-N1', groupIds: ['6441506014871', '21198035409559', '360001272933'], days: 30, dateFrom: '', dateTo: '', scriptUrl: '', categoryFieldId: '', nameMap: {
    'Bruno Henrique Ferreira da Silva': 'Bruno',
    'Henrique Rodrigues Costa Sérgio': 'Henrique Sergio',
    'Mário Diniz':                    'Mario Diniz',
    'Ana Claudia Corrêa':            'Ana Claudia',
    'Diego Machado':                       'Diego',
    'Karolyne Moreira':                    'Karolyne',
    'Ismael Chagas Bessa':                 'Ismael',
    'João Pedro Santana':            'João Pedro S.',
    'Luan Pereira':                        'Luan',
    'Mario Junior':                        'Mario',
    'Mateus Rodrigues':                    'Mateus',
    'Sergio Junior':                       'Sergio',
    'Thales Silva':                        'Thales'
  } };
  // Credentials — stored in localStorage (persistent between sessions)
  var DEFAULT_SEC = { email: 'lucas@beteltecnologia.com.br', apiToken: 'jXs605fvYJ6YAoLUUjlnUxRXmxGmI71wik57js3X', geminiKey: '' };

  var FOUND_KEY = 'skm6_zdfound';

  // ---------------------------------------------------------------------------
  // Input validators
  // ---------------------------------------------------------------------------
  function isValidSubdomain(s) {
    // Zendesk subdomains: 1-63 alphanumeric + hyphens, no leading/trailing hyphens
    return typeof s === 'string' && /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(s);
  }

  function isAllowedScriptUrl(url) {
    try {
      var p = new URL(url);
      return p.protocol === 'https:' && p.hostname === 'script.google.com';
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------------------
  // Config: public fields in localStorage, credentials in sessionStorage
  // ---------------------------------------------------------------------------
  function _getSensitive() {
    try { return Object.assign({}, DEFAULT_SEC, JSON.parse(localStorage.getItem(SEC_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULT_SEC); }
  }

  function _saveSensitive(s) {
    localStorage.setItem(SEC_KEY, JSON.stringify({
      email:     typeof s.email     === 'string' ? s.email.slice(0, 256)     : '',
      apiToken:  typeof s.apiToken  === 'string' ? s.apiToken.slice(0, 512)  : '',
      geminiKey: typeof s.geminiKey === 'string' ? s.geminiKey.slice(0, 256) : ''
    }));
  }

  function getConfig() {
    try {
      var stored = JSON.parse(localStorage.getItem(CFG_KEY)) || {};
      return Object.assign({}, DEFAULT_CFG, stored, _getSensitive());
    }
    catch (e) { return Object.assign({}, DEFAULT_CFG, _getSensitive()); }
  }

  function saveConfig(c) {
    var groupIds = c.groupIds || ['6441506014871', '21198035409559', '360001272933'];
    if (!Array.isArray(groupIds)) groupIds = [groupIds];
    var pub = {
      subdomain: typeof c.subdomain === 'string' ? c.subdomain.slice(0, 63)  : '',
      groupName: typeof c.groupName === 'string' ? c.groupName.slice(0, 100) : 'suporte n1',
      groupIds:  groupIds.map(function(id) { return typeof id === 'string' ? id.slice(0, 20) : ''; }).filter(function(id) { return id; }),
      days:      typeof c.days      === 'number' ? Math.min(Math.max(c.days, 1), 365) : 30,
      dateFrom:  typeof c.dateFrom  === 'string' ? c.dateFrom.slice(0, 10) : '',
      dateTo:    typeof c.dateTo    === 'string' ? c.dateTo.slice(0, 10) : '',
      scriptUrl: typeof c.scriptUrl === 'string' && isAllowedScriptUrl(c.scriptUrl) ? c.scriptUrl : '',
      categoryFieldId: typeof c.categoryFieldId === 'string' ? c.categoryFieldId.slice(0, 30) : (c.categoryFieldId != null ? String(c.categoryFieldId).slice(0, 30) : ''),
      nameMap:   (c.nameMap && typeof c.nameMap === 'object' && !Array.isArray(c.nameMap)) ? c.nameMap : {}
    };
    localStorage.setItem(CFG_KEY, JSON.stringify(pub));
    _saveSensitive({ email: c.email, apiToken: c.apiToken, geminiKey: c.geminiKey });
  }

  function getStatus() {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveStatus(s) { localStorage.setItem(STATUS_KEY, JSON.stringify(s)); }

  function getAgentData(zdName) {
    try {
      var all = JSON.parse(localStorage.getItem(AGENTS_KEY)) || {};
      return all[zdName] || null;
    } catch (e) { return null; }
  }
  function saveAgents(agentStore) {
    try { localStorage.setItem(AGENTS_KEY, JSON.stringify(agentStore)); } catch(e) {}
  }

  // Cache persistente de fotos de analistas
  function getPhotoCache() {
    try { return JSON.parse(localStorage.getItem(PHOTOS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function savePhotoCache(photos) {
    try { localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos)); }
    catch (e) { console.error('Erro ao salvar cache de fotos'); }
  }
  function addPhotoToCache(analystName, photoBase64) {
    var cache = getPhotoCache();
    cache[analystName.toLowerCase()] = photoBase64;
    savePhotoCache(cache);
  }

  function getTickets(analystId) {
    try {
      var all = JSON.parse(localStorage.getItem(TICKETS_KEY)) || {};
      return all[analystId] || null;
    } catch (e) { return null; }
  }
  function saveTickets(analystId, data) {
    try {
      var all = JSON.parse(localStorage.getItem(TICKETS_KEY)) || {};
      all[analystId] = data;
      localStorage.setItem(TICKETS_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  // Estatística GLOBAL de satisfação por categoria de ticket do Zendesk.
  // Estrutura: { "<categoria>": { good, bad } } — alimenta o ranking de
  // categorias mais negativadas (toda a equipe, independente de módulo do painel).
  var CATEGORIES_KEY = 'skm6_zdcategories';
  function getCategoryStats() {
    try { return JSON.parse(localStorage.getItem(CATEGORIES_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveCategoryStats(obj) {
    try { localStorage.setItem(CATEGORIES_KEY, JSON.stringify(obj || {})); } catch (e) {}
  }
  // Ranking de categorias por nº de avaliações negativas (pior primeiro).
  // Calculado a partir dos TICKETS POR ANALISTA — mesma base das notas Zendesk —
  // honrando o toggle "considerar" de cada negativo (negativos ignorados não contam,
  // exatamente como na nota). Assim o nº de negativas bate com o painel.
  // Positivos por categoria vêm de t.category_good (gravado na importação).
  // Retorna [{ category, good, bad, total, rate }].
  function categoryRanking(analysts) {
    var good = {}, bad = {};
    (Array.isArray(analysts) ? analysts : []).forEach(function(a) {
      var t = getTickets(a.id);
      if (!t) return;
      var cg = t.category_good || {};
      Object.keys(cg).forEach(function(cat) { good[cat] = (good[cat] || 0) + (cg[cat] || 0); });
      (t.bad_tickets || []).forEach(function(x) {
        if (!x.consider) return;            // honra o toggle: ignorado não conta
        var cat = x.zdCategory || '';
        if (!cat) return;                   // sem categoria identificada → fora do ranking
        bad[cat] = (bad[cat] || 0) + 1;
      });
    });
    var seen = {};
    Object.keys(good).forEach(function(c) { seen[c] = true; });
    Object.keys(bad).forEach(function(c) { seen[c] = true; });
    return Object.keys(seen).map(function(cat) {
      var g = good[cat] || 0, b = bad[cat] || 0, total = g + b;
      return { category: cat, good: g, bad: b, total: total, rate: total ? b / total : 0 };
    })
    .filter(function(e) { return e.total > 0; })
    .sort(function(a, b) { return (b.bad - a.bad) || (b.rate - a.rate); });
  }

  // Ranking GLOBAL de módulos mais negativados no Zendesk (equipe toda), na mesma
  // base das notas: positivos por módulo (t.module_good) + negativos por módulo
  // (bad_tickets com module), honrando o toggle "considerar". Só módulos com
  // pelo menos uma negativa entram. Retorna [{ module, good, bad, total, rate }].
  // Chave do bucket de negativos sem módulo identificado.
  var SEM_MODULO = '';
  function moduleRanking(analysts) {
    var good = {}, bad = {};
    (Array.isArray(analysts) ? analysts : []).forEach(function(a) {
      var t = getTickets(a.id);
      if (!t) return;
      var mg = t.module_good || {};
      var sumMg = 0;
      Object.keys(mg).forEach(function(m) { good[m] = (good[m] || 0) + (mg[m] || 0); sumMg += (mg[m] || 0); });
      // positivos não atribuídos a módulo → entram no bucket "Sem módulo"
      var leftover = (t.good_count || 0) - sumMg;
      if (leftover > 0) good[SEM_MODULO] = (good[SEM_MODULO] || 0) + leftover;
      (t.bad_tickets || []).forEach(function(x) {
        if (!x.consider) return;            // honra o toggle
        var m = x.module || SEM_MODULO;     // sem módulo → bucket "Sem módulo"
        bad[m] = (bad[m] || 0) + 1;
      });
    });
    return Object.keys(bad).map(function(m) {
      var g = good[m] || 0, b = bad[m] || 0, total = g + b;
      return { module: m, good: g, bad: b, total: total, rate: total ? b / total : 0 };
    })
    .sort(function(a, b) { return (b.bad - a.bad) || (b.rate - a.rate); });
  }

  // Tickets negativados de um módulo (ou "Sem módulo" quando moduleName vazio),
  // somando toda a equipe — para consulta. Retorna registros com o analista.
  function negativesForModule(analysts, moduleName) {
    var target = moduleName || '';
    var out = [];
    (Array.isArray(analysts) ? analysts : []).forEach(function(a) {
      var t = getTickets(a.id);
      if (!t) return;
      (t.bad_tickets || []).forEach(function(x) {
        if ((x.module || '') !== target) return;
        out.push({
          analyst:  a.name,
          id:       x.id,
          date:     x.date || '',
          subject:  x.subject || '',
          comment:  x.comment || '',
          zdCategory: x.zdCategory || '',
          category: x.category || '',
          consider: x.consider !== false
        });
      });
    });
    return out;
  }

  // Tickets negativados de uma categoria do Zendesk (zdCategory), somando toda
  // a equipe — para consulta a partir do ranking de categorias.
  function negativesForCategory(analysts, categoryName) {
    var target = categoryName || '';
    var out = [];
    (Array.isArray(analysts) ? analysts : []).forEach(function(a) {
      var t = getTickets(a.id);
      if (!t) return;
      (t.bad_tickets || []).forEach(function(x) {
        if ((x.zdCategory || '') !== target) return;
        out.push({
          analyst:  a.name,
          id:       x.id,
          date:     x.date || '',
          subject:  x.subject || '',
          comment:  x.comment || '',
          zdCategory: x.zdCategory || '',
          category: x.category || '',
          module:   x.module || '',
          consider: x.consider !== false
        });
      });
    });
    return out;
  }

  // Peso de confiança da média suavizada (Bayesiana): nº de avaliações
  // "emprestadas" da média da equipe. Quanto maior, mais volume é preciso
  // para a nota refletir o desempenho individual.
  var BAYES_K = 10;
  var DEFAULT_PRIOR = 0.8; // fallback quando não há dados da equipe

  // Média de satisfação da equipe (proporção 0–1), a partir dos tickets salvos.
  // C = total de positivos / (positivos + negativos técnicos) de TODOS os analistas.
  function getTeamPrior() {
    try {
      var all = JSON.parse(localStorage.getItem(TICKETS_KEY)) || {};
      var good = 0, bad = 0;
      Object.keys(all).forEach(function(id) {
        var t = all[id];
        if (!t) return;
        good += t.good_count || 0;
        bad  += (t.bad_tickets || []).filter(function(x) { return x.consider; }).length;
      });
      return (good + bad) > 0 ? good / (good + bad) : DEFAULT_PRIOR;
    } catch (e) { return DEFAULT_PRIOR; }
  }

  // Nota 0–10 com MÉDIA SUAVIZADA (Bayesiana), contando apenas negativos técnicos.
  //   nota = ( positivos + C·k ) / ( positivos + negativos + k ) × 10
  // Amostra pequena → nota perto da média da equipe (C); muita avaliação → nota real.
  // Sem avaliações (n = 0) → null (não inventa nota; não entra na unificada).
  function bayesianScore(goodCount, consideredBad, prior) {
    var n = goodCount + consideredBad;
    if (n === 0) return null;
    var adjusted = (goodCount + prior * BAYES_K) / (n + BAYES_K);
    return parseFloat((adjusted * 10).toFixed(1));
  }

  function recalcScore(goodCount, badTickets) {
    var consideredBad = badTickets.filter(function(t) { return t.consider; }).length;
    return bayesianScore(goodCount, consideredBad, getTeamPrior());
  }

  // Recalcula a nota Zendesk de todos os analistas usando o MESMO prior da equipe.
  // Preserva analistas que têm nota manual e não possuem tickets importados.
  function recomputeAllScores(analysts) {
    if (!Array.isArray(analysts)) return;
    var prior = getTeamPrior();
    analysts.forEach(function(a) {
      var t = getTickets(a.id);
      if (!t) return; // sem tickets → mantém nota manual (se houver)
      var consideredBad = (t.bad_tickets || []).filter(function(x) { return x.consider; }).length;
      a.zendesk = bayesianScore(t.good_count || 0, consideredBad, prior);
    });
  }

  // Normaliza nomes para comparação (sem acento, minúsculo, separadores → espaço)
  function normalizeName(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Casamento PRECISO entre nome de agente (Zendesk) e nome de analista (painel).
  // Regra: nomes iguais, OU o nome do analista é prefixo EXATO (palavra a palavra)
  // do nome do agente — ex.: "Bruno" ⊂ "Bruno Henrique Silva". NUNCA casa só pelo
  // primeiro nome quando os demais divergem (ex.: "João Pedro S." ✗ "João Vitor Almeida").
  function agentMatchesAnalyst(agentName, analystName) {
    var a = normalizeName(agentName).split(' ').filter(Boolean);
    var b = normalizeName(analystName).split(' ').filter(Boolean);
    if (!a.length || !b.length) return false;
    if (a.join(' ') === b.join(' ')) return true;       // iguais
    if (b.length > a.length) return false;               // analista mais longo → não é prefixo
    for (var i = 0; i < b.length; i++) {                 // todas as palavras do analista batem com as primeiras do agente
      if (b[i] !== a[i]) return false;
    }
    return true;
  }

  // Nota Zendesk POR MÓDULO de um analista (mesma média suavizada).
  // Retorna { "Módulo": { good, bad, score } } para cada módulo informado.
  function moduleScores(analystId, modules) {
    var out = {};
    var t = getTickets(analystId);
    if (!t || !Array.isArray(modules)) return out;
    var prior = getTeamPrior();
    var mg = t.module_good || {};
    modules.forEach(function(m) {
      var good = mg[m] || 0;
      var bad = (t.bad_tickets || []).filter(function(x) { return x.module === m && x.consider; }).length;
      out[m] = { good: good, bad: bad, score: bayesianScore(good, bad, prior) };
    });
    return out;
  }

  // Escolhe, entre os campos de ticket (dropdowns), aquele cujas opções mais
  // batem com os módulos do painel. Retorna { id, valueToModule } ou null.
  function pickCategoryField(ticketFields, modules) {
    if (!Array.isArray(ticketFields) || !Array.isArray(modules) || !modules.length) return null;
    var modByNorm = {};
    modules.forEach(function(m) { modByNorm[normalizeName(m)] = m; });

    var best = null, bestCount = 0;
    ticketFields.forEach(function(f) {
      if (!Array.isArray(f.custom_field_options) || !f.custom_field_options.length) return;
      var valueToModule = {};
      var valueToName = {};
      var count = 0;
      f.custom_field_options.forEach(function(o) {
        valueToName[String(o.value)] = o.name || o.value;
        var hit = modByNorm[normalizeName(o.name)] || modByNorm[normalizeName(o.value)];
        if (hit) { valueToModule[String(o.value)] = hit; count++; }
      });
      if (count > bestCount) { bestCount = count; best = { id: f.id, valueToModule: valueToModule, valueToName: valueToName }; }
    });
    return bestCount > 0 ? best : null;
  }

  // Encontra o analista do painel correspondente a um nome de agente do Zendesk
  // (usa o nameMap manual/auto e, como fallback, casamento por nome normalizado).
  function findAnalystForAgent(agentName, analysts, nameMap) {
    if (!Array.isArray(analysts)) return null;
    var mapped = (nameMap && nameMap[agentName]) || '';
    if (mapped) {
      var target = normalizeName(mapped);
      var byMap = analysts.filter(function(a) { return normalizeName(a.name) === target; })[0];
      if (byMap) return byMap;
    }
    // sem mapeamento manual → casamento preciso (igual ou prefixo exato)
    return analysts.filter(function(a) { return agentMatchesAnalyst(agentName, a.name); })[0] || null;
  }

  function getFoundNames() {
    try { return JSON.parse(localStorage.getItem(FOUND_KEY)) || []; }
    catch(e) { return []; }
  }
  function saveFoundNames(names) {
    localStorage.setItem(FOUND_KEY, JSON.stringify(names));
  }

  // Auto-match Zendesk agent names com analistas cadastrados (casamento PRECISO)
  function autoMatchNames(zdNames, analysts) {
    var nameMap = getConfig().nameMap || {};
    zdNames.forEach(function(zdName) {
      if (nameMap[zdName]) return; // já mapeado manualmente
      var found = analysts.filter(function(a) { return agentMatchesAnalyst(zdName, a.name); })[0];
      if (found) {
        nameMap[zdName] = found.name;
        console.log('✓ Auto-vinculado: "' + zdName + '" → "' + found.name + '"');
      }
    });
    return nameMap;
  }

  // Processa resposta da API (Apps Script doGet) e atualiza analysts in-place
  function applyAgentData(analysts, agentMap) {
    var updated  = 0;
    var nameMap  = getConfig().nameMap || {};
    var found    = Object.keys(agentMap);
    saveFoundNames(found);

    // Track which agentes foram já vinculados para evitar duplicatas
    var usedAgents = {};

    analysts.forEach(function(analyst) {
      Object.keys(agentMap).forEach(function(agentName) {
        if (usedAgents[agentName]) return; // já foi vinculado, pula

        // Mapeamento manual tem prioridade; senão, casamento PRECISO (igual/prefixo exato)
        var mapped  = nameMap[agentName];
        var matches = mapped
          ? normalizeName(mapped) === normalizeName(analyst.name)
          : agentMatchesAnalyst(agentName, analyst.name);

        if (!matches) return;

        // Auto-preenche nameMap se encontrou correspondência automática
        if (!mapped) {
          nameMap[agentName] = analyst.name;
          console.log('✓ Auto-vinculado: ' + agentName + ' → ' + analyst.name);
        }
        var data = agentMap[agentName];
        var score = data.score;
        if (score === null || score === undefined || isNaN(parseFloat(score))) return;

        var existing    = getTickets(analyst.id);
        var existingMap = {};
        if (existing && existing.bad_tickets) {
          existing.bad_tickets.forEach(function(t) { existingMap[t.id] = t.consider; });
        }

        var bad_tickets = (data.bad_tickets || []).map(function(t) {
          var prev = existingMap[t.id];
          return {
            id:       t.id,
            date:     t.date || '',
            category: t.category || '',
            comment:  t.comment || '',
            module:   t.module || '',
            zdCategory: t.zdCategory || '',
            consider: prev !== undefined ? prev : true
          };
        });

        var goodCount = data.good_count != null ? data.good_count : (data.good_tickets || 0);
        saveTickets(analyst.id, { good_count: goodCount, bad_tickets: bad_tickets, module_good: data.module_good || {}, category_good: data.category_good || {}, good_tickets: data.good_tickets || [] });
        analyst.zendesk = recalcScore(goodCount, bad_tickets);

        // Aplica foto se tiver
        if (data.photo && !analyst.photo) {
          analyst.photo = data.photo;
          addPhotoToCache(analyst.name, data.photo);
        }

        usedAgents[agentName] = true; // marca como usado para evitar duplicata
        updated++;
      });
    });

    // Restaura fotos do cache para analistas
    var photoCache = getPhotoCache();
    analysts.forEach(function(analyst) {
      if (!analyst.photo) {
        var cached = photoCache[analyst.name.toLowerCase()];
        if (cached) {
          analyst.photo = cached;
        }
      }
    });

    return { updated: updated, nameMap: nameMap };
  }

  function sync(analysts, callback) {
    var c = getConfig();
    if (!c.scriptUrl) { callback && callback(0, null, 'not-configured'); return; }
    if (!isAllowedScriptUrl(c.scriptUrl)) {
      callback && callback(0, 'URL inválida: deve ser do Google Apps Script (script.google.com).', 'error');
      return;
    }

    fetch(c.scriptUrl, { redirect: 'follow' })
      .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);
        var result = applyAgentData(analysts, data.agents || {});
        saveStatus({ ok: true, at: new Date().toISOString(), updated: result.updated });
        callback && callback(result.updated, null, 'ok');
      })
      .catch(function(err) {
        saveStatus({ ok: false, at: new Date().toISOString(), error: err.message });
        callback && callback(0, err.message, 'error');
      });
  }

  // ---------------------------------------------------------------------------
  // Importação direta do Zendesk via browser (sem Apps Script)
  // ---------------------------------------------------------------------------
  // Cria uma função zdFetch (auth + proxy local) a partir da config.
  function buildZdFetch(cfg) {
    var base    = 'https://' + cfg.subdomain + '.zendesk.com';
    var headers = { 'Authorization': 'Basic ' + btoa(cfg.email + '/token:' + cfg.apiToken) };
    // Sempre via proxy relativo: local = Express (server.js); web = Cloud Function (rewrite /zdproxy/**)
    var proxyBase = '/zdproxy/' + cfg.subdomain;
    function toUrl(path) {
      if (path.indexOf('http') === 0) return path.replace(base, proxyBase);
      return proxyBase + path;
    }
    return function zdFetch(path) {
      return fetch(toUrl(path), { headers: headers }).then(function(r) {
        return r.text().then(function(body) {
          if (!r.ok) {
            var hint = r.status === 404 ? 'verifique o subdomínio.'
                     : r.status === 401 ? 'verifique e-mail e token da API.'
                     : r.status === 403 ? 'token sem permissão na API.'
                     : 'erro inesperado.';
            var detail = '';
            try { detail = ' (' + (JSON.parse(body).description || JSON.parse(body).error || '') + ')'; } catch(e) {}
            throw new Error('Zendesk HTTP ' + r.status + ' — ' + hint + detail);
          }
          return JSON.parse(body);
        });
      });
    };
  }

  // Detecta os campos personalizados de ticket (dropdowns) para o usuário escolher
  // qual é a "categoria do atendimento". callback(fields, errorMessage).
  function detectTicketFields(callback) {
    var cfg = getConfig();
    if (!cfg.subdomain || !cfg.email || !cfg.apiToken) {
      callback(null, 'Preencha subdomínio, e-mail e token antes de detectar.');
      return;
    }
    if (!isValidSubdomain(cfg.subdomain)) {
      callback(null, 'Subdomínio inválido.');
      return;
    }
    buildZdFetch(cfg)('/api/v2/ticket_fields.json')
      .then(function(data) {
        var fields = (data.ticket_fields || [])
          .filter(function(f) { return Array.isArray(f.custom_field_options) && f.custom_field_options.length; })
          .map(function(f) {
            return {
              id:      f.id,
              title:   f.title || f.raw_title || ('Campo ' + f.id),
              type:    f.type,
              options: f.custom_field_options.map(function(o) { return { name: o.name, value: o.value }; })
            };
          });
        callback(fields, null);
      })
      .catch(function(err) { callback(null, err.message); });
  }

  function importDirect(analysts, modules, onProgress, callback) {
    var cfg = getConfig();
    var moduleList = Array.isArray(modules) ? modules : [];
    var detectedField = null; // campo de categoria (definido na detecção) — usado também na busca de todos os tickets
    if (!cfg.subdomain || !cfg.email || !cfg.apiToken) {
      callback(0, 'Preencha subdomínio, e-mail e token antes de importar.');
      return;
    }
    if (!isValidSubdomain(cfg.subdomain)) {
      callback(0, 'Subdomínio inválido: use apenas letras, números e hífens (ex: minhaempresa).');
      return;
    }

    var base      = 'https://' + cfg.subdomain + '.zendesk.com';
    var auth      = 'Basic ' + btoa(cfg.email + '/token:' + cfg.apiToken);
    var headers   = { 'Authorization': auth };

    // Calcula startTime e endTime baseado em dateFrom/dateTo ou usa período em dias
    var startTime, endTime;
    var now = Math.floor(Date.now() / 1000);
    var twoMinutesAgo = now - 120;
    if (cfg.dateFrom && cfg.dateTo) {
      startTime = Math.floor(new Date(cfg.dateFrom).getTime() / 1000);
      endTime   = Math.floor(new Date(cfg.dateTo).getTime() / 1000) + 86399; // até o final do dia
      // Se end_time for no futuro, ajusta para 2 minutos atrás
      if (endTime > twoMinutesAgo) {
        endTime = twoMinutesAgo;
      }
    } else {
      startTime = Math.floor((Date.now() - (cfg.days || 30) * 86400000) / 1000);
      endTime   = twoMinutesAgo; // sempre 2 minutos atrás para garantir
    }
    var groupName = (cfg.groupName || 'suporte n1').toLowerCase();

    // Proxy relativo sempre: local = Express; web = Cloud Function (rewrite /zdproxy/**)
    var proxyBase = '/zdproxy/' + cfg.subdomain;

    function toUrl(path) {
      if (path.startsWith('http')) {
        // Imagens de CDN: passa a URL completa como parâmetro
        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
          return proxyBase + '?url=' + encodeURIComponent(path);
        }
        // APIs: substitui o domínio pelo proxy
        return path.replace(base, proxyBase);
      }
      return proxyBase + path;
    }

    function zdFetch(path) {
      return fetch(toUrl(path), { headers: headers })
        .then(function(r) {
          return r.text().then(function(body) {
            if (!r.ok) {
              var hint = r.status === 404 ? 'verifique o subdomínio (só a parte antes de .zendesk.com).'
                       : r.status === 401 ? 'verifique e-mail e token da API.'
                       : r.status === 403 ? 'token sem permissão — verifique escopo na API do Zendesk.'
                       : 'erro inesperado.';
              var detail = '';
              try { detail = ' (' + (JSON.parse(body).description || JSON.parse(body).error || '') + ')'; } catch(e) {}
              throw new Error('Zendesk HTTP ' + r.status + ' — ' + hint + detail);
            }
            return JSON.parse(body);
          });
        });
    }

    onProgress('Conectando ao Zendesk...');

    // 1. Define os grupos a importar (por ID) - usa config ou usa padrão
    var groupIdMap = {
      '360001272933': 'SUP-N1',
      '6441506014871': 'Suporte (Outros Assuntos)',
      '21198035409559': 'Suporte para Nota Fiscal'
    };
    var groupIds = (cfg.groupIds && cfg.groupIds.length) ? cfg.groupIds : ['6441506014871', '21198035409559', '360001272933'];
    var groupNames = groupIds.map(function(id) { return groupIdMap[id] || 'Grupo ' + id; });

    // 2. Busca avaliações de todos os grupos (sequencial com delay para evitar rate limit)
    function delay(ms) {
      return new Promise(function(resolve) { setTimeout(resolve, ms); });
    }

    // Próxima página — suporta paginação por OFFSET (next_page) e por CURSOR
    // (meta.has_more + links.next). O Zendesk migrou várias APIs para cursor,
    // então sem isso só vinha a 1ª página (~100 registros).
    function nextPageUrl(data) {
      if (data && data.meta && typeof data.meta.has_more === 'boolean') {
        return (data.meta.has_more && data.links && data.links.next) ? data.links.next : null;
      }
      return (data && data.next_page) || null;
    }

    function fetchGroupRatings(idx) {
      if (idx >= groupIds.length) return Promise.resolve([]);
      var groupId = groupIds[idx];
      var all = [];
      function fetchPage(url) {
        return zdFetch(url).then(function(data) {
          var batch = data.satisfaction_ratings || [];
          all = all.concat(batch);
          onProgress('Grupo "' + groupNames[idx] + '" - Avaliações: ' + all.length + '...');
          var next = nextPageUrl(data);
          // Teto de segurança alto só para evitar loop; quem limita é o período (start/end).
          if (next && all.length < 100000) return delay(500).then(function() { return fetchPage(next); });
          return all;
        });
      }
      return fetchPage(base + '/api/v2/satisfaction_ratings.json?per_page=100&start_time=' + startTime + '&end_time=' + endTime + '&group_id=' + groupId)
        .then(function(ratings) {
          return delay(1000).then(function() {
            return fetchGroupRatings(idx + 1).then(function(nextRatings) {
              return [ratings].concat(nextRatings);
            });
          });
        });
    }

    fetchGroupRatings(0)
      .then(function(allRatingsArrays) {
        var consolidated = [];
        allRatingsArrays.forEach(function(ratings) {
          consolidated = consolidated.concat(ratings);
        });

        // Deduplica por TICKET (um ticket pode ter várias avaliações — reavaliação —
        // ou vir repetido entre grupos). Mantém a avaliação mais recente de cada ticket,
        // para a contagem bater com os tickets reais do Zendesk.
        var byTicket = {};
        consolidated.forEach(function(r) {
          var key = (r.ticket_id != null) ? ('t' + r.ticket_id) : ('r' + r.id);
          var prev = byTicket[key];
          if (!prev) { byTicket[key] = r; return; }
          var prevT = new Date(prev.updated_at || prev.created_at || 0).getTime();
          var curT  = new Date(r.updated_at || r.created_at || 0).getTime();
          if (curT >= prevT) byTicket[key] = r;
        });
        var unique = Object.keys(byTicket).map(function(k) { return byTicket[k]; });

        onProgress('Avaliações: ' + consolidated.length + ' (tickets únicos: ' + unique.length + ')');
        return unique;
      })

      // 3. Resolve nomes e fotos dos agentes
      .then(function(ratings) {
        var idSet = {};
        ratings.forEach(function(r) { if (r.assignee_id) idSet[r.assignee_id] = true; });
        var ids = Object.keys(idSet).join(',');
        if (!ids) return { ratings: ratings, userMap: {}, photoMap: {} };
        return zdFetch('/api/v2/users/show_many.json?ids=' + ids).then(function(data) {
          var userMap  = {};
          var photoMap = {};
          (data.users || []).forEach(function(u) {
            userMap[u.id] = u.name;
            // Prefere thumbnail 128px; fallback para content_url
            if (u.photo) {
              var thumb = u.photo.thumbnails && u.photo.thumbnails.find(function(t) { return t.width >= 128; });
              photoMap[u.id] = (thumb && thumb.content_url) || u.photo.content_url || null;
            }
          });
          onProgress('Nomes resolvidos. Buscando fotos...');
          return { ratings: ratings, userMap: userMap, photoMap: photoMap };
        });
      })

      // 4. Agrupa por agente (captura photoUrl) e coleta todos os ticket_ids avaliados
      .then(function(result) {
        var ratings = result.ratings;
        var agentMap = {};
        var allIds = {};
        ratings.forEach(function(r) {
          var name = result.userMap[r.assignee_id] || ('Agente-' + r.assignee_id);
          if (!agentMap[name]) agentMap[name] = { good: 0, bad: 0, raw: [], good_raw: [], module_good: {}, category_good: {}, photoUrl: result.photoMap[r.assignee_id] || null };
          if (r.ticket_id) allIds[r.ticket_id] = true;
          if (r.score === 'good') {
            agentMap[name].good++;
            var dg = new Date(r.created_at);
            agentMap[name].good_raw.push({
              id:   r.ticket_id,
              date: dg.getDate().toString().padStart(2,'0') + '/' +
                    (dg.getMonth()+1).toString().padStart(2,'0') + '/' +
                    dg.getFullYear(),
              module: '', zdCategory: ''
            });
          } else if (r.score === 'bad') {
            agentMap[name].bad++;
            var d = new Date(r.created_at);
            agentMap[name].raw.push({
              id:      r.ticket_id,
              date:    d.getDate().toString().padStart(2,'0') + '/' +
                       (d.getMonth()+1).toString().padStart(2,'0') + '/' +
                       d.getFullYear(),
              comment: r.comment || '',
              category: '',
              module:  ''
            });
          }
        });

        var ticketIds = Object.keys(allIds);
        var subjectMap = {};
        var moduleMap  = {};
        var categoryMap = {}; // ticket_id → nome da categoria (campo Zendesk), independente de módulo

        // 4.1 Descobre automaticamente o campo de categoria (casa opções × módulos)
        var fieldPromise = zdFetch('/api/v2/ticket_fields.json')
          .then(function(fd) {
            var f = pickCategoryField(fd.ticket_fields || [], moduleList);
            detectedField = f;
            if (f) {
              try { var c = getConfig(); c.categoryFieldId = String(f.id); saveConfig(c); } catch (e) {}
              onProgress('Campo de categoria detectado (ID ' + f.id + ').');
            } else {
              onProgress('Nenhum campo de categoria batendo com os módulos — seguindo sem cruzar módulos.');
            }
            return f;
          })
          .catch(function() { return null; });

        return fieldPromise.then(function(catField) {
          // 4.2 Busca assunto + categoria de TODOS os tickets avaliados (lotes de 100)
          function fetchInfo(i) {
            if (i >= ticketIds.length) return Promise.resolve();
            var batch = ticketIds.slice(i, i + 100).join(',');
            onProgress('Lendo categorias dos tickets... (' + Math.min(i + 100, ticketIds.length) + '/' + ticketIds.length + ')');
            return zdFetch('/api/v2/tickets/show_many.json?ids=' + batch)
              .then(function(d) {
                (d.tickets || []).forEach(function(t) {
                  subjectMap[t.id] = t.subject || '';
                  if (catField) {
                    var cf = (t.custom_fields || []).filter(function(x) { return String(x.id) === String(catField.id); })[0];
                    if (cf && cf.value != null && cf.value !== '') {
                      moduleMap[t.id] = catField.valueToModule[String(cf.value)] || '';
                      categoryMap[t.id] = (catField.valueToName && catField.valueToName[String(cf.value)]) || String(cf.value);
                    }
                  }
                });
              })
              .catch(function() {})
              .then(function() { return delay(500).then(function() { return fetchInfo(i + 100); }); });
          }

          return (ticketIds.length ? fetchInfo(0) : Promise.resolve()).then(function() {
            // 4.3 Segunda passada: positivos por módulo, agregação por categoria (global)
            // e tag de módulo + categoria nos negativos.
            var categoryAgg = {}; // { categoria: { good, bad } } — agregado global (referência)
            ratings.forEach(function(r) {
              var name = result.userMap[r.assignee_id] || ('Agente-' + r.assignee_id);
              var mod = moduleMap[r.ticket_id];
              if (mod && r.score === 'good') {
                agentMap[name].module_good[mod] = (agentMap[name].module_good[mod] || 0) + 1;
              }
              var cat = categoryMap[r.ticket_id];
              if (cat && (r.score === 'good' || r.score === 'bad')) {
                categoryAgg[cat] = categoryAgg[cat] || { good: 0, bad: 0 };
                if (r.score === 'good') {
                  categoryAgg[cat].good++;
                  // positivos por categoria POR AGENTE → permite ranking na mesma base das notas
                  agentMap[name].category_good[cat] = (agentMap[name].category_good[cat] || 0) + 1;
                } else {
                  categoryAgg[cat].bad++;
                }
              }
            });
            saveCategoryStats(categoryAgg);
            Object.keys(agentMap).forEach(function(n) {
              agentMap[n].raw.forEach(function(t) {
                t.module     = moduleMap[t.id]   || '';
                t.zdCategory = categoryMap[t.id] || '';
              });
              agentMap[n].good_raw.forEach(function(t) {
                t.module     = moduleMap[t.id]   || '';
                t.zdCategory = categoryMap[t.id] || '';
              });
            });

            // 5. Categoriza com Gemini (texto livre) se chave configurada
            var badAll = [];
            Object.keys(agentMap).forEach(function(n) { agentMap[n].raw.forEach(function(t) { badAll.push(t); }); });
            var catPromise = (cfg.geminiKey && badAll.length)
              ? categorizeGemini(cfg.geminiKey, badAll, onProgress)
              : Promise.resolve({});

            return catPromise.then(function(cats) {
              return { agentMap: agentMap, cats: cats, subjectMap: subjectMap };
            });
          });
        });
      })

      // 5.5 Baixa fotos dos agentes como base64
      .then(function(result) {
        var withPhoto = Object.keys(result.agentMap).filter(function(n) { return result.agentMap[n].photoUrl; });
        var withoutPhoto = Object.keys(result.agentMap).filter(function(n) { return !result.agentMap[n].photoUrl; });
        console.log('Agentes COM foto:', withPhoto.length, withPhoto);
        console.log('Agentes SEM foto:', withoutPhoto.length);

        var names    = withPhoto;
        var total    = names.length;
        if (!total) { onProgress('⚠️ Nenhum agente com foto disponível'); return result; }
        onProgress('Baixando fotos (' + total + ' agentes)...');

        var fetches = names.map(function(name) {
          var photoUrl = result.agentMap[name].photoUrl;
          // Foto via proxy (relativo) — funciona local e na web
          var url = '/zdproxy/' + cfg.subdomain + '?url=' + encodeURIComponent(photoUrl);

          return fetch(url)
            .then(function(r) {
              if (!r.ok) {
                console.error('Erro ao baixar foto de ' + name + ': HTTP ' + r.status);
                throw new Error('HTTP ' + r.status);
              }
              return r.blob();
            })
            .then(function(blob) {
              if (!blob || blob.size === 0) {
                console.warn('Blob vazio para foto de ' + name);
                return Promise.resolve();
              }
              return new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload  = function(e) {
                  result.agentMap[name].photo = e.target.result;
                  console.log('✓ Foto de ' + name + ' salva (' + Math.round(e.target.result.length / 1024) + 'KB)');
                  onProgress('Foto de ' + name + ' salva...');
                  resolve();
                };
                reader.onerror = function() {
                  console.error('Erro ao ler foto de ' + name);
                  onProgress('Erro ao ler foto de ' + name);
                  resolve();
                };
                reader.readAsDataURL(blob);
              });
            })
            .catch(function(err) {
              console.error('Erro ao baixar foto de ' + name + ':', err);
              onProgress('⚠️ Foto de ' + name + ' não disponível');
            });
        });

        return Promise.all(fetches).then(function() { return result; });
      })

      // 6. Aplica no estado
      .then(function(result) {
        var agentMap = result.agentMap;
        var cats     = result.cats;
        var finalMap = {};
        Object.keys(agentMap).forEach(function(name) {
          var a = agentMap[name];
          finalMap[name] = {
            score:       a.good + a.bad > 0 ? parseFloat(((a.good / (a.good + a.bad)) * 10).toFixed(1)) : null,
            good_count:  a.good,
            bad_count:   a.bad,
            total:       a.good + a.bad,
            photo:       a.photo || null,
            module_good: a.module_good || {},
            category_good: a.category_good || {},
            bad_tickets: a.raw.map(function(t) {
              return { id: t.id, date: t.date, subject: (result.subjectMap || {})[t.id] || '', comment: t.comment, category: cats[t.id] || '', module: t.module || '', zdCategory: t.zdCategory || '' };
            }),
            // Positivos individuais com data (para o filtro por período contar certo)
            good_tickets: a.good_raw.map(function(t) {
              return { id: t.id, date: t.date, module: t.module || '', zdCategory: t.zdCategory || '' };
            })
          };
        });

        // Persiste dados de todos os agentes (foto + score) para cadastro posterior
        var agentStore = {};
        Object.keys(finalMap).forEach(function(name) {
          agentStore[name] = { photo: finalMap[name].photo || null, score: finalMap[name].score };
        });
        saveAgents(agentStore);

        // Auto-vincula nomes do Zendesk com analistas cadastrados
        var zdNames = Object.keys(finalMap);
        var autoNameMap = autoMatchNames(zdNames, analysts);

        // Aplica scores e tickets
        var result = applyAgentData(analysts, finalMap);
        var updated = result.updated;
        var nameMap = result.nameMap;

        // Mescla auto-matching com resultado do applyAgentData
        Object.assign(nameMap, autoNameMap);

        // Salva o nameMap atualizado na config
        var cfg = getConfig();
        cfg.nameMap = nameMap;
        saveConfig(cfg);

        // Aplica fotos: só preenche se o analista ainda não tiver foto
        var photoCount = 0;
        analysts.forEach(function(analyst) {
          var key = analyst.name.trim().toLowerCase();
          if (analyst.photo) return; // não sobrescreve foto existente
          Object.keys(finalMap).forEach(function(zdName) {
            var mapped  = nameMap[zdName];
            var matches = mapped
              ? mapped.trim().toLowerCase() === key
              : zdName.trim().toLowerCase() === key;
            if (matches && finalMap[zdName].photo) {
              analyst.photo = finalMap[zdName].photo;
              photoCount++;
              console.log('✓ Foto aplicada a ' + analyst.name);
            }
          });
        });
        console.log('Total de fotos aplicadas: ' + photoCount);

        // Recalcula todas as notas com o prior final da equipe (consistente)
        recomputeAllScores(analysts);

        // 7. Busca TODOS os atendimentos do período (não só os avaliados) por analista
        function ymd(ts) {
          var d = new Date(ts * 1000);
          return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        }
        function fetchAllTickets() {
          var startYmd = ymd(startTime), endYmd = ymd(endTime);
          var raw = [], assigneeIds = {}, seen = {};
          function fieldModule(t) {
            if (!detectedField) return '';
            var cf = (t.custom_fields || []).filter(function(x) { return String(x.id) === String(detectedField.id); })[0];
            return (cf && cf.value != null && cf.value !== '') ? (detectedField.valueToModule[String(cf.value)] || '') : '';
          }
          function fetchGroup(gi) {
            if (gi >= groupIds.length) return Promise.resolve();
            var query = 'type:ticket group:' + groupIds[gi] + ' created>=' + startYmd + ' created<=' + endYmd;
            var collected = 0;
            function page(url) {
              return zdFetch(url).then(function(d) {
                (d.results || []).forEach(function(t) {
                  if (t.id == null || seen[t.id]) return;
                  seen[t.id] = true;
                  if (t.assignee_id) assigneeIds[t.assignee_id] = true;
                  raw.push({ assignee_id: t.assignee_id, id: t.id, subject: (t.subject || '').slice(0, 120), created_at: t.created_at, status: t.status || '', module: fieldModule(t) });
                  collected++;
                });
                onProgress('Buscando todos os atendimentos... (' + raw.length + ')');
                var next = nextPageUrl(d);
                // Teto de segurança alto; na prática a Search API do Zendesk já limita ~1000/consulta.
                if (next && collected < 20000) return delay(500).then(function() { return page(next); });
                return null;
              }).catch(function() { return null; });
            }
            return page(base + '/api/v2/search.json?per_page=100&query=' + encodeURIComponent(query))
              .then(function() { return delay(1000).then(function() { return fetchGroup(gi + 1); }); });
          }
          onProgress('Buscando todos os atendimentos no período...');
          return fetchGroup(0).then(function() {
            var ids = Object.keys(assigneeIds), nameById = {};
            function resolve(i) {
              if (i >= ids.length) return Promise.resolve();
              return zdFetch('/api/v2/users/show_many.json?ids=' + ids.slice(i, i + 100).join(','))
                .then(function(d) { (d.users || []).forEach(function(u) { nameById[u.id] = u.name; }); })
                .catch(function() {})
                .then(function() { return delay(300).then(function() { return resolve(i + 100); }); });
            }
            return (ids.length ? resolve(0) : Promise.resolve()).then(function() {
              var byAnalyst = {};
              raw.forEach(function(t) {
                var agentName = nameById[t.assignee_id] || ('Agente-' + t.assignee_id);
                var an = findAnalystForAgent(agentName, analysts, nameMap);
                if (!an) return;
                var d = new Date(t.created_at);
                var rec = {
                  id: t.id, subject: t.subject, status: t.status, module: t.module,
                  date: d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0') + '/' + d.getFullYear()
                };
                (byAnalyst[an.id] = byAnalyst[an.id] || []).push(rec);
              });
              Object.keys(byAnalyst).forEach(function(aid) {
                var stored = getTickets(aid) || {};
                stored.all_tickets = byAnalyst[aid].slice(0, 1000);
                saveTickets(aid, stored);
              });
              onProgress('Atendimentos por analista atualizados.');
            });
          });
        }

        return fetchAllTickets().catch(function() {}).then(function() {
          saveStatus({ ok: true, at: new Date().toISOString(), updated: updated });
          onProgress('✓ ' + updated + ' analistas atualizados (avaliações + atendimentos)!');
          callback(updated, null);
        });
      })

      .catch(function(err) {
        onProgress('✗ ' + err.message);
        callback(0, err.message);
      });
  }

  function categorizeGemini(key, tickets, onProgress) {
    var cats  = {};
    var BATCH = 5;
    var LABELS = ['Demora no atendimento','Problema não resolvido','Falta de conhecimento técnico','Comunicação inadequada','Procedimento incorreto','Outros'];

    function next(i) {
      if (i >= tickets.length) return Promise.resolve(cats);
      var slice  = tickets.slice(i, i + BATCH);
      var done   = Math.min(i + BATCH, tickets.length);
      onProgress('Categorizando com Gemini... (' + done + '/' + tickets.length + ')');

      var prompt = 'Classifique cada feedback negativo em uma categoria.\nCategorias: ' + LABELS.join(' | ') +
        '\nResponda SOMENTE com JSON array de strings.\n\n';
      slice.forEach(function(t, j) {
        prompt += (j + 1) + '. ' + (t.comment || '(sem comentário)').substring(0, 200) + '\n';
      });

      return fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200, temperature: 0 } })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var text  = data.candidates && data.candidates[0] ? data.candidates[0].content.parts[0].text.trim() : '[]';
        var match = text.match(/\[[\s\S]*\]/);
        var arr   = match ? JSON.parse(match[0]) : [];
        slice.forEach(function(t, j) { cats[t.id] = arr[j] || 'Outros'; });
        return new Promise(function(res) { setTimeout(res, 4000); }); // 15 RPM free tier
      })
      .catch(function() { slice.forEach(function(t) { cats[t.id] = ''; }); })
      .then(function() { return next(i + BATCH); });
    }

    return next(0);
  }

  return {
    sync:           sync,
    importDirect:   importDirect,
    recalcScore:    recalcScore,
    recomputeAllScores: recomputeAllScores,
    getTeamPrior:   getTeamPrior,
    moduleScores:   moduleScores,
    getCategoryStats: getCategoryStats,
    categoryRanking: categoryRanking,
    moduleRanking:  moduleRanking,
    negativesForModule: negativesForModule,
    negativesForCategory: negativesForCategory,
    detectTicketFields: detectTicketFields,
    getTickets:     getTickets,
    saveTickets:    saveTickets,
    getAgentData:   getAgentData,
    getConfig:      getConfig,
    saveConfig:     saveConfig,
    getStatus:      getStatus,
    getFoundNames:  getFoundNames,
    getPhotoCache:  getPhotoCache
  };
})();
