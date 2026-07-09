// Sincronizacao com a nuvem (Firestore) — dados COMPARTILHADOS entre os usuarios.
// ─────────────────────────────────────────────────────────────────────────────
// Estrategia (nao invasiva): o localStorage continua sendo o "cache" que o app le,
// e a nuvem e a fonte compartilhada.
//   - hydrate(): le a nuvem e espelha no localStorage ANTES do App.init().
//       Na 1a vez (nuvem vazia), faz o inverso: sobe o localStorage atual para a
//       nuvem (migracao). Nada e apagado do localStorage.
//   - pushAll(state): apos cada save, empurra o estado para a nuvem (com debounce).
//
// Estrutura no Firestore (colecao appData, coberta pelas regras):
//   appData/analysts/items/{id}  -> um doc por analista (evita limite de 1MB/doc
//                                    por causa de fotos base64)
//   appData/modules  = { data: [...] }
//   appData/sectors  = { data: [...] }
//   appData/trainings= { data: [...] }
//   appData/history  = { data: {...} }
//   appData/_meta    = { seeded: true, seededAt, seededBy }
var Cloud = (function() {
  var ready = false;
  var _db = null;

  // chave localStorage -> nome do "tipo" na nuvem (docs simples)
  var SIMPLE = {
    'skm6_mods':  'modules',
    'skm6_sec':   'sectors',
    'skm6_train': 'trainings',
    'skm6_hist':  'history'
  };
  var ANA_KEY = 'skm6_ana';

  var writeTimer = null;

  function db() { return _db || (_db = window.firebase.firestore()); }
  function appData() { return db().collection('appData'); }
  function analystsCol() { return appData().doc('analysts').collection('items'); }
  function simpleDoc(type) { return appData().doc(type); }
  function metaDoc() { return appData().doc('_meta'); }

  function clone(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }

  function localGet(key) {
    try { var raw = localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); }
    catch (e) { return null; }
  }
  function localSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // --- Semear a nuvem a partir do localStorage (1a vez) ----------------------
  function seedFromLocal(user) {
    var ana = localGet(ANA_KEY);
    var hasAnalysts = Array.isArray(ana) && ana.length > 0;
    var ops = [];

    if (hasAnalysts) {
      ana.forEach(function(a) {
        if (a && a.id != null) ops.push(analystsCol().doc(String(a.id)).set(clone(a)));
      });
    }
    Object.keys(SIMPLE).forEach(function(k) {
      var v = localGet(k);
      if (v != null) ops.push(simpleDoc(SIMPLE[k]).set({ data: clone(v) }));
    });

    return Promise.all(ops).then(function() {
      // So marca como semeado se realmente havia dados (evita travar a semeadura
      // caso o 1o login seja de alguem sem dados locais).
      if (hasAnalysts) {
        return metaDoc().set({
          seeded: true,
          seededAt: new Date().toISOString(),
          seededBy: (user && user.email) || ''
        });
      }
    });
  }

  // --- Ler a nuvem e espelhar no localStorage --------------------------------
  function mirrorToLocal() {
    var jobs = [];

    jobs.push(analystsCol().get().then(function(snap) {
      var arr = [];
      snap.forEach(function(d) { arr.push(d.data()); });
      if (arr.length) localSet(ANA_KEY, arr);
    }));

    Object.keys(SIMPLE).forEach(function(k) {
      jobs.push(simpleDoc(SIMPLE[k]).get().then(function(d) {
        if (d.exists && d.data() && d.data().data != null) localSet(k, d.data().data);
      }));
    });

    return Promise.all(jobs);
  }

  function hydrate(user) {
    return metaDoc().get().then(function(meta) {
      var seeded = meta.exists && meta.data() && meta.data().seeded === true;
      if (!seeded) return seedFromLocal(user).then(mirrorToLocal);
      return mirrorToLocal();
    }).then(function() {
      ready = true;
    });
  }

  // --- Empurrar o estado para a nuvem (apos salvar) --------------------------
  function pushAll(state) {
    if (!ready || !state) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(function() { flush(state); }, 700);
  }

  function flush(state) {
    try {
      // Analistas: um doc por id; apaga os que sumiram.
      var wanted = {};
      (state.analysts || []).forEach(function(a) {
        if (a && a.id != null) {
          var id = String(a.id);
          wanted[id] = true;
          analystsCol().doc(id).set(clone(a));
        }
      });
      analystsCol().get().then(function(snap) {
        snap.forEach(function(d) { if (!wanted[d.id]) analystsCol().doc(d.id).delete(); });
      }).catch(function() {});

      // Docs simples
      simpleDoc('modules').set({ data: clone(state.modules || []) });
      simpleDoc('sectors').set({ data: clone(state.sectors || []) });
      simpleDoc('trainings').set({ data: clone(state.trainings || []) });
      simpleDoc('history').set({ data: clone(state.history || {}) });
    } catch (e) {
      try { console.error('Cloud.flush erro', e); } catch (_) {}
    }
  }

  return {
    hydrate: hydrate,
    pushAll: pushAll,
    isReady: function() { return ready; }
  };
})();
