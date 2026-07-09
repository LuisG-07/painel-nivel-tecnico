const { chromium } = require('playwright-core');
(async () => {
  let b;
  try { b = await chromium.launch({ channel: 'chrome', headless: true }); }
  catch (e) { b = await chromium.launch({ channel: 'msedge', headless: true }); }
  const p = await b.newPage({ viewport: { width: 900, height: 700 } });
  await p.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForSelector('#authOverlay', { timeout: 8000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'scripts/login_shot.png' });
  console.log('screenshot salvo em scripts/login_shot.png');
  await b.close();
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
