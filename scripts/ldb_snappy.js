// Leitor minimo de SSTable (LevelDB) + descompressao Snappy em JS puro.
// Objetivo: descomprimir os data blocks de um .ldb e extrair arrays JSON de
// analistas ([{"id":...,"scores":...}]) do conteudo ja descomprimido.
// Uso: node scripts/ldb_snappy.js <arquivo.ldb>
var fs = require('fs');
var file = process.argv[2];
if (!file) { console.error('informe o .ldb'); process.exit(1); }
var buf = fs.readFileSync(file);

// --- Snappy decompress (formato: preamble varint + literals/copies) ---------
function snappyUncompress(input) {
  var pos = 0;
  // preamble: tamanho descomprimido (varint)
  var len = 0, shift = 0, b;
  do { b = input[pos++]; len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  var out = Buffer.alloc(len);
  var op = 0;
  while (pos < input.length) {
    var tag = input[pos++];
    var t = tag & 0x03;
    if (t === 0) { // literal
      var l = tag >> 2;
      if (l < 60) { l += 1; }
      else {
        var bytes = l - 59, val = 0;
        for (var i = 0; i < bytes; i++) val |= input[pos++] << (8 * i);
        l = val + 1;
      }
      input.copy(out, op, pos, pos + l);
      pos += l; op += l;
    } else { // copy
      var offset, length;
      if (t === 1) {
        length = ((tag >> 2) & 0x07) + 4;
        offset = ((tag >> 5) << 8) | input[pos++];
      } else if (t === 2) {
        length = (tag >> 2) + 1;
        offset = input[pos] | (input[pos + 1] << 8); pos += 2;
      } else {
        length = (tag >> 2) + 1;
        offset = input[pos] | (input[pos + 1] << 8) | (input[pos + 2] << 16) | (input[pos + 3] << 24); pos += 4;
      }
      for (var k = 0; k < length; k++) { out[op] = out[op - offset]; op++; }
    }
  }
  return out;
}

// --- varint helper -----------------------------------------------------------
function readVarint(b, p) {
  var res = 0, shift = 0, byte;
  do { byte = b[p.i++]; res += (byte & 0x7f) * Math.pow(2, shift); shift += 7; } while (byte & 0x80);
  return res;
}

// --- Footer: ultimos 48 bytes. index_handle = 2o BlockHandle ----------------
var FOOTER = 48;
var foot = buf.slice(buf.length - FOOTER);
var p = { i: 0 };
readVarint(foot, p); readVarint(foot, p);           // metaindex handle (ignora)
var idxOff = readVarint(foot, p);
var idxSize = readVarint(foot, p);

function readBlock(offset, size) {
  var raw = buf.slice(offset, offset + size);
  var type = buf[offset + size]; // 0=none 1=snappy
  if (type === 1) { try { return snappyUncompress(raw); } catch (e) { return null; } }
  return raw;
}

// Percorre um block extraindo pares (key,value). Retorna lista de values (Buffer).
function parseBlockValues(block) {
  if (!block) return [];
  // ultimos 4 bytes = num_restarts; entradas vao ate o array de restarts.
  var numRestarts = block.readUInt32LE(block.length - 4);
  var restartsStart = block.length - 4 - numRestarts * 4;
  var pp = { i: 0 };
  var values = [];
  var prevKey = Buffer.alloc(0);
  while (pp.i < restartsStart) {
    var shared = readVarint(block, pp);
    var nonShared = readVarint(block, pp);
    var valLen = readVarint(block, pp);
    var keyDelta = block.slice(pp.i, pp.i + nonShared); pp.i += nonShared;
    var key = Buffer.concat([prevKey.slice(0, shared), keyDelta]);
    prevKey = key;
    var val = block.slice(pp.i, pp.i + valLen); pp.i += valLen;
    values.push(val);
  }
  return values;
}

// index block: cada value = BlockHandle {offset,size} do data block
var indexBlock = readBlock(idxOff, idxSize);
var handles = parseBlockValues(indexBlock);

var found = [];
handles.forEach(function(h) {
  var hp = { i: 0 };
  var off = readVarint(h, hp);
  var sz = readVarint(h, hp);
  var data = readBlock(off, sz);
  if (!data) return;
  // procura arrays de analistas no bloco descomprimido
  var s = data.toString('utf8');
  var re = /\[\{"id":/g, m;
  while ((m = re.exec(s)) !== null) {
    var start = m.index, depth = 0, inStr = false, esc = false, end = -1;
    for (var i = start; i < s.length; i++) {
      var c = s[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    try {
      var arr = JSON.parse(s.slice(start, end + 1));
      if (Array.isArray(arr) && arr[0] && arr[0].scores) found.push(arr);
    } catch (e) {}
  }
});

console.log('Arrays de analistas recuperados (descomprimidos):', found.length);
found.forEach(function(arr, i) {
  var nonDef = arr.filter(function(a){ return (a.level && a.level!=='Júnior')||(a.step&&a.step!==1); });
  console.log('\n===== Versao #' + i + ' — ' + arr.length + ' analistas, ' + nonDef.length + ' com cargo/step != padrao =====');
  arr.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name));}).forEach(function(a){
    var flag = ((a.level&&a.level!=='Júnior')||(a.step&&a.step!==1))?'   <<<':'';
    console.log('  '+String(a.name).padEnd(22)+' | '+String(a.level||'-').padEnd(8)+' | step '+(a.step!=null?a.step:'-')+flag);
  });
});
