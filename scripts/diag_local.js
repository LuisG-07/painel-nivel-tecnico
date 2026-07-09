const { chromium } = require('playwright-core');
(async () => {
  const logs = [];
  let b;
  try { b = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { b = await chromium.launch({ channel: 'msedge', headless: true }); }
  const p = await b.newPage();
  p.on('console', m => { if (/error|fail|undefined|not a function|null/i.test(m.text())) logs.push('CONSOLE: ' + m.text().slice(0,200)); });
  p.on('pageerror', e => logs.push('PAGEERROR: ' + (e.message||e).slice(0,200)));
  p.on('requestfailed', r => logs.push('REQFAIL: ' + r.url().slice(0,80) + ' ' + (r.failure()&&r.failure().errorText)));
  try {
    const resp = await p.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded', timeout: 15000 });
    logs.push('HTTP status: ' + (resp && resp.status()));
    await p.waitForTimeout(3500);
    const hasOverlay = await p.$('#authOverlay');
    const bodyLen = (await p.content()).length;
    logs.push('authOverlay presente: ' + !!hasOverlay + ' | tamanho DOM: ' + bodyLen);
  } catch (e) { logs.push('GOTO ERRO: ' + e.message); }
  console.log(logs.join('\n') || '(sem erros capturados)');
  await b.close(); process.exit(0);
})().catch(e => { console.error('ERRO sonda:', e.message); process.exit(1); });
