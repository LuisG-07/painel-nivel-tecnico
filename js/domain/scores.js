var Domain = (function() {

  function techAverage(scores) {
    var values = Object.values(scores).filter(function(v) { return v > 0; });
    if (!values.length) return 0;
    return values.reduce(function(a, b) { return a + b; }, 0) / values.length;
  }

  // Returns technical score on 0–10 scale
  function techScore(scores) {
    return techAverage(scores) * 2;
  }

  // Returns unified score: mean of all available scores
  function unifiedScore(analyst) {
    var parts = [techScore(analyst.scores)];
    if (analyst.provaAvg != null) parts.push(analyst.provaAvg);
    if (analyst.zendesk   != null) parts.push(analyst.zendesk);
    return parts.reduce(function(a, b) { return a + b; }, 0) / parts.length;
  }

  function scoreColor(score) {
    if (score >= 7) return '#15803D';
    if (score >= 5) return '#B45309';
    return '#CC0000';
  }

  function scoreBorderClass(score) {
    if (score >= 7) return 'bl-g';
    if (score >= 5) return 'bl-a';
    return 'bl-r';
  }

  function scoreAvatarClass(score) {
    if (score >= 7) return 'av-g';
    if (score >= 5) return 'av-a';
    return 'av-r';
  }

  function scoreBarClass(moduleScore) {
    if (moduleScore >= 4) return 'fill-g';
    if (moduleScore >= 3) return 'fill-a';
    return 'fill-r';
  }

  function scoreStatusLabel(avg) {
    if (avg >= 4) return 'Bom';
    if (avg >= 3) return 'Regular';
    return 'Crítico';
  }

  function nameInitials(fullName) {
    return fullName.split(' ')
      .map(function(w) { return w[0] || ''; })
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  function sectorBadgeClass(sector) {
    if (sector === 'Chat')     return 'bc';
    if (sector === 'Telefone') return 'bt';
    if (sector === 'Notas')    return 'bn';
    return 'bc';
  }

  // Escapes a string for safe insertion into HTML text nodes / attributes
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Recalculates provaAvg for a single analyst across all trainings
  function recalcProvaAvg(analystName, trainings) {
    var scores = [];
    trainings.forEach(function(t) {
      if (t.provas && t.provas[analystName] != null) {
        scores.push(t.provas[analystName]);
      }
    });
    return scores.length
      ? scores.reduce(function(a, b) { return a + b; }, 0) / scores.length
      : null;
  }

  // Recalculates provaAvg for all analysts in place
  function applyTrainingScores(analysts, trainings) {
    analysts.forEach(function(analyst) {
      analyst.provaAvg = recalcProvaAvg(analyst.name, trainings);
    });
  }

  // Builds sorted module-average array from a list of analysts
  function moduleAverages(modules, analysts) {
    return modules.map(function(mod) {
      var values = analysts
        .map(function(a) { return a.scores[mod] || 0; })
        .filter(function(v) { return v > 0; });
      var avg = values.length
        ? values.reduce(function(a, b) { return a + b; }, 0) / values.length
        : 0;
      return { name: mod, avg: avg };
    }).sort(function(a, b) { return a.avg - b.avg; });
  }

  return {
    techScore:       techScore,
    unifiedScore:    unifiedScore,
    scoreColor:      scoreColor,
    scoreBorderClass: scoreBorderClass,
    scoreAvatarClass: scoreAvatarClass,
    scoreBarClass:   scoreBarClass,
    scoreStatusLabel: scoreStatusLabel,
    nameInitials:    nameInitials,
    sectorBadgeClass: sectorBadgeClass,
    escapeHtml:      escapeHtml,
    recalcProvaAvg:  recalcProvaAvg,
    applyTrainingScores: applyTrainingScores,
    moduleAverages:  moduleAverages
  };
})();
