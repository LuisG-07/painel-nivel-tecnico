var ZendeskSync = (function() {
  var CFG_KEY     = 'skm6_zdcfg';
  var SEC_KEY     = 'skm6_zdcfg_sec';
  var STATUS_KEY  = 'skm6_zdstatus';
  var TICKETS_KEY = 'skm6_zdtickets';
  var AGENTS_KEY  = 'skm6_zdagents'; // foto + score de todos os agentes do Zendesk
  var PHOTOS_KEY  = 'skm6_zdphotos'; // cache persistente de fotos de analistas

  // Public (non-sensitive) defaults — stored in localStorage
  var DEFAULT_CFG = { subdomain: 'beteltecnologia', groupName: 'SUP-N1', groupIds: ['6441506014871', '21198035409559', '360001272933'], days: 30, dateFrom: '', dateTo: '', scriptUrl: '', nameMap: {
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

  // Nota 0-10 contando apenas tickets com consider:true como negativos
  function recalcScore(goodCount, badTickets) {
    var consideredBad = badTickets.filter(function(t) { return t.consider; }).length;
    var total = goodCount + consideredBad;
    return total > 0 ? parseFloat(((goodCount / total) * 10).toFixed(1)) : null;
  }

  function getFoundNames() {
    try { return JSON.parse(localStorage.getItem(FOUND_KEY)) || []; }
    catch(e) { return []; }
  }
  function saveFoundNames(names) {
    localStorage.setItem(FOUND_KEY, JSON.stringify(names));
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
      var key = analyst.name.trim().toLowerCase();
      Object.keys(agentMap).forEach(function(agentName) {
        if (usedAgents[agentName]) return; // já foi vinculado, pula

        // Tenta: mapeamento manual → correspondência exata → sem match
        var mapped  = nameMap[agentName];
        var matches = mapped
          ? mapped.trim().toLowerCase() === key
          : agentName.trim().toLowerCase() === key;
        if (!matches) return;
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
            consider: prev !== undefined ? prev : true
          };
        });

        var goodCount = data.good_count != null ? data.good_count : (data.good_tickets || 0);
        saveTickets(analyst.id, { good_count: goodCount, bad_tickets: bad_tickets });
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

    return updated;
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
        var updated = applyAgentData(analysts, data.agents || {});
        saveStatus({ ok: true, at: new Date().toISOString(), updated: updated });
        callback && callback(updated, null, 'ok');
      })
      .catch(function(err) {
        saveStatus({ ok: false, at: new Date().toISOString(), error: err.message });
        callback && callback(0, err.message, 'error');
      });
  }

  // ---------------------------------------------------------------------------
  // Importação direta do Zendesk via browser (sem Apps Script)
  // ---------------------------------------------------------------------------
  function importDirect(analysts, onProgress, callback) {
    var cfg = getConfig();
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
    var oneMinuteAgo = now - 60;
    if (cfg.dateFrom && cfg.dateTo) {
      startTime = Math.floor(new Date(cfg.dateFrom).getTime() / 1000);
      endTime   = Math.floor(new Date(cfg.dateTo).getTime() / 1000) + 86399; // até o final do dia
      // Se end_time for no futuro, ajusta para 1 minuto atrás
      if (endTime > oneMinuteAgo) {
        endTime = oneMinuteAgo;
      }
    } else {
      startTime = Math.floor((Date.now() - (cfg.days || 30) * 86400000) / 1000);
      endTime   = oneMinuteAgo; // sempre 1 minuto atrás para evitar erro
    }
    var groupName = (cfg.groupName || 'suporte n1').toLowerCase();

    // Quando rodando em localhost, usa proxy local para evitar bloqueio CORS do Zendesk
    var isLocal   = typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    // Include subdomain in proxy path so the server knows where to route the request
    var proxyBase = isLocal ? (window.location.origin + '/zdproxy/' + cfg.subdomain) : null;

    function toUrl(path) {
      if (path.startsWith('http')) {
        // URLs absolutas — se for local, usa proxy passando URL completa
        if (proxyBase) {
          // Para imagens de CDN, passa a URL completa como parâmetro
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(path)) {
            return proxyBase + '?url=' + encodeURIComponent(path);
          }
          // Para APIs, tenta substituir o domain
          return path.replace(base, proxyBase);
        }
        return path;
      }
      return (proxyBase || base) + path;
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

    function fetchGroupRatings(idx) {
      if (idx >= groupIds.length) return Promise.resolve([]);
      var groupId = groupIds[idx];
      var all = [];
      function fetchPage(url) {
        return zdFetch(url).then(function(data) {
          var batch = data.satisfaction_ratings || [];
          all = all.concat(batch);
          onProgress('Grupo "' + groupNames[idx] + '" - Avaliações: ' + all.length + '...');
          if (data.next_page && all.length < 5000) return delay(500).then(function() { return fetchPage(data.next_page); });
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
        onProgress('Total de avaliações: ' + consolidated.length);
        return consolidated;
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

      // 4. Agrupa por agente (captura photoUrl)
      .then(function(result) {
        var agentMap = {};
        result.ratings.forEach(function(r) {
          var name = result.userMap[r.assignee_id] || ('Agente-' + r.assignee_id);
          if (!agentMap[name]) agentMap[name] = { good: 0, bad: 0, raw: [], photoUrl: result.photoMap[r.assignee_id] || null };
          if (r.score === 'good') {
            agentMap[name].good++;
          } else if (r.score === 'bad') {
            agentMap[name].bad++;
            var d = new Date(r.created_at);
            agentMap[name].raw.push({
              id:      r.ticket_id,
              date:    d.getDate().toString().padStart(2,'0') + '/' +
                       (d.getMonth()+1).toString().padStart(2,'0') + '/' +
                       d.getFullYear(),
              comment: r.comment || '',
              category: ''
            });
          }
        });

        var badAll = [];
        Object.keys(agentMap).forEach(function(n) {
          agentMap[n].raw.forEach(function(t) { badAll.push(t); });
        });

        // 4.5 Busca assunto dos tickets negativos em lotes de 100 (com delay)
        var subjectMap = {};
        function fetchSubjects(ids, i) {
          if (i >= ids.length) return Promise.resolve(subjectMap);
          var batch = ids.slice(i, i + 100).join(',');
          onProgress('Buscando assuntos dos tickets negativos... (' + Math.min(i + 100, ids.length) + '/' + ids.length + ')');
          return zdFetch('/api/v2/tickets/show_many.json?ids=' + batch)
            .then(function(d) {
              (d.tickets || []).forEach(function(t) { subjectMap[t.id] = t.subject || ''; });
            })
            .catch(function() {})
            .then(function() { return delay(500).then(function() { return fetchSubjects(ids, i + 100); }); });
        }

        var allBadIds = badAll.map(function(t) { return t.id; });
        var subjectPromise = allBadIds.length ? fetchSubjects(allBadIds, 0) : Promise.resolve(subjectMap);

        // 5. Categoriza com Gemini se chave configurada
        var catPromise = (cfg.geminiKey && badAll.length)
          ? categorizeGemini(cfg.geminiKey, badAll, onProgress)
          : Promise.resolve({});

        return Promise.all([subjectPromise, catPromise]).then(function(results) {
          return { agentMap: agentMap, cats: results[1], subjectMap: results[0] || subjectMap };
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
          return fetch(photoUrl)
            .then(function(r) {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.blob();
            })
            .then(function(blob) {
              if (!blob) return Promise.resolve();
              return new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload  = function(e) {
                  result.agentMap[name].photo = e.target.result;
                  onProgress('Foto de ' + name + ' salva...');
                  resolve();
                };
                reader.onerror = function() {
                  onProgress('Erro ao ler foto de ' + name);
                  resolve();
                };
                reader.readAsDataURL(blob);
              });
            })
            .catch(function(err) {
              onProgress('Erro ao baixar foto de ' + name + ': ' + err.message);
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
            bad_tickets: a.raw.map(function(t) {
              return { id: t.id, date: t.date, subject: (result.subjectMap || {})[t.id] || '', comment: t.comment, category: cats[t.id] || '' };
            })
          };
        });

        // Persiste dados de todos os agentes (foto + score) para cadastro posterior
        var agentStore = {};
        Object.keys(finalMap).forEach(function(name) {
          agentStore[name] = { photo: finalMap[name].photo || null, score: finalMap[name].score };
        });
        saveAgents(agentStore);

        // Aplica scores e tickets
        var updated = applyAgentData(analysts, finalMap);

        // Aplica fotos: só preenche se o analista ainda não tiver foto
        var nameMap = getConfig().nameMap || {};
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

        saveStatus({ ok: true, at: new Date().toISOString(), updated: updated });
        onProgress('✓ ' + updated + ' analistas atualizados com dados reais!');
        callback(updated, null);
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
    getTickets:     getTickets,
    saveTickets:    saveTickets,
    getAgentData:   getAgentData,
    getConfig:      getConfig,
    saveConfig:     saveConfig,
    getStatus:      getStatus,
    getFoundNames:  getFoundNames
  };
})();
