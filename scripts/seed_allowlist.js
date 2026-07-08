/**
 * Semeia a colecao `allowedUsers` no Firestore — a LISTA DE ACESSO do painel.
 * Login e feito com Google, mas so estes e-mails conseguem entrar/usar.
 *
 * Cada doc: allowedUsers/{email} = { email, role, admin, addedAt }
 *   - role 'admin' (gustavo) libera a tela de admin e a leitura dos logs.
 *
 * Idempotente (merge). Uso:  node scripts/seed_allowlist.js
 * Requer serviceAccountKey.json na raiz (NUNCA commitar).
 */
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../serviceAccountKey.json');

const ADMIN = 'gustavo@clickdigital.com.br';
const EMAILS = [
  'gustavo@clickdigital.com.br',
  'lucas.paixao@clickdigital.com.br',
  'ariane@clickdigital.com.br',
  'carine.melo@clickdigital.com.br',
  'lucas@clickdigital.com.br',
  'marcos.miranda@clickdigital.com.br',
  'polyana.ventura@clickdigital.com.br',
];

async function main() {
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  for (const raw of EMAILS) {
    const email = raw.trim().toLowerCase();
    const isAdmin = email === ADMIN.toLowerCase();
    await db.collection('allowedUsers').doc(email).set({
      email,
      role: isAdmin ? 'admin' : 'member',
      admin: isAdmin,
      addedAt: new Date().toISOString(),
    }, { merge: true });
    console.log((isAdmin ? '[ADMIN] ' : '        ') + email);
  }

  console.log('\nOK — ' + EMAILS.length + ' e-mails na allowlist (colecao allowedUsers).');
  process.exit(0);
}

main().catch((e) => { console.error('ERRO:', e.message || e); process.exit(1); });
