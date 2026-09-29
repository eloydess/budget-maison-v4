/* ===================== Budget Maison — lecture des relevés bancaires =====================
   Formats : CSV / TXT (tous séparateurs, UTF-8 ou Windows-1252), OFX / QFX, QIF, XLS / XLSX,
   ou texte collé (copier-coller depuis la banque ou un tableur).
   Détection automatique des colonnes, modifiable par l'utilisateur. */
var Importer = (function () {
  'use strict';
  var SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  function decode(buf) {
    var t = new TextDecoder('utf-8').decode(buf);
    if (t.indexOf('�') !== -1) t = new TextDecoder('windows-1252').decode(buf);
    return t.replace(/^﻿/, '');
  }
  function loadScript(src) {
    return new Promise(function (ok, ko) {
      if (window.XLSX) return ok();
      var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { ko(new Error('Lecture Excel indisponible hors connexion.')); };
      document.head.appendChild(s);
    });
  }
  /** Lit un fichier -> {kind:'table', table} ou {kind:'rows', rows} */
  function readFile(file) {
    var name = (file.name || '').toLowerCase();
    return file.arrayBuffer().then(function (buf) {
      if (/\.(xlsx|xls|ods)$/.test(name)) {
        return loadScript(SHEETJS).then(function () {
          var wb = XLSX.read(buf, { type: 'array', cellDates: true });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var table = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).map(function (r) {
            return r.map(function (c) { return c instanceof Date ? BM.ymd(c) : c; });
          });
          return { kind: 'table', table: table };
        });
      }
      var text = decode(buf);
      var prof = profile(text);
      if (prof) {
        if (!prof.compteNo) { var mm = /^(\d{8,})[_ .-]/.exec(file.name || ''); if (mm) prof.compteNo = mm[1]; }
        var mc = /_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{4})/.exec(file.name || ''); // BPGO : « _JJMMAAAA_JJMMAAAA »
        if (!prof.couverture && mc) prof.couverture = mc[6] + '-' + mc[5] + '-' + mc[4];
        return prof;
      }
      if (/\.(ofx|qfx)$/.test(name) || /<OFX>|<STMTTRN>/i.test(text)) return { kind: 'rows', rows: parseOFX(text), format: 'OFX' };
      if (/\.qif$/.test(name) || /^!Type:/m.test(text)) return { kind: 'rows', rows: parseQIF(text), format: 'QIF' };
      return { kind: 'table', table: parseCSV(text) };
    });
  }
  function parseText(text) {
    var prof = profile(text);
    if (prof) return prof;
    if (/<STMTTRN>/i.test(text)) return { kind: 'rows', rows: parseOFX(text), format: 'OFX' };
    return { kind: 'table', table: parseCSV(text) };
  }

  /* ---------- CSV ---------- */
  function splitLine(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function parseCSV(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
    var best = ';', bestScore = -1;
    [';', '\t', ',', '|'].forEach(function (sep) {
      var counts = lines.slice(0, 40).map(function (l) { return splitLine(l, sep).length; });
      var freq = {}; counts.forEach(function (c) { freq[c] = (freq[c] || 0) + 1; });
      var mode = 1, mf = 0; Object.keys(freq).forEach(function (k) { if (freq[k] > mf && +k > 1) { mf = freq[k]; mode = +k; } });
      var score = mode > 1 ? mf * 10 + mode : 0;
      if (score > bestScore) { bestScore = score; best = sep; }
    });
    return lines.map(function (l) { return splitLine(l, best); });
  }

  /* ---------- Formats bancaires connus (libellés identiques à l'historique) ----------
     Renvoie {kind:'rows', format, compteNo, balance:{date,solde}|null, rows} ou null. */
  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
  function profile(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n'), first = lines[0] || '', m, rows = [], bal = null, no = '';
    // Banque Populaire (BPGO) : en-tête « Date de comptabilisation;Libelle simplifie;… »
    if (/^Date de comptabilisation;Libell[eé] simplifi[eé]/i.test(first)) {
      lines.slice(1).forEach(function (l) {
        if (!l.trim()) return;
        var c = splitLine(l, ';'), d = parseDate(c[0]);
        var mt = c[8] ? BM.toNum(c[8]) : BM.toNum(c[9]);
        if (!d || isNaN(mt)) return;
        rows.push({ date: d, lib: clean([c[1], c[2], c[4]].filter(Boolean).join(' ')), mt: BM.r2(mt), err: '' });
      });
      return { kind: 'rows', format: 'Banque Populaire', compteNo: '', balance: null, rows: rows };
    }
    // Société Générale : 1re ligne « n° compte;[début];[fin];nb opérations;date du solde;solde EUR »
    //   ancien export : ="0404100050534800";;;20;31/08/2026;19,13 EUR — nouvel export : 00050534800;29/03/2026;29/09/2026;19;29/09/2026;10.13 EUR
    if ((m = /^="?(\d{8,})"?;[^;]*;[^;]*;(\d*);(\d{2}\/\d{2}\/\d{4});([-\d.,\s]+?)\s*EUR/i.exec(first)) || (m = /^(\d{8,});[^;]*;[^;]*;(\d*);(\d{2}\/\d{2}\/\d{4});([-\d.,\s]+?)\s*EUR/i.exec(first))) {
      no = m[1]; bal = { date: parseDate(m[3]), solde: BM.r2(BM.toNum(m[4].indexOf(',') === -1 ? m[4].replace('.', ',') : m[4])) };
      var nbAnn = m[2] === '' ? null : parseInt(m[2], 10), start = false;
      lines.slice(1).forEach(function (l) {
        if (/^Date de l.{0,2}op/i.test(l)) { start = true; return; }
        if (!start || !l.trim()) return;
        var c = splitLine(l, ';'), d = parseDate(c[0]), mt = BM.toNum(c[3]);
        if (!d || isNaN(mt)) return;
        rows.push({ date: d, lib: clean([c[1], c[2]].filter(Boolean).join(' ')), mt: BM.r2(mt), err: '' });
      });
      var ctlSG = nbAnn == null ? null : (nbAnn === rows.length ? { ok: true, msg: 'Nombre d\'opérations conforme à l\'en-tête (' + nbAnn + ').' }
        : { ok: false, msg: 'L\'en-tête annonce ' + nbAnn + ' opération(s), ' + rows.length + ' lue(s) : fichier incomplet, retéléchargez-le.' });
      return { kind: 'rows', format: 'Société Générale', compteNo: no, balance: bal, couverture: bal.date, controle: ctlSG, rows: rows };
    }
    // La Banque Postale : préambule « Numéro Compte ;… Solde (EUROS) ;… »
    if (/^Num[ée]ro Compte\s*;/i.test(first)) {
      no = clean(first.split(';')[1]);
      var dSolde = '', start2 = false;
      lines.forEach(function (l) {
        var c = splitLine(l, ';'), k = clean(c[0]).toLowerCase();
        if (k === 'date' && !start2 && c.length === 2) dSolde = parseDate(c[1]);
        else if (/^solde/.test(k)) bal = { date: dSolde, solde: BM.r2(BM.toNum(c[1])) };
        else if (k === 'date' && c.length >= 3) start2 = true;
        else if (start2 && parseDate(c[0])) {
          var mt = BM.toNum(c[2]); if (!isNaN(mt)) rows.push({ date: parseDate(c[0]), lib: clean(c[1]), mt: BM.r2(mt), err: '' });
        }
      });
      return { kind: 'rows', format: 'La Banque Postale', compteNo: no, balance: bal && bal.date ? bal : null, couverture: bal && bal.date ? bal.date : '', rows: rows };
    }
    // LCL : pas d'en-tête ; lignes de solde « date;solde;;n° compte » en tête et en fin
    var c0 = splitLine(first.replace(/^\uFEFF/, ''), ';');
    if (parseDate(c0[0]) && c0.length >= 4 && !c0[2] && /^\d{5} \d{6}[A-Z0-9]$/.test(clean(c0[3]))) {
      no = clean(c0[3]);
      var ouv = null;
      lines.forEach(function (l) {
        if (!l.trim()) return;
        var c = splitLine(l.replace(/^\uFEFF/, ''), ';'), d = parseDate(c[0]), mt = BM.toNum(c[1]);
        if (!d || isNaN(mt)) return;
        if (!c[2] && /^\d{5} \d{6}[A-Z0-9]$/.test(clean(c[3]))) { if (ouv == null) ouv = BM.r2(mt); else bal = { date: d, solde: BM.r2(mt) }; return; } // 1re ligne = ouverture, dernière = clôture
        rows.push({ date: d, lib: clean([c[2], c[4], c[5], c[7]].filter(Boolean).join(' ')), mt: BM.r2(mt), err: '' });
      });
      var ctl = null;
      if (ouv != null && bal) {
        var som = rows.reduce(function (a, r) { return a + r.mt; }, 0), ec = BM.r2(ouv + som - bal.solde);
        ctl = Math.abs(ec) <= 0.01 ? { ok: true, msg: 'Le relevé boucle : ouverture ' + ouv.toFixed(2).replace('.', ',') + ' € + opérations = clôture ' + bal.solde.toFixed(2).replace('.', ',') + ' €.' }
          : { ok: false, msg: 'Le relevé ne boucle pas (écart ' + ec.toFixed(2).replace('.', ',') + ' €) : fichier incomplet, retéléchargez-le.' };
      }
      return { kind: 'rows', format: 'LCL', compteNo: no, balance: bal, couverture: bal ? bal.date : '', controle: ctl, rows: rows };
    }
    return null;
  }

  /* ---------- OFX / QIF ---------- */
  function tag(block, name) {
    var m = new RegExp('<' + name + '>([^<\\r\\n]*)', 'i').exec(block);
    return m ? m[1].trim() : '';
  }
  function parseOFX(text) {
    var out = [], re = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi, m;
    while ((m = re.exec(text))) {
      var b = m[1], d = tag(b, 'DTPOSTED'), amt = BM.toNum(tag(b, 'TRNAMT'));
      var lib = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' ').replace(/\s+/g, ' ');
      if (d.length >= 8 && !isNaN(amt)) out.push({ date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), lib: lib, mt: BM.r2(amt) });
    }
    return out;
  }
  function parseQIF(text) {
    var out = [], cur = {};
    text.replace(/\r/g, '').split('\n').forEach(function (l) {
      var c = l[0], v = l.slice(1).trim();
      if (c === 'D') cur.date = parseDate(v.replace("'", '/'));
      else if (c === 'T' || c === 'U') cur.mt = BM.toNum(v);
      else if (c === 'P') cur.p = v;
      else if (c === 'M') cur.m = v;
      else if (c === '^') {
        if (cur.date && !isNaN(cur.mt)) out.push({ date: cur.date, lib: [cur.p, cur.m].filter(Boolean).join(' '), mt: BM.r2(cur.mt) });
        cur = {};
      }
    });
    return out;
  }

  /* ---------- Dates et nombres ---------- */
  function parseDate(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) { // numéro de série Excel
      var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + BM.pad(d.getUTCMonth() + 1) + '-' + BM.pad(d.getUTCDate());
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + '-' + BM.pad(+m[2]) + '-' + BM.pad(+m[3]);
    if ((m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?!\d)/.exec(s))) {
      var y = m[3].length === 2 ? '20' + m[3] : m[3], mo = +m[2], da = +m[1];
      if (mo < 1 || mo > 12 || da < 1 || da > 31) return '';
      return y + '-' + BM.pad(mo) + '-' + BM.pad(da);
    }
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return m[1] + '-' + m[2] + '-' + m[3];
    return '';
  }
  function isNum(v) {
    if (typeof v === 'number') return true;
    var s = String(v).trim();
    if (!s || !/\d/.test(s) || /[a-zA-Z]{2,}/.test(s)) return false;
    if (parseDate(s)) return false;
    return /^[-+(]?\s*[\d\s  .,]+\s*€?\s*[)-]?$/.test(s) && !isNaN(BM.toNum(s));
  }

  /* ---------- Détection des colonnes ---------- */
  function guess(table) {
    var rows = table.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    var ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([0]));
    var dataStart = -1;
    for (var i = 0; i < rows.length && dataStart < 0; i++) {
      var r = rows[i], hasD = false, hasN = false;
      r.forEach(function (c) { if (parseDate(c)) hasD = true; else if (isNum(c)) hasN = true; });
      if (hasD && hasN) dataStart = i;
    }
    if (dataStart < 0) return { error: "Aucune ligne d'opération reconnue (il faut au moins une date et un montant par ligne)." };
    var header = dataStart > 0 ? rows[dataStart - 1].map(function (c) { return String(c).trim(); }) : [];
    var data = rows.slice(dataStart).filter(function (r) { return r.some(function (c) { return parseDate(c); }); });
    var stats = [];
    for (var c = 0; c < ncol; c++) {
      var nd = 0, nn = 0, ne = 0, pos = 0, neg = 0, len = 0;
      data.forEach(function (r) {
        var v = r[c] == null ? '' : r[c];
        if (String(v).trim() === '') { ne++; return; }
        if (parseDate(v)) nd++;
        else if (isNum(v)) { nn++; var x = BM.toNum(v); if (x > 0) pos++; if (x < 0) neg++; }
        else len += String(v).length;
      });
      var filled = data.length - ne || 1;
      stats.push({ c: c, h: (header[c] || '').toLowerCase(), date: nd / filled, num: nn / filled, fill: 1 - ne / data.length, pos: pos, neg: neg, len: len / filled });
    }
    var hd = function (s, re) { return re.test(s.h); };
    // Date : de préférence « date d'opération », sinon la 1re colonne de dates
    var dcs = stats.filter(function (s) { return s.date > 0.8; });
    var dateCol = (dcs.filter(function (s) { return hd(s, /op[ée]r/); })[0] || dcs.filter(function (s) { return hd(s, /comptab/); })[0] || dcs.filter(function (s) { return !hd(s, /valeur/); })[0] || dcs[0] || {}).c;
    var nums = stats.filter(function (s) { return s.num > 0.8 && s.c !== dateCol; });
    var map = { date: dateCol, lib: [], montant: null, debit: null, credit: null, invert: false, header: header, dataStart: dataStart };
    var deb = nums.filter(function (s) { return hd(s, /d[ée]bit/); })[0], cre = nums.filter(function (s) { return hd(s, /cr[ée]dit/); })[0];
    var mon = nums.filter(function (s) { return hd(s, /montant|amount|somme|valeur €|euros?/); })[0];
    if (deb && cre) { map.debit = deb.c; map.credit = cre.c; }
    else if (mon) map.montant = mon.c;
    else {
      var mixed = nums.filter(function (s) { return s.pos && s.neg; });
      if (mixed.length) map.montant = mixed[0].c;
      else if (nums.length >= 2 && nums[0].fill + nums[1].fill <= 1.15) { map.debit = nums[0].c; map.credit = nums[1].c; }
      else if (nums.length) map.montant = nums[nums.length === 1 ? 0 : 0].c;
    }
    var texts = stats.filter(function (s) { return s.c !== dateCol && s.num < 0.5 && s.date < 0.5 && s.fill > 0.3 && !hd(s, /type|cat[ée]gor|r[ée]f[ée]rence|pointage|devise|statut/); });
    var libs = texts.filter(function (s) { return hd(s, /libell|descri|intitul|d[ée]tail|objet|nature|m[ée]mo|op[ée]ration|tiers|b[ée]n[ée]f/); });
    if (!libs.length) { texts.sort(function (a, b) { return b.len - a.len; }); libs = texts.slice(0, 1); }
    map.lib = libs.sort(function (a, b) { return a.c - b.c; }).map(function (s) { return s.c; });
    map.ncol = ncol;
    return { map: map, data: data, stats: stats };
  }
  /** Applique une correspondance de colonnes -> [{date, lib, mt, err?}] */
  function apply(data, map) {
    return data.map(function (r) {
      var date = parseDate(r[map.date]);
      var lib = map.lib.map(function (c) { return String(r[c] == null ? '' : r[c]).trim(); }).filter(Boolean).join(' ').replace(/\s+/g, ' ');
      var mt;
      if (map.montant != null) mt = BM.toNum(r[map.montant]);
      else {
        var d = r[map.debit], c = r[map.credit];
        var dv = String(d).trim() === '' ? 0 : Math.abs(BM.toNum(d)), cv = String(c).trim() === '' ? 0 : Math.abs(BM.toNum(c));
        mt = (isNaN(cv) ? 0 : cv) - (isNaN(dv) ? 0 : dv);
      }
      if (map.invert) mt = -mt;
      var err = !date ? 'date illisible' : (isNaN(mt) ? 'montant illisible' : (!mt ? 'montant nul' : (!lib ? 'libellé vide' : '')));
      return { date: date, lib: lib, mt: BM.r2(mt), err: err };
    });
  }
  return { readFile: readFile, parseText: parseText, profile: profile, guess: guess, apply: apply, parseDate: parseDate, parseCSV: parseCSV, parseOFX: parseOFX };
})();
if (typeof module !== 'undefined') module.exports = Importer;
