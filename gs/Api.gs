/* =====================================================================
   BUDGET MAISON v4 — Api.gs (2e fichier du même projet Apps Script)
   API de l'application installable (GitHub Pages).
   Toutes les fonctions sont préfixées api_ : aucun risque d'écraser Code.gs.
   Déploiement : Application Web — Exécuter en tant que « Moi » —
   Accès « Tout le monde ». La sécurité repose sur les codes d'accès
   (menu Budget Maison › Codes d'accès) et un jeton signé valable 30 jours.
   ===================================================================== */
var API_VERSION = '4.1';
var API_TOKEN_DAYS = 30;

function doGet(e) {
  return api_json_({ ok: true, app: 'Budget Maison', version: API_VERSION,
    message: "API active. Ouvrez l'application installée pour l'utiliser." });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return api_json_({ ok: false, error: 'Requête illisible.' }); }
  try {
    var action = req.action;
    if (action === 'hello') {
      var p = readParams_();
      return api_json_({ ok: true, version: API_VERSION, foyer: p.foyer, users: Object.keys(api_users_()) });
    }
    if (action === 'login') return api_json_(api_login_(req.user, req.pin));
    var user = api_checkToken_(req.token);
    if (!user) return api_json_({ ok: false, auth: false, error: 'Session expirée : saisissez à nouveau votre code.' });
    var out = api_route_(action, req, user);
    out.ok = true;
    return api_json_(out);
  } catch (err) {
    return api_json_({ ok: false, error: String(err && err.message || err) });
  }
}

/** Titulaire auquel l'utilisateur est restreint, ou null (accès complet). */
function api_scope_(user) {
  var u = api_users_()[user];
  return u && u.acces === 'Restreint' && u.titulaire ? u.titulaire : null;
}
/** Comptes accessibles à un utilisateur restreint. */
function api_comptesOk_(tit) {
  var ok = {}; readComptes_().forEach(function (c) { if (c.titulaire === tit) ok[c.nom] = true; }); return ok;
}
var API_LECTURE_ET_SAISIE = { bootstrap: 1, updateOps: 1, addOp: 1, deleteOps: 1, importOps: 1, couverture: 1 };

function api_route_(action, q, user) {
  var tit = api_scope_(user);
  if (tit) {
    if (!API_LECTURE_ET_SAISIE[action]) throw new Error('Accès restreint : cette action est réservée aux utilisateurs en accès complet.');
    var ok = api_comptesOk_(tit);
    if ((action === 'importOps' || action === 'couverture') && !ok[q.compte]) throw new Error('Compte hors de votre périmètre.');
    if (action === 'addOp' && !ok[q.op && q.op.compte]) throw new Error('Compte hors de votre périmètre.');
    if (action === 'updateOps' || action === 'deleteOps') {
      var mine = {}; readOps_().forEach(function (o) { if (ok[o.compte]) mine[o.id] = true; });
      if ((q.ids || []).some(function (id) { return !mine[id]; })) throw new Error('Opération hors de votre périmètre.');
    }
  }
  switch (action) {
    case 'bootstrap': return api_bootstrap_(user, tit);
    case 'updateOps': return { n: patchOps_(q.ids || [], q.patch || {}, user) };
    case 'addOp': return appendOps_([{ date: q.op.date, compte: q.op.compte, lib: q.op.lib, mt: q.op.mt, cat: q.op.cat, comm: q.op.comm, manuel: true, force: true }], 'Saisie ' + user, user);
    case 'deleteOps': return { n: deleteOps_(q.ids || [], user) };
    case 'importOps': return appendOps_((q.rows || []).map(function (r) { r.compte = q.compte; return r; }), q.lot || ('Appli ' + user), user);
    case 'addRule': return { changed: addRule_(q.mot, q.cat, q.compte || '', q.apply !== false, !!q.toutes, user) };
    case 'reapply': return { changed: reapplyRules_(user, !!q.onlyUnclassified) };
    case 'saveRow': return { row: upsertRow_(q.table, q.row, q.oldKey, user) };
    case 'deleteRow': return { deleted: deleteRow_(q.table, q.key, user) };
    case 'saveEnveloppes': return { n: saveEnveloppes_(q.items || [], user) };
    case 'deleteRule': return { deleted: deleteRule_(q.mot, q.cat, q.compte || '', user) };
    case 'couverture': return { changed: setCouverture_(q.compte, q.date, user) };
    case 'saveParams': saveParams_(q.params || {}, user); return {};
    case 'recaler': return api_recaler_(q.compte, +q.solde, q.date, user, q.origine || '');
    case 'refreshTableau': buildTableau_(); return {};
    default: throw new Error('Action inconnue : ' + action);
  }
}

/** Toutes les données en une fois (format compact pour les opérations). */
function api_bootstrap_(user, tit) {
  var ops = readOps_(), comptes = readComptes_(), ech = readEcheances_(), prets = readPrets_(), obj = readObjectifs_();
  if (tit) { // accès restreint : uniquement les comptes du titulaire
    var ok = {}; comptes = comptes.filter(function (c) { if (c.titulaire === tit) { ok[c.nom] = true; return true; } return false; });
    ops = ops.filter(function (o) { return ok[o.compte]; });
    ech = ech.filter(function (e) { return ok[e.compte]; });
    prets = prets.filter(function (p) { return ok[p.compte]; });
    obj = obj.filter(function (g) { return !g.compte || ok[g.compte]; });
  }
  return {
    user: user, restreint: tit || '', version: API_VERSION, serverTime: new Date().toISOString(),
    today: Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'),
    params: readParams_(), comptes: comptes, categories: readCategories_(), regles: readRegles_(),
    echeances: ech, prets: prets, objectifs: obj,
    // [id, date, compte, libellé, montant, catégorie, origine, mois forcé, commentaire]
    ops: ops.map(function (o) { return [o.id, o.date, o.compte, o.lib, o.mt, o.cat, o.origine === 'Manuel' ? 1 : 0, o.moisForce, o.comm]; })
  };
}

/** Recale un compte : le solde saisi devient la référence à la date donnée. */
function api_recaler_(compte, solde, date, user, origine) {
  var c = readComptes_().filter(function (x) { return x.nom === compte; })[0];
  if (!c) throw new Error('Compte inconnu : ' + compte);
  if (isNaN(solde)) throw new Error('Solde illisible.');
  var ops = readOps_(), avant = BM.balanceAt(c, date, ops);
  c.soldeRef = BM.r2(solde); c.dateRef = date; c.origine = 'Recalé par ' + user + ' le ' + Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy') + (origine ? ' (' + origine + ')' : '');
  upsertRow_('COMPTES', c, c.nom, user);
  log_(user, 'Recalage', compte + ' au ' + date + ' : ' + avant + ' → ' + solde + ' (écart ' + BM.r2(solde - avant) + ')');
  return { ecart: BM.r2(solde - avant), compte: c };
}

/* ---------------- Sécurité ---------------- */
function api_users_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('USERS') || '{}'); } catch (e) { return {}; }
}
function api_saveUsers_(u) { PropertiesService.getScriptProperties().setProperty('USERS', JSON.stringify(u)); }
function api_secret_() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}
function api_hash_(txt) {
  var b = Utilities.computeHmacSha256Signature(txt, api_secret_());
  return Utilities.base64EncodeWebSafe(b);
}
function api_login_(user, pin) {
  var users = api_users_(), u = users[user];
  var cache = CacheService.getScriptCache(), k = 'fail_' + user, fails = +(cache.get(k) || 0);
  if (fails >= 5) return { ok: false, error: 'Trop de tentatives : réessayez dans 15 minutes.' };
  if (!u || u.h !== api_hash_(user + '|' + String(pin || ''))) {
    cache.put(k, String(fails + 1), 900);
    Utilities.sleep(800);
    return { ok: false, error: 'Code incorrect.' };
  }
  cache.remove(k);
  var exp = Date.now() + API_TOKEN_DAYS * 86400000;
  var payload = user + '|' + exp + '|' + (u.v || 0);
  log_(user, 'Connexion', 'Appli');
  return { ok: true, token: Utilities.base64EncodeWebSafe(payload, Utilities.Charset.UTF_8) + '.' + api_hash_(payload), user: user };
}
function api_checkToken_(token) {
  if (!token || String(token).indexOf('.') === -1) return null;
  var parts = String(token).split('.');
  var payload;
  try { payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString('UTF-8'); } catch (e) { return null; }
  if (api_hash_(payload) !== parts[1]) return null;
  var f = payload.split('|'), users = api_users_();
  if (!users[f[0]] || +f[1] < Date.now() || String(users[f[0]].v || 0) !== f[2]) return null;
  return f[0];
}
function api_json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
