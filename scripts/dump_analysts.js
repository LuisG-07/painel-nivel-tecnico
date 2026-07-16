// Diagnostico (somente leitura): lista name/level/step dos analistas no Firestore.
// Uso: node scripts/dump_analysts.js
var admin = require('../functions/node_modules/firebase-admin');
var key = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(key) });
var db = admin.firestore();

db.collection('appData').doc('analysts').collection('items').get().then(function(snap) {
  var rows = [];
  snap.forEach(function(d) {
    var a = d.data();
    rows.push({ id: a.id, name: a.name, level: a.level, step: a.step });
  });
  rows.sort(function(x, y) { return String(x.name).localeCompare(String(y.name)); });
  console.log('Total analistas na nuvem:', rows.length);
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}).catch(function(e) { console.error('ERRO:', e.message); process.exit(1); });
