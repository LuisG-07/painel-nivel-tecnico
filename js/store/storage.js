var Storage = (function() {
  var KEYS = {
    analysts:  'skm6_ana',
    modules:   'skm6_mods',
    trainings: 'skm6_train',
    history:   'skm6_hist',
    sectors:   'skm6_sec'
  };

  var STORAGE_WARN_BYTES = 4 * 1024 * 1024; // warn at 4 MB

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('SkillMatrix: falha ao ler ' + key, e);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      checkQuota();
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
        alert('Atenção: armazenamento local está cheio. Exporte o HTML agora para não perder dados.');
      } else {
        console.error('SkillMatrix: falha ao salvar ' + key, e);
      }
    }
  }

  function checkQuota() {
    try {
      var total = 0;
      for (var k in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, k)) {
          total += (localStorage[k].length + k.length) * 2;
        }
      }
      if (total > STORAGE_WARN_BYTES) {
        console.warn('SkillMatrix: localStorage usando ' + Math.round(total / 1024) + ' KB');
      }
    } catch (e) { /* best-effort */ }
  }

  // Prototype pollution guard — never allow these as object keys from untrusted data
  var DANGER_KEYS = ['__proto__', 'constructor', 'prototype'];

  function isSafeKey(k) {
    if (typeof k !== 'string' || k.length === 0 || k.length > 100) return false;
    if (DANGER_KEYS.indexOf(k) !== -1) return false;
    // Reject strings containing control characters or HTML injection vectors
    if (/<|>|"|'/.test(k)) return false;
    for (var i = 0; i < k.length; i++) {
      var code = k.charCodeAt(i);
      if (code < 32) return false; // control characters including null
    }
    return true;
  }

  function clampScore(v) {
    var n = parseInt(v, 10);
    return (isFinite(n) && n >= 1 && n <= 5) ? n : 1;
  }

  function sanitizeScores(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var result = Object.create(null);
    Object.keys(raw).forEach(function(k) {
      if (isSafeKey(k)) result[k] = clampScore(raw[k]);
    });
    return result;
  }

  function validateAnalyst(a) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
    if (typeof a.id !== 'number' || !isFinite(a.id) || a.id <= 0) return false;
    if (typeof a.name !== 'string' || !a.name.trim() || a.name.length > 80) return false;
    if (typeof a.sector !== 'string' || a.sector.length > 50) return false;
    if (!a.scores || typeof a.scores !== 'object' || Array.isArray(a.scores)) return false;
    return true;
  }

  var LEVELS = ['Júnior', 'Pleno', 'Sênior'];

  function clampLevel(v) {
    return LEVELS.indexOf(v) !== -1 ? v : 'Júnior';
  }
  function clampStep(v) {
    var n = parseInt(v, 10);
    return (isFinite(n) && n >= 1 && n <= 6) ? n : 1;
  }

  function migrateAnalyst(raw) {
    var zendesk = typeof raw.zendesk === 'number' && isFinite(raw.zendesk)
      ? Math.min(10, Math.max(0, raw.zendesk)) : null;
    var provaAvg = typeof raw.provaAvg === 'number' && isFinite(raw.provaAvg)
      ? Math.min(10, Math.max(0, raw.provaAvg)) : null;
    var photo = typeof raw.photo === 'string' && raw.photo.startsWith('data:image/')
      ? raw.photo : null;
    var anexos = Array.isArray(raw.anexos)
      ? raw.anexos.filter(function(s) { return typeof s === 'string' && s.startsWith('data:image/'); })
      : [];
    return {
      id:       raw.id,
      name:     (raw.name || '').trim().slice(0, 80),
      sector:   (raw.sector || 'Chat').slice(0, 50),
      level:    clampLevel(raw.level),
      step:     clampStep(raw.step),
      zendesk:  zendesk,
      provaAvg: provaAvg,
      photo:    photo,
      comment:  typeof raw.comment === 'string' ? raw.comment.slice(0, 500) : '',
      anexos:   anexos,
      scores:   sanitizeScores(raw.scores)
    };
  }

  function loadAnalysts() {
    var raw = safeGet(KEYS.analysts, null);
    if (!Array.isArray(raw)) return null;
    var valid = [];
    raw.forEach(function(a) {
      if (validateAnalyst(a)) valid.push(migrateAnalyst(a));
      else console.warn('SkillMatrix: analista inválido ignorado', a);
    });
    return valid.length ? valid : null;
  }

  function loadModules() {
    var raw = safeGet(KEYS.modules, null);
    if (!Array.isArray(raw)) return null;
    var valid = raw.filter(function(m) { return typeof m === 'string' && m.trim(); });
    return valid.length ? valid : null;
  }

  function loadSectors() {
    var raw = safeGet(KEYS.sectors, null);
    if (!Array.isArray(raw)) return null;
    var valid = raw.filter(function(s) { return typeof s === 'string' && s.trim(); });
    return valid.length ? valid : null;
  }

  function sanitizeTraining(t) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    if (typeof t.module !== 'string' || !t.module.trim()) return null;
    var provas = Object.create(null);
    if (t.provas && typeof t.provas === 'object' && !Array.isArray(t.provas)) {
      Object.keys(t.provas).forEach(function(k) {
        if (isSafeKey(k)) {
          var v = parseFloat(t.provas[k]);
          if (isFinite(v)) provas[k] = Math.min(10, Math.max(0, v));
        }
      });
    }
    return {
      date:     typeof t.date   === 'string' ? t.date.slice(0, 20)   : '',
      module:   t.module.trim().slice(0, 100),
      leader:   typeof t.leader === 'string' ? t.leader.slice(0, 80) : '',
      obs:      typeof t.obs    === 'string' ? t.obs.slice(0, 500)   : '',
      status:   t.status === 'done' ? 'done' : 'pending',
      analysts: Array.isArray(t.analysts)
        ? t.analysts.filter(function(n) { return typeof n === 'string'; }).map(function(n) { return n.slice(0, 80); })
        : [],
      provas:   provas
    };
  }

  function loadTrainings() {
    var raw = safeGet(KEYS.trainings, []);
    if (!Array.isArray(raw)) return [];
    var result = [];
    raw.forEach(function(t) {
      var s = sanitizeTraining(t);
      if (s) result.push(s);
    });
    return result;
  }

  function loadHistory() {
    var raw = safeGet(KEYS.history, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    var result = Object.create(null);
    Object.keys(raw).forEach(function(k) {
      if (DANGER_KEYS.indexOf(k) !== -1) return;
      var entries = raw[k];
      if (!Array.isArray(entries)) return;
      result[k] = entries.filter(function(e) {
        return e && typeof e === 'object' && typeof e.date === 'string' && typeof e.avg === 'number' && isFinite(e.avg);
      }).map(function(e) {
        return { date: e.date.slice(0, 20), avg: Math.min(10, Math.max(0, e.avg)) };
      });
    });
    return result;
  }

  function saveAll(state) {
    safeSet(KEYS.analysts,  state.analysts);
    safeSet(KEYS.modules,   state.modules);
    safeSet(KEYS.sectors,   state.sectors);
    safeSet(KEYS.trainings, state.trainings);
    safeSet(KEYS.history,   state.history);
  }

  function estimateSizeKB() {
    try {
      var total = 0;
      Object.keys(KEYS).forEach(function(k) {
        var v = localStorage.getItem(KEYS[k]);
        if (v) total += v.length * 2;
      });
      return Math.round(total / 1024);
    } catch (e) { return 0; }
  }

  return {
    loadAnalysts:   loadAnalysts,
    loadModules:    loadModules,
    loadSectors:    loadSectors,
    loadTrainings:  loadTrainings,
    loadHistory:    loadHistory,
    saveAll:        saveAll,
    estimateSizeKB: estimateSizeKB,
    migrateAnalyst: migrateAnalyst
  };
})();
