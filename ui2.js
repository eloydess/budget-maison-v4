/* ===================== Budget Maison v4 — interface (2/2) ===================== */
var UI2 = window.UI2 = (function () {
  'use strict';
  var A = App, S = A.S, esc = A.esc, eur = A.eur, eur0 = A.eur0;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function U() { return window.UI; }
  function seg(items, cur, attr) {
    return '<div class="topseg">' + items.map(function (it) { return '<button data-' + attr + '="' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '">' + it[1] + '</button>'; }).join('') + '</div>';
  }
  function bindSeg(attr, key) {
    $$('[data-' + attr + ']').forEach(function (b) { b.onclick = function () { S[key] = b.dataset[attr]; U().render(true); }; });
  }

  /* =====================================================================
     AVENIR : trésorerie, prêts, échéances, objectifs
     ===================================================================== */
  var avenir = {
    html: function () {
      var t = S.avTab || (S.avTab = 'pilotage');
      var out = U().topbar('Avenir', 'Gagne-t-on du terrain, et que faire ensuite', seg([['pilotage', '🧭 Pilotage'], ['plan', '✅ Plan'], ['treso', '🌊 Trésorerie'], ['prets', '🏦 Prêts'], ['echeances', '📅 Échéances'], ['objectifs', '🎯 Objectifs']], t, 'av'));
      out += '<main class="content">' + ({ pilotage: pilotage, plan: planView, treso: treso, prets: prets, echeances: echeances, objectifs: objectifs }[t] || pilotage)() + '</main>';
      return out;
    },
    mount: function () {
      bindSeg('av', 'avTab');
      U().bindCommon();
      if (S.avTab === 'treso') mountTreso();
      if (S.avTab === 'prets') mountPrets();
      if (S.avTab === 'pilotage') mountPilotage();
      $$('[data-plan]').forEach(function (b) { b.onclick = function () { planSheet(b.dataset.plan); }; });
      $$('[data-avtab]').forEach(function (b) { b.onclick = function () { S.avTab = b.dataset.avtab; U().render(true); }; });
      $$('[data-ech]').forEach(function (b) { b.onclick = function () { echSheet(b.dataset.ech); }; });
      $$('[data-obj]').forEach(function (b) { b.onclick = function () { objSheet(b.dataset.obj); }; });
      $$('[data-pret]').forEach(function (b) { b.onclick = function () { loanSheet(b.dataset.pret); }; });
    }
  };
  function treso() {
    var pr = A.projection(), last = pr.total.length - 1, P = S.data.params;
    var out = '<section class="card"><div class="tiles t3">' +
      U().tile("Aujourd'hui", eur0(pr.total[0]), 'comptes courants (estimé)') +
      U().tile('Point bas', eur0(pr.total[pr.minI]), 'le ' + A.dateLabel(pr.days[pr.minI], true), pr.total[pr.minI] < 0 ? 'bad' : '') +
      U().tile('Dans ' + last + ' jours', eur0(pr.total[last]), A.sgn(BM.r2(pr.total[last] - pr.total[0]), 0), pr.total[last] < pr.total[0] ? 'warn' : 'good') + '</div>' +
      (function () { var au = A.autonomy(); return '<div class="tiles t3 mt8">' +
        U().tile('Autonomie', au.mois == null ? 'à l\'équilibre' : (au.mois > 60 ? '+ de 5 ans' : au.mois.toFixed(1).replace('.', ',') + ' mois'), 'patrimoine ÷ déficit habituel', au.mois == null ? 'good' : au.mois < 6 ? 'bad' : au.mois < 12 ? 'warn' : 'good') +
        U().tile('Revenus réguliers', eur0(au.socle), 'moy. 3 mois, hors dons et espèces') +
        U().tile('Solde habituel', A.sgn(au.deficit, 0), 'revenus réguliers − sorties', au.deficit < 0 ? 'bad' : 'good') + '</div>'; })() +
      '<div id="c-proj" class="mt12"></div><div class="legend-row"><span><i style="background:var(--s1)"></i>Total comptes courants</span><span><i style="background:var(--bad)"></i>Zéro</span></div>' +
      '<p class="small muted">Hypothèses : soldes estimés aujourd\'hui, échéancier et prêts (dates prévues), dépenses courantes au rythme des 90 derniers jours importés (' +
      pr.names.filter(function (n) { return pr.daily[n] > 0.5; }).map(function (n) { return esc(n) + ' ' + eur0(pr.daily[n] * 30) + '/mois'; }).join(', ') + '). Les virements entre vos comptes ne sont pas projetés.</p></section>';
    // Plan de virements
    out += '<section class="card"><div class="card-head"><h2>🔀 Virements à prévoir · ' + pr.window + ' jours</h2></div>' +
      (pr.plan.length ? pr.plan.map(function (x) {
        var stale = S.fresh[x.compte] && BM.diffDays(S.fresh[x.compte], S.today) > 8;
        return '<div class="env"><div class="top"><div class="name">' + (x.negative ? '🔴' : '🟠') + ' ' + esc(x.compte) + '</div><b class="num">' + eur0(x.need) + '</b></div>' +
          '<div class="sub"><span>' + (x.date <= S.today ? 'dès maintenant' : 'avant le ' + A.dateLabel(x.date, true)) + ' · point bas ' + eur0(x.min) + ' le ' + A.dateLabel(x.minDate) + '</span></div>' +
          '<div class="small ink2 mt8">' + (x.from.length ? 'Source possible : ' + x.from.map(function (f) { return esc(f.compte) + ' (' + eur0(f.montant) + ')'; }).join(' + ') : '⚠️ Aucun compte courant excédentaire sur la période.') + (x.uncovered > 0 ? ' · non couvert : ' + eur0(x.uncovered) : '') + '</div>' +
          (stale ? '<div class="tiny warn mt8">Relevé importé jusqu\'au ' + A.dateLabel(S.lastDate[x.compte], true) + ' seulement : importez-le pour fiabiliser ce calcul.</div>' : '') + '</div>';
      }).join('') : '<p class="empty">Aucun compte ne passe sous le coussin de ' + eur0(P.coussin) + '. 👍</p>') + '</section>';
    // Par compte
    out += '<section class="card"><div class="card-head"><h2>Par compte</h2></div><div class="scrollx"><table class="tbl"><thead><tr><th>Compte</th><th class="r">Aujourd\'hui</th><th class="r">Point bas</th><th class="r">J+30</th></tr></thead><tbody>' +
      pr.names.map(function (n) {
        var s = pr.series[n], mn = Math.min.apply(null, s), i30 = Math.min(30, s.length - 1);
        return '<tr><td>' + esc(n) + '<div class="tiny muted">relevé au ' + (S.fresh[n] ? A.dateLabel(S.fresh[n], true) : '–') + '</div></td><td class="r">' + eur0(s[0]) + '</td><td class="r ' + (mn < 0 ? 'bad' : '') + '">' + eur0(mn) + '<div class="tiny muted">' + A.dateLabel(pr.days[s.indexOf(mn)]) + '</div></td><td class="r">' + eur0(s[i30]) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    // Événements
    var evs = pr.events.slice(0, 40);
    out += '<section class="card"><div class="card-head"><h2>Échéances attendues</h2><span class="small muted">' + pr.events.length + ' sur ' + (pr.days.length - 1) + ' jours</span></div>' +
      (evs.length ? evs.map(U().evHtml).join('') : '<p class="empty">Aucune.</p>') + '</section>';
    return out;
  }
  function mountTreso() {
    var pr = A.projection();
    Charts.line($('#c-proj'), { labels: pr.days, height: 230, fmt: eur0, xfmt: function (d) { return A.dateLabel(d); }, tipLabel: function (d) { return A.dayName(d) + ' ' + A.dateLabel(d, true); },
      series: [{ name: 'Comptes courants', color: 'var(--s1)', values: pr.total, area: true }], refs: [{ y: 0, label: '0 €', color: 'var(--bad)' }],
      markers: [{ i: pr.minI, label: eur0(pr.total[pr.minI]), color: pr.total[pr.minI] < 0 ? 'var(--bad)' : 'var(--s1)', below: true }],
      extraTip: function (i) {
        var d = pr.days[i], ev = pr.events.filter(function (e) { return (e.date <= S.today ? BM.addDays(S.today, 1) : e.date) === d; });
        return ev.length ? '<br>' + ev.map(function (e) { return esc(e.lib) + ' ' + A.sgn(e.mt, 0); }).join('<br>') : '';
      } });
  }

  function prets() {
    var dt = A.debt(), P = S.data.params, eff = dt.effort == null ? 0 : dt.effort * 100;
    var out = '<section class="card"><div class="row" style="align-items:center;flex-wrap:wrap;gap:16px"><div style="flex:1;min-width:200px;text-align:center">' +
      Charts.gauge(eff, Math.max(80, eff + 5), P.seuilEffort || 35, eff > (P.seuilEffort || 35) ? 'var(--bad)' : 'var(--good)') +
      '<div style="margin-top:-38px;font-size:28px;font-weight:800" class="num ' + (eff > (P.seuilEffort || 35) ? 'bad' : 'good') + '">' + (dt.effort == null ? '–' : A.pct(dt.effort)) + '</div>' +
      '<div class="small muted">taux d\'effort · repère ' + (P.seuilEffort || 35) + ' % (norme HCSF)</div></div>' +
      '<div class="tiles" style="flex:1.4;min-width:260px">' +
      U().tile('Mensualités', eur0(dt.total), dt.list.length + ' prêt(s) en cours') +
      U().tile('Revenus réguliers', eur0(dt.rv.retenus), dt.rv.declares ? 'déclarés dans l\'échéancier' : 'moyenne 6 mois') +
      U().tile('Capital restant dû', eur0(dt.crd), dt.crdKnown ? 'estimé' : 'partiel : prêts sans taux ni CRD', dt.crdKnown ? '' : 'warn') +
      U().tile('Reste à rembourser', eur0(dt.reste), dt.resteKnown ? 'mensualités restantes' : 'partiel : dates de fin manquantes', dt.resteKnown ? '' : 'warn') + '</div></div>' +
      '<p class="small ink2">Revenus mesurés sur 6 mois (hors exceptionnel) : ' + eur0(dt.rv.mesures) + ' / mois. Le taux d\'effort utilise les revenus déclarés dans l\'échéancier, plus stables.</p></section>';
    out += '<section class="card"><div class="card-head"><h2>Vos mensualités dans le temps</h2></div><div id="c-debt"></div>' +
      '<p class="small muted">Somme des mensualités de prêts, mois par mois, jusqu\'à la dernière échéance connue.</p>' +
      (dt.ends.length ? '<div class="mt8">' + dt.ends.map(function (e) {
        var mths = BM.monthsBetween(BM.ym(S.today), BM.ym(e.fin));
        return '<div class="env"><div class="top"><div class="name">🏁 ' + esc(e.p.nom) + '</div><span class="small b">' + A.monthLabel(BM.ym(e.fin)) + '</span></div><div class="sub"><span>dans ' + mths + ' mois</span><span class="good">+' + eur0(e.gain) + ' / mois libérés</span></div></div>';
      }).join('') + '</div>' : '') + '</section>';
    out += '<section class="card"><div class="card-head"><h2>Détail des prêts</h2><button class="btn sm" data-pret="">＋ Prêt</button></div>' + S.data.prets.map(function (p) {
      var st = S.loanSt[p.id], prog = st.progression;
      return '<div class="loan" data-pret="' + esc(p.id) + '"><div class="row between"><div class="grow"><div class="b">' + esc(p.nom) + '</div><div class="small muted">' + esc(p.compte) + ' · le ' + p.jour + ' du mois' + (st.taux != null ? ' · ' + String(st.taux).replace('.', ',') + ' %' : '') + '</div></div><div class="b num">' + eur(p.mensualite) + '</div></div>' +
        (prog != null ? '<div class="prog"><i style="width:' + (prog * 100) + '%"></i></div>' : '') +
        '<div class="sub small" style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;flex-wrap:wrap"><span>' +
        (st.restantMois != null ? '<b>' + st.restantMois + '</b> mensualités restantes · fin ' + (st.fin ? A.monthLabel(BM.ym(st.fin)) : '–') + (st.finEstimee ? ' (estimée)' : '') : '<span class="warn">date de fin à renseigner</span>') + '</span>' +
        '<span>' + (st.crd != null ? 'CRD ≈ <b>' + eur0(st.crd) + '</b>' + (prog != null ? ' · ' + Math.round(prog * 100) + ' % remboursé' : '') : (st.resteAPayer != null ? 'reste ' + eur0(st.resteAPayer) : '')) + '</span></div>' +
        '<div class="tiny muted mt8">' + (st.nbVues ? st.nbVues + ' échéance(s) retrouvée(s) dans vos relevés, dernière le ' + A.dateLabel(st.derniere, true) : 'Aucune échéance retrouvée dans les relevés (vérifiez le mot-clé).') + (/^oui/i.test(p.modulable) ? ' · <span class="good">modulable</span>' : (/pr[ée]ciser/i.test(p.modulable) ? ' · modulation à préciser' : '')) + '</div></div>';
    }).join('') + '</section>';
    return out;
  }
  function mountPrets() {
    var dt = A.debt();
    if (!dt.values.length) return;
    Charts.line($('#c-debt'), { labels: dt.labels, height: 190, fmt: eur0, xfmt: function (m) { return m.slice(0, 4); }, tipLabel: function (m) { return A.monthLabel(m); },
      series: [{ name: 'Mensualités', color: 'var(--s2)', values: dt.values, area: true, step: true }], aria: 'Mensualités de prêts dans le temps' });
  }
  function loanSheet(id) {
    var p = S.data.prets.filter(function (x) { return x.id === id; })[0];
    var isNew = !p;
    p = p || { id: '', nom: '', preteur: '', compte: S.data.comptes[0].nom, mensualite: 0, jour: 5, debut: '', fin: '', capital: null, taux: null, crd: null, dateCrd: '', motcle: '', modulable: 'Non renseigné', cat: 'Remboursement crédit conso', comm: '' };
    var st = isNew ? {} : S.loanSt[p.id];
    var seen = [];
    if (!isNew && p.motcle) {
      var ks = p.motcle.split(';').map(function (k) { return BM.norm(k).trim(); }).filter(Boolean);
      seen = S.ops.filter(function (o) { var L = BM.norm(o.lib); return o.compte === p.compte && ks.some(function (k) { return L.indexOf(k) !== -1; }) && Math.abs(Math.abs(o.mt) - p.mensualite) <= p.mensualite * 0.02 + 0.01; }).slice(0, 6);
    }
    function f(label, idn, val, type, extra) { return '<div class="field"><label>' + label + '</label><input class="input" id="' + idn + '" ' + (type ? 'type="' + type + '"' : 'inputmode="decimal"') + ' value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '></div>'; }
    var sim = '';
    if (!isNew) {
      sim = '<h3 class="mt16">🔧 Simuler une modulation</h3><div class="seg mt8" id="mods">' + [-30, -20, -10, 10, 20, 30].map(function (v) { return '<button data-v="' + v + '" class="' + (v === -10 ? 'on' : '') + '">' + (v > 0 ? '+' : '') + v + ' %</button>'; }).join('') + '</div><div id="simr" class="mt8"></div>';
    }
    U().openSheet('<h2>' + (isNew ? 'Nouveau prêt' : esc(p.nom)) + '</h2>' +
      (isNew ? '' : '<div class="tiles t3 mt12">' + U().tile('Restant', st.restantMois == null ? '–' : st.restantMois + ' mois', st.fin ? 'fin ' + A.monthLabel(BM.ym(st.fin)) : 'fin inconnue') +
        U().tile('Capital restant dû', st.crd == null ? '–' : eur0(st.crd), st.crdSource ? 'source : ' + st.crdSource : 'taux ou CRD à saisir') +
        U().tile('Intérêts restants', st.interetsRestants == null ? '–' : eur0(st.interetsRestants), st.taux != null ? 'taux ' + String(st.taux).replace('.', ',') + ' %' : '') + '</div>') + sim +
      '<h3 class="mt16">Caractéristiques</h3>' +
      f('Nom', 'nom', p.nom, 'text') + '<div class="grid2">' + f('Mensualité (€)', 'men', p.mensualite) + f('Jour de prélèvement', 'jour', p.jour) + '</div>' +
      '<div class="field"><label>Compte prélevé</label><select class="input" id="cpt">' + U().compteOptions(p.compte) + '</select></div>' +
      '<div class="grid2">' + f('Date de début', 'deb', p.debut, 'date') + f('Date de fin', 'fin', p.fin, 'date') + '</div>' +
      '<div class="grid2">' + f('Capital emprunté (€)', 'cap', p.capital) + f('Taux annuel (%)', 'taux', p.taux) + '</div>' +
      '<div class="grid2">' + f('Capital restant dû (€)', 'crd', p.crd) + f('à la date du', 'dcrd', p.dateCrd, 'date') + '</div>' +
      f('Mot-clé dans le relevé (plusieurs : séparés par ;)', 'mc', p.motcle, 'text') +
      '<div class="grid2"><div class="field"><label>Modulable</label><select class="input" id="mod">' + ['Oui', 'Non', 'À préciser', 'Non renseigné'].map(function (v) { return '<option ' + (v === p.modulable ? 'selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Catégorie</label><select class="input" id="cat">' + U().catOptions(p.cat, ['Dépense']) + '</select></div></div>' +
      f('Prêteur', 'pre', p.preteur, 'text') + '<div class="field"><label>Commentaire</label><textarea class="input" id="com" rows="2">' + esc(p.comm) + '</textarea></div>' +
      (seen.length ? '<h3 class="mt16">Dernières échéances retrouvées</h3>' + seen.map(U().opRow).join('') : '') +
      '<div class="acts">' + (isNew ? '' : '<button class="btn danger" id="del" style="flex:0 0 auto">🗑</button>') + '<button class="btn ghost" data-close>Fermer</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      function simDraw(v) {
        var r = BM.simulateModulation(st.crd, st.taux, p.mensualite, v), known = r.dureeAvant != null && isFinite(r.dureeApres);
        $('#simr', sh).innerHTML = '<div class="tiles t3">' + U().tile('Nouvelle mensualité', eur(r.mensualite), (r.gainMensuel >= 0 ? '−' : '+') + eur0(Math.abs(r.gainMensuel)) + ' / mois', r.gainMensuel > 0 ? 'good' : '') +
          U().tile('Durée', known ? (r.dureeApres - r.dureeAvant >= 0 ? '+' : '') + (r.dureeApres - r.dureeAvant) + ' mois' : '–', known ? r.dureeApres + ' mois restants' : 'taux et CRD nécessaires') +
          U().tile('Coût total', known ? A.sgn(BM.r2(r.coutTotalApres - r.coutTotalAvant), 0) : '–', 'mensualités restantes cumulées', known && r.coutTotalApres > r.coutTotalAvant ? 'warn' : 'good') + '</div>' +
          '<p class="tiny muted">Simulation indicative à taux constant ; les conditions contractuelles (nombre de modulations, bornes) priment. ' + (/^oui/i.test(p.modulable) ? '' : 'Modulation non confirmée pour ce prêt.') + '</p>';
      }
      if (!isNew) { simDraw(-10); $$('#mods button', sh).forEach(function (b) { b.onclick = function () { $$('#mods button', sh).forEach(function (x) { x.classList.toggle('on', x === b); }); simDraw(+b.dataset.v); }; }); }
      $$('[data-op]', sh).forEach(function (r) { r.onclick = function () { close(); U().opSheet(r.dataset.op); }; });
      var del = $('#del', sh);
      if (del) del.onclick = function () {
        U().confirmSheet('Supprimer ce prêt ?', p.nom + ' sera retiré de l\'onglet PRETS (les opérations ne sont pas touchées).', 'Supprimer', true).then(function (ok) {
          if (!ok) return;
          U().run(null, A.api('deleteRow', { table: 'PRETS', key: p.id }), 'Prêt supprimé').then(function () { S.data.prets = S.data.prets.filter(function (x) { return x.id !== p.id; }); A.recompute(); A.saveCache(); close(); U().render(); });
        });
      };
      $('#sv', sh).onclick = function (ev) {
        function n(idn) { var v = $('#' + idn, sh).value.trim(); if (v === '') return null; var x = BM.toNum(v); return isNaN(x) ? null : x; }
        var row = { id: p.id, nom: $('#nom', sh).value.trim(), preteur: $('#pre', sh).value.trim(), compte: $('#cpt', sh).value, mensualite: n('men') || 0, jour: n('jour') || 1,
          debut: $('#deb', sh).value, fin: $('#fin', sh).value, capital: n('cap'), taux: n('taux'), crd: n('crd'), dateCrd: $('#dcrd', sh).value, motcle: $('#mc', sh).value.trim(),
          modulable: $('#mod', sh).value, cat: $('#cat', sh).value, comm: $('#com', sh).value };
        if (!row.nom || !row.mensualite) { U().toast('Nom et mensualité obligatoires.'); return; }
        if (row.crd != null && !row.dateCrd) { U().toast('Indiquez la date du capital restant dû.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'PRETS', row: row, oldKey: p.id || null }), 'Prêt enregistré').then(function (r) {
          var saved = r.row, i = S.data.prets.findIndex(function (x) { return x.id === saved.id; });
          if (i >= 0) S.data.prets[i] = saved; else S.data.prets.push(saved);
          A.recompute(); A.saveCache(); close(); U().render();
        });
      };
    });
  }

  function echeances() {
    var list = S.data.echeances.slice().sort(function (a, b) { return (a.sens === b.sens ? 0 : a.sens === 'Crédit' ? -1 : 1) || a.jour - b.jour; });
    var deb = 0, cre = 0;
    list.forEach(function (e) { if (!e.actif) return; var m = e.montant / (BM.PERIODES[e.periodicite] || 1); if (e.sens === 'Crédit') cre += m; else deb += m; });
    var dt = A.debt();
    var out = '<section class="card"><div class="tiles t3">' + U().tile('Rentrées régulières', eur0(cre), 'par mois', 'good') + U().tile('Charges programmées', eur0(deb), 'hors prêts, mensualisé') + U().tile('Prêts', eur0(dt.total), 'par mois') + '</div>' +
      '<p class="small ink2">Reste après charges fixes et prêts : <b>' + eur0(cre - deb - dt.total) + '</b> par mois pour la vie courante et l\'épargne.</p></section>';
    out += '<section class="card"><div class="card-head"><h2>Échéancier</h2><button class="btn sm" data-ech="">＋ Échéance</button></div>' + list.map(function (e) {
      return '<div class="op" data-ech="' + esc(e.id) + '" style="' + (e.actif ? '' : 'opacity:.5') + '"><div class="av">' + (e.sens === 'Crédit' ? '💶' : U().catIcon(e.cat)) + '</div><div class="grow"><div class="l1">' + esc(e.lib) + '</div>' +
        '<div class="l2">' + esc(e.periodicite) + ' · le ' + e.jour + ' · ' + esc(e.compte) + (e.fin ? ' · jusqu\'au ' + A.dateLabel(e.fin, true) : '') + (e.comm ? ' · ⚠️' : '') + '</div></div><div class="mt num ' + (e.sens === 'Crédit' ? 'in' : '') + '">' + (e.sens === 'Crédit' ? '+' : '−') + eur(e.montant) + '</div></div>';
    }).join('') + '<p class="tiny muted mt12">Les prêts sont gérés dans l\'onglet Prêts. Les lignes marquées ⚠️ portent un commentaire à vérifier.</p></section>';
    return out;
  }
  function echSheet(id) {
    var e = S.data.echeances.filter(function (x) { return x.id === id; })[0], isNew = !e;
    e = e || { id: '', lib: '', cat: 'Abonnements numériques', compte: S.data.comptes[0].nom, montant: 0, sens: 'Débit', periodicite: 'Mensuelle', jour: 1, moisDepart: '', fin: '', actif: true, comm: '' };
    U().openSheet('<h2>' + (isNew ? 'Nouvelle échéance' : esc(e.lib)) + '</h2>' + (e.comm ? '<p class="small warn">⚠️ ' + esc(e.comm) + '</p>' : '') +
      '<div class="field"><label>Libellé</label><input class="input" id="lib" value="' + esc(e.lib) + '"></div>' +
      '<div class="seg mt12" id="sens">' + ['Débit', 'Crédit'].map(function (s) { return '<button data-s="' + s + '" class="' + (e.sens === s ? 'on' : '') + '">' + (s === 'Débit' ? 'Sortie' : 'Rentrée') + '</button>'; }).join('') + '</div>' +
      '<div class="grid2"><div class="field"><label>Montant (€)</label><input class="input" id="mt" inputmode="decimal" value="' + (e.montant || '') + '"></div><div class="field"><label>Jour du mois</label><input class="input" id="jr" inputmode="numeric" value="' + e.jour + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>Périodicité</label><select class="input" id="per">' + Object.keys(BM.PERIODES).map(function (p) { return '<option ' + (p === e.periodicite ? 'selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Mois de départ (si non mensuel)</label><input class="input" type="month" id="md" value="' + esc(e.moisDepart) + '"></div></div>' +
      '<div class="field"><label>Compte</label><select class="input" id="cpt">' + U().compteOptions(e.compte) + '</select></div>' +
      '<div class="field"><label>Catégorie</label><select class="input" id="cat">' + U().catOptions(e.cat) + '</select></div>' +
      '<div class="grid2"><div class="field"><label>Date de fin (facultatif)</label><input class="input" type="date" id="fin" value="' + esc(e.fin) + '"></div><label class="check" style="margin-top:28px"><input type="checkbox" id="act" ' + (e.actif ? 'checked' : '') + '> Active</label></div>' +
      '<div class="field"><label>Commentaire</label><input class="input" id="com" value="' + esc(e.comm) + '"></div>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn danger" id="del" style="flex:0 0 auto">🗑</button>') + '<button class="btn ghost" data-close>Annuler</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      var sens = e.sens;
      $$('#sens button', sh).forEach(function (b) { b.onclick = function () { sens = b.dataset.s; $$('#sens button', sh).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      var del = $('#del', sh);
      if (del) del.onclick = function () {
        U().confirmSheet('Supprimer cette échéance ?', e.lib, 'Supprimer', true).then(function (ok) {
          if (!ok) return;
          U().run(null, A.api('deleteRow', { table: 'ECHEANCES', key: e.id }), 'Échéance supprimée').then(function () { S.data.echeances = S.data.echeances.filter(function (x) { return x.id !== e.id; }); A.recompute(); A.saveCache(); close(); U().render(); });
        });
      };
      $('#sv', sh).onclick = function (ev) {
        var row = { id: e.id, lib: $('#lib', sh).value.trim(), cat: $('#cat', sh).value, compte: $('#cpt', sh).value, montant: Math.abs(BM.toNum($('#mt', sh).value)), sens: sens,
          periodicite: $('#per', sh).value, jour: Math.min(31, Math.max(1, parseInt($('#jr', sh).value, 10) || 1)), moisDepart: $('#md', sh).value, fin: $('#fin', sh).value, actif: $('#act', sh).checked, comm: $('#com', sh).value };
        if (!row.lib || !(row.montant > 0)) { U().toast('Libellé et montant obligatoires.'); return; }
        if (row.periodicite !== 'Mensuelle' && !row.moisDepart) { U().toast('Indiquez le mois de départ pour une échéance non mensuelle.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'ECHEANCES', row: row, oldKey: e.id || null }), 'Échéance enregistrée').then(function (r) {
          var sv = r.row, i = S.data.echeances.findIndex(function (x) { return x.id === sv.id; });
          if (i >= 0) S.data.echeances[i] = sv; else S.data.echeances.push(sv);
          A.recompute(); A.saveCache(); close(); U().render();
        });
      };
    });
  }


  /* =====================================================================
     PILOTAGE (v5) : chaque chiffre = base, comparaison, écart, sens
     ===================================================================== */
  function fmtM(v) { return v == null ? '–' : (v > 60 ? '+ de 5 ans' : v.toFixed(1).replace('.', ',') + ' mois'); }
  /** Bloc indicateur : titre, valeur, puis 4 lignes Base / Comparaison / Écart / Ce que ça veut dire. */
  function ind(o) {
    return '<div class="ind ' + (o.cls || '') + '"><div class="ind-top"><span class="ind-k">' + o.k + '</span><b class="num ind-v ' + (o.cls || '') + '">' + o.v + '</b></div>' +
      '<dl><dt>Base</dt><dd>' + o.base + '</dd><dt>Comparaison</dt><dd>' + o.comp + '</dd><dt>Écart</dt><dd class="' + (o.cls || '') + '">' + o.ecart + '</dd><dt>Sens</dt><dd>' + o.sens + '</dd></dl></div>';
  }
  function pilotage() {
    var pl = A.pilotage(), I = pl.I, P = S.data.params, last = BM.addMonths(BM.ym(S.today), -1), ref = pl.planDate ? A.dateLabel(pl.planDate, true) : null;
    var out = '';
    // 1. Verdict
    out += '<section class="card verdict ' + pl.verdict + '"><div class="card-head"><h2>Gagne-t-on du terrain ?</h2><span class="tag ' + pl.verdict + '">' + ({ good: 'Oui', warn: 'En partie', bad: 'Non, pas encore' })[pl.verdict] + '</span></div>' +
      pl.sig.map(function (g) { return '<div class="sig"><span class="sig-i ' + (g.ok == null ? '' : g.ok ? 'good' : 'bad') + '">' + (g.ok == null ? '–' : g.ok ? '✓' : '✗') + '</span><div><b>' + esc(g.k) + '</b><div class="small ink2">' + esc(g.txt) + '</div></div></div>'; }).join('') +
      '<p class="tiny muted mt8">Trois signaux simples et vérifiables, sans note composite. Point de départ du plan : ' + (ref || 'non défini (Réglages)') + '. « 3 mois » = moyenne des 3 derniers mois complets.</p></section>';
    // 2. Indicateurs
    var e = I.effort;
    out += '<section class="card"><div class="card-head"><h2>Les chiffres qui comptent</h2></div>' +
      ind({ k: "Taux d'effort (crédits)", v: e.v == null ? '–' : A.pct(e.v), cls: e.v > e.seuil ? 'bad' : 'good',
        base: eur0(pl.charges) + ' de mensualités et assurance emprunteur ÷ ' + eur0(e.rev) + ' de revenus réguliers déclarés',
        comp: 'norme bancaire HCSF : ' + Math.round(e.seuil * 100) + ' %',
        ecart: e.ecart > 0 ? eur0(e.ecart) + ' / mois au-dessus du seuil' : 'sous le seuil',
        sens: e.v > e.seuil ? 'Les banques ne prêteront plus sans baisse des mensualités : chaque euro gagné sur un crédit compte double.' : 'Endettement soutenable selon la norme.' }) +
      ind({ k: 'Vie courante (hors crédits)', v: eur0(I.vie.v) + ' / mois', cls: I.vie.ref && I.vie.v > I.vie.ref ? 'warn' : 'good',
        base: 'dépenses du foyer hors mensualités, moyenne 3 mois ; ' + A.monthLabel(last) + ' : ' + eur0(I.vie.last),
        comp: I.vie.ref ? 'plafond fixé : ' + eur0(I.vie.ref) : 'aucun plafond fixé',
        ecart: I.vie.ref ? A.sgn(I.vie.ecart, 0) + ' / mois' : '–',
        sens: I.vie.ref && I.vie.ecart > 0 ? 'Le dépassement est le levier le plus rapide : il ne dépend que de vous.' : 'Le plafond est tenu.' }) +
      ind({ k: 'Résultat structurel', v: A.sgn(I.struct.v, 0) + ' / mois', cls: I.struct.v < 0 ? 'bad' : 'good',
        base: 'revenus réguliers − toutes les dépenses du foyer (crédits compris), moyenne 3 mois',
        comp: '3 mois précédents : ' + A.sgn(I.struct.prev, 0),
        ecart: A.sgn(BM.r2(I.struct.v - I.struct.prev), 0) + ' / mois',
        sens: I.struct.v < 0 ? 'Le foyer dépense plus que ses revenus réguliers : la différence est prise sur l\'épargne ou sur des rentrées ponctuelles.' : 'Les revenus réguliers couvrent le train de vie.' }) +
      ind({ k: 'Pharmacie et procédure', v: eur0(I.proc.v) + ' / mois', cls: I.proc.v > 0 ? 'warn' : 'good',
        base: 'frais juridiques, avances et compte courant d\'associé, moyenne 3 mois ; ' + A.monthLabel(last) + ' : ' + eur0(I.proc.last),
        comp: '3 mois précédents : ' + eur0(I.proc.prev) + ' ; cible : 0 € (sommes non récupérables pendant le redressement)',
        ecart: A.sgn(BM.r2(I.proc.v - I.proc.prev), 0) + ' / mois',
        sens: I.proc.v > 0 ? 'Chaque euro avancé à la société sort du budget du foyer sans retour possible à court terme.' : 'Plus d\'avance : le budget du foyer est protégé.' }) +
      ind({ k: 'Rentrées ponctuelles', v: eur0(I.exc.v) + ' / mois', cls: I.exc.v > 0 && I.apres.v < 0 ? 'warn' : '',
        base: 'versements, dons, dépôts non identifiés, moyenne 3 mois ; ' + A.monthLabel(last) + ' : ' + eur0(I.exc.last),
        comp: '3 mois précédents : ' + eur0(I.exc.prev),
        ecart: A.sgn(BM.r2(I.exc.v - I.exc.prev), 0) + ' / mois',
        sens: 'Ces sommes ne sont pas garanties : le budget ne doit pas en dépendre.' }) +
      ind({ k: 'Dette totale (capital restant dû)', v: eur0(I.dette.v), cls: I.dette.ecart != null && I.dette.ecart < 0 ? 'good' : '',
        base: 'somme des capitaux restant dus des prêts en cours' + (I.dette.known ? '' : ' (un CRD manque)'),
        comp: I.dette.ref != null ? 'au départ du plan (' + ref + ') : ' + eur0(I.dette.ref) : 'référence absente',
        ecart: I.dette.ecart != null ? A.sgn(I.dette.ecart, 0) : '–',
        sens: 'Baisse mécanique par les mensualités ; elle n\'est un vrai progrès que si les liquidités tiennent en même temps.' }) +
      ind({ k: 'Liquidités (comptes + livrets)', v: eur0(I.liq.v), cls: I.liq.ecart != null && I.liq.ecart < 0 ? 'warn' : 'good',
        base: 'comptes courants ' + eur0(I.liq.cour) + ' + épargne ' + eur0(I.liq.epa),
        comp: I.liq.ref != null ? 'au ' + ref + ' : ' + eur0(I.liq.ref) : 'référence absente',
        ecart: I.liq.ecart != null ? A.sgn(I.liq.ecart, 0) : '–',
        sens: 'Ce qui reste pour absorber un imprévu.' }) +
      ind({ k: 'Épargne de précaution', v: fmtM(I.prec.v), cls: I.prec.v != null && I.prec.v < I.prec.cible ? 'warn' : 'good',
        base: 'livrets ' + eur0(I.prec.montant) + ' ÷ plafond de vie courante ' + eur0(P.plafondVie || 0),
        comp: 'cible : ' + I.prec.cible + ' mois',
        ecart: I.prec.manque ? 'il manque ' + eur0(I.prec.manque) : 'cible atteinte',
        sens: 'Matelas recommandé de 3 à 6 mois de dépenses avant tout remboursement anticipé.' }) +
      ind({ k: 'Autonomie', v: I.auto.mois == null ? 'à l\'équilibre' : fmtM(I.auto.mois), cls: I.auto.mois != null && I.auto.mois < 6 ? 'bad' : I.auto.mois != null && I.auto.mois < 12 ? 'warn' : 'good',
        base: 'liquidités ' + eur0(I.auto.patrimoine) + ' ÷ déficit habituel ' + eur0(Math.max(0, -I.auto.deficit)) + ' / mois',
        comp: 'déficit = revenus réguliers ' + eur0(I.auto.socle) + ' − sorties ' + eur0(I.auto.sorties) + ' (moyenne 3 mois, épargne exclue)',
        ecart: A.sgn(I.auto.deficit, 0) + ' / mois',
        sens: I.auto.mois == null ? 'Pas de déficit : les réserves ne baissent pas.' : 'Temps avant épuisement des réserves si rien ne change et sans rentrée ponctuelle.' }) +
      '</section>';
    // 3. Tendance 12 mois
    out += '<section class="card"><div class="card-head"><h2>12 derniers mois</h2></div><div id="c-pil"></div>' +
      '<div class="legend-row"><span><i style="background:var(--s1)"></i>Revenus réguliers</span><span><i style="background:var(--s2)"></i>Dépenses du foyer</span></div><p class="tiny muted">L\'écart entre les deux courbes est le résultat structurel. Les montants de procédure, très irréguliers, sont dans le tableau.</p>' +
      '<table class="tbl mt8 tbl-tight"><thead><tr><th>Mois</th><th class="r">Résultat</th><th class="r">Procédure</th><th class="r">Ponctuel</th></tr></thead><tbody>' +
      pl.serie.slice().reverse().map(function (r) { return '<tr><td>' + A.monthLabel(r.m) + '</td><td class="r ' + (r.struct < 0 ? 'bad' : 'good') + '">' + A.sgn(r.struct, 0) + '</td><td class="r">' + eur0(r.proc) + '</td><td class="r">' + eur0(r.recExc) + '</td></tr>'; }).join('') +
      '</tbody></table><p class="tiny muted">Résultat = revenus réguliers − dépenses du foyer (crédits compris). Procédure et travaux sont à part.</p></section>';
    // 4. Leviers
    out += '<section class="card"><div class="card-head"><h2>Leviers en cours</h2><button class="link" data-avtab="plan">Plan complet ›</button></div>' +
      '<p class="small ink2">Gain mensuel visé encore ouvert : <b>' + eur0(pl.gainOuvert) + '</b>' + (pl.gainObtenu ? ' · déjà obtenu : <b class="good">' + eur0(pl.gainObtenu) + '</b>' : '') + '</p>' +
      (pl.dus.length ? '<p class="small warn">⏰ ' + pl.dus.length + ' point' + (pl.dus.length > 1 ? 's' : '') + ' de retour à faire : ' + pl.dus.map(function (a) { return esc(a.id); }).join(', ') + '</p>' : '') +
      pl.open.slice(0, 5).map(planRow).join('') + '</section>';
    // 5. Ordre de remboursement
    var po = A.payoffOrder();
    if (po.avalanche.length) out += '<section class="card"><div class="card-head"><h2>Si un euro de plus se libère : quel crédit d\'abord ?</h2></div>' +
      '<div class="grid2"><div><h3>Par taux (avalanche)</h3><ol class="small">' + po.avalanche.map(function (x) { return '<li>' + esc(x.p.nom.replace(/^Prêt n° \d+ — /, '')) + ' · ' + (x.taux == null ? '?' : String(x.taux).replace('.', ',') + ' %') + '</li>'; }).join('') + '</ol></div>' +
      '<div><h3>Par solde (boule de neige)</h3><ol class="small">' + po.neige.map(function (x) { return '<li>' + esc(x.p.nom.replace(/^Prêt n° \d+ — /, '')) + ' · ' + (x.crd == null ? '?' : eur0(x.crd)) + '</li>'; }).join('') + '</ol></div></div>' +
      '<p class="tiny muted">L\'avalanche coûte le moins d\'intérêts ; la boule de neige solde plus vite un premier crédit et libère une mensualité entière. Uniquement après l\'épargne de précaution. Remboursement anticipé d\'un crédit conso : indemnité nulle sous 10 000 € remboursés sur 12 mois, sinon 1 % maximum (0,5 % s\'il reste moins d\'un an).</p></section>';
    // 6. Recours
    out += '<section class="card"><div class="card-head"><h2>Où se faire aider (gratuit)</h2></div>' +
      '<div class="small"><p><b>Point conseil budget</b> : accompagnement budgétaire gratuit et confidentiel, y compris négociation avec les créanciers. Liste sur mesquestionsdargent.fr.</p>' +
      '<p><b>Banque de France</b> : dossier de surendettement si les dettes ne peuvent plus être payées. Recours de dernier ressort : inscription au fichier FICP et plan imposé.</p>' +
      '<p><b>Votre conseiller bancaire</b> : modulation, report d\'échéances, allongement. Toujours demander par écrit et noter la réponse dans le Plan.</p></div></section>';
    return out;
  }
  function mountPilotage() {
    var pl = A.pilotage(), h = $('#c-pil'); if (!h) return;
    Charts.line(h, { labels: pl.serie.map(function (r) { return r.m; }), height: 200, fmt: eur0, xfmt: function (m) { return m.slice(5); }, tipLabel: function (m) { return A.monthLabel(m); },
      series: [{ name: 'Revenus réguliers', color: 'var(--s1)', values: pl.serie.map(function (r) { return r.recReg; }) },
        { name: 'Dépenses du foyer', color: 'var(--s2)', values: pl.serie.map(function (r) { return BM.r2(r.vie + r.loan); }) }
      ], aria: 'Revenus réguliers et dépenses du foyer sur 12 mois' });
  }

  /* =====================================================================
     PLAN D'ACTIONS (onglet PLAN du classeur)
     ===================================================================== */
  var PLAN_ST = ['À faire', 'En cours', 'Fait', 'Refusé', 'Utilisé', 'Disponible', 'Abandonné'];
  function stCls(st) { return { 'Fait': 'good', 'En cours': 'warn', 'À faire': '', 'Refusé': 'bad', 'Abandonné': 'muted', 'Utilisé': 'muted', 'Disponible': 'good' }[st] || ''; }
  function planRow(a) {
    var late = a.retour && a.retour <= S.today && ['Fait', 'Refusé', 'Abandonné'].indexOf(a.statut) === -1;
    return '<div class="env" data-plan="' + esc(a.id) + '" style="cursor:pointer"><div class="top"><div class="name"><span class="tiny muted">' + esc(a.id) + '</span><span>' + esc(a.levier) + '</span></div>' +
      '<b class="num">' + (a.gain ? eur0(a.gain) + '/mois' : '') + '</b></div>' +
      '<div class="sub"><span><span class="tag ' + stCls(a.statut) + '">' + esc(a.statut) + '</span> ' + esc(a.qui || '') + '</span><span class="' + (late ? 'warn' : '') + '">' + (a.retour ? (late ? '⏰ ' : '') + 'retour ' + A.dateLabel(a.retour, true) : '') + '</span></div>' +
      (a.prochaine ? '<div class="small ink2 mt8">➜ ' + esc(a.prochaine) + '</div>' : '') +
      (a.resultat ? '<div class="small good mt8">Résultat : ' + esc(a.resultat) + '</div>' : '') + '</div>';
  }
  function planView() {
    var plan = (S.data.plan || []).slice(), pl = A.pilotage();
    var order = function (a) { return { 'En cours': 0, 'À faire': 1, 'Disponible': 2, 'Fait': 3, 'Utilisé': 4, 'Refusé': 5, 'Abandonné': 6 }[a.statut]; };
    plan.sort(function (a, b) { return (order(a) - order(b)) || ((b.gain || 0) - (a.gain || 0)); });
    return '<section class="card"><div class="card-head"><h2>Plan d\'actions</h2><button class="btn sm" data-plan="">＋ Action</button></div>' +
      '<div class="tiles t3">' + U().tile('Gain visé ouvert', eur0(pl.gainOuvert), 'par mois, actions non closes') + U().tile('Gain obtenu', eur0(pl.gainObtenu), 'actions « Fait »', pl.gainObtenu ? 'good' : '') +
      U().tile('Points de retour dus', String(pl.dus.length), pl.dus.length ? 'à mettre à jour' : 'rien en retard', pl.dus.length ? 'warn' : 'good') + '</div>' +
      '<p class="small ink2 mt8">Chaque action a un point de retour daté : on y note ce qui a été obtenu (avant / après), puis on passe au statut Fait, Refusé ou Abandonné.</p>' +
      (plan.length ? plan.map(planRow).join('') : '<p class="empty">Aucune action. L\'onglet PLAN du classeur est vide.</p>') + '</section>';
  }
  function planSheet(id) {
    var a = (S.data.plan || []).filter(function (x) { return x.id === id; })[0], isNew = !a;
    a = a || { id: '', levier: '', gain: 0, qui: '', statut: 'À faire', derniere: '', prochaine: '', retour: '', resultat: '', comm: '' };
    function f(label, idn, val, type) { return '<div class="field"><label>' + label + '</label><input class="input" id="' + idn + '" ' + (type ? 'type="' + type + '"' : 'inputmode="decimal"') + ' value="' + esc(val == null ? '' : val) + '"></div>'; }
    function t(label, idn, val) { return '<div class="field"><label>' + label + '</label><textarea class="input" id="' + idn + '" rows="2">' + esc(val || '') + '</textarea></div>'; }
    U().openSheet('<h2>' + (isNew ? 'Nouvelle action' : esc(a.id) + ' · ' + esc(a.levier)) + '</h2>' +
      f('Levier', 'lv', a.levier, 'text') + '<div class="grid2">' + f('Gain mensuel visé (€)', 'gn', a.gain || '') + f('Interlocuteur', 'qui', a.qui, 'text') + '</div>' +
      '<div class="grid2"><div class="field"><label>Statut</label><select class="input" id="st">' + PLAN_ST.map(function (s) { return '<option' + (s === a.statut ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      f('Date du point de retour', 'rt', a.retour, 'date') + '</div>' +
      f('Dernière démarche (date)', 'dd', a.derniere, 'date') + t('Prochaine étape', 'pe', a.prochaine) + t('Résultat constaté (avant → après)', 'rs', a.resultat) + t('Commentaire', 'cm', a.comm) +
      '<div class="acts">' + (isNew ? '' : '<button class="btn danger" id="del" style="flex:0 0 auto">🗑</button>') + '<button class="btn ghost" data-close>Annuler</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      var del = $('#del', sh);
      if (del) del.onclick = function () {
        U().confirmSheet('Supprimer ' + a.id + ' ?', 'L\'action et son historique seront retirés de l\'onglet PLAN. Pour garder la trace, préférez le statut « Abandonné ».', 'Supprimer', true).then(function (ok) {
          if (!ok) return;
          U().run(null, A.api('deleteRow', { table: 'PLAN', key: a.id }), 'Action supprimée').then(function () { S.data.plan = S.data.plan.filter(function (x) { return x.id !== a.id; }); A.recompute(); A.saveCache(); U().render(); });
        });
      };
      $('#sv', sh).onclick = function (ev) {
        var row = { id: a.id, levier: $('#lv', sh).value.trim(), gain: BM.toNum($('#gn', sh).value || '0') || 0, qui: $('#qui', sh).value.trim(), statut: $('#st', sh).value,
          derniere: $('#dd', sh).value, prochaine: $('#pe', sh).value.trim(), retour: $('#rt', sh).value, resultat: $('#rs', sh).value.trim(), comm: $('#cm', sh).value.trim() };
        if (!row.levier) { U().toast('Le levier est obligatoire.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'PLAN', row: row, oldKey: a.id || null }), 'Action enregistrée').then(function (r) {
          var sv = r.row, list = S.data.plan || (S.data.plan = []), i = list.findIndex(function (x) { return x.id === sv.id; });
          if (i >= 0) list[i] = sv; else list.push(sv);
          A.recompute(); A.saveCache(); close(); U().render();
        });
      };
    });
  }

  function objectifs() {
    var list = S.data.objectifs;
    var out = '<section class="card"><div class="card-head"><h2>Objectifs d\'épargne</h2><button class="btn sm" data-obj="">＋ Objectif</button></div>';
    if (!list.length) {
      var fixed = A.avg(A.lastMonths(6).map(function (m) { return A.M(m).depFixe; }));
      out += '<p class="empty">Aucun objectif pour l\'instant.<br>Idée de départ : une épargne de précaution de 3 mois de charges fixes, soit ' + eur0(Math.ceil(fixed * 3 / 100) * 100) + '.</p>';
    }
    out += list.map(function (g) {
      var o = A.objective(g);
      return '<div class="loan row" data-obj="' + esc(g.id) + '" style="' + (g.actif ? '' : 'opacity:.5') + '"><div class="ring">' + Charts.ring(o.pct, o.late ? 'var(--warn)' : 'var(--good)') + '<span>' + Math.round(o.pct * 100) + '%</span></div>' +
        '<div class="grow"><div class="b">' + (g.icone || '🎯') + ' ' + esc(g.nom) + '</div><div class="small muted">' + eur0(o.have) + ' sur ' + eur0(g.cible) + (g.date ? ' · échéance ' + A.dateLabel(g.date, true) : '') + '</div>' +
        (o.perMonth != null && o.rest > 0 ? '<div class="small ' + (o.late ? 'warn' : 'good') + '">' + eur0(o.perMonth) + ' / mois pendant ' + o.mLeft + ' mois</div>' : (o.rest <= 0 ? '<div class="small good">Objectif atteint 🎉</div>' : '')) + '</div></div>';
    }).join('');
    return out + '<p class="tiny muted mt12">La progression = solde du compte d\'épargne associé + montant déjà épargné ailleurs.</p></section>';
  }
  function objSheet(id) {
    var g = S.data.objectifs.filter(function (x) { return x.id === id; })[0], isNew = !g;
    g = g || { id: '', nom: '', cible: 0, date: '', compte: '', deja: 0, icone: '🎯', actif: true };
    U().openSheet('<h2>' + (isNew ? 'Nouvel objectif' : esc(g.nom)) + '</h2>' +
      '<div class="grid2"><div class="field"><label>Objectif</label><input class="input" id="nom" value="' + esc(g.nom) + '" placeholder="ex. Épargne de précaution"></div><div class="field"><label>Icône</label><input class="input" id="ic" value="' + esc(g.icone) + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>Montant cible (€)</label><input class="input" id="ci" inputmode="decimal" value="' + (g.cible || '') + '"></div><div class="field"><label>Date cible</label><input class="input" type="date" id="dt" value="' + esc(g.date) + '"></div></div>' +
      '<div class="field"><label>Compte d\'épargne associé (facultatif)</label><select class="input" id="cpt">' + U().compteOptions(g.compte, '— aucun —') + '</select></div>' +
      '<div class="field"><label>Déjà épargné ailleurs (€)</label><input class="input" id="dj" inputmode="decimal" value="' + (g.deja || '') + '"></div>' +
      '<label class="check"><input type="checkbox" id="act" ' + (g.actif ? 'checked' : '') + '> Actif</label>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn danger" id="del" style="flex:0 0 auto">🗑</button>') + '<button class="btn ghost" data-close>Annuler</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      var del = $('#del', sh);
      if (del) del.onclick = function () {
        U().run(null, A.api('deleteRow', { table: 'OBJECTIFS', key: g.id }), 'Objectif supprimé').then(function () { S.data.objectifs = S.data.objectifs.filter(function (x) { return x.id !== g.id; }); A.recompute(); A.saveCache(); close(); U().render(); });
      };
      $('#sv', sh).onclick = function (ev) {
        var row = { id: g.id, nom: $('#nom', sh).value.trim(), cible: BM.toNum($('#ci', sh).value), date: $('#dt', sh).value, compte: $('#cpt', sh).value, deja: BM.toNum($('#dj', sh).value || '0') || 0, icone: $('#ic', sh).value, actif: $('#act', sh).checked };
        if (!row.nom || !(row.cible > 0)) { U().toast('Nom et montant cible obligatoires.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'OBJECTIFS', row: row, oldKey: g.id || null }), 'Objectif enregistré').then(function (r) {
          var sv = r.row, i = S.data.objectifs.findIndex(function (x) { return x.id === sv.id; });
          if (i >= 0) S.data.objectifs[i] = sv; else S.data.objectifs.push(sv);
          A.recompute(); A.saveCache(); close(); U().render();
        });
      };
    });
  }

  /* =====================================================================
     PLUS : analyses, import, comptes, réglages
     ===================================================================== */
  var plus = {
    html: function () {
      var t = S.plusTab || (S.plusTab = 'analyses');
      var out = U().topbar('Plus', 'Analyses, import, comptes et réglages', seg([['analyses', '📊 Analyses'], ['import', '📥 Importer'], ['comptes', '💳 Comptes'], ['reglages', '⚙️ Réglages']], t, 'pl'));
      out += '<main class="content">' + ({ analyses: analyses, import: importView, comptes: comptes, reglages: reglages }[t])() + '</main>';
      return out;
    },
    mount: function () {
      bindSeg('pl', 'plusTab');
      U().bindCommon();
      ({ analyses: mountAnalyses, import: mountImport, comptes: mountComptes, reglages: mountReglages }[S.plusTab])();
    }
  };

  /* ---------------- Analyses ---------------- */
  function periodMonths() { var n = S.anN || 12; return A.lastMonths(n).reverse(); }
  function analyses() {
    var ms = periodMonths(), n = ms.length;
    var rec = 0, recExc = 0, dep = 0, epa = 0, proj = 0, cca = 0, groups = {}, cats = {};
    ms.forEach(function (m) { var s = A.M(m); rec += s.recReg; recExc += s.recExc; dep += s.dep; epa += s.epa; proj += s.proj; cca += s.cca;
      Object.keys(s.groups).forEach(function (g) { groups[g] = (groups[g] || 0) + s.groups[g]; });
      Object.keys(s.cats).forEach(function (c) { cats[c] = (cats[c] || 0) + s.cats[c]; }); });
    var out = '<div class="seg">' + [6, 12, 24].map(function (k) { return '<button data-an="' + k + '" class="' + ((S.anN || 12) === k ? 'on' : '') + '">' + k + ' mois</button>'; }).join('') + '</div>';
    out += '<section class="card"><div class="small muted">' + A.monthLabel(ms[0]) + ' → ' + A.monthLabel(ms[n - 1]) + ' (mois complets)</div><div class="tiles t4 mt8">' +
      U().tile('Revenus réguliers', eur0(rec / n), 'par mois') + U().tile('Dépenses', eur0(dep / n), 'par mois') +
      U().tile("Taux d'épargne", rec ? A.pct((rec - dep) / rec) : '–', 'hors exceptionnel', rec - dep < 0 ? 'bad' : 'good') +
      U().tile('Exceptionnel', eur0(recExc), 'sur la période (dons…)') + '</div>' +
      '<div id="c-hist" class="mt12"></div><div class="legend-row"><span><i style="background:var(--s1)"></i>Revenus réguliers</span><span><i style="background:var(--s2)"></i>Dépenses</span></div></section>';
    // Comparaison 3 mois (repris de l'appli mobile v3.x)
    var t3 = A.threeMonths(BM.ym(S.today), !!S.t3aDate), mm = t3.mois;
    function ec(av, ap) { if (Math.abs(av) < 0.005 && Math.abs(ap) < 0.005) return ''; var d = ap - av; if (Math.abs(d) < 0.5) return '<span class="tag">=</span>';
      return '<span class="tag ' + (d > 0 ? 'bad' : 'good') + '">' + (d > 0 ? '▲ ' : '▼ ') + eur0(Math.abs(d)) + (Math.abs(av) > 0.005 ? ' ' + Math.round(Math.abs(d) / Math.abs(av) * 100) + ' %' : '') + '</span>'; }
    out += '<section class="card"><div class="card-head"><h2>📆 Comparer les 3 derniers mois</h2></div>' +
      '<div class="seg"><button data-t3="0" class="' + (S.t3aDate ? '' : 'on') + '">Mois complets</button><button data-t3="1" class="' + (S.t3aDate ? 'on' : '') + '">Jusqu\'au ' + t3.jour + ' de chaque mois</button></div>' +
      (!S.t3aDate && t3.partiel ? '<p class="small warn mt8">' + A.monthLabel(mm[2]) + ' n\'est pas terminé : comparé à des mois complets, tout paraît en baisse. Choisissez « Jusqu\'au ' + t3.jour + ' » pour une comparaison juste.</p>' : '') +
      '<div class="scrollx mt8"><table class="tbl"><thead><tr><th>Poste</th>' + mm.map(function (m) { return '<th class="r">' + A.monthLabel(m, true) + '</th>'; }).join('') + '<th class="r">Évolution</th></tr></thead><tbody>' +
      '<tr><td class="b">Sorties</td>' + t3.dep.map(function (v) { return '<td class="r b">' + eur0(v) + '</td>'; }).join('') + '<td class="r">' + ec(t3.dep[1], t3.dep[2]) + '</td></tr>' +
      '<tr><td>Recettes</td>' + t3.rec.map(function (v) { return '<td class="r">' + eur0(v) + '</td>'; }).join('') + '<td></td></tr>' +
      t3.groupes.map(function (g, i) {
        var open = S.t3open && S.t3open[i];
        return '<tr data-t3g="' + i + '" style="cursor:pointer"><td>' + (open ? '▾ ' : '▸ ') + esc(A.groupLabel(g.nom)) + '</td>' + g.v.map(function (v) { return '<td class="r">' + (v ? eur0(v) : '–') + '</td>'; }).join('') + '<td class="r">' + ec(g.v[1], g.v[2]) + '</td></tr>' +
          (open ? g.cats.map(function (c) { return '<tr class="small" data-cat="' + esc(c.nom) + '" style="cursor:pointer;background:var(--surface-2)"><td style="padding-left:18px">' + esc(c.nom) + '</td>' + c.v.map(function (v) { return '<td class="r">' + (Math.abs(v) > 0.005 ? eur0(v) : '–') + '</td>'; }).join('') + '<td class="r">' + ec(c.v[1], c.v[2]) + '</td></tr>'; }).join('') : '');
      }).join('') + '</tbody></table></div><p class="tiny muted">Touchez un poste pour voir ses catégories, une catégorie pour son historique.</p></section>';
    // Répartition
    var items = Object.keys(groups).filter(function (g) { return groups[g] > 0; });
    out += '<section class="card"><div class="card-head"><h2>Répartition des dépenses</h2></div><div id="c-don"></div></section>';
    // Catégories
    var cl = Object.keys(cats).filter(function (c) { var k = S.catMap[c]; return k && k.type === 'Dépense' && cats[c] > 0; }).sort(function (a, b) { return cats[b] - cats[a]; }).slice(0, 18);
    out += '<section class="card"><div class="card-head"><h2>Catégories · moyenne mensuelle</h2></div><div class="scrollx"><table class="tbl"><thead><tr><th>Catégorie</th><th class="r">/ mois</th><th class="r">Enveloppe</th><th>Tendance</th></tr></thead><tbody>' +
      cl.map(function (c) {
        var h = ms.map(function (m) { return A.M(m).cats[c] || 0; }), av = cats[c] / n, env = S.catMap[c].enveloppe;
        return '<tr data-cat="' + esc(c) + '" style="cursor:pointer"><td>' + (S.catMap[c].icone || '') + ' ' + esc(c) + '</td><td class="r b">' + eur0(av) + '</td><td class="r ' + (env && av > env * 1.05 ? 'bad' : '') + '">' + (env ? eur0(env) : '–') + '</td><td>' + Charts.spark(h, 'var(--s1)', 90, 26) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
    // Récurrents
    var rc = A.recurring();
    out += '<section class="card" id="recurrents"><div class="card-head"><h2>🔁 Dépenses récurrentes détectées</h2><span class="small muted">' + eur0(rc.reduce(function (a, b) { return a + b.annuel; }, 0)) + ' / an</span></div>' +
      (rc.length ? rc.slice(0, 20).map(function (r) {
        return '<div class="op" style="cursor:default"><div class="av">' + U().catIcon(r.cat) + '</div><div class="grow"><div class="l1">' + esc(r.nom) + '</div><div class="l2">' + esc(r.cat) + ' · ' + esc(r.compte) + ' · vu ' + r.n + ' mois sur 6</div></div><div class="mt num">' + eur(r.mensuel) + '<div class="tiny muted">' + eur0(r.annuel) + '/an</div></div></div>';
      }).join('') : '<p class="empty">Aucune dépense récurrente détectée.</p>') + '<p class="tiny muted mt8">Même libellé, même compte, au moins 3 mois sur 6, montant stable (±35 %). Hors prêts et impôts.</p></section>';
    // Marchands
    var mer = {};
    S.ops.forEach(function (o) { if (o.type !== 'Dépense' || ms.indexOf(o.m) === -1 || o.mt >= 0) return; var k = A.merchant(o.lib); (mer[k] = mer[k] || { n: 0, t: 0, lib: o.lib }); mer[k].n++; mer[k].t -= o.mt; });
    var mk = Object.keys(mer).sort(function (a, b) { return mer[b].t - mer[a].t; }).slice(0, 12);
    out += '<section class="card"><div class="card-head"><h2>🏪 Où vous dépensez le plus</h2></div><div class="scrollx"><table class="tbl"><thead><tr><th>Bénéficiaire</th><th class="r">Nb</th><th class="r">Total</th><th class="r">/ mois</th></tr></thead><tbody>' +
      mk.map(function (k) { return '<tr><td>' + esc(A.pretty(mer[k].lib)) + '</td><td class="r">' + mer[k].n + '</td><td class="r b">' + eur0(mer[k].t) + '</td><td class="r">' + eur0(mer[k].t / n) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    // Titulaire & banque
    var tit = {}, ban = {};
    S.ops.forEach(function (o) {
      if (ms.indexOf(o.m) === -1 || (o.type !== 'Dépense' && o.type !== 'Recette')) return;
      var c = S.comptesMap[o.compte] || {}, t = c.titulaire || '?', b = c.banque || '?';
      tit[t] = tit[t] || { d: 0, r: 0 }; ban[b] = ban[b] || { d: 0, r: 0 };
      if (o.type === 'Dépense') { tit[t].d -= o.mt; ban[b].d -= o.mt; } else { tit[t].r += o.mt; ban[b].r += o.mt; }
    });
    function tbl(title, obj) {
      return '<section class="card"><div class="card-head"><h2>' + title + '</h2></div><table class="tbl"><thead><tr><th></th><th class="r">Dépenses / mois</th><th class="r">Recettes / mois</th></tr></thead><tbody>' +
        Object.keys(obj).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="r">' + eur0(obj[k].d / n) + '</td><td class="r">' + eur0(obj[k].r / n) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    }
    out += tbl('👥 Par titulaire', tit) + tbl('🏦 Par banque', ban);
    // Années
    var years = {};
    S.months.forEach(function (m) { var y = m.slice(0, 4), s = A.M(m); years[y] = years[y] || { r: 0, x: 0, d: 0, p: 0 }; years[y].r += s.recReg; years[y].x += s.recExc; years[y].d += s.dep; years[y].p += s.proj; });
    out += '<section class="card"><div class="card-head"><h2>📅 Par année</h2></div><div class="scrollx"><table class="tbl"><thead><tr><th>Année</th><th class="r">Revenus rég.</th><th class="r">Exceptionnel</th><th class="r">Dépenses</th><th class="r">Chantier</th></tr></thead><tbody>' +
      Object.keys(years).sort().map(function (y) { var v = years[y]; return '<tr><td class="b">' + y + '</td><td class="r">' + eur0(v.r) + '</td><td class="r">' + eur0(v.x) + '</td><td class="r">' + eur0(v.d) + '</td><td class="r">' + eur0(v.p) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    // Hors budget
    var ccaTot = 0, projTot = 0;
    S.months.forEach(function (m) { ccaTot += A.M(m).cca; projTot += A.M(m).proj; });
    out += '<section class="card"><div class="card-head"><h2>Hors budget courant</h2></div><div class="tiles">' +
      U().tile("Compte courant d'associé", eur0(ccaTot), 'solde net depuis l\'origine (avances − remboursements)') + U().tile('Chantier (type Projet)', eur0(projTot), 'cumul depuis l\'origine') + '</div></section>';
    return out;
  }
  function mountAnalyses() {
    $$('[data-an]').forEach(function (b) { b.onclick = function () { S.anN = +b.dataset.an; U().render(); }; });
    $$('[data-t3]').forEach(function (b) { b.onclick = function () { S.t3aDate = b.dataset.t3 === '1'; U().render(); }; });
    $$('[data-t3g]').forEach(function (b) { b.onclick = function () { S.t3open = S.t3open || {}; S.t3open[b.dataset.t3g] = !S.t3open[b.dataset.t3g]; U().render(); }; });
    var ms = periodMonths();
    Charts.bars($('#c-hist'), { labels: ms, height: 210, fmt: eur0, xfmt: function (m) { return A.monthLabel(m, true).split(' ')[0]; }, tipLabel: function (m) { return A.monthLabel(m); },
      series: [{ name: 'Revenus réguliers', color: 'var(--s1)', values: ms.map(function (m) { return BM.r2(A.M(m).recReg); }) }, { name: 'Dépenses', color: 'var(--s2)', values: ms.map(function (m) { return BM.r2(A.M(m).dep); }) }],
      extraTip: function (i) { var s = A.M(ms[i]); return '<br>Solde régulier : ' + A.sgn(BM.r2(s.recReg - s.dep), 0) + (s.recExc ? '<br>Exceptionnel : ' + eur0(s.recExc) : ''); } });
    // donut sur la période
    var groups = {};
    ms.forEach(function (m) { var g = A.M(m).groups; Object.keys(g).forEach(function (k) { groups[k] = (groups[k] || 0) + g[k]; }); });
    var host = $('#c-don'), main = {}, other = 0;
    Object.keys(groups).forEach(function (k) { if (groups[k] <= 0) return; if (A.groupColor(k) === 'var(--s0)') other += groups[k]; else main[k] = groups[k]; });
    var items = Object.keys(main).sort().map(function (k) { return { label: A.groupLabel(k), value: main[k] / ms.length, color: A.groupColor(k) }; });
    if (other) items.push({ label: 'Autres', value: other / ms.length, color: 'var(--s0)' });
    var tot = items.reduce(function (a, b) { return a + b.value; }, 0);
    host.innerHTML = '<div class="donut-wrap"><div id="dn2"></div><div class="lst">' + items.slice().sort(function (a, b) { return b.value - a.value; }).map(function (it) {
      return '<div><span><i style="background:' + it.color + ';width:10px;height:10px;border-radius:3px;display:inline-block"></i><span class="ellipsis">' + esc(it.label) + '</span></span><b class="num">' + eur0(it.value) + '<span class="muted tiny"> /mois</span></b></div>';
    }).join('') + '</div></div>';
    Charts.donut($('#dn2', host), { items: items, fmt: function (v) { return eur0(v) + ' / mois'; }, center: [eur0(tot), 'par mois'], size: 150 });
  }

  /* ---------------- Import des relevés ---------------- */
  function importView() {
    var I = S.imp || (S.imp = { step: 1, compte: A.LS.get('impCompte', '') });
    var out = '';
    if (I.step === 1) {
      if (I.pending) out += '<section class="card" style="border:2px solid var(--warn)"><b>📄 ' + esc(I.source) + '</b><p class="small ink2">' + esc(I.format || 'Relevé') + (I.compteNo ? ' · n° ' + esc(I.compteNo) + ' (inconnu)' : '') + ' : touchez le compte correspondant ci-dessous. Il sera reconnu automatiquement la prochaine fois.</p></section>';
      out += '<section class="card"><h2>1. Quel compte ?</h2><p class="small muted">Facultatif pour les relevés reconnus : le compte est trouvé grâce à son numéro.</p><div class="catlist mt12">' + S.data.comptes.filter(function (c) { return c.actif; }).map(function (c) {
        var l = S.fresh[c.nom];
        return '<button data-ic="' + esc(c.nom) + '" class="' + (I.compte === c.nom ? 'on' : '') + '"><div>' + esc(c.nom) + '</div><div class="tiny" style="opacity:.75">' + (l ? 'relevé au ' + A.dateLabel(l, true) : 'aucune opération') + '</div></button>';
      }).join('') + '</div></section>';
      out += '<section class="card"><h2>2. Le relevé</h2><p class="small ink2">Fichier exporté depuis votre banque : CSV, OFX, QIF, Excel. Ou copiez-collez les lignes du relevé.</p>' +
        '<label class="drop" id="drop"><input type="file" id="file" multiple accept=".csv,.txt,.ofx,.qfx,.qif,.xls,.xlsx,.ods,text/csv" hidden><div style="font-size:30px">📄</div><div class="b">Choisir un ou plusieurs fichiers</div><div class="small muted">ou les glisser ici · LCL, Banque Populaire, Société Générale et La Banque Postale sont reconnus automatiquement (compte, libellés, solde)</div></label>' +
        '<details class="mt12"><summary class="small b" style="cursor:pointer">Coller du texte</summary><textarea class="input mt8" id="paste" rows="6" placeholder="Date;Libellé;Montant…"></textarea><button class="btn sm mt8" id="pgo">Analyser le texte</button></details></section>';
    } else if (I.step === 2) out += mappingHtml(I);
    else if (I.step === 3) out += reviewHtml(I);
    return out;
  }
  function mountImport() {
    var I = S.imp;
    $$('[data-ic]').forEach(function (b) { b.onclick = function () {
      I.compte = b.dataset.ic; A.LS.set('impCompte', I.compte); $$('[data-ic]').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (I.pending) { var res = I.pending; I.pending = null; if (I.compteNo) A.LS.set('no_' + String(I.compteNo).replace(/\s/g, '').toUpperCase(), I.compte); handle(Promise.resolve(res), I.source); }
    }; });
    var file = $('#file'), drop = $('#drop');
    if (file) {
      file.onchange = function () { startFiles(Array.prototype.slice.call(file.files)); };
      drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('over'); };
      drop.ondragleave = function () { drop.classList.remove('over'); };
      drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('over'); startFiles(Array.prototype.slice.call(e.dataTransfer.files)); };
      $('#pgo').onclick = function () { var t = $('#paste').value; if (t.trim()) handle(Promise.resolve(Importer.parseText(t)), 'texte collé'); };
    }
    if (I.step === 2) mountMapping(I);
    if (I.step === 3) mountReview(I);
  }
  function startFiles(files) {
    if (!files.length) return;
    S.imp.queue = files.slice(1);
    handle(Importer.readFile(files[0]), files[0].name);
  }
  function nextInQueue() {
    var q = S.imp && S.imp.queue;
    if (q && q.length) { var f = q.shift(); handle(Importer.readFile(f), f.name); return true; }
    return false;
  }
  function compteFromNo(no) {
    if (!no) return '';
    var n = String(no).replace(/\s/g, '').toUpperCase(), hit = S.data.comptes.filter(function (c) {
      var k = String(c.no || '').replace(/\s/g, '').toUpperCase();
      if (!k) return false;
      if (k === n) return true;
      var a = k.length > n.length ? k : n, b = k.length > n.length ? n : k; // « 0404100050534800 » contient « 00050534800 »
      return b.length >= 8 && a.slice(-b.length) === b;
    })[0];
    return hit ? hit.nom : A.LS.get('no_' + n, '');
  }
  function handle(p, name) {
    var I = S.imp;
    p.then(function (res) {
      I.source = name; I.balance = res.balance || null; I.couverture = res.couverture || ''; I.controle = res.controle || null; I.compteNo = res.compteNo || ''; I.format = res.format || '';
      var auto = compteFromNo(res.compteNo);
      if (auto) I.compte = auto;
      else if (res.compteNo) I.compte = ''; // n° inconnu : l'utilisateur doit choisir
      if (!I.compte) { I.pending = res; I.step = 1; U().render(true); U().toast('Pour « ' + name + ' », choisissez le compte correspondant.', 4500); return; }
      if (res.kind === 'rows') { I.rows = res.rows.map(function (r) { r.err = ''; return r; }); I.format = res.format; prepareReview(I); I.step = 3; U().render(true); return; }
      var g = Importer.guess(res.table);
      if (g.error) { U().toast('⚠️ ' + g.error, 5000); return; }
      var saved = A.LS.get('map_' + I.compte, null);
      if (saved && saved.ncol === g.map.ncol) { saved.header = g.map.header; saved.dataStart = g.map.dataStart; g.map = saved; }
      I.guess = g; I.map = g.map; I.step = 2; U().render(true);
    }).catch(function (e) { U().toast('⚠️ Lecture impossible : ' + e.message, 5000); });
  }
  function colName(map, c) { return (map.header && map.header[c]) ? map.header[c] + ' (col. ' + (c + 1) + ')' : 'Colonne ' + (c + 1); }
  function mappingHtml(I) {
    var map = I.map, g = I.guess, cols = [];
    for (var c = 0; c < map.ncol; c++) cols.push(c);
    function sel(id, val, empty) { return '<select class="input" id="' + id + '">' + (empty ? '<option value="">—</option>' : '') + cols.map(function (c) { return '<option value="' + c + '" ' + (val === c ? 'selected' : '') + '>' + esc(colName(map, c)) + '</option>'; }).join('') + '</select>'; }
    var prev = Importer.apply(g.data.slice(0, 6), map);
    return '<section class="card"><h2>Colonnes du relevé</h2><p class="small ink2">' + esc(I.source) + ' · ' + g.data.length + ' lignes · compte <b>' + esc(I.compte) + '</b>. Détection automatique : vérifiez l\'aperçu.</p>' +
      '<div class="field"><label>Date</label>' + sel('mdate', map.date) + '</div>' +
      '<div class="field"><label>Libellé (une ou plusieurs colonnes)</label><div>' + cols.filter(function (c) { return c !== map.date; }).map(function (c) { return '<label class="check" style="padding:3px 0"><input type="checkbox" data-lib="' + c + '" ' + (map.lib.indexOf(c) !== -1 ? 'checked' : '') + '> <span class="small">' + esc(colName(map, c)) + ' — <span class="muted">' + esc(String(g.data[0][c] == null ? '' : g.data[0][c]).slice(0, 40)) + '</span></span></label>'; }).join('') + '</div></div>' +
      '<div class="seg mt12" id="mmode"><button data-m="1" class="' + (map.montant != null ? 'on' : '') + '">Une colonne Montant</button><button data-m="2" class="' + (map.montant == null ? 'on' : '') + '">Débit / Crédit</button></div>' +
      '<div id="m1" class="' + (map.montant != null ? '' : 'hidden') + '"><div class="field"><label>Montant</label>' + sel('mmt', map.montant) + '</div></div>' +
      '<div id="m2" class="grid2 ' + (map.montant == null ? '' : 'hidden') + '"><div class="field"><label>Débit</label>' + sel('mdeb', map.debit, true) + '</div><div class="field"><label>Crédit</label>' + sel('mcre', map.credit, true) + '</div></div>' +
      '<label class="check"><input type="checkbox" id="minv" ' + (map.invert ? 'checked' : '') + '> Inverser le signe (si les dépenses apparaissent en positif)</label>' +
      '<h3 class="mt12">Aperçu</h3><div class="scrollx"><table class="tbl"><thead><tr><th>Date</th><th>Libellé</th><th class="r">Montant</th></tr></thead><tbody>' +
      prev.map(function (r) { return '<tr><td>' + (r.date ? A.dateLabel(r.date, true) : '<span class="bad">?</span>') + '</td><td class="small">' + esc(r.lib) + '</td><td class="r ' + (r.mt > 0 ? 'good' : '') + '">' + (isNaN(r.mt) ? '<span class="bad">?</span>' : A.sgn(r.mt)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="acts"><button class="btn ghost" id="back">Retour</button><button class="btn" id="next">Continuer</button></div></section>';
  }
  function mountMapping(I) {
    var map = I.map;
    function upd() {
      map.date = +$('#mdate').value;
      map.lib = $$('[data-lib]').filter(function (x) { return x.checked; }).map(function (x) { return +x.dataset.lib; });
      var mode = $('#mmode .on').dataset.m;
      if (mode === '1') { map.montant = +$('#mmt').value; map.debit = map.credit = null; }
      else { map.montant = null; map.debit = $('#mdeb').value === '' ? null : +$('#mdeb').value; map.credit = $('#mcre').value === '' ? null : +$('#mcre').value; }
      map.invert = $('#minv').checked;
      U().render();
    }
    ['#mdate', '#mmt', '#mdeb', '#mcre', '#minv'].forEach(function (s) { var e = $(s); if (e) e.onchange = upd; });
    $$('[data-lib]').forEach(function (x) { x.onchange = upd; });
    $$('#mmode button').forEach(function (b) { b.onclick = function () { $$('#mmode button').forEach(function (x) { x.classList.toggle('on', x === b); }); upd(); }; });
    $('#back').onclick = function () { I.step = 1; U().render(true); };
    $('#next').onclick = function () {
      if (!map.lib.length) { U().toast('Choisissez au moins une colonne de libellé.'); return; }
      A.LS.set('map_' + I.compte, map);
      I.rows = Importer.apply(I.guess.data, map); I.format = 'tableau'; prepareReview(I); I.step = 3; U().render(true);
    };
  }
  /** Statut de chaque ligne : nouvelle, doublon exact, doublon probable, erreur. */
  function prepareReview(I) {
    var cnt = {}, near = [];
    S.ops.forEach(function (o) {
      if (o.compte !== I.compte) return;
      var k = BM.dedupKey(o.compte, o.date, o.mt, o.lib); cnt[k] = (cnt[k] || 0) + 1;
      near.push(o);
    });
    var seen = {}, claimed = {};
    I.rows.forEach(function (r) {
      r.st = 'new'; r.on = true; r.cat = null;
      if (r.err) { r.st = 'err'; r.on = false; return; }
      var k = BM.dedupKey(I.compte, r.date, r.mt, r.lib); seen[k] = (seen[k] || 0) + 1;
      if (seen[k] <= (cnt[k] || 0)) { r.st = 'dup'; r.on = false; return; }
      for (var i = 0; i < near.length; i++) {
        var o = near[i];
        if (claimed[o.id] || Math.abs(o.mt - r.mt) > 0.005) continue;
        var dd = Math.abs(BM.diffDays(o.date, r.date));
        if (dd > 4 && !(dd <= 10 && BM.norm(o.lib).replace(/[^A-Z0-9]/g, '') === BM.norm(r.lib).replace(/[^A-Z0-9]/g, ''))) continue;
        claimed[o.id] = true; r.st = 'near'; r.on = false; r.twin = o; break;
      }
      r.auto = BM.categorize(r.lib, r.mt, I.compte, S.rules).cat;
    });
  }
  function reviewHtml(I) {
    var c = { new: 0, dup: 0, near: 0, err: 0 }, on = 0;
    I.rows.forEach(function (r) { c[r.st]++; if (r.on) on++; });
    var dates = I.rows.filter(function (r) { return r.date; }).map(function (r) { return r.date; }).sort();
    var todo = I.rows.filter(function (r) { return r.on && BM.isUnclassified(r.cat || r.auto); }).length;
    var lbl = { new: '<span class="tag good">nouvelle</span>', dup: '<span class="tag">déjà présente</span>', near: '<span class="tag warn">doublon probable</span>', err: '<span class="tag bad">erreur</span>' };
    return '<section class="card"><h2>Vérification avant import</h2><p class="small ink2">' + esc(I.source) + ' → <b>' + esc(I.compte) + '</b>' + (dates.length ? ' · du ' + A.dateLabel(dates[0], true) + ' au ' + A.dateLabel(dates[dates.length - 1], true) : '') + '</p>' +
      '<div class="chips mt8"><span class="chip good">' + c.new + ' nouvelle(s)</span><span class="chip">' + c.dup + ' déjà présente(s)</span>' + (c.near ? '<span class="chip warn">' + c.near + ' doublon(s) probable(s)</span>' : '') + (c.err ? '<span class="chip bad">' + c.err + ' erreur(s)</span>' : '') + '</div>' +
      (c.near ? '<p class="small warn mt8">Doublon probable = même compte, même montant, date proche (±4 jours, ou ±10 jours si libellé identique). Décochés par défaut : cochez-les seulement si ce sont bien des opérations distinctes.</p>' : '') +
      '<div class="mt12" id="rv">' + I.rows.map(function (r, i) {
        if (r.st === 'dup' && !I.showDup) return '';
        var cat = r.cat || r.auto;
        return '<div class="op" style="cursor:default;grid-template-columns:28px 1fr auto"><input type="checkbox" data-rv="' + i + '" ' + (r.on ? 'checked' : '') + ' ' + (r.st === 'err' ? 'disabled' : '') + ' style="width:20px;height:20px">' +
          '<div class="grow"><div class="l1">' + esc(A.pretty(r.lib) || r.lib) + '</div><div class="l2">' + (r.date ? A.dateLabel(r.date, true) : '?') + ' · ' + lbl[r.st] + (r.err ? ' ' + esc(r.err) : '') +
          (r.twin ? ' <span class="muted">≈ ' + esc(A.pretty(r.twin.lib)) + ' du ' + A.dateLabel(r.twin.date) + '</span>' : '') + '</div>' +
          (r.st !== 'err' && r.st !== 'dup' ? '<select class="input" data-rc="' + i + '" style="padding:5px 8px;margin-top:4px;font-size:12.5px' + (BM.isUnclassified(cat) ? ';border-color:var(--warn)' : '') + '">' + U().catOptions(cat) + '</select>' : '') + '</div>' +
          '<div class="mt num ' + (r.mt > 0 ? 'in' : '') + '">' + (isNaN(r.mt) ? '?' : A.sgn(r.mt)) + '</div></div>';
      }).join('') + '</div>' +
      (c.dup ? '<button class="link" id="sd">' + (I.showDup ? 'Masquer' : 'Afficher') + ' les ' + c.dup + ' opération(s) déjà présente(s)</button>' : '') +
      (I.controle ? '<div class="small mt8 ' + (I.controle.ok ? 'good' : 'bad') + '">' + (I.controle.ok ? '✓ ' : '⚠️ ') + esc(I.controle.msg) + '</div>' : '') +
      (I.couverture ? '<div class="small muted mt8">Relevé couvrant le compte jusqu\'au ' + A.dateLabel(I.couverture, true) + ' (évite les fausses alertes « relevé à importer » quand il n\'y a pas eu de mouvement).</div>' : '') +
      (I.balance ? (function () {
        var c = S.comptesMap[I.compte], calc = c ? BM.balanceAt(c, I.balance.date, S.ops) : 0;
        var incoming = 0; I.rows.forEach(function (r) { if (r.on && r.date <= I.balance.date) incoming += r.mt; });
        var after = BM.r2(calc + (c && I.balance.date > c.dateRef ? incoming : 0)), gap = BM.r2(I.balance.solde - after);
        if (I.controle && !I.controle.ok && I.recal == null) I.recal = false;
        return '<div class="card mt12" style="box-shadow:none;background:var(--surface-2)"><label class="check"><input type="checkbox" id="recal" ' + (I.recal !== false ? 'checked' : '') + '><span><b>Solde bancaire : ' + eur(I.balance.solde) + ' au ' + A.dateLabel(I.balance.date, true) + '</b><br><span class="small ink2">Solde calculé après import : ' + eur(after) +
          (Math.abs(gap) < 0.005 ? ' ✓ identique' : ' (écart ' + A.sgn(gap) + ')') + '. Cocher pour en faire le solde de référence du compte.</span></span></label></div>';
      })() : '') +
      '<p class="small muted mt8">' + todo + ' opération(s) resteront « à classer » : vous pourrez les trier ensuite (tri express).</p>' +
      '<div class="acts"><button class="btn ghost" id="back">Recommencer</button>' + (I.queue && I.queue.length ? '<button class="btn ghost" id="skipf">Fichier suivant</button>' : '') + '<button class="btn" id="go">' + (on ? 'Importer ' + on + ' opération(s)' : (I.balance ? 'Valider le solde' : (I.queue && I.queue.length ? 'Rien à importer · suivant' : 'Rien à importer · terminer'))) + '</button></div></section>';
  }
  function mountReview(I) {
    $$('[data-rv]').forEach(function (x) { x.onchange = function () { I.rows[+x.dataset.rv].on = x.checked; U().render(); }; });
    $$('[data-rc]').forEach(function (x) { x.onchange = function () { I.rows[+x.dataset.rc].cat = x.value; }; });
    var sd = $('#sd'); if (sd) sd.onclick = function () { I.showDup = !I.showDup; U().render(); };
    $('#back').onclick = function () { S.imp = { step: 1, compte: I.compte }; U().render(true); };
    var sk = $('#skipf'); if (sk) sk.onclick = function () { S.imp = { step: 1, compte: '', queue: I.queue }; nextInQueue(); };
    var rc = $('#recal'); if (rc) rc.onchange = function () { I.recal = rc.checked; };
    $('#go').onclick = function (ev) {
      var rows = I.rows.filter(function (r) { return r.on; }).map(function (r) {
        var o = { date: r.date, lib: r.lib, mt: r.mt };
        if (r.cat && r.cat !== r.auto) { o.cat = r.cat; o.manuel = true; }
        if (r.st === 'near' || r.st === 'dup') o.force = true;
        return o;
      });
      if (!rows.length && !(I.balance && I.recal !== false) && !I.couverture) {
        if (!nextInQueue()) { S.imp = { step: 1, compte: I.compte }; U().render(true); U().toast('Aucune nouvelle opération : tout était déjà importé ✓'); }
        else S.imp.queue = S.imp.queue; // file suivant déjà lancé
        return;
      }
      var lot = 'Appli ' + new Date().toLocaleDateString('fr-FR') + ' ' + I.source;
      var chunks = []; for (var i = 0; i < rows.length; i += 400) chunks.push(rows.slice(i, i + 400));
      var added = [], skipped = 0, p = Promise.resolve();
      chunks.forEach(function (ch) { p = p.then(function () { return A.api('importOps', { compte: I.compte, rows: ch, lot: lot }).then(function (r) { added = added.concat(r.added); skipped += r.skipped; }); }); });
      if (I.balance && I.recal !== false) p = p.then(function () {
        return A.api('recaler', { compte: I.compte, solde: I.balance.solde, date: I.balance.date, origine: 'solde du relevé ' + I.source }).then(function () {
          Object.assign(S.comptesMap[I.compte], { soldeRef: I.balance.solde, dateRef: I.balance.date });
        });
      });
      if (I.couverture) p = p.then(function () {
        return A.api('couverture', { compte: I.compte, date: I.couverture }).then(function () { var c = S.comptesMap[I.compte]; if (c && (!c.couvert || c.couvert < I.couverture)) c.couvert = I.couverture; });
      });
      if (I.compteNo && I.compte) A.LS.set('no_' + String(I.compteNo).replace(/\s/g, '').toUpperCase(), I.compte);
      var queue = I.queue;
      U().run(ev.currentTarget, p).then(function () {
        A.addOps(added);
        if (queue && queue.length) { S.imp = { step: 1, compte: '', queue: queue }; U().toast(added.length + ' opération(s) importée(s) sur ' + I.compte + ' · fichier suivant…', 3500); nextInQueue(); return; }
        var todo = added.filter(function (o) { return BM.isUnclassified(o.cat); }).length;
        S.imp = { step: 1, compte: I.compte };
        U().render(true);
        U().openSheet('<div class="swipe"><div style="font-size:46px">✅</div><h2>' + added.length + ' opération(s) importée(s)</h2><p class="ink2">' + (skipped ? skipped + ' ligne(s) ignorée(s) par le serveur (doublons exacts). ' : '') + (todo ? todo + ' à classer.' : 'Toutes classées automatiquement.') + '</p></div>' +
          '<div class="acts"><button class="btn ghost" data-close>Fermer</button>' + (todo ? '<button class="btn" id="tx">⚡ Trier maintenant</button>' : '<button class="btn" id="hm">Voir l\'accueil</button>') + '</div>', function (sh, close) {
          var tx = $('#tx', sh); if (tx) tx.onclick = function () { close(); U().triExpress(); };
          var hm = $('#hm', sh); if (hm) hm.onclick = function () { close(); U().go('home'); };
        });
      });
    };
  }

  /* ---------------- Comptes ---------------- */
  function comptes() {
    var f = S.cptF || 'tous', tc = 0, te = 0;
    S.data.comptes.forEach(function (c) { if (c.actif) { if (c.nature === 'Épargne') te += S.balances[c.nom]; else tc += S.balances[c.nom]; } });
    var titre = f === 'Courant' ? 'Comptes courants' : f === 'Épargne' ? 'Comptes épargne' : 'Vos comptes';
    var out = '<section class="card"><div class="card-head"><h2>' + titre + '</h2><button class="btn sm" id="addc">＋ Compte</button></div>' +
      '<div class="chips">' + [['tous', 'Tous · ' + eur0(tc + te)], ['Courant', '💳 Courants · ' + eur0(tc)], ['Épargne', '🐷 Épargne · ' + eur0(te)]].map(function (x) {
        return '<button class="chip' + (f === x[0] ? ' on' : '') + '" data-cptf="' + x[0] + '"' + (f === x[0] ? ' style="font-weight:700;outline:2px solid var(--s1)"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
    out += S.data.comptes.filter(function (c) { return f === 'tous' || (f === 'Épargne') === (c.nature === 'Épargne'); }).map(function (c) {
      var b = S.balances[c.nom], l = S.fresh[c.nom];
      var h = A.lastMonths(12, BM.addMonths(BM.ym(S.today), 1)).reverse().map(function (m) { return BM.balanceAt(c, BM.dayOf(m, 31) > S.today ? S.today : BM.dayOf(m, 31), S.ops); });
      return '<div class="loan" data-cpt="' + esc(c.nom) + '" style="' + (c.actif ? '' : 'opacity:.5') + '"><div class="row between"><div class="grow"><div class="b">' + (c.nature === 'Épargne' ? '🐷 ' : '💳 ') + esc(c.nom) + '</div>' +
        '<div class="small muted">' + esc(c.titulaire) + (c.origine && /v3|recaler/i.test(c.origine) ? ' · <span class="warn">solde à confirmer</span>' : '') + ' · relevé au ' + (l ? A.dateLabel(l, true) : '–') + ' · réf. ' + eur(c.soldeRef) + ' au ' + (c.dateRef ? A.dateLabel(c.dateRef, true) : '–') + '</div></div>' +
        '<div style="text-align:right"><div class="b num ' + (b < 0 ? 'bad' : '') + '">' + eur(b) + '</div>' + Charts.spark(h, b < 0 ? 'var(--bad)' : 'var(--s1)', 90, 24) + '</div></div></div>';
    }).join('');
    out += (f === 'Courant' ? '<div class="tiles mt12">' + U().tile('Total comptes courants', eur0(tc), 'estimé aujourd\'hui') + '</div>'
      : f === 'Épargne' ? '<div class="tiles mt12">' + U().tile('Total épargne', eur0(te), 'livrets suivis') + '</div>'
      : '<div class="tiles t3 mt12">' + U().tile('Comptes courants', eur0(tc), 'estimé aujourd\'hui') + U().tile('Épargne', eur0(te), 'livrets suivis') + U().tile('Courants + épargne', eur0(tc + te), 'total général', tc + te < 0 ? 'bad' : '') + '</div>') +
      '<p class="small ink2 mt12">Le solde est calculé à partir d\'un <b>solde de référence</b> (montant et date) et des opérations importées. S\'il diffère de votre banque, touchez le compte puis « Recaler » en saisissant le solde affiché par la banque.</p></section>';
    return out;
  }
  function mountComptes() {
    $$('[data-cptf]').forEach(function (b) { b.onclick = function () { S.cptF = b.dataset.cptf; U().render(true); }; });
    $$('[data-cpt]').forEach(function (b) { b.onclick = function () { compteSheet(b.dataset.cpt); }; });
    $('#addc').onclick = function () { compteSheet(null); };
  }
  function compteSheet(nom) {
    var c = S.comptesMap[nom], isNew = !c;
    c = c || { nom: '', banque: '', titulaire: 'Pierre', nature: 'Courant', soldeRef: 0, dateRef: S.today, actif: true };
    var l = S.fresh[c.nom] || S.today;
    U().openSheet('<h2>' + (isNew ? 'Nouveau compte' : esc(c.nom)) + '</h2>' +
      (isNew ? '' : '<div class="card mt12" style="box-shadow:none;background:var(--surface-2)"><h3>⚖️ Recaler le solde</h3><p class="small ink2">Saisissez le solde indiqué par la banque à une date où toutes les opérations sont importées (par défaut : date du dernier relevé importé, ' + A.dateLabel(l, true) + ').</p>' +
        '<div class="grid2"><div class="field"><label>Solde banque (€)</label><input class="input" id="rs" inputmode="decimal" placeholder="' + esc(String(BM.balanceAt(c, l, S.ops)).replace('.', ',')) + '"></div><div class="field"><label>Au (fin de journée)</label><input class="input" type="date" id="rd" value="' + l + '"></div></div>' +
        '<div class="row mt8"><span class="small muted grow" id="rinfo">Solde calculé à cette date : ' + eur(BM.balanceAt(c, l, S.ops)) + '</span><button class="btn sm" id="rok">Recaler</button></div></div>') +
      '<div class="field"><label>Nom du compte (unique)</label><input class="input" id="nm" value="' + esc(c.nom) + '"></div>' +
      '<div class="grid2"><div class="field"><label>Banque</label><input class="input" id="bq" value="' + esc(c.banque) + '"></div><div class="field"><label>Titulaire</label><input class="input" id="ti" value="' + esc(c.titulaire) + '" list="tits"><datalist id="tits"><option>Pierre</option><option>Emmanuella</option><option>Joint</option></datalist></div></div>' +
      '<div class="field"><label>N° de compte (tel qu\'il figure dans les relevés, pour la reconnaissance automatique)</label><input class="input" id="no" value="' + esc(c.no || '') + '"></div>' +
      '<div class="grid2"><div class="field"><label>Nature</label><select class="input" id="na"><option ' + (c.nature === 'Courant' ? 'selected' : '') + '>Courant</option><option ' + (c.nature === 'Épargne' ? 'selected' : '') + '>Épargne</option></select></div><label class="check" style="margin-top:28px"><input type="checkbox" id="ac" ' + (c.actif ? 'checked' : '') + '> Actif</label></div>' +
      (isNew ? '<div class="grid2"><div class="field"><label>Solde de référence (€)</label><input class="input" id="sr" inputmode="decimal" value="0"></div><div class="field"><label>à la date du</label><input class="input" type="date" id="dr" value="' + S.today + '"></div></div>' : '') +
      '<div class="acts"><button class="btn ghost" data-close>Fermer</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      var rok = $('#rok', sh);
      if (rok) {
        $('#rd', sh).onchange = function () { $('#rinfo', sh).textContent = 'Solde calculé à cette date : ' + eur(BM.balanceAt(c, $('#rd', sh).value, S.ops)); };
        rok.onclick = function (ev) {
          var v = BM.toNum($('#rs', sh).value), d = $('#rd', sh).value;
          if (isNaN(v) || !d) { U().toast('Solde et date obligatoires.'); return; }
          U().run(ev.currentTarget, A.api('recaler', { compte: c.nom, solde: v, date: d })).then(function (r) {
            Object.assign(S.comptesMap[c.nom], { soldeRef: BM.r2(v), dateRef: d });
            A.recompute(); A.saveCache(); U().toast('Compte recalé (écart corrigé : ' + A.sgn(r.ecart) + ')', 4000); close(); U().render();
          });
        };
      }
      $('#sv', sh).onclick = function (ev) {
        var row = { nom: $('#nm', sh).value.trim(), banque: $('#bq', sh).value.trim(), titulaire: $('#ti', sh).value.trim(), nature: $('#na', sh).value, soldeRef: isNew ? BM.toNum($('#sr', sh).value) || 0 : c.soldeRef, dateRef: isNew ? $('#dr', sh).value : c.dateRef, actif: $('#ac', sh).checked, no: $('#no', sh).value.trim(), origine: isNew ? 'Saisi à la création' : (c.origine || '') };
        if (!row.nom) { U().toast('Nom obligatoire.'); return; }
        if ((isNew || row.nom !== c.nom) && S.comptesMap[row.nom]) { U().toast('Ce nom de compte existe déjà.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'COMPTES', row: row, oldKey: isNew ? null : c.nom }), 'Compte enregistré').then(function () { App.sync(true); close(); });
      };
    });
  }

  /* ---------------- Réglages ---------------- */
  function reglages() {
    var P = S.data.params;
    if (S.data.restreint) return '<section class="card"><h2>Accès restreint</h2><p class="small ink2">Vous voyez uniquement les comptes dont le titulaire est « ' + esc(S.data.restreint) + ' ». Le paramétrage (catégories, règles, prêts, échéancier) est réservé aux accès complets.</p>' +
      '<div class="seg mt12" id="theme">' + [['auto', 'Thème auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (t) { return '<button data-t="' + t[0] + '" class="' + ((A.LS.get('theme', 'auto')) === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn danger block mt12" id="logout">Se déconnecter (' + esc(S.user) + ')</button></section>';
    var out = '<section class="card"><h2>Paramètres</h2>' +
      '<div class="grid2"><div class="field"><label>Nom du foyer</label><input class="input" id="p-foyer" value="' + esc(P.foyer) + '"></div><div class="field"><label>Jour de bascule au mois suivant</label><input class="input" id="p-jourBascule" inputmode="numeric" value="' + P.jourBascule + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>Seuil d\'alerte reste à vivre (€)</label><input class="input" id="p-seuilRAV" inputmode="decimal" value="' + P.seuilRAV + '"></div><div class="field"><label>Seuil taux d\'effort (%)</label><input class="input" id="p-seuilEffort" inputmode="decimal" value="' + P.seuilEffort + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>Coussin par compte (€)</label><input class="input" id="p-coussin" inputmode="decimal" value="' + P.coussin + '"></div><div class="field"><label>Horizon de projection (jours)</label><input class="input" id="p-horizon" inputmode="numeric" value="' + P.horizon + '"></div></div>' +
      '<div class="grid2"><div class="field"><label>Plafond vie courante (€ / mois)</label><input class="input" id="p-plafondVie" inputmode="decimal" value="' + (P.plafondVie || '') + '"></div><div class="field"><label>Épargne de précaution visée (mois)</label><input class="input" id="p-precautionMois" inputmode="decimal" value="' + (P.precautionMois || 3) + '"></div></div>' +
      '<p class="tiny muted">Départ du plan : ' + (P.planDate ? A.dateLabel(P.planDate, true) : 'non défini') + ' · dette ' + eur0(P.planDette || 0) + ' · épargne ' + eur0(P.planEpargne || 0) + ' (modifiable dans l\'onglet PARAMETRES du classeur).</p>' +
      '<button class="btn mt12" id="psave">Enregistrer les paramètres</button></section>';
    out += '<section class="card"><div class="card-head"><h2>Catégories et enveloppes</h2><button class="btn sm" id="addk">＋ Catégorie</button></div><input class="input" id="kq" placeholder="Filtrer…"><div id="klist" class="mt8">' +
      S.data.categories.map(function (c) { return '<div class="op" data-k="' + esc(c.nom) + '"><div class="av">' + (c.icone || '📦') + '</div><div class="grow"><div class="l1">' + esc(c.nom) + '</div><div class="l2">' + esc(A.groupLabel(c.groupe)) + ' · ' + esc(c.type) + ' · ' + esc(c.nature) + (c.rattache ? ' · bascule' : '') + '</div></div><div class="mt num">' + (c.enveloppe ? eur0(c.enveloppe) : '–') + '</div></div>'; }).join('') + '</div></section>';
    out += '<section class="card"><div class="card-head"><h2>Règles de classement (' + S.data.regles.length + ')</h2></div><p class="small ink2">La dernière règle qui correspond l\'emporte. Pour en créer une, le plus simple est de partir d\'une opération (fiche opération ou tri express).</p>' +
      '<input class="input" id="rq" placeholder="Rechercher un mot-clé ou une catégorie…"><div id="rlist" class="mt8"></div></section>';
    out += '<section class="card"><h2>Actions</h2><div style="display:grid;gap:10px" class="mt12">' +
      '<button class="btn ghost" id="ra1">🔁 Réappliquer les règles aux opérations « à classer »</button>' +
      '<button class="btn ghost" id="ra2">♻️ Réappliquer toutes les règles (hors choix manuels)</button>' +
      '<button class="btn ghost" id="rtab">📊 Actualiser l\'onglet TABLEAU du classeur</button>' +
      '<div class="seg" id="theme">' + [['auto', 'Thème auto'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (t) { return '<button data-t="' + t[0] + '" class="' + ((A.LS.get('theme', 'auto')) === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn danger" id="logout">Se déconnecter (' + esc(S.user) + ')</button></div>' +
      '<p class="tiny muted mt12">Budget Maison v' + BM.VERSION + ' · serveur v' + esc(S.data.version || '?') + ' · ' + S.ops.length + ' opérations · données dans votre Google Sheets.</p></section>';
    return out;
  }
  function rulesList(q) {
    q = BM.norm(q || '');
    var list = S.data.regles.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return !q || BM.norm(x.r.mot + ' ' + x.r.cat).indexOf(q) !== -1; }).reverse().slice(0, 60);
    return list.map(function (x) { return '<div class="op" style="cursor:default"><div class="av">' + U().catIcon(x.r.cat) + '</div><div class="grow"><div class="l1"><span class="kbd">' + esc(x.r.mot) + '</span></div><div class="l2">→ ' + esc(x.r.cat) + (x.r.compte ? ' · ' + esc(x.r.compte) : '') + '</div></div><button class="iconbtn" data-rdel="' + x.i + '" aria-label="Supprimer">🗑</button></div>'; }).join('') || '<p class="empty">Aucune règle.</p>';
  }
  function mountReglages() {
    if (S.data.restreint) { $$('#theme button').forEach(function (b) { b.onclick = function () { A.LS.set('theme', b.dataset.t); App.applyTheme(); U().render(); }; }); $('#logout').onclick = function () { App.logout(); }; return; }
    $('#psave').onclick = function (ev) {
      var p = {}; ['foyer', 'jourBascule', 'seuilRAV', 'seuilEffort', 'coussin', 'horizon', 'plafondVie', 'precautionMois'].forEach(function (k) { var v = $('#p-' + k).value; p[k] = k === 'foyer' ? v : BM.toNum(v); });
      if (!(p.jourBascule >= 1 && p.jourBascule <= 31)) { U().toast('Jour de bascule entre 1 et 31.'); return; }
      U().run(ev.currentTarget, A.api('saveParams', { params: p }), 'Paramètres enregistrés').then(function () { Object.assign(S.data.params, p); A.load(S.data); A.saveCache(); U().render(); });
    };
    $('#kq').oninput = function (e) { var q = BM.norm(e.target.value); $$('[data-k]').forEach(function (r) { r.style.display = !q || BM.norm(r.textContent).indexOf(q) !== -1 ? '' : 'none'; }); };
    $$('[data-k]').forEach(function (r) { r.onclick = function () { catEdit(r.dataset.k); }; });
    $('#addk').onclick = function () { catEdit(null); };
    function drawRules() { $('#rlist').innerHTML = rulesList($('#rq').value); $$('[data-rdel]').forEach(function (b) { b.onclick = function () { delRule(+b.dataset.rdel, drawRules); }; }); }
    $('#rq').oninput = drawRules; drawRules();
    $('#ra1').onclick = function (ev) { U().run(ev.currentTarget, A.api('reapply', { onlyUnclassified: true })).then(function (r) { A.applyCats(r.changed); U().toast(r.changed.length + ' opération(s) reclassée(s)'); }); };
    $('#ra2').onclick = function (ev) {
      var btn = ev.currentTarget;
      U().confirmSheet('Réappliquer toutes les règles ?', 'Les catégories choisies à la main sont conservées ; les autres sont recalculées avec les règles actuelles.', 'Réappliquer').then(function (ok) {
        if (ok) U().run(btn, A.api('reapply', {})).then(function (r) { A.applyCats(r.changed); U().toast(r.changed.length + ' opération(s) reclassée(s)'); U().render(); });
      });
    };
    $('#rtab').onclick = function (ev) { U().run(ev.currentTarget, A.api('refreshTableau'), 'Onglet TABLEAU actualisé'); };
    $$('#theme button').forEach(function (b) { b.onclick = function () { A.LS.set('theme', b.dataset.t); App.applyTheme(); U().render(); }; });
    $('#logout').onclick = function () { App.logout(); };
  }
  function delRule(i, cb) {
    var r = S.data.regles[i];
    U().confirmSheet('Supprimer la règle ?', '« ' + r.mot + ' » → ' + r.cat + '. Les opérations déjà classées ne changent pas.', 'Supprimer', true).then(function (ok) {
      if (!ok) return;
      U().run(null, A.api('deleteRule', { mot: r.mot, cat: r.cat, compte: r.compte || '' }), 'Règle supprimée').then(function () {
        S.data.regles.splice(i, 1); S.rules = BM.prepareRules(S.data.regles); A.saveCache(); cb();
      });
    });
  }
  function catEdit(nom) {
    var c = S.catMap[nom], isNew = !c;
    c = c || { groupe: '08 Vie courante', nom: '', type: 'Dépense', nature: 'Variable', enveloppe: 0, rattache: false, icone: '' };
    var groups = {}; S.data.categories.forEach(function (k) { groups[k.groupe] = 1; });
    U().openSheet('<h2>' + (isNew ? 'Nouvelle catégorie' : esc(c.nom)) + '</h2>' +
      '<div class="grid2"><div class="field"><label>Nom</label><input class="input" id="nm" value="' + esc(c.nom) + '"></div><div class="field"><label>Icône</label><input class="input" id="ic" value="' + esc(c.icone) + '"></div></div>' +
      '<div class="field"><label>Groupe</label><input class="input" id="gr" value="' + esc(c.groupe) + '" list="grl"><datalist id="grl">' + Object.keys(groups).sort().map(function (g) { return '<option>' + esc(g) + '</option>'; }).join('') + '</datalist></div>' +
      '<div class="grid2"><div class="field"><label>Type</label><select class="input" id="ty">' + ['Recette', 'Dépense', 'Épargne', 'Transfert', 'Projet'].map(function (t) { return '<option ' + (t === c.type ? 'selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Nature</label><select class="input" id="na">' + ['Fixe', 'Variable', 'Exceptionnel'].map(function (t) { return '<option ' + (t === c.nature ? 'selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="grid2"><div class="field"><label>Enveloppe mensuelle (€)</label><input class="input" id="en" inputmode="decimal" value="' + (c.enveloppe || '') + '"></div><label class="check" style="margin-top:28px"><input type="checkbox" id="ra" ' + (c.rattache ? 'checked' : '') + '> Bascule au mois suivant</label></div>' +
      '<p class="tiny muted">Transfert = exclu de tous les calculs (virements entre vos comptes, compte courant d\'associé). Projet = hors budget courant (chantier). Exceptionnel = recette non récurrente, exclue du taux d\'effort et des moyennes.' + (isNew ? '' : ' Renommer une catégorie met à jour les opérations, règles et échéances.') + '</p>' +
      '<div class="acts">' + (isNew ? '' : '<button class="btn danger" id="del" style="flex:0 0 auto">🗑</button>') + '<button class="btn ghost" data-close>Annuler</button><button class="btn" id="sv">Enregistrer</button></div>', function (sh, close) {
      var del = $('#del', sh);
      if (del) del.onclick = function () {
        U().run(null, A.api('deleteRow', { table: 'CATEGORIES', key: c.nom }), 'Catégorie supprimée').then(function () { App.sync(true); close(); });
      };
      $('#sv', sh).onclick = function (ev) {
        var row = { groupe: $('#gr', sh).value.trim(), nom: $('#nm', sh).value.trim(), type: $('#ty', sh).value, nature: $('#na', sh).value, enveloppe: BM.toNum($('#en', sh).value || '0') || 0, rattache: $('#ra', sh).checked, icone: $('#ic', sh).value.trim() };
        if (!row.nom || !row.groupe) { U().toast('Nom et groupe obligatoires.'); return; }
        if ((isNew || row.nom !== c.nom) && S.catMap[row.nom]) { U().toast('Cette catégorie existe déjà.'); return; }
        U().run(ev.currentTarget, A.api('saveRow', { table: 'CATEGORIES', row: row, oldKey: isNew ? null : c.nom }), 'Catégorie enregistrée').then(function () { App.sync(true); close(); });
      };
    });
  }

  return { avenir: avenir, plus: plus, loanSheet: loanSheet, echSheet: echSheet };
})();
