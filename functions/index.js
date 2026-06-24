// Cloud Function — proxy do Zendesk (porta do /zdproxy do server.js)
// Faz a ponte navegador → Zendesk para evitar bloqueio CORS, na versão WEB.
// Localmente o mesmo papel é feito pelo Express (server.js).
//
// Rota (via Hosting rewrite): /zdproxy/<subdominio>/<caminho-da-api>?<query>
//   ou para imagens de CDN:   /zdproxy/<subdominio>?url=<url-encodada>
const { onRequest } = require('firebase-functions/v2/https');

const SUB_RE = /^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$/;

exports.zdproxy = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 120, cors: false },
  async (req, res) => {
    try {
      var m = req.path.match(/^\/zdproxy\/([^/?]+)(\/.*)?$/);
      if (!m) { res.status(400).json({ error: 'Rota inválida.' }); return; }
      var subdomain = m[1];
      if (!SUB_RE.test(subdomain)) { res.status(400).json({ error: 'Subdomínio inválido.' }); return; }
      var restPath = m[2] || '/';

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
      var authHeader = req.headers.authorization || '';
      if (authHeader && !isImage) {
        headers['Authorization'] = authHeader;
        headers['Accept'] = 'application/json';
      }

      var r = await fetch(target, { headers: headers }); // fetch global (Node 20) trata gzip
      var buf = Buffer.from(await r.arrayBuffer());

      res.status(r.status);
      res.setHeader('Content-Type', r.headers.get('content-type') || (isImage ? 'image/jpeg' : 'application/json; charset=utf-8'));
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      if (r.headers.get('retry-after')) res.setHeader('Retry-After', r.headers.get('retry-after'));
      res.send(buf);
    } catch (err) {
      res.status(502).json({ error: String((err && err.message) || err) });
    }
  }
);
