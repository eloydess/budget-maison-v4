/* ===================== Budget Maison v4 — interface (1/2) ===================== */
var UI = window.UI = (function () {
  'use strict';
  var A = App, S = A.S, esc = A.esc, eur = A.eur, eur0 = A.eur0;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- Icônes ---------------- */
  var I = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    pie: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/></svg>',
    trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
  };

  /* ---------------- Utilitaires d'interface ---------------- */
  var toastT;
  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600);
  }
  function openSheet(html, mount) {
    var root = $('#sheet-root'), wrap = document.createElement('div');
    wrap.innerHTML = '<div class="scrim"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div>';
    root.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    function close() { Charts.hideTip(); wrap.remove(); if (!root.children.length) document.body.style.overflow = ''; }
    $('.scrim', wrap).addEventListener('click', close);
    var sheet = $('.sheet', wrap);
    $$('[data-close]', sheet).forEach(function (b) { b.addEventListener('click', close); });
    if (mount) mount(sheet, close);
    return close;
  }
  function confirmSheet(title, text, okLabel, danger) {
    return new Promise(function (res) {
      openSheet('<h2>' + esc(title) + '</h2><p class="ink2">' + esc(text) + '</p><div class="acts"><button class="btn ghost" data-close>Annuler</button><button class="btn ' + (danger ? 'danger' : '') + '" id="ok">' + esc(okLabel || 'Confirmer') + '</button></div>',
        function (sh, close) { $('#ok', sh).onclick = function () { close(); res(true); }; $('.scrim', sh.parentNode).addEventListener('click', function () { res(false); }); $('[data-close]', sh).addEventListener('click', function () { res(false); }); });
    });
  }
  function busy(btn, on) { if (!btn) return; btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = '…'; } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; }
  function run(btn, promise, okMsg) {
    busy(btn, true);
    return promise.then(function (r) { busy(btn, false); if (okMsg) toast(okMsg); return r; }, function (e) { busy(btn, false); toast('⚠️ ' + e.message, 4200); throw e; });
  }
  function statusTag(st) {
    return { bad: '<span class="tag bad">▲ dépassé</span>', warn: '<span class="tag warn">● limite</span>', good: '<span class="tag good">✓ ok</span>', none: '' }[st] || '';
  }
  function catOptions(sel, filterType) {
    var groups = {};
    S.data.categories.forEach(function (c) { if (!filterType || filterType.indexOf(c.type) !== -1) (groups[c.groupe] = groups[c.groupe] || []).push(c); });
    return Object.keys(groups).sort().map(function (g) {
      return '<optgroup label="' + esc(A.groupLabel(g)) + '">' + groups[g].map(function (c) { return '<option ' + (c.nom === sel ? 'selected' : '') + '>' + esc(c.nom) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
  }
  function compteOptions(sel, withEmpty) {
    return (withEmpty ? '<option value="">' + esc(withEmpty) + '</option>' : '') + S.data.comptes.map(function (c) { return '<option ' + (c.nom === sel ? 'selected' : '') + '>' + esc(c.nom) + '</option>'; }).join('');
  }
  function catIcon(cat) { var c = S.catMap[cat]; return (c && c.icone) || (A.S.catMap[cat] ? '📦' : '❔'); }

  /* ---------------- Navigation ---------------- */
  var NAV = [['home', 'Accueil', I.home], ['ops', 'Opérations', I.list], ['budget', 'Budget', I.pie], ['avenir', 'Avenir', I.trend], ['plus', 'Plus', I.more]];
  function go(view, opts) {
    S.view = view; S.opts = opts || {};
    if (opts && opts.tab) { if (view === 'avenir') S.avTab = opts.tab; if (view === 'plus') S.plusTab = opts.tab; }
    if (opts && opts.cat && view === 'ops') S.opsF = { m: S.month, cat: opts.cat };
    render(true);
    if (opts && opts.cat && view === 'budget') setTimeout(function () { catSheet(opts.cat); }, 50);
    if (opts && opts.pret) setTimeout(function () { UI2.loanSheet(opts.pret); }, 50);
    if (opts && opts.anchor) setTimeout(function () { var e = document.getElementById(opts.anchor); if (e) e.scrollIntoView({ behavior: 'smooth' }); }, 80);
  }
  function render(top) {
    Charts.hideTip();
    var y = window.scrollY, app = $('#app');
    var todo = S.ops.filter(function (o) { return A.S.catMap && o.cat.indexOf('À classer') === 0 && o.m >= BM.addMonths(BM.ym(S.today), -12); }).length;
    var view = { home: home, ops: ops, budget: budget, avenir: UI2.avenir, plus: UI2.plus }[S.view] || home;
    app.innerHTML = '<div class="shell">' + view.html() + '</div>' +
      '<nav class="nav" aria-label="Navigation">' + NAV.map(function (n) {
        return '<button data-nav="' + n[0] + '" class="' + (S.view === n[0] ? 'on' : '') + '" aria-label="' + n[1] + '">' + n[2] + '<span>' + n[1] + '</span>' +
          (n[0] === 'ops' && todo ? '<em class="badge">' + todo + '</em>' : '') + '</button>';
      }).join('') + '</nav>' +
      (S.view === 'home' || S.view === 'ops' ? '<button class="fab" id="fab" aria-label="Ajouter">＋</button>' : '');
    $$('[data-nav]').forEach(function (b) { b.onclick = function () { go(b.dataset.nav); }; });
    var fab = $('#fab'); if (fab) fab.onclick = fabMenu;
    $$('[data-month]').forEach(function (b) { b.onclick = function () { S.month = BM.addMonths(S.month, +b.dataset.month); render(); }; });
    $$('[data-refresh]').forEach(function (b) { b.onclick = function () { App.sync(true); }; });
    view.mount && view.mount();
    window.scrollTo(0, top ? 0 : y);
  }
  function monthSwitch() {
    var cur = BM.ym(S.today), first = S.months[0] || cur;
    return '<div class="monthsw"><button data-month="-1" ' + (S.month <= first ? 'disabled' : '') + ' aria-label="Mois précédent">‹</button><span>' + A.monthLabel(S.month) + '</span><button data-month="1" ' + (S.month >= cur ? 'disabled' : '') + ' aria-label="Mois suivant">›</button></div>';
  }
  function syncBadge() {
    var t = S.syncedAt ? new Date(S.syncedAt) : null;
    var when = t ? (Date.now() - t < 60000 ? "à l'instant" : 'à ' + t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) : 'jamais';
    return '<span class="sync ' + (S.online && !S.syncErr ? '' : 'off') + '"><i></i>' + (S.syncing ? 'synchronisation…' : (S.syncErr ? 'hors ligne · données du ' + (t ? t.toLocaleDateString('fr-FR') : '–') : 'synchronisé ' + when)) + '</span>';
  }
  function topbar(title, sub, extra) {
    return '<header class="topbar"><div class="row between"><div class="grow"><h1>' + title + '</h1><div class="sub">' + (sub || '') + '</div></div>' +
      '<button class="iconbtn" data-refresh aria-label="Actualiser">' + I.refresh + '</button></div>' + (extra ? '<div class="mt12">' + extra + '</div>' : '') + '</header>';
  }
  function fabMenu() {
    openSheet('<h2>Ajouter</h2><div class="mt12" style="display:grid;gap:10px">' +
      '<button class="btn block" id="f1">📥 Importer un relevé bancaire</button>' +
      '<button class="btn ghost block" id="f2">✍️ Saisir une dépense ou une recette</button>' +
      '<button class="btn ghost block" id="f3">⚡ Tri express des opérations à classer</button></div>', function (sh, close) {
      $('#f1', sh).onclick = function () { close(); go('plus', { tab: 'import' }); };
      $('#f2', sh).onclick = function () { close(); addOpSheet(); };
      $('#f3', sh).onclick = function () { close(); triExpress(); };
    });
  }

  /* =====================================================================
     ACCUEIL
     ===================================================================== */
  var home = {
    html: function () {
      var mv = A.monthView(S.month), P = S.data.params, h = new Date().getHours();
      var hello = (h < 18 ? 'Bonjour' : 'Bonsoir') + ' ' + esc(S.user || '');
      var out = topbar(hello, esc(P.foyer || '') + (S.data.restreint ? ' · accès : comptes ' + esc(S.data.restreint) : '') + ' · ' + syncBadge(), monthSwitch());
      out += '<main class="content cols">';
      // Héros
      var label = mv.isPast ? 'Solde du mois' : 'Reste à vivre';
      var big = mv.isPast ? mv.rec - mv.sorties : mv.rav;
      var parts = [['Recettes', mv.rec + mv.pendIn, '#8fd3ff'], ['Dépenses', mv.sorties, '#ffb38a'], ['À venir', mv.pendOut, '#ffd66b'], ['Reste', Math.max(0, big), '#9ff0c0']];
      var totIn = Math.max(1, mv.rec + mv.pendIn);
      out += '<section class="hero span ' + (mv.isPast ? (big < 0 ? 'bad' : '') : (mv.status === 'good' ? '' : mv.status)) + '"><div class="glow"></div>' +
        '<div class="label">' + label + ' · ' + A.monthLabel(S.month) + '</div><div class="big num">' + eur0(big) + '</div>' +
        (mv.isCur && mv.daysLeft ? '<div class="perday">soit <b>' + eur0(Math.max(0, mv.perDay)) + ' par jour</b> pendant ' + mv.daysLeft + ' jour' + (mv.daysLeft > 1 ? 's' : '') + '</div>' : '') +
        '<div class="flow">' + parts.slice(1).map(function (p) { return '<i style="width:' + Math.max(0, p[1] / totIn * 100) + '%;background:' + p[2] + '"></i>'; }).join('') + '</div>' +
        '<div class="legend">' + parts.map(function (p) { return '<div><span><i class="dot" style="background:' + p[2] + '"></i>' + p[0] + '</span><b class="num">' + eur0(p[1]) + '</b></div>'; }).join('') + '</div>' +
        (mv.isCur ? '<div class="note">Recettes = reçues ' + eur0(mv.rec) + ' + attendues ' + eur0(mv.pendIn) + '. À venir = prélèvements et échéances de prêt pas encore passés. ' +
          (mv.envRest > 0 ? 'Si vous consommez toutes vos enveloppes variables restantes (' + eur0(mv.envRest) + '), il resterait <b>' + eur0(mv.ravApresEnv) + '</b>.' : '') + '</div>' : '') +
        '</section>';
      // Alertes
      var sg = A.suggestions();
      var hot = sg.filter(function (s) { return s.sev === 'bad' || s.sev === 'warn'; }).slice(0, 6);
      if (hot.length) out += '<div class="chips span">' + hot.map(function (s, i) { return '<button class="chip ' + s.sev + '" data-sg="' + sg.indexOf(s) + '">' + s.icon + ' ' + esc(s.title) + '</button>'; }).join('') + '</div>';
      // Tuiles
      var cour = 0, epa = 0;
      S.data.comptes.forEach(function (c) { if (!c.actif) return; if (c.nature === 'Épargne') epa += S.balances[c.nom]; else cour += S.balances[c.nom]; });
      var dt = A.debt(), todo = S.ops.filter(function (o) { return o.cat.indexOf('À classer') === 0 && o.m >= BM.addMonths(BM.ym(S.today), -12); }).length;
      out += '<section class="card span"><div class="tiles t4">' +
        tile('Comptes courants', eur0(cour), 'solde estimé aujourd\'hui', '', 'go-comptes') +
        tile('Épargne', eur0(epa), 'livrets suivis', '', 'go-comptes') +
        tile("Taux d'effort", dt.effort == null ? '–' : A.pct(dt.effort), 'seuil ' + (P.seuilEffort || 35) + ' %', dt.effort * 100 > (P.seuilEffort || 35) ? 'bad' : 'good', 'go-prets') +
        tile('À classer', String(todo), todo ? 'opérations (12 mois)' : 'tout est classé 👌', todo ? 'warn' : 'good', 'go-tri') + '</div></section>';
      // Trésorerie
      var pr = A.projection();
      out += '<section class="card"><div class="card-head"><h2>Trésorerie prévue · ' + (pr.days.length - 1) + ' jours</h2><button class="link" data-go="avenir">Détail ›</button></div>' +
        '<div id="c-treso"></div><p class="small ink2" style="margin:6px 0 0">Point bas : <b class="' + (pr.total[pr.minI] < 0 ? 'bad' : '') + '">' + eur0(pr.total[pr.minI]) + '</b> le ' + A.dateLabel(pr.days[pr.minI], true) +
        ' (tous comptes courants). Hypothèses : échéancier + dépenses courantes moyennes.</p></section>';
      // Suggestions
      out += '<section class="card"><div class="card-head"><h2>💡 Ce que vous pourriez faire</h2>' + (sg.length > 4 ? '<button class="link" id="allsg">Tout voir (' + sg.length + ') ›</button>' : '') + '</div>' +
        (sg.length ? sg.slice(0, 4).map(suggHtml).join('') : '<p class="empty">Rien à signaler : tout est sous contrôle.</p>') + '</section>';
      // Enveloppes
      var envs = S.data.categories.filter(function (c) { return c.type === 'Dépense' && c.nature === 'Variable' && c.enveloppe > 0 && c.nom.indexOf('À classer') !== 0; })
        .map(function (c) { return A.envelope(c, S.month); }).sort(function (a, b) { return b.ratio - a.ratio; }).slice(0, 6);
      out += '<section class="card"><div class="card-head"><h2>Enveloppes variables</h2><button class="link" data-go="budget">Budget ›</button></div>' +
        (envs.length ? envs.map(function (e) { return envHtml(e, mv); }).join('') : '<p class="empty">Aucune enveloppe variable définie.</p>') + '</section>';
      // Prochains prélèvements
      var soon = pr.events.filter(function (e) { return e.date <= BM.addDays(S.today, 14); }).slice(0, 8);
      out += '<section class="card"><div class="card-head"><h2>Prochaines échéances · 14 jours</h2><button class="link" data-go2="avenir|echeances">Échéancier ›</button></div>' +
        (soon.length ? soon.map(evHtml).join('') : '<p class="empty">Aucune échéance dans les 14 prochains jours.</p>') + '</section>';
      // Répartition
      out += '<section class="card"><div class="card-head"><h2>Où part l\'argent · ' + A.monthLabel(S.month) + '</h2></div><div id="c-donut"></div></section>';
      out += '</main>';
      return out;
    },
    mount: function () {
      var pr = A.projection();
      Charts.line($('#c-treso'), { labels: pr.days, height: 170, fmt: eur0, xfmt: function (d) { return A.dateLabel(d); }, tipLabel: function (d) { return A.dayName(d) + ' ' + A.dateLabel(d, true); },
        series: [{ name: 'Comptes courants', color: 'var(--s1)', values: pr.total, area: true }], refs: [{ y: 0, label: '0 €', color: 'var(--bad)' }],
        markers: [{ i: pr.minI, label: 'point bas', color: pr.total[pr.minI] < 0 ? 'var(--bad)' : 'var(--s1)', below: true }], aria: 'Trésorerie prévue' });
      donutMonth($('#c-donut'), S.month);
      bindCommon();
      var all = $('#allsg'); if (all) all.onclick = allSuggestions;
      $$('[data-sg]').forEach(function (b) { b.onclick = function () { suggDetail(A.suggestions()[+b.dataset.sg]); }; });
      var tiles = { 'go-treso': ['avenir', { tab: 'treso' }], 'go-comptes': ['plus', { tab: 'comptes' }], 'go-prets': ['avenir', { tab: 'prets' }] };
      $$('[data-tile]').forEach(function (t) { t.onclick = function () { var k = t.dataset.tile; if (k === 'go-tri') triExpress(); else go(tiles[k][0], tiles[k][1]); }; });
    }
  };
  function tile(k, v, d, cls, key) {
    return '<div class="tile" ' + (key ? 'data-tile="' + key + '" style="cursor:pointer"' : '') + '><div class="k">' + k + '</div><div class="v num ' + (cls || '') + '">' + v + '</div><div class="d muted">' + d + '</div></div>';
  }
  function envHtml(e, mv) {
    var c = e.cat, w = e.env ? Math.min(100, e.spent / e.env * 100) : (e.spent ? 100 : 0);
    var marker = mv && mv.isCur && c.nature === 'Variable' && e.env ? '<b style="left:' + (mv.elapsed * 100) + '%" title="Avancement du mois"></b>' : '';
    var sub = c.type === 'Recette' ? (e.env ? (e.rest > 0 ? 'reste à recevoir ' + eur0(e.rest) : 'objectif atteint' + (e.rest < 0 ? ' (+' + eur0(-e.rest) + ')' : '')) : 'sans objectif')
      : (e.env ? (e.rest >= 0 ? 'reste ' + eur0(e.rest) : 'dépassé de ' + eur0(-e.rest)) : 'sans enveloppe');
    if (mv && mv.isCur && e.projected && c.nature === 'Variable' && e.env) sub += ' · tendance fin de mois ' + eur0(e.projected);
    return '<div class="env" data-cat="' + esc(c.nom) + '" style="cursor:pointer"><div class="top"><div class="name"><span>' + (c.icone || '') + '</span><span class="ellipsis">' + esc(c.nom) + '</span>' + statusTag(e.status) + '</div>' +
      '<div class="amt num"><b>' + eur0(e.spent) + '</b> <span class="muted">/ ' + eur0(e.env) + '</span></div></div>' +
      '<div class="bar"><i class="' + (e.status === 'none' ? '' : e.status) + '" style="width:' + w + '%"></i>' + marker + '</div><div class="sub"><span>' + sub + '</span><span>' + (e.env ? Math.round(e.spent / e.env * 100) + ' %' : '') + '</span></div></div>';
  }
  function evHtml(e) {
    var stale = S.lastDate[e.compte] && e.date <= S.today;
    return '<div class="op" style="cursor:default"><div class="av">' + (e.mt > 0 ? '💶' : (e.src === 'pret' ? '🏦' : catIcon(e.cat))) + '</div><div class="grow"><div class="l1">' + esc(e.lib) + '</div><div class="l2">' +
      (e.date <= S.today ? '<span class="todo">attendu, pas encore sur le relevé</span>' : A.dayName(e.date) + ' ' + A.dateLabel(e.date)) + ' · ' + esc(e.compte) + '</div></div><div class="mt num ' + (e.mt > 0 ? 'in' : '') + '">' + A.sgn(e.mt) + '</div></div>';
  }
  function suggHtml(s) {
    var i = A.suggestions().indexOf(s);
    return '<div class="sugg ' + s.sev + '"><div class="ic">' + s.icon + '</div><div><div class="t">' + esc(s.title) + '</div><div class="x">' + esc(s.text) + '</div>' +
      (s.gain ? '<span class="gain">≈ +' + eur0(s.gain) + ' / mois</span>' : '') +
      ((s.action || s.go) ? '<div class="acts">' + (s.action ? '<button class="btn sm" data-act="' + i + '">' + esc(s.action.label) + '</button>' : '') + (s.go ? '<button class="btn sm ghost" data-sgo="' + i + '">Voir</button>' : '') + '</div>' : '') + '</div></div>';
  }
  function doAction(s) {
    var a = s.action; if (!a) return;
    if (a.fn === 'tri') triExpress();
    else if (a.fn === 'import') go('plus', { tab: 'import' });
    else if (a.fn === 'setEnv') saveEnvelopes([{ nom: a.cat, enveloppe: a.val }]).then(function () { toast('Enveloppe « ' + a.cat + ' » : ' + eur0(a.val) + ' / mois'); render(); });
  }
  function bindSugg(root) {
    $$('[data-act]', root).forEach(function (b) { b.onclick = function () { var s = A.suggestions()[+b.dataset.act]; closeAll(); doAction(s); }; });
    $$('[data-sgo]', root).forEach(function (b) { b.onclick = function () { var s = A.suggestions()[+b.dataset.sgo]; closeAll(); go(s.go.view, s.go); }; });
  }
  function closeAll() { $('#sheet-root').innerHTML = ''; document.body.style.overflow = ''; }
  function allSuggestions() {
    var sg = A.suggestions();
    openSheet('<h2>💡 Suggestions (' + sg.length + ')</h2><p class="small muted">Classées par priorité. Recalculées à chaque synchronisation.</p>' + sg.map(suggHtml).join('') + '<div class="acts"><button class="btn ghost" data-close>Fermer</button></div>', function (sh) { bindSugg(sh); });
  }
  function suggDetail(s) {
    openSheet('<div class="sugg ' + s.sev + '" style="border:0">' + suggHtml(s).replace(/^<div class="sugg [a-z]+">/, '').replace(/<\/div>$/, '') + '</div><div class="acts"><button class="btn ghost" data-close>Fermer</button></div>', function (sh) { bindSugg(sh); });
  }
  function bindCommon() {
    bindSugg(document);
    $$('[data-go]').forEach(function (b) { b.onclick = function () { go(b.dataset.go); }; });
    $$('[data-go2]').forEach(function (b) { var p = b.dataset.go2.split('|'); b.onclick = function () { go(p[0], { tab: p[1] }); }; });
    $$('[data-cat]').forEach(function (b) { b.onclick = function () { catSheet(b.dataset.cat); }; });
  }
  function donutMonth(host, m) {
    var st = A.M(m), g = st.groups, keys = Object.keys(g).filter(function (k) { return g[k] > 0; });
    if (!keys.length) { host.innerHTML = '<p class="empty">Aucune dépense ce mois-ci.</p>'; return; }
    var main = {}, other = 0;
    keys.forEach(function (k) { if (A.groupColor(k) === 'var(--s0)') other += g[k]; else main[k] = g[k]; });
    var items = Object.keys(main).sort().map(function (k) { return { label: A.groupLabel(k), value: main[k], color: A.groupColor(k), g: k }; });
    if (other > 0) items.push({ label: 'Autres', value: other, color: 'var(--s0)' });
    var tot = items.reduce(function (a, b) { return a + b.value; }, 0);
    host.innerHTML = '<div class="donut-wrap"><div id="dn"></div><div class="lst">' + items.slice().sort(function (a, b) { return b.value - a.value; }).map(function (it) {
      return '<div><span><i class="dot" style="background:' + it.color + ';width:10px;height:10px;border-radius:3px;display:inline-block"></i><span class="ellipsis">' + esc(it.label) + '</span></span><b class="num">' + eur0(it.value) + '</b></div>';
    }).join('') + '</div></div>';
    Charts.donut($('#dn', host), { items: items, fmt: eur0, center: [eur0(tot), 'dépenses'], size: 150 });
  }

  /* =====================================================================
     OPÉRATIONS
     ===================================================================== */
  var ops = {
    html: function () {
      var F = S.opsF || (S.opsF = { m: S.month });
      var list = filtered(F), deb = 0, cre = 0;
      list.forEach(function (o) { if (o.type === 'Transfert') return; if (o.mt < 0) deb -= o.mt; else cre += o.mt; });
      var months = S.months.slice().reverse();
      var out = topbar('Opérations', list.length + ' opération' + (list.length > 1 ? 's' : '') + ' · sorties ' + eur0(deb) + ' · entrées ' + eur0(cre) + ' (hors transferts)');
      out += '<main class="content"><div class="search">' + I.search + '<input id="q" type="search" placeholder="Rechercher un libellé, un montant…" value="' + esc(F.q || '') + '"></div>';
      out += '<div class="chips">' +
        '<select class="chip" id="fm"><option value="">Tous les mois</option>' + months.map(function (m) { return '<option value="' + m + '" ' + (F.m === m ? 'selected' : '') + '>' + A.monthLabel(m) + '</option>'; }).join('') + '</select>' +
        '<select class="chip" id="fc">' + compteOptions(F.compte, 'Tous les comptes') + '</select>' +
        '<select class="chip" id="fk"><option value="">Toutes catégories</option>' + catOptions(F.cat) + '</select>' +
        '<button class="chip ' + (F.todo ? 'on' : '') + '" id="ft">❔ À classer</button>' +
        (F.q || F.compte || F.cat || F.todo || F.m !== S.month ? '<button class="chip" id="fr">✕ Réinitialiser</button>' : '') + '</div>';
      out += '<section class="card" id="oplist">' + opsListHtml(list.slice(0, S.opsLimit || 250)) + (list.length > (S.opsLimit || 250) ? '<button class="btn ghost block mt12" id="more">Afficher plus (' + (list.length - (S.opsLimit || 250)) + ')</button>' : '') + '</section>';
      if (list.some(function (o) { return o.cat.indexOf('À classer') === 0; })) out += '<button class="btn block" id="tri">⚡ Tri express des opérations à classer</button>';
      out += '</main>';
      return out;
    },
    mount: function () {
      var F = S.opsF, t;
      $('#q').oninput = function (e) { clearTimeout(t); t = setTimeout(function () { F.q = e.target.value; S.opsLimit = 250; refreshList(); }, 200); };
      $('#fm').onchange = function (e) { F.m = e.target.value; render(); };
      $('#fc').onchange = function (e) { F.compte = e.target.value; render(); };
      $('#fk').onchange = function (e) { F.cat = e.target.value; render(); };
      $('#ft').onclick = function () { F.todo = !F.todo; if (F.todo) F.m = ''; render(); };
      var fr = $('#fr'); if (fr) fr.onclick = function () { S.opsF = { m: S.month }; render(); };
      var mo = $('#more'); if (mo) mo.onclick = function () { S.opsLimit = (S.opsLimit || 250) + 500; render(); };
      var tr = $('#tri'); if (tr) tr.onclick = function () { triExpress(); };
      bindOps($('#oplist'));
    }
  };
  function refreshList() {
    var list = filtered(S.opsF);
    $('#oplist').innerHTML = opsListHtml(list.slice(0, S.opsLimit || 250));
    bindOps($('#oplist'));
  }
  function filtered(F) {
    var q = BM.norm(F.q || '').trim(), qn = F.q ? BM.toNum(F.q) : NaN;
    return S.ops.filter(function (o) {
      if (F.m && o.m !== F.m) return false;
      if (F.compte && o.compte !== F.compte) return false;
      if (F.cat && o.cat !== F.cat) return false;
      if (F.todo && o.cat.indexOf('À classer') !== 0) return false;
      if (q) {
        var hay = BM.norm(o.lib + ' ' + o.cat + ' ' + o.comm);
        if (hay.indexOf(q) === -1 && !(isFinite(qn) && Math.abs(Math.abs(o.mt) - Math.abs(qn)) < 0.005)) return false;
      }
      return true;
    });
  }
  function opsListHtml(list) {
    if (!list.length) return '<p class="empty">Aucune opération.</p>';
    var out = '', day = null;
    list.forEach(function (o) {
      if (o.date !== day) {
        if (day) out += '</div>';
        day = o.date;
        var tot = 0; list.forEach(function (x) { if (x.date === day && x.type !== 'Transfert') tot += x.mt; });
        out += '<div class="day-h"><span>' + A.dayName(day) + ' ' + A.dateLabel(day, true) + '</span><span class="num">' + A.sgn(BM.r2(tot)) + '</span></div><div>';
      }
      out += opRow(o);
    });
    return out + '</div>';
  }
  function opRow(o) {
    var todo = o.cat.indexOf('À classer') === 0;
    var cls = o.type === 'Transfert' ? 'tr' : (o.mt > 0 ? 'in' : '');
    return '<div class="op" data-op="' + esc(o.id) + '"><div class="av">' + (todo ? '❔' : (o.icone || catIcon(o.cat))) + '</div><div class="grow"><div class="l1">' + esc(A.pretty(o.lib)) + '</div>' +
      '<div class="l2">' + (todo ? '<span class="todo">À classer</span>' : esc(o.cat)) + ' · ' + esc(o.compte) + (o.comm ? ' · 💬' : '') + (o.moisForce ? ' · 📅 ' + A.monthLabel(o.moisForce, true) : '') + '</div></div>' +
      '<div class="mt num ' + cls + '">' + A.sgn(o.mt) + '</div></div>';
  }
  function bindOps(root) {
    $$('[data-op]', root).forEach(function (r) { r.onclick = function () { opSheet(r.dataset.op); }; });
  }
  function findOp(id) { for (var i = 0; i < S.ops.length; i++) if (S.ops[i].id === id) return S.ops[i]; return null; }

  /* ---------------- Fiche opération ---------------- */
  function catGrid(sel, sens, sugg) {
    var groups = {};
    S.data.categories.forEach(function (c) { (groups[c.groupe] = groups[c.groupe] || []).push(c); });
    var out = '<div class="catlist">';
    if (sugg && sugg.length) out += '<div class="gl">Suggestions</div>' + sugg.map(function (c) { return '<button data-c="' + esc(c) + '" class="' + (c === sel ? 'on' : '') + '">' + catIcon(c) + ' ' + esc(c) + '</button>'; }).join('');
    Object.keys(groups).sort().forEach(function (g) {
      out += '<div class="gl">' + esc(A.groupLabel(g)) + '</div>' + groups[g].map(function (c) { return '<button data-c="' + esc(c.nom) + '" class="' + (c.nom === sel ? 'on' : '') + '">' + (c.icone || '') + ' ' + esc(c.nom) + '</button>'; }).join('');
    });
    return out + '</div>';
  }
  function opSheet(id) {
    var o = findOp(id); if (!o) return;
    var kw = A.keywordFor(o.lib), sel = o.cat;
    var html = '<div class="row between"><div class="grow"><h2>' + esc(A.pretty(o.lib)) + '</h2><div class="small muted">' + A.dayName(o.date) + ' ' + A.dateLabel(o.date, true) + ' · ' + esc(o.compte) + '</div></div>' +
      '<div class="b num" style="font-size:22px;' + (o.mt > 0 ? 'color:var(--good-ink)' : '') + '">' + A.sgn(o.mt) + '</div></div>' +
      '<p class="tiny muted" style="word-break:break-word">Libellé bancaire : ' + esc(o.lib) + '</p>' +
      '<div class="field"><label>Catégorie ' + (o.manuel ? '<span class="pill">choisie à la main</span>' : '<span class="pill">règle automatique</span>') + '</label>' +
      '<input class="input" id="cs" placeholder="Filtrer les catégories…">' + '<div id="grid">' + catGrid(sel, o.mt, A.guessCats(o, 4)) + '</div></div>' +
      (S.data.restreint ? '<div class="hidden"><input type="checkbox" id="mkrule"><input id="kw"><input type="checkbox" id="all"></div><label id="alll"></label>' : '') + (S.data.restreint ? '' : '<label class="check"><input type="checkbox" id="mkrule"> <span>Créer une règle : les libellés contenant <input class="input" id="kw" value="' + esc(kw) + '" style="display:inline-block;width:auto;min-width:120px;padding:6px 8px;margin:4px 0"> iront dans cette catégorie</span></label>') +
      (S.data.restreint ? '' : '<label class="check" id="alll" style="display:none"><input type="checkbox" id="all"> <span class="small">Reclasser aussi les opérations passées déjà classées automatiquement</span></label>') +
      '<div class="grid2"><div class="field"><label>Mois budgétaire forcé</label><input class="input" type="month" id="mf" value="' + esc(o.moisForce) + '"></div>' +
      '<div class="field"><label>Mois retenu</label><div class="input" style="background:none">' + A.monthLabel(o.m) + '</div></div></div>' +
      '<div class="field"><label>Commentaire</label><textarea class="input" id="cm" rows="2">' + esc(o.comm) + '</textarea></div>' +
      '<div class="acts"><button class="btn danger" id="del" style="flex:0 0 auto">🗑</button><button class="btn ghost" data-close>Annuler</button><button class="btn" id="save">Enregistrer</button></div>';
    openSheet(html, function (sh, close) {
      function bindGrid() { $$('[data-c]', sh).forEach(function (b) { b.onclick = function () { sel = b.dataset.c; $$('[data-c]', sh).forEach(function (x) { x.classList.toggle('on', x.dataset.c === sel); }); }; }); }
      bindGrid();
      $('#cs', sh).oninput = function (e) { var q = BM.norm(e.target.value); $$('[data-c]', sh).forEach(function (b) { b.style.display = !q || BM.norm(b.dataset.c).indexOf(q) !== -1 ? '' : 'none'; }); };
      $('#mkrule', sh).onchange = function (e) { $('#alll', sh).style.display = e.target.checked ? '' : 'none'; };
      $('#del', sh).onclick = function () {
        confirmSheet('Supprimer cette opération ?', A.pretty(o.lib) + ' · ' + A.sgn(o.mt) + ' · ' + A.dateLabel(o.date, true) + '. Elle sera retirée du classeur (trace conservée dans le JOURNAL).', 'Supprimer', true).then(function (ok) {
          if (!ok) return;
          run(null, A.api('deleteOps', { ids: [o.id] }), 'Opération supprimée').then(function () {
            S.ops = S.ops.filter(function (x) { return x.id !== o.id; }); A.recompute(); A.saveCache(); close(); render();
          });
        });
      };
      $('#save', sh).onclick = function (ev) {
        var btn = ev.currentTarget, mf = $('#mf', sh).value, cm = $('#cm', sh).value, rule = $('#mkrule', sh).checked, k = $('#kw', sh).value.trim();
        var patch = {};
        if (mf !== o.moisForce) patch.moisForce = mf;
        if (cm !== o.comm) patch.comm = cm;
        if (sel !== o.cat && !rule) patch.cat = sel;
        var p = Promise.resolve();
        if (Object.keys(patch).length) p = p.then(function () { return A.api('updateOps', { ids: [o.id], patch: patch }); }).then(function () {
          if (patch.cat) { o.cat = patch.cat; o.manuel = true; }
          if (patch.moisForce != null) o.moisForce = patch.moisForce;
          if (patch.comm != null) o.comm = patch.comm;
          A.enrich(o);
        });
        if (rule) {
          if (!k) { toast('Saisissez un mot-clé pour la règle.'); return; }
          if (BM.norm(o.lib).indexOf(BM.norm(k)) === -1) { toast('Le mot-clé doit figurer dans le libellé bancaire.'); return; }
          p = p.then(function () { return A.api('addRule', { mot: k, cat: sel, apply: true, toutes: $('#all', sh).checked }); }).then(function (r) {
            S.data.regles.push({ mot: k, cat: sel, compte: '' }); S.rules = BM.prepareRules(S.data.regles);
            A.applyCats(r.changed);
            var msg = 'Règle créée · ' + r.changed.length + ' opération(s) reclassée(s)';
            if (o.cat !== sel) { // opération courante non concernée par le reclassement automatique (déjà classée)
              return A.api('updateOps', { ids: [o.id], patch: { cat: sel, origine: o.manuel ? 'Manuel' : 'Règle' } }).then(function () { o.cat = sel; A.enrich(o); A.recompute(); toast(msg); });
            }
            toast(msg);
          });
        }
        run(btn, p.then(function () { A.recompute(); A.saveCache(); }), rule ? null : 'Enregistré').then(function () { close(); render(); });
      };
    });
  }
  function addOpSheet() {
    var sel = 'Courses alimentaires';
    openSheet('<h2>Nouvelle opération</h2><p class="small muted">Pour une dépense en espèces ou une opération absente des relevés. Attention : si elle apparaît plus tard sur un relevé, elle ne sera pas reconnue comme doublon exact.</p>' +
      '<div class="seg mt12" id="sens"><button class="on" data-s="-1">Dépense</button><button data-s="1">Recette</button></div>' +
      '<div class="grid2"><div class="field"><label>Montant (€)</label><input class="input" id="mt" inputmode="decimal" placeholder="0,00"></div><div class="field"><label>Date</label><input class="input" type="date" id="dt" value="' + S.today + '"></div></div>' +
      '<div class="field"><label>Libellé</label><input class="input" id="lb" placeholder="ex. Marché du samedi"></div>' +
      '<div class="field"><label>Compte</label><select class="input" id="cp">' + compteOptions(A.LS.get('lastCompte', S.data.comptes[0] && S.data.comptes[0].nom)) + '</select></div>' +
      '<div class="field"><label>Catégorie</label><select class="input" id="ct">' + catOptions(sel) + '</select></div>' +
      '<div class="acts"><button class="btn ghost" data-close>Annuler</button><button class="btn" id="ok">Ajouter</button></div>', function (sh, close) {
      var sens = -1;
      $$('#sens button', sh).forEach(function (b) { b.onclick = function () { sens = +b.dataset.s; $$('#sens button', sh).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $('#ok', sh).onclick = function (ev) {
        var mt = BM.toNum($('#mt', sh).value), lib = $('#lb', sh).value.trim(), d = $('#dt', sh).value, cp = $('#cp', sh).value;
        if (!(mt > 0) && !(mt < 0)) { toast('Montant invalide.'); return; }
        if (!lib) { toast('Libellé obligatoire.'); return; }
        mt = Math.abs(mt) * sens; A.LS.set('lastCompte', cp);
        run(ev.currentTarget, A.api('addOp', { op: { date: d, compte: cp, lib: lib, mt: mt, cat: $('#ct', sh).value } }), 'Opération ajoutée').then(function (r) { A.addOps(r.added); close(); render(); });
      };
    });
  }

  /* ---------------- Tri express ---------------- */
  function triExpress() {
    var queue = S.ops.filter(function (o) { return o.cat.indexOf('À classer') === 0; });
    if (!queue.length) { toast('Aucune opération à classer 👌'); return; }
    var i = 0, done = 0;
    openSheet('<div id="tx"></div>', function (sh, close) {
      function draw() {
        queue = queue.filter(function (o) { return o.cat.indexOf('À classer') === 0; });
        if (i >= queue.length) { sh.querySelector('#tx').innerHTML = '<div class="swipe"><div style="font-size:48px">🎉</div><h2>Terminé</h2><p class="ink2">' + done + ' opération(s) classée(s).</p><button class="btn block" data-close>Fermer</button></div>'; $('[data-close]', sh).onclick = function () { close(); render(); }; return; }
        var o = queue[i], sugg = A.guessCats(o, 6), kw = A.keywordFor(o.lib);
        var similar = queue.filter(function (x) { return BM.norm(x.lib).indexOf(BM.norm(kw)) !== -1; }).length;
        sh.querySelector('#tx').innerHTML = '<div class="row between"><span class="small muted">' + (i + 1) + ' / ' + queue.length + '</span><button class="link" data-x>Fermer</button></div>' +
          '<div class="swipe"><div class="small muted">' + A.dayName(o.date) + ' ' + A.dateLabel(o.date, true) + ' · ' + esc(o.compte) + '</div><h2>' + esc(A.pretty(o.lib)) + '</h2>' +
          '<div class="amt num" style="color:' + (o.mt > 0 ? 'var(--good-ink)' : 'var(--ink)') + '">' + A.sgn(o.mt) + '</div><div class="raw">' + esc(o.lib) + '</div></div>' +
          '<label class="check' + (S.data.restreint ? ' hidden' : '') + '"><input type="checkbox" id="rl" ' + (similar > 1 && !S.data.restreint ? 'checked' : '') + '><span>Toujours classer « <input class="input" id="kw" value="' + esc(kw) + '" style="display:inline-block;width:auto;min-width:110px;padding:5px 8px"> » ainsi' + (similar > 1 ? ' (' + similar + ' opérations concernées)' : '') + '</span></label>' +
          '<div class="catlist">' + sugg.map(function (c) { return '<button data-c="' + esc(c) + '">' + catIcon(c) + ' ' + esc(c) + '</button>'; }).join('') + '</div>' +
          '<details class="mt12"><summary class="small b" style="cursor:pointer">Autre catégorie…</summary>' + catGrid(null) + '</details>' +
          '<div class="acts"><button class="btn ghost" id="skip">Passer</button></div>';
        $('[data-x]', sh).onclick = function () { close(); render(); };
        $('#skip', sh).onclick = function () { i++; draw(); };
        $$('[data-c]', sh).forEach(function (b) {
          b.onclick = function () {
            var cat = b.dataset.c, rule = $('#rl', sh).checked, k = $('#kw', sh).value.trim();
            if (rule && BM.norm(o.lib).indexOf(BM.norm(k)) === -1) { toast('Le mot-clé doit figurer dans le libellé.'); return; }
            b.disabled = true;
            var p = rule ? A.api('addRule', { mot: k, cat: cat, apply: true }).then(function (r) {
              S.data.regles.push({ mot: k, cat: cat, compte: '' }); S.rules = BM.prepareRules(S.data.regles);
              A.applyCats(r.changed); done += r.changed.length;
              toast('Règle « ' + k + ' » · ' + r.changed.length + ' opération(s) classée(s)');
            }) : A.api('updateOps', { ids: [o.id], patch: { cat: cat } }).then(function () { A.applyCats([{ id: o.id, cat: cat, manuel: true }]); done++; });
            p.then(draw, function (e) { b.disabled = false; toast('⚠️ ' + e.message, 4000); });
          };
        });
      }
      draw();
    });
  }

  /* =====================================================================
     BUDGET
     ===================================================================== */
  var budget = {
    html: function () {
      var m = S.month, st = A.M(m), mv = A.monthView(m), cats = S.data.categories;
      var envRec = 0, envDep = 0, envEpa = 0;
      cats.forEach(function (c) { if (c.type === 'Recette') envRec += c.enveloppe; else if (c.type === 'Dépense') envDep += c.enveloppe; else if (c.type === 'Épargne') envEpa += c.enveloppe; });
      var out = topbar('Budget', 'Prévu / réalisé · enveloppes mensuelles', monthSwitch());
      out += '<main class="content cols"><section class="card span"><div class="tiles t4">' +
        tile('Recettes', eur0(st.rec), 'prévu ' + eur0(envRec) + (st.recExc ? ' · dont exceptionnel ' + eur0(st.recExc) : ''), st.rec >= envRec ? 'good' : '') +
        tile('Dépenses', eur0(st.dep), 'prévu ' + eur0(envDep), st.dep > envDep ? 'bad' : '') +
        tile('Épargne', eur0(st.epa), 'prévu ' + eur0(envEpa), st.epa >= envEpa && envEpa ? 'good' : '') +
        tile('Solde du mois', eur0(st.rec - st.dep - st.epa), 'prévu ' + eur0(envRec - envDep - envEpa), st.rec - st.dep - st.epa < 0 ? 'bad' : 'good') + '</div>' +
        '<div class="row mt12" style="flex-wrap:wrap"><button class="btn sm" id="prop">✨ Proposer un budget</button><span class="small muted">Enveloppes calculées sur vos 6 derniers mois (médiane).</span></div>' +
        (st.proj ? '<p class="small ink2 mt8">🏗️ Chantier (type Projet, hors budget) ce mois : <b>' + eur0(st.proj) + '</b>.</p>' : '') +
        (st.todo ? '<p class="small warn mt8">❔ ' + st.todo + ' opération(s) à classer ce mois : les chiffres ci-dessous sont provisoires.</p>' : '') + '</section>';
      // Groupes
      var groups = {};
      cats.forEach(function (c) { if (c.type === 'Transfert' || c.type === 'Projet') return; (groups[c.groupe] = groups[c.groupe] || []).push(c); });
      Object.keys(groups).sort().forEach(function (g) {
        var list = groups[g].map(function (c) { return A.envelope(c, m); }).filter(function (e) { return e.env || e.spent; });
        if (!list.length) return;
        var sp = 0, en = 0; list.forEach(function (e) { sp += e.spent; en += e.env; });
        var isRec = list.every(function (e) { return e.cat.type === 'Recette'; });
        var bad = list.some(function (e) { return e.status === 'bad'; }), warn = list.some(function (e) { return e.status === 'warn'; });
        out += '<section class="card"><div class="card-head"><h2><span style="color:' + A.groupColor(g) + '">●</span> ' + esc(A.groupLabel(g)) + ' ' + (isRec ? '' : statusTag(bad ? 'bad' : warn ? 'warn' : 'good')) + '</h2>' +
          '<span class="num small"><b>' + eur0(sp) + '</b> <span class="muted">/ ' + eur0(en) + '</span></span></div>' +
          list.sort(function (a, b) { return b.spent - a.spent; }).map(function (e) { return envHtml(e, mv); }).join('') + '</section>';
      });
      out += '</main>';
      return out;
    },
    mount: function () { bindCommon(); $('#prop').onclick = proposeBudget; }
  };
  function saveEnvelopes(items) {
    return A.api('saveEnveloppes', { items: items }).then(function () {
      items.forEach(function (it) { var c = S.catMap[it.nom]; if (c) c.enveloppe = it.enveloppe; });
      A.recompute(); A.saveCache();
    });
  }
  function catSheet(name) {
    var c = S.catMap[name]; if (!c) return;
    var hist = A.lastMonths(12, BM.addMonths(S.month, 1)).reverse(), vals = hist.map(function (m) { return BM.r2(A.M(m).cats[name] || 0); });
    var past = A.lastMonths(6).map(function (m) { return A.M(m).cats[name] || 0; });
    var med = A.median(past), moy = A.avg(past);
    var list = S.ops.filter(function (o) { return o.cat === name && o.m === S.month; });
    openSheet('<h2>' + (c.icone || '') + ' ' + esc(name) + '</h2><div class="small muted">' + esc(A.groupLabel(c.groupe)) + ' · ' + esc(c.type) + ' · ' + esc(c.nature) + (c.rattache ? ' · rattachée au mois suivant dès le ' + S.data.params.jourBascule : '') + '</div>' +
      '<div id="cc" class="mt12"></div><div class="legend-row"><span><i style="background:var(--s1)"></i>Réalisé par mois</span><span>Enveloppe actuelle : <b>' + eur0(c.enveloppe) + '</b></span></div>' +
      '<div class="tiles t3 mt12">' + tile('Médiane 6 mois', eur0(med), 'mois complets') + tile('Moyenne 6 mois', eur0(moy), '') + tile(A.monthLabel(S.month), eur0(A.M(S.month).cats[name] || 0), list.length + ' opération(s)') + '</div>' +
      '<div class="field"><label>Enveloppe mensuelle (€)</label><div class="row"><input class="input" id="env" inputmode="decimal" value="' + (c.enveloppe || '') + '"><button class="btn sm ghost" id="med">Médiane</button><button class="btn sm" id="sv">Enregistrer</button></div></div>' +
      '<h3 class="mt16">Opérations de ' + A.monthLabel(S.month) + '</h3><div id="cl">' + (list.length ? list.map(opRow).join('') : '<p class="empty">Aucune.</p>') + '</div>' +
      '<div class="acts"><button class="btn ghost" data-close>Fermer</button></div>', function (sh, close) {
      Charts.bars($('#cc', sh), { labels: hist, height: 170, fmt: eur, xfmt: function (m) { return A.monthLabel(m, true).split(' ')[0]; }, tipLabel: function (m) { return A.monthLabel(m); },
        series: [{ name: name, color: 'var(--s1)', values: vals }], highlight: hist.indexOf(S.month), extraTip: function () { return '<br>Enveloppe : ' + eur0(c.enveloppe); } });
      $('#med', sh).onclick = function () { $('#env', sh).value = Math.ceil(med / 10) * 10; };
      $('#sv', sh).onclick = function (ev) {
        var v = BM.toNum($('#env', sh).value || '0'); if (isNaN(v) || v < 0) { toast('Montant invalide.'); return; }
        run(ev.currentTarget, saveEnvelopes([{ nom: name, enveloppe: BM.r2(v) }]), 'Enveloppe enregistrée').then(function () { close(); render(); });
      };
      $$('[data-op]', sh).forEach(function (r) { r.onclick = function () { close(); opSheet(r.dataset.op); }; });
    });
  }
  function proposeBudget() {
    var rows = S.data.categories.filter(function (c) { return (c.type === 'Dépense' || c.type === 'Épargne') && c.nom.indexOf('À classer') !== 0; }).map(function (c) {
      var past = A.lastMonths(6).map(function (m) { return A.M(m).cats[c.nom] || 0; });
      var med = A.median(past), prop = Math.ceil(Math.max(0, med) / 10) * 10;
      return { c: c, med: med, prop: c.type === 'Épargne' ? c.enveloppe : prop };
    }).filter(function (r) { return r.prop !== r.c.enveloppe && (r.prop > 0 || r.c.enveloppe > 0); });
    var totA = 0, totB = 0; rows.forEach(function (r) { totA += r.c.enveloppe; totB += r.prop; });
    openSheet('<h2>✨ Budget proposé</h2><p class="small ink2">Pour chaque catégorie de dépense : médiane des 6 derniers mois complets, arrondie à la dizaine supérieure. Cochez ce que vous acceptez. Les recettes et l\'épargne ne sont pas modifiées.</p>' +
      (rows.length ? '<div class="scrollx"><table class="tbl"><thead><tr><th></th><th>Catégorie</th><th class="r">Actuel</th><th class="r">Proposé</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr><td><input type="checkbox" data-i="' + i + '" checked></td><td>' + esc(r.c.nom) + '</td><td class="r">' + eur0(r.c.enveloppe) + '</td><td class="r b">' + eur0(r.prop) + '</td></tr>'; }).join('') +
        '</tbody><tfoot><tr><td></td><td class="b">Total des lignes</td><td class="r">' + eur0(totA) + '</td><td class="r b">' + eur0(totB) + '</td></tr></tfoot></table></div>' : '<p class="empty">Vos enveloppes correspondent déjà à vos habitudes.</p>') +
      '<div class="acts"><button class="btn ghost" data-close>Annuler</button>' + (rows.length ? '<button class="btn" id="ok">Appliquer la sélection</button>' : '') + '</div>', function (sh, close) {
      var ok = $('#ok', sh); if (!ok) return;
      ok.onclick = function (ev) {
        var items = $$('[data-i]', sh).filter(function (x) { return x.checked; }).map(function (x) { var r = rows[+x.dataset.i]; return { nom: r.c.nom, enveloppe: r.prop }; });
        if (!items.length) { close(); return; }
        run(ev.currentTarget, saveEnvelopes(items), items.length + ' enveloppe(s) mise(s) à jour').then(function () { close(); render(); });
      };
    });
  }

  return { go: go, render: render, toast: toast, openSheet: openSheet, confirmSheet: confirmSheet, run: run, busy: busy, topbar: topbar, tile: tile, catOptions: catOptions, compteOptions: compteOptions,
    catGrid: catGrid, opSheet: opSheet, opRow: opRow, triExpress: triExpress, catSheet: catSheet, saveEnvelopes: saveEnvelopes, evHtml: evHtml, suggHtml: suggHtml, bindSugg: bindSugg,
    statusTag: statusTag, catIcon: catIcon, I: I, $: $, $$: $$, bindCommon: bindCommon, donutMonth: donutMonth, syncBadge: syncBadge, monthSwitch: monthSwitch };
})();
