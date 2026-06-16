const express = require('express');
const https   = require('https');
const zlib    = require('zlib');
const path    = require('path');
const jwt     = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ZD_EMAIL   = process.env.ZENDESK_EMAIL   || '';
const ZD_TOKEN   = process.env.ZENDESK_TOKEN   || '';

// Usuários (env: USERS=email1:senha1,email2:senha2)
function getUsers() {
  const raw = process.env.USERS || '';
  const users = {};
  raw.split(',').forEach(entry => {
    const [email, ...rest] = entry.trim().split(':');
    if (email) users[email.toLowerCase()] = rest.join(':');
  });
  return users;
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email e senha obrigatórios.' });

  const users = getUsers();
  const stored = users[email.toLowerCase()];
  if (!stored || stored !== password)
    return res.status(401).json({ error: 'Email ou senha incorretos.' });

  const token = jwt.sign({ email: email.toLowerCase() }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, email: email.toLowerCase() });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email });
});

function requireAuth(req, res, next) {
  const auth = (req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada, faça login novamente.' });
  }
}

// ── Zendesk Proxy ─────────────────────────────────────────────────────────────
// Browser envia JWT — servidor adiciona credenciais Zendesk (nunca expostas ao browser)
app.use('/zdproxy/:subdomain', requireAuth, (req, res) => {
  const { subdomain } = req.params;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$/.test(subdomain))
    return res.status(400).json({ error: 'Subdomínio inválido.' });

  const zdAuth = 'Basic ' + Buffer.from(`${ZD_EMAIL}/token:${ZD_TOKEN}`).toString('base64');
  const target = `https://${subdomain}.zendesk.com${req.url}`;

  https.get(target, {
    headers: { Authorization: zdAuth, Accept: 'application/json', 'Accept-Encoding': 'gzip' }
  }, proxyRes => {
    const isGzip = (proxyRes.headers['content-encoding'] || '').includes('gzip');
    res.status(proxyRes.statusCode);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const stream = isGzip ? proxyRes.pipe(zlib.createGunzip()) : proxyRes;
    const chunks = [];
    stream.on('data',  c => chunks.push(c));
    stream.on('end',   () => res.send(Buffer.concat(chunks)));
    stream.on('error', () => res.status(502).json({ error: 'Erro no proxy Zendesk.' }));
  }).on('error', err => res.status(502).json({ error: err.message }));
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Painel de Nível Técnico → http://localhost:${PORT}`);
});
