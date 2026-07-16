// Recupera todas as versoes de skm6_ana de um arquivo LevelDB (localStorage).
// O valor e' armazenado em UTF-8/Latin-1 (JSON legivel). Uso:
//   node scripts/recover_levels.js <arquivo.ldb>
var fs = require('fs');
var file = process.argv[2];
if (!file) { console.error('informe o arquivo ldb'); process.exit(1); }

var buf = fs.readFileSync(file);
var key = Buffer.from('skm6_ana', 'latin1');

// Extrai um array JSON balanceado a partir de um offset de '[' (bytes UTF-8).
function extractArray(startByte) {
  var depth = 0, inStr = false, esc = false;
  for (var i = startByte; i < buf.length; i++) {
    var c = buf[i];
    if (esc) { esc = false; continue; }
    if (c === 0x5C) { esc = true; continue; }      // backslash
    if (c === 0x22) { inStr = !inStr; continue; }   // quote
    if (inStr) continue;
    if (c === 0x5B) depth++;                         // [
    else if (c === 0x5D) {                           // ]
      depth--;
      if (depth === 0) return buf.slice(startByte, i + 1).toString('utf8');
    }
    // limite de seguranca
    if (i - startByte > 5000000) break;
  }
  return null;
}

// Varre o buffer inteiro pelo padrao exato de inicio de array de analistas.
var pat = Buffer.from('[{"id":', 'latin1');
var blobs = [];
var idx = 0;
while ((idx = buf.indexOf(pat, idx)) !== -1) {
  var json = extractArray(idx);
  if (json) {
    try {
      var arr = JSON.parse(json);
      if (Array.isArray(arr) && arr.length && arr[0] && arr[0].scores) {
        blobs.push({ keyOffset: idx, count: arr.length, data: arr });
      }
    } catch (e) { /* truncado/lixo */ }
  }
  idx += 1;
}

console.log('Versoes de skm6_ana recuperadas:', blobs.length);
blobs.forEach(function(r, i) {
  var nonDef = r.data.filter(function(a) {
    return (a.level && a.level !== 'Júnior') || (a.step && a.step !== 1);
  });
  console.log('\n===== Versao #' + i + ' (offset ' + r.keyOffset + ') — ' + r.count +
    ' analistas, ' + nonDef.length + ' com cargo/step != padrao =====');
  r.data.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name));}).forEach(function(a) {
    var flag = ((a.level && a.level !== 'Júnior') || (a.step && a.step !== 1)) ? '   <<<' : '';
    console.log('  ' + String(a.name).padEnd(22) + ' | ' + String(a.level || '-').padEnd(8) +
      ' | step ' + (a.step != null ? a.step : '-') + flag);
  });
});
