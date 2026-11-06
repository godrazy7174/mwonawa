/* 하늘봐 — 모두가 같은 하늘을 보는 곳.
   해·달·별은 실제 서울 하늘 위치를 계산해서 그린다. 해와 달 계산은 SunCalc(https://github.com/mourner/suncalc)의 공식을 옮겼고,
   그 저작권 고지와 사용 조건은 이 주석 끝에 그대로 붙여 두었다.
   고래·용·봉황과 명절 장면은 날짜와 시각만으로 정해지는 일정이라, 같은 순간 이 페이지를 연 사람은 모두 같은 장면을 본다.
   서버는 없다. 페이지 응답의 Date 헤더로 기기 시계가 크게 틀렸을 때만 보정한다.

   SunCalc license:
   Copyright (c) 2026, Volodymyr Agafonkin
   All rights reserved.

   Redistribution and use in source and binary forms, with or without modification, are
   permitted provided that the following conditions are met:

      1. Redistributions of source code must retain the above copyright notice, this list of
         conditions and the following disclaimer.

      2. Redistributions in binary form must reproduce the above copyright notice, this list
         of conditions and the following disclaimer in the documentation and/or other materials
         provided with the distribution.

   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
   EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
   MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
   COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
   EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
   SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
   HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
   TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
   SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
(function () {
  "use strict";
  var W = window, D = document;
  var reduced = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var LAT = 37.5665, LNG = 126.978;
  var DATA = W.HANEUL || { holidays: {}, showers: [] };
  var SALT = "haneulbwa-1";

  /* ---------- utils ---------- */
  function $(s, r) { return (r || D).querySelector(s); }
  function fnv(str) { var h = 0x811c9dc5; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) {
    var s = seed >>> 0;
    return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function wrap180(d) { return ((d + 180) % 360 + 360) % 360 - 180; }
  function hex(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mixc(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function css(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + (a == null ? 1 : a) + ")"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- time ---------- */
  var OFFSET = 0, KST = 9 * 3600e3, DAY = 864e5;
  function now() { return Date.now() + OFFSET; }
  function syncClock() {
    if (!W.fetch) return;
    var t0 = Date.now();
    fetch(location.pathname, { method: "HEAD", cache: "no-store" }).then(function (r) {
      var t1 = Date.now(), dh = r.headers.get("Date"), srv = dh ? Date.parse(dh) : NaN;
      if (!isNaN(srv)) { var est = srv + 500 - (t0 + t1) / 2; if (Math.abs(est) > 1500) OFFSET = est; }
    }).catch(function () { /* offline: device clock */ });
  }
  function kst(t) { var d = new Date(t + KST); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: d.getUTCDay() }; }
  function day0(t) { var d = new Date(t + KST); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - KST; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function ymdStr(t) { var k = kst(t); return k.y + "-" + pad(k.m) + "-" + pad(k.d); }
  function hm(t) { var k = kst(t); return pad(k.h) + ":" + pad(k.mi); }
  function hms(t) { var k = kst(t); return pad(k.h) + ":" + pad(k.mi) + ":" + pad(k.s); }
  function dateKo(t) { var k = kst(t); return k.m + "월 " + k.d + "일"; }

  /* ---------- astronomy (SunCalc) ---------- */
  var rad = Math.PI / 180, J1970 = 2440588, J2000 = 2451545, OBL = rad * 23.4397;
  function toDays(ms) { return ms / DAY - 0.5 + J1970 - J2000; }
  function rightAscension(l, b) { return Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l)); }
  function declination(l, b) { return Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l)); }
  function azimuthOf(H, phi, dec) { return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); }
  function altitudeOf(H, phi, dec) { return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)); }
  function sidereal(d, lw) { return rad * (280.16 + 360.9856235 * d) - lw; }
  function sunCoords(d) {
    var M = rad * (357.5291 + 0.98560028 * d);
    var L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
  }
  function moonCoords(d) {
    var L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    var l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function refraction(h) { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); }
  function toAltAz(H, dec) {
    var phi = rad * LAT;
    return { alt: altitudeOf(H, phi, dec) / rad, az: ((azimuthOf(H, phi, dec) / rad + 180) % 360 + 360) % 360 };
  }
  function sunPos(t) { var d = toDays(t), c = sunCoords(d); return toAltAz(sidereal(d, rad * -LNG) - c.ra, c.dec); }
  function moonPos(t) {
    var d = toDays(t), c = moonCoords(d), H = sidereal(d, rad * -LNG) - c.ra, p = toAltAz(H, c.dec), phi = rad * LAT;
    p.alt += refraction(p.alt * rad) / rad;
    p.pa = Math.atan2(Math.sin(H), Math.tan(phi) * Math.cos(c.dec) - Math.sin(c.dec) * Math.cos(H));
    return p;
  }
  function moonIllum(t) {
    var d = toDays(t), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    var phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    var inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    var angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI, angle: angle };
  }
  function starPos(raH, decD, t) { var d = toDays(t); return toAltAz(sidereal(d, rad * -LNG) - raH * 15 * rad, decD * rad); }
  function crossings(t0, fn, h0) {
    var res = { rise: null, set: null }, step = 120e3, prev = fn(t0).alt - h0;
    for (var t = t0 + step; t <= t0 + DAY; t += step) {
      var cur = fn(t).alt - h0;
      if (prev < 0 && cur >= 0 && res.rise === null) res.rise = t - step * cur / (cur - prev);
      if (prev >= 0 && cur < 0 && res.set === null) res.set = t - step * cur / (cur - prev);
      prev = cur;
    }
    return res;
  }
  function phaseName(p) {
    if (p < 0.03 || p >= 0.97) return "삭";
    if (p < 0.22) return "초승달"; if (p < 0.28) return "상현달"; if (p < 0.47) return "차오르는 달";
    if (p < 0.53) return "보름달"; if (p < 0.72) return "기우는 달"; if (p < 0.78) return "하현달";
    return "그믐달";
  }

  /* 밝은 별 (J2000, 적경 시간, 적위 도) */
  var NAMED = [
    ["북극성", 2.530, 89.264, 2.0], ["두베", 11.062, 61.751, 1.8], ["메라크", 11.031, 56.383, 2.3], ["페크다", 11.897, 53.695, 2.4],
    ["메그레즈", 12.257, 57.033, 3.3], ["알리오트", 12.900, 55.960, 1.8], ["미자르", 13.399, 54.925, 2.2], ["알카이드", 13.792, 49.313, 1.9],
    ["직녀성", 18.616, 38.784, 0.0], ["견우성", 19.846, 8.868, 0.8], ["데네브", 20.691, 45.280, 1.3],
    ["베텔게우스", 5.919, 7.407, 0.5], ["리겔", 5.242, -8.202, 0.1], ["벨라트릭스", 5.419, 6.350, 1.6], ["사이프", 5.796, -9.670, 2.1],
    ["알니탁", 5.679, -1.943, 1.8], ["알닐람", 5.604, -1.202, 1.7], ["민타카", 5.533, -0.299, 2.2], ["시리우스", 6.753, -16.716, -1.4],
    ["쉐다르", 0.675, 56.537, 2.2], ["카프", 0.153, 59.150, 2.3], ["나비", 0.945, 60.717, 2.4], ["루크바", 1.430, 60.235, 2.7], ["세긴", 1.907, 63.670, 3.4],
    ["아르크투루스", 14.261, 19.182, -0.1], ["스피카", 13.420, -11.161, 1.0], ["안타레스", 16.490, -26.432, 1.0], ["알데바란", 4.599, 16.509, 0.9],
    ["카펠라", 5.278, 45.998, 0.1], ["프로키온", 7.655, 5.225, 0.4], ["폴룩스", 7.755, 28.026, 1.1], ["레굴루스", 10.140, 11.967, 1.4]
  ];
  var STARS = (function () {
    var r = rng(fnv("stars")), list = NAMED.map(function (s) { return { ra: s[1], dec: s[2], mag: s[3], name: s[0], tw: r() * 6.28 }; });
    for (var i = 0; i < 720; i++) {
      var ra = r() * 24, dec = Math.asin(r() * 2 - 1) / rad;
      list.push({ ra: ra, dec: dec, mag: 3.0 + Math.pow(r(), 0.7) * 2.6, tw: r() * 6.28 });
    }
    for (var p = 0; p < 6; p++) list.push({ ra: 3.79 + (r() - 0.5) * 0.12, dec: 24.12 + (r() - 0.5) * 1.2, mag: 3.6 + r() * 0.8, tw: r() * 6.28 });
    return list;
  })();
  /* 은하 좌표(l, b)를 적경·적위로 */
  function galToEq(lDeg, bDeg) {
    var aN = 192.85948 * rad, dN = 27.12825 * rad, lN = 122.93192 * rad, L = lDeg * rad, B = bDeg * rad;
    var dec = Math.asin(Math.sin(dN) * Math.sin(B) + Math.cos(dN) * Math.cos(B) * Math.cos(lN - L));
    var ra = aN + Math.atan2(Math.cos(B) * Math.sin(lN - L), Math.cos(dN) * Math.sin(B) - Math.sin(dN) * Math.cos(B) * Math.cos(lN - L));
    return { ra: (((ra / rad) % 360 + 360) % 360) / 15, dec: dec / rad };
  }
  var GAL = (function () {
    var pts = [];
    for (var l = 0; l < 360; l += 3) { var q = galToEq(l, 0), cl = Math.cos(l * rad * 0.5); q.w = 6 + 7 * cl * cl; pts.push(q); }
    return pts;
  })();
  var GALBLOBS = (function () {
    var r = rng(fnv("galblobs")), out = [];
    while (out.length < 230) {
      var l = r() * 360, cl = Math.cos(l * rad * 0.5);
      if (r() > 0.35 + 0.65 * cl * cl) continue;
      var g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
      var q = galToEq(l, g * 2.6); q.s = 3.5 + r() * 5 + 3 * cl * cl; q.a = 0.05 + r() * 0.09; out.push(q);
    }
    return out;
  })();
  var BLOB = null;
  function blobSprite() {
    if (BLOB) return BLOB;
    var cn = D.createElement("canvas"); cn.width = cn.height = 64;
    var g = cn.getContext("2d"), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, "rgba(206,215,255,1)"); rg.addColorStop(0.4, "rgba(206,215,255,0.5)"); rg.addColorStop(1, "rgba(206,215,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64); BLOB = cn; return cn;
  }
  var GALSTARS = (function () {
    var r = rng(fnv("galstars")), out = [];
    while (out.length < 320) {
      var l = r() * 360, cl = Math.cos(l * rad * 0.5);
      if (r() > 0.45 + 0.55 * cl * cl) continue;
      var g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
      var q = galToEq(l, g * 3.6); q.m = r(); out.push(q);
    }
    return out;
  })();

  /* ---------- schedule ---------- */
  function keyOf(t) { var k = kst(t); return k.y * 10000 + k.m * 100 + k.d; }
  var memo = {};
  function cached(key, fn) { if (!(key in memo)) { if (Object.keys(memo).length > 400) memo = {}; memo[key] = fn(); } return memo[key]; }
  function copy(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
  function whaleOn(d0) {
    return copy(cached("w" + d0, function () {
      var h = fnv(SALT + ":whale:" + keyOf(d0 + 3600e3));
      var startMin = 6 * 60 + (h % (18 * 60 - 5));
      var start = d0 + startMin * 60e3, dir = ((h >>> 17) & 1) ? 1 : -1;
      /* 남쪽 하늘을 동에서 서로, 또는 서에서 동으로 가로지른다 */
      return { id: "whale", start: start, end: start + 240e3, az0: (dir > 0 ? 80 : 195) + (h >>> 9) % 86, dir: dir, span: 115, alt: 23 + (h >>> 20) % 17, hintFrom: start - ((h >>> 5) % 180) * 60e3 };
    }));
  }
  var MON0 = Date.UTC(2026, 0, 5) - KST;
  function dragonOfWeek(w) {
    return copy(cached("d" + w, function () {
      var h = fnv(SALT + ":dragon:" + w), d0 = MON0 + w * 7 * DAY + (h % 7) * DAY;
      var start = d0 + (19 * 60 + (h >>> 4) % (5 * 60 - 4)) * 60e3;
      /* 청룡은 동쪽을 지키는 신이라 늘 동쪽에서 나와 남쪽으로 간다 */
      return { id: "dragon", start: start, end: start + 180e3, az0: 55 + (h >>> 11) % 60, dir: 1, span: 110, alt: 30 + (h >>> 22) % 14 };
    }));
  }
  function dragonNear(t) {
    var w = Math.floor((t - MON0) / (7 * DAY));
    return [dragonOfWeek(w - 1), dragonOfWeek(w), dragonOfWeek(w + 1)];
  }
  function phoenixOfMonth(y, m) {
    return copy(cached("p" + y + "-" + m, function () {
      var h = fnv(SALT + ":phoenix:" + y + "-" + m), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      var d0 = Date.UTC(y, m - 1, 1 + h % days) - KST;
      var ss = crossings(d0, sunPos, -0.833).set || (d0 + 18 * 3600e3);
      var start = ss - 25 * 60e3 + ((h >>> 8) % 30) * 60e3;
      return { id: "phoenix", start: start, end: start + 150e3, az0: 230 + (h >>> 13) % 50, dir: -1, span: 95, alt: 16 + (h >>> 21) % 10 };
    }));
  }
  function phoenixNear(t) {
    var k = kst(t), list = [], ym = [[k.y, k.m - 1], [k.y, k.m], [k.y, k.m + 1]];
    ym.forEach(function (p) { var y = p[0], m = p[1]; if (m < 1) { y--; m = 12; } if (m > 12) { y++; m = 1; } list.push(phoenixOfMonth(y, m)); });
    return list;
  }
  function holidayOf(t) {
    var s = ymdStr(t), H = DATA.holidays || {};
    for (var key in H) if (H[key] === s) return key.split(":")[1];
    return null;
  }
  function specialsAround(t) {
    var out = [], d0 = day0(t);
    [d0 - DAY, d0].forEach(function (d) {
      var hk = holidayOf(d + 3600e3), k = kst(d + 3600e3);
      if (hk === "seollal") out.push({ id: "kites", name: "방패연", start: d + 9 * 3600e3, end: d + 17 * 3600e3 });
      if (hk === "boreum") out.push({ id: "lanterns", name: "소원 등불", start: d + 19 * 3600e3, end: d + 23 * 3600e3 });
      if (hk === "chilseok") out.push({ id: "bridge", name: "오작교", start: d + 21 * 3600e3, end: d + 24 * 3600e3 });
      if (hk === "chuseok") out.push({ id: "rabbit", name: "달토끼", start: d + 17 * 3600e3, end: d + 30 * 3600e3 });
      if (k.m === 1 && k.d === 1) out.push({ id: "fireworks", name: "새해 불꽃", start: d, end: d + 600e3 });
    });
    return out;
  }
  function showerRate(t) {
    var k = kst(t), best = 1, nm = "";
    (DATA.showers || []).forEach(function (s) {
      var peak = Date.UTC(k.y, s[0] - 1, s[1]) - KST + 18 * 3600e3;
      [-DAY, 0, DAY].forEach(function (o) {
        var c = peak + o;
        if (t >= c && t < c + 12 * 3600e3) { var r = o === 0 ? s[3] : 1 + (s[3] - 1) * 0.4; if (r > best) { best = r; nm = s[2]; } }
      });
    });
    return { rate: best, name: nm };
  }
  function bigEvents(t) {
    var d0 = day0(t), list = [whaleOn(d0 - DAY), whaleOn(d0), whaleOn(d0 + DAY)].concat(dragonNear(t), phoenixNear(t), specialsAround(t));
    return list;
  }
  function isBeing(e) { return e.id === "whale" || e.id === "dragon" || e.id === "phoenix"; }
  /* 지나가는 존재의 지금 자리 (방위각, 고도) */
  function beingPos(e, t) {
    var p = clamp((t - e.start) / (e.end - e.start), 0, 1);
    return { az: ((e.az0 + e.dir * e.span * p) % 360 + 360) % 360, alt: e.alt + Math.sin(p * Math.PI) * 6 + Math.sin(t / 1000 * 0.6) * 0.8 };
  }
  function activeAt(t) { return bigEvents(t).filter(function (e) { return t >= e.start && t < e.end; }); }
  function approaching(t, lead) { return bigEvents(t).filter(function (e) { return isBeing(e) && t >= e.start - lead && t < e.start; }); }

  /* ---------- weather (정해진 날씨) ---------- */
  function weatherAt(t) {
    if (DATA.clear) return { cover: 0.16, kind: "", wind: 1 };
    var festive = specialsAround(t).some(function (e) { return t >= e.start && t < e.end; });
    var k = kst(t), dk = keyOf(t), h = fnv(SALT + ":wx:" + dk), r = rng(h);
    var base = 0.12 + r() * 0.55, wet = r() * 100, wetStart = 6 + Math.floor(r() * 14), wetLen = 2 + Math.floor(r() * 4);
    var winter = k.m === 12 || k.m <= 2, kind = "";
    if (wet < (winter ? 16 : 13) && k.h >= wetStart && k.h < wetStart + wetLen) kind = winter ? "snow" : "rain";
    var hour = k.h + k.mi / 60, wob = 0.18 * Math.sin(hour * 0.9 + (h % 7));
    var cover = clamp(base + wob, 0.05, 0.95);
    if (kind) cover = 0.92;
    if (festive) { kind = ""; cover = Math.min(cover, 0.2); }
    return { cover: cover, kind: kind, wind: 0.9 + ((h >>> 9) % 10) / 10 };
  }

  /* ---------- world: skyline (방향마다 고정) ---------- */
  var BLD = (function () {
    var r = rng(fnv("skyline-seoul")), list = [], az = 0, n = 101;
    while (az < 360) {
      var p = r(), w, h, type;
      if (p < 0.42) { type = "apt"; w = 3 + r() * 3.5; h = 5 + r() * 6.5; }
      else if (p < 0.78) { type = "low"; w = 1.6 + r() * 3; h = 1.4 + r() * 2.8; }
      else if (p < 0.92) { type = "house"; w = 1.6 + r() * 2.2; h = 1.1 + r() * 1.4; }
      else { type = "tower"; w = 1.2 + r() * 1.4; h = 7 + r() * 5; }
      var b = { az: az, w: w, h: h, type: type, seed: Math.floor(r() * 1e9), tank: r() < 0.35, ant: r() < 0.22, num: type === "apt" ? n++ : 0 };
      list.push(b); az += w + (r() < 0.25 ? 0.4 + r() * 1.6 : 0.15);
    }
    list[Math.floor(list.length * 0.37)].cross = true;
    list[Math.floor(list.length * 0.81)].cross = true;
    return list;
  })();
  var BLD2 = (function () {
    var r = rng(fnv("skyline-far")), list = [], az = 0;
    while (az < 360) { var w = 1.4 + r() * 3.4; list.push({ az: az, w: w, h: 2.4 + r() * 5.5 + (r() < 0.12 ? 4 : 0), seed: Math.floor(r() * 1e9) }); az += w + (r() < 0.3 ? 0.3 + r() * 1.2 : 0.1); }
    return list;
  })();
  function ridge(az) {
    /* 북쪽(300°~60°)에는 높은 산, 남쪽에는 낮은 산 */
    var nAz = wrap180(az - 0), north = Math.max(0, 1 - Math.abs(nAz) / 75);
    var s = 2.2 + 1.2 * Math.sin(az * rad * 3.1) + 0.8 * Math.sin(az * rad * 7.3 + 1) + 0.4 * Math.sin(az * rad * 17);
    return s * (0.5 + north * 1.4) + north * 3.2;
  }

  /* ---------- view ---------- */
  var cv, cx2, Wd = 0, Ht = 0, ppd = 7, camAz = 180, camAlt = 0, follow = true, lastTouch = 0, dpr = 1, SPAN = 80;
  function resize() {
    var box = cv.getBoundingClientRect();
    dpr = Math.min(W.devicePixelRatio || 1, 2);
    Wd = box.width; Ht = box.height;
    cv.width = Math.round(Wd * dpr); cv.height = Math.round(Ht * dpr);
    cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
    ppd = Ht / SPAN;
    if (Wd && Ht) { try { frame(); } catch (e) { /* 다음 프레임에서 다시 그린다 */ } }
  }
  function altBase() { return -5 + camAlt; }
  function X(az) { return Wd / 2 + wrap180(az - camAz) * ppd; }
  function Y(alt) { return Ht - (alt - altBase()) * ppd; }
  function inView(az, marginDeg) { return Math.abs(wrap180(az - camAz)) < Wd / ppd / 2 + (marginDeg || 0); }
  function dirName(az) {
    var names = ["북쪽", "북동쪽", "동쪽", "남동쪽", "남쪽", "남서쪽", "서쪽", "북서쪽"];
    return names[Math.round(((az % 360) + 360) % 360 / 45) % 8];
  }
  /* 화면이 좁아도 한눈에 들어오는 크기 */
  function beingSize(id) {
    var k = DATA.scale || 1;
    if (id === "whale") return Math.min(Wd * 0.72, 30 * ppd) * k;
    if (id === "dragon") return Math.min(Wd * 0.92, 38 * ppd) * k;
    return Math.min(Wd * 0.3, 11 * ppd) * k;
  }
  /* 받침 있는 낱말 뒤 조사 */
  function jong(w) { var c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c <= 11171 && c % 28 !== 0; }
  function iga(w) { return w + (jong(w) ? "이" : "가"); }
  function eunneun(w) { return w + (jong(w) ? "은" : "는"); }

  /* ---------- sky colors ---------- */
  var SKYC = [
    [-90, "#060B1E", "#141B3F"], [-14, "#070D24", "#1E2A55"], [-8, "#16224A", "#4A4C86"], [-3, "#2D3D78", "#B36A86"],
    [0, "#4B65A6", "#F2946B"], [4, "#5F8DD0", "#F7C48A"], [10, "#4A8BD6", "#B9DDF6"], [90, "#3B7FCF", "#A9D2F3"]
  ];
  function skyColors(sunAlt) {
    for (var i = 0; i < SKYC.length - 1; i++) {
      var a = SKYC[i], b = SKYC[i + 1];
      if (sunAlt >= a[0] && sunAlt < b[0]) { var t = (sunAlt - a[0]) / (b[0] - a[0]); return [mixc(hex(a[1]), hex(b[1]), t), mixc(hex(a[2]), hex(b[2]), t)]; }
    }
    return [hex(SKYC[SKYC.length - 1][1]), hex(SKYC[SKYC.length - 1][2])];
  }
  function themeOf(sunAlt) { return sunAlt > 6 ? "day" : sunAlt > -6 ? "dusk" : "night"; }

  /* ---------- drawing helpers ---------- */
  function paper(c, fill, blur) {
    c.shadowColor = "rgba(0,0,0,0.28)"; c.shadowBlur = blur == null ? 9 : blur; c.shadowOffsetY = 3;
    c.fillStyle = fill; c.fill();
    c.shadowColor = "transparent"; c.shadowBlur = 0; c.shadowOffsetY = 0;
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

  /* 고래: 머리가 +x 쪽, 길이 100 단위 */
  function drawWhale(c, x, y, len, t, dir, night, glow) {
    c.save(); c.translate(x, y); c.scale(dir * len / 100, len / 100);
    var top = [], bot = [], N = 26, sw = Math.sin(t * 1.5);
    for (var i = 0; i <= N; i++) {
      var s = i / N, xx = -50 + s * 100;
      var th = 14.5 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 0.85) + 1.3;
      var wv = Math.sin(t * 1.5 - s * 3) * 3.4 * Math.pow(1 - s, 1.7);
      top.push([xx, -th * 0.82 + wv]); bot.push([xx, th * (0.95 + (s > 0.55 ? (s - 0.55) * 0.5 : 0)) + wv]);
    }
    var ty = Math.sin(t * 1.5) * 3.4;
    /* flukes */
    c.beginPath(); c.moveTo(-48, ty); c.quadraticCurveTo(-60, ty - 14 + sw * 3, -68, ty - 13 + sw * 4); c.quadraticCurveTo(-60, ty - 4, -55, ty);
    c.quadraticCurveTo(-60, ty + 4, -68, ty + 13 + sw * 4); c.quadraticCurveTo(-60, ty + 14 + sw * 3, -48, ty); c.closePath();
    paper(c, night ? "#203352" : "#2B4A70");
    /* body */
    c.beginPath(); c.moveTo(top[0][0], top[0][1]);
    for (var a = 1; a <= N; a++) c.lineTo(top[a][0], top[a][1]);
    c.quadraticCurveTo(55, (top[N][1] + bot[N][1]) / 2 - 2, bot[N][0], bot[N][1]);
    for (var b = N - 1; b >= 0; b--) c.lineTo(bot[b][0], bot[b][1]);
    c.closePath();
    var body = night ? "#24395A" : "#2F5179";
    paper(c, body, 12);
    c.save(); c.clip();
    c.fillStyle = night ? "#6E8BAA" : "#A9C3D6";
    c.beginPath(); c.moveTo(-50, 4); c.bezierCurveTo(-10, 2, 20, 4, 60, 2); c.lineTo(60, 30); c.lineTo(-50, 30); c.closePath(); c.fill();
    c.strokeStyle = night ? "rgba(36,57,90,0.7)" : "rgba(47,81,121,0.55)"; c.lineWidth = 0.9;
    for (var g = 0; g < 5; g++) { c.beginPath(); c.moveTo(47, 6 + g * 1.7); c.quadraticCurveTo(28, 9 + g * 1.9, 4, 10 + g * 1.6); c.stroke(); }
    c.restore();
    /* pectoral fin */
    c.save(); c.translate(16, 8); c.rotate((-8 + Math.sin(t * 1.5 + 1) * 9) * rad);
    c.beginPath(); c.moveTo(2, -1); c.bezierCurveTo(-6, 9, -17, 19, -29, 24); c.bezierCurveTo(-24, 15, -14, 6, 6, 3); c.closePath();
    paper(c, night ? "#2B4466" : "#36608C", 6);
    c.restore();
    /* eye & mouth */
    c.fillStyle = "#0E1726"; circle(c, 34, 1.5, 1.5); c.fill();
    c.fillStyle = "rgba(255,255,255,0.8)"; circle(c, 33.6, 1, 0.5); c.fill();
    c.strokeStyle = "rgba(14,23,38,0.6)"; c.lineWidth = 0.8; c.beginPath(); c.moveTo(49, 4); c.quadraticCurveTo(40, 7, 28, 6.5); c.stroke();
    if (night || glow) {
      c.shadowColor = "#9FE7FF"; c.shadowBlur = 8; c.fillStyle = "#BDF2FF";
      for (var k = 0; k < 9; k++) { circle(c, -30 + k * 8, -4 + Math.sin(k * 1.7) * 3 + Math.sin(t * 1.5 - k * 0.3) * 1.2, 0.9); c.fill(); }
      c.shadowBlur = 0; c.shadowColor = "transparent";
    }
    c.restore();
  }

  /* 청룡: 등뼈를 따라 몸통을 만든다. head가 +x 쪽 */
  function drawDragon(c, x, y, len, t, dir) {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    var N = 40, sp = [], L = len;
    for (var i = 0; i <= N; i++) {
      var s = i / N;
      sp.push([-L / 2 + s * L, Math.sin(s * 9.5 - t * 2.2) * L * 0.07 * (0.4 + s * 0.6)]);
    }
    var wid = function (s) { return L * (0.018 + 0.032 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.6)); };
    var upper = [], lower = [];
    for (var j = 0; j <= N; j++) {
      var p = sp[j], q = sp[Math.min(N, j + 1)], o = sp[Math.max(0, j - 1)];
      var dx = q[0] - o[0], dy = q[1] - o[1], ln = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / ln, ny = dx / ln, w = wid(j / N);
      upper.push([p[0] + nx * w, p[1] + ny * w, nx, ny]); lower.push([p[0] - nx * w, p[1] - ny * w]);
    }
    /* back spikes */
    c.fillStyle = "#E8A33D";
    for (var k = 4; k < N - 3; k += 2) {
      var u = upper[k], w2 = wid(k / N);
      c.beginPath(); c.moveTo(u[0] - 3, u[1]); c.lineTo(u[0] + u[2] * w2 * 1.1, u[1] + u[3] * w2 * 1.1); c.lineTo(u[0] + 3, u[1]); c.closePath(); c.fill();
    }
    /* legs */
    [0.22, 0.38, 0.6, 0.74].forEach(function (s, idx) {
      var j2 = Math.round(s * N), lp = lower[j2], ph = Math.sin(t * 3 + idx) * 4;
      c.strokeStyle = "#2E7D8C"; c.lineWidth = L * 0.016; c.lineCap = "round";
      c.beginPath(); c.moveTo(lp[0], lp[1]); c.lineTo(lp[0] + ph - 4, lp[1] + L * 0.05); c.stroke();
      c.strokeStyle = "#F2C230"; c.lineWidth = L * 0.006;
      for (var cl = -1; cl <= 1; cl++) { c.beginPath(); c.moveTo(lp[0] + ph - 4, lp[1] + L * 0.05); c.lineTo(lp[0] + ph - 4 + cl * 3 + 2, lp[1] + L * 0.05 + 4); c.stroke(); }
    });
    /* body */
    c.beginPath(); c.moveTo(upper[0][0], upper[0][1]);
    for (var a = 1; a <= N; a++) c.lineTo(upper[a][0], upper[a][1]);
    for (var b = N; b >= 0; b--) c.lineTo(lower[b][0], lower[b][1]);
    c.closePath();
    paper(c, "#2E7D8C", 12);
    c.save(); c.clip();
    c.strokeStyle = "#D9E7C5"; c.lineWidth = L * 0.012;
    c.beginPath(); for (var m = 0; m <= N; m++) { var lw = lower[m], up = sp[m]; var xx = lerp(lw[0], up[0], 0.35), yy = lerp(lw[1], up[1], 0.35); if (m) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke();
    c.strokeStyle = "rgba(160,220,214,0.55)"; c.lineWidth = 1;
    for (var sc = 2; sc < N - 1; sc += 1) { var pp = sp[sc]; c.beginPath(); c.arc(pp[0], pp[1] - wid(sc / N) * 0.2, wid(sc / N) * 0.45, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    c.restore();
    /* head */
    var hd = sp[N], hx = hd[0] + L * 0.02, hy = hd[1];
    c.save(); c.translate(hx, hy);
    c.beginPath(); c.moveTo(-L * 0.02, -L * 0.035); c.quadraticCurveTo(L * 0.05, -L * 0.05, L * 0.085, -L * 0.012); c.quadraticCurveTo(L * 0.09, L * 0.012, L * 0.07, L * 0.02);
    c.quadraticCurveTo(L * 0.03, L * 0.04, -L * 0.02, L * 0.032); c.closePath();
    paper(c, "#2E7D8C", 8);
    /* mane */
    c.fillStyle = "#E8703D";
    for (var mn = 0; mn < 4; mn++) { c.beginPath(); c.moveTo(-L * 0.02 + mn * 3, -L * 0.03); c.quadraticCurveTo(-L * 0.06 - mn * 2, -L * 0.07 - mn * 2 + Math.sin(t * 4 + mn) * 2, -L * 0.07 - mn * 4, -L * 0.03 + mn); c.closePath(); c.fill(); }
    /* horns */
    c.strokeStyle = "#F3E3B5"; c.lineWidth = L * 0.008; c.lineCap = "round";
    c.beginPath(); c.moveTo(L * 0.01, -L * 0.038); c.lineTo(-L * 0.03, -L * 0.085); c.moveTo(-L * 0.012, -L * 0.064); c.lineTo(-L * 0.042, -L * 0.07); c.stroke();
    /* whiskers */
    c.strokeStyle = "#F2C230"; c.lineWidth = L * 0.004;
    c.beginPath(); c.moveTo(L * 0.07, 0); c.bezierCurveTo(L * 0.02, L * 0.06, -L * 0.06, L * 0.02 + Math.sin(t * 2) * 6, -L * 0.12, L * 0.07); c.stroke();
    c.beginPath(); c.moveTo(L * 0.075, -L * 0.006); c.bezierCurveTo(L * 0.03, -L * 0.07, -L * 0.04, -L * 0.03 + Math.sin(t * 2 + 1) * 6, -L * 0.1, -L * 0.08); c.stroke();
    /* eye */
    c.fillStyle = "#FFD84A"; circle(c, L * 0.035, -L * 0.018, L * 0.008); c.fill();
    c.fillStyle = "#111"; c.fillRect(L * 0.034, -L * 0.025, L * 0.003, L * 0.014);
    c.restore();
    /* 여의주 */
    var px = hx + L * 0.13, py = hy + Math.sin(t * 1.3) * L * 0.02;
    c.shadowColor = "#FFE9A8"; c.shadowBlur = 18; c.fillStyle = "#FFF3CF"; circle(c, px, py, L * 0.022); c.fill();
    c.shadowBlur = 0; c.shadowColor = "transparent";
    c.restore();
  }

  /* 봉황: 오방색 꼬리깃 */
  function drawPhoenix(c, x, y, size, t, dir) {
    c.save(); c.translate(x, y); c.scale(dir * size / 100, size / 100);
    var cols = ["#2B5DAE", "#D8322B", "#F2C230", "#F5F1E6", "#2A2A2A"];
    for (var i = 0; i < 5; i++) {
      var off = (i - 2) * 5, wv = Math.sin(t * 2.4 + i) * 8;
      c.strokeStyle = cols[i]; c.lineWidth = 4.5 - i * 0.3; c.lineCap = "round";
      c.beginPath(); c.moveTo(-10, 2 + off * 0.3); c.bezierCurveTo(-45, 10 + off + wv, -80, -6 + off * 1.6 - wv, -120 - i * 6, 8 + off * 2 + wv); c.stroke();
      c.fillStyle = cols[i]; c.beginPath(); c.ellipse(-122 - i * 6, 8 + off * 2 + wv, 6, 3.5, 0, 0, Math.PI * 2); c.fill();
    }
    var flap = Math.sin(t * 5) * 0.6;
    [1, -1].forEach(function (side) {
      c.save(); c.rotate(side * (0.15 + flap * 0.5));
      c.beginPath(); c.moveTo(0, -2); c.bezierCurveTo(-14, -30 * side - 10, -40, -44 * side, -52, -40 * side); c.bezierCurveTo(-38, -22 * side, -22, -12 * side, -6, 4); c.closePath();
      paper(c, side > 0 ? "#D8322B" : "#B8262A", 8);
      c.strokeStyle = "#F2C230"; c.lineWidth = 1.4;
      for (var f = 0; f < 4; f++) { c.beginPath(); c.moveTo(-10 - f * 9, -8 * side - f * 6 * side); c.lineTo(-18 - f * 9, -20 * side - f * 6 * side); c.stroke(); }
      c.restore();
    });
    c.beginPath(); c.ellipse(4, 0, 22, 10, -0.1, 0, Math.PI * 2); paper(c, "#D8322B", 8);
    c.beginPath(); c.ellipse(26, -8, 9, 8, 0, 0, Math.PI * 2); paper(c, "#F2C230", 6);
    c.fillStyle = "#E8703D"; c.beginPath(); c.moveTo(34, -9); c.lineTo(44, -6); c.lineTo(34, -4); c.closePath(); c.fill();
    c.fillStyle = "#111"; circle(c, 29, -10, 1.6); c.fill();
    c.strokeStyle = "#2B5DAE"; c.lineWidth = 2; c.lineCap = "round";
    for (var cr = 0; cr < 3; cr++) { c.beginPath(); c.moveTo(24, -15); c.quadraticCurveTo(20 - cr * 4, -28 - cr * 3, 14 - cr * 6, -26 - cr * 2); c.stroke(); }
    c.restore();
  }

  function drawMagpie(c, x, y, s, t, dir) {
    c.save(); c.translate(x, y); c.scale(dir * s, s);
    var f = Math.sin(t * 9);
    c.fillStyle = "#14161D";
    c.beginPath(); c.moveTo(-6, 0); c.lineTo(-20, 3); c.lineTo(-19, 6); c.lineTo(-5, 3); c.closePath(); c.fill();
    c.beginPath(); c.ellipse(0, 0, 7, 3.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(7, -1.5, 2.8, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#F5F5F5"; c.beginPath(); c.ellipse(0, 1.5, 4, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#14161D";
    c.beginPath(); c.moveTo(-2, -1); c.quadraticCurveTo(-6, -10 * f - 4, -14, -12 * f - 2); c.quadraticCurveTo(-6, -2, 2, 0); c.closePath(); c.fill();
    c.fillStyle = "#F5F5F5"; c.beginPath(); c.moveTo(-5, -3 * f - 2); c.lineTo(-9, -7 * f - 2); c.lineTo(-6, -2); c.closePath(); c.fill();
    c.restore();
  }

  function drawKite(c, x, y, s, t, i, groundY) {
    var cols = [["#D8322B", "#2B5DAE"], ["#2B5DAE", "#F2C230"], ["#2A2A2A", "#D8322B"], ["#F2C230", "#2B9C6A"], ["#9B59B6", "#F2C230"]][i % 5];
    var sway = Math.sin(t * 0.8 + i * 2) * 6;
    c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(x, y + s * 0.65); c.quadraticCurveTo(x + sway * 3 + 20, (y + groundY) / 2, x + 30 + i * 12, groundY); c.stroke();
    c.save(); c.translate(x, y); c.rotate((sway * 0.6) * rad);
    c.beginPath(); c.rect(-s / 2, -s * 0.65, s, s * 1.3); paper(c, "#FBF8F0", 6);
    c.fillStyle = cols[0]; c.fillRect(-s / 2, -s * 0.65, s, s * 0.12); c.fillRect(-s / 2, s * 0.53, s, s * 0.12);
    c.fillStyle = cols[1]; c.fillRect(-s / 2, -s * 0.65, s * 0.1, s * 1.3); c.fillRect(s * 0.4, -s * 0.65, s * 0.1, s * 1.3);
    c.fillStyle = cols[0]; circle(c, 0, -s * 0.36, s * 0.13); c.fill();
    c.globalCompositeOperation = "destination-out"; circle(c, 0, 0, s * 0.18); c.fill(); c.globalCompositeOperation = "source-over";
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 0.7; c.strokeRect(-s / 2, -s * 0.65, s, s * 1.3);
    c.restore();
  }

  function drawLantern(c, x, y, s, t, i) {
    var flick = 0.85 + 0.15 * Math.sin(t * 7 + i * 3);
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 0.9 + i) * 0.08);
    c.shadowColor = "rgba(255,170,60," + (0.9 * flick) + ")"; c.shadowBlur = 22;
    c.fillStyle = "rgba(255,196,110," + (0.92 * flick) + ")";
    c.beginPath(); c.moveTo(-s * 0.45, -s * 0.6); c.quadraticCurveTo(0, -s * 0.78, s * 0.45, -s * 0.6); c.lineTo(s * 0.36, s * 0.55); c.quadraticCurveTo(0, s * 0.68, -s * 0.36, s * 0.55); c.closePath(); c.fill();
    c.shadowBlur = 0; c.shadowColor = "transparent";
    c.fillStyle = "rgba(255,240,200," + flick + ")"; c.beginPath(); c.ellipse(0, s * 0.38, s * 0.12, s * 0.18, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* ---------- scene ---------- */
  var stateCache = { t: 0 };
  var hits = [];
  function frame() {
    var t = now(), tt = t / 1000;
    var sun = sunPos(t), moon = moonPos(t), ill = moonIllum(t), wx = weatherAt(t);
    var cols = skyColors(sun.alt), night = sun.alt < -6, dark = clamp((-sun.alt - 4) / 10, 0, 1);
    var c = cx2; hits = [];
    /* gradient */
    var g = c.createLinearGradient(0, 0, 0, Ht);
    g.addColorStop(0, css(cols[0])); g.addColorStop(1, css(cols[1]));
    c.fillStyle = g; c.fillRect(0, 0, Wd, Ht);
    if (sun.alt > -10 && sun.alt < 12 && inView(sun.az, 70)) {
      var gx = X(sun.az), gy = Y(Math.max(sun.alt, -2));
      var rg = c.createRadialGradient(gx, gy, 0, gx, gy, Ht * 0.7);
      rg.addColorStop(0, "rgba(255,190,120," + (0.45 * (1 - Math.abs(sun.alt) / 12)) + ")"); rg.addColorStop(1, "rgba(255,190,120,0)");
      c.fillStyle = rg; c.fillRect(0, 0, Wd, Ht);
    }
    var specials = activeAt(t), sp = {}; specials.forEach(function (e) { sp[e.id] = e; });
    var clearness = 1 - wx.cover * 0.85, starClear = 1 - wx.cover * 0.45;
    /* milky way & stars */
    if (dark > 0.05) {
      var mwA = sp.bridge ? 0 : dark * clearness;
      if (mwA > 0.05) drawMilkyWay(c, t, mwA);
      STARS.forEach(function (st) {
        if (sp.bridge && (st.name === "직녀성" || st.name === "견우성")) return;
        var p = starPos(st.ra, st.dec, t);
        if (p.alt < 0 || !inView(p.az, 2)) return;
        var b = clamp((6.2 - st.mag) / 5.4, 0.2, 1), tw = 0.78 + 0.22 * Math.sin(tt * 2 + st.tw);
        var a = Math.min(1, (0.25 + b * 0.85) * dark * tw * starClear * clamp(p.alt / 8, 0.3, 1));
        if (a < 0.05) return;
        var x = X(p.az), y = Y(p.alt), r = 0.55 + b * 1.6;
        if (st.mag < 1.6 && a > 0.3) { var gs = r * (st.mag < 0.5 ? 11 : 8); c.globalAlpha = a * 0.45; c.drawImage(blobSprite(), x - gs / 2, y - gs / 2, gs, gs); c.globalAlpha = 1; }
        c.fillStyle = "rgba(255,250,235," + a + ")"; circle(c, x, y, r); c.fill();
      });
    }
    /* sun */
    if (sun.alt > -1.5 && inView(sun.az, 4)) {
      var sx = X(sun.az), sy = Y(sun.alt), low = clamp(sun.alt / 10, 0, 1);
      c.shadowColor = "rgba(255,220,150,0.9)"; c.shadowBlur = 28;
      c.fillStyle = css(mixc([255, 150, 90], [255, 247, 220], low)); circle(c, sx, sy, 2.2 * ppd); c.fill();
      c.shadowBlur = 0; c.shadowColor = "transparent";
    }
    /* moon: 밝은 가장자리의 천정각(SunCalc angle - parallacticAngle, 반시계)으로 돌려 그린다 */
    var mr = (sp.rabbit ? 5.2 * (DATA.scale || 1) : 2.6) * ppd;
    if (moon.alt > -1.5 && inView(moon.az, 6)) {
      var mx = X(moon.az), my = Y(moon.alt), dayA = clamp(1 - (sun.alt + 4) / 30, 0.35, 1), f = ill.fraction;
      c.save(); c.globalAlpha = dayA;
      if (night) { c.shadowColor = "rgba(255,248,220," + (0.25 + f * 0.4) + ")"; c.shadowBlur = 16 + f * 18; }
      c.fillStyle = night ? "rgba(70,80,110,0.55)" : "rgba(200,215,235,0.35)"; circle(c, mx, my, mr); c.fill();
      c.shadowBlur = 0; c.shadowColor = "transparent";
      if (f > 0.01) {
        c.translate(mx, my); c.rotate(-Math.PI / 2 - (ill.angle - moon.pa)); c.beginPath();
        c.arc(0, 0, mr, -Math.PI / 2, Math.PI / 2, false);
        c.ellipse(0, 0, Math.max(0.01, Math.abs(2 * f - 1) * mr), mr, 0, Math.PI / 2, -Math.PI / 2, f < 0.5);
        c.fillStyle = "#FBF3D9"; c.fill();
      }
      c.restore();
      if (sp.rabbit && f > 0.85) { drawRabbit(c, mx, my, mr, tt); hits.push({ id: "rabbit", x: mx, y: my, r: mr }); }
    }
    /* clouds */
    var avoid = sp.rabbit && moon.alt > -2 ? [{ x: X(moon.az), y: Y(moon.alt), r: mr * 1.25 }] : [];
    drawClouds(c, t, sun, wx, cols, false, avoid);
    /* common: shooting stars, planes, birds, satellites */
    drawCommon(c, t, sun, dark, clearness);
    /* specials */
    if (sp.kites) { var gy0 = Y(0); for (var ki = 0; ki < 5; ki++) { var kaz = 150 + ki * 17 + Math.sin(tt * 0.1 + ki) * 2, kal = 18 + (ki % 3) * 7 + Math.sin(tt * 0.5 + ki) * 1.5; if (inView(kaz, 4)) { drawKite(c, X(kaz), Y(kal), 3.2 * ppd * (DATA.scale || 1), tt, ki, gy0); hits.push({ id: "kites", x: X(kaz), y: Y(kal), r: 3 * ppd }); } } }
    if (sp.lanterns) {
      for (var li = 0; li < 34; li++) {
        var lr = rng(fnv("lan" + li)), period = 900 + lr() * 900, ph = ((tt + lr() * period) % period) / period;
        var laz = 120 + lr() * 130 + Math.sin(tt * 0.05 + li) * 3, lal = 2 + ph * 55;
        if (inView(laz, 2)) { drawLantern(c, X(laz), Y(lal), (1.7 - ph * 0.9) * ppd * (DATA.scale || 1), tt, li); if (li % 4 === 0) hits.push({ id: "lanterns", x: X(laz), y: Y(lal), r: 2 * ppd }); }
      }
    }
    if (sp.bridge) drawBridge(c, t, tt);
    if (sp.fireworks) drawFireworks(c, t);
    /* big beings */
    specials.forEach(function (e) {
      if (!isBeing(e)) return;
      var bp = beingPos(e, t);
      e.az = bp.az; e.altNow = bp.alt;
      if (!inView(bp.az, 30)) return;
      var x = X(bp.az), y = Y(bp.alt), sz = beingSize(e.id);
      if (e.id === "whale") drawWhale(c, x, y, sz, tt, e.dir, night, wx.kind === "rain");
      if (e.id === "dragon") drawDragon(c, x, y, sz, tt, e.dir);
      if (e.id === "phoenix") drawPhoenix(c, x, y, sz, tt, e.dir);
      hits.push({ id: e.id, x: x, y: y, r: sz * (e.id === "phoenix" ? 0.7 : 0.42) });
      avoid.push({ x: x, y: y, r: sz * 0.45 });
    });
    drawClouds(c, t, sun, wx, cols, true, avoid);
    /* skyline */
    drawSkylineCached(c, t, sun, dark);
    if (wx.kind) drawPrecip(c, tt, wx.kind);
    stateCache = { t: t, sun: sun, moon: moon, ill: ill, wx: wx, active: specials, theme: themeOf(sun.alt) };
  }

  /* 은하수: 흐린 빛 뭉치를 은하면을 따라 겹쳐 그린다 */
  /* 흐린 빛 뭉치는 작은 캔버스에 3분의 1 크기로 그려 두고, 하늘이 조금 움직였을 때만 다시 그린다 */
  var MW = { cv: null, az: -999, alt: -999, t: 0, a: 0, w: 0, h: 0 };
  function drawMilkyWay(c, t, a) {
    var k = 3, w = Math.ceil(Wd / k), h = Math.ceil(Ht / k);
    if (!MW.cv) MW.cv = D.createElement("canvas");
    var stale = MW.w !== w || MW.h !== h || Math.abs(wrap180(camAz - MW.az)) > 0.15 || Math.abs(camAlt - MW.alt) > 0.15 || Math.abs(t - MW.t) > 8000 || Math.abs(a - MW.a) > 0.04;
    if (stale) {
      if (MW.w !== w || MW.h !== h) { MW.cv.width = w; MW.cv.height = h; MW.w = w; MW.h = h; }
      var g2 = MW.cv.getContext("2d"), img = blobSprite();
      g2.clearRect(0, 0, w, h);
      for (var i = 0; i < GALBLOBS.length; i++) {
        var g = GALBLOBS[i], p = starPos(g.ra, g.dec, t);
        if (p.alt < -4 || p.alt > 86 || !inView(p.az, g.s)) continue;
        var sz = g.s * ppd * 2 / k;
        g2.globalAlpha = g.a * a; g2.drawImage(img, X(p.az) / k - sz / 2, Y(p.alt) / k - sz / 2, sz, sz);
      }
      g2.globalAlpha = 1;
      MW.az = camAz; MW.alt = camAlt; MW.t = t; MW.a = a;
    }
    c.drawImage(MW.cv, 0, 0, w * k, h * k);
    for (var j = 0; j < GALSTARS.length; j++) {
      var q = GALSTARS[j], sp2 = starPos(q.ra, q.dec, t);
      if (sp2.alt < 1 || !inView(sp2.az, 1)) continue;
      c.fillStyle = "rgba(235,240,255," + (0.18 + q.m * 0.42) * a + ")"; circle(c, X(sp2.az), Y(sp2.alt), 0.45 + q.m * 0.6); c.fill();
    }
  }

  /* 달 무늬처럼 옅은 빛깔로, 절구에 방아를 찧는 토끼 */
  function drawRabbit(c, mx, my, mr, tt) {
    var ph = (tt * 1.1) % 1, lift = ph < 0.6 ? ease(ph / 0.6) : 1 - ease((ph - 0.6) / 0.4);
    c.save(); c.translate(mx - mr * 0.12, my + mr * 0.08); c.scale(mr / 40, mr / 40);
    c.fillStyle = "rgba(122,110,86,0.62)";
    c.beginPath(); c.ellipse(-7, 8, 10.5, 12.5, -0.15, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(1.5, -7.5, 7, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(-3.2, -21, 2.6, 9.5, -0.42, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(1.8, -22, 2.6, 9.5, -0.12, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(-17, 14, 3.4, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(-3, 20.5, 9, 3, 0, 0, Math.PI * 2); c.fill();
    /* 절구 */
    c.beginPath(); c.moveTo(13, 9); c.lineTo(31, 9); c.lineTo(28, 21); c.lineTo(16, 21); c.closePath(); c.fill();
    c.fillRect(14.5, 21, 15, 2.6);
    /* 공이: 들었다 내리찍는다 */
    c.save(); c.translate(6, 1); c.rotate(-0.25 - lift * 0.75);
    c.fillRect(0, -1.6, 20, 3.2); c.beginPath(); c.ellipse(20, 0, 3.2, 4.2, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = "rgba(60,52,38,0.7)"; c.beginPath(); c.arc(4.2, -9, 1.1, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  /* 칠석 밤: 서울에서는 직녀성이 거의 머리 꼭대기를 지나서, 이 장면만큼은 두 별을 이야기 속 자리로 내려 그린다.
     밤 9시부터 하늘을 따라 남동쪽에서 남쪽으로 돌고, 11시에 다리가 다 놓이면 두 사람이 가운데서 만난다. */
  function bridgeFrame(t) {
    var h = clamp((t - (day0(t) + 21 * 3600e3)) / 3600e3, 0, 3), caz = 112 + 15 * h, sp = 13 * (DATA.scale || 1);
    return { caz: caz, v: { az: caz - sp, alt: 50 }, a: { az: caz + sp, alt: 35 }, prog: clamp(h / 2, 0, 1), meet: clamp((h - 2) * 6, 0, 1) };
  }
  function bridgeAt(B, s) { return { az: lerp(B.v.az, B.a.az, s), alt: lerp(B.v.alt, B.a.alt, s) + Math.sin(s * Math.PI) * 6 }; }
  function drawBridge(c, t, tt) {
    var B = bridgeFrame(t);
    if (!inView(B.caz, 25)) return;
    var vx = X(B.v.az), vy = Y(B.v.alt), ax = X(B.a.az), ay = Y(B.a.alt), mx = (vx + ax) / 2, my = (vy + ay) / 2 - 3 * ppd;
    var ang = Math.atan2(ay - vy, ax - vx) + Math.PI / 2, ux = Math.cos(ang), uy = Math.sin(ang), img = blobSprite();
    var r = rng(fnv("milky"));
    for (var k = 0; k < 46; k++) {
      var al = (r() - 0.5) * Ht * 2, ac = (r() + r() - 1) * 3 * ppd, sz = (5 + r() * 8) * ppd * 2;
      c.globalAlpha = 0.1 + r() * 0.12; c.drawImage(img, mx + ux * al - uy * ac - sz / 2, my + uy * al + ux * ac - sz / 2, sz, sz);
    }
    c.globalAlpha = 1;
    for (var q = 0; q < 160; q++) {
      var along = (r() - 0.5) * Ht * 1.9, across = (r() + r() + r() - 1.5) * 4 * ppd;
      c.fillStyle = "rgba(240,244,255," + (0.25 + r() * 0.55) + ")"; circle(c, mx + ux * along - uy * across, my + uy * along + ux * across, 0.4 + r() * 0.8); c.fill();
    }
    var n = 40;
    for (var i = 0; i < n; i++) {
      var s = i / (n - 1);
      if (Math.abs(s - 0.5) < 0.5 * (1 - B.prog) - 0.02) continue;
      var p = bridgeAt(B, s);
      drawMagpie(c, X(p.az), Y(p.alt + Math.sin(tt * 3 + i) * 0.25), ppd * 0.085 * (DATA.scale || 1), tt + i * 0.37, i % 2 ? 1 : -1);
      if (i % 5 === 0) hits.push({ id: "bridge", x: X(p.az), y: Y(p.alt), r: 3 * ppd });
    }
    [[B.v, "직녀성", "#FFE2F0", "#FFC2E0", lerp(0, 0.47, B.meet)], [B.a, "견우성", "#DDEEFF", "#9FD3FF", lerp(1, 0.53, B.meet)]].forEach(function (q) {
      var sx = X(q[0].az), sy = Y(q[0].alt);
      c.shadowColor = "rgba(255,250,230,0.9)"; c.shadowBlur = 14; c.fillStyle = "#FFFBEA"; circle(c, sx, sy, 2.6); c.fill();
      c.shadowBlur = 0; c.shadowColor = "transparent";
      var left = q[1] === "직녀성";
      c.fillStyle = "rgba(255,246,216,0.9)"; c.font = Math.round(clamp(ppd * 1.3, 11, 15) * (DATA.scale || 1)) + "px " + FONT_BODY;
      c.textAlign = left ? "right" : "left"; c.textBaseline = "middle";
      c.fillText(q[1], sx + (left ? -9 : 9), sy + 1); c.textBaseline = "alphabetic"; c.textAlign = "center";
      var p = bridgeAt(B, q[4]), fx = X(p.az), fy = Y(p.alt + 1.6);
      c.shadowColor = q[3]; c.shadowBlur = 16; c.fillStyle = q[2];
      c.beginPath(); c.ellipse(fx, fy, ppd * 0.45, ppd * 1.0, 0, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0; c.shadowColor = "transparent";
    });
    hits.push({ id: "bridge", x: X(B.v.az), y: Y(B.v.alt), r: 3 * ppd }, { id: "bridge", x: X(B.a.az), y: Y(B.a.alt), r: 3 * ppd });
  }

  var FW_COLS = ["255,214,110", "255,120,110", "140,200,255", "170,255,170", "255,255,240", "255,150,220"];
  function drawFireworks(c, t) {
    var tt = t / 1000, step = 0.55;
    c.save(); c.globalCompositeOperation = "lighter"; c.lineCap = "round";
    for (var slot = Math.floor(tt / step) - 6; slot <= Math.floor(tt / step); slot++) {
      var r = rng(fnv("fw" + slot)), st = slot * step + r() * 0.4, age = tt - st - 0.7;
      var az = 145 + r() * 75, alt = 16 + r() * 24, x = X(az), y = Y(alt), col = FW_COLS[Math.floor(r() * FW_COLS.length)], big = (4.5 + r() * 4.5) * (DATA.scale || 1);
      if (age < -0.7 || age > 2.6 || !inView(az, 12)) continue;
      if (age < 0) {
        var ry = lerp(Y(2), y, ease((age + 0.7) / 0.7));
        c.strokeStyle = "rgba(" + col + ",0.8)"; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, ry + 10); c.lineTo(x, ry); c.stroke();
        continue;
      }
      var fade = 1 - age / 2.6, n = 46, rr = ppd * big * (1 - Math.pow(1 - Math.min(1, age / 1.1), 3));
      for (var k = 0; k < n; k++) {
        var an = k / n * Math.PI * 2 + r() * 0.05, sx = Math.cos(an), sy = Math.sin(an), dropY = age * age * ppd * 0.9;
        var x1 = x + sx * rr, y1 = y + sy * rr + dropY, x0 = x + sx * rr * 0.6, y0 = y + sy * rr * 0.6 + dropY * 0.7;
        c.strokeStyle = "rgba(" + col + "," + (0.9 * fade) + ")"; c.lineWidth = 2.4;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        if (age > 0.9 && (k + slot) % 3 === 0) { c.fillStyle = "rgba(255,255,255," + (fade * (0.5 + 0.5 * Math.sin(tt * 30 + k))) + ")"; circle(c, x1, y1, 1.3); c.fill(); }
      }
      if (age < 0.7) { var gl = blobSprite(), gs = rr * 2.2 + ppd * 3; c.globalAlpha = 0.5 * (1 - age / 0.7); c.drawImage(gl, x - gs / 2, y - gs / 2, gs, gs); c.globalAlpha = 1; }
      if (age < 0.25) { c.fillStyle = "rgba(255,255,240," + (1 - age / 0.25) + ")"; circle(c, x, y, ppd * 1.4); c.fill(); }
      hits.push({ id: "fireworks", x: x, y: y, r: rr + 12 });
    }
    c.restore();
  }

  /* 종이를 오려 붙인 듯한 구름: 밑이 평평하고 위로 몇 개의 둥근 혹 */
  function cloudPath(c, x, y, w, bumps) {
    var left = x - w / 2, n = bumps.length;
    c.beginPath(); c.moveTo(left + w * 0.06, y);
    for (var i = 0; i < n; i++) {
      var cx = left + w * (i + 0.5) / n, rr = w / n * bumps[i];
      c.arc(cx, y - rr * 0.55, rr, Math.PI * 0.92, Math.PI * 2.08, false);
    }
    c.lineTo(left + w * 0.94, y); c.quadraticCurveTo(x, y + w * 0.035, left + w * 0.06, y); c.closePath();
  }
  function drawClouds(c, t, sun, wx, cols, front, avoid) {
    var n = 26, tm = t / 60000, day = sun.alt > 4, dusk = !day && sun.alt > -5;
    var light = day ? [252, 252, 255] : dusk ? mixc([250, 196, 186], [252, 252, 255], (sun.alt + 5) / 9) : [52, 62, 98];
    var under = day ? mixc([206, 220, 238], cols[1], 0.3) : dusk ? [176, 128, 150] : [30, 37, 66];
    for (var i = 0; i < n; i++) {
      var r = rng(fnv("cloud" + i)), thr = r();
      if (thr > wx.cover) continue;
      if ((i % 4 === 0) !== front) continue;
      var az = (r() * 360 + tm * wx.wind * (0.4 + r() * 0.6)) % 360, alt = 7 + r() * 32, size = 5 + r() * 8;
      var nb = 3 + Math.floor(r() * 3), bumps = [];
      for (var b = 0; b < nb; b++) bumps.push((b === 0 || b === nb - 1 ? 0.62 : 0.86) + r() * 0.3);
      if (!inView(az, size * 2)) continue;
      var x = X(az), y = Y(alt), w = size * ppd * 1.9;
      if (avoid && avoid.some(function (o) { return Math.abs(x - o.x) < w / 2 + o.r && y > o.y - o.r && y - w * 0.5 < o.y + o.r; })) continue;
      cloudPath(c, x, y + w * 0.05, w, bumps); c.fillStyle = css(under, front ? 0.9 : 0.75); c.fill();
      cloudPath(c, x, y, w, bumps);
      var g = c.createLinearGradient(0, y - w * 0.45, 0, y);
      g.addColorStop(0, css(light, front ? 0.98 : 0.88)); g.addColorStop(1, css(mixc(light, under, 0.35), front ? 0.98 : 0.88));
      c.fillStyle = g; c.fill();
    }
  }

  function drawCommon(c, t, sun, dark, clearness) {
    var tt = t / 1000, sh = showerRate(t);
    if (dark > 0.4) {
      var chance = Math.min(0.95, 0.5 * sh.rate * clearness);
      for (var slot = Math.floor(tt / 10) - 1; slot <= Math.floor(tt / 10); slot++) {
        var r = rng(fnv("ss" + slot));
        if (r() > chance) continue;
        var st = slot * 10 + r() * 9, age = tt - st;
        if (age < 0 || age > 1.1) continue;
        var az = r() * 360, alt = 25 + r() * 40, ang = (200 + r() * 140) * rad, len = 9 + r() * 10;
        if (!inView(az, 15)) continue;
        var x = X(az), y = Y(alt), p = ease(age / 0.8), x2 = x + Math.cos(ang) * len * ppd * p, y2 = y + Math.abs(Math.sin(ang)) * len * ppd * p * 0.6;
        var gr = c.createLinearGradient(x, y, x2, y2);
        gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,240," + (0.9 * (1 - age / 1.1) * clearness) + ")");
        c.strokeStyle = gr; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke();
        if (age < 0.9 && !shooting[slot]) {
          if (++shootN > 300) { shooting = {}; shootN = 0; }
          shooting[slot] = 1; if (soundOn && SOUND.ready) SOUND.ping();
        }
      }
    }
    /* planes */
    for (var ps = Math.floor(tt / 90) - 1; ps <= Math.floor(tt / 90); ps++) {
      var pr = rng(fnv("pl" + ps));
      if (pr() > 0.38) continue;
      var pst = ps * 90 + pr() * 30, page = tt - pst, dur = 75;
      if (page < 0 || page > dur) continue;
      var dir = pr() < 0.5 ? 1 : -1, az0 = pr() * 360, paz = az0 + dir * 70 * (page / dur), palt = 14 + pr() * 22;
      if (!inView(paz, 3)) continue;
      var px = X(paz), py = Y(palt);
      if (sun.alt < -4) {
        var bl = Math.floor(tt * 1.2) % 2 === 0;
        c.fillStyle = bl ? "#FF5A4E" : "rgba(255,90,78,0.3)"; circle(c, px, py, 1.6); c.fill();
        if (Math.floor(tt * 2.5) % 5 === 0) { c.fillStyle = "#FFFFFF"; circle(c, px + 3, py, 1.4); c.fill(); }
      } else {
        c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py); c.lineTo(px - dir * 18 * ppd * Math.min(1, page / 20), py); c.stroke();
        c.fillStyle = "rgba(40,50,70,0.8)"; c.fillRect(px - 3, py - 1, 6, 2);
      }
    }
    /* birds */
    if (sun.alt > -2) {
      var k = kst(t), geese = k.m >= 10 || k.m <= 2;
      for (var bs = Math.floor(tt / 120) - 1; bs <= Math.floor(tt / 120); bs++) {
        var br = rng(fnv("bd" + bs));
        if (br() > 0.32) continue;
        var bst = bs * 120 + br() * 60, bage = tt - bst, bdur = 55;
        if (bage < 0 || bage > bdur) continue;
        var bdir = br() < 0.5 ? 1 : -1, baz0 = br() * 360, baz = baz0 + bdir * 45 * (bage / bdur), balt = 9 + br() * 16, nB = 5 + Math.floor(br() * 5);
        if (!inView(baz, 8)) continue;
        c.strokeStyle = "rgba(30,36,50,0.75)"; c.lineWidth = 1.3; c.lineCap = "round";
        for (var bi = 0; bi < nB; bi++) {
          var row = geese ? Math.ceil(bi / 2) * (bi % 2 ? 1 : -1) : (br() - 0.5) * 6;
          var bx = X(baz - bdir * Math.abs(row) * 1.2) , by = Y(balt + row * (geese ? 0.7 : 0.4)), fl = Math.sin(tt * 8 + bi) * 2.2;
          c.beginPath(); c.moveTo(bx - 4, by - fl); c.quadraticCurveTo(bx - 2, by - 1, bx, by); c.quadraticCurveTo(bx + 2, by - 1, bx + 4, by - fl); c.stroke();
        }
      }
    }
    /* satellites at twilight-night */
    if (sun.alt < -6 && sun.alt > -30) {
      for (var ss = Math.floor(tt / 150) - 1; ss <= Math.floor(tt / 150); ss++) {
        var sr = rng(fnv("sat" + ss));
        if (sr() > 0.35) continue;
        var sst = ss * 150 + sr() * 50, sage = tt - sst, sdur = 100;
        if (sage < 0 || sage > sdur) continue;
        var saz = sr() * 360 + 60 * (sage / sdur), salt = 20 + sr() * 40 + 10 * Math.sin(sage / sdur * Math.PI);
        if (!inView(saz, 2)) continue;
        c.fillStyle = "rgba(255,255,255,0.8)"; circle(c, X(saz), Y(salt), 1.1); c.fill();
      }
    }
  }
  var shooting = {}, shootN = 0;
  function ih(a) { a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); a = Math.imul(a ^ (a >>> 16), 0x45d9f3b); return (a ^ (a >>> 16)) >>> 0; }

  function drawSkyline(c, t, sun, dark) {
    var k = kst(t), hour = k.h + k.mi / 60, lit = hour >= 18 ? 0.55 : hour < 1 ? 0.32 : hour < 5 ? 0.08 : hour < 9 ? 0.22 : 0.3;
    if (sun.alt > 2) lit = 0;
    var slotH = Math.floor(hour * 2);
    var base = sun.alt > 4 ? [52, 60, 84] : sun.alt > -6 ? mixc([28, 30, 52], [52, 60, 84], (sun.alt + 6) / 10) : [14, 17, 33];
    var ridgeC = mixc(base, [120, 135, 170], sun.alt > 0 ? 0.35 : 0.18);
    var y0 = Y(0), half = Wd / ppd / 2 + 6;
    /* ridge */
    c.fillStyle = css(ridgeC);
    c.beginPath(); c.moveTo(0, Ht);
    for (var px = 0; px <= Wd; px += 6) { var az = camAz + (px - Wd / 2) / ppd; c.lineTo(px, Y(ridge(az))); }
    c.lineTo(Wd, Ht); c.closePath(); c.fill();
    /* 먼 쪽 건물: 안개 낀 듯 옅게 */
    var far = mixc(base, ridgeC, 0.55);
    BLD2.forEach(function (b) {
      var d = wrap180(b.az + b.w / 2 - camAz);
      if (Math.abs(d) > half + b.w) return;
      var x0 = Wd / 2 + (d - b.w / 2) * ppd, w = b.w * ppd, top = Y(b.h);
      c.fillStyle = css(far); c.fillRect(x0, top, w, y0 - top + 1);
      if (lit > 0) {
        for (var q = 0; q < 3; q++) { var hq = ih(b.seed ^ Math.imul(q + 7, 2654435761) ^ slotH) % 1000; if (hq < lit * 600) { c.fillStyle = "rgba(255,214,150,0.55)"; c.fillRect(x0 + (hq % 7) / 7 * (w - 3), top + 3 + (q * 5) % Math.max(4, y0 - top - 6), 2, 2); } }
      }
    });
    c.fillStyle = css(base);
    c.fillRect(0, y0, Wd, Ht - y0);
    BLD.forEach(function (b) {
      var d = wrap180(b.az + b.w / 2 - camAz);
      if (Math.abs(d) > half + b.w) return;
      var x0 = Wd / 2 + (d - b.w / 2) * ppd, w = b.w * ppd, top = Y(b.h);
      c.fillStyle = css(base);
      if (b.type === "house") {
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, top + w * 0.2); c.lineTo(x0 + w / 2, top - w * 0.12); c.lineTo(x0 + w, top + w * 0.2); c.lineTo(x0 + w, y0); c.closePath(); c.fill();
      } else {
        c.fillRect(x0, top, w, y0 - top + 1);
      }
      if (b.tank) { c.fillRect(x0 + w * 0.2, top - ppd * 0.7, w * 0.22, ppd * 0.7); }
      if (b.ant) { c.fillRect(x0 + w * 0.7, top - ppd * 1.8, 1.2, ppd * 1.8); }
      if (b.cross) {
        var cxp = x0 + w * 0.5, cyp = top - ppd * 1.6;
        c.fillStyle = dark > 0.3 ? "#FF4747" : css(base);
        if (dark > 0.3) { c.shadowColor = "#FF3030"; c.shadowBlur = 10; }
        c.fillRect(cxp - 0.8, cyp - ppd * 1.2, 1.6, ppd * 2.2); c.fillRect(cxp - ppd * 0.55, cyp - ppd * 0.65, ppd * 1.1, 1.6);
        c.shadowBlur = 0; c.shadowColor = "transparent";
      }
      if (lit > 0 && (b.type === "apt" || b.type === "tower" || b.type === "low")) {
        var cs = Math.max(2, Math.floor(w / 7)), rs = Math.max(1, Math.floor((y0 - top) / 8)), ww = Math.max(1.5, w / cs * 0.45);
        for (var rr = 0; rr < rs; rr++) for (var cc = 0; cc < cs; cc++) {
          var hsh = ih(b.seed ^ Math.imul(rr + 1, 73856093) ^ Math.imul(cc + 1, 19349663) ^ Math.imul(slotH + 1, 83492791)) % 1000;
          if (hsh < lit * 1000) { c.fillStyle = hsh % 7 === 0 ? "rgba(170,200,255,0.75)" : "rgba(255,215,140,0.85)"; c.fillRect(x0 + (cc + 0.3) * (w / cs), top + 4 + rr * 8, ww, 3.2); }
        }
      }
      if (b.num && w > 26) {
        c.fillStyle = dark > 0.3 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.3)"; c.font = "10px " + FONT_BODY; c.textAlign = "center";
        c.fillText(b.num + "동", x0 + w / 2, top + 11);
      }
    });
  }

  /* 도시 풍경은 화면보다 양옆으로 20도씩 넓게 미리 그려 두고, 하늘이 돌면 밀어서 붙인다.
     창문 불빛이 바뀌는 30분마다, 해의 높이가 바뀌거나 너무 많이 돌았을 때만 다시 그린다. */
  var SKYL = { cv: null, az: -999, alt: -999, key: "", m: 0, w: 0, h: 0 };
  function drawSkylineCached(c, t, sun, dark) {
    var m = Math.ceil(20 * ppd), w = Math.ceil(Wd) + 2 * m, h = Math.ceil(Ht), k = kst(t);
    var key = [Math.floor((k.h + k.mi / 60) * 2), Math.round(sun.alt * 2), dark > 0.3 ? 1 : 0, w, h, dpr, ppd].join(",");
    if (!SKYL.cv) SKYL.cv = D.createElement("canvas");
    var dx = wrap180(camAz - SKYL.az) * ppd, dy = (camAlt - SKYL.alt) * ppd;
    if (SKYL.key !== key || Math.abs(dx) > m - 4 || Math.abs(dy) > 1.5) {
      var cw = Math.round(w * dpr), ch = Math.round(h * dpr);
      if (SKYL.cv.width !== cw || SKYL.cv.height !== ch) { SKYL.cv.width = cw; SKYL.cv.height = ch; }
      var g = SKYL.cv.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      var keepW = Wd; Wd = w;
      try { drawSkyline(g, t, sun, dark); } finally { Wd = keepW; }
      SKYL.az = camAz; SKYL.alt = camAlt; SKYL.key = key; SKYL.m = m; SKYL.w = w; SKYL.h = h; dx = 0; dy = 0;
    }
    c.drawImage(SKYL.cv, 0, 0, SKYL.cv.width, SKYL.cv.height, -SKYL.m - dx, dy, SKYL.w, SKYL.h);
  }

  function drawPrecip(c, tt, kind) {
    var n = kind === "rain" ? 90 : 70;
    for (var i = 0; i < n; i++) {
      var r = rng(i * 7919), sp = kind === "rain" ? 0.9 + r() * 0.5 : 0.08 + r() * 0.06;
      var x = (r() * Wd + tt * (kind === "rain" ? 40 : 12)) % Wd, y = ((r() * Ht) + tt * sp * Ht) % Ht;
      if (kind === "rain") { c.strokeStyle = "rgba(200,215,240,0.45)"; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 3, y + 11); c.stroke(); }
      else { c.fillStyle = "rgba(255,255,255,0.85)"; circle(c, x + Math.sin(tt + i) * 6, y, 1.6 + r() * 1.4); c.fill(); }
    }
  }

  /* ---------- sound ---------- */
  var SOUND_KEY = "haneul:sound", soundOn = false, SOUND = { ready: false };
  try { soundOn = localStorage.getItem(SOUND_KEY) === "on"; } catch (e) { soundOn = false; }
  var actx = null, master = null, verb = null, wind = null;
  function audio() {
    try {
      if (!actx) {
        var AC = W.AudioContext || W.webkitAudioContext; if (!AC) return null;
        actx = new AC(); master = actx.createGain(); master.gain.value = 0.7; master.connect(actx.destination);
        verb = actx.createConvolver();
        var len = Math.floor(actx.sampleRate * 3.2), buf = actx.createBuffer(2, len, actx.sampleRate);
        for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
        verb.buffer = buf; var vg = actx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
      }
      if (actx.state === "suspended" && actx.resume) actx.resume();
      SOUND.ready = true;
      return actx;
    } catch (e) { return null; }
  }
  function voice(f0, f1, t, dur, peak, type, wet) {
    var c = actx, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); if (wet) g.connect(verb);
    o.start(t); o.stop(t + dur + 0.05);
  }
  SOUND.ping = function () { if (!soundOn || !actx) return; var t = actx.currentTime + 0.01; voice(2400, 1800, t, 0.6, 0.03, "sine", true); };
  SOUND.whale = function () {
    if (!soundOn || !actx) return; var t = actx.currentTime + 0.05;
    voice(190, 120, t, 2.6, 0.12, "sine", true); voice(380, 230, t + 0.1, 2.4, 0.03, "triangle", true);
    voice(150, 260, t + 2.9, 2.2, 0.1, "sine", true);
  };
  SOUND.dragon = function () {
    if (!soundOn || !actx) return; var t = actx.currentTime + 0.05;
    voice(70, 45, t, 2.4, 0.18, "sawtooth", true);
    [880, 1175, 1568].forEach(function (f, i) { voice(f, f, t + 0.4 + i * 0.22, 1.4, 0.05, "sine", true); });
  };
  SOUND.phoenix = function () {
    if (!soundOn || !actx) return; var t = actx.currentTime + 0.05;
    [1047, 1175, 1397, 1568, 1760, 2093].forEach(function (f, i) { voice(f, f * 1.01, t + i * 0.12, 0.9, 0.05, "triangle", true); });
  };
  SOUND.tick = function () { if (!actx) return; var t = actx.currentTime + 0.01; voice(1400, 900, t, 0.08, 0.05, "triangle", false); };
  SOUND.ok = function () { if (!actx) return; var t = actx.currentTime + 0.01; voice(880, 880, t, 0.12, 0.08, "sine", false); voice(1320, 1320, t + 0.09, 0.16, 0.08, "sine", false); };
  function startWind() {
    if (!actx || wind) return;
    var len = actx.sampleRate * 2, buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    var src = actx.createBufferSource(), lp = actx.createBiquadFilter(), g = actx.createGain(), lfo = actx.createOscillator(), lg = actx.createGain();
    src.buffer = buf; src.loop = true; lp.type = "lowpass"; lp.frequency.value = 500; g.gain.value = 0.05;
    lfo.frequency.value = 0.07; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master); src.start(); lfo.start();
    wind = { src: src, g: g };
  }
  function stopWind() { if (wind) { try { wind.src.stop(); } catch (e) { /* stopped */ } wind = null; } }
  var lastSong = {};
  function soundTick(t) {
    if (!soundOn || !actx) return;
    activeAt(t).forEach(function (e) {
      if (!SOUND[e.id]) return;
      var every = e.id === "whale" ? 9000 : e.id === "dragon" ? 12000 : 7000;
      if (!lastSong[e.id] || t - lastSong[e.id] > every) { lastSong[e.id] = t; SOUND[e.id](); }
    });
    approaching(t, 120e3).forEach(function (e) {
      if (e.id === "whale" && (!lastSong.far || t - lastSong.far > 20000)) {
        lastSong.far = t; var c = actx, tt = c.currentTime + 0.05; voice(160, 110, tt, 3, 0.03, "sine", true);
      }
    });
  }

  /* ---------- ui ---------- */
  var FONT_BODY = '"Gowun Dodum", "GowunDodum", system-ui, sans-serif';
  var FONT_HEAD = '"Song Myung", "SongMyung", serif';
  var LOG_KEY = "haneul:log";
  var SCRIPT_SRC = (D.currentScript && D.currentScript.src) || "";
  var BASE = SCRIPT_SRC ? SCRIPT_SRC.replace(/[^/]*$/, "") : location.origin + "/sky/";
  function readLog() { try { var l = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
  function writeLog(l) { try { localStorage.setItem(LOG_KEY, JSON.stringify(l.slice(-200))); } catch (e) { /* 저장하지 못해도 하늘은 계속 보인다 */ } }
  var NAMES = { whale: "하늘고래", dragon: "청룡", phoenix: "봉황", kites: "방패연", lanterns: "소원 등불", bridge: "오작교", rabbit: "달토끼", fireworks: "새해 불꽃" };
  var NOW_LINE = {
    whale: "하늘고래가 서울 하늘을 지나가고 있어", dragon: "청룡이 서울 하늘을 지나가고 있어", phoenix: "봉황이 노을 속을 날아가고 있어",
    kites: "서울 하늘에 방패연이 떠 있어", lanterns: "서울 하늘에 소원 등불이 오르고 있어", bridge: "까치들이 오작교를 놓고 있어",
    rabbit: "보름달에 토끼가 보여", fireworks: "새해 불꽃이 터지고 있어"
  };
  var STATUS = {
    whale: "지금 하늘고래가 지나가는 중이에요", dragon: "지금 청룡이 지나가는 중이에요", phoenix: "지금 봉황이 지나가는 중이에요",
    kites: "지금 방패연이 떠 있어요", lanterns: "지금 소원 등불이 오르고 있어요", bridge: "지금 오작교가 놓이는 중이에요",
    rabbit: "지금 보름달에 달토끼가 있어요", fireworks: "지금 새해 불꽃이 터지고 있어요"
  };
  var NEXT_HINT = {
    whale: "하늘고래는 날마다 한 번씩 와요. 아래 오늘의 하늘 예보를 보세요.", dragon: "청룡은 일주일에 한 번, 어느 날 밤에 와요.",
    phoenix: "봉황은 한 달에 한 번, 해 질 무렵에 와요.", kites: "방패연은 설날 낮에 떠요.", lanterns: "소원 등불은 정월대보름 밤에 올라요.",
    bridge: "오작교는 칠석 밤에 놓여요.", rabbit: "달토끼는 추석 보름달에 보여요.", fireworks: "새해 불꽃은 1월 1일 0시에 터져요."
  };
  var HOLI = { kites: "seollal", lanterns: "boreum", bridge: "chilseok", rabbit: "chuseok" };

  var toastT = null;
  function toast(msg) {
    var t = $(".toast");
    if (!t) { t = D.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); D.body.appendChild(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2800);
  }
  function legacyCopy(text) {
    var ta = D.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-1000px";
    D.body.appendChild(ta); ta.select(); var ok = false; try { ok = D.execCommand("copy"); } catch (e) { ok = false; } D.body.removeChild(ta); return ok;
  }
  function copyText(text, msg) {
    var done = function () { toast(msg); SOUND.ok(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { if (legacyCopy(text)) done(); else W.prompt("아래 내용을 복사해 주세요", text); });
    else if (legacyCopy(text)) done(); else W.prompt("아래 내용을 복사해 주세요", text);
  }
  function whenKo(ts) {
    var d = Math.round((day0(ts) - day0(now())) / DAY);
    return (d === 0 ? "오늘" : d === -1 ? "어제" : d === 1 ? "내일" : dateKo(ts)) + " " + hm(ts);
  }
  function nextHoliday(key, t) {
    var H = DATA.holidays || {}, best = null;
    for (var k in H) if (k.split(":")[1] === key) { var ts = Date.parse(H[k] + "T00:00:00+09:00"); if (ts + DAY > t && (best === null || ts < best)) best = ts; }
    return best;
  }
  function nextText(id, t) {
    var hk = HOLI[id];
    if (hk) { var ts = nextHoliday(hk, t + DAY); return ts ? NEXT_HINT[id].replace(/\.$/, "") + ". 다음은 " + kst(ts).y + "년 " + dateKo(ts + 3600e3) + "이에요." : NEXT_HINT[id]; }
    return NEXT_HINT[id];
  }

  function shareInfo(t) {
    var act = activeAt(t).filter(function (e) { return NAMES[e.id]; }).sort(function (a, b) { return isBeing(b) - isBeing(a); }), ap = approaching(t, 180e3);
    if (act.length) {
      var e = act[0], text = "지금 하늘 봐! " + NOW_LINE[e.id] + (isBeing(e) ? " (" + hm(e.start) + "~" + hm(e.end) + ")" : "") + ".";
      return { text: text, url: BASE + "now/" + e.id + "/?at=" + Math.floor(e.start / 60000).toString(36) };
    }
    if (ap.length) return { text: "곧 " + iga(NAMES[ap[0].id]) + " 지나갈 것 같아. 지금 하늘 봐!", url: BASE };
    var w = whaleOn(day0(t));
    return { text: t < w.start ? "같은 하늘 보자. 오늘 하늘고래는 " + hm(w.hintFrom) + "부터 세 시간 안에 지나간대." : "같은 하늘 보자. 오늘 하늘고래는 " + hm(w.start) + "에 지나갔고, 내일 또 온대.", url: BASE };
  }
  function doShare() {
    audio(); SOUND.tick();
    var info = shareInfo(now()), msg = "링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.";
    if (navigator.share) navigator.share({ title: "하늘봐", text: info.text, url: info.url }).then(function () { SOUND.ok(); }, function (err) { if (!err || err.name !== "AbortError") copyText(info.text + "\n" + info.url, msg); });
    else copyText(info.text + "\n" + info.url, msg);
  }

  function witness(id, at) {
    var t = now(), log = readLog(), e = activeAt(t).filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var dup = log.some(function (r) { return r.id === id && r.ev === e.start; });
    if (!dup) { log.push({ id: id, t: t, ev: e.start }); writeLog(log); }
    var count = log.filter(function (r) { return r.id === id; }).length;
    SOUND.ok();
    toast(NAMES[id] + " 목격! " + (dup ? "이미 일지에 적어 두었어요." : "지금까지 " + count + "번 봤어요."));
    renderLog();
    makeCard(id, e, t, count, at);
  }
  function codeOf(id, start) { return (fnv(SALT + ":code:" + id + ":" + start) % 1679616).toString(36).toUpperCase(); }

  function makeCard(id, e, t, count, at) {
    var out = D.createElement("canvas"); out.width = 1080; out.height = 1350;
    var x = out.getContext("2d"), area = 960;
    var sw = cv.width, sh = Math.round(sw * area / 1080), sx = 0, sy = 0, fy = at ? at[1] * dpr : cv.height / 2, fx = at ? at[0] * dpr : cv.width / 2;
    if (sh > cv.height) { sh = cv.height; sw = Math.round(sh * 1080 / area); sx = clamp(Math.round(fx - sw / 2), 0, cv.width - sw); }
    else sy = clamp(Math.round(fy - sh / 2), 0, cv.height - sh);
    x.drawImage(cv, sx, sy, sw, sh, 0, 0, 1080, area);
    x.fillStyle = "#0F1830"; x.fillRect(0, area, 1080, 1350 - area);
    var k = kst(t);
    x.fillStyle = "#FFD36B"; x.font = "68px " + FONT_HEAD; x.textBaseline = "alphabetic"; x.fillText(NAMES[id] + " 목격", 72, area + 104);
    x.fillStyle = "#E6ECF7"; x.font = "34px " + FONT_BODY;
    x.fillText(k.y + "년 " + k.m + "월 " + k.d + "일 " + pad(k.h) + "시 " + pad(k.mi) + "분, 서울 하늘", 72, area + 164);
    x.fillStyle = "rgba(230,236,247,0.72)"; x.font = "29px " + FONT_BODY;
    x.fillText("같은 " + eunneun(NAMES[id]) + " 본 사람은 모두 같은 목격 번호를 받아요.", 72, area + 218);
    x.fillText("목격 번호 " + codeOf(id, e.start) + ", 내 " + count + "번째 목격", 72, area + 262);
    x.fillText(BASE.replace(/^https?:\/\//, "").replace(/\/$/, ""), 72, 1350 - 52);
    out.toBlob(function (blob) {
      var box = $("#card");
      if (!blob || !box) return;
      var file = null; try { file = new File([blob], "haneulbwa-" + id + ".png", { type: "image/png" }); } catch (er) { file = null; }
      var url = URL.createObjectURL(blob);
      box.hidden = false;
      box.innerHTML = '<h2>목격 카드</h2><img alt="' + esc(NAMES[id]) + ' 목격 카드" src="' + url + '" width="1080" height="1350">' +
        '<p class="card-act"><button class="btn ink" type="button" id="cardSave">카드 저장하기</button><button class="linkish" type="button" id="cardClose">닫기</button></p>';
      $("#cardClose").onclick = function () { box.hidden = true; };
      $("#cardSave").onclick = function () {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: "하늘봐 목격 카드" }).catch(function () { });
        else { var a = D.createElement("a"); a.href = url; a.download = "haneulbwa-" + id + ".png"; D.body.appendChild(a); a.click(); D.body.removeChild(a); }
      };
      box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }, "image/png");
  }

  function renderLog() {
    var box = $("#log"); if (!box) return;
    var log = readLog();
    if (!log.length) { box.innerHTML = "<p>아직 목격한 게 없어요. 무언가 지나갈 때 그 존재를 누르거나 목격하기 단추를 누르면 여기에 적혀요.</p>"; return; }
    var counts = {}; log.forEach(function (r) { counts[r.id] = (counts[r.id] || 0) + 1; });
    var rows = Object.keys(NAMES).filter(function (k) { return counts[k]; }).map(function (k) { return "<tr><th>" + esc(NAMES[k]) + "</th><td>" + counts[k] + "번</td></tr>"; }).join("");
    var recent = log.slice(-5).reverse().map(function (r) { return "<li>" + esc(dateKo(r.t) + " " + hm(r.t) + ", " + (NAMES[r.id] || r.id)) + "</li>"; }).join("");
    box.innerHTML = '<table class="tally">' + rows + '</table><p class="sub">최근 목격</p><ul class="recent">' + recent + "</ul>";
  }

  function forecastHTML(t) {
    var d0 = day0(t), w = whaleOn(d0), out = [];
    if (t < w.hintFrom) out.push("오늘 하늘고래는 " + hm(w.hintFrom) + "부터 세 시간 안에 지나가요.");
    else if (t < w.start) out.push("하늘고래가 " + hm(w.hintFrom) + "부터 세 시간 안에 지나가요. 지금이 그 시간대예요.");
    else if (t < w.end) out.push("지금 하늘고래가 지나가고 있어요.");
    else out.push("오늘 하늘고래는 " + hm(w.start) + "에 지나갔어요. 내일 또 와요.");
    var dg = dragonNear(t).filter(function (e) { return e.start >= d0 && e.start < d0 + DAY; })[0];
    if (dg) out.push(t < dg.start ? "오늘 밤 7시에서 자정 사이 어딘가에 청룡이 나타나요." : t < dg.end ? "지금 청룡이 지나가고 있어요." : "오늘 밤 청룡은 " + hm(dg.start) + "에 지나갔어요.");
    else out.push("청룡은 일주일에 한 번, 어느 날 밤에 나타나요. 오늘은 그날이 아니에요.");
    var ph = phoenixNear(t).filter(function (e) { return e.start >= d0 && e.start < d0 + DAY; })[0];
    if (ph) out.push(t < ph.start ? "오늘은 노을이 유난히 붉을 거래요." : t < ph.end ? "지금 봉황이 노을 속을 날고 있어요." : "오늘 해 질 무렵 봉황이 지나갔어요.");
    specialsAround(t).forEach(function (e) {
      if (e.start < d0 || e.start >= d0 + DAY) return;
      var nm = NAMES[e.id];
      out.push(t < e.start ? "오늘은 " + hm(e.start) + "부터 " + iga(nm) + " 보여요." : t < e.end ? STATUS[e.id] + "." : "오늘의 " + eunneun(nm) + " 끝났어요.");
    });
    var sh = showerRate(d0 + 22 * 3600e3);
    if (sh.rate > 1.5) out.push("오늘 밤은 " + sh.name + " 유성우 무렵이라 별똥별이 자주 떨어져요.");
    var wx = weatherAt(t);
    if (wx.kind) out.push(wx.kind === "rain" ? "지금 이 하늘에는 비가 와요. 하늘봐의 날씨는 실제 날씨와 달라요." : "지금 이 하늘에는 눈이 와요. 하늘봐의 날씨는 실제 날씨와 달라요.");
    return "<ul>" + out.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>";
  }

  var ALM = null;
  function loadAlmanac() {
    if (!W.fetch || !$("#almanac")) return;
    var y = kst(now()).y;
    if ((DATA.almYears || []).indexOf(y) < 0) return;
    fetch(BASE + "alm-" + y + ".json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) { ALM = j; lastSheet = 0; var a = $("#almanac"); if (a) a.innerHTML = almanacHTML(now()); } }).catch(function () { /* 계산값으로 보여 준다 */ });
  }
  function almanacHTML(t) {
    var d0 = day0(t), key = ymdStr(d0 + 3600e3), row = ALM && ALM[key], il = moonIllum(d0 + 21 * 3600e3);
    var sr, ss, mr2, ms;
    if (row) { sr = row[0]; ss = row[1]; mr2 = row[2]; ms = row[3]; il = { phase: row[4], fraction: row[5] }; }
    else {
      var s = crossings(d0, sunPos, -0.833), m = crossings(d0, moonPos, 0.133);
      sr = s.rise ? hm(s.rise) : ""; ss = s.set ? hm(s.set) : ""; mr2 = m.rise ? hm(m.rise) : ""; ms = m.set ? hm(m.set) : "";
    }
    var len = "";
    if (sr && ss) { var mins = (+ss.slice(0, 2) * 60 + +ss.slice(3)) - (+sr.slice(0, 2) * 60 + +sr.slice(3)); len = Math.floor(mins / 60) + "시간 " + (mins % 60) + "분"; }
    var k = kst(t), month = k.y + "-" + pad(k.m), link = DATA.months && DATA.months.indexOf(month) >= 0 ? '<p><a href="' + BASE + "sun/" + month + '.html">' + k.m + "월 해와 달 시각표 전체 보기</a></p>" : "";
    return '<table class="alm"><tr><th>해 뜨는 시각</th><td>' + (sr || "없음") + "</td></tr><tr><th>해 지는 시각</th><td>" + (ss || "없음") + "</td></tr>" +
      "<tr><th>낮의 길이</th><td>" + len + "</td></tr><tr><th>달 뜨는 시각</th><td>" + (mr2 || "오늘은 뜨지 않아요") + "</td></tr><tr><th>달 지는 시각</th><td>" + (ms || "오늘은 지지 않아요") + "</td></tr>" +
      "<tr><th>오늘 밤 달</th><td>" + phaseName(il.phase) + ", 밝은 부분 " + Math.round(il.fraction * 100) + "%</td></tr></table>" + link;
  }

  function upcomingHTML(t) {
    var H = DATA.holidays || {}, list = [], d0 = day0(t);
    var label = { seollal: "설날, 방패연이 떠요", boreum: "정월대보름, 소원 등불이 올라요", chilseok: "칠석, 오작교가 놓여요", chuseok: "추석, 보름달에 달토끼가 보여요" };
    Object.keys(H).forEach(function (k) {
      var ts = Date.parse(H[k] + "T00:00:00+09:00");
      if (ts >= d0) list.push({ ts: ts, text: label[k.split(":")[1]] || "" });
    });
    var k = kst(t);
    [k.y + 1].forEach(function (y) { list.push({ ts: Date.UTC(y, 0, 1) - KST, text: "새해 0시, 새해 불꽃이 터져요" }); });
    (DATA.showers || []).forEach(function (s) {
      [k.y, k.y + 1].forEach(function (y) { var ts = Date.UTC(y, s[0] - 1, s[1]) - KST; if (ts >= d0) list.push({ ts: ts, text: s[2] + " 유성우, 밤에 별똥별이 자주 떨어져요" }); });
    });
    list.sort(function (a, b) { return a.ts - b.ts; });
    return "<ul>" + list.slice(0, 5).map(function (x) {
      var dd = Math.round((x.ts - d0) / DAY);
      return "<li><b>" + (dd <= 0 ? "오늘" : "D-" + dd) + "</b> " + esc(dateKo(x.ts + 3600e3) + ", " + x.text) + "</li>";
    }).join("") + '</ul><p><a href="' + BASE + 'calendar.html">하늘봐 달력 전체 보기</a></p>';
  }

  /* 지금 보이는 일의 자리 */
  function focusOf(e, t) {
    if (isBeing(e)) {
      var bp = beingPos(e, t);
      if (e.id === "dragon" && ppd) bp.az = (bp.az + e.dir * 0.16 * beingSize("dragon") / ppd + 360) % 360;
      return bp;
    }
    if (e.id === "bridge") { var B = bridgeFrame(t); return { az: B.caz, alt: 44 }; }
    if (e.id === "rabbit") { var m = moonPos(t); return { az: m.az, alt: m.alt }; }
    return { az: 184, alt: 26 };
  }
  function visibleNow(e, t) {
    var f = focusOf(e, t);
    if (e.id === "rabbit" && f.alt < 0) return false;
    return inView(f.az, isBeing(e) ? 6 : 2) && f.alt > altBase() - 3 && f.alt < altBase() + Ht / ppd + 3;
  }
  function primary(t) {
    var act = activeAt(t).filter(function (e) { return NAMES[e.id] && (e.id !== "rabbit" || moonPos(t).alt > 0); });
    act.sort(function (a, b) { return isBeing(b) - isBeing(a); });
    return act[0] || null;
  }

  var lastSheet = 0, lastTheme = "", lastStatus = "", lastDir = "", lastBtn = "";
  function updateUI(t) {
    var st = stateCache, status = $("#status"), wbtn = $("#witness"), dir = $("#dir"), e = primary(t);
    var txt = "서울 하늘, " + hms(t);
    if (e) txt += ". " + STATUS[e.id];
    else { var ap = approaching(t, 120e3)[0]; if (ap) txt += ". 멀리서 " + NAMES[ap.id] + " 소리가 들려요"; }
    if (status && txt !== lastStatus) { status.textContent = txt; lastStatus = txt; }
    if (wbtn) {
      var b = "", id = "";
      if (e && visibleNow(e, t)) { b = NAMES[e.id] + " 목격하기"; id = e.id; }
      else if (e) { var f = focusOf(e, t); b = eunneun(NAMES[e.id]) + " " + (wrap180(f.az - camAz) > 0 ? "오른쪽" : "왼쪽") + "에 있어요"; }
      if (b !== lastBtn) { lastBtn = b; wbtn.hidden = !b; wbtn.textContent = b; wbtn.setAttribute("data-id", id); }
    }
    var dt = dirName(camAz) + " 하늘을 보고 있어요. 옆으로 밀어서 둘러보세요.";
    if (dir && dt !== lastDir) { dir.textContent = dt; lastDir = dt; }
    if (st.theme && st.theme !== lastTheme) {
      lastTheme = st.theme; D.documentElement.setAttribute("data-sky", st.theme);
      var mt = $('meta[name="theme-color"]'); if (mt) mt.setAttribute("content", st.theme === "night" ? "#0F1830" : st.theme === "dusk" ? "#F3E6EC" : "#EAF3FB");
    }
    if (t - lastSheet > 30000) { lastSheet = t; renderSheet(t); }
  }
  function renderSheet(t) {
    var f = $("#forecast"); if (f) f.innerHTML = forecastHTML(t);
    var a = $("#almanac"); if (a) a.innerHTML = almanacHTML(t);
    var u = $("#upcoming"); if (u) u.innerHTML = upcomingHTML(t);
  }

  /* camera follow */
  function focusAz(t) {
    var e = primary(t);
    if (e) return focusOf(e, t).az;
    var ap = approaching(t, 90e3)[0];
    if (ap) return (ap.az0 + ap.dir * 12 + 360) % 360;
    var m = moonPos(t); if (m.alt > 3) return m.az;
    var s = sunPos(t); if (s.alt > -2 && s.alt < 20) return s.az;
    if (s.alt < -12) {
      var best = null;
      for (var i = 0; i < GAL.length; i += 2) { var g = starPos(GAL[i].ra, GAL[i].dec, t); if (g.alt > 12 && g.alt < 55 && (!best || g.alt > best.alt)) best = g; }
      if (best) return best.az;
    }
    return 180;
  }
  /* 볼거리가 화면 위에서 AIM만큼 내려온 자리에 오도록 올려다보는 각도를 정한다 */
  var AIM = DATA.aim || 0.46, MAXALT = DATA.maxAlt || 16;
  function focusAlt(t) {
    var e = primary(t), target;
    if (e) target = focusOf(e, t).alt;
    else { var m = moonPos(t); target = m.alt > 3 ? m.alt : 30; }
    return clamp(target + 5 - (1 - AIM) * SPAN, 0, BAND ? 0 : MAXALT);
  }

  var raf = 0, lastF = 0, frameGap = reduced ? 1000 / 8 : 1000 / 30, firstFrame = true, BAND = false;
  function loop(ts) {
    raf = W.requestAnimationFrame(loop);
    if (ts - lastF < frameGap) return;
    lastF = ts;
    var t = now();
    if (follow && Date.now() - lastTouch > 8000) {
      var target = focusAz(t), d = wrap180(target - camAz);
      camAz = firstFrame ? target : (camAz + d * 0.05 + 360) % 360;
      camAlt = firstFrame ? focusAlt(t) : lerp(camAlt, focusAlt(t), 0.04);
    }
    firstFrame = false;
    frame();
    updateUI(t);
    soundTick(t);
  }

  function bindPan() {
    var down = null, moved = 0, lastTap = 0;
    cv.addEventListener("pointerdown", function (e) { down = { x: e.clientX, y: e.clientY, az: camAz, alt: camAlt, mouse: e.pointerType === "mouse" }; moved = 0; });
    cv.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - down.x, dy = e.clientY - down.y; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (moved < 6) return;
      camAz = (down.az - dx / ppd + 360) % 360;
      if (down.mouse) camAlt = clamp(down.alt + dy / ppd, 0, 16);
      lastTouch = Date.now();
    });
    function up(e) {
      if (!down) return;
      if (moved < 8) {
        var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, hit = null;
        hits.forEach(function (h) { var d = Math.hypot(h.x - x, h.y - y); if (d < h.r + 16 && (!hit || d < hit.d)) hit = { id: h.id, d: d, x: h.x, y: h.y }; });
        if (hit) { audio(); witness(hit.id, [hit.x, hit.y]); }
        else if (Date.now() - lastTap < 350) { lastTouch = 0; follow = true; }
        lastTap = Date.now();
      }
      down = null;
    }
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", function () { down = null; });
    W.addEventListener("keydown", function (e) {
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") { camAz = (camAz + (e.key === "ArrowLeft" ? -8 : 8) + 360) % 360; lastTouch = Date.now(); }
    });
  }

  function initSound() {
    var b = $("#snd"); if (!b) return;
    function paint() { b.setAttribute("aria-pressed", soundOn ? "true" : "false"); b.textContent = soundOn ? "소리 끄기" : "소리 켜기"; }
    paint(); b.hidden = false;
    b.addEventListener("click", function () {
      soundOn = !soundOn;
      try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignore */ }
      if (soundOn) { audio(); startWind(); SOUND.tick(); } else stopWind();
      paint();
    });
    if (soundOn) {
      var unlock = function () { audio(); startWind(); D.removeEventListener("pointerdown", unlock); };
      D.addEventListener("pointerdown", unlock);
    }
  }

  function fromBanner() {
    var box = $("#from"), id = DATA.from; if (!box || !id || !NAMES[id]) return;
    var m = /[?&]at=([0-9a-z]{1,9})(?:&|$)/.exec(location.search), t = now(), at = m ? parseInt(m[1], 36) * 60000 : NaN;
    if (isNaN(at) || Math.abs(at - t) > 40 * DAY) at = NaN;
    var nm = NAMES[id], e = isNaN(at) ? null : bigEvents(at + 1000).filter(function (x) { return x.id === id && Math.abs(x.start - at) < 60000; })[0];
    var live = activeAt(t).filter(function (x) { return x.id === id; })[0], msg;
    if (live) msg = "친구가 보낸 하늘이에요. " + iga(nm) + " 아직 여기 있어요. 하늘을 잘 보세요!";
    else if (e && e.start > t) msg = "친구가 보낸 " + eunneun(nm) + " " + whenKo(e.start) + "에 지나가요. 그때 다시 열어 보세요.";
    else if (e) msg = "친구가 " + whenKo(e.start) + "에 본 " + eunneun(nm) + " 이미 지나갔어요. " + nextText(id, t);
    else msg = "친구가 서울 하늘에서 " + iga(nm) + " 지나가는 걸 봤대요. " + nextText(id, t);
    box.textContent = msg; box.hidden = false;
  }

  function initSky() {
    cv = $("#skyCanvas"); if (!cv) return false;
    BAND = cv.hasAttribute("data-band");
    if (BAND) { SPAN = 46; frameGap = 1000 / 12; }
    if (+cv.getAttribute("data-span")) SPAN = +cv.getAttribute("data-span");
    cx2 = cv.getContext("2d");
    resize(); W.addEventListener("resize", resize);
    if (!BAND) bindPan();
    var wb = $("#witness"); if (wb) wb.addEventListener("click", function () {
      var id = wb.getAttribute("data-id"); audio();
      if (id) { var e = activeAt(now()).filter(function (x) { return x.id === id; })[0], f = e ? focusOf(e, now()) : null; witness(id, f ? [X(f.az), Y(f.alt)] : null); }
      else { lastTouch = 0; follow = true; }
    });
    var sb = $("#share"); if (sb) sb.addEventListener("click", doShare);
    D.addEventListener("visibilitychange", function () { if (D.hidden) { W.cancelAnimationFrame(raf); raf = 0; } else if (!raf) { lastSheet = 0; raf = W.requestAnimationFrame(loop); } });
    raf = W.requestAnimationFrame(loop);
    return true;
  }

  /* ---------- 도감 그림 (하늘에 사는 것들 페이지) ---------- */
  function specBg(c, w, h, kind) {
    var g = c.createLinearGradient(0, 0, 0, h), cols = kind === "day" ? ["#3F84D3", "#B5DAF5"] : kind === "dusk" ? ["#2E3470", "#F29A6B"] : ["#070D24", "#26336A"];
    g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    if (kind !== "day") {
      var r = rng(fnv("spec-stars" + w));
      for (var i = 0; i < 70; i++) { c.fillStyle = "rgba(255,250,235," + (0.25 + r() * 0.6) * (kind === "dusk" ? 0.5 : 1) + ")"; circle(c, r() * w, r() * h * 0.8, 0.5 + r() * 1.2); c.fill(); }
    }
  }
  function specGround(c, w, h, kind) {
    var r = rng(fnv("spec-city")), x = 0;
    c.fillStyle = kind === "day" ? "#34405A" : kind === "dusk" ? "#2A2240" : "#0E1226";
    while (x < w) {
      var bw = 18 + r() * 34, bh = 10 + r() * 34;
      c.fillRect(x, h - bh, bw, bh);
      if (kind !== "day") { c.fillStyle = "rgba(255,215,140,0.8)"; for (var k = 0; k < 4; k++) if (r() < 0.5) c.fillRect(x + 4 + r() * (bw - 8), h - bh + 5 + r() * (bh - 9), 2.5, 2.5); c.fillStyle = kind === "dusk" ? "#2A2240" : "#0E1226"; }
      x += bw + 1;
    }
  }
  function drawSpecimen(cnv, id, tt) {
    var dp = Math.min(W.devicePixelRatio || 1, 2), w = cnv.clientWidth, h = cnv.clientHeight;
    if (!w || !h) return;
    if (cnv.width !== Math.round(w * dp)) { cnv.width = Math.round(w * dp); cnv.height = Math.round(h * dp); }
    var c = cnv.getContext("2d"); c.setTransform(dp, 0, 0, dp, 0, 0);
    var kind = { kites: "day", everyday: "day", phoenix: "dusk" }[id] || "night";
    specBg(c, w, h, kind);
    var m = Math.min(w, h * 2), i;
    if (id === "whale") drawWhale(c, w / 2, h * 0.46, Math.min(w * 0.72, h * 1.45), tt, 1, true, false);
    else if (id === "dragon") drawDragon(c, w / 2 - m * 0.04, h * 0.46, Math.min(w * 0.9, h * 2.3), tt, 1);
    else if (id === "phoenix") drawPhoenix(c, w * 0.6, h * 0.42, Math.min(w * 0.3, h * 0.6), tt, -1);
    else if (id === "kites") { for (i = 0; i < 3; i++) drawKite(c, w * (0.28 + i * 0.22), h * (0.3 + (i % 2) * 0.16), Math.min(w, h * 2) * 0.09, tt, i, h + 20); }
    else if (id === "lanterns") {
      for (i = 0; i < 14; i++) {
        var lr = rng(fnv("spl" + i)), per = 14 + lr() * 10, ph = ((tt + lr() * per) % per) / per;
        drawLantern(c, w * (0.08 + lr() * 0.84), h * (1.02 - ph * 0.95), h * (0.07 - ph * 0.035), tt, i);
      }
    } else if (id === "bridge") {
      c.save(); c.translate(w / 2, h / 2); c.rotate(-0.5);
      var g = c.createLinearGradient(-w * 0.12, 0, w * 0.12, 0); g.addColorStop(0, "rgba(205,214,255,0)"); g.addColorStop(0.5, "rgba(205,214,255,0.3)"); g.addColorStop(1, "rgba(205,214,255,0)");
      c.fillStyle = g; c.fillRect(-w * 0.12, -h * 2, w * 0.24, h * 4); c.restore();
      var vx = w * 0.24, vy = h * 0.34, ax = w * 0.76, ay = h * 0.56, n = 26;
      for (i = 0; i < n; i++) { var s = i / (n - 1); drawMagpie(c, lerp(vx, ax, s), lerp(vy, ay, s) - Math.sin(s * Math.PI) * h * 0.14, h * 0.0075, tt + i * 0.37, i % 2 ? 1 : -1); }
      [[vx, vy, "직녀성"], [ax, ay, "견우성"]].forEach(function (q) {
        c.shadowColor = "rgba(255,250,230,0.9)"; c.shadowBlur = 14; c.fillStyle = "#FFFBEA"; circle(c, q[0], q[1], 3); c.fill(); c.shadowBlur = 0; c.shadowColor = "transparent";
        c.fillStyle = "rgba(255,246,216,0.9)"; c.font = "14px " + FONT_BODY; c.textAlign = "center"; c.fillText(q[2], q[0], q[1] + (q[2] === "직녀성" ? -12 : 22));
      });
    } else if (id === "rabbit") {
      var mr = h * 0.32;
      c.shadowColor = "rgba(255,248,220,0.6)"; c.shadowBlur = 30; c.fillStyle = "#FBF3D9"; circle(c, w / 2, h * 0.47, mr); c.fill(); c.shadowBlur = 0; c.shadowColor = "transparent";
      drawRabbit(c, w / 2, h * 0.47, mr, tt);
    } else if (id === "fireworks") {
      for (var sl = Math.floor(tt / 0.9) - 3; sl <= Math.floor(tt / 0.9); sl++) {
        var fr = rng(fnv("spf" + sl)), st = sl * 0.9, age = tt - st;
        if (age < 0 || age > 2.4) continue;
        var fx = w * (0.15 + fr() * 0.7), fy = h * (0.2 + fr() * 0.4), rr = h * (0.12 + fr() * 0.12) * ease(age / 0.9), hue = Math.floor(fr() * 360);
        c.fillStyle = "hsla(" + hue + ",90%,70%," + (1 - age / 2.4) + ")";
        for (var k = 0; k < 36; k++) { var an = k / 36 * Math.PI * 2; circle(c, fx + Math.cos(an) * rr, fy + Math.sin(an) * rr + age * age * 5, 1.7); c.fill(); }
      }
    } else if (id === "meteors") {
      for (var ms = Math.floor(tt / 1.3) - 1; ms <= Math.floor(tt / 1.3); ms++) {
        var mr2 = rng(fnv("spm" + ms)), mage = tt - ms * 1.3;
        if (mage < 0 || mage > 1.1) continue;
        var x0 = w * (0.2 + mr2() * 0.7), y0 = h * (0.08 + mr2() * 0.3), len = h * (0.3 + mr2() * 0.3), p = ease(mage / 0.8), x1 = x0 - len * p, y1 = y0 + len * 0.55 * p;
        var gr = c.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,240," + (1 - mage / 1.1) + ")");
        c.strokeStyle = gr; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      }
    } else if (id === "everyday") {
      var px = ((tt * 18) % (w + 120)) - 60;
      c.strokeStyle = "rgba(255,255,255,0.7)"; c.lineWidth = 1.4; c.beginPath(); c.moveTo(px, h * 0.24); c.lineTo(px - Math.min(px + 60, w * 0.5), h * 0.24); c.stroke();
      c.fillStyle = "rgba(40,50,70,0.85)"; c.fillRect(px - 4, h * 0.24 - 1.5, 8, 3);
      c.strokeStyle = "rgba(30,36,50,0.75)"; c.lineWidth = 1.5; c.lineCap = "round";
      for (i = 0; i < 7; i++) {
        var row = Math.ceil(i / 2) * (i % 2 ? 1 : -1), bx = w * 0.6 - Math.abs(row) * 14 + ((tt * 10) % 40), by = h * 0.5 + row * 7, fl = Math.sin(tt * 8 + i) * 3;
        c.beginPath(); c.moveTo(bx - 5, by - fl); c.quadraticCurveTo(bx - 2, by - 1, bx, by); c.quadraticCurveTo(bx + 2, by - 1, bx + 5, by - fl); c.stroke();
      }
      c.fillStyle = "rgba(255,255,255,0.9)";
      [[0.18, 0.62, 26], [0.78, 0.3, 20]].forEach(function (cl) { for (var q = 0; q < 4; q++) { circle(c, w * cl[0] + (q - 1.5) * cl[2] * 0.8, h * cl[1] - (q % 2) * cl[2] * 0.3, cl[2] * 0.6); c.fill(); } });
    }
    specGround(c, w, h, kind);
  }
  function initSpecimens() {
    var list = Array.prototype.slice.call(D.querySelectorAll("canvas.specimen[data-being]"));
    if (!list.length) return;
    var vis = list.map(function () { return true; });
    if (W.IntersectionObserver) {
      var io = new IntersectionObserver(function (ents) { ents.forEach(function (en) { vis[list.indexOf(en.target)] = en.isIntersecting; }); });
      list.forEach(function (cn) { io.observe(cn); });
    }
    var last = 0;
    function tick(ts) {
      if (!D.hidden && ts - last > (reduced ? 1e9 : 50)) {
        last = ts;
        list.forEach(function (cn, i) { if (vis[i]) drawSpecimen(cn, cn.getAttribute("data-being"), ts / 1000); });
      }
      if (!reduced) W.requestAnimationFrame(tick);
    }
    list.forEach(function (cn) { drawSpecimen(cn, cn.getAttribute("data-being"), 3.2); });
    if (!reduced) W.requestAnimationFrame(tick);
    W.addEventListener("resize", function () { list.forEach(function (cn) { cn.width = 0; drawSpecimen(cn, cn.getAttribute("data-being"), now() / 1000); }); });
  }
  /* 달력과 시각표에서 오늘 줄을 칠하고 지난 날을 흐리게 */
  function markDates() {
    var today = ymdStr(now());
    Array.prototype.forEach.call(D.querySelectorAll("tr[data-date]"), function (tr) {
      var d = tr.getAttribute("data-date");
      if (d === today) tr.classList.add("today");
      else if (d < today && tr.closest(".cal")) tr.classList.add("past");
    });
  }

  function boot() {
    D.documentElement.setAttribute("data-sky", themeOf(sunPos(now()).alt));
    syncClock();
    initSound();
    initSky();
    renderLog();
    fromBanner();
    loadAlmanac();
    renderSheet(now());
    initSpecimens();
    markDates();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();

  W.__haneul = {
    whaleOn: whaleOn, dragonNear: dragonNear, phoenixNear: phoenixNear, activeAt: activeAt, approaching: approaching, sunPos: sunPos, moonPos: moonPos, moonIllum: moonIllum,
    crossings: crossings, day0: day0, specialsAround: specialsAround, showerRate: showerRate, weatherAt: weatherAt, bigEvents: bigEvents, codeOf: codeOf,
    setOffset: function (ms) { OFFSET = ms; lastSheet = 0; lastBtn = "x"; memo = {}; firstFrame = true; lastTouch = 0; follow = true; },
    look: function (az, alt) { camAz = az; camAlt = alt || 0; follow = false; lastTouch = Date.now(); },
    follow: function () { follow = true; lastTouch = 0; firstFrame = true; },
    bench: function (n) { var t0 = performance.now(); for (var i = 0; i < n; i++) frame(); return (performance.now() - t0) / n; },
    draw: { whale: drawWhale, dragon: drawDragon, phoenix: drawPhoenix, magpie: drawMagpie, kite: drawKite, lantern: drawLantern, rabbit: drawRabbit, specimen: drawSpecimen }
  };
})();
