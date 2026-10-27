/* ===================== Budget Maison v4 — démarrage, connexion, synchronisation ===================== */
(function () {
  'use strict';
  var A = App, S = A.S, esc = A.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };

  function applyTheme() {
    var t = A.LS.get('theme', 'auto');
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }
  App.applyTheme = applyTheme;

  /* ---------------- Synchronisation ---------------- */
  App.sync = function (manual) {
    if (S.syncing) return Promise.resolve();
    S.syncing = true; if (S.data) UI.render();
    return A.api('bootstrap').then(function (d) {
      S.syncing = false; S.syncErr = false; S.syncedAt = Date.now(); S.user = d.user;
      A.load(d); A.saveCache();
      UI.render();
      if (manual) UI.toast('Données à jour ✓');
    }, function (e) {
      S.syncing = false; S.syncErr = true;
      if (S.data) { UI.render(); if (manual || !S.token) UI.toast('⚠️ ' + e.message, 4200); }
      else if (S.token) loginScreen(e.message);
    });
  };
  App.logout = function () {
    A.LS.del('token'); A.LS.del('cache'); S.token = ''; S.data = null; loginScreen();
  };
  App.onLogout = function (msg) { loginScreen(msg); };

  /* ---------------- Écran de connexion ---------------- */
  function loginScreen(msg) {
    var app = $('#app');
    if (!S.api) {
      app.innerHTML = '<div class="login"><div><div class="boot-logo" style="margin:0 auto 14px"></div><h1 style="margin:0 0 4px">Budget Maison</h1><p style="opacity:.8;margin:0 0 18px">Première connexion</p></div>' +
        '<div class="card"><h2>Adresse du serveur</h2><p class="small ink2">Collez l\'adresse de l\'application Web Apps Script (se termine par <span class="kbd">/exec</span>). Voir le guide d\'installation.</p>' +
        '<input class="input" id="url" placeholder="https://script.google.com/macros/s/…/exec"><button class="btn block mt12" id="ok">Continuer</button></div></div>';
      $('#ok').onclick = function () {
        var u = $('#url').value.trim();
        if (!/^https:\/\/script\.google(usercontent)?\.com\/.+\/exec/.test(u)) { UI.toast('Adresse invalide : elle doit commencer par https://script.google.com/ et finir par /exec'); return; }
        S.api = u; A.LS.set('api', u); loginScreen();
      };
      return;
    }
    app.innerHTML = '<div class="login"><div><div class="boot-logo" style="margin:0 auto 14px"></div><h1 style="margin:0 0 4px">Budget Maison</h1><p style="opacity:.8;margin:0 0 18px" id="foyer">Connexion…</p></div><div class="card" id="lc"><p class="center muted">Contact du serveur…</p></div></div>';
    A.api('hello').then(function (h) {
      $('#foyer').textContent = h.foyer || '';
      if (!h.users.length) {
        $('#lc').innerHTML = '<h2>Aucun code d\'accès</h2><p class="small ink2">Dans le classeur Google Sheets : menu <b>Budget Maison › Codes d\'accès de l\'application</b>, puis revenez ici.</p><button class="btn block mt12" onclick="location.reload()">Réessayer</button>';
        return;
      }
      var user = A.LS.get('user', '') ; if (h.users.indexOf(user) === -1) user = h.users.length === 1 ? h.users[0] : '';
      var pin = '';
      function draw(err) {
        $('#lc').innerHTML = '<h2>Qui êtes-vous ?</h2><div class="users">' + h.users.map(function (u) { return '<button class="chip ' + (u === user ? 'on' : '') + '" data-u="' + esc(u) + '">' + esc(u) + '</button>'; }).join('') + '</div>' +
          '<div class="pin">' + [0, 1, 2, 3, 4, 5].map(function (i) { return '<i class="' + (i < pin.length ? 'f' : '') + '"></i>'; }).join('') + '</div>' +
          (err || msg ? '<p class="center small bad">' + esc(err || msg) + '</p>' : '<p class="center small muted">Code de 4 à 6 chiffres</p>') +
          '<div class="pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, 'OK'].map(function (k) { return '<button data-k="' + k + '">' + k + '</button>'; }).join('') + '</div>';
        msg = null;
        Array.prototype.forEach.call(document.querySelectorAll('[data-u]'), function (b) { b.onclick = function () { user = b.dataset.u; draw(); }; });
        Array.prototype.forEach.call(document.querySelectorAll('[data-k]'), function (b) {
          b.onclick = function () {
            var k = b.dataset.k;
            if (k === '⌫') pin = pin.slice(0, -1);
            else if (k === 'OK') return submit();
            else if (pin.length < 6) pin += k;
            draw();
            if (pin.length === 6) submit();
          };
        });
      }
      function submit() {
        if (!user) { draw('Choisissez votre prénom.'); return; }
        if (pin.length < 4) { draw('4 chiffres minimum.'); return; }
        $('#lc').innerHTML = '<p class="center muted">Vérification…</p>';
        A.api('login', { user: user, pin: pin }).then(function (r) {
          S.token = r.token; S.user = r.user; A.LS.set('token', r.token); A.LS.set('user', r.user);
          $('#lc').innerHTML = '<p class="center muted">Chargement de vos données…</p>';
          App.sync();
        }, function (e) { pin = ''; draw(e.message); });
      }
      document.onkeydown = function (e) {
        if (!document.querySelector('.pad')) return;
        if (/^\d$/.test(e.key) && pin.length < 6) { pin += e.key; draw(); if (pin.length === 6) submit(); }
        else if (e.key === 'Backspace') { pin = pin.slice(0, -1); draw(); }
        else if (e.key === 'Enter') submit();
      };
      draw();
    }, function (e) {
      $('#lc').innerHTML = '<h2>Serveur injoignable</h2><p class="small ink2">' + esc(e.message) + '</p><button class="btn block mt12" onclick="location.reload()">Réessayer</button>' +
        '<button class="btn ghost block mt8" id="chg">Changer l\'adresse du serveur</button>';
      $('#chg').onclick = function () { A.LS.del('api'); S.api = (window.BM_CONFIG && BM_CONFIG.API_URL) ? '' : ''; loginScreen(); };
    });
  }

  /* ---------------- Démarrage ---------------- */
  function boot() {
    applyTheme();
    S.api = A.LS.get('api', '') || (window.BM_CONFIG && BM_CONFIG.API_URL) || '';
    var q = /[?&]api=([^&]+)/.exec(location.search);
    if (q) { S.api = decodeURIComponent(q[1]); A.LS.set('api', S.api); history.replaceState(null, '', location.pathname); }
    S.token = A.LS.get('token', '');
    S.user = A.LS.get('user', '');
    S.syncedAt = A.LS.get('syncedAt', null);
    var cache = A.LS.get('cache', null);
    if (S.token && cache && cache.ops) {
      try { A.load(cache); UI.render(true); } catch (e) { A.LS.del('cache'); }
      App.sync();
    } else if (S.token) {
      App.sync();
    } else loginScreen();
    window.addEventListener('online', function () { S.online = true; App.sync(); });
    window.addEventListener('offline', function () { S.online = false; if (S.data) UI.render(); });
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (S.data && !document.querySelector('.sheet')) UI.render(); }, 250); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.token && S.syncedAt && Date.now() - S.syncedAt > 5 * 60000) App.sync(); });
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { /* hors ligne indisponible */ });
  }
  boot();
})();
