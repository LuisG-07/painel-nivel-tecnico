/**
 * SkillMatrix Pro — Zendesk CSAT + Gemini Sync
 *
 * SETUP (executar UMA vez):
 *   1. Acesse script.google.com → Novo projeto
 *   2. Cole todo o conteúdo deste arquivo
 *   3. Preencha SETUP_VALUES abaixo e execute setup()
 *   4. Apague os valores de SETUP_VALUES (ficam nas Script Properties)
 *   5. Execute syncZendeskToSheets() para testar manualmente
 *   6. Execute createTrigger() para agendar execução diária
 *   7. Implantar → Novo implantação → Tipo: App da Web
 *        Executar como: Eu  |  Quem pode acessar: Qualquer pessoa
 *   8. Copie a URL de implantação para SkillMatrix Pro → Gerenciar → Zendesk
 *
 * TOKEN ZENDESK:
 *   Zendesk Admin → Apps and integrations → Zendesk API → Token access
 *   (o token tem formato diferente de OAuth — é a chave da API)
 *
 * CHAVE GEMINI (gratuita):
 *   aistudio.google.com/app/apikey → Create API key
 */

// Preencha aqui e execute setup() UMA vez, depois limpe os valores.
var SETUP_VALUES = {
  ZENDESK_SUBDOMAIN: '',     // ex: 'minhaempresa' de minhaempresa.zendesk.com
  ZENDESK_EMAIL:     '',     // ex: 'admin@empresa.com'
  ZENDESK_TOKEN:     '',     // Token da API do Zendesk
  ZENDESK_GROUP:     'suporte n1',
  GEMINI_KEY:        '',     // Chave do Google AI Studio (gratuita)
  DAYS_BACK:         '30'    // Quantos dias de histórico buscar
};

function setup() {
  PropertiesService.getScriptProperties().setProperties(SETUP_VALUES);
  Logger.log('✓ Propriedades salvas. Limpe os valores de SETUP_VALUES agora.');
}

function cfg(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

// ---------------------------------------------------------------------------
// Web App endpoint — chamado pelo SkillMatrix Pro no carregamento
// Retorna: { agents: { [nome]: { score, good_count, bad_count, total, bad_tickets[] } } }
// ---------------------------------------------------------------------------
function doGet(e) {
  try {
    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var scoreTab = ss.getSheetByName('Agentes_Score');
    if (!scoreTab) {
      return respond({ error: 'Execute syncZendeskToSheets() primeiro para gerar os dados.' });
    }

    // Lê sumário por agente
    var scoreRows = scoreTab.getDataRange().getValues();
    var agents    = {};
    for (var i = 1; i < scoreRows.length; i++) {
      var name = String(scoreRows[i][0]).trim();
      if (!name) continue;
      agents[name] = {
        score:       scoreRows[i][1],
        bad_count:   scoreRows[i][2],
        good_count:  scoreRows[i][3],
        total:       scoreRows[i][4],
        updated:     scoreRows[i][5],
        bad_tickets: []
      };
    }

    // Anexa tickets negativados de cada agente (vêm do Raw_CSAT)
    var rawTab = ss.getSheetByName('Raw_CSAT');
    if (rawTab) {
      var rawRows = rawTab.getDataRange().getValues();
      for (var j = 1; j < rawRows.length; j++) {
        var ticketId  = rawRows[j][0];
        var agentName = String(rawRows[j][1]).trim();
        var date      = rawRows[j][2];
        var score     = rawRows[j][3];
        var comment   = rawRows[j][4];
        var category  = rawRows[j][5];
        if (score === 'bad' && agents[agentName]) {
          agents[agentName].bad_tickets.push({
            id:       ticketId,
            date:     date ? new Date(date).toLocaleDateString('pt-BR').slice(0, 5) : '',
            comment:  String(comment || ''),
            category: String(category || '')
          });
        }
      }
    }

    return respond({ agents: agents, synced_at: new Date().toISOString() });
  } catch (err) {
    return respond({ error: err.message });
  }
}

function respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Sincronização principal — executar diariamente via trigger
// ---------------------------------------------------------------------------
function syncZendeskToSheets() {
  var sub       = cfg('ZENDESK_SUBDOMAIN');
  var groupName = cfg('ZENDESK_GROUP') || 'suporte n1';
  var daysBack  = parseInt(cfg('DAYS_BACK')) || 30;

  if (!sub) throw new Error('ZENDESK_SUBDOMAIN não configurado. Execute setup() primeiro.');

  var groupId = findGroupId(groupName);
  if (!groupId) throw new Error('Grupo "' + groupName + '" não encontrado no Zendesk.');
  Logger.log('Grupo "' + groupName + '" → ID ' + groupId);

  var startTime    = Math.floor((Date.now() - daysBack * 86400000) / 1000);
  var allRatings   = fetchAllRatings(startTime);
  var groupRatings = allRatings.filter(function(r) { return r.group_id == groupId; });
  Logger.log('Avaliações no período: ' + allRatings.length + ' | Grupo N1: ' + groupRatings.length);

  var userMap  = buildUserMap(groupRatings);
  var enriched = groupRatings.map(function(r) {
    return {
      ticket_id:     r.ticket_id,
      assignee_id:   r.assignee_id,
      assignee_name: userMap[r.assignee_id] || ('Agente-' + r.assignee_id),
      score:         r.score,
      comment:       r.comment || '',
      created_at:    r.created_at,
      group_id:      r.group_id
    };
  });

  var badOnes    = enriched.filter(function(r) { return r.score === 'bad'; });
  var categories = categorizeAll(badOnes);

  writeRaw(enriched, categories);
  var agentMap = calcScores(enriched);
  writeSummary(agentMap);

  Logger.log('Sync completo. ' + Object.keys(agentMap).length + ' analistas processados.');
}

// ---------------------------------------------------------------------------
// Zendesk API helpers
// ---------------------------------------------------------------------------
function findGroupId(name) {
  var data   = zdGet('/api/v2/groups.json?per_page=100');
  var groups = data.groups || [];
  for (var i = 0; i < groups.length; i++) {
    if (groups[i].name.trim().toLowerCase() === name.trim().toLowerCase()) {
      return groups[i].id;
    }
  }
  return null;
}

function fetchAllRatings(startTime) {
  var all  = [];
  var path = '/api/v2/satisfaction_ratings.json?per_page=100&start_time=' + startTime;
  while (path) {
    var data  = zdGet(path);
    var batch = data.satisfaction_ratings || [];
    all       = all.concat(batch);
    path      = data.next_page
      ? data.next_page.replace('https://' + cfg('ZENDESK_SUBDOMAIN') + '.zendesk.com', '')
      : null;
    if (all.length >= 2000) break;
  }
  return all;
}

function buildUserMap(ratings) {
  var idSet = {};
  ratings.forEach(function(r) { if (r.assignee_id) idSet[r.assignee_id] = true; });
  var ids = Object.keys(idSet).join(',');
  if (!ids) return {};
  var data  = zdGet('/api/v2/users/show_many.json?ids=' + ids);
  var users = data.users || [];
  var map   = {};
  users.forEach(function(u) { map[u.id] = u.name; });
  return map;
}

function zdGet(path) {
  var sub  = cfg('ZENDESK_SUBDOMAIN');
  var url  = path.startsWith('http') ? path : 'https://' + sub + '.zendesk.com' + path;
  var cred = Utilities.base64Encode(cfg('ZENDESK_EMAIL') + '/token:' + cfg('ZENDESK_TOKEN'));
  var res  = UrlFetchApp.fetch(url, {
    headers:            { 'Authorization': 'Basic ' + cred },
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('Zendesk HTTP ' + code + ': ' + res.getContentText().substring(0, 200));
  }
  return JSON.parse(res.getContentText());
}

// ---------------------------------------------------------------------------
// Score por analista: (positivos / total) × 10
// ---------------------------------------------------------------------------
function calcScores(ratings) {
  var map = {};
  ratings.forEach(function(r) {
    var n = r.assignee_name;
    if (!map[n]) map[n] = { good: 0, bad: 0 };
    if (r.score === 'good')      map[n].good++;
    else if (r.score === 'bad')  map[n].bad++;
  });
  Object.keys(map).forEach(function(n) {
    var a   = map[n];
    a.total = a.good + a.bad;
    a.score = a.total > 0 ? parseFloat(((a.good / a.total) * 10).toFixed(1)) : null;
  });
  return map;
}

// ---------------------------------------------------------------------------
// Gemini — categorização dos tickets negativados (gratuito)
// Limite free tier: 15 req/min, 1500 req/dia → sleep de 4s entre lotes
// ---------------------------------------------------------------------------
function categorizeAll(badRatings) {
  var key  = cfg('GEMINI_KEY');
  var cats = {};
  if (!key || !badRatings.length) return cats;

  var BATCH  = 5;
  var LABELS = [
    'Demora no atendimento',
    'Problema não resolvido',
    'Falta de conhecimento técnico',
    'Comunicação inadequada',
    'Procedimento incorreto',
    'Outros'
  ];

  for (var i = 0; i < badRatings.length; i += BATCH) {
    var slice  = badRatings.slice(i, i + BATCH);
    var prompt =
      'Classifique cada feedback negativo abaixo em exatamente uma categoria.\n' +
      'Categorias: ' + LABELS.join(' | ') + '\n' +
      'Responda SOMENTE com um JSON array de strings, ex: ["Cat1","Cat2"]\n\n';
    slice.forEach(function(r, j) {
      prompt += (j + 1) + '. ' + (r.comment || '(sem comentário)').substring(0, 300) + '\n';
    });

    var result = callGemini(key, prompt, slice.length);
    slice.forEach(function(r, j) { cats[r.ticket_id] = result[j] || 'Outros'; });

    if (i + BATCH < badRatings.length) Utilities.sleep(4000);
  }
  return cats;
}

function callGemini(key, prompt, expectedCount) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + key;
  try {
    var res  = UrlFetchApp.fetch(url, {
      method:             'POST',
      contentType:        'application/json',
      payload:            JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0 }
      }),
      muteHttpExceptions: true
    });
    var body  = JSON.parse(res.getContentText());
    var text  = body.candidates && body.candidates[0]
      ? body.candidates[0].content.parts[0].text.trim()
      : '';
    var match = text.match(/\[[\s\S]*\]/);
    if (match) {
      var arr = JSON.parse(match[0]);
      if (Array.isArray(arr) && arr.length === expectedCount) return arr;
    }
  } catch (e) {
    Logger.log('Gemini error: ' + e);
  }
  var fallback = [];
  for (var i = 0; i < expectedCount; i++) fallback.push('Outros');
  return fallback;
}

// ---------------------------------------------------------------------------
// Escrita nas planilhas
// ---------------------------------------------------------------------------
function writeRaw(ratings, categories) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName('Raw_CSAT') || ss.insertSheet('Raw_CSAT');
  tab.clearContents();
  tab.getRange(1, 1, 1, 6).setValues([['Ticket', 'Analista', 'Data', 'Score', 'Comentário', 'Categoria']]);
  if (!ratings.length) return;
  var rows = ratings.map(function(r) {
    return [r.ticket_id, r.assignee_name, r.created_at, r.score, r.comment, categories[r.ticket_id] || ''];
  });
  tab.getRange(2, 1, rows.length, 6).setValues(rows);
}

function writeSummary(agentMap) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var tab = ss.getSheetByName('Agentes_Score') || ss.insertSheet('Agentes_Score');
  tab.clearContents();
  tab.getRange(1, 1, 1, 6).setValues([['Analista', 'Nota (0-10)', 'Negativados', 'Positivos', 'Total', 'Atualizado']]);
  var now  = new Date().toLocaleString('pt-BR');
  var rows = Object.keys(agentMap)
    .sort(function(a, b) { return (agentMap[a].score || 0) - (agentMap[b].score || 0); })
    .map(function(n) {
      var a = agentMap[n];
      return [n, a.score, a.bad, a.good, a.total, now];
    });
  if (rows.length) tab.getRange(2, 1, rows.length, 6).setValues(rows);
}

// ---------------------------------------------------------------------------
// Trigger diário (executar uma vez)
// ---------------------------------------------------------------------------
function createTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'syncZendeskToSheets'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger('syncZendeskToSheets')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  Logger.log('✓ Trigger diário criado: syncZendeskToSheets às 7h.');
}
