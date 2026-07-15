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

  // Zendesk: chaves de localStorage COMPARTILHADAS entre usuarios/URLs.
  // NAO inclui skm6_zdcfg_sec (credenciais e-mail/token — ficam so na maquina).
  // Guardadas em appData/zd_<chave>; valores grandes (fotos base64) sao divididos
  // em partes (subcolecao "parts") para respeitar o limite de 1MB/doc do Firestore.
  var ZD_KEYS = [
    'skm6_zdcfg', 'skm6_zdtickets', 'skm6_zdcategories', 'skm6_zdagents',
    'skm6_zdemails', 'skm6_zdfound', 'skm6_zdstatus', 'skm6_zdphotos'
  ];
  var ZD_CHUNK = 800000; // ~800 KB por parte

  var writeTimer = null;
  var zdTimer    = null;

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

  // --- Zendesk: leitura/escrita com chunking ---------------------------------
  function zdDoc(key) { return appData().doc('zd_' + key); }

  // Remove partes obsoletas (indice >= keep).
  function zdDeleteParts(doc, keep) {
    return doc.collection('parts').get().then(function(snap) {
      var dels = [];
      snap.forEach(function(d) { if (parseInt(d.id, 10) >= keep) dels.push(d.ref.delete()); });
      return Promise.all(dels);
    });
  }

  // Sobe uma chave do localStorage para a nuvem (dividindo se for grande).
  function zdWrite(key) {
    var raw = localStorage.getItem(key);
    if (raw == null) return Promise.resolve();
    var doc = zdDoc(key);
    if (raw.length <= ZD_CHUNK) {
      return doc.set({ data: raw, parts: 0, updatedAt: Date.now() })
        .then(function() { return zdDeleteParts(doc, 0); });
    }
    var chunks = [];
    for (var i = 0; i < raw.length; i += ZD_CHUNK) chunks.push(raw.slice(i, i + ZD_CHUNK));
    var ops = chunks.map(function(c, idx) { return doc.collection('parts').doc(String(idx)).set({ c: c }); });
    ops.push(doc.set({ data: '', parts: chunks.length, updatedAt: Date.now() }));
    return Promise.all(ops).then(function() { return zdDeleteParts(doc, chunks.length); });
  }

  // Le uma chave da nuvem (reassembla partes) e espelha no localStorage.
  function zdRead(key) {
    var doc = zdDoc(key);
    return doc.get().then(function(d) {
      if (!d.exists) return;
      var data = d.data() || {};
      if (data.parts && data.parts > 0) {
        return doc.collection('parts').get().then(function(snap) {
          var arr = [];
          snap.forEach(function(p) { arr.push({ i: parseInt(p.id, 10), c: p.data().c }); });
          arr.sort(function(a, b) { return a.i - b.i; });
          zdApply(key, arr.map(function(x) { return x.c; }).join(''));
        });
      }
      if (typeof data.data === 'string' && data.data) zdApply(key, data.data);
    }).catch(function(e) { try { console.warn('Cloud.zdRead ' + key, e); } catch (_) {} });
  }

  // So grava se for JSON valido (evita corromper o cache local).
  function zdApply(key, s) {
    try { JSON.parse(s); localStorage.setItem(key, s); } catch (e) {}
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
    // Zendesk (dados compartilhados) — sobe o que houver localmente
    ZD_KEYS.forEach(function(k) { ops.push(zdWrite(k)); });

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
      // A nuvem e a fonte da verdade — espelha exatamente (inclusive remocoes).
      // Seguro porque flush NAO deleta automaticamente (so remocao explicita),
      // entao a nuvem nunca encolhe por acidente.
      if (arr.length) localSet(ANA_KEY, arr);
    }));

    Object.keys(SIMPLE).forEach(function(k) {
      jobs.push(simpleDoc(SIMPLE[k]).get().then(function(d) {
        if (d.exists && d.data() && d.data().data != null) localSet(k, d.data().data);
      }));
    });

    // Zendesk (config/nameMap, tickets, ranking, agentes, fotos…)
    ZD_KEYS.forEach(function(k) { jobs.push(zdRead(k)); });

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
      // Analistas: um doc por id. NAO apaga "os que sumiram" — isso era perigoso:
      // uma sessao com a lista incompleta em memoria apagava analistas do banco.
      // Remocao agora e explicita (deleteAnalyst, chamado so no removeAnalyst).
      (state.analysts || []).forEach(function(a) {
        if (a && a.id != null) analystsCol().doc(String(a.id)).set(clone(a));
      });

      // Docs simples
      simpleDoc('modules').set({ data: clone(state.modules || []) });
      simpleDoc('sectors').set({ data: clone(state.sectors || []) });
      simpleDoc('trainings').set({ data: clone(state.trainings || []) });
      simpleDoc('history').set({ data: clone(state.history || {}) });
    } catch (e) {
      try { console.error('Cloud.flush erro', e); } catch (_) {}
    }
  }

  // Empurra os dados do Zendesk para a nuvem (debounce). Chamado apos importar
  // ou salvar config/vinculos, pois esses dados NAO passam pelo pushAll(state).
  function pushZendesk() {
    if (!ready) return;
    clearTimeout(zdTimer);
    zdTimer = setTimeout(function() {
      ZD_KEYS.forEach(function(k) {
        zdWrite(k).catch(function(e) { try { console.error('Cloud.zdWrite ' + k, e); } catch (_) {} });
      });
    }, 700);
  }

  // Remocao EXPLICITA de um analista (chamado pelo App.removeAnalyst).
  function deleteAnalyst(id) {
    if (!ready || id == null) return;
    try { analystsCol().doc(String(id)).delete(); } catch (e) {}
  }

  return {
    hydrate: hydrate,
    pushAll: pushAll,
    pushZendesk: pushZendesk,
    deleteAnalyst: deleteAnalyst,
    isReady: function() { return ready; }
  };
})();
