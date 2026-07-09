// Cloud Function — proxy do Zendesk (porta do /zdproxy do server.js)
// Faz a ponte navegador → Zendesk para evitar bloqueio CORS, na versão WEB.
// Localmente o mesmo papel é feito pelo Express (server.js).
//
// Rota (via Hosting rewrite): /zdproxy/<subdominio>/<caminho-da-api>?<query>
//   ou para imagens de CDN:   /zdproxy/<subdominio>?url=<url-encodada>
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
if (!admin.apps.length) admin.initializeApp();

// Credenciais do Zendesk no formato "email/token:apitoken" (o base64 e aplicado
// aqui no servidor). Definir com: firebase functions:secrets:set ZENDESK_AUTH
const ZENDESK_AUTH = defineSecret('ZENDESK_AUTH');

const SUB_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$/;

exports.zdproxy = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, cors: false, secrets: [ZENDESK_AUTH] },
  async (req, res) => {
    try {
      var m = req.path.match(/^\/zdproxy\/([^/?]+)(\/.*)?$/);
      if (!m) { res.status(400).json({ error: 'Rota inválida.' }); return; }
      var subdomain = m[1];
      if (!SUB_RE.test(subdomain)) { res.status(400).json({ error: 'Subdomínio inválido.' }); return; }
      var restPath = m[2] || '/';

      // Autenticacao: exige usuario LOGADO (token do Firebase) e AUTORIZADO (allowlist).
      // Sem isso o proxy ficaria aberto na internet usando o token do Zendesk.
      var authz = req.headers.authorization || '';
      if (authz.indexOf('Bearer ') !== 0) { res.status(401).json({ error: 'Nao autenticado.' }); return; }
      var email;
      try {
        var decoded = await admin.auth().verifyIdToken(authz.slice(7));
        email = (decoded.email || '').toLowerCase();
      } catch (e) { res.status(401).json({ error: 'Token invalido ou expirado.' }); return; }
      var allow = await admin.firestore().collection('allowedUsers').doc(email).get();
      if (!allow.exists) { res.status(403).json({ error: 'E-mail sem acesso.' }); return; }

      var urlParam = req.query.url;
      if (Array.isArray(urlParam)) urlParam = urlParam[0];

      var original = req.originalUrl || req.url || '';
      var qi = original.indexOf('?');
      var rawQuery = qi >= 0 ? original.slice(qi + 1) : '';

      var target = urlParam
        ? urlParam
        : ('https://' + subdomain + '.zendesk.com' + restPath + (rawQuery ? '?' + rawQuery : ''));

      var isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(target);
      var headers = { 'User-Agent': 'Mozilla/5.0' };
      if (!isImage) {
        // Autenticacao do Zendesk vem do SECRET do servidor (nunca do cliente).
        var cred = ZENDESK_AUTH.value(); // "email/token:apitoken"
        if (cred) headers['Authorization'] = 'Basic ' + Buffer.from(cred).toString('base64');
        headers['Accept'] = 'application/json';
      }

      var r = await fetch(target, { headers: headers }); // fetch global (Node 20) trata gzip
      var buf = Buffer.from(await r.arrayBuffer());

      res.status(r.status);
      res.setHeader('Content-Type', r.headers.get('content-type') || (isImage ? 'image/jpeg' : 'application/json; charset=utf-8'));
      res.setHeader('Access-Control-Allow-Origin', '*');
      // So cacheia imagens que deram certo. API e erros (ex.: 429) NUNCA cacheiam,
      // senao o CDN do Hosting passa a servir o 429/dados antigos por 24h.
      res.setHeader('Cache-Control', (isImage && r.ok) ? 'public, max-age=86400' : 'no-store');
      if (r.headers.get('retry-after')) res.setHeader('Retry-After', r.headers.get('retry-after'));
      res.send(buf);
    } catch (err) {
      res.status(502).json({ error: String((err && err.message) || err) });
    }
  }
);
