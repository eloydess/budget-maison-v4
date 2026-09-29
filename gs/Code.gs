/* ===== Budget Maison v4.1 — Code.gs : moteur partagé + script. Ne pas modifier le bloc BM (identique à engine.js de l'appli). ===== */
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

/* =====================================================================
   BUDGET MAISON v4 — Code.gs (script du classeur)
   Contient : le moteur partagé (ci-dessus, identique à l'appli), l'accès
   aux données, le menu, l'import depuis l'onglet IMPORT, le tableau de bord.
   L'API de l'application est dans le 2e fichier : Api.gs.
   ===================================================================== */
var SH = { OPS: 'OPERATIONS', IMP: 'IMPORT', CPT: 'COMPTES', CAT: 'CATEGORIES', REG: 'REGLES',
  ECH: 'ECHEANCES', PRE: 'PRETS', OBJ: 'OBJECTIFS', PAR: 'PARAMETRES', JOU: 'JOURNAL', TAB: 'TABLEAU' };
var HEADERS = {
  OPERATIONS: ['ID', 'Date', 'Compte', 'Libellé', 'Montant (€)', 'Catégorie', 'Origine', 'Mois forcé', 'Commentaire', "Lot d'import"],
  COMPTES: ['Compte', 'Banque', 'Titulaire', 'Nature', 'Solde de référence (€)', 'Date de référence', 'Actif', 'N° de compte (relevés)', 'Origine du solde', "Relevé couvert jusqu'au"],
  CATEGORIES: ['Groupe', 'Catégorie', 'Type', 'Nature', 'Enveloppe mensuelle (€)', 'Rattachée au mois suivant', 'Icône'],
  REGLES: ['Mot-clé cherché dans le libellé', 'Catégorie attribuée', 'Limité au compte (facultatif)'],
  ECHEANCES: ['ID', 'Libellé', 'Catégorie', 'Compte', 'Montant (€)', 'Sens', 'Périodicité', 'Jour', 'Mois de départ', 'Date de fin', 'Actif', 'Commentaire'],
  PRETS: ['ID', 'Prêt', 'Prêteur', 'Compte prélevé', 'Mensualité (€)', 'Jour', 'Date de début', 'Date de fin', 'Capital emprunté (€)', 'Taux annuel (%)', 'Capital restant dû (€)', 'Date du CRD', 'Mot-clé relevé', 'Modulable', 'Catégorie', 'Commentaire'],
  OBJECTIFS: ['ID', 'Objectif', 'Montant cible (€)', 'Date cible', "Compte d'épargne", 'Déjà épargné hors compte (€)', 'Icône', 'Actif'],
  PARAMETRES: ['Paramètre', 'Valeur', 'Explication'],
  JOURNAL: ['Horodatage', 'Utilisateur', 'Action', 'Détail'],
  IMPORT: ['Date', 'Libellé', 'Montant (€)', 'Débit (€)', 'Crédit (€)', 'Compte']
};
var PARAM_KEYS = {
  'Jour de bascule au mois suivant': 'jourBascule',
  "Seuil d'alerte reste à vivre (€)": 'seuilRAV',
  "Seuil taux d'effort (%)": 'seuilEffort',
  'Horizon de projection (jours)': 'horizon',
  'Coussin de sécurité par compte (€)': 'coussin',
  'Nom du foyer': 'foyer'
};

/* ---------------- Classeur ----------------
   Projet autonome (non lié au classeur) : le classeur est ouvert par son identifiant.
   Si ce script est un jour collé dans un projet lié au classeur, il fonctionne aussi. */
var CLASSEUR_ID = '1ZkEhJkDyZaVpmVrP5_9xNg2Obe_rST-Az-61KYdCWxY';

/* ---------------- CODES D'ACCÈS DE L'APPLICATION ----------------
   1. Tapez un code de 4 à 6 chiffres entre les guillemets (laisser vide = ne pas créer).
   2. Titulaire : laisser vide = accès COMPLET ; 'Emmanuella' = uniquement ses comptes.
   3. Exécutez la fonction definirLesCodes (menu déroulant en haut, puis « Exécuter »).
   4. Effacez ensuite les codes tapés ci-dessous et enregistrez. */
var CODES = [
  { prenom: 'Pierre', code: '', titulaire: '' },
  { prenom: 'Emmanuella', code: '', titulaire: '' }
];
function definirLesCodes() {
  var users = api_users_(), faits = [];
  CODES.forEach(function (c) {
    var pin = String(c.code || '').trim();
    if (!pin) return;
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Code de ' + c.prenom + ' : 4 à 6 chiffres attendus.');
    users[c.prenom] = { h: api_hash_(c.prenom + '|' + pin), v: Date.now(), acces: c.titulaire ? 'Restreint' : 'Complet', titulaire: c.titulaire || '' };
    faits.push(c.prenom + (c.titulaire ? ' (restreint : ' + c.titulaire + ')' : ' (complet)'));
  });
  api_saveUsers_(users);
  Logger.log(faits.length ? 'Codes enregistrés : ' + faits.join(', ') + '. Effacez maintenant les codes tapés dans CODES et enregistrez.' : 'Aucun code saisi dans CODES.');
  Logger.log('Utilisateurs actuels : ' + Object.keys(users).join(', '));
}
/** Lance l'installation depuis l'éditeur (projet autonome). */
function installer() { menuInstall(); }

/* ---------------- Utilitaires ---------------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(CLASSEUR_ID); }
function uiAlert_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }
function sh_(name) {
  var s = ss_().getSheetByName(name);
  if (!s) throw new Error("Onglet introuvable : " + name + " — lancez le menu Budget Maison › Installer / réparer.");
  return s;
}
function tz_() { return ss_().getSpreadsheetTimeZone() || 'Europe/Paris'; }
/** Date (objet Date ou texte) -> 'AAAA-MM-JJ' ; '' si vide. */
function d2s_(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  }
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/.exec(s))) {
    var y = m[3].length === 2 ? '20' + m[3] : m[3];
    return y + '-' + BM.pad(+m[2]) + '-' + BM.pad(+m[1]);
  }
  return '';
}
/** 'AAAA-MM' (mois forcé) — Sheets peut avoir converti le texte en date. */
function m2s_(v) {
  if (v === '' || v == null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  var s = String(v).trim(), m;
  if ((m = /^(\d{4})-(\d{1,2})/.exec(s))) return m[1] + '-' + BM.pad(+m[2]);
  if ((m = /^(\d{1,2})\/(\d{4})$/.exec(s))) return m[2] + '-' + BM.pad(+m[1]);
  return '';
}
/** 'AAAA-MM-JJ' -> Date à midi (évite tout décalage d'un jour entre fuseaux). */
function s2d_(s) {
  if (!s) return '';
  var p = String(s).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
}
function num_(v) { if (v === '' || v == null) return 0; var n = typeof v === 'number' ? v : BM.toNum(v); return isNaN(n) ? 0 : n; }
function numOrNull_(v) { if (v === '' || v == null) return null; var n = typeof v === 'number' ? v : BM.toNum(v); return isNaN(n) ? null : n; }
function yes_(v) { return String(v).trim().toLowerCase() === 'oui'; }
function rows_(name) {
  var s = sh_(name), n = s.getLastRow() - 1;
  if (n < 1) return [];
  return s.getRange(2, 1, n, HEADERS[name].length).getValues();
}
function log_(user, action, detail) {
  try { sh_(SH.JOU).appendRow([new Date(), user || '', action, String(detail || '').slice(0, 500)]); } catch (e) { /* journal best-effort */ }
}

/* ---------------- Lecture des données ---------------- */
function readParams_() {
  var p = { jourBascule: 28, seuilRAV: 300, seuilEffort: 35, horizon: 90, coussin: 100, foyer: 'Foyer' };
  rows_(SH.PAR).forEach(function (r) {
    var k = PARAM_KEYS[String(r[0]).trim()];
    if (!k) return;
    p[k] = k === 'foyer' ? String(r[1]) : num_(r[1]);
  });
  return p;
}
function readComptes_() {
  return rows_(SH.CPT).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { nom: String(r[0]), banque: String(r[1]), titulaire: String(r[2]), nature: String(r[3]) || 'Courant',
      soldeRef: num_(r[4]), dateRef: d2s_(r[5]), actif: r[6] === '' ? true : yes_(r[6]), no: String(r[7] || '').trim(), origine: String(r[8] || ''), couvert: d2s_(r[9]) };
  });
}
function readCategories_() {
  return rows_(SH.CAT).filter(function (r) { return r[1] !== ''; }).map(function (r) {
    return { groupe: String(r[0]), nom: String(r[1]), type: String(r[2]) || 'Dépense', nature: String(r[3]) || 'Variable',
      enveloppe: num_(r[4]), rattache: yes_(r[5]), icone: String(r[6] || '') };
  });
}
function readRegles_() {
  return rows_(SH.REG).filter(function (r) { return r[0] !== '' && r[1] !== ''; }).map(function (r) {
    return { mot: String(r[0]), cat: String(r[1]), compte: String(r[2] || '') };
  });
}
function readEcheances_() {
  return rows_(SH.ECH).filter(function (r) { return r[1] !== ''; }).map(function (r) {
    return { id: String(r[0]), lib: String(r[1]), cat: String(r[2]), compte: String(r[3]), montant: Math.abs(num_(r[4])),
      sens: String(r[5]) === 'Crédit' ? 'Crédit' : 'Débit', periodicite: String(r[6]) || 'Mensuelle', jour: num_(r[7]) || 1,
      moisDepart: m2s_(r[8]), fin: d2s_(r[9]), actif: r[10] === '' ? true : yes_(r[10]), comm: String(r[11] || '') };
  });
}
function readPrets_() {
  return rows_(SH.PRE).filter(function (r) { return r[1] !== ''; }).map(function (r) {
    return { id: String(r[0]), nom: String(r[1]), preteur: String(r[2]), compte: String(r[3]), mensualite: num_(r[4]),
      jour: num_(r[5]) || 1, debut: d2s_(r[6]), fin: d2s_(r[7]), capital: numOrNull_(r[8]), taux: numOrNull_(r[9]),
      crd: numOrNull_(r[10]), dateCrd: d2s_(r[11]), motcle: String(r[12] || ''), modulable: String(r[13] || ''),
      cat: String(r[14] || ''), comm: String(r[15] || '') };
  });
}
function readObjectifs_() {
  return rows_(SH.OBJ).filter(function (r) { return r[1] !== ''; }).map(function (r) {
    return { id: String(r[0]), nom: String(r[1]), cible: num_(r[2]), date: d2s_(r[3]), compte: String(r[4] || ''),
      deja: num_(r[5]), icone: String(r[6] || ''), actif: r[7] === '' ? true : yes_(r[7]) };
  });
}
/** Opérations au format objet (moteur). */
function readOps_() {
  return rows_(SH.OPS).filter(function (r) { return r[0] !== '' && r[1] !== ''; }).map(function (r) {
    return { id: String(r[0]), date: d2s_(r[1]), compte: String(r[2]), lib: String(r[3]), mt: BM.r2(num_(r[4])),
      cat: String(r[5]), origine: String(r[6] || 'Règle'), moisForce: m2s_(r[7]), comm: String(r[8] || ''), lot: String(r[9] || '') };
  });
}

/* ---------------- Écritures ---------------- */
function nextOpId_(sheet) {
  var props = PropertiesService.getScriptProperties();
  var n = +props.getProperty('SEQ_OP') || 0;
  if (!n) { // initialise depuis le plus grand ID existant
    var last = sheet.getLastRow();
    if (last > 1) sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      var m = /^O(\d+)$/.exec(String(r[0])); if (m) n = Math.max(n, +m[1]);
    });
  }
  return { next: function () { n++; return 'O' + ('000000' + n).slice(-6); }, save: function () { props.setProperty('SEQ_OP', String(n)); } };
}
/**
 * Ajoute des opérations en évitant les doublons exacts (compte, date, montant, libellé).
 * Le contrôle est « multi-ensemble » : 2 cafés identiques le même jour restent 2 opérations
 * si le relevé en contient 2 et le classeur 0.
 * @param {Array} rows [{date, compte, lib, mt, cat?, comm?}]
 * @return {{added:Array, skipped:number}}
 */
function appendOps_(rows, lot, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = sh_(SH.OPS), existing = readOps_(), count = {};
    existing.forEach(function (o) { var k = BM.dedupKey(o.compte, o.date, o.mt, o.lib); count[k] = (count[k] || 0) + 1; });
    var prepared = BM.prepareRules(readRegles_()), seenInBatch = {}, out = [], values = [], seq = nextOpId_(sheet), skipped = 0;
    rows.forEach(function (r) {
      var date = d2s_(r.date), mt = BM.r2(num_(r.mt)), lib = String(r.lib || '').trim(), compte = String(r.compte || '');
      if (!date || !compte || !lib || !mt) { skipped++; return; }
      var k = BM.dedupKey(compte, date, mt, lib);
      seenInBatch[k] = (seenInBatch[k] || 0) + 1;
      if (!r.force && seenInBatch[k] <= (count[k] || 0)) { skipped++; return; }
      var cat = r.cat || BM.categorize(lib, mt, compte, prepared).cat;
      var o = { id: seq.next(), date: date, compte: compte, lib: lib, mt: mt, cat: cat,
        origine: r.cat && r.manuel ? 'Manuel' : 'Règle', moisForce: '', comm: String(r.comm || ''), lot: lot || '' };
      out.push(o);
      values.push([o.id, s2d_(o.date), o.compte, o.lib, o.mt, o.cat, o.origine, '', o.comm, o.lot]);
    });
    if (values.length) {
      var start = sheet.getLastRow() + 1;
      sheet.getRange(start, 1, values.length, values[0].length).setValues(values);
      sheet.getRange(start, 2, values.length, 1).setNumberFormat('dd/MM/yyyy');
      sheet.getRange(start, 8, values.length, 1).setNumberFormat('@');
      seq.save();
    }
    log_(user, 'Import', (lot || '') + ' — ' + out.length + ' ajoutée(s), ' + skipped + ' ignorée(s)');
    return { added: out, skipped: skipped };
  } finally { lock.releaseLock(); }
}
/** Index ID -> numéro de ligne (onglet OPERATIONS). */
function opIndex_() {
  var sheet = sh_(SH.OPS), n = sheet.getLastRow() - 1, idx = {};
  if (n > 0) sheet.getRange(2, 1, n, 1).getValues().forEach(function (r, i) { if (r[0] !== '') idx[String(r[0])] = i + 2; });
  return idx;
}
/** Modifie des opérations : patch {cat, comm, moisForce, date, lib, mt, compte}. */
function patchOps_(ids, patch, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = sh_(SH.OPS), idx = opIndex_(), n = 0;
    ids.forEach(function (id) {
      var row = idx[id]; if (!row) return;
      if (patch.cat != null) { sheet.getRange(row, 6, 1, 2).setValues([[patch.cat, patch.origine || 'Manuel']]); }
      if (patch.moisForce != null) sheet.getRange(row, 8).setNumberFormat('@').setValue(patch.moisForce);
      if (patch.comm != null) sheet.getRange(row, 9).setValue(patch.comm);
      if (patch.date) sheet.getRange(row, 2).setValue(s2d_(patch.date));
      if (patch.lib != null) sheet.getRange(row, 4).setValue(patch.lib);
      if (patch.mt != null) sheet.getRange(row, 5).setValue(BM.r2(patch.mt));
      if (patch.compte) sheet.getRange(row, 3).setValue(patch.compte);
      n++;
    });
    log_(user, 'Modification', n + ' opération(s) : ' + JSON.stringify(patch).slice(0, 200));
    return n;
  } finally { lock.releaseLock(); }
}
function deleteOps_(ids, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = sh_(SH.OPS), idx = opIndex_();
    var rows = ids.map(function (id) { return idx[id]; }).filter(Boolean).sort(function (a, b) { return b - a; });
    var det = rows.map(function (r) { return sheet.getRange(r, 1, 1, 5).getDisplayValues()[0].join(' · '); });
    rows.forEach(function (r) { sheet.deleteRow(r); });
    log_(user, 'Suppression', rows.length + ' opération(s) : ' + det.join(' | '));
    return rows.length;
  } finally { lock.releaseLock(); }
}
/**
 * Ajoute une règle ; si apply, recatégorise les opérations « À classer »
 * (et, si toutes=true, toutes les opérations d'origine « Règle ») qui correspondent.
 */
function addRule_(mot, cat, compte, apply, toutes, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    sh_(SH.REG).appendRow([mot, cat, compte || '']);
    var changed = [];
    if (apply) {
      var prepared = BM.prepareRules(readRegles_()), sheet = sh_(SH.OPS), n = sheet.getLastRow() - 1;
      if (n > 0) {
        var vals = sheet.getRange(2, 1, n, 7).getValues(), k = BM.norm(mot);
        vals.forEach(function (r, i) {
          if (r[0] === '') return;
          var lib = String(r[3]);
          if (BM.norm(lib).indexOf(k) === -1) return;
          if (compte && String(r[2]) !== compte) return;
          var eligible = BM.isUnclassified(r[5]) || (toutes && String(r[6]) !== 'Manuel');
          if (!eligible) return;
          var nc = BM.categorize(lib, num_(r[4]), String(r[2]), prepared).cat;
          if (nc !== String(r[5])) { sheet.getRange(i + 2, 6, 1, 2).setValues([[nc, 'Règle']]); changed.push({ id: String(r[0]), cat: nc }); }
        });
      }
    }
    log_(user, 'Règle', mot + ' → ' + cat + (compte ? ' (' + compte + ')' : '') + ' ; ' + changed.length + ' opération(s) reclassée(s)');
    return changed;
  } finally { lock.releaseLock(); }
}
/** Réapplique toutes les règles aux opérations d'origine « Règle » (les choix manuels sont préservés). */
function reapplyRules_(user, onlyUnclassified) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var prepared = BM.prepareRules(readRegles_()), sheet = sh_(SH.OPS), n = sheet.getLastRow() - 1, changed = [];
    if (n < 1) return changed;
    var rng = sheet.getRange(2, 1, n, 7), vals = rng.getValues(), dirty = false;
    vals.forEach(function (r) {
      if (r[0] === '' || String(r[6]) === 'Manuel') return;
      if (onlyUnclassified && !BM.isUnclassified(r[5])) return;
      var nc = BM.categorize(String(r[3]), num_(r[4]), String(r[2]), prepared).cat;
      if (nc !== String(r[5])) { r[5] = nc; r[6] = 'Règle'; changed.push({ id: String(r[0]), cat: nc }); dirty = true; }
    });
    if (dirty) sheet.getRange(2, 6, n, 2).setValues(vals.map(function (r) { return [r[5], r[6]]; }));
    log_(user, 'Règles réappliquées', changed.length + ' opération(s) reclassée(s)');
    return changed;
  } finally { lock.releaseLock(); }
}

/* ------ Enregistrement générique d'une ligne de paramétrage (upsert par clé) ------ */
var TABLES = {
  COMPTES: { key: 0, toRow: function (o) { return [o.nom, o.banque, o.titulaire, o.nature, BM.r2(o.soldeRef), s2d_(o.dateRef), o.actif === false ? 'Non' : 'Oui', o.no || '', o.origine || '', s2d_(o.couvert)]; } },
  CATEGORIES: { key: 1, toRow: function (o) { return [o.groupe, o.nom, o.type, o.nature, BM.r2(o.enveloppe), o.rattache ? 'Oui' : 'Non', o.icone || '']; } },
  ECHEANCES: { key: 0, toRow: function (o) { return [o.id, o.lib, o.cat, o.compte, BM.r2(Math.abs(o.montant)), o.sens, o.periodicite, o.jour, o.moisDepart || '', s2d_(o.fin), o.actif === false ? 'Non' : 'Oui', o.comm || '']; } },
  PRETS: { key: 0, toRow: function (o) { return [o.id, o.nom, o.preteur, o.compte, BM.r2(o.mensualite), o.jour, s2d_(o.debut), s2d_(o.fin), o.capital == null ? '' : o.capital, o.taux == null ? '' : o.taux, o.crd == null ? '' : o.crd, s2d_(o.dateCrd), o.motcle || '', o.modulable || '', o.cat || '', o.comm || '']; } },
  OBJECTIFS: { key: 0, toRow: function (o) { return [o.id, o.nom, BM.r2(o.cible), s2d_(o.date), o.compte || '', BM.r2(o.deja || 0), o.icone || '', o.actif === false ? 'Non' : 'Oui']; } }
};
function upsertRow_(table, obj, oldKey, user) {
  var def = TABLES[table]; if (!def) throw new Error('Table inconnue : ' + table);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var sheet = sh_(table), n = sheet.getLastRow() - 1, row = null, key = oldKey != null ? oldKey : def.toRow(obj)[def.key];
    if (!key && def.key === 0 && (table === 'ECHEANCES' || table === 'PRETS' || table === 'OBJECTIFS')) {
      obj.id = { ECHEANCES: 'E', PRETS: 'P', OBJECTIFS: 'G' }[table] + Utilities.getUuid().slice(0, 6).toUpperCase();
      key = obj.id;
    }
    if (n > 0) sheet.getRange(2, def.key + 1, n, 1).getValues().forEach(function (r, i) { if (String(r[0]) === String(key)) row = i + 2; });
    var values = def.toRow(obj);
    if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
    else { row = sheet.getLastRow() + 1; sheet.getRange(row, 1, 1, values.length).setValues([values]); }
    sheet.getRange(row, 1, 1, values.length).getValues(); // force l'écriture
    // Renommage d'une catégorie : cascade sur opérations, règles, échéances
    if (table === 'CATEGORIES' && oldKey && oldKey !== obj.nom) renameCategory_(oldKey, obj.nom);
    if (table === 'COMPTES' && oldKey && oldKey !== obj.nom) renameCompte_(oldKey, obj.nom);
    log_(user, 'Paramétrage', table + ' : ' + key);
    return obj;
  } finally { lock.releaseLock(); }
}
function deleteRow_(table, key, user) {
  var def = TABLES[table]; if (!def) throw new Error('Table inconnue : ' + table);
  if (table === 'COMPTES' || table === 'CATEGORIES') {
    var used = readOps_().some(function (o) { return table === 'COMPTES' ? o.compte === key : o.cat === key; });
    if (used) throw new Error('« ' + key + ' » est utilisé par des opérations : désactivez-le ou renommez-le plutôt que de le supprimer.');
  }
  var sheet = sh_(table), n = sheet.getLastRow() - 1;
  if (n < 1) return false;
  var vals = sheet.getRange(2, def.key + 1, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]) === String(key)) { sheet.deleteRow(i + 2); log_(user, 'Suppression paramètre', table + ' : ' + key); return true; }
  return false;
}
function replaceInColumn_(sheetName, col, from, to) {
  var s = sh_(sheetName), n = s.getLastRow() - 1; if (n < 1) return;
  var rng = s.getRange(2, col, n, 1), v = rng.getValues(), dirty = false;
  v.forEach(function (r) { if (String(r[0]) === from) { r[0] = to; dirty = true; } });
  if (dirty) rng.setValues(v);
}
function renameCategory_(from, to) {
  replaceInColumn_(SH.OPS, 6, from, to); replaceInColumn_(SH.REG, 2, from, to);
  replaceInColumn_(SH.ECH, 3, from, to); replaceInColumn_(SH.PRE, 15, from, to);
}
function renameCompte_(from, to) {
  replaceInColumn_(SH.OPS, 3, from, to); replaceInColumn_(SH.REG, 3, from, to); replaceInColumn_(SH.ECH, 4, from, to);
  replaceInColumn_(SH.PRE, 4, from, to); replaceInColumn_(SH.OBJ, 5, from, to);
}
/** Met à jour plusieurs enveloppes en une écriture. items : [{nom, enveloppe}] */
function saveEnveloppes_(items, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var s = sh_(SH.CAT), n = s.getLastRow() - 1; if (n < 1) return 0;
    var rng = s.getRange(2, 1, n, 5), v = rng.getValues(), map = {}, k = 0;
    items.forEach(function (it) { map[it.nom] = BM.r2(num_(it.enveloppe)); });
    v.forEach(function (r) { if (map.hasOwnProperty(String(r[1]))) { r[4] = map[String(r[1])]; k++; } });
    rng.setValues(v);
    log_(user, 'Enveloppes', items.map(function (it) { return it.nom + ' = ' + it.enveloppe; }).join(' ; '));
    return k;
  } finally { lock.releaseLock(); }
}
/** Mémorise la date jusqu'à laquelle un relevé couvre le compte (ne recule jamais). */
function setCouverture_(compte, date, user) {
  var c = readComptes_().filter(function (x) { return x.nom === compte; })[0];
  if (!c || !date) return false;
  if (c.couvert && c.couvert >= date) return false;
  c.couvert = date; upsertRow_('COMPTES', c, c.nom, user);
  return true;
}
/** Supprime la dernière règle identique (mot-clé, catégorie, compte). */
function deleteRule_(mot, cat, compte, user) {
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var s = sh_(SH.REG), n = s.getLastRow() - 1; if (n < 1) return false;
    var v = s.getRange(2, 1, n, 3).getValues();
    for (var i = v.length - 1; i >= 0; i--) {
      if (String(v[i][0]) === String(mot) && String(v[i][1]) === String(cat) && String(v[i][2] || '') === String(compte || '')) {
        s.deleteRow(i + 2); log_(user, 'Règle supprimée', mot + ' → ' + cat); return true;
      }
    }
    return false;
  } finally { lock.releaseLock(); }
}
function saveParams_(p, user) {
  var sheet = sh_(SH.PAR), n = sheet.getLastRow() - 1, vals = n > 0 ? sheet.getRange(2, 1, n, 2).getValues() : [];
  Object.keys(PARAM_KEYS).forEach(function (label) {
    var k = PARAM_KEYS[label]; if (p[k] == null) return;
    var found = false;
    vals.forEach(function (r) { if (String(r[0]).trim() === label) { r[1] = p[k]; found = true; } });
    if (!found) vals.push([label, p[k]]);
  });
  if (vals.length) sheet.getRange(2, 1, vals.length, 2).setValues(vals);
  log_(user, 'Paramètres', JSON.stringify(p));
}

/* =====================================================================
   MENU DU CLASSEUR
   ===================================================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('💶 Budget Maison')
    .addItem('Actualiser le tableau de bord', 'menuTableau')
    .addItem("Importer l'onglet IMPORT", 'menuImport')
    .addItem('Réappliquer les règles aux opérations « À classer »', 'menuReapplyUnclassified')
    .addItem('Réappliquer toutes les règles (hors choix manuels)', 'menuReapplyAll')
    .addSeparator()
    .addItem("Codes d'accès de l'application…", 'menuCodes')
    .addItem('Installer / réparer', 'menuInstall')
    .addToUi();
}
function menuInstall() {
  var ss = ss_();
  Object.keys(HEADERS).forEach(function (name) {
    var s = ss.getSheetByName(name) || ss.insertSheet(name);
    var h = HEADERS[name];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#1f2a44').setFontColor('#ffffff').setWrap(true);
    s.setFrozenRows(1);
  });
  if (!ss.getSheetByName(SH.TAB)) ss.insertSheet(SH.TAB, 0);
  sh_(SH.OPS).getRange('H2:H').setNumberFormat('@');
  sh_(SH.ECH).getRange('I2:I').setNumberFormat('@');
  sh_(SH.CPT).getRange('H2:H').setNumberFormat('@');
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  // déclencheur quotidien du tableau de bord
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'menuTableau'; });
  if (!has) ScriptApp.newTrigger('menuTableau').timeBased().everyDays(1).atHour(6).create();
  buildTableau_();
  var users = api_users_();
  if (ss.getSpreadsheetTimeZone() !== 'Europe/Paris') ss.setSpreadsheetTimeZone('Europe/Paris');
  var tzS = Session.getScriptTimeZone(), tzC = ss.getSpreadsheetTimeZone();
  var tzMsg = tzS !== tzC ? '\n\n⚠️ Fuseau du script (' + tzS + ') différent de celui du classeur (' + tzC + '). Les dates restent justes (écriture à midi, lecture dans le fuseau du classeur), mais alignez-les : éditeur Apps Script › Paramètres du projet › Fuseau horaire = ' + tzC + '.' : '';
  uiAlert_('Installation terminée.' + tzMsg + '\n\n' + (Object.keys(users).length ? 'Codes d\'accès définis : ' + Object.keys(users).join(', ') :
    "Étape suivante : menu Budget Maison › Codes d'accès, puis Déployer › Nouveau déploiement › Application Web (voir le guide)."));
}
function menuTableau() { buildTableau_(); }
function menuReapplyUnclassified() { var c = reapplyRules_('Classeur', true); SpreadsheetApp.getUi().alert(c.length + ' opération(s) reclassée(s).'); }
function menuReapplyAll() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert('Réappliquer toutes les règles ?', 'Les catégories choisies à la main (origine « Manuel ») sont conservées. Les autres sont recalculées.', ui.ButtonSet.OK_CANCEL) !== ui.Button.OK) return;
  var c = reapplyRules_('Classeur', false); ui.alert(c.length + ' opération(s) reclassée(s).');
}
function menuImport() {
  var ui = SpreadsheetApp.getUi(), s = sh_(SH.IMP), n = s.getLastRow() - 1;
  if (n < 1) { ui.alert("L'onglet IMPORT est vide."); return; }
  var comptes = readComptes_().map(function (c) { return c.nom; }), rows = [], errs = [];
  s.getRange(2, 1, n, 6).getValues().forEach(function (r, i) {
    if (r[0] === '' && r[1] === '') return;
    var date = d2s_(r[0]), mt = r[2] !== '' ? num_(r[2]) : (num_(r[4]) - Math.abs(num_(r[3])));
    var compte = String(r[5]).trim();
    if (!date) errs.push('ligne ' + (i + 2) + ' : date illisible');
    else if (comptes.indexOf(compte) === -1) errs.push('ligne ' + (i + 2) + ' : compte inconnu « ' + compte + ' »');
    else rows.push({ date: date, lib: r[1], mt: mt, compte: compte });
  });
  if (errs.length) { ui.alert('Import annulé :\n' + errs.slice(0, 15).join('\n')); return; }
  var res = appendOps_(rows, 'Classeur ' + Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm'), 'Classeur');
  s.getRange(2, 1, n, 6).clearContent();
  buildTableau_();
  var ac = res.added.filter(function (o) { return BM.isUnclassified(o.cat); }).length;
  ui.alert(res.added.length + ' opération(s) ajoutée(s), ' + res.skipped + ' doublon(s) ou ligne(s) vide(s) ignorée(s).\n' + ac + ' opération(s) à classer.');
}
function menuCodes() {
  var ui = SpreadsheetApp.getUi();
  var users = api_users_();
  var r1 = ui.prompt("Codes d'accès", 'Utilisateurs actuels : ' + (Object.keys(users).join(', ') || 'aucun') +
    "\n\nPrénom de l'utilisateur à créer ou modifier (ex. Pierre) :", ui.ButtonSet.OK_CANCEL);
  if (r1.getSelectedButton() !== ui.Button.OK) return;
  var name = r1.getResponseText().trim(); if (!name) return;
  var r2 = ui.prompt('Code de ' + name, 'Code de 4 à 6 chiffres (laisser vide pour SUPPRIMER cet utilisateur) :', ui.ButtonSet.OK_CANCEL);
  if (r2.getSelectedButton() !== ui.Button.OK) return;
  var pin = r2.getResponseText().trim();
  if (!pin) { delete users[name]; api_saveUsers_(users); ui.alert(name + ' supprimé.'); return; }
  if (!/^\d{4,6}$/.test(pin)) { ui.alert('Le code doit contenir 4 à 6 chiffres.'); return; }
  var tits = {}; readComptes_().forEach(function (c) { tits[c.titulaire] = 1; });
  var r3 = ui.prompt('Accès de ' + name, 'Laisser vide = accès COMPLET (tous les comptes, paramétrage).\n\nPour un accès RESTREINT à ses propres comptes, saisissez le titulaire concerné (' + Object.keys(tits).join(', ') + ') :', ui.ButtonSet.OK_CANCEL);
  if (r3.getSelectedButton() !== ui.Button.OK) return;
  var t = r3.getResponseText().trim();
  if (t && !tits[t]) { ui.alert('Titulaire inconnu : ' + t + '. Valeurs possibles : ' + Object.keys(tits).join(', ') + '.'); return; }
  users[name] = { h: api_hash_(name + '|' + pin), v: Date.now(), acces: t ? 'Restreint' : 'Complet', titulaire: t };
  api_saveUsers_(users);
  ui.alert('Code enregistré pour ' + name + (t ? ' (accès restreint aux comptes « ' + t + ' »)' : ' (accès complet)') + '. Les sessions déjà ouvertes de ' + name + ' devront se reconnecter.');
}

/* =====================================================================
   TABLEAU DE BORD (onglet TABLEAU) — valeurs + graphiques natifs
   ===================================================================== */
function computeMonthly_(ops, cats, params) {
  var cm = {}; cats.forEach(function (c) { cm[c.nom] = c; });
  var months = {};
  ops.forEach(function (o) {
    var c = cm[o.cat] || { type: o.mt >= 0 ? 'Recette' : 'Dépense', nature: 'Variable', groupe: '12 Divers' };
    var m = BM.budgetMonth(o.date, o.cat, o.moisForce, cm, params.jourBascule);
    var M = months[m] || (months[m] = { rec: 0, recExc: 0, dep: 0, epa: 0, proj: 0, groupes: {} });
    if (c.type === 'Recette') { if (BM.isRegularIncome(o.lib, o.cat, cm)) M.rec += o.mt; else M.recExc += o.mt; }
    else if (c.type === 'Dépense') { M.dep -= o.mt; M.groupes[c.groupe] = (M.groupes[c.groupe] || 0) - o.mt; }
    else if (c.type === 'Épargne') { M.epa -= o.mt; }
    else if (c.type === 'Projet') { M.proj -= o.mt; }
  });
  return months;
}
function buildTableau_() {
  var ss = ss_(), s = ss.getSheetByName(SH.TAB) || ss.insertSheet(SH.TAB, 0);
  s.getCharts().forEach(function (c) { s.removeChart(c); });
  s.clear();
  var params = readParams_(), ops = readOps_(), cats = readCategories_(), comptes = readComptes_(), prets = readPrets_();
  var today = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'), cur = BM.ym(today);
  var months = computeMonthly_(ops, cats, params);
  s.getRange('A1').setValue('TABLEAU DE BORD — ' + params.foyer).setFontSize(16).setFontWeight('bold').setFontColor('#1f2a44');
  s.getRange('A2').setValue('Actualisé le ' + Utilities.formatDate(new Date(), tz_(), "dd/MM/yyyy 'à' HH:mm") +
    ". Transferts internes, compte courant d'associé et chantier (type Projet) exclus. L'application offre la vue complète.").setFontColor('#52514e');
  // 1. Soldes
  s.getRange('A4').setValue('SOLDES DES COMPTES (aujourd\'hui)').setFontWeight('bold');
  var srows = [['Compte', 'Nature', 'Solde (€)', 'Dernière opération']];
  var totC = 0, totE = 0;
  comptes.filter(function (c) { return c.actif; }).forEach(function (c) {
    var b = BM.balanceAt(c, today, ops), last = '';
    ops.forEach(function (o) { if (o.compte === c.nom && o.date > last) last = o.date; });
    if (c.nature === 'Épargne') totE += b; else totC += b;
    srows.push([c.nom, c.nature, b, last ? s2d_(last) : '']);
  });
  srows.push(['TOTAL COMPTES COURANTS', '', BM.r2(totC), '']);
  srows.push(['TOTAL ÉPARGNE', '', BM.r2(totE), '']);
  s.getRange(5, 1, srows.length, 4).setValues(srows);
  s.getRange(5, 1, 1, 4).setFontWeight('bold').setBackground('#e8ecf5');
  s.getRange(6, 3, srows.length - 1, 1).setNumberFormat('#,##0.00 €;[Red]-#,##0.00 €');
  s.getRange(6, 4, srows.length - 1, 1).setNumberFormat('dd/MM/yyyy');
  s.getRange(5 + srows.length - 2, 1, 2, 4).setFontWeight('bold');
  // 2. Historique 24 mois (sans en-tête dans la plage des graphiques)
  var r0 = 5 + srows.length + 2;
  s.getRange(r0, 1).setValue('HISTORIQUE — 24 DERNIERS MOIS').setFontWeight('bold');
  var head = ['Mois', 'Recettes régulières (€)', 'Exceptionnel et espèces (€)', 'Dépenses (€)', 'Épargne (€)', 'Solde courant (€)', "Taux d'épargne"];
  s.getRange(r0 + 1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8ecf5').setWrap(true);
  var hist = [];
  for (var i = 23; i >= 0; i--) {
    var m = BM.addMonths(cur, -i), M = months[m] || { rec: 0, recExc: 0, dep: 0, epa: 0 };
    var solde = M.rec + M.recExc - M.dep - M.epa;
    hist.push([m, BM.r2(M.rec), BM.r2(M.recExc), BM.r2(M.dep), BM.r2(M.epa), BM.r2(solde), M.rec > 0 ? (M.rec - M.dep) / M.rec : '']);
  }
  s.getRange(r0 + 2, 1, hist.length, head.length).setValues(hist);
  s.getRange(r0 + 2, 1, hist.length, 1).setNumberFormat('@');
  s.getRange(r0 + 2, 2, hist.length, 5).setNumberFormat('#,##0 €;[Red]-#,##0 €');
  s.getRange(r0 + 2, 7, hist.length, 1).setNumberFormat('0 %;[Red]-0 %');
  // 3. Dépenses par groupe (12 derniers mois complets)
  var g0 = r0 + 2 + hist.length + 2;
  s.getRange(g0, 1).setValue('DÉPENSES PAR GROUPE — 12 DERNIERS MOIS COMPLETS').setFontWeight('bold');
  s.getRange(g0 + 1, 1, 1, 3).setValues([['Groupe', 'Total 12 mois (€)', 'Moyenne / mois (€)']]).setFontWeight('bold').setBackground('#e8ecf5');
  var tot = {};
  for (var j = 1; j <= 12; j++) { var MM = months[BM.addMonths(cur, -j)]; if (MM) Object.keys(MM.groupes).forEach(function (g) { tot[g] = (tot[g] || 0) + MM.groupes[g]; }); }
  var grows = Object.keys(tot).filter(function (g) { return tot[g] > 0; }).sort().map(function (g) { return [g, BM.r2(tot[g]), BM.r2(tot[g] / 12)]; });
  if (grows.length) {
    s.getRange(g0 + 2, 1, grows.length, 3).setValues(grows);
    s.getRange(g0 + 2, 2, grows.length, 2).setNumberFormat('#,##0 €');
  }
  // 4. Prêts
  var p0 = g0 + 2 + Math.max(grows.length, 1) + 2;
  s.getRange(p0, 1).setValue('PRÊTS').setFontWeight('bold');
  var prow = [['Prêt', 'Mensualité (€)', 'Mensualités restantes', 'Reste à payer (€)', 'Capital restant dû estimé (€)', 'Fin']];
  prets.forEach(function (p) {
    var st = BM.loanStatus(p, today, ops);
    prow.push([p.nom, p.mensualite, st.restantMois == null ? 'date de fin à saisir' : st.restantMois,
      st.resteAPayer == null ? '' : st.resteAPayer, st.crd == null ? '' : st.crd, st.fin ? s2d_(st.fin) : '']);
  });
  s.getRange(p0 + 1, 1, prow.length, 6).setValues(prow);
  s.getRange(p0 + 1, 1, 1, 6).setFontWeight('bold').setBackground('#e8ecf5').setWrap(true);
  if (prow.length > 1) {
    s.getRange(p0 + 2, 2, prow.length - 1, 1).setNumberFormat('#,##0.00 €');
    s.getRange(p0 + 2, 4, prow.length - 1, 2).setNumberFormat('#,##0 €');
    s.getRange(p0 + 2, 6, prow.length - 1, 1).setNumberFormat('dd/MM/yyyy');
  }
  s.setColumnWidth(1, 250); for (var c = 2; c <= 7; c++) s.setColumnWidth(c, 130);
  // Graphiques (plages de données sans ligne d'en-tête)
  var n = hist.length;
  var ch1 = s.newChart().setChartType(Charts.ChartType.COLUMN)
    .addRange(s.getRange(r0 + 2, 1, n, 1)).addRange(s.getRange(r0 + 2, 2, n, 1)).addRange(s.getRange(r0 + 2, 4, n, 1))
    .setOption('title', 'Recettes régulières et dépenses — 24 mois')
    .setOption('series', { 0: { labelInLegend: 'Recettes régulières', color: '#2a78d6' }, 1: { labelInLegend: 'Dépenses', color: '#eb6834' } })
    .setOption('legend', { position: 'top' }).setOption('width', 760).setOption('height', 320)
    .setPosition(4, 9, 0, 0).build();
  s.insertChart(ch1);
  if (grows.length) {
    var ch2 = s.newChart().setChartType(Charts.ChartType.PIE)
      .addRange(s.getRange(g0 + 2, 1, grows.length, 1)).addRange(s.getRange(g0 + 2, 2, grows.length, 1))
      .setOption('title', 'Répartition des dépenses — 12 mois').setOption('pieHole', 0.45)
      .setOption('width', 760).setOption('height', 320).setPosition(22, 9, 0, 0).build();
    s.insertChart(ch2);
  }
}
