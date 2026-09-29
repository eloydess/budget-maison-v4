/* =====================================================================
   BUDGET MAISON — MOTEUR PARTAGÉ (v4.0)
   Même code exécuté dans l'application (navigateur) ET dans Apps Script
   (Code.gs l'embarque à l'identique) : parité garantie des calculs.
   Aucune dépendance. Dates au format texte 'AAAA-MM-JJ'.
   ===================================================================== */
var BM = (function () {
  'use strict';

  /* ---------- Texte ---------- */
  function norm(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ');
  }

  /* ---------- Dates ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ym(s) { return String(s).slice(0, 7); }
  function addMonths(ymStr, n) {
    var y = +ymStr.slice(0, 4), m = +ymStr.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  function daysInMonth(ymStr) { return new Date(+ymStr.slice(0, 4), +ymStr.slice(5, 7), 0).getDate(); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function monthsBetween(a, b) { // nb de mois de ym a vers ym b
    return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
  }
  /** Jour J d'un mois (plafonné au dernier jour du mois). */
  function dayOf(ymStr, jour) { return ymStr + '-' + pad(Math.min(Math.max(1, jour || 1), daysInMonth(ymStr))); }

  /* ---------- Montants ---------- */
  function r2(x) { return Math.round((+x || 0) * 100) / 100; }

  /* ---------- Catégorisation ----------
     Règle : le mot-clé est cherché dans le libellé (insensible à la casse et
     aux accents). Si plusieurs règles correspondent, la DERNIÈRE de la liste
     l'emporte (convention historique du classeur : règles générales en haut,
     précises en bas ; une règle créée depuis l'appli s'ajoute en bas et prime).
     Une règle peut être limitée à un compte. */
  function prepareRules(rules) {
    var out = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r || !r.mot || !r.cat) continue;
      var k = norm(r.mot);
      if (!k.trim()) continue;
      out.push({ k: k, cat: r.cat, compte: r.compte || '', i: i });
    }
    return out;
  }
  function categorize(lib, mt, compte, prepared) {
    var L = norm(lib), best = null;
    for (var i = 0; i < prepared.length; i++) {
      var r = prepared[i];
      if (r.compte && r.compte !== compte) continue;
      if (L.indexOf(r.k) === -1) continue;
      best = r; // la dernière correspondance l'emporte
    }
    if (best) return { cat: best.cat, rule: best.k };
    return { cat: (+mt >= 0 ? 'À classer (recette)' : 'À classer (dépense)'), rule: null };
  }
  function isUnclassified(cat) { return String(cat).indexOf('À classer') === 0; }

  /* ---------- Mois budgétaire ----------
     Mois forcé prioritaire ; sinon, si la catégorie est « rattachée au mois
     suivant » et que le jour >= jour de bascule, l'opération bascule au mois suivant. */
  function budgetMonth(date, cat, moisForce, catMap, jourBascule) {
    if (moisForce) return String(moisForce).slice(0, 7);
    var c = catMap[cat];
    if (c && c.rattache && +String(date).slice(8, 10) >= (jourBascule || 28)) return addMonths(ym(date), 1);
    return ym(date);
  }

  /* ---------- Nature d'une recette ----------
     Revenus réguliers = recettes hors catégories « Exceptionnel » (dons…) et hors
     versements d'espèces (libellé contenant VERSEMENT), comme dans l'appli mobile v3.x :
     ces rentrées masquent le déficit réel. */
  function isRegularIncome(lib, cat, catMap) {
    var c = catMap[cat];
    if (c && c.nature === 'Exceptionnel') return false;
    return norm(lib).indexOf('VERSEMENT') === -1;
  }

  /* ---------- Dédoublonnage ---------- */
  function dedupKey(compte, date, mt, lib) {
    return compte + '|' + date + '|' + r2(mt).toFixed(2) + '|' + norm(lib).replace(/[^A-Z0-9]/g, '');
  }

  /* ---------- Soldes ----------
     Solde de référence = solde du compte À LA FIN de la date de référence.
     solde(t) = réf + Σ opérations dans ]dateRef ; t] − Σ opérations dans ]t ; dateRef]. */
  function balanceAt(compte, t, ops) {
    var s = r2(compte.soldeRef), ref = compte.dateRef || '0000-00-00';
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i];
      if (o.compte !== compte.nom) continue;
      if (o.date > ref && o.date <= t) s += o.mt;
      else if (o.date > t && o.date <= ref) s -= o.mt;
    }
    return r2(s);
  }

  /* ---------- Prêts ----------
     Mensualités restantes, reste à payer, capital restant dû estimé. */
  function loanStatus(p, today, ops) {
    var res = { restantMois: null, resteAPayer: null, crd: null, crdSource: null, taux: null,
      progression: null, derniere: null, nbVues: 0, fin: p.fin || null, finEstimee: false, interetsRestants: null };
    var todayYm = ym(today);
    // Échéances observées dans les relevés (mot-clé + montant ±2 %)
    var seen = [];
    if (p.motcle) {
      var ks = String(p.motcle).split(';').map(function (x) { return norm(x).trim(); }).filter(Boolean);
      for (var i = 0; i < ops.length; i++) {
        var o = ops[i];
        if (p.compte && o.compte !== p.compte) continue;
        var L = norm(o.lib), hit = false;
        for (var z = 0; z < ks.length; z++) if (L.indexOf(ks[z]) !== -1) { hit = true; break; }
        if (!hit) continue;
        if (p.mensualite && Math.abs(Math.abs(o.mt) - p.mensualite) > p.mensualite * 0.02 + 0.01) continue;
        seen.push(o);
      }
      seen.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      res.nbVues = seen.length;
      if (seen.length) res.derniere = seen[seen.length - 1].date;
    }
    // Taux et CRD à partir des lignes « DONT CAP x ... INT. y » (relevés BPGO)
    var parsed = [];
    for (var j = 0; j < seen.length; j++) {
      var m = /CAP\.?\s*([\d\s.]+,\d{2}).*?INT\.?\s*([\d\s.]+,\d{2})/.exec(norm(seen[j].lib));
      if (m) parsed.push({ date: seen[j].date, cap: toNum(m[1]), int: toNum(m[2]) });
    }
    var r = p.taux ? p.taux / 100 / 12 : null;
    if (!r && parsed.length >= 2) {
      var a = parsed[parsed.length - 2], b = parsed[parsed.length - 1];
      if (a.cap > 0 && b.cap > a.cap) { r = b.cap / a.cap - 1; res.tauxSource = 'relevés'; }
    }
    if (r) res.taux = r2(r * 12 * 100 * 100) / 100;
    if (p.crd && p.dateCrd) {
      // CRD saisi, amorti jusqu'à aujourd'hui
      var n0 = Math.max(0, monthsBetween(ym(p.dateCrd), todayYm));
      var c = p.crd;
      for (var q = 0; q < n0; q++) c = r ? c * (1 + r) - p.mensualite : c - p.mensualite;
      res.crd = Math.max(0, r2(c)); res.crdSource = 'saisi';
    } else if (parsed.length && r) {
      var last = parsed[parsed.length - 1];
      var crdAfter = last.int / r - last.cap; // CRD juste après la dernière échéance observée
      var n1 = Math.max(0, monthsBetween(ym(last.date), todayYm) - 1);
      var c2 = crdAfter;
      for (var q2 = 0; q2 < n1; q2++) c2 = c2 * (1 + r) - p.mensualite;
      res.crd = Math.max(0, r2(c2)); res.crdSource = 'relevés';
    }
    // Mensualités restantes
    var nextDue = dayOf(todayYm, p.jour || 1);
    var startYm = nextDue < today ? addMonths(todayYm, 1) : todayYm;
    if (res.derniere && ym(res.derniere) >= startYm) startYm = addMonths(ym(res.derniere), 1);
    if (p.fin) {
      res.restantMois = Math.max(0, monthsBetween(startYm, ym(p.fin)) + 1);
    } else if (res.crd && r && p.mensualite > res.crd * r) {
      res.restantMois = Math.ceil(-Math.log(1 - r * res.crd / p.mensualite) / Math.log(1 + r));
      res.fin = dayOf(addMonths(startYm, res.restantMois - 1), p.jour || 1); res.finEstimee = true;
    }
    if (res.restantMois != null) res.resteAPayer = r2(res.restantMois * p.mensualite);
    if (p.taux === 0 && res.crd == null && res.resteAPayer != null) { res.crd = res.resteAPayer; res.crdSource = 'taux zéro'; res.taux = 0; }
    if (res.resteAPayer != null && res.crd != null) res.interetsRestants = r2(Math.max(0, res.resteAPayer - res.crd));
    if (p.capital && res.crd != null) res.progression = Math.min(1, Math.max(0, 1 - res.crd / p.capital));
    else if (p.debut && res.fin) {
      var tot = monthsBetween(ym(p.debut), ym(res.fin)) + 1;
      if (tot > 0 && res.restantMois != null) res.progression = Math.min(1, Math.max(0, 1 - res.restantMois / tot));
    }
    return res;
  }
  /** Simulation de modulation : nouvelle mensualité → nouvelle durée (si taux et CRD connus). */
  function simulateModulation(crd, tauxAnnuel, mensualite, pct) {
    var newM = r2(mensualite * (1 + pct / 100));
    var r = tauxAnnuel / 100 / 12;
    function dur(M) {
      if (!crd || !r) return null;
      if (M <= crd * r) return Infinity;
      return Math.ceil(-Math.log(1 - r * crd / M) / Math.log(1 + r));
    }
    var n0 = dur(mensualite), n1 = dur(newM);
    return { mensualite: newM, gainMensuel: r2(mensualite - newM), dureeAvant: n0, dureeApres: n1,
      coutTotalAvant: n0 != null && isFinite(n0) ? r2(n0 * mensualite) : null,
      coutTotalApres: n1 != null && isFinite(n1) ? r2(n1 * newM) : null };
  }

  function toNum(s) {
    if (typeof s === 'number') return s;
    var t = String(s == null ? '' : s).replace(/[\s  €]/g, '');
    if (!t) return NaN;
    var neg = /^\(.*\)$/.test(t); if (neg) t = t.slice(1, -1);
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else t = t.replace(',', '.');
    if (/-$/.test(t)) t = '-' + t.slice(0, -1);
    var v = parseFloat(t);
    return neg ? -v : v;
  }

  /** Échéances d'une ligne récurrente sur une période [from ; to] (dates). */
  var PERIODES = { 'Mensuelle': 1, 'Bimestrielle': 2, 'Trimestrielle': 3, 'Semestrielle': 6, 'Annuelle': 12 };
  function occurrences(e, from, to) {
    var step = PERIODES[e.periodicite] || 1, out = [];
    var start = e.moisDepart ? ym(e.moisDepart) : ym(from);
    var cur = ym(from);
    for (var guard = 0; guard < 400 && cur <= ym(to); guard++, cur = addMonths(cur, 1)) {
      var k = monthsBetween(start, cur);
      if (k < 0 || k % step !== 0) continue;
      var d = dayOf(cur, e.jour || 1);
      if (d < from || d > to) continue;
      if (e.fin && d > e.fin) continue;
      out.push(d);
    }
    return out;
  }

  return {
    norm: norm, ymd: ymd, parseYmd: parseYmd, ym: ym, addMonths: addMonths, addDays: addDays,
    daysInMonth: daysInMonth, diffDays: diffDays, monthsBetween: monthsBetween, dayOf: dayOf, pad: pad,
    r2: r2, toNum: toNum, prepareRules: prepareRules, categorize: categorize, isUnclassified: isUnclassified,
    budgetMonth: budgetMonth, isRegularIncome: isRegularIncome, dedupKey: dedupKey, balanceAt: balanceAt, loanStatus: loanStatus,
    simulateModulation: simulateModulation, occurrences: occurrences, PERIODES: PERIODES, VERSION: '4.1'
  };
})();
if (typeof module !== 'undefined') module.exports = BM;
