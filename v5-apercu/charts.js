/* ===================== Budget Maison — graphiques SVG ===================== */
var Charts = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var tip = null;
  function T() { return tip || (tip = document.getElementById('tip')); }
  function showTip(html, x, y) {
    var t = T(); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    var w = t.offsetWidth, h = t.offsetHeight, vw = window.innerWidth;
    var left = Math.min(Math.max(8, x - w / 2), vw - w - 8), top = y - h - 14;
    if (top < 8) top = y + 18;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  }
  function hideTip() { var t = T(); if (t) t.hidden = true; }
  document.addEventListener('scroll', hideTip, true);

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    var s = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return s * p;
  }
  function ticks(min, max, n) {
    var span = max - min, step = niceMax(span / n), out = [];
    var start = Math.floor(min / step) * step;
    for (var v = start; v <= max + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
    return out;
  }
  function kfmt(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e4) return Math.round(v / 1e3) + ' k';
    if (a >= 1e3) return (v / 1e3).toFixed(1).replace('.', ',').replace(',0', '') + ' k';
    return String(Math.round(v));
  }
  function width(host) { return Math.max(260, host.clientWidth || 320); }
  function rounded(x, y, w, h, r, up) { // barre arrondie côté données uniquement
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h));
    if (h <= 0.5) return 'M' + x + ',' + y + 'h' + w;
    if (up) return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    return 'M' + x + ',' + y + 'V' + (y + h - r) + 'Q' + x + ',' + (y + h) + ' ' + (x + r) + ',' + (y + h) + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w) + ',' + (y + h - r) + 'V' + y + 'Z';
  }

  /** Barres groupées. opts: {labels, series:[{name,color,values}], height, fmt, xfmt, onClick(i)} */
  function bars(host, o) {
    host.innerHTML = '';
    var W = width(host), H = o.height || 200, pl = 40, pr = 6, pt = 10, pb = 24;
    var all = []; o.series.forEach(function (s) { all = all.concat(s.values); });
    var mx = Math.max.apply(null, all.concat([0])), mn = Math.min.apply(null, all.concat([0]));
    var tk = ticks(mn, mx || 1, 4); mx = tk[tk.length - 1]; mn = Math.min(mn, tk[0]);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': o.aria || 'Graphique en barres' }, host);
    var iw = W - pl - pr, ih = H - pt - pb, n = o.labels.length;
    function Y(v) { return pt + ih - (v - mn) / (mx - mn || 1) * ih; }
    tk.forEach(function (t) {
      el('line', { x1: pl, x2: W - pr, y1: Y(t), y2: Y(t), class: t === 0 ? 'zero' : 'gridl' }, svg);
      var tx = el('text', { x: pl - 6, y: Y(t) + 4, 'text-anchor': 'end' }, svg); tx.textContent = kfmt(t);
    });
    var band = iw / n, ns = o.series.length, gap = 2, bw = Math.max(2, Math.min(22, (band * 0.72 - gap * (ns - 1)) / ns));
    var every = Math.ceil(n / Math.max(1, Math.floor(iw / 44)));
    for (var i = 0; i < n; i++) {
      var gx = pl + band * i + (band - (bw * ns + gap * (ns - 1))) / 2;
      o.series.forEach(function (s, j) {
        var v = s.values[i] || 0, y0 = Y(0), y1 = Y(v), up = v >= 0;
        el('path', { d: rounded(gx + j * (bw + gap), Math.min(y0, y1), bw, Math.abs(y1 - y0), 4, up), fill: s.color, opacity: o.highlight != null && o.highlight !== i ? 0.35 : 1 }, svg);
      });
      if (i % every === 0 || i === n - 1) { var lx = el('text', { x: pl + band * i + band / 2, y: H - 6, 'text-anchor': 'middle' }, svg); lx.textContent = o.xfmt ? o.xfmt(o.labels[i], i) : o.labels[i]; }
    }
    var hit = el('rect', { x: pl, y: pt, width: iw, height: ih, fill: 'transparent' }, svg);
    function at(ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
      return Math.max(0, Math.min(n - 1, Math.floor((x - pl) / band)));
    }
    hit.addEventListener('pointermove', function (ev) {
      var i = at(ev), h = '<b>' + (o.tipLabel ? o.tipLabel(o.labels[i], i) : o.labels[i]) + '</b>';
      o.series.forEach(function (s) { h += '<br><span style="color:' + s.color + '">■</span> ' + s.name + ' : ' + o.fmt(s.values[i] || 0); });
      if (o.extraTip) h += o.extraTip(i);
      showTip(h, ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', hideTip);
    if (o.onClick) hit.addEventListener('click', function (ev) { o.onClick(at(ev)); });
    return svg;
  }

  /** Courbes. opts: {labels, series:[{name,color,values,area,dash,step}], refs:[{y,label,color}], height, fmt, xfmt, markers:[{i,label}]} */
  function line(host, o) {
    host.innerHTML = '';
    var W = width(host), H = o.height || 210, pl = 44, pr = 8, pt = 12, pb = 24;
    var all = []; o.series.forEach(function (s) { all = all.concat(s.values.filter(function (v) { return v != null; })); });
    (o.refs || []).forEach(function (r) { all.push(r.y); });
    var mx = Math.max.apply(null, all.concat([0])), mn = Math.min.apply(null, all.concat([0]));
    var tk = ticks(mn, mx === mn ? mn + 1 : mx, 4); mx = Math.max(mx, tk[tk.length - 1]); mn = Math.min(mn, tk[0]);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'chart', role: 'img', 'aria-label': o.aria || 'Courbe' }, host);
    var iw = W - pl - pr, ih = H - pt - pb, n = o.labels.length;
    function X(i) { return pl + (n <= 1 ? iw / 2 : i / (n - 1) * iw); }
    function Y(v) { return pt + ih - (v - mn) / (mx - mn || 1) * ih; }
    tk.forEach(function (t) {
      el('line', { x1: pl, x2: W - pr, y1: Y(t), y2: Y(t), class: t === 0 ? 'zero' : 'gridl' }, svg);
      var tx = el('text', { x: pl - 6, y: Y(t) + 4, 'text-anchor': 'end' }, svg); tx.textContent = kfmt(t);
    });
    (o.refs || []).forEach(function (r) {
      el('line', { x1: pl, x2: W - pr, y1: Y(r.y), y2: Y(r.y), stroke: r.color, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, svg);
      var tx = el('text', { x: W - pr, y: Y(r.y) - 5, 'text-anchor': 'end', style: 'fill:' + r.color + ';font-weight:700' }, svg); tx.textContent = r.label;
    });
    o.series.forEach(function (s) {
      var d = '', started = false, first = null, last = null;
      s.values.forEach(function (v, i) {
        if (v == null) return;
        var x = X(i), y = Y(v);
        if (!started) { d += 'M' + x + ',' + y; started = true; first = x; }
        else if (s.step) d += 'H' + x + 'V' + y; else d += 'L' + x + ',' + y;
        last = x;
      });
      if (!started) return;
      if (s.area) {
        var gid = 'g' + Math.random().toString(36).slice(2, 8);
        var defs = el('defs', {}, svg), lg = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.28 }, lg);
        el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0.02 }, lg);
        el('path', { d: d + 'V' + Y(Math.max(mn, 0)) + 'H' + first + 'Z', fill: 'url(#' + gid + ')' }, svg);
      }
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || null }, svg);
    });
    (o.markers || []).forEach(function (m) {
      var s = o.series[m.s || 0], v = s.values[m.i]; if (v == null) return;
      el('circle', { cx: X(m.i), cy: Y(v), r: 5, fill: m.color || s.color, stroke: 'var(--surface)', 'stroke-width': 2 }, svg);
      if (m.label) { var tx = el('text', { x: Math.min(Math.max(X(m.i), pl + 30), W - 40), y: Y(v) + (m.below ? 18 : -10), 'text-anchor': 'middle', style: 'font-weight:700;fill:' + (m.color || s.color) }, svg); tx.textContent = m.label; }
    });
    var every = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    for (var i = 0; i < n; i += every) { var lx = el('text', { x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : 'middle' }, svg); lx.textContent = o.xfmt ? o.xfmt(o.labels[i], i) : o.labels[i]; }
    var cross = el('line', { y1: pt, y2: pt + ih, stroke: 'var(--ink-3)', 'stroke-width': 1, opacity: 0 }, svg);
    var dots = o.series.map(function (s) { return el('circle', { r: 4, fill: s.color, stroke: 'var(--surface)', 'stroke-width': 2, opacity: 0 }, svg); });
    var hit = el('rect', { x: pl, y: pt, width: iw, height: ih, fill: 'transparent' }, svg);
    hit.addEventListener('pointermove', function (ev) {
      var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
      var i = Math.max(0, Math.min(n - 1, Math.round((x - pl) / (iw / Math.max(1, n - 1)))));
      cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
      var h = '<b>' + (o.tipLabel ? o.tipLabel(o.labels[i], i) : o.labels[i]) + '</b>';
      o.series.forEach(function (s, j) {
        var v = s.values[i];
        if (v == null) { dots[j].setAttribute('opacity', 0); return; }
        dots[j].setAttribute('cx', X(i)); dots[j].setAttribute('cy', Y(v)); dots[j].setAttribute('opacity', 1);
        h += '<br><span style="color:' + s.color + '">●</span> ' + s.name + ' : ' + o.fmt(v);
      });
      if (o.extraTip) h += o.extraTip(i);
      showTip(h, ev.clientX, ev.clientY);
    });
    hit.addEventListener('pointerleave', function () { hideTip(); cross.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); });
    return svg;
  }

  /** Anneau. items:[{label,value,color}] */
  function donut(host, o) {
    host.innerHTML = '';
    var S = o.size || 150, R = S / 2 - 4, r = R - (o.thick || 20), cx = S / 2, cy = S / 2;
    var tot = o.items.reduce(function (a, b) { return a + Math.max(0, b.value); }, 0) || 1;
    var svg = el('svg', { viewBox: '0 0 ' + S + ' ' + S, width: S, height: S, class: 'chart', role: 'img', 'aria-label': o.aria || 'Répartition' }, host);
    var a0 = -Math.PI / 2, gapA = o.items.length > 1 ? 0.018 : 0;
    o.items.forEach(function (it) {
      var v = Math.max(0, it.value); if (!v) return;
      var a1 = a0 + v / tot * Math.PI * 2, s0 = a0 + gapA / 2, s1 = Math.max(s0 + 0.001, a1 - gapA / 2);
      var large = s1 - s0 > Math.PI ? 1 : 0;
      var d = 'M' + (cx + R * Math.cos(s0)) + ',' + (cy + R * Math.sin(s0)) + 'A' + R + ',' + R + ' 0 ' + large + ' 1 ' + (cx + R * Math.cos(s1)) + ',' + (cy + R * Math.sin(s1)) +
        'L' + (cx + r * Math.cos(s1)) + ',' + (cy + r * Math.sin(s1)) + 'A' + r + ',' + r + ' 0 ' + large + ' 0 ' + (cx + r * Math.cos(s0)) + ',' + (cy + r * Math.sin(s0)) + 'Z';
      var p = el('path', { d: d, fill: it.color }, svg);
      p.addEventListener('pointermove', function (ev) { showTip('<b>' + it.label + '</b><br>' + o.fmt(it.value) + ' · ' + Math.round(v / tot * 100) + ' %', ev.clientX, ev.clientY); });
      p.addEventListener('pointerleave', hideTip);
      if (o.onClick) p.addEventListener('click', function () { o.onClick(it); });
      a0 = a1;
    });
    if (o.center) {
      var t1 = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', style: 'font-size:17px;font-weight:800;fill:var(--ink)' }, svg); t1.textContent = o.center[0];
      var t2 = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', style: 'font-size:11px' }, svg); t2.textContent = o.center[1];
    }
    return svg;
  }

  /** Mini-courbe (chaîne SVG). */
  function spark(values, color, w, h) {
    w = w || 120; h = h || 34;
    var v = values.filter(function (x) { return x != null; });
    if (v.length < 2) return '';
    var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v), n = values.length, d = '';
    values.forEach(function (x, i) { if (x == null) return; var X = i / (n - 1) * (w - 4) + 2, Y = h - 3 - (x - mn) / (mx - mn || 1) * (h - 6); d += (d ? 'L' : 'M') + X.toFixed(1) + ',' + Y.toFixed(1); });
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  /** Anneau de progression (chaîne SVG). */
  function ring(pct, color, size) {
    size = size || 64; var r = size / 2 - 5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct || 0));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-2)" stroke-width="7"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (c * p).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/></svg>';
  }
  /** Jauge demi-cercle (chaîne SVG) avec seuil. */
  function gauge(value, max, threshold, color) {
    var W = 200, H = 112, cx = 100, cy = 100, R = 86, p = Math.max(0, Math.min(1, value / max));
    function pt(f, rr) { var a = Math.PI * (1 - f); return (cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy - rr * Math.sin(a)).toFixed(1); }
    var th = Math.max(0, Math.min(1, threshold / max));
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:240px" aria-hidden="true">' +
      '<path d="M' + pt(0, R) + 'A' + R + ',' + R + ' 0 0 1 ' + pt(1, R) + '" fill="none" stroke="var(--surface-2)" stroke-width="16" stroke-linecap="round"/>' +
      (p > 0 ? '<path d="M' + pt(0, R) + 'A' + R + ',' + R + ' 0 0 1 ' + pt(p, R) + '" fill="none" stroke="' + color + '" stroke-width="16" stroke-linecap="round"/>' : '') +
      '<line x1="' + pt(th, R - 14).split(',')[0] + '" y1="' + pt(th, R - 14).split(',')[1] + '" x2="' + pt(th, R + 14).split(',')[0] + '" y2="' + pt(th, R + 14).split(',')[1] + '" stroke="var(--ink)" stroke-width="3"/>' +
      '</svg>';
  }
  return { bars: bars, line: line, donut: donut, spark: spark, ring: ring, gauge: gauge, hideTip: hideTip, kfmt: kfmt };
})();
