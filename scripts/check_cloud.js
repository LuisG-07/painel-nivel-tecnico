// Diagnostico (leitura): estado atual da nuvem (analistas + dados do Zendesk).
// Uso: node scripts/check_cloud.js
var admin = require('../functions/node_modules/firebase-admin');
var key = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(key) });
var db = admin.firestore();
var appData = db.collection('appData');

function human(n) { return n > 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B'; }

async function main() {
  // 1) docs de topo em appData
  var top = await appData.listDocuments();
  console.log('=== appData docs ===');
  console.log(top.map(function (d) { return d.id; }).join(', '));

  // 2) chaves do Zendesk
  var zdKeys = ['skm6_zdcfg', 'skm6_zdtickets', 'skm6_zdcategories', 'skm6_zdagents',
    'skm6_zdemails', 'skm6_zdfound', 'skm6_zdstatus', 'skm6_zdphotos'];
  console.log('\n=== Zendesk (appData/zd_*) ===');
  for (var i = 0; i < zdKeys.length; i++) {
    var k = zdKeys[i];
    var snap = await appData.doc('zd_' + k).get();
    if (!snap.exists) { console.log(k.padEnd(20) + ' -> AUSENTE'); continue; }
    var data = snap.data() || {};
    var size = data.data ? data.data.length : 0;
    var parts = data.parts || 0;
    var when = data.updatedAt ? new Date(data.updatedAt).toLocaleString('pt-BR') : '?';
    var extra = '';
    if (k === 'skm6_zdcfg' && data.data) {
      try { var cfg = JSON.parse(data.data); extra = ' · nameMap: ' + Object.keys(cfg.nameMap || {}).length + ' vinculos'; } catch (e) {}
    }
    console.log(k.padEnd(20) + ' -> ' + (parts > 0 ? parts + ' partes' : human(size)) + ' · atualizado ' + when + extra);
  }

  // 3) analistas (cargo/step/zendesk)
  var items = await appData.doc('analysts').collection('items').get();
  var rows = [];
  items.forEach(function (d) { var a = d.data(); rows.push({ name: a.name, level: a.level, step: a.step, zendesk: a.zendesk }); });
  rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  console.log('\n=== Analistas na nuvem (' + rows.length + ') ===');
  rows.forEach(function (a) {
    console.log('  ' + String(a.name).padEnd(20) + ' | ' + String(a.level || '-').padEnd(8) + ' | step ' + (a.step != null ? a.step : '-') + ' | zendesk ' + (a.zendesk != null ? a.zendesk : '-'));
  });
  process.exit(0);
}
main().catch(function (e) { console.error('ERRO:', e.message); process.exit(1); });
