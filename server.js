const express = require('express');
const https = require('https');
const zlib = require('zlib');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Proxy para Zendesk API e imagens
app.use('/zdproxy/:subdomain', (req, res) => {
  const { subdomain } = req.params;

  // Valida subdomínio
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]{0,61}[a-zA-Z0-9]?$/.test(subdomain)) {
    return res.status(400).json({ error: 'Subdomínio inválido.' });
  }

  // Lê credenciais do localStorage do cliente
  const authHeader = req.headers.authorization || '';

  // Se for URL de imagem (contém /images/ ou extensão de imagem), redireciona direto
  const url = req.url;
  let target;

  // Verifica se tem parâmetro 'url' (para imagens de CDN)
  const urlParam = new URL(req.url, `http://${req.hostname}`).searchParams.get('url');

  if (urlParam) {
    // URL passada como parâmetro (imagens de CDN)
    target = urlParam;
  } else if (url.includes('.zendesk.com/') || url.startsWith('http')) {
    // URL completa (de CDN), usa direto sem proxy
    target = url;
  } else {
    // URL relativa, monta com o subdomínio
    target = `https://${subdomain}.zendesk.com${url}`;
  }

  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(target);

  // Para imagens, não precisa de Auth (CDN público)
  const headers = {
    'Accept-Encoding': 'gzip',
    'User-Agent': 'Mozilla/5.0'
  };

  // Se tiver auth e for API, adiciona
  if (authHeader && !isImage) {
    headers['Authorization'] = authHeader;
    headers['Accept'] = 'application/json';
  }

  https.get(target, { headers }, proxyRes => {
    const isGzip = (proxyRes.headers['content-encoding'] || '').includes('gzip');
    res.status(proxyRes.statusCode);

    // Define Content-Type apropriado
    const contentType = proxyRes.headers['content-type'] || (isImage ? 'image/jpeg' : 'application/json; charset=utf-8');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = isGzip ? proxyRes.pipe(zlib.createGunzip()) : proxyRes;
    const chunks = [];
    stream.on('data',  c => chunks.push(c));
    stream.on('end',   () => res.send(Buffer.concat(chunks)));
    stream.on('error', () => res.status(502).json({ error: 'Erro ao baixar recurso.' }));
  }).on('error', err => res.status(502).json({ error: err.message }));
});

// SPA fallback
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`✓ SkillMatrix Pro → http://localhost:${PORT}`);
});
