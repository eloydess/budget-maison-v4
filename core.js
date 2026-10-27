/* ===================== Budget Maison v4 — cœur (état, API, calculs, suggestions) ===================== */
var App = window.App = (function () {
  'use strict';
  var S = {
    api: '', token: '', user: '', data: null, ops: [], catMap: {}, comptesMap: {}, stats: {}, months: [],
    today: BM.ymd(new Date()), month: null, view: 'home', online: navigator.onLine, syncedAt: null, syncing: false
  };

  /* ---------------- Stockage local (sécurisé) ---------------- */
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('bm4_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('bm4_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
    del: function (k) { try { localStorage.removeItem('bm4_' + k); } catch (e) { /* */ } }
  };

  /* ---------------- Formats ---------------- */
  var nf2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var nf0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  function eur(v, dec) { v = +v || 0; if (Math.abs(v) < 0.005) v = 0; return (dec === 0 ? nf0 : nf2).format(v); }
  function eur0(v) { return eur(v, 0); }
  function sgn(v, dec) { return (v > 0 ? '+' : '') + eur(v, dec); }
  function pct(v, d) { return (isFinite(v) ? (v * 100).toFixed(d == null ? 0 : d).replace('.', ',') : '–') + ' %'; }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function monthLabel(m, short) { var i = +m.slice(5, 7) - 1; return (short ? MOIS_C[i] : MOIS[i]) + ' ' + (short ? m.slice(2, 4) : m.slice(0, 4)); }
  function dateLabel(d, withYear) {
    var p = d.split('-'); return +p[2] + ' ' + MOIS_C[+p[1] - 1] + (withYear ? ' ' + p[0] : '');
  }
  function dayName(d) { return ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][BM.parseYmd(d).getDay()]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- Couleurs (suivent l'entité, jamais le rang) ---------------- */
  var GROUP_COLOR = { '02 Logement': 'var(--s1)', '10 Financier': 'var(--s2)', '04 Alimentation': 'var(--s3)', '08 Vie courante': 'var(--s4)',
    '05 Enfants': 'var(--s5)', '07 Abonnements': 'var(--s6)', '09 Loisirs': 'var(--s7)' };
  function groupColor(g) { return GROUP_COLOR[g] || 'var(--s0)'; }
  function groupLabel(g) { return String(g || '').replace(/^\d+\s*/, ''); }

  /* ---------------- API ---------------- */
  function api(action, payload) {
    if (!S.api) return Promise.reject(new Error("Adresse du serveur non renseignée."));
    var body = Object.assign({ action: action, token: S.token }, payload || {});
    return fetch(S.api, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Serveur injoignable (' + r.status + ').'); return r.json(); })
      .then(function (j) {
        if (!j.ok) {
          if (j.auth === false) { S.token = ''; LS.del('token'); if (App.onLogout) App.onLogout(j.error); }
          throw new Error(j.error || 'Erreur serveur.');
        }
        return j;
      }, function (e) {
        if (e instanceof TypeError) throw new Error('Pas de connexion au serveur. Vérifiez le réseau.');
        throw e;
      });
  }

  /* ---------------- Préparation des données ---------------- */
  function load(data) {
    S.data = data;
    S.today = data.today || BM.ymd(new Date());
    S.catMap = {};
    data.categories.forEach(function (c) { S.catMap[c.nom] = c; });
    S.comptesMap = {};
    data.comptes.forEach(function (c) { S.comptesMap[c.nom] = c; });
    S.ops = data.ops.map(function (a) { return enrich({ id: a[0], date: a[1], compte: a[2], lib: a[3], mt: a[4], cat: a[5], manuel: !!a[6], moisForce: a[7] || '', comm: a[8] || '' }); });
    sortOps();
    S.rules = BM.prepareRules(data.regles);
    recompute();
    if (!S.month || S.month > BM.ym(S.today)) S.month = BM.ym(S.today);
  }
  function enrich(o) {
    var c = S.catMap[o.cat] || { type: o.mt >= 0 ? 'Recette' : 'Dépense', nature: 'Variable', groupe: '12 Divers', icone: '📦' };
    o.type = c.type; o.groupe = c.groupe; o.nature = c.nature; o.icone = c.icone;
    o.m = BM.budgetMonth(o.date, o.cat, o.moisForce, S.catMap, S.data.params.jourBascule);
    return o;
  }
  function sortOps() { S.ops.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); }); }
  function saveCache() {
    var d = S.data;
    d.ops = S.ops.map(function (o) { return [o.id, o.date, o.compte, o.lib, o.mt, o.cat, o.manuel ? 1 : 0, o.moisForce, o.comm]; });
    LS.set('cache', d); LS.set('syncedAt', S.syncedAt);
  }
  /** Montant « budgétaire » : positif = sortie pour Dépense/Épargne/Projet, positif = entrée pour Recette. */
  function amt(o) { return o.type === 'Recette' ? o.mt : (o.type === 'Transfert' ? 0 : -o.mt); }

  /** Catégories qui portent les remboursements de prêts et l'assurance emprunteur (charges de crédit). */
  var LOAN_CATS = ['Loyer / Crédit immobilier', 'Remboursement crédit conso', 'Crédit / Location véhicule', 'Assurance emprunteur'];
  function recompute() {
    var st = {}, last = {};
    S.ops.forEach(function (o) {
      if (!last[o.compte] || o.date > last[o.compte]) last[o.compte] = o.date;
      var M = st[o.m] || (st[o.m] = { rec: 0, recReg: 0, recExc: 0, esp: 0, dep: 0, depFixe: 0, depVar: 0, epa: 0, proj: 0, cca: 0, loan: 0, proc: 0, cats: {}, groups: {}, n: 0, todo: 0 });
      M.n++;
      if (BM.isUnclassified(o.cat)) M.todo++;
      var a = amt(o);
      if (o.type === 'Recette') { M.rec += a; if (BM.isRegularIncome(o.lib, o.cat, S.catMap)) M.recReg += a; else { M.recExc += a; if (BM.norm(o.lib).indexOf('VERSEMENT') !== -1) M.esp += a; } }
      else if (o.type === 'Dépense') { M.dep += a; if (LOAN_CATS.indexOf(o.cat) !== -1) M.loan += a; if (o.nature === 'Fixe') M.depFixe += a; else M.depVar += a; M.groups[o.groupe] = (M.groups[o.groupe] || 0) + a; }
      else if (o.type === 'Épargne') M.epa += a;
      else if (o.type === 'Projet') M.proj += a;
      else if (o.type === 'Transfert' && o.cat === "Compte courant d'associé") M.cca -= o.mt;
      if ((o.type === 'Dépense' || o.type === 'Projet') && /^13/.test(o.groupe || '')) M.proc += a;
      if (o.type !== 'Transfert') M.cats[o.cat] = (M.cats[o.cat] || 0) + a;
    });
    S.stats = st; S.lastDate = last;
    // Fraîcheur des données par compte : la plus récente entre la dernière opération et la date de couverture du dernier relevé
    S.fresh = {};
    S.data.comptes.forEach(function (c) { var a = last[c.nom] || '', b = c.couvert || ''; S.fresh[c.nom] = a > b ? a : b; });
    S.months = Object.keys(st).sort();
    S.balances = {};
    S.data.comptes.forEach(function (c) { S.balances[c.nom] = BM.balanceAt(c, S.today, S.ops); });
    S.loanSt = {};
    S.data.prets.forEach(function (p) { S.loanSt[p.id] = BM.loanStatus(p, S.today, S.ops); });
    S._cache = {};
  }
  function M(m) { return S.stats[m] || { rec: 0, recReg: 0, recExc: 0, esp: 0, dep: 0, depFixe: 0, depVar: 0, epa: 0, proj: 0, cca: 0, loan: 0, proc: 0, cats: {}, groups: {}, n: 0, todo: 0 }; }
  /** Mois complets précédant le mois courant (n derniers). */
  function lastMonths(n, from) { var out = [], cur = from || BM.ym(S.today); for (var i = 1; i <= n; i++) out.push(BM.addMonths(cur, -i)); return out; }
  function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }), k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  function catHistory(cat, n, from) { return lastMonths(n, from).reverse().map(function (m) { return BM.r2(M(m).cats[cat] || 0); }); }

  /* ---------------- Échéances et prêts : événements attendus ---------------- */
  function loanCat(p) { return p.cat || 'Remboursement crédit conso'; }
  function events(from, to) {
    var out = [];
    S.data.echeances.forEach(function (e) {
      if (!e.actif) return;
      BM.occurrences(e, from, to).forEach(function (d) {
        var v = e.sens === 'Crédit' ? e.montant : -e.montant;
        out.push({ key: e.id + '@' + d, src: 'ech', ref: e, date: d, lib: e.lib, mt: v, compte: e.compte, cat: e.cat, bm: BM.budgetMonth(d, e.cat, '', S.catMap, S.data.params.jourBascule) });
      });
    });
    S.data.prets.forEach(function (p) {
      var st = S.loanSt[p.id]; if (st && st.restantMois === 0) return;
      BM.occurrences({ periodicite: 'Mensuelle', jour: p.jour, fin: st && st.fin }, from, to).forEach(function (d) {
        out.push({ key: p.id + '@' + d, src: 'pret', ref: p, date: d, lib: p.nom, mt: -p.mensualite, compte: p.compte, cat: loanCat(p), bm: BM.budgetMonth(d, loanCat(p), '', S.catMap, S.data.params.jourBascule) });
      });
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  /** Rapproche chaque événement d'une opération réelle (même compte, même sens, ±12 j, montant ou catégorie). */
  function matchEvents(evs) {
    var used = {};
    evs.forEach(function (ev) {
      var best = null, bestScore = 1e9;
      var lo = BM.addDays(ev.date, -12), hi = BM.addDays(ev.date, 12);
      for (var i = 0; i < S.ops.length; i++) {
        var o = S.ops[i];
        if (o.date < lo) break; // S.ops trié du plus récent au plus ancien
        if (o.date > hi || used[o.id] || o.compte !== ev.compte || (o.mt > 0) !== (ev.mt > 0)) continue;
        var diff = Math.abs(Math.abs(o.mt) - Math.abs(ev.mt)) / Math.max(1, Math.abs(ev.mt));
        var ok = ev.src === 'pret' ? diff <= 0.02 : (diff <= 0.03 || (o.cat === ev.cat && diff <= 0.35));
        if (!ok) continue;
        var score = Math.abs(BM.diffDays(o.date, ev.date)) + diff * 20;
        if (score < bestScore) { bestScore = score; best = o; }
      }
      if (best) { used[best.id] = true; ev.paid = best; }
    });
    return evs;
  }

  /* ---------------- Reste à vivre du mois ---------------- */
  function monthView(m) {
    var key = 'mv' + m; if (S._cache[key]) return S._cache[key];
    var st = M(m), cur = BM.ym(S.today), isCur = m === cur, isPast = m < cur;
    var from = BM.addDays(m + '-01', -20), to = BM.addDays(BM.dayOf(m, 31), 20);
    var evs = matchEvents(events(from, to)).filter(function (e) { return e.bm === m; });
    var pendIn = 0, pendOut = 0, pending = [];
    if (!isPast) evs.forEach(function (e) {
      if (e.paid) return;
      var lastC = S.fresh[e.compte] || '0000';
      if (e.date < S.today && e.date <= BM.addDays(lastC, -2)) { e.missed = true; return; } // échéance passée, relevé importé après : non retrouvée
      pending.push(e);
      if (e.mt > 0) pendIn += e.mt; else pendOut -= e.mt;
    });
    var rec = st.rec, sorties = st.dep + st.epa;
    var rav = rec + pendIn - sorties - pendOut;
    // Enveloppes variables restantes (dépenses non encore faites mais prévues)
    var envRest = 0;
    S.data.categories.forEach(function (c) {
      if (c.type !== 'Dépense' || c.nature !== 'Variable' || !c.enveloppe) return;
      envRest += Math.max(0, c.enveloppe - (st.cats[c.nom] || 0));
    });
    var dim = BM.daysInMonth(m), day = isCur ? +S.today.slice(8, 10) : dim;
    var daysLeft = isCur ? dim - day + 1 : 0;
    var res = { m: m, st: st, isCur: isCur, isPast: isPast, evs: evs, pending: pending, pendIn: pendIn, pendOut: pendOut, rec: rec, sorties: sorties,
      rav: rav, envRest: isPast ? 0 : envRest, ravApresEnv: rav - (isPast ? 0 : envRest), daysLeft: daysLeft, elapsed: day / dim,
      perDay: daysLeft > 0 ? rav / daysLeft : null };
    var seuil = S.data.params.seuilRAV || 0;
    res.status = rav < 0 ? 'bad' : rav < seuil ? 'warn' : 'good';
    S._cache[key] = res;
    return res;
  }
  /** Suivi d'une enveloppe (catégorie) pour un mois. */
  function envelope(c, m) {
    var mv = monthView(m), spent = M(m).cats[c.nom] || 0, env = c.enveloppe || 0;
    var out = { cat: c, spent: spent, env: env, rest: env - spent, ratio: env ? spent / env : (spent > 0 ? Infinity : 0) };
    if (c.type === 'Recette') { out.status = !env ? 'none' : spent >= env ? 'good' : (mv.isPast ? 'warn' : 'none'); return out; }
    if (!env) { out.status = spent > 0 ? 'warn' : 'none'; return out; }
    var el = mv.isCur ? mv.elapsed : 1;
    out.projected = c.nature === 'Variable' && mv.isCur ? spent / Math.max(el, 0.25) : spent;
    if (spent > env * 1.005) out.status = 'bad';
    else if (c.nature === 'Variable' && mv.isCur && out.projected > env * 1.05) out.status = 'warn';
    else if (spent > env * 0.9 && c.nature === 'Variable') out.status = 'warn';
    else out.status = 'good';
    return out;
  }

  /* ---------------- Trésorerie prévisionnelle ---------------- */
  function projection(H) {
    H = H || S.data.params.horizon || 90;
    var key = 'proj' + H; if (S._cache[key]) return S._cache[key];
    var today = S.today, end = BM.addDays(today, H);
    var comptes = S.data.comptes.filter(function (c) { return c.actif && c.nature !== 'Épargne'; });
    var names = comptes.map(function (c) { return c.nom; });
    // Dépenses variables quotidiennes (90 derniers jours de données), hors opérations rapprochées d'une échéance
    var evPast = matchEvents(events(BM.addDays(today, -110), today));
    var matched = {}; evPast.forEach(function (e) { if (e.paid) matched[e.paid.id] = true; });
    var daily = {};
    names.forEach(function (n) {
      var lastC = S.lastDate[n] || today, from = BM.addDays(lastC, -90), sum = 0;
      S.ops.forEach(function (o) {
        if (o.compte !== n || o.date <= from || o.date > lastC || matched[o.id]) return;
        if (o.type === 'Dépense' && o.nature !== 'Fixe') sum += -o.mt;
      });
      daily[n] = Math.max(0, sum / 90);
    });
    // Échéances futures + échéances du mois en cours non encore constatées
    var evs = matchEvents(events(BM.addDays(today, -35), end)).filter(function (e) {
      if (names.indexOf(e.compte) === -1 || e.paid) return false;
      if (e.date > today) return true;
      return e.date >= BM.addDays(S.fresh[e.compte] || '0000-01-01', -2); // pas encore visible car relevé non importé
    });
    var days = [], bal = {}, series = {}, total = [];
    names.forEach(function (n) {
      bal[n] = S.balances[n];
      var gap = Math.max(0, BM.diffDays(S.fresh[n] || today, today));
      bal[n] -= daily[n] * gap; // dépenses courantes déjà faites mais pas encore importées
      series[n] = [];
    });
    var byDay = {}; evs.forEach(function (e) { var d = e.date <= today ? BM.addDays(today, 1) : e.date; (byDay[d] = byDay[d] || []).push(e); });
    for (var i = 0; i <= H; i++) {
      var d = BM.addDays(today, i);
      if (i > 0) names.forEach(function (n) { bal[n] -= daily[n]; });
      (byDay[d] || []).forEach(function (e) { bal[e.compte] += e.mt; });
      days.push(d);
      var t = 0; names.forEach(function (n) { series[n].push(BM.r2(bal[n])); t += bal[n]; });
      total.push(BM.r2(t));
    }
    var minI = 0; total.forEach(function (v, i) { if (v < total[minI]) minI = i; });
    // Plan de virements sur 35 jours : chaque compte doit rester au-dessus du coussin (virements internes non modélisés)
    var coussin = S.data.params.coussin || 0, W = Math.min(35, H), needs = [], surplus = [];
    names.forEach(function (n) {
      var s = series[n].slice(0, W + 1), mn = Math.min.apply(null, s), mi = s.indexOf(mn);
      var hasDebit = evs.some(function (e) { return e.compte === n && e.mt < 0 && e.date <= days[W]; });
      var floor = hasDebit ? coussin : 0, first = -1;
      for (var i = 0; i < s.length; i++) if (s[i] < floor) { first = i; break; }
      if (first >= 0) needs.push({ compte: n, date: days[first], min: mn, minDate: days[mi], need: Math.ceil((floor - mn) / 10) * 10, negative: mn < 0 });
      else if (mn - coussin > 0) surplus.push({ compte: n, dispo: mn - coussin });
    });
    needs.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    surplus.sort(function (a, b) { return b.dispo - a.dispo; });
    var plan = needs.map(function (x) {
      var left = x.need, from = [];
      surplus.forEach(function (sp) { if (left <= 0 || sp.dispo <= 0) return; var t = Math.min(left, sp.dispo); sp.dispo -= t; left -= t; from.push({ compte: sp.compte, montant: t }); });
      return Object.assign({ from: from, uncovered: left }, x);
    });
    var alerts = plan;
    var res = { days: days, total: total, series: series, names: names, minI: minI, events: evs, daily: daily, alerts: alerts, plan: plan, window: W };
    S._cache[key] = res;
    return res;
  }

  /* ---------------- Prêts et endettement ---------------- */
  function revenusReguliers() {
    var decl = 0;
    S.data.echeances.forEach(function (e) { if (e.actif && e.sens === 'Crédit') decl += e.montant / (BM.PERIODES[e.periodicite] || 1); });
    var mesure = avg(lastMonths(6).map(function (m) { return M(m).recReg; }));
    return { declares: BM.r2(decl), mesures: BM.r2(mesure), retenus: BM.r2(decl || mesure) };
  }
  function debt() {
    var tot = 0, crd = 0, crdKnown = true, reste = 0, resteKnown = true, list = [];
    S.data.prets.forEach(function (p) {
      var st = S.loanSt[p.id];
      if (st.restantMois === 0) return;
      tot += p.mensualite;
      if (st.crd != null) crd += st.crd; else crdKnown = false;
      if (st.resteAPayer != null) reste += st.resteAPayer; else resteKnown = false;
      list.push({ p: p, st: st });
    });
    var rv = revenusReguliers();
    var effort = rv.retenus ? tot / rv.retenus : null;
    // Échéancier des mensualités (escalier) sur les mois à venir
    var horizon = 0; list.forEach(function (x) { if (x.st.restantMois) horizon = Math.max(horizon, x.st.restantMois); });
    horizon = Math.min(Math.max(horizon, 12), 240);
    var cur = BM.ym(S.today), labels = [], values = [];
    for (var i = 0; i < horizon; i++) {
      var mm = BM.addMonths(cur, i + 1), v = 0;
      list.forEach(function (x) { if (x.st.restantMois == null || i < x.st.restantMois) v += x.p.mensualite; });
      labels.push(mm); values.push(BM.r2(v));
    }
    var ends = list.filter(function (x) { return x.st.fin; }).map(function (x) { return { p: x.p, fin: x.st.fin, gain: x.p.mensualite }; })
      .sort(function (a, b) { return a.fin < b.fin ? -1 : 1; });
    return { total: BM.r2(tot), crd: BM.r2(crd), crdKnown: crdKnown, reste: BM.r2(reste), resteKnown: resteKnown, list: list, rv: rv, effort: effort, labels: labels, values: values, ends: ends };
  }

  /* ---------------- Autonomie de trésorerie (repris de l'appli mobile v3.x) ----------------
     Patrimoine disponible (comptes courants + épargne) divisé par le déficit mensuel habituel
     (revenus réguliers − sorties, moyenne des 3 derniers mois complets). */
  function autonomy() {
    var pat = 0; S.data.comptes.forEach(function (c) { if (c.actif) pat += S.balances[c.nom] || 0; });
    var ms = lastMonths(3), socle = avg(ms.map(function (m) { return M(m).recReg; })), sorties = avg(ms.map(function (m) { return M(m).dep + M(m).proj + Math.max(0, M(m).cca); })); // v5 : l'épargne reste dans le patrimoine, elle n'est plus comptée comme sortie
    var deficit = socle - sorties;
    return { patrimoine: BM.r2(pat), socle: BM.r2(socle), sorties: BM.r2(sorties), deficit: BM.r2(deficit), mois: deficit < 0 && pat > 0 ? pat / -deficit : null };
  }

  /* ---------------- Pilotage v5 : « gagne-t-on du terrain ? » ----------------
     Chaque indicateur donne : base (valeur et période), comparaison (référence), écart, sens. */
  function pilotage() {
    if (S._cache.pil) return S._cache.pil;
    var P = S.data.params, dt = debt(), rv = revenusReguliers(), plan = S.data.plan || [];
    var assur = 0;
    S.data.echeances.forEach(function (e) { if (e.actif && e.sens !== 'Crédit' && e.cat === 'Assurance emprunteur') assur += e.montant / (BM.PERIODES[e.periodicite] || 1); });
    var charges = BM.r2(dt.total + assur), seuil = (P.seuilEffort || 35) / 100;
    function row(m) {
      var x = M(m);
      return { m: m, recReg: BM.r2(x.recReg), recExc: BM.r2(x.recExc), loan: BM.r2(x.loan), vie: BM.r2(x.dep - x.loan), proc: BM.r2(x.proc + Math.max(0, x.cca)),
        travaux: BM.r2(x.proj - x.proc), epa: BM.r2(x.epa), struct: BM.r2(x.recReg - x.dep), apres: BM.r2(x.recReg - x.dep - x.proj - Math.max(0, x.cca)) };
    }
    var cur = BM.ym(S.today), last = BM.addMonths(cur, -1);
    var serie = lastMonths(12).reverse().map(row);
    var ms3 = lastMonths(3), prev3 = lastMonths(3, BM.addMonths(cur, -3));
    function a3(k, list) { return BM.r2(avg((list || ms3).map(function (m) { return row(m)[k]; }))); }
    // Liquidités et dette
    var cour = 0, epa = 0, liqPlan = 0;
    var planDate = P.planDate || '';
    S.data.comptes.forEach(function (c) {
      if (!c.actif) return;
      var b = S.balances[c.nom] || 0;
      if (c.nature === 'Épargne') epa += b; else cour += b;
      if (planDate) liqPlan += BM.balanceAt(c, planDate, S.ops);
    });
    var liq = BM.r2(cour + epa); liqPlan = BM.r2(liqPlan);
    var dette = dt.crd, dettePlan = P.planDette || null;
    var netNow = BM.r2(liq - dette), netPlan = dettePlan != null && planDate ? BM.r2(liqPlan - dettePlan) : null;
    var vieRef = P.plafondVie || 0, precM = P.precautionMois || 3;
    var precMois = vieRef ? epa / vieRef : null;
    var au = autonomy();
    var I = {
      effort: { v: rv.retenus ? charges / rv.retenus : null, base: charges, rev: rv.retenus, seuil: seuil, ecart: BM.r2(charges - seuil * rv.retenus) },
      vie: { v: a3('vie'), last: row(last).vie, ref: vieRef, ecart: BM.r2(a3('vie') - vieRef) },
      struct: { v: a3('struct'), prev: a3('struct', prev3), last: row(last).struct },
      proc: { v: a3('proc'), prev: a3('proc', prev3), last: row(last).proc },
      travaux: { v: a3('travaux') },
      exc: { v: a3('recExc'), prev: a3('recExc', prev3), last: row(last).recExc },
      apres: { v: a3('apres'), prev: a3('apres', prev3) },
      dette: { v: dette, ref: dettePlan, ecart: dettePlan != null ? BM.r2(dette - dettePlan) : null, known: dt.crdKnown },
      liq: { v: liq, cour: BM.r2(cour), epa: BM.r2(epa), ref: planDate ? liqPlan : null, ecart: planDate ? BM.r2(liq - liqPlan) : null },
      net: { v: netNow, ref: netPlan, ecart: netPlan != null ? BM.r2(netNow - netPlan) : null },
      prec: { v: precMois, cible: precM, montant: BM.r2(epa), manque: vieRef ? BM.r2(Math.max(0, precM * vieRef - epa)) : null },
      auto: au
    };
    // Verdict : trois signaux, chacun vrai ou faux, sans note composite
    var sig = [
      { k: 'Patrimoine net (liquidités − dettes)', ok: I.net.ecart == null || S.today <= planDate ? null : I.net.ecart >= 0,
        txt: I.net.ecart == null ? 'référence de départ absente' : S.today <= planDate ? 'point de départ posé le ' + dateLabel(planDate, true) + ' : ' + eur0(I.net.ref) + ' ; premier constat au prochain import' : (I.net.ecart >= 0 ? 'en hausse de ' : 'en baisse de ') + eur0(Math.abs(I.net.ecart)) + ' depuis le ' + dateLabel(planDate, true) + ' (' + eur0(I.net.v) + ')' },
      { k: 'Le mois tient sur les revenus réguliers', ok: I.apres.v >= 0, txt: 'moyenne 3 mois : ' + sgn(I.apres.v, 0) + ' / mois (après procédure et travaux)' },
      { k: 'Vie courante sous le plafond', ok: vieRef ? I.vie.v <= vieRef : null, txt: vieRef ? eur0(I.vie.v) + ' / mois pour un plafond de ' + eur0(vieRef) : 'plafond non défini' }
    ];
    var nOk = sig.filter(function (s) { return s.ok === true; }).length, nKo = sig.filter(function (s) { return s.ok === false; }).length;
    var verdict = nKo === 0 && nOk ? 'good' : nOk === 0 ? 'bad' : 'warn';
    // Leviers du plan : non clos, triés par gain mensuel visé décroissant
    var open = plan.filter(function (a) { return ['Fait', 'Refusé', 'Abandonné', 'Utilisé'].indexOf(a.statut) === -1; })
      .sort(function (a, b) { return (b.gain || 0) - (a.gain || 0); });
    var gainOuvert = BM.r2(open.reduce(function (t, a) { return t + (a.gain || 0); }, 0));
    var gainObtenu = BM.r2(plan.filter(function (a) { return a.statut === 'Fait'; }).reduce(function (t, a) { return t + (a.gain || 0); }, 0));
    var res = { I: I, sig: sig, verdict: verdict, serie: serie, charges: charges, assur: BM.r2(assur), dt: dt, rv: rv, open: open, gainOuvert: gainOuvert, gainObtenu: gainObtenu, planDate: planDate,
      dus: plan.filter(function (a) { return a.retour && a.retour <= S.today && ['Fait', 'Refusé', 'Abandonné'].indexOf(a.statut) === -1; }) };
    S._cache.pil = res;
    return res;
  }
  /** Ordre de remboursement des prêts conso : avalanche (taux) et boule de neige (CRD), pour comparer. */
  function payoffOrder() {
    var list = S.data.prets.filter(function (p) { var st = S.loanSt[p.id]; return st && st.restantMois !== 0 && p.cat !== 'Loyer / Crédit immobilier'; })
      .map(function (p) { var st = S.loanSt[p.id]; return { p: p, crd: st.crd, taux: st.taux != null ? st.taux : p.taux, fin: st.fin, mois: st.restantMois }; });
    return {
      avalanche: list.slice().sort(function (a, b) { return (b.taux || 0) - (a.taux || 0); }),
      neige: list.slice().sort(function (a, b) { return (a.crd == null ? 1e12 : a.crd) - (b.crd == null ? 1e12 : b.crd); })
    };
  }
  /** Comparaison de 3 mois par groupe ; aDate = même quantième dans chaque mois. */
  function threeMonths(ref, aDate) {
    var cur = BM.ym(S.today), mois = [BM.addMonths(ref, -2), BM.addMonths(ref, -1), ref];
    var jour = ref === cur ? +S.today.slice(8, 10) : 31, G = {}, dep = [0, 0, 0], rec = [0, 0, 0];
    S.ops.forEach(function (o) {
      var k = mois.indexOf(o.m); if (k < 0) return;
      if (aDate && +o.date.slice(8, 10) > jour) return;
      var a = amt(o);
      if (o.type === 'Recette') { rec[k] += a; return; }
      if (o.type !== 'Dépense' && o.type !== 'Épargne') return;
      dep[k] += a;
      var g = G[o.groupe] || (G[o.groupe] = { nom: o.groupe, v: [0, 0, 0], cats: {} });
      g.v[k] += a;
      var c = g.cats[o.cat] || (g.cats[o.cat] = { nom: o.cat, v: [0, 0, 0] }); c.v[k] += a;
    });
    var groupes = Object.keys(G).map(function (k) { var g = G[k]; g.cats = Object.keys(g.cats).map(function (c) { return g.cats[c]; }).sort(function (a, b) { return b.v[2] - a.v[2]; }); return g; })
      .filter(function (g) { return Math.abs(g.v[0]) + Math.abs(g.v[1]) + Math.abs(g.v[2]) > 0.005; })
      .sort(function (a, b) { return (b.v[0] + b.v[1] + b.v[2]) - (a.v[0] + a.v[1] + a.v[2]); });
    return { mois: mois, jour: jour, partiel: ref === cur, groupes: groupes, dep: dep, rec: rec };
  }

  /* ---------------- Libellés ---------------- */
  var STOP = {};
  ('CARTE CB PRLV SEPA VIR VIREMENT VIREMENTS INST INSTANTANE PRELEVEMENT PRELEV EUROPEEN EUROPE DE DU LA LE LES DES M MME MR MLLE MONSIEUR MADAME PAIEMENT PAR FACTURE FACT RETRAIT DAB ECHEANCE REMISE VERS POUR RECU EMIS SCT TIP CHQ CHEQUE ACHAT PMT AVEC SANS AUX EUR COM FRAIS ET OU EN AU A').split(' ').forEach(function (w) { STOP[w] = 1; });
  function tokens(lib) {
    return BM.norm(lib).replace(/[^A-Z0-9' ]/g, ' ').split(' ').filter(function (t) { return t.length >= 3 && !STOP[t] && !/\d/.test(t); });
  }
  function merchant(lib) { var t = tokens(lib); return t.slice(0, 2).join(' ') || BM.norm(lib).slice(0, 20); }
  /** Mot-clé proposé pour une règle : 1er mot significatif (+ le suivant s'il est court et contigu). */
  function keywordFor(lib) {
    var t = tokens(lib), L = BM.norm(lib);
    if (!t.length) return BM.norm(lib).slice(0, 16).trim();
    var k = t[0];
    if ((k.length < 5 || t[0] === t[1]) && t[1] && L.indexOf(t[0] + ' ' + t[1]) !== -1 && t[0] !== t[1]) k = t[0] + ' ' + t[1];
    return k;
  }
  function pretty(lib) {
    var s = String(lib || '').replace(/\s+Divers$/i, '').replace(/CB\*+\d+-?/gi, '').replace(/\b(Carte|CB|Prélèvement|Virement|Versement|PRLV SEPA|VIR SEPA|VIR INST|VIR|PRELEVEMENT EUROPEEN|PRELEVEMENT EUROPE|PRELEVEMENT|DE:)(?=\s|$)/gi, ' ')
      .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, '').replace(/\s{2,}/g, ' ').trim();
    s = s.replace(/\*\S*/g, ' ');
    var w = s.split(' ').filter(function (t) { return t && !/\*/.test(t) && (t.match(/\d/g) || []).length < 3 && !/^[-–]+$/.test(t); });
    for (var k = 3; k >= 1; k--) { // supprime une répétition en tête (« SEPHORA SEPHORA », « COTISATION JAZZ COTISATION JAZZ »)
      if (w.length >= 2 * k && w.slice(0, k).join(' ').toUpperCase() === w.slice(k, 2 * k).join(' ').toUpperCase()) { w.splice(0, k); break; }
    }
    s = w.slice(0, 6).join(' ');
    if (s.length > 40) s = s.slice(0, 40).trim() + '…';
    s = s.toLowerCase().replace(/(^|[\s\-'’(.])([a-zà-ÿ])/g, function (a, b, c) { return b + c.toUpperCase(); });
    return s || String(lib || '').slice(0, 40);
  }
  /** Catégories probables pour une opération (historique des libellés semblables). */
  function guessCats(o, n) {
    var key = merchant(o.lib), cnt = {};
    S.ops.forEach(function (x) {
      if (x === o || BM.isUnclassified(x.cat) || x.type === 'Transfert' && o.type !== 'Transfert' && x.cat !== 'Transfert interne') return;
      if (merchant(x.lib) === key) cnt[x.cat] = (cnt[x.cat] || 0) + 3;
    });
    var r = BM.categorize(o.lib, o.mt, o.compte, S.rules);
    if (!BM.isUnclassified(r.cat)) cnt[r.cat] = (cnt[r.cat] || 0) + 5;
    var out = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; });
    // compléter par les catégories les plus utilisées dans le même sens
    var freq = {};
    S.ops.slice(0, 1500).forEach(function (x) { if ((x.mt >= 0) === (o.mt >= 0) && !BM.isUnclassified(x.cat)) freq[x.cat] = (freq[x.cat] || 0) + 1; });
    Object.keys(freq).sort(function (a, b) { return freq[b] - freq[a]; }).forEach(function (c) { if (out.indexOf(c) === -1) out.push(c); });
    return out.slice(0, n || 6);
  }

  /* ---------------- Abonnements et dépenses récurrentes ---------------- */
  function recurring() {
    if (S._cache.rec) return S._cache.rec;
    var from = BM.addMonths(BM.ym(S.today), -6), g = {};
    S.ops.forEach(function (o) {
      if (o.m < from || o.type !== 'Dépense' || o.mt >= 0) return;
      if (/Crédit|crédit|Impôts|Loyer/.test(o.cat)) return;
      var k = merchant(o.lib) + '|' + o.compte;
      (g[k] = g[k] || []).push(o);
    });
    var out = [];
    Object.keys(g).forEach(function (k) {
      var l = g[k], months = {}; l.forEach(function (o) { months[o.m] = (months[o.m] || 0) - o.mt; });
      var ms = Object.keys(months); if (ms.length < 3) return;
      var vals = ms.map(function (m) { return months[m]; }), mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      if (mn <= 0 || mx / mn > 1.35) return;
      var lastM = ms.sort()[ms.length - 1];
      if (lastM < BM.addMonths(BM.ym(S.today), -2)) return; // arrêté
      out.push({ nom: pretty(l[0].lib), cat: l[0].cat, compte: l[0].compte, mensuel: BM.r2(avg(vals)), annuel: BM.r2(avg(vals) * 12), n: ms.length, ops: l });
    });
    out.sort(function (a, b) { return b.annuel - a.annuel; });
    S._cache.rec = out;
    return out;
  }

  /* ---------------- Suggestions (moteur de conseils) ---------------- */
  function suggestions() {
    if (S._cache.sugg) return S._cache.sugg;
    var out = [], P = S.data.params, cur = BM.ym(S.today), mv = monthView(cur);
    function add(s) { out.push(s); }
    // 1. Trésorerie : total des comptes courants et plan de virements
    var pr = projection();
    var tmin = pr.total[pr.minI];
    if (tmin < 0) add({ sev: 'bad', icon: '🌊', prio: 100, title: 'Trésorerie totale négative prévue',
      text: 'Tous comptes courants confondus, le solde descendrait à ' + eur0(tmin) + ' vers le ' + dateLabel(pr.days[pr.minI], true) + ' si rien ne change. Il faut dégager ' + eur0(-tmin) + ' d\'ici là (épargne, report d\'une dépense, rentrée attendue).',
      go: { view: 'avenir', tab: 'treso' } });
    if (pr.plan.length) {
      var lines = pr.plan.slice(0, 4).map(function (x) {
        var stale = S.fresh[x.compte] && BM.diffDays(S.fresh[x.compte], S.today) > 8 ? ' [relevé à jour au ' + dateLabel(S.fresh[x.compte]) + ']' : '';
        return eur0(x.need) + ' vers ' + x.compte + (x.date <= S.today ? ' dès maintenant' : ' avant le ' + dateLabel(x.date)) + stale + (x.from.length ? ' (depuis ' + x.from.map(function (f) { return f.compte; }).join(' + ') + ')' : ' (aucun compte excédentaire)');
      });
      add({ sev: pr.plan.some(function (x) { return x.negative; }) ? 'warn' : 'info', icon: '🔀', prio: 72, title: 'Virements à prévoir (' + pr.window + ' prochains jours)',
        text: lines.join(' · ') + '. Calcul : prélèvements attendus + dépenses courantes, coussin de ' + eur0(P.coussin || 0) + ' par compte.',
        go: { view: 'avenir', tab: 'treso' } });
    }
    // 2. Reste à vivre
    if (mv.rav < 0) add({ sev: 'bad', icon: '🧭', prio: 95, title: 'Mois en déficit', text: 'En tenant compte des prélèvements encore attendus, ' + monthLabel(cur) + ' finira à ' + eur0(mv.rav) + '. Chaque dépense non essentielle compte jusqu\'à la fin du mois.', go: { view: 'home' } });
    // 3. Opérations à classer
    var todo = S.ops.filter(function (o) { return BM.isUnclassified(o.cat) && o.m >= BM.addMonths(cur, -6); });
    if (todo.length) {
      var byM = {}; todo.forEach(function (o) { var k = merchant(o.lib); (byM[k] = byM[k] || []).push(o); });
      var top = Object.keys(byM).filter(function (k) { return byM[k].length >= 2; }).sort(function (a, b) { return byM[b].length - byM[a].length; })[0];
      add({ sev: 'warn', icon: '🗂️', prio: 80, title: todo.length + ' opération' + (todo.length > 1 ? 's' : '') + ' à classer (6 derniers mois)',
        text: 'Tant qu\'elles ne sont pas classées, vos enveloppes sont faussées.' + (top ? ' « ' + pretty(byM[top][0].lib) + ' » revient ' + byM[top].length + ' fois : une règle les classera toutes.' : ''),
        action: { label: 'Tri express', fn: 'tri' } });
    }
    // 4. Enveloppes du mois (hors dépassements chroniques, traités au point 5)
    var chronic = {};
    S.data.categories.forEach(function (c) {
      if (c.enveloppe && !BM.isUnclassified(c.nom) && lastMonths(3).every(function (m) { return (M(m).cats[c.nom] || 0) > c.enveloppe * 1.1; })) chronic[c.nom] = 1;
    });
    S.data.categories.forEach(function (c) {
      if (c.type !== 'Dépense' || !c.enveloppe || chronic[c.nom] || BM.isUnclassified(c.nom)) return;
      var e = envelope(c, cur);
      if (e.status === 'bad') add({ sev: 'bad', icon: c.icone || '💸', prio: 60 + Math.min(20, (e.spent - e.env) / 50), title: c.nom + ' : enveloppe dépassée',
        text: eur0(e.spent) + ' dépensés pour ' + eur0(e.env) + ' prévus (+' + eur0(e.spent - e.env) + ').', go: { view: 'budget', cat: c.nom } });
      else if (e.status === 'warn' && c.nature === 'Variable' && mv.isCur && e.projected > e.env * 1.05) add({ sev: 'warn', icon: c.icone || '⏱️', prio: 50, title: c.nom + ' : rythme trop rapide',
        text: 'Au rythme actuel, vous finirez le mois vers ' + eur0(e.projected) + ' pour ' + eur0(e.env) + ' prévus. Pour tenir : ' + eur0(Math.max(0, e.rest) / Math.max(1, mv.daysLeft)) + ' par jour maximum.', go: { view: 'budget', cat: c.nom } });
    });
    // 5. Dépassements chroniques et enveloppes manquantes
    var hist = lastMonths(3);
    S.data.categories.forEach(function (c) {
      if (c.type !== 'Dépense' || BM.isUnclassified(c.nom)) return;
      var vals = hist.map(function (m) { return M(m).cats[c.nom] || 0; }), med6 = median(lastMonths(6).map(function (m) { return M(m).cats[c.nom] || 0; }));
      if (c.enveloppe && vals.every(function (v) { return v > c.enveloppe * 1.1; }))
        add({ sev: 'warn', icon: '📈', prio: 40, title: c.nom + ' dépasse depuis 3 mois', text: 'Moyenne ' + eur0(avg(vals)) + ' / mois pour ' + eur0(c.enveloppe) + ' prévus. Soit l\'enveloppe est irréaliste (médiane 6 mois : ' + eur0(med6) + '), soit ce poste est à freiner.',
          action: { label: 'Ajuster à ' + eur0(Math.ceil(med6 / 10) * 10), fn: 'setEnv', cat: c.nom, val: Math.ceil(med6 / 10) * 10 } });
      if (!c.enveloppe && med6 >= 40)
        add({ sev: 'info', icon: '🎯', prio: 30, title: 'Pas d\'enveloppe pour « ' + c.nom + ' »', text: 'Vous y dépensez ' + eur0(med6) + ' par mois en médiane (6 mois). Fixer une enveloppe permet de la suivre et d\'être alerté.',
          action: { label: 'Créer ' + eur0(Math.ceil(med6 / 10) * 10) + ' / mois', fn: 'setEnv', cat: c.nom, val: Math.ceil(med6 / 10) * 10 } });
      if (c.enveloppe && vals.every(function (v) { return v < c.enveloppe * 0.6; }) && c.nature === 'Variable' && c.enveloppe - avg(vals) >= 30)
        add({ sev: 'good', icon: '💡', prio: 20, title: c.nom + ' : marge inutilisée', text: 'Vous dépensez ' + eur0(avg(vals)) + ' / mois pour ' + eur0(c.enveloppe) + ' prévus. Réaffecter la différence vers l\'épargne libère ' + eur0(c.enveloppe - avg(vals)) + ' / mois.',
          gain: c.enveloppe - avg(vals) });
    });
    // 6. Pic de dépense
    var cm = M(cur);
    S.data.categories.forEach(function (c) {
      if (c.type !== 'Dépense' || c.nature === 'Fixe') return;
      var v = cm.cats[c.nom] || 0, med = median(lastMonths(6).map(function (m) { return M(m).cats[c.nom] || 0; }));
      if (med > 30 && v > med * 1.6 && v - med > 80 && !c.enveloppe)
        add({ sev: 'warn', icon: '⚡', prio: 45, title: c.nom + ' en forte hausse', text: eur0(v) + ' ce mois-ci contre ' + eur0(med) + ' habituellement (médiane 6 mois).', go: { view: 'ops', cat: c.nom } });
    });
    // 7. Endettement
    var dt = debt();
    if (dt.effort != null && dt.effort * 100 > (P.seuilEffort || 35)) {
      var needed = dt.total - dt.rv.retenus * (P.seuilEffort || 35) / 100;
      add({ sev: 'bad', icon: '🏦', prio: 75, title: 'Taux d\'effort de ' + pct(dt.effort) + ' (seuil ' + (P.seuilEffort || 35) + ' %)',
        text: 'Vos mensualités (' + eur0(dt.total) + ') absorbent ' + pct(dt.effort) + ' de vos revenus réguliers (' + eur0(dt.rv.retenus) + '). Il faudrait alléger les mensualités de ' + eur0(needed) + ' / mois pour revenir au seuil.',
        go: { view: 'avenir', tab: 'prets' } });
    }
    dt.ends.forEach(function (e) {
      var mths = BM.monthsBetween(cur, BM.ym(e.fin));
      if (mths >= 0 && mths <= 18) add({ sev: 'good', icon: '🎉', prio: 35, title: e.p.nom + ' se termine en ' + monthLabel(BM.ym(e.fin)),
        text: 'Dans ' + mths + ' mois, ' + eur0(e.gain) + ' par mois seront libérés. Décidez dès maintenant de leur affectation (épargne de précaution, remboursement anticipé d\'un autre prêt).', gain: e.gain });
    });
    var modul = S.data.prets.filter(function (p) { return /^oui/i.test(p.modulable); });
    modul.forEach(function (p) {
      var st = S.loanSt[p.id]; if (st.restantMois === 0) return;
      var sim = BM.simulateModulation(st.crd, st.taux, p.mensualite, -10);
      add({ sev: 'info', icon: '🔧', prio: 32, title: 'Modulation possible : ' + p.nom, text: 'Baisser la mensualité de 10 % libère ' + eur0(sim.gainMensuel) + ' par mois' + (sim.dureeApres && isFinite(sim.dureeApres) ? ', au prix de ' + (sim.dureeApres - sim.dureeAvant) + ' mois de plus et d\'environ ' + eur0(sim.coutTotalApres - sim.coutTotalAvant) + ' d\'intérêts supplémentaires.' : '.'),
        gain: sim.gainMensuel, go: { view: 'avenir', tab: 'prets', pret: p.id } });
    });
    // 8. Abonnements
    var rec = recurring().filter(function (r) { return /Abonnement|Téléphonie|Internet|numérique/i.test(r.cat); });
    if (rec.length) {
      var tot = rec.reduce(function (a, b) { return a + b.annuel; }, 0);
      add({ sev: 'info', icon: '🔁', prio: 28, title: 'Abonnements : ' + eur0(tot) + ' par an', text: rec.slice(0, 4).map(function (r) { return r.nom + ' ' + eur0(r.mensuel) + '/mois'; }).join(' · ') + '. Passez-les en revue une fois par trimestre : chacun résilié est un gain sur 12 mois.', go: { view: 'plus', tab: 'analyses', anchor: 'recurrents' } });
    }
    // 9. Frais bancaires
    var fb = 0, fbC = {};
    S.ops.forEach(function (o) { if (o.cat === 'Frais bancaires' && o.m >= BM.addMonths(cur, -12) && o.m < cur) { fb -= o.mt; fbC[o.compte] = (fbC[o.compte] || 0) - o.mt; } });
    if (fb > 120) {
      var worst = Object.keys(fbC).sort(function (a, b) { return fbC[b] - fbC[a]; }).slice(0, 3);
      add({ sev: 'info', icon: '🏧', prio: 26, title: 'Frais bancaires : ' + eur0(fb) + ' sur 12 mois', text: 'Principalement ' + worst.map(function (c) { return c + ' (' + eur0(fbC[c]) + ')'; }).join(', ') + '. Regrouper les comptes ou renégocier les cotisations est un gain direct.', gain: fb / 12 });
    }
    // 9 bis. Frais d'incident (prélèvement sur compte insuffisamment approvisionné)
    var inc = {}, incN = 0;
    S.ops.forEach(function (o) {
      if (o.m < BM.addMonths(cur, -12) || o.mt >= 0) return;
      if (/INTERVENTION|INCIDENT|REJET|IMPAYE|MINIMUM FORFAITAIRE|INTERETS DEBITEURS|AGIOS/.test(BM.norm(o.lib))) { inc[o.compte] = (inc[o.compte] || 0) - o.mt; incN++; }
    });
    var incK = Object.keys(inc).sort(function (a, b) { return inc[b] - inc[a]; });
    if (incK.length) {
      var incT = incK.reduce(function (a, k) { return a + inc[k]; }, 0);
      add({ sev: 'warn', icon: '🚫', prio: 58, title: 'Frais d\'incident : ' + eur0(incT) + ' sur 12 mois', text: incN + ' frais de découvert ou de commission d\'intervention, surtout sur ' + incK.slice(0, 2).map(function (k) { return k + ' (' + eur0(inc[k]) + ')'; }).join(' et ') +
        '. Ils sont évitables : alimentez ces comptes 2 à 3 jours avant les prélèvements (voir « Virements à prévoir »).', gain: incT / 12, go: { view: 'avenir', tab: 'treso' } });
    }
    // 10. Comptes dormants
    S.data.comptes.forEach(function (c) {
      if (!c.actif) return;
      var last = S.lastDate[c.nom];
      if (last && BM.diffDays(last, S.today) > 60 && Math.abs(S.balances[c.nom]) < 100 && c.nature !== 'Épargne')
        add({ sev: 'info', icon: '💤', prio: 15, title: c.nom + ' semble inactif', text: 'Aucune opération importée depuis le ' + dateLabel(last, true) + ', solde ' + eur(S.balances[c.nom]) + '. S\'il ne sert plus, sa clôture supprime ses frais de tenue.' });
    });
    // 11. Imports en retard
    var stale = S.data.comptes.filter(function (c) { var l = S.fresh[c.nom]; return c.actif && c.nature !== 'Épargne' && l && BM.diffDays(l, S.today) > 8 && BM.diffDays(l, S.today) <= 60; });
    if (stale.length) add({ sev: 'warn', icon: '📥', prio: 55, title: 'Relevés à importer', text: stale.map(function (c) { return c.nom + ' (depuis le ' + dateLabel(S.fresh[c.nom]) + ')'; }).join(', ') + '. Les chiffres du mois sont incomplets tant que ces relevés manquent.', action: { label: 'Importer', fn: 'import' } });
    // 12. Épargne
    var r3 = lastMonths(3).map(function (m) { var s = M(m); return s.recReg ? (s.recReg - s.dep) / s.recReg : 0; });
    var tEp = avg(r3);
    if (tEp < 0.05) {
      var fixed = avg(lastMonths(6).map(function (m) { return M(m).depFixe; }));
      add({ sev: tEp < 0 ? 'bad' : 'warn', icon: '🐷', prio: 42, title: 'Taux d\'épargne de ' + pct(tEp) + ' (3 derniers mois)', text: 'Hors revenus exceptionnels, les dépenses ' + (tEp < 0 ? 'dépassent' : 'absorbent presque tous') + ' les revenus réguliers. Repère : une épargne de précaution de 3 mois de charges fixes représente ' + eur0(fixed * 3) + '.' });
    }
    // 13. Objectifs
    S.data.objectifs.forEach(function (g) {
      if (!g.actif) return;
      var o = objective(g);
      if (o.late) add({ sev: 'warn', icon: g.icone || '🎯', prio: 38, title: 'Objectif « ' + g.nom + ' » en retard', text: 'Il faut mettre de côté ' + eur0(o.perMonth) + ' par mois pour l\'atteindre le ' + dateLabel(g.date, true) + '.' });
    });
    // 13 bis. Autonomie de trésorerie
    var au = autonomy();
    if (au.mois != null && au.mois < 24) add({ sev: au.mois < 6 ? 'bad' : au.mois < 12 ? 'warn' : 'info', icon: '⏳', prio: au.mois < 6 ? 90 : 48,
      title: 'Autonomie de trésorerie : ' + au.mois.toFixed(1).replace('.', ',') + ' mois',
      text: 'Hors dons et versements d\'espèces, vos sorties (' + eur0(au.sorties) + ' / mois) dépassent vos revenus réguliers (' + eur0(au.socle) + ') de ' + eur0(-au.deficit) + ' par mois. Au rythme des 3 derniers mois, vos ' + eur0(au.patrimoine) + ' disponibles couvriraient ' + au.mois.toFixed(1).replace('.', ',') + ' mois.',
      go: { view: 'avenir', tab: 'treso' } });
    // 14. Retraits d'espèces
    var cash = avg(lastMonths(3).map(function (m) { return M(m).cats['Retrait espèces'] || 0; }));
    if (cash > 150) add({ sev: 'info', icon: '💵', prio: 12, title: 'Espèces : ' + eur0(cash) + ' / mois', text: 'Les dépenses en espèces échappent au suivi par catégorie. Un budget espèces fixe par semaine aide à les maîtriser.' });
    out.sort(function (a, b) { return b.prio - a.prio; });
    S._cache.sugg = out;
    return out;
  }
  function objective(g) {
    var bal = g.compte ? (S.balances[g.compte] || 0) : 0, have = bal + (g.deja || 0);
    var mLeft = g.date ? Math.max(1, BM.monthsBetween(BM.ym(S.today), BM.ym(g.date))) : null;
    var rest = Math.max(0, g.cible - have), per = mLeft ? rest / mLeft : null;
    var pctv = g.cible ? Math.min(1, have / g.cible) : 0;
    // en retard si l'effort mensuel requis dépasse la moyenne épargnée sur 3 mois
    var saved = avg(lastMonths(3).map(function (m) { return M(m).epa; }));
    return { have: have, rest: rest, perMonth: per, mLeft: mLeft, pct: pctv, late: per != null && rest > 0 && per > Math.max(saved, 0) * 1.1 };
  }

  /* ---------------- Mise à jour locale après écriture ---------------- */
  function applyCats(changed) {
    var idx = {}; S.ops.forEach(function (o) { idx[o.id] = o; });
    changed.forEach(function (c) { var o = idx[c.id]; if (o) { o.cat = c.cat; if (c.manuel != null) o.manuel = c.manuel; enrich(o); } });
    recompute(); saveCache();
  }
  function addOps(list) {
    list.forEach(function (o) { S.ops.push(enrich({ id: o.id, date: o.date, compte: o.compte, lib: o.lib, mt: o.mt, cat: o.cat, manuel: o.origine === 'Manuel', moisForce: '', comm: o.comm || '' })); });
    sortOps(); recompute(); saveCache();
  }

  return {
    S: S, LS: LS, api: api, load: load, enrich: enrich, recompute: recompute, saveCache: saveCache, sortOps: sortOps,
    eur: eur, eur0: eur0, sgn: sgn, pct: pct, esc: esc, monthLabel: monthLabel, dateLabel: dateLabel, dayName: dayName,
    groupColor: groupColor, groupLabel: groupLabel, M: M, lastMonths: lastMonths, median: median, avg: avg, catHistory: catHistory, amt: amt,
    events: events, matchEvents: matchEvents, monthView: monthView, envelope: envelope, projection: projection, debt: debt, revenusReguliers: revenusReguliers,
    merchant: merchant, keywordFor: keywordFor, pretty: pretty, guessCats: guessCats, recurring: recurring, suggestions: suggestions, objective: objective,
    applyCats: applyCats, addOps: addOps, loanCat: loanCat, autonomy: autonomy, threeMonths: threeMonths, pilotage: pilotage, payoffOrder: payoffOrder, LOAN_CATS: LOAN_CATS
  };
})();
