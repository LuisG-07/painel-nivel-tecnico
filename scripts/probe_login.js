/**
 * Sonda de diagnostico: abre localhost:3000 num Chrome real, clica em
 * "Entrar com Google" e captura o ERRO DE REDE exato (net::ERR_...) da
 * requisicao ao googleapis. Nao completa o login — so precisa da falha.
 * Uso: node scripts/probe_login.js
 */
const { chromium } = require('playwright-core');

(async () => {
  const failures = [];
  const consoles = [];

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch (e) {
    console.log('Nao consegui abrir o Chrome do sistema (' + e.message + '). Tentando Edge...');
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  }

  const page = await browser.newPage();

  page.on('requestfailed', (req) => {
    const u = req.url();
    if (/googleapis\.com|firebaseapp\.com|google\.com/.test(u)) {
      failures.push(u.slice(0, 90) + '  ->  ' + (req.failure() && req.failure().errorText));
    }
  });
  page.on('response', (res) => {
    const u = res.url();
    if (/identitytoolkit|firestore\.googleapis/.test(u)) {
      consoles.push('RESP ' + res.status() + ' ' + u.slice(0, 90));
    }
  });
  page.on('console', (msg) => {
    const t = msg.text();
    if (/googleapis|net::ERR|firebase|fetch/i.test(t)) consoles.push('CONSOLE: ' + t.slice(0, 200));
  });

  await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Clica no botao de login (dispara a chamada ao identitytoolkit).
  try {
    await page.click('#authGoogleBtn', { timeout: 5000 });
  } catch (e) {
    consoles.push('(nao achei o botao #authGoogleBtn: ' + e.message + ')');
  }
  await page.waitForTimeout(6000);

  console.log('\n=== FALHAS DE REDE (googleapis/google) ===');
  console.log(failures.length ? failures.join('\n') : '(nenhuma falha capturada)');
  console.log('\n=== RESPOSTAS / CONSOLE ===');
  console.log(consoles.length ? consoles.join('\n') : '(nada)');
  console.log('');

  await browser.close();
  process.exit(0);
})().catch((e) => { console.error('ERRO na sonda:', e.message); process.exit(1); });
