// Auditoria — registra "quem fez o que, quando" na colecao Firestore auditLogs.
// ─────────────────────────────────────────────────────────────────────────────
// Regras (ver firestore.rules): qualquer usuario autorizado pode CRIAR um log;
// somente admin pode LER. Logs sao imutaveis (sem update/delete).
var Audit = (function() {
  function fb() { return window.firebase; }
  function db() { return fb().firestore(); }

  function currentEmail() {
    try {
      var u = (window.Auth && Auth.getUser) ? Auth.getUser() : null;
      return u ? (u.email || '') : '';
    } catch (e) { return ''; }
  }

  // Registra uma acao. Retorna a promessa da escrita (resolve mesmo em falha,
  // para nunca atrapalhar o fluxo de quem chamou).
  function log(action, details) {
    var email = currentEmail();
    if (!email || !window.firebase) return Promise.resolve();
    try {
      return db().collection('auditLogs').add({
        email:   email,
        action:  String(action || '').slice(0, 60),
        details: String(details == null ? '' : details).slice(0, 300),
        at:      new Date(),                 // Firestore converte JS Date -> Timestamp
        atISO:   new Date().toISOString()
      }).catch(function (e) {
        try { console.error('AUDIT WRITE FAIL >>>', e && (e.code || e.message), e); } catch (_) {}
      });
    } catch (e) {
      try { console.error('AUDIT WRITE FAIL (sync) >>>', e); } catch (_) {}
      return Promise.resolve();
    }
  }

  // Registra uma tentativa de login NEGADA (usuario autenticou no Google mas nao
  // esta na allowlist). Grava com o e-mail explicito da tentativa, pois o app
  // ainda nao considerou esse usuario logado. A regra permite este caso especifico.
  function logDenied(email) {
    email = (email || '').trim();
    if (!email || !window.firebase) return Promise.resolve();
    try {
      return db().collection('auditLogs').add({
        email:   email,
        action:  'Login negado',
        details: 'Conta fora da lista de acesso',
        at:      new Date(),
        atISO:   new Date().toISOString()
      }).catch(function (e) { try { console.error('AUDIT DENIED FAIL >>>', e); } catch (_) {} });
    } catch (e) { return Promise.resolve(); }
  }

  // Le os logs mais recentes (so admin consegue — regra do Firestore).
  function recent(max) {
    return db().collection('auditLogs').orderBy('at', 'desc').limit(max || 200).get()
      .then(function(snap) {
        var arr = [];
        snap.forEach(function(d) { arr.push(d.data()); });
        return arr;
      });
  }

  return { log: log, logDenied: logDenied, recent: recent };
})();
