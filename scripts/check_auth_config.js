/**
 * Diagnostico: consulta a config de Authentication do projeto (Identity Platform)
 * usando a chave de servico. Mostra provedores habilitados e dominios autorizados.
 * Uso: node scripts/check_auth_config.js
 */
const { initializeApp, cert } = require('firebase-admin/app');
const sa = require('../serviceAccountKey.json');

async function main() {
  const credential = cert(sa);
  initializeApp({ credential });
  const tok = await credential.getAccessToken();
  const token = tok.access_token;
  const proj = sa.project_id;
  const H = { Authorization: 'Bearer ' + token };

  // 1) Config geral (dominios autorizados, etc.)
  const cfgUrl = 'https://identitytoolkit.googleapis.com/admin/v2/projects/' + proj + '/config';
  const cfgRes = await fetch(cfgUrl, { headers: H });
  const cfg = await cfgRes.json();
  console.log('\n=== CONFIG (HTTP ' + cfgRes.status + ') ===');
  console.log('Dominios autorizados:', JSON.stringify((cfg.authorizedDomains) || cfg));

  // 2) Provedores IdP (google.com etc.)
  const idpUrl = 'https://identitytoolkit.googleapis.com/v2/projects/' + proj + '/defaultSupportedIdpConfigs';
  const idpRes = await fetch(idpUrl, { headers: H });
  const idp = await idpRes.json();
  console.log('\n=== PROVEDORES (HTTP ' + idpRes.status + ') ===');
  const list = idp.defaultSupportedIdpConfigs || [];
  if (!list.length) {
    console.log('NENHUM provedor configurado!', JSON.stringify(idp));
  } else {
    list.forEach(function(p) {
      console.log('  ' + (p.name || '').split('/').pop() +
        ' | enabled=' + p.enabled +
        ' | clientId=' + (p.clientId ? (p.clientId.slice(0, 18) + '...') : 'VAZIO') +
        ' | secret=' + (p.clientSecret ? 'presente' : 'VAZIO'));
    });
  }
  console.log('');
  process.exit(0);
}

main().catch(function(e) { console.error('ERRO:', e.message || e); process.exit(1); });
