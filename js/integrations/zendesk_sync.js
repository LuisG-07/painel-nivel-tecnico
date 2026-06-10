var ZendeskSync = (function() {
  var CFG_KEY     = 'skm6_zdcfg';
  var SEC_KEY     = 'skm6_zdcfg_sec'; // sessionStorage — cleared on tab/browser close
  var STATUS_KEY  = 'skm6_zdstatus';
  var TICKETS_KEY = 'skm6_zdtickets';

  // Public (non-sensitive) defaults — stored in localStorage
  var DEFAULT_CFG = { subdomain: 'beteltecnologia', groupName: 'SUP-N1', days: 30, scriptUrl: '', nameMap: {
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
  // Sensitive defaults — stored in sessionStorage only
  var DEFAULT_SEC = { email: '', apiToken: '', geminiKey: '' };

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
    try { return Object.assign({}, DEFAULT_SEC, JSON.parse(sessionStorage.getItem(SEC_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULT_SEC); }
  }

  function _saveSensitive(s) {
    sessionStorage.setItem(SEC_KEY, JSON.stringify({
      email:     typeof s.email     === 'string' ? s.email.slice(0, 256)     : '',
      apiToken:  typeof s.apiToken  === 'string' ? s.apiToken.slice(0, 512)  : '',
      geminiKey: typeof s.geminiKey === 'string' ? s.geminiKey.slice(0, 256) : ''
    }));
  }

  function getConfig() {
    try {
      var stored = JSON.parse(localStorage.getItem(CFG_KEY)) || {};
      // Migrate: if old storage still has plaintext credentials, move them to sessionStorage
      if (stored.email || stored.apiToken || stored.geminiKey) {
        _saveSensitive({ email: stored.email || '', apiToken: stored.apiToken || '', geminiKey: stored.geminiKey || '' });
        delete stored.email; delete stored.apiToken; delete stored.geminiKey;
        localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign({}, DEFAULT_CFG, stored)));
      }
      return Object.assign({}, DEFAULT_CFG, stored, _getSensitive());
    }
    catch (e) { return Object.assign({}, DEFAULT_CFG, _getSensitive()); }
  }

  function saveConfig(c) {
    var pub = {
      subdomain: typeof c.subdomain === 'string' ? c.subdomain.slice(0, 63)  : '',
      groupName: typeof c.groupName === 'string' ? c.groupName.slice(0, 100) : 'suporte n1',
      days:      typeof c.days      === 'number' ? Math.min(Math.max(c.days, 1), 365) : 30,
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

    analysts.forEach(function(analyst) {
      var key = analyst.name.trim().toLowerCase();
      Object.keys(agentMap).forEach(function(agentName) {
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
        updated++;
      });
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
  // Dados de teste com tickets realistas (técnicos e comportamentais misturados)
  // ---------------------------------------------------------------------------
  var MOCK_AGENTS = {
    'Bruno':          { score: 4.2, good_count: 7,  bad_tickets: [
      { id: 10001, date: '08/06/2026', category: 'Problema não resolvido',        comment: 'Abri ticket há 3 dias sobre erro no Mercado Pago e o problema ainda não foi resolvido.' },
      { id: 10002, date: '07/06/2026', category: 'Falta de conhecimento técnico', comment: 'O analista não soube configurar a integração com o PagHiper, precisou escalar para outro colega.' },
      { id: 10003, date: '05/06/2026', category: 'Comunicação inadequada',        comment: 'Resposta demorada e sem clareza, tive que perguntar a mesma coisa três vezes.' },
      { id: 10004, date: '04/06/2026', category: 'Procedimento incorreto',        comment: 'Configurou o SendGrid de forma errada, meus e-mails ficaram na caixa de spam por dois dias.' },
      { id: 10005, date: '03/06/2026', category: 'Demora no atendimento',         comment: 'Mais de 50 minutos esperando retorno para uma dúvida simples de cadastro.' },
      { id: 10006, date: '02/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não conseguiu orientar sobre emissão de NF-e, informações passadas estavam erradas.' },
      { id: 10007, date: '01/06/2026', category: 'Comunicação inadequada',        comment: 'Tom agressivo e impaciente durante a ligação.' },
      { id: 10008, date: '31/05/2026', category: 'Problema não resolvido',        comment: 'Problema de sincronização com o Mercado Livre continua mesmo após 2 atendimentos.' }
    ]},
    'Ana Claudia':    { score: 3.1, good_count: 4,  bad_tickets: [
      { id: 11001, date: '08/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não soube explicar como configurar boletos no sistema, me passou informações contraditórias.' },
      { id: 11002, date: '07/06/2026', category: 'Problema não resolvido',        comment: 'Questão de contratos ainda pendente depois de 4 atendimentos diferentes.' },
      { id: 11003, date: '06/06/2026', category: 'Comunicação inadequada',        comment: 'A analista ficou impaciente quando não entendi a instrução e foi indelicada.' },
      { id: 11004, date: '05/06/2026', category: 'Procedimento incorreto',        comment: 'Seguindo o procedimento orientado o sistema deu erro, precisei ligar novamente.' },
      { id: 11005, date: '04/06/2026', category: 'Demora no atendimento',         comment: 'Chat abandonado sem resposta por mais de 30 minutos.' },
      { id: 11006, date: '03/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não sabia como reverter uma NF emitida com erro, pediu para eu ligar depois.' },
      { id: 11007, date: '02/06/2026', category: 'Comunicação inadequada',        comment: 'Atendimento feito com aparente pressa, sem disposição para ajudar.' },
      { id: 11008, date: '31/05/2026', category: 'Problema não resolvido',        comment: 'Integração com a Shopee ainda com erro após tentativas de suporte.' },
      { id: 11009, date: '30/05/2026', category: 'Procedimento incorreto',        comment: 'Orientação errada sobre emissão de CT-e causou retrabalho.' }
    ]},
    'Tiago':          { score: 3.3, good_count: 4,  bad_tickets: [
      { id: 12001, date: '08/06/2026', category: 'Falta de conhecimento técnico', comment: 'O analista não conseguiu resolver dúvida básica sobre DRE, teve que escalar.' },
      { id: 12002, date: '07/06/2026', category: 'Problema não resolvido',        comment: 'Erro no financeiro persiste mesmo após procedimento indicado.' },
      { id: 12003, date: '06/06/2026', category: 'Comunicação inadequada',        comment: 'Respostas muito curtas e sem empatia, senti que estava atrapalhando.' },
      { id: 12004, date: '05/06/2026', category: 'Procedimento incorreto',        comment: 'Seguiu o procedimento errado para configuração do Pag Seguro.' },
      { id: 12005, date: '04/06/2026', category: 'Demora no atendimento',         comment: 'Ticket aberto há 2 dias sem resposta no chat.' },
      { id: 12006, date: '03/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não sabia sobre funcionalidade de expedição que existe no sistema há anos.' },
      { id: 12007, date: '01/06/2026', category: 'Comunicação inadequada',        comment: 'Tom agressivo e pouca disposição para ouvir o problema.' },
      { id: 12008, date: '30/05/2026', category: 'Problema não resolvido',        comment: 'Configuração do estoque com divergência, problema segue em aberto.' }
    ]},
    'Mario':          { score: 4.0, good_count: 4,  bad_tickets: [
      { id: 13001, date: '08/06/2026', category: 'Problema não resolvido',        comment: 'Dúvida sobre relatórios não foi resolvida, fui transferido duas vezes.' },
      { id: 13002, date: '07/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não soube configurar integração com Stone, precisou consultar documentação básica ao vivo.' },
      { id: 13003, date: '06/06/2026', category: 'Demora no atendimento',         comment: 'Aguardei 45 minutos para ser atendido no chat.' },
      { id: 13004, date: '05/06/2026', category: 'Comunicação inadequada',        comment: 'O atendente demonstrou irritação quando pedi para repetir a explicação.' },
      { id: 13005, date: '04/06/2026', category: 'Procedimento incorreto',        comment: 'Configuração errada da assinatura digital gerou erro no contrato.' },
      { id: 13006, date: '02/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não sabia como emitir MDF-e pelo sistema.' }
    ]},
    'Ismael':         { score: 2.5, good_count: 3,  bad_tickets: [
      { id: 14001, date: '08/06/2026', category: 'Falta de conhecimento técnico', comment: 'Analista não soube configurar Mercado Pago, ligou para perguntar a outro colega na minha frente.' },
      { id: 14002, date: '08/06/2026', category: 'Problema não resolvido',        comment: 'Três tickets abertos para o mesmo problema, nenhum resolvido.' },
      { id: 14003, date: '07/06/2026', category: 'Comunicação inadequada',        comment: 'Atendente foi grosseiro e impaciente durante o atendimento por telefone.' },
      { id: 14004, date: '07/06/2026', category: 'Procedimento incorreto',        comment: 'Configuração do Stone feita de forma errada, precisou desfazer tudo.' },
      { id: 14005, date: '06/06/2026', category: 'Demora no atendimento',         comment: 'Mais de 1 hora aguardando retorno para dúvida simples.' },
      { id: 14006, date: '05/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não sabia sobre funcionalidade de Cobranças básica do sistema.' },
      { id: 14007, date: '04/06/2026', category: 'Problema não resolvido',        comment: 'Erro na emissão de NF persiste mesmo após 4 atendimentos.' },
      { id: 14008, date: '03/06/2026', category: 'Comunicação inadequada',        comment: 'Tom agressivo e sem disposição para resolver o problema.' },
      { id: 14009, date: '02/06/2026', category: 'Falta de conhecimento técnico', comment: 'Orientações sobre API estavam completamente erradas.' },
      { id: 14010, date: '01/06/2026', category: 'Procedimento incorreto',        comment: 'Procedimento indicado causou perda de dados de cadastro.' },
      { id: 14011, date: '31/05/2026', category: 'Demora no atendimento',         comment: 'Chat ignorado por mais de 2 horas.' },
      { id: 14012, date: '30/05/2026', category: 'Problema não resolvido',        comment: 'Integração com Hotmart ainda sem funcionar depois de 1 semana.' }
    ]},
    'Gabriel Vaz':    { score: 8.5, good_count: 14, bad_tickets: [
      { id: 15001, date: '06/06/2026', category: 'Demora no atendimento',         comment: 'Tempo de espera maior que o usual neste dia.' },
      { id: 15002, date: '02/06/2026', category: 'Comunicação inadequada',        comment: 'Explicação foi um pouco confusa sobre o processo de configuração.' }
    ]},
    'Jesse':          { score: 8.9, good_count: 9,  bad_tickets: [
      { id: 16001, date: '05/06/2026', category: 'Demora no atendimento',         comment: 'Atendimento demorou um pouco mais do que o esperado.' }
    ]},
    'Luan':           { score: 9.2, good_count: 11, bad_tickets: [
      { id: 17001, date: '04/06/2026', category: 'Comunicação inadequada',        comment: 'Explicação poderia ter sido mais detalhada.' }
    ]},
    'Diego':          { score: 7.3, good_count: 8,  bad_tickets: [
      { id: 18001, date: '07/06/2026', category: 'Problema não resolvido',        comment: 'Configuração do Tray ficou com erro, precisou de segundo atendimento.' },
      { id: 18002, date: '04/06/2026', category: 'Falta de conhecimento técnico', comment: 'Dificuldade com emissão de CT-e.' },
      { id: 18003, date: '01/06/2026', category: 'Demora no atendimento',         comment: 'Atendimento demorou para iniciar.' }
    ]},
    'Karolyne':       { score: 5.0, good_count: 5,  bad_tickets: [
      { id: 19001, date: '07/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não soube orientar sobre o módulo de Pesquisas.' },
      { id: 19002, date: '05/06/2026', category: 'Problema não resolvido',        comment: 'Questão sobre Pipedrive não solucionada.' },
      { id: 19003, date: '03/06/2026', category: 'Comunicação inadequada',        comment: 'Atendimento um pouco mecânico, sem personalização.' },
      { id: 19004, date: '01/06/2026', category: 'Demora no atendimento',         comment: 'Aguardei bastante no chat antes de ser atendida.' },
      { id: 19005, date: '30/05/2026', category: 'Procedimento incorreto',        comment: 'Orientação sobre Serasa estava desatualizada.' }
    ]},
    'Henrique Sergio':{ score: 5.5, good_count: 5,  bad_tickets: [
      { id: 20001, date: '06/06/2026', category: 'Problema não resolvido',        comment: 'Integração com NuvemShop continua com falha.' },
      { id: 20002, date: '04/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não sabia sobre módulo de Controle de Produção.' },
      { id: 20003, date: '02/06/2026', category: 'Comunicação inadequada',        comment: 'Poucas palavras e explicações rasas.' },
      { id: 20004, date: '31/05/2026', category: 'Demora no atendimento',         comment: 'Demorou para retornar ao chat.' }
    ]},
    'João Pedro S.':  { score: 6.7, good_count: 6,  bad_tickets: [
      { id: 21001, date: '07/06/2026', category: 'Falta de conhecimento técnico', comment: 'Não soube configurar o GerenciaNet corretamente.' },
      { id: 21002, date: '05/06/2026', category: 'Problema não resolvido',        comment: 'Erro na configuração de Cobranças segue pendente.' },
      { id: 21003, date: '02/06/2026', category: 'Comunicação inadequada',        comment: 'Respostas curtas e sem contexto.' }
    ]},
    'Mateus':         { score: 7.8, good_count: 9,  bad_tickets: [
      { id: 22001, date: '06/06/2026', category: 'Demora no atendimento',         comment: 'Aguardei mais do habitual no suporte via chat.' },
      { id: 22002, date: '03/06/2026', category: 'Problema não resolvido',        comment: 'Questão sobre CT-e precisou de segundo atendimento.' }
    ]},
    'Mario Diniz':    { score: 6.0, good_count: 5,  bad_tickets: [
      { id: 23001, date: '07/06/2026', category: 'Falta de conhecimento técnico', comment: 'Dificuldade com módulo de Loja Virtual.' },
      { id: 23002, date: '05/06/2026', category: 'Comunicação inadequada',        comment: 'Pouca clareza nas orientações passadas.' },
      { id: 23003, date: '03/06/2026', category: 'Demora no atendimento',         comment: 'Suporte demorou para responder.' }
    ]},
    'Sergio':         { score: 4.8, good_count: 5,  bad_tickets: [
      { id: 24001, date: '08/06/2026', category: 'Falta de conhecimento técnico', comment: 'Módulo de Produtos com configuração incorreta após orientação.' },
      { id: 24002, date: '06/06/2026', category: 'Problema não resolvido',        comment: 'Erro em OS segue sem solução.' },
      { id: 24003, date: '04/06/2026', category: 'Comunicação inadequada',        comment: 'Atendimento sem empatia.' },
      { id: 24004, date: '02/06/2026', category: 'Demora no atendimento',         comment: 'Demorou mais de 40 minutos para responder.' },
      { id: 24005, date: '31/05/2026', category: 'Procedimento incorreto',        comment: 'Procedimento de cadastro orientado estava errado.' }
    ]},
    'Thales':         { score: 6.4, good_count: 6,  bad_tickets: [
      { id: 25001, date: '07/06/2026', category: 'Problema não resolvido',        comment: 'Configuração de Assinatura Digital com falha.' },
      { id: 25002, date: '04/06/2026', category: 'Falta de conhecimento técnico', comment: 'Dificuldade com módulo de Relatorios.' },
      { id: 25003, date: '02/06/2026', category: 'Comunicação inadequada',        comment: 'Pouca disposição para explicar o processo.' }
    ]}
  };

  function runTest(analysts, callback) {
    var updated = 0;
    analysts.forEach(function(analyst) {
      var key = analyst.name.trim().toLowerCase();
      Object.keys(MOCK_AGENTS).forEach(function(agentName) {
        if (agentName.trim().toLowerCase() !== key) return;
        var data        = MOCK_AGENTS[agentName];
        var existing    = getTickets(analyst.id);
        var existingMap = {};
        if (existing && existing.bad_tickets) {
          existing.bad_tickets.forEach(function(t) { existingMap[t.id] = t.consider; });
        }
        var bad_tickets = data.bad_tickets.map(function(t) {
          return {
            id:       t.id,
            date:     t.date,
            category: t.category,
            comment:  t.comment,
            consider: existingMap[t.id] !== undefined ? existingMap[t.id] : true
          };
        });
        saveTickets(analyst.id, { good_count: data.good_count, bad_tickets: bad_tickets });
        analyst.zendesk = recalcScore(data.good_count, bad_tickets);
        updated++;
      });
    });
    saveStatus({ ok: true, at: new Date().toISOString(), updated: updated, test: true });
    callback && callback(updated, null, 'ok');
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
    var startTime = Math.floor((Date.now() - (cfg.days || 30) * 86400000) / 1000);
    var groupName = (cfg.groupName || 'suporte n1').toLowerCase();

    // Quando rodando em localhost, usa proxy local para evitar bloqueio CORS do Zendesk
    var isLocal   = typeof window !== 'undefined' &&
                    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    // Include subdomain in proxy path so the server knows where to route the request
    var proxyBase = isLocal ? (window.location.origin + '/zdproxy/' + cfg.subdomain) : null;

    function toUrl(path) {
      if (path.startsWith('http')) {
        // next_page URLs are absolute — replace the Zendesk origin with the proxy origin
        return proxyBase ? path.replace(base, proxyBase) : path;
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

    // 1. Encontra o grupo
    zdFetch('/api/v2/groups.json?per_page=100')
      .then(function(data) {
        var group = (data.groups || []).filter(function(g) {
          return g.name.trim().toLowerCase() === groupName;
        })[0];
        if (!group) throw new Error('Grupo "' + cfg.groupName + '" não encontrado.');
        onProgress('Grupo "' + group.name + '" encontrado. Buscando avaliações...');
        return group.id;
      })

      // 2. Busca avaliações filtrando por group_id na própria API
      //    (evita paginação de todos os grupos e o limite de 100 páginas offset)
      .then(function(groupId) {
        var all = [];
        function fetchPage(url) {
          return zdFetch(url).then(function(data) {
            var batch = data.satisfaction_ratings || [];
            all = all.concat(batch);
            onProgress('Avaliações encontradas: ' + all.length + '...');
            if (data.next_page && all.length < 5000) return fetchPage(data.next_page);
            return all;
          });
        }
        return fetchPage(base + '/api/v2/satisfaction_ratings.json?per_page=100&start_time=' + startTime + '&group_id=' + groupId);
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

        // 5. Categoriza com Gemini se chave configurada
        var catPromise = (cfg.geminiKey && badAll.length)
          ? categorizeGemini(cfg.geminiKey, badAll, onProgress)
          : Promise.resolve({});

        return catPromise.then(function(cats) { return { agentMap: agentMap, cats: cats }; });
      })

      // 5.5 Baixa fotos dos agentes como base64
      .then(function(result) {
        var names    = Object.keys(result.agentMap).filter(function(n) { return result.agentMap[n].photoUrl; });
        var total    = names.length;
        if (!total) return result;
        onProgress('Baixando fotos (' + total + ' agentes)...');

        var fetches = names.map(function(name) {
          var url = result.agentMap[name].photoUrl;
          return fetch(url, { headers: headers })
            .then(function(r) { return r.ok ? r.blob() : null; })
            .then(function(blob) {
              if (!blob) return;
              return new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onload  = function(e) { result.agentMap[name].photo = e.target.result; resolve(); };
                reader.onerror = function()  { resolve(); };
                reader.readAsDataURL(blob);
              });
            })
            .catch(function() {});
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
              return { id: t.id, date: t.date, comment: t.comment, category: cats[t.id] || '' };
            })
          };
        });

        // Aplica scores e tickets
        var updated = applyAgentData(analysts, finalMap);

        // Aplica fotos: só preenche se o analista ainda não tiver foto
        var nameMap = getConfig().nameMap || {};
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
            }
          });
        });

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
    runTest:        runTest,
    recalcScore:    recalcScore,
    getTickets:     getTickets,
    saveTickets:    saveTickets,
    getConfig:      getConfig,
    saveConfig:     saveConfig,
    getStatus:      getStatus,
    getFoundNames:  getFoundNames
  };
})();
