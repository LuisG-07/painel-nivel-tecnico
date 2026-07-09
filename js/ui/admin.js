// Pagina de Administracao (visivel so para admin): controle de usuarios + logs.
// ─────────────────────────────────────────────────────────────────────────────
var UIAdmin = (function() {
  var esc = Domain.escapeHtml;
  function db() { return window.firebase.firestore(); }

  var INPUT = 'padding:9px 11px;border:1px solid var(--border);border-radius:8px;' +
    'background:#fff;color:var(--ink);font-family:inherit;font-size:13px';

  function render() {
    var el = document.getElementById('page-admin');
    if (!el) return;
    el.innerHTML =
      '<div style="font-size:20px;font-weight:700;color:var(--ink);margin-bottom:18px;letter-spacing:-.3px">Administração</div>' +

      '<div class="evo-card">' +
        '<div class="sectitle"><i class="ti ti-users"></i> Controle de usuários</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">' +
          '<input id="admNewEmail" type="email" placeholder="email@clickdigital.com.br" style="flex:1;min-width:230px;' + INPUT + '">' +
          '<label style="font-size:13px;color:var(--muted);display:flex;align-items:center;gap:6px;cursor:pointer">' +
            '<input type="checkbox" id="admNewAdmin"> admin</label>' +
          '<button class="btn-primary" onclick="UIAdmin.addUser()"><i class="ti ti-plus"></i> Adicionar</button>' +
        '</div>' +
        '<div id="admUsers" style="font-size:13px;color:var(--muted)">Carregando…</div>' +
      '</div>' +

      '<div class="evo-card">' +
        '<div class="sectitle" style="justify-content:space-between">' +
          '<span style="display:flex;align-items:center;gap:8px"><i class="ti ti-history"></i> Logs de auditoria</span>' +
          '<button class="edit-btn" onclick="UIAdmin.refreshLogs()"><i class="ti ti-refresh"></i> Atualizar</button></div>' +
        '<div id="admLogs" style="font-size:13px;color:var(--muted)">Carregando…</div>' +
      '</div>';

    loadUsers();
    refreshLogs();
  }

  // --- Usuarios --------------------------------------------------------------
  function loadUsers() {
    var box = document.getElementById('admUsers');
    if (!box) return;
    db().collection('allowedUsers').get().then(function(snap) {
      var rows = [];
      snap.forEach(function(d) { rows.push(d.data()); });
      rows.sort(function(a, b) {
        return (isAdminRow(b) ? 1 : 0) - (isAdminRow(a) ? 1 : 0) ||
          (a.email || '').localeCompare(b.email || '');
      });
      if (!rows.length) { box.innerHTML = 'Nenhum usuário cadastrado.'; return; }
      box.innerHTML =
        '<table class="tbl"><thead><tr><th>E-mail</th><th>Papel</th><th style="text-align:right">Ações</th></tr></thead><tbody>' +
        rows.map(function(u) {
          var adm = isAdminRow(u);
          var em = (u.email || '').replace(/'/g, '');
          return '<tr><td>' + esc(u.email || '') + '</td>' +
            '<td>' + (adm ? '<span class="bc">admin</span>' : '<span style="color:var(--muted)">membro</span>') + '</td>' +
            '<td style="text-align:right;white-space:nowrap">' +
              '<button class="edit-btn" onclick="UIAdmin.toggleAdmin(\'' + esc(em) + '\',' + (adm ? 'false' : 'true') + ')">' +
                (adm ? 'tornar membro' : 'tornar admin') + '</button> ' +
              '<button class="edit-btn" style="color:var(--red)" onclick="UIAdmin.removeUser(\'' + esc(em) + '\')">remover</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(function(e) {
      box.innerHTML = '<span style="color:var(--red)">Erro ao carregar usuários: ' + esc((e && e.message) || '') + '</span>';
    });
  }

  function isAdminRow(u) { return u && (u.role === 'admin' || u.admin === true); }

  function addUser() {
    var emailEl = document.getElementById('admNewEmail');
    var adminEl = document.getElementById('admNewAdmin');
    var email = (emailEl.value || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { alert('E-mail inválido.'); return; }
    var makeAdmin = !!adminEl.checked;
    db().collection('allowedUsers').doc(email).set({
      email: email, role: makeAdmin ? 'admin' : 'member', admin: makeAdmin,
      addedAt: new Date().toISOString()
    }, { merge: true }).then(function() {
      if (window.Audit) Audit.log('Adicionou usuário', email + (makeAdmin ? ' (admin)' : ''));
      emailEl.value = ''; adminEl.checked = false;
      loadUsers();
    }).catch(function(e) { alert('Erro ao adicionar: ' + ((e && e.message) || e)); });
  }

  function removeUser(email) {
    if (!confirm('Remover o acesso de ' + email + '?')) return;
    db().collection('allowedUsers').doc(email).delete().then(function() {
      if (window.Audit) Audit.log('Removeu usuário', email);
      loadUsers();
    }).catch(function(e) { alert('Erro ao remover: ' + ((e && e.message) || e)); });
  }

  function toggleAdmin(email, makeAdmin) {
    db().collection('allowedUsers').doc(email).set(
      { role: makeAdmin ? 'admin' : 'member', admin: makeAdmin }, { merge: true }
    ).then(function() {
      if (window.Audit) Audit.log('Alterou papel', email + ' → ' + (makeAdmin ? 'admin' : 'membro'));
      loadUsers();
    }).catch(function(e) { alert('Erro: ' + ((e && e.message) || e)); });
  }

  // --- Logs ------------------------------------------------------------------
  function refreshLogs() {
    var box = document.getElementById('admLogs');
    if (!box || !window.Audit) return;
    box.innerHTML = 'Carregando…';
    Audit.recent(200).then(function(logs) {
      if (!logs.length) { box.innerHTML = 'Nenhum registro ainda.'; return; }
      box.innerHTML =
        '<table class="tbl"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>' +
        logs.map(function(l) {
          var when = (l.at && l.at.toDate) ? l.at.toDate().toLocaleString('pt-BR')
            : (l.atISO ? new Date(l.atISO).toLocaleString('pt-BR') : '—');
          return '<tr><td style="white-space:nowrap">' + esc(when) + '</td>' +
            '<td>' + esc(l.email || '') + '</td>' +
            '<td>' + esc(l.action || '') + '</td>' +
            '<td>' + esc(l.details || '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(function(e) {
      box.innerHTML = '<span style="color:var(--red)">Erro ao carregar logs: ' + esc((e && e.message) || '') + '</span>';
    });
  }

  return {
    render: render,
    addUser: addUser,
    removeUser: removeUser,
    toggleAdmin: toggleAdmin,
    refreshLogs: refreshLogs
  };
})();
