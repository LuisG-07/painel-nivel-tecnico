// Uso: node scripts/add_auth_domain.js <projectId> <domain>
// Adiciona um dominio a lista de "Authorized domains" do Firebase Authentication
// via Identity Toolkit Admin API, usando o refresh token do Firebase CLI.
var fs    = require('fs');
var path  = require('path');
var https = require('https');

var PROJECT = process.argv[2];
var DOMAIN  = process.argv[3];
if (!PROJECT || !DOMAIN) { console.error('args: <projectId> <domain>'); process.exit(1); }

// Credenciais OAuth publicas do firebase-tools (embutidas no CLI open-source)
var CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
var CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

var cfgPath = path.join(process.env.USERPROFILE || process.env.HOME, '.config', 'configstore', 'firebase-tools.json');
var cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
var refresh = cfg.tokens && cfg.tokens.refresh_token;
if (!refresh) { console.error('refresh_token nao encontrado em ' + cfgPath); process.exit(1); }

function req(opts, body) {
  return new Promise(function(resolve, reject) {
    var r = https.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: d }); });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function getAccessToken() {
  var form = 'client_id=' + encodeURIComponent(CLIENT_ID) +
             '&client_secret=' + encodeURIComponent(CLIENT_SECRET) +
             '&refresh_token=' + encodeURIComponent(refresh) +
             '&grant_type=refresh_token';
  return req({
    method: 'POST', host: 'oauth2.googleapis.com', path: '/token',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) }
  }, form).then(function(r) {
    var j = JSON.parse(r.body);
    if (!j.access_token) throw new Error('falha ao obter access_token: ' + r.body);
    return j.access_token;
  });
}

function getConfig(token) {
  return req({
    method: 'GET', host: 'identitytoolkit.googleapis.com',
    path: '/admin/v2/projects/' + PROJECT + '/config',
    headers: { 'Authorization': 'Bearer ' + token }
  }).then(function(r) {
    if (r.status !== 200) throw new Error('GET config ' + r.status + ': ' + r.body);
    return JSON.parse(r.body);
  });
}

function patchDomains(token, domains) {
  var body = JSON.stringify({ authorizedDomains: domains });
  return req({
    method: 'PATCH', host: 'identitytoolkit.googleapis.com',
    path: '/admin/v2/projects/' + PROJECT + '/config?updateMask=authorizedDomains',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, body).then(function(r) {
    if (r.status !== 200) throw new Error('PATCH ' + r.status + ': ' + r.body);
    return JSON.parse(r.body);
  });
}

getAccessToken().then(function(token) {
  return getConfig(token).then(function(conf) {
    var domains = (conf.authorizedDomains || []).slice();
    console.log('Dominios atuais:', domains.join(', '));
    if (domains.indexOf(DOMAIN) !== -1) {
      console.log('Ja autorizado: ' + DOMAIN + ' — nada a fazer.');
      return;
    }
    domains.push(DOMAIN);
    return patchDomains(token, domains).then(function(res) {
      console.log('OK. Dominios agora:', (res.authorizedDomains || []).join(', '));
    });
  });
}).catch(function(e) { console.error('ERRO:', e.message); process.exit(1); });
