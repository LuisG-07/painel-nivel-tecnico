// Autenticacao — Login com Google + allowlist (colecao Firestore allowedUsers).
// ─────────────────────────────────────────────────────────────────────────────
// Fluxo: Auth.start() e chamado no lugar de App.init().
//   1. Inicializa o Firebase (config em js/firebase/firebase-config.js).
//   2. Mostra a tela de login (botao Google) enquanto ninguem esta logado.
//   3. Ao logar, confere se o e-mail esta na allowlist:
//        - esta  -> entra no painel (App.init()).
//        - nao   -> desloga e avisa "sem acesso".
// A seguranca real vem das regras do Firestore; esta tela e a camada de UX.
var Auth = (function() {
  var _user = null;
  var _isAdmin = false;
  var _started = false;

  // --- Firebase ---------------------------------------------------------------
  function fb() { return window.firebase; }

  function initFirebase() {
    if (!fb() || !window.FIREBASE_CONFIG) {
      showError('Falha ao carregar o Firebase. Verifique a conexao e recarregue.');
      return false;
    }
    if (!fb().apps.length) fb().initializeApp(window.FIREBASE_CONFIG);
    return true;
  }

  // --- Overlay (tela de login / carregamento) --------------------------------
  function ensureOverlay() {
    if (document.getElementById('authOverlay')) return;

    var style = document.createElement('style');
    style.textContent =
      '#authOverlay{position:fixed;inset:0;z-index:9999;padding:24px;' +
        'background:radial-gradient(1100px 620px at 50% -8%,#0b3f86 0%,#001a40 48%,#000c22 100%);' +
        'display:flex;align-items:center;justify-content:center;' +
        'font-family:"Inter Variable","Inter","SF Pro Display",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}' +
      '#authOverlay .auth-card{position:relative;background:#fff;border-radius:20px;' +
        'padding:40px 36px 30px;width:384px;max-width:100%;text-align:center;' +
        'box-shadow:0 30px 80px -22px rgba(0,10,45,.65),0 6px 20px rgba(0,10,45,.16)}' +
      '#authOverlay .auth-badge{width:72px;height:72px;margin:2px auto 18px;display:flex;align-items:center;justify-content:center}' +
      '#authOverlay .auth-badge img{width:100%;height:100%;object-fit:contain;display:block}' +
      '#authOverlay .auth-logo{font-size:25px;font-weight:700;letter-spacing:-.5px;color:#0A1F44;margin-bottom:7px}' +
      '#authOverlay .auth-logo span{color:#0268CD}' +
      '#authOverlay .auth-sub{font-size:13.5px;color:#64748B;margin-bottom:28px}' +
      '#authOverlay .gbtn{display:inline-flex;align-items:center;gap:11px;background:#0268CD;color:#fff;' +
        'border:none;border-radius:10px;padding:0 18px;height:48px;font-size:14.5px;font-weight:600;cursor:pointer;' +
        'font-family:inherit;width:100%;justify-content:center;transition:box-shadow .18s,background .18s,transform .05s}' +
      '#authOverlay .gbtn:hover{box-shadow:0 8px 22px -6px rgba(2,104,205,.55);background:#0163c4}' +
      '#authOverlay .gbtn:active{transform:translateY(1px)}' +
      '#authOverlay .gbtn:disabled{opacity:.6;cursor:default;box-shadow:none}' +
      '#authOverlay .gbtn .gicon{display:inline-flex;align-items:center;justify-content:center;background:#fff;' +
        'border-radius:6px;width:30px;height:30px;flex-shrink:0}' +
      '#authOverlay .auth-msg{font-size:12.5px;color:#CC0000;margin-top:16px;line-height:1.5}' +
      '#authOverlay .auth-foot{margin-top:26px;padding-top:18px;border-top:1px solid #eef1f6;' +
        'font-size:11.5px;color:#94A3B8}' +
      '#authOverlay .auth-foot b{color:#475569;font-weight:600}' +
      '#authOverlay .auth-spin{width:34px;height:34px;border:3px solid #e8edf5;border-top-color:#0268CD;' +
        'border-radius:50%;animation:authspin .8s linear infinite;margin:6px auto 0}' +
      '#authOverlay .auth-loadtxt{font-size:13px;color:#64748B;margin-top:14px}' +
      '@keyframes authspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);

    var gLogo =
      '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.3 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16z"/><path fill="#FBBC05" d="M10.5 28.3c-.5-1.4-.7-2.9-.7-4.3s.3-2.9.7-4.3l-7.9-6.1C1 16.9 0 20.3 0 24s1 7.1 2.6 10.1l7.9-5.8z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.6l-7.1-5.5c-2 1.3-4.5 2.1-8.4 2.1-6.3 0-11.6-3.8-13.5-9.3l-7.9 5.8C6.5 42.6 14.6 48 24 48z"/></svg>';

    var ov = document.createElement('div');
    ov.id = 'authOverlay';
    ov.innerHTML =
      '<div class="auth-card">' +
        '<div class="auth-badge"><img src="assets/logoGCK.webp" alt="GCK"></div>' +
        '<div class="auth-logo">Painel <span>Técnico</span></div>' +
        '<div class="auth-sub">Faça login para continuar</div>' +
        '<div id="authLoginBox">' +
          '<button id="authGoogleBtn" class="gbtn"><span class="gicon">' + gLogo + '</span> Entrar com Google</button>' +
          '<div id="authMsg" class="auth-msg"></div>' +
          '<div class="auth-foot">Acesso exclusivo a contas <b>@clickdigital.com.br</b></div>' +
        '</div>' +
        '<div id="authLoadBox" style="display:none">' +
          '<div class="auth-spin"></div>' +
          '<div id="authLoadTxt" class="auth-loadtxt">Carregando...</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    document.getElementById('authGoogleBtn').addEventListener('click', doLogin);
  }

  function showLogin(msg) {
    ensureOverlay();
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authLoginBox').style.display = 'block';
    document.getElementById('authLoadBox').style.display = 'none';
    var btn = document.getElementById('authGoogleBtn');
    if (btn) btn.disabled = false;
    document.getElementById('authMsg').textContent = msg || '';
  }

  function showLoading(txt) {
    ensureOverlay();
    document.getElementById('authOverlay').style.display = 'flex';
    document.getElementById('authLoginBox').style.display = 'none';
    document.getElementById('authLoadBox').style.display = 'block';
    document.getElementById('authLoadTxt').textContent = txt || 'Carregando...';
  }

  function showError(msg) {
    ensureOverlay();
    showLogin(msg);
  }

  function hideOverlay() {
    var ov = document.getElementById('authOverlay');
    if (ov) ov.style.display = 'none';
  }

  // Rejeita se a promise nao resolver a tempo (evita spinner infinito).
  function withTimeout(p, ms, label) {
    return new Promise(function(resolve, reject) {
      var t = setTimeout(function() { reject(new Error('TIMEOUT: ' + label)); }, ms);
      p.then(
        function(v) { clearTimeout(t); resolve(v); },
        function(e) { clearTimeout(t); reject(e); }
      );
    });
  }

  // --- Allowlist --------------------------------------------------------------
  // Resolve { allowed: bool }. Rejeita em caso de ERRO real (timeout, rede,
  // permissao) — assim o erro aparece na tela em vez de virar "sem acesso".
  function checkAccess(user) {
    var email = (user.email || '').trim().toLowerCase();
    if (!email) return Promise.reject(new Error('conta Google sem e-mail'));
    var getDoc = fb().firestore().collection('allowedUsers').doc(email).get();
    return withTimeout(getDoc, 12000, 'leitura da lista de acesso (Firestore)')
      .then(function(doc) {
        if (!doc.exists) return { allowed: false };
        var data = doc.data() || {};
        _isAdmin = (data.role === 'admin') || data.admin === true;
        return { allowed: true };
      })
      .catch(function(e) {
        // Regra nega leitura p/ quem nao esta na lista -> tratar como "sem acesso"
        // (e nao como erro). Outros erros (timeout/rede) sobem de verdade.
        if (e && e.code === 'permission-denied') return { allowed: false };
        throw e;
      });
  }

  // --- Acoes ------------------------------------------------------------------
  function makeProvider() {
    var provider = new (fb().auth.GoogleAuthProvider)();
    provider.setCustomParameters({ prompt: 'select_account' });
    return provider;
  }

  function doLogin() {
    var btn = document.getElementById('authGoogleBtn');
    if (btn) btn.disabled = true;
    showLoading('Abrindo login do Google...');
    // Popup: no localhost e mais confiavel que redirect (que sofre isolamento de
    // storage entre localhost e firebaseapp.com). Se o popup for bloqueado,
    // cai para redirect.
    fb().auth().signInWithPopup(makeProvider())
      .then(function() { showLoading('Verificando acesso...'); })
      .catch(function(e) {
        var code = (e && e.code) || '';
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          showLogin('Login cancelado. Tente de novo.');
        } else if (code === 'auth/popup-blocked') {
          showLoading('Redirecionando para o Google...');
          fb().auth().signInWithRedirect(makeProvider());
        } else {
          var detail = (code || '(sem code)') + ' | ' + ((e && e.message) || '') +
            ' | ' + JSON.stringify((e && e.customData) || {});
          showLogin('Nao foi possivel entrar: ' + detail);
          try { console.error('LOGIN ERROR >>>', e); } catch (_) {}
        }
      });
  }

  function logout() {
    fb().auth().signOut().then(function() { window.location.reload(); });
  }

  function startApp() {
    if (_started) return;
    _started = true;
    showLoading('Carregando dados...');
    var hydrate = (window.Cloud && Cloud.hydrate) ? Cloud.hydrate(_user) : Promise.resolve();
    hydrate.then(function() {
      hideOverlay();
      App.init();
      injectUserChip();
    }).catch(function(e) {
      _started = false;
      var m = (e && (e.code || e.message)) || String(e);
      showLogin('Erro ao carregar os dados da nuvem: ' + m +
        (m.indexOf('permission') !== -1 ? ' (verifique as regras/allowlist)' : ''));
    });
  }

  // Chip com usuario logado + botao Sair, no canto direito da topbar.
  function injectUserChip() {
    var bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('authUserChip')) return;
    var chip = document.createElement('div');
    chip.id = 'authUserChip';
    chip.style.cssText = 'margin-left:auto;display:flex;align-items:center;gap:10px;padding:0 16px;flex-shrink:0';
    var email = (_user && _user.email) || '';
    chip.innerHTML =
      '<span style="font-size:11px;color:#8AADDB;white-space:nowrap">' +
        (_isAdmin ? '<i class="ti ti-shield-check" style="color:#4ADE80"></i> ' : '') +
        email + '</span>' +
      '<button id="authLogoutBtn" title="Sair" style="background:none;border:1px solid #0E3060;color:#8AADDB;' +
        'border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;font-family:inherit">Sair</button>';
    bar.appendChild(chip);
    document.getElementById('authLogoutBtn').addEventListener('click', logout);
  }

  // --- Entrada ----------------------------------------------------------------
  function start() {
    if (!initFirebase()) return;
    ensureOverlay();
    showLoading('Carregando...');

    // Completa o fluxo por redirecionamento (usado so como fallback). Erros aqui
    // NAO devem travar a tela de login (o popup e o caminho principal) — apenas loga.
    fb().auth().getRedirectResult().catch(function(e) {
      try { console.error('getRedirectResult >>>', e); } catch (_) {}
    });

    // Mantem um ID token do Firebase sempre atualizado (usado pelo proxy do Zendesk
    // na web: a Cloud Function verifica login+allowlist antes de injetar o token).
    fb().auth().onIdTokenChanged(function(user) {
      if (!user) { window.__FB_ID_TOKEN__ = null; return; }
      user.getIdToken().then(function(t) { window.__FB_ID_TOKEN__ = t; }).catch(function () {});
    });

    fb().auth().onAuthStateChanged(function(user) {
      if (!user) { showLogin(); return; }
      showLoading('Verificando acesso...');
      checkAccess(user).then(function(res) {
        if (res.allowed) { _user = user; startApp(); return; }
        var email = user.email || '(sem e-mail)';
        _isAdmin = false;
        var finish = function() {
          fb().auth().signOut();
          showLogin('Voce entrou com "' + email + '", que NAO esta na lista de acesso. ' +
            'Se voce tem mais de uma conta Google, clique em Entrar e escolha a conta de trabalho ' +
            '(ex.: gustavo@clickdigital.com.br). Se o e-mail acima estiver certo, peca ao admin para inclui-lo.');
        };
        // Registra a tentativa negada (para o admin ver) ANTES de deslogar.
        if (window.Audit && Audit.logDenied) Audit.logDenied(user.email || '').then(finish, finish);
        else finish();
      }).catch(function(e) {
        var m = (e && (e.code || e.message)) || String(e);
        showLogin('Erro ao verificar acesso: ' + m +
          (m.indexOf('TIMEOUT') === 0
            ? ' — o banco (Firestore) nao respondeu. Rede/firewall/AdBlock pode estar bloqueando firestore.googleapis.com.'
            : ''));
      });
    });
  }

  return {
    start:   start,
    logout:  logout,
    getUser: function() { return _user; },
    isAdmin: function() { return _isAdmin; }
  };
})();
