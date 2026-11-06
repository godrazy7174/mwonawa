/* 링쿠 — 링크 속에 사는 생물.
   생명체의 유전자는 링크 주소(?k=)에 들어 있다. 서버는 없다.
   알 링크를 열면 부모 유전자에 이 기기만의 난수를 섞어 다음 세대가 태어나고,
   그 아이가 다시 알 링크를 만든다. 기록은 이 브라우저의 localStorage에만 남는다. */
(function () {
  "use strict";
  var W = window, D = document;
  var reduced = W.matchMedia && W.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- utils ---------- */
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fnv(str, h) {
    h = h === undefined ? 0x811c9dc5 : h;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function fnvBytes(a, salt) {
    var h = fnv(salt);
    for (var i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rand32() {
    try { if (W.crypto && W.crypto.getRandomValues) return W.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; } catch (e) { /* fall through */ }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }
  function f1(x) { return Math.round(x * 10) / 10; }
  function bin(v, n) { return Math.min(n - 1, Math.floor(v * n / 256)); }

  /* 받침 유무로 조사 고르기 */
  function hasBatchim(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28 !== 0;
    return /[136780lmnr]$/i.test(word);
  }
  function rieul(word) {
    var c = String(word).charCodeAt(String(word).length - 1);
    return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 === 8;
  }
  var josa = {
    ig: function (w) { return w + (hasBatchim(w) ? "이" : "가"); },
    eun: function (w) { return w + (hasBatchim(w) ? "은" : "는"); },
    eul: function (w) { return w + (hasBatchim(w) ? "을" : "를"); },
    ro: function (w) { return w + (hasBatchim(w) && !rieul(w) ? "으로" : "로"); },
    wa: function (w) { return w + (hasBatchim(w) ? "과" : "와"); },
    a: function (w) { return w + (hasBatchim(w) ? "아" : "야"); }
  };

  /* ---------- base64url & bytes ---------- */
  function b64e(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64d(str) {
    str = String(str).replace(/-/g, "+").replace(/_/g, "/");
    while (str.length % 4) str += "=";
    var bin = atob(str), out = [];
    for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
    return out;
  }
  function Writer() { this.a = []; }
  Writer.prototype = {
    u8: function (v) { this.a.push(v & 255); return this; },
    u16: function (v) { return this.u8(v >>> 8).u8(v); },
    u24: function (v) { return this.u8(v >>> 16).u8(v >>> 8).u8(v); },
    u32: function (v) { return this.u16(v >>> 16).u16(v & 0xffff); },
    bytes: function (arr) { for (var i = 0; i < arr.length; i++) this.u8(arr[i]); return this; },
    name: function (s) {
      s = String(s || "").slice(0, 6);
      this.u8(s.length);
      for (var i = 0; i < s.length; i++) this.u16(s.charCodeAt(i));
      return this;
    },
    seal: function (salt) { return this.u16(fnvBytes(this.a, salt) & 0xffff).a; }
  };
  function Reader(a) { this.a = a; this.i = 0; }
  Reader.prototype = {
    u8: function () { if (this.i >= this.a.length) throw new Error("short"); return this.a[this.i++]; },
    u16: function () { return (this.u8() << 8) | this.u8(); },
    u24: function () { return (this.u8() << 16) | (this.u8() << 8) | this.u8(); },
    u32: function () { return ((this.u16() << 16) >>> 0) + this.u16(); },
    bytes: function (n) { var o = []; for (var k = 0; k < n; k++) o.push(this.u8()); return o; },
    name: function () {
      var n = this.u8(), s = "";
      if (n > 6) throw new Error("name");
      for (var k = 0; k < n; k++) s += String.fromCharCode(this.u16());
      return cleanName(s);
    },
    check: function (salt) {
      var body = this.a.slice(0, this.i), sum = this.u16();
      if ((fnvBytes(body, salt) & 0xffff) !== sum) throw new Error("sum");
      if (this.i !== this.a.length) throw new Error("tail");
    }
  };

  /* 이름: 한글 음절, 영문, 숫자만, 6자까지 */
  var BAD = ["씨발", "시발", "씨팔", "병신", "좆", "존나", "개새", "새끼", "지랄", "애미", "느금", "섹스", "보지", "자지", "닥쳐", "꺼져", "fuck", "shit", "bitch", "sex"];
  function cleanName(s) {
    return String(s || "").replace(/[^가-힣A-Za-z0-9]/g, "").slice(0, 6);
  }
  function nameProblem(s) {
    var low = String(s).toLowerCase();
    for (var i = 0; i < BAD.length; i++) if (low.indexOf(BAD[i]) >= 0) return "다른 이름을 써 주세요.";
    return "";
  }

  /* ---------- tables ---------- */
  var PAL = ["#FF6B6B", "#FF8A5B", "#FFA94D", "#FFC94D", "#FFE066", "#D8E86A", "#A9DE6B", "#74CF7C", "#3FBF8F", "#2EC4B6",
    "#45C6E6", "#5BB5F5", "#5D95F5", "#6C7CF0", "#8573EE", "#A07CF0", "#BF7EEA", "#DD7EDB", "#F27BC0", "#FF86A8",
    "#FF9E9E", "#D9A57A", "#B59A86", "#9AA6B8"];
  var COLOR_KO = ["빨강", "다홍", "주황", "귤빛", "노랑", "레몬", "연두", "풀빛", "비취", "청록", "물빛", "하늘", "파랑", "쪽빛",
    "남보라", "보라", "자주", "연자주", "분홍", "복숭아", "산호", "모래", "흙빛", "잿빛"];
  var COLOR_ADJ = ["빨간", "다홍빛", "주황빛", "귤빛", "노란", "레몬색", "연둣빛", "풀빛", "비취색", "청록빛", "물빛", "하늘빛", "파란", "쪽빛",
    "남보라색", "보랏빛", "자줏빛", "연자주색", "분홍빛", "복숭아색", "산호색", "모래색", "흙빛", "잿빛"];
  var COLOR_NOUN = ["빨간색", "다홍색", "주황색", "귤색", "노란색", "레몬색", "연두색", "풀색", "비취색", "청록색", "물색", "하늘색", "파란색", "쪽빛",
    "남보라색", "보라색", "자주색", "연자주색", "분홍색", "복숭아색", "산호색", "모래색", "흙색", "잿빛"];
  var COLOR_LA = ["ruber", "ruber", "aurantiacus", "aurantiacus", "flavus", "flavus", "viridulus", "viridis", "viridis", "cyaneus",
    "cyaneus", "caeruleus", "caeruleus", "indicus", "violaceus", "violaceus", "purpureus", "purpureus", "roseus", "roseus",
    "corallinus", "arenarius", "fuscus", "cinereus"];
  var SHAPE_KO = ["방울형", "콩형", "떡형", "물방울형", "종형", "고구마형", "별사탕형", "구름형"];
  var PATTERN_KO = ["무늬 없음", "점박이 무늬", "줄무늬", "주근깨", "얼룩", "배띠"];
  var PATTERN_WORD = ["", "점박이", "줄무늬", "주근깨", "얼룩", "배띠"];
  var PATTERN_LA = ["", "punctatus", "striatus", "lentiginosus", "maculatus", "zonatus"];
  var EYES_KO = ["점눈", "동그란 눈", "졸린 눈", "왕눈", "웃는 눈", "외눈"];
  var MOUTH_KO = ["작은 미소", "오 모양 입", "고양이 입", "토끼 이빨", "메롱", "일자 입", "함박웃음"];
  var HEAD_KO = ["", "더듬이 하나", "더듬이 둘", "둥근 귀", "뾰족한 귀", "작은 뿔", "새싹", "머리털"];
  var HEAD_WORD = ["", "더듬이", "더듬이", "귀", "귀", "뿔", "새싹", "털"];
  var HEAD_LA = ["", "antennatus", "antennatus", "auritus", "acutus", "cornutus", "germinans", "comatus"];
  var LIMB_KO = ["", "두 발", "팔과 발", "촉수", "네 발"];
  var TAIL_KO = ["", "돌돌 꼬리", "짧은 꼬리", "긴 꼬리", "복슬 꼬리"];
  var TEMPER_KO = ["느긋함", "호기심 많음", "겁 많음", "장난꾸러기", "다정함", "새침함", "씩씩함", "잠꾸러기"];
  var LIN_A = ["새벽", "은빛", "푸른", "작은", "느린", "따스한", "조용한", "반짝", "바람", "보름", "구름", "이슬", "노을", "별빛", "첫눈", "단풍"];
  var LIN_B = ["방울", "씨앗", "조약돌", "파도", "등불", "솜털", "메아리", "새싹", "물결", "종이배", "풍선", "단추", "구슬", "꽃잎", "모래", "연기"];
  var NAME_A = ["몽", "콩", "뽀", "말", "꼬", "도", "보", "미", "뭉", "포", "동", "방", "똘", "찌", "토", "부", "쪼", "루", "모", "치", "두", "파", "소", "누"];
  var NAME_B = ["실", "랑", "울", "글", "리", "롱", "동", "치", "미", "니", "순", "봉", "구", "돌", "망", "링", "빙", "콩", "람", "솔"];

  /* 돌연변이: min 세대부터 나올 수 있고, p는 한 번 깨어날 때 생길 확률(세대가 깊을수록 최대 3배까지 오른다) */
  var RARE = [
    { id: "eggcap", ko: "껍데기 모자", la: "pileatus", min: 1, p: 0.03, keep: 0 },
    { id: "heart", ko: "하트 무늬", la: "cordatus", min: 1, p: 0.015, keep: 0.8 },
    { id: "stareyes", ko: "별눈", la: "stellatus", min: 3, p: 0.012, keep: 0.8 },
    { id: "flower", ko: "머리꽃", la: "floridus", min: 5, p: 0.012, keep: 0.8 },
    { id: "thirdeye", ko: "세 번째 눈", la: "trioculatus", min: 8, p: 0.01, keep: 0.8 },
    { id: "rainbow", ko: "무지개 줄무늬", la: "iridescens", min: 12, p: 0.01, keep: 0.8 },
    { id: "flame", ko: "불꽃 머리", la: "flammeus", min: 16, p: 0.009, keep: 0.8 },
    { id: "glass", ko: "유리 몸", la: "vitreus", min: 20, p: 0.008, keep: 0.8 },
    { id: "wings", ko: "날개", la: "alatus", min: 25, p: 0.008, keep: 0.8 },
    { id: "comet", ko: "별똥 꼬리", la: "cometes", min: 30, p: 0.007, keep: 0.8 },
    { id: "gold", ko: "금빛 몸", la: "aureus", min: 40, p: 0.006, keep: 0.8 },
    { id: "crown", ko: "왕관 뿔", la: "coronatus", min: 50, p: 0.006, keep: 0.8 },
    { id: "twin", ko: "쌍둥이 머리", la: "geminus", min: 70, p: 0.005, keep: 0.8 },
    { id: "galaxy", ko: "은하 무늬", la: "galacticus", min: 100, p: 0.005, keep: 0.8 },
    { id: "halo", ko: "후광", la: "sanctus", min: 150, p: 0.004, keep: 0.8 },
    { id: "guest", ko: "작은 손님", la: "hospitalis", min: 300, p: 0.004, keep: 0.8 }
  ];
  var RARE_BY = {};
  RARE.forEach(function (t, i) { t.bit = 1 << i; RARE_BY[t.id] = t; });
  function hasRare(rare, id) { return !!(rare & RARE_BY[id].bit); }

  /* ---------- genetics ---------- */
  var GENES = 13;
  function randomGenes(r) { var g = []; for (var i = 0; i < GENES; i++) g.push(Math.floor(r() * 256)); return g; }

  function hatchFrom(parent, seed) {
    var r = rng(seed), genes = parent.genes.slice();
    for (var i = 0; i < GENES; i++) {
      var x = r();
      if (x < 0.06) genes[i] = Math.floor(r() * 256);
      else if (x < 0.28) genes[i] = clamp(genes[i] + Math.round((r() < 0.5 ? -1 : 1) * (4 + r() * 16)), 0, 255);
    }
    var gen = Math.min(65535, parent.gen + 1), rare = 0, gained = [], lost = [];
    RARE.forEach(function (t) {
      if (parent.rare & t.bit) {
        if (t.keep > 0 && r() < t.keep) rare |= t.bit;
        else if (t.keep > 0) lost.push(t.id);
      }
    });
    RARE.forEach(function (t) {
      if ((rare & t.bit) || gen < t.min) return;
      var pe = Math.min(t.p * (1 + gen / 60), t.p * 3);
      if (r() < pe) { rare |= t.bit; gained.push(t.id); }
    });
    return { genes: genes, rare: rare, gen: gen, gained: gained, lost: lost };
  }

  function founderFrom(seed) {
    var r = rng(seed), rare = 0, gained = [];
    var genes = randomGenes(r);
    if (r() < RARE_BY.eggcap.p) { rare |= RARE_BY.eggcap.bit; gained.push("eggcap"); }
    if (r() < RARE_BY.heart.p) { rare |= RARE_BY.heart.bit; gained.push("heart"); }
    return { genes: genes, rare: rare, gen: 1, gained: gained, lost: [], lin: Math.floor(r() * 0xffffff) };
  }

  /* ---------- link codecs ---------- */
  var EGG = 0x11, OWN = 0x21;
  function encodeEgg(cr, deviceTag) {
    var w = new Writer().u8(EGG).u24(cr.lin).u16(cr.gen).bytes(cr.genes).u16(cr.rare).u16(deviceTag)
      .name(cr.founder).name(cr.name).name(cr.keeper);
    return b64e(w.seal("linku-egg"));
  }
  function decodeEgg(k) {
    var rd = new Reader(b64d(k));
    if (rd.u8() !== EGG) throw new Error("type");
    var e = { lin: rd.u24(), gen: rd.u16(), genes: rd.bytes(GENES), rare: rd.u16(), tag: rd.u16() };
    e.founder = rd.name(); e.name = rd.name(); e.keeper = rd.name();
    rd.check("linku-egg");
    if (e.gen < 1) throw new Error("gen");
    return e;
  }
  var EPOCH = Date.UTC(2026, 0, 1);
  function encodeOwner(cr) {
    var mins = Math.max(0, Math.round((cr.birth - EPOCH) / 60000));
    var w = new Writer().u8(OWN).u24(cr.lin).u16(cr.gen).bytes(cr.genes).u16(cr.rare).u32(mins)
      .name(cr.founder).name(cr.name).name(cr.keeper).name(cr.parentName).name(cr.giver);
    w.bytes(cr.pgenes || cr.genes).u16(cr.prare || 0);
    return b64e(w.seal("linku-own"));
  }
  function decodeOwner(k) {
    var rd = new Reader(b64d(k));
    if (rd.u8() !== OWN) throw new Error("type");
    var c = { lin: rd.u24(), gen: rd.u16(), genes: rd.bytes(GENES), rare: rd.u16() };
    c.birth = EPOCH + rd.u32() * 60000;
    c.founder = rd.name(); c.name = rd.name(); c.keeper = rd.name(); c.parentName = rd.name(); c.giver = rd.name();
    c.pgenes = rd.bytes(GENES); c.prare = rd.u16();
    rd.check("linku-own");
    return c;
  }

  /* ---------- phenotype & names ---------- */
  function pheno(genes, rare, birth, now) {
    var g = genes;
    var p4 = g[4], pattern = p4 < 96 ? 0 : p4 < 136 ? 1 : p4 < 166 ? 2 : p4 < 196 ? 3 : p4 < 226 ? 4 : 5;
    var age = birth ? Math.max(0, ((now || Date.now()) - birth) / 3600000) : 999;
    return {
      shape: bin(g[0], 8), shapeVar: (g[0] % 32) / 31,
      aspect: 0.86 + (g[1] / 255) * 0.32,
      hue: bin(g[2], 24), tone: bin(g[3], 3),
      pattern: pattern, patOff: [6, 12, 18, 0, 3, 21][bin(g[5], 6)], belly: bin(g[5], 6) >= 3,
      eyes: bin(g[6], 6), mouth: bin(g[7], 7), head: bin(g[8], 8),
      limbs: bin(g[9], 5), tail: bin(g[10], 5),
      voice: g[11], temper: bin(g[12], 8), blush: g[12] >= 96,
      seed: fnv(g.join(",")),
      rare: rare || 0,
      stage: age < 24 ? 0 : age < 72 ? 1 : 2, ageH: age
    };
  }
  function bodyColor(ph) {
    if (ph.rare & RARE_BY.gold.bit) return "#F2C230";
    if (ph.rare & RARE_BY.galaxy.bit) return "#2E2457";
    var base = PAL[ph.hue];
    return ph.tone === 0 ? mix(base, "#ffffff", 0.28) : ph.tone === 2 ? mix(base, "#000000", 0.16) : base;
  }
  function creatureName(genes, lin) {
    var h = fnv(genes.join(".") + ":" + lin), a = NAME_A[h % NAME_A.length], b = NAME_B[(h >>> 8) % NAME_B.length];
    var nm = a + b;
    if (((h >>> 16) % 100) < 45 && hasBatchim(nm)) nm += "이";
    return nm;
  }
  function lineageName(lin) { return LIN_A[(lin >>> 4) & 15] + LIN_B[lin & 15]; }
  function featureWord(ph) {
    for (var i = RARE.length - 1; i >= 1; i--) if (ph.rare & RARE[i].bit) return RARE[i].ko.replace(/ /g, "");
    if (ph.head) return HEAD_WORD[ph.head];
    if (ph.pattern) return PATTERN_WORD[ph.pattern];
    return SHAPE_KO[ph.shape].replace("형", "");
  }
  function commonName(ph) {
    var col = (ph.rare & RARE_BY.gold.bit) ? "금빛" : (ph.rare & RARE_BY.galaxy.bit) ? "밤하늘" : COLOR_KO[ph.hue];
    var fw = featureWord(ph);
    if (fw === "금빛몸" || fw === "은하무늬") fw = SHAPE_KO[ph.shape].replace("형", "");
    return col + fw + " 링쿠";
  }
  function sciName(ph) {
    var ep = null;
    for (var i = RARE.length - 1; i >= 1; i--) if (ph.rare & RARE[i].bit) { ep = RARE[i].la; break; }
    if (!ep) ep = HEAD_LA[ph.head] || PATTERN_LA[ph.pattern] || ["globosus", "phaseolus", "quadratus", "guttatus", "campanulatus", "tuberosus", "muricatus", "nubilus"][ph.shape];
    return "Hyperlinkus " + COLOR_LA[ph.hue] + " " + ep;
  }
  function traitList(ph) {
    var adj = (ph.rare & RARE_BY.gold.bit) ? "금빛" : (ph.rare & RARE_BY.galaxy.bit) ? "밤하늘빛" : COLOR_ADJ[ph.hue];
    var out = [adj + " " + SHAPE_KO[ph.shape] + " 몸"];
    if (ph.pattern) out.push(PATTERN_KO[ph.pattern]);
    if (ph.belly) out.push("밝은 배");
    out.push(EYES_KO[ph.eyes], MOUTH_KO[ph.mouth]);
    if (ph.head) out.push(HEAD_KO[ph.head]);
    if (ph.limbs) out.push(LIMB_KO[ph.limbs]);
    if (ph.tail) out.push(TAIL_KO[ph.tail]);
    if (ph.blush) out.push("발그레한 볼");
    return out;
  }
  function rareList(rare) { return RARE.filter(function (t) { return rare & t.bit; }); }

  /* 부모와 달라진 점 */
  function diffLines(pp, cp) {
    var out = [];
    if (pp.hue !== cp.hue && !(cp.rare & (RARE_BY.gold.bit | RARE_BY.galaxy.bit)))
      out.push("몸 색이 " + COLOR_NOUN[pp.hue] + "에서 " + josa.ro(COLOR_NOUN[cp.hue]) + " 바뀌었어요");
    if (pp.shape !== cp.shape) out.push("몸이 " + josa.ro(SHAPE_KO[cp.shape]) + " 바뀌었어요");
    function part(a, b, names) {
      if (a === b) return;
      if (!a) out.push(josa.ig(names[b]) + " 생겼어요");
      else if (!b) out.push(josa.ig(names[a]) + " 사라졌어요");
      else out.push(names[a] + " 대신 " + josa.ig(names[b]) + " 생겼어요");
    }
    part(pp.pattern, cp.pattern, PATTERN_KO);
    part(pp.head, cp.head, HEAD_KO);
    if (pp.eyes !== cp.eyes) out.push("눈이 " + josa.ro(EYES_KO[cp.eyes]) + " 바뀌었어요");
    if (pp.mouth !== cp.mouth) out.push("입이 " + josa.ro(MOUTH_KO[cp.mouth]) + " 바뀌었어요");
    part(pp.limbs, cp.limbs, LIMB_KO);
    part(pp.tail, cp.tail, TAIL_KO);
    return out;
  }

  /* ---------- color ---------- */
  function hexRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function rgbHex(c) { return "#" + c.map(function (v) { var s = clamp(Math.round(v), 0, 255).toString(16); return s.length < 2 ? "0" + s : s; }).join(""); }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); }

  /* ---------- drawing ---------- */
  var uid = 0;
  var INK = "#111111";
  function smoothPath(pts) {
    var n = pts.length, d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += "C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " +
        f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return d + "Z";
  }
  function bodyPoints(ph, cx, cy, rx, ry, twin) {
    var n = 48, pts = [], v = ph.shapeVar;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 - Math.PI / 2;
      var c = Math.cos(a), s = Math.sin(a), r = 1, xs = 1;
      switch (ph.shape) {
        case 0: if (s > 0.5) s = 0.5 + (s - 0.5) * 0.55; break;
        case 1: { var d = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)); r = 1 - 0.1 * Math.exp(-d * d / 0.09); break; }
        case 2: { var nn = 3.2 + v * 1.6; c = Math.pow(Math.abs(c), 2 / nn) * (c < 0 ? -1 : 1); s = Math.pow(Math.abs(s), 2 / nn) * (s < 0 ? -1 : 1); break; }
        case 3: r = 1 + 0.3 * Math.pow(Math.max(0, -s), 6); break;
        case 4: xs = 1 + 0.15 * s; if (s > 0.6) s = 0.6 + (s - 0.6) * 0.4; break;
        case 5: r = 1 + 0.06 * Math.sin(3 * a + v * 6) + 0.045 * Math.sin(5 * a + v * 3); break;
        case 6: r = 1 + 0.05 * Math.cos(10 * a); break;
        case 7: r = 1 + (s < 0.15 ? 0.09 * Math.abs(Math.sin(3.5 * a + 0.5)) : 0); if (s > 0.55) s = 0.55 + (s - 0.55) * 0.5; break;
      }
      if (twin) { var dd = Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2)); r *= 1 - 0.16 * Math.exp(-dd * dd / 0.05); }
      pts.push([cx + c * rx * r * xs, cy + s * ry * r]);
    }
    return pts;
  }
  function star(cx, cy, r1, r2, k) {
    var d = "";
    for (var i = 0; i < k * 2; i++) {
      var a = -Math.PI / 2 + (i * Math.PI) / k, r = i % 2 ? r2 : r1;
      d += (i ? "L" : "M") + f1(cx + Math.cos(a) * r) + " " + f1(cy + Math.sin(a) * r);
    }
    return d + "Z";
  }
  function heartPath(x, y, s) {
    return "M" + f1(x) + " " + f1(y + s * 0.35) + "C" + f1(x - s) + " " + f1(y - s * 0.45) + " " + f1(x - s * 0.35) + " " + f1(y - s * 0.95) + " " + f1(x) + " " + f1(y - s * 0.35) +
      "C" + f1(x + s * 0.35) + " " + f1(y - s * 0.95) + " " + f1(x + s) + " " + f1(y - s * 0.45) + " " + f1(x) + " " + f1(y + s * 0.35) + "Z";
  }

  /* opts: {sleep, mood:"open", size, title} */
  function svgCreature(ph, opts) {
    opts = opts || {};
    var id = "lk" + (++uid), R = rng(ph.seed);
    var rare = ph.rare, twin = !!(rare & RARE_BY.twin.bit);
    var scale = [0.8, 0.9, 1][ph.stage], eyeBoost = [1.16, 1.06, 1][ph.stage];
    var cx = 100, cy = 122, base = 47;
    var rx = base / Math.sqrt(ph.aspect) * (twin ? 1.24 : 1), ry = base * Math.sqrt(ph.aspect);
    var pts = bodyPoints(ph, cx, cy, rx, ry, twin), body = smoothPath(pts);
    var top = pts[0], col = bodyColor(ph), dark = mix(col, "#000000", 0.28), light = mix(col, "#ffffff", 0.5);
    var patCol = mix(PAL[(ph.hue + ph.patOff) % 24], "#000000", ph.patOff === 0 ? 0.3 : 0.08);
    var sw = 3.4, st = ' stroke="' + INK + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"';
    var back = [], front = [], face = [], over = [];
    var minY = cy - ry, maxY = cy + ry;
    pts.forEach(function (p) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
    function at(deg) { var i = Math.round(((deg % 360 + 360) % 360) / 360 * pts.length) % pts.length; return pts[i]; }

    /* wings */
    if (rare & RARE_BY.wings.bit) {
      [-1, 1].forEach(function (sd) {
        var x0 = cx + sd * rx * 0.55, y0 = cy - ry * 0.35;
        var k = 0.7;
        back.push('<path d="M' + f1(x0) + " " + f1(y0) + "C" + f1(x0 + sd * 46 * k) + " " + f1(y0 - 48) + " " + f1(x0 + sd * 78 * k) + " " + f1(y0 - 16) + " " + f1(x0 + sd * 70 * k) + " " + f1(y0 + 8) +
          "C" + f1(x0 + sd * 58 * k) + " " + f1(y0 + 2) + " " + f1(x0 + sd * 56 * k) + " " + f1(y0 + 20) + " " + f1(x0 + sd * 40 * k) + " " + f1(y0 + 18) +
          "C" + f1(x0 + sd * 30 * k) + " " + f1(y0 + 26) + " " + f1(x0 + sd * 16 * k) + " " + f1(y0 + 22) + " " + f1(x0) + " " + f1(y0 + 14) + 'Z" fill="#FFFFFF"' + st + "/>");
      });
    }
    /* tail */
    var tx = cx + rx * 0.8, ty = cy + ry * 0.42;
    var comet = !!(rare & RARE_BY.comet.bit);
    if (comet) {
      back.push('<path d="M' + f1(tx) + " " + f1(ty) + "C" + f1(tx + 24) + " " + f1(ty + 4) + " " + f1(tx + 30) + " " + f1(ty - 26) + " " + f1(tx + 42) + " " + f1(ty - 40) + '" fill="none"' + st.replace(sw, sw + 2) + "/>");
      back.push('<path d="M' + f1(tx) + " " + f1(ty) + "C" + f1(tx + 24) + " " + f1(ty + 4) + " " + f1(tx + 30) + " " + f1(ty - 26) + " " + f1(tx + 42) + " " + f1(ty - 40) + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round"/>');
      over.push('<path d="' + star(tx + 43, ty - 42, 12, 5, 5) + '" fill="#FFD84A"' + st + "/>");
    } else if (ph.tail === 1) {
      back.push('<path d="M' + f1(tx - 4) + " " + f1(ty) + "C" + f1(tx + 26) + " " + f1(ty - 2) + " " + f1(tx + 30) + " " + f1(ty - 30) + " " + f1(tx + 12) + " " + f1(ty - 30) +
        "C" + f1(tx) + " " + f1(ty - 30) + " " + f1(tx + 2) + " " + f1(ty - 16) + " " + f1(tx + 12) + " " + f1(ty - 18) + '" fill="none"' + st.replace(sw, 9) + "/>");
      back.push('<path d="M' + f1(tx - 4) + " " + f1(ty) + "C" + f1(tx + 26) + " " + f1(ty - 2) + " " + f1(tx + 30) + " " + f1(ty - 30) + " " + f1(tx + 12) + " " + f1(ty - 30) +
        "C" + f1(tx) + " " + f1(ty - 30) + " " + f1(tx + 2) + " " + f1(ty - 16) + " " + f1(tx + 12) + " " + f1(ty - 18) + '" fill="none" stroke="' + col + '" stroke-width="3.2" stroke-linecap="round"/>');
    } else if (ph.tail === 2) {
      back.push('<circle cx="' + f1(tx + 6) + '" cy="' + f1(ty + 4) + '" r="11" fill="' + dark + '"' + st + "/>");
    } else if (ph.tail === 3) {
      back.push('<path d="M' + f1(tx - 6) + " " + f1(ty) + "C" + f1(tx + 20) + " " + f1(ty + 8) + " " + f1(tx + 28) + " " + f1(ty - 16) + " " + f1(tx + 38) + " " + f1(ty - 24) + '" fill="none"' + st + "/>");
      back.push('<circle cx="' + f1(tx + 40) + '" cy="' + f1(ty - 26) + '" r="7.5" fill="' + patCol + '"' + st + "/>");
    } else if (ph.tail === 4) {
      back.push('<path d="M' + f1(tx - 8) + " " + f1(ty + 8) + "C" + f1(tx + 10) + " " + f1(ty + 22) + " " + f1(tx + 44) + " " + f1(ty + 6) + " " + f1(tx + 40) + " " + f1(ty - 22) +
        "C" + f1(tx + 36) + " " + f1(ty - 40) + " " + f1(tx + 14) + " " + f1(ty - 30) + " " + f1(tx + 18) + " " + f1(ty - 14) + "C" + f1(tx + 8) + " " + f1(ty - 14) + " " + f1(tx - 4) + " " + f1(ty - 6) + " " + f1(tx - 8) + " " + f1(ty + 8) + 'Z" fill="' + light + '"' + st + "/>");
    }
    /* ears behind the head */
    if (ph.head === 3 || ph.head === 4) {
      [-48, 48].forEach(function (deg) {
        var p = at(deg), sd = deg < 0 ? -1 : 1;
        if (ph.head === 3) back.push('<circle cx="' + f1(p[0] + sd * 2) + '" cy="' + f1(p[1] - 2) + '" r="15" fill="' + col + '"' + st + '/><circle cx="' + f1(p[0] + sd * 2) + '" cy="' + f1(p[1] - 2) + '" r="7" fill="' + light + '"/>');
        else back.push('<path d="M' + f1(p[0] - sd * 14) + " " + f1(p[1] + 8) + "L" + f1(p[0] + sd * 10) + " " + f1(p[1] - 30) + "L" + f1(p[0] + sd * 16) + " " + f1(p[1] + 10) + 'Z" fill="' + col + '"' + st + "/>");
      });
    }
    /* feet & legs behind body */
    var fy = maxY - 4;
    if (ph.limbs === 1 || ph.limbs === 2) {
      [-1, 1].forEach(function (sd) { back.push('<ellipse cx="' + f1(cx + sd * rx * 0.42) + '" cy="' + f1(fy + 4) + '" rx="15" ry="9" fill="' + dark + '"' + st + "/>"); });
    } else if (ph.limbs === 3) {
      [-0.5, -0.17, 0.17, 0.5].forEach(function (k, i) {
        var x = cx + k * rx * 1.2, w = i % 2 ? -1 : 1;
        back.push('<path d="M' + f1(x) + " " + f1(fy - 10) + "C" + f1(x + w * 10) + " " + f1(fy + 6) + " " + f1(x - w * 10) + " " + f1(fy + 14) + " " + f1(x + w * 4) + " " + f1(fy + 24) + '" fill="none"' + st.replace(sw, 11) + "/>");
        back.push('<path d="M' + f1(x) + " " + f1(fy - 10) + "C" + f1(x + w * 10) + " " + f1(fy + 6) + " " + f1(x - w * 10) + " " + f1(fy + 14) + " " + f1(x + w * 4) + " " + f1(fy + 24) + '" fill="none" stroke="' + col + '" stroke-width="5" stroke-linecap="round"/>');
      });
    } else if (ph.limbs === 4) {
      [-0.6, -0.22, 0.22, 0.6].forEach(function (k) { back.push('<rect x="' + f1(cx + k * rx - 7) + '" y="' + f1(fy - 8) + '" width="14" height="20" rx="7" fill="' + dark + '"' + st + "/>"); });
    }

    /* body + patterns */
    var clip = "c" + id;
    var isGlass = !!(rare & RARE_BY.glass.bit), isGold = !!(rare & RARE_BY.gold.bit), isGal = !!(rare & RARE_BY.galaxy.bit);
    var fillOp = isGlass ? ' fill-opacity="0.5"' : "";
    var pat = [];
    if (ph.belly && !isGal) pat.push('<ellipse cx="' + cx + '" cy="' + f1(cy + ry * 0.55) + '" rx="' + f1(rx * 0.62) + '" ry="' + f1(ry * 0.5) + '" fill="' + light + '"' + fillOp + "/>");
    if (rare & RARE_BY.rainbow.bit) {
      ["#FF6B6B", "#FFA94D", "#FFE066", "#74CF7C", "#5BB5F5", "#A07CF0"].forEach(function (c, i) {
        pat.push('<rect x="0" y="' + f1(minY + (maxY - minY) * (i / 6)) + '" width="200" height="' + f1((maxY - minY) / 6 + 0.6) + '" fill="' + c + '" opacity="0.55"/>');
      });
    } else if (!isGold && !isGal) {
      if (ph.pattern === 1) {
        var n = 5 + Math.floor(R() * 5);
        for (var i = 0; i < n; i++) pat.push('<circle cx="' + f1(cx + (R() - 0.5) * rx * 1.7) + '" cy="' + f1(cy + (R() - 0.3) * ry * 1.5) + '" r="' + f1(4 + R() * 7) + '" fill="' + patCol + '"' + fillOp + "/>");
      } else if (ph.pattern === 2) {
        for (var j = 0; j < 4; j++) {
          var yy = minY + (maxY - minY) * (0.18 + j * 0.2);
          pat.push('<path d="M0 ' + f1(yy) + "Q" + cx + " " + f1(yy + 9) + " 200 " + f1(yy) + "L200 " + f1(yy + 8) + "Q" + cx + " " + f1(yy + 17) + " 0 " + f1(yy + 8) + 'Z" fill="' + patCol + '"' + fillOp + "/>");
        }
      } else if (ph.pattern === 4) {
        pat.push('<path d="M' + f1(cx + rx * 0.05) + " " + f1(cy - ry * 0.9) + "C" + f1(cx + rx * 0.9) + " " + f1(cy - ry * 1.1) + " " + f1(cx + rx * 1.1) + " " + f1(cy + ry * 0.1) + " " + f1(cx + rx * 0.45) + " " + f1(cy + ry * 0.05) +
          "C" + f1(cx + rx * 0.1) + " " + f1(cy) + " " + f1(cx - rx * 0.2) + " " + f1(cy - ry * 0.5) + " " + f1(cx + rx * 0.05) + " " + f1(cy - ry * 0.9) + 'Z" fill="' + patCol + '"' + fillOp + "/>");
      } else if (ph.pattern === 5) {
        pat.push('<rect x="0" y="' + f1(cy + ry * 0.12) + '" width="200" height="' + f1(ry * 0.3) + '" fill="' + patCol + '"' + fillOp + "/>");
      }
    }
    if (rare & RARE_BY.heart.bit) {
      for (var hh = 0; hh < 5; hh++) pat.push('<path d="' + heartPath(cx + (R() - 0.5) * rx * 1.6, cy + (R() - 0.15) * ry * 1.3, 6 + R() * 4) + '" fill="#FF4D7D"/>');
    }
    if (isGal) {
      pat.push('<ellipse cx="' + f1(cx - rx * 0.2) + '" cy="' + f1(cy + ry * 0.1) + '" rx="' + f1(rx * 0.9) + '" ry="' + f1(ry * 0.32) + '" fill="#5B3FA0" transform="rotate(-18 ' + cx + " " + cy + ')"/>');
      for (var sg = 0; sg < 18; sg++) pat.push('<circle cx="' + f1(cx + (R() - 0.5) * rx * 1.9) + '" cy="' + f1(cy + (R() - 0.5) * ry * 1.9) + '" r="' + f1(0.8 + R() * 1.8) + '" fill="' + (sg % 4 ? "#FFFFFF" : "#FFE27A") + '"/>');
    }
    var bodySvg = '<defs><clipPath id="' + clip + '"><path d="' + body + '"/></clipPath></defs>' +
      '<path d="' + body + '" fill="' + col + '"' + fillOp + "/>" +
      '<g clip-path="url(#' + clip + ')">' + pat.join("") + "</g>";
    if (isGold) bodySvg += '<path d="M' + f1(cx - rx * 0.55) + " " + f1(cy - ry * 0.35) + "Q" + f1(cx - rx * 0.4) + " " + f1(cy - ry * 0.75) + " " + f1(cx) + " " + f1(cy - ry * 0.78) + '" fill="none" stroke="#FFF6CC" stroke-width="6" stroke-linecap="round"/>';
    if (isGlass) bodySvg += '<path d="M' + f1(cx - rx * 0.6) + " " + f1(cy - ry * 0.2) + "Q" + f1(cx - rx * 0.5) + " " + f1(cy - ry * 0.7) + " " + f1(cx - rx * 0.05) + " " + f1(cy - ry * 0.75) + '" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" opacity="0.9"/>';
    bodySvg += '<path d="' + body + '" fill="none"' + st + "/>";

    /* arms */
    if (ph.limbs === 2) {
      [-1, 1].forEach(function (sd) {
        front.push('<ellipse cx="' + f1(cx + sd * rx * 0.92) + '" cy="' + f1(cy + ry * 0.2) + '" rx="8" ry="13" fill="' + col + '"' + st + ' transform="rotate(' + (sd * -24) + " " + f1(cx + sd * rx * 0.92) + " " + f1(cy + ry * 0.2) + ')"/>');
      });
    }

    /* face(s) */
    var faces = twin ? [cx - rx * 0.36, cx + rx * 0.36] : [cx];
    var eyeY = cy - ry * 0.12 + (ph.shape === 3 ? ry * 0.1 : 0);
    var dx = Math.max(15, rx * (twin ? 0.17 : 0.33));
    var ek = eyeBoost, sleep = !!opts.sleep, open = opts.mood === "open";
    faces.forEach(function (fx) {
      if (ph.blush) [-1, 1].forEach(function (sd) { face.push('<ellipse cx="' + f1(fx + sd * dx * 1.35) + '" cy="' + f1(eyeY + 13) + '" rx="8" ry="4.6" fill="#FF6F91" opacity="0.5"/>'); });
      if (ph.pattern === 3 && !isGold && !isGal) [-1, 1].forEach(function (sd) {
        for (var q = 0; q < 3; q++) face.push('<circle cx="' + f1(fx + sd * (dx * 1.25 + q * 4 - 4)) + '" cy="' + f1(eyeY + 9 + (q % 2) * 4) + '" r="1.6" fill="' + patCol + '"/>');
      });
      var eyes = [];
      var single = ph.eyes === 5;
      var list = single ? [fx] : [fx - dx, fx + dx];
      list.forEach(function (ex) {
        var big = single ? 1.5 : 1;
        if (sleep) { eyes.push('<path d="M' + f1(ex - 7 * big) + " " + f1(eyeY) + "Q" + f1(ex) + " " + f1(eyeY + 6 * big) + " " + f1(ex + 7 * big) + " " + f1(eyeY) + '" fill="none"' + st + "/>"); return; }
        var starEye = !!(rare & RARE_BY.stareyes.bit);
        switch (ph.eyes) {
          case 0:
            eyes.push(starEye ? '<path d="' + star(ex, eyeY, 7.5 * ek, 3.4 * ek, 5) + '" fill="#FFD84A" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' :
              '<circle cx="' + f1(ex) + '" cy="' + f1(eyeY) + '" r="' + f1(5 * ek) + '" fill="' + INK + '"/>');
            break;
          case 2:
            eyes.push('<circle cx="' + f1(ex) + '" cy="' + f1(eyeY) + '" r="' + f1(9 * ek) + '" fill="#fff"' + st.replace(sw, 2.6) + "/>");
            eyes.push(starEye ? '<path d="' + star(ex, eyeY + 2, 5.5 * ek, 2.4 * ek, 5) + '" fill="#FFD84A"/>' : '<circle cx="' + f1(ex) + '" cy="' + f1(eyeY + 2.5) + '" r="' + f1(4.5 * ek) + '" fill="' + INK + '"/>');
            eyes.push('<path d="M' + f1(ex - 9.5 * ek) + " " + f1(eyeY) + "A" + f1(9.5 * ek) + " " + f1(9.5 * ek) + " 0 0 1 " + f1(ex + 9.5 * ek) + " " + f1(eyeY) + 'Z" fill="' + col + '"' + st.replace(sw, 2.6) + "/>");
            break;
          case 4:
            eyes.push('<path d="M' + f1(ex - 7) + " " + f1(eyeY + 3) + "Q" + f1(ex) + " " + f1(eyeY - 7) + " " + f1(ex + 7) + " " + f1(eyeY + 3) + '" fill="none"' + st.replace(sw, 3.6) + "/>");
            break;
          default: {
            var r0 = (ph.eyes === 3 ? 12.5 : single ? 14 : 9.5) * ek, rp = (ph.eyes === 3 ? 7.5 : single ? 8 : 5) * ek;
            eyes.push('<circle cx="' + f1(ex) + '" cy="' + f1(eyeY) + '" r="' + f1(r0) + '" fill="#fff"' + st.replace(sw, 2.6) + "/>");
            if (starEye) eyes.push('<path d="' + star(ex, eyeY + 1, rp * 1.25, rp * 0.55, 5) + '" fill="#FFD84A" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>');
            else {
              eyes.push('<circle cx="' + f1(ex + 1) + '" cy="' + f1(eyeY + 1.5) + '" r="' + f1(rp) + '" fill="' + INK + '"/>');
              eyes.push('<circle cx="' + f1(ex + 1 - rp * 0.4) + '" cy="' + f1(eyeY + 1.5 - rp * 0.45) + '" r="' + f1(rp * 0.36) + '" fill="#fff"/>');
            }
          }
        }
      });
      if (rare & RARE_BY.thirdeye.bit) {
        var ty3 = eyeY - 19;
        eyes.push(sleep ? '<path d="M' + f1(fx - 6) + " " + f1(ty3) + "Q" + f1(fx) + " " + f1(ty3 + 5) + " " + f1(fx + 6) + " " + f1(ty3) + '" fill="none"' + st + "/>" :
          '<ellipse cx="' + f1(fx) + '" cy="' + f1(ty3) + '" rx="6.5" ry="8.5" fill="#fff"' + st.replace(sw, 2.4) + '/><circle cx="' + f1(fx) + '" cy="' + f1(ty3 + 1) + '" r="3.6" fill="#7A2BD6"/>');
      }
      face.push('<g class="lk-eyes">' + eyes.join("") + "</g>");
      /* mouth */
      var my = eyeY + 18 * (single ? 1.12 : 1), m = [];
      if (open) {
        m.push('<ellipse cx="' + f1(fx) + '" cy="' + f1(my + 2) + '" rx="7" ry="6.5" fill="#4A1420"' + st.replace(sw, 2.6) + "/>");
      } else switch (ph.mouth) {
        case 0: m.push('<path d="M' + f1(fx - 6) + " " + f1(my) + "Q" + f1(fx) + " " + f1(my + 6) + " " + f1(fx + 6) + " " + f1(my) + '" fill="none"' + st.replace(sw, 3) + "/>"); break;
        case 1: m.push('<ellipse cx="' + f1(fx) + '" cy="' + f1(my + 1) + '" rx="4.2" ry="5" fill="#4A1420"' + st.replace(sw, 2.4) + "/>"); break;
        case 2: m.push('<path d="M' + f1(fx - 9) + " " + f1(my) + "Q" + f1(fx - 4.5) + " " + f1(my + 6) + " " + f1(fx) + " " + f1(my) + "Q" + f1(fx + 4.5) + " " + f1(my + 6) + " " + f1(fx + 9) + " " + f1(my) + '" fill="none"' + st.replace(sw, 2.8) + "/>"); break;
        case 3: m.push('<path d="M' + f1(fx - 8) + " " + f1(my) + "Q" + f1(fx) + " " + f1(my + 5) + " " + f1(fx + 8) + " " + f1(my) + '" fill="none"' + st.replace(sw, 2.8) + '/><rect x="' + f1(fx - 4.6) + '" y="' + f1(my + 2) + '" width="9.2" height="7" rx="1.4" fill="#fff"' + st.replace(sw, 2) + '/><path d="M' + f1(fx) + " " + f1(my + 2.5) + "V" + f1(my + 8.5) + '" stroke="' + INK + '" stroke-width="1.6"/>'); break;
        case 4: m.push('<path d="M' + f1(fx - 7) + " " + f1(my) + "Q" + f1(fx) + " " + f1(my + 5) + " " + f1(fx + 7) + " " + f1(my) + '" fill="none"' + st.replace(sw, 2.8) + '/><path d="M' + f1(fx - 3) + " " + f1(my + 2) + "Q" + f1(fx + 1) + " " + f1(my + 13) + " " + f1(fx + 5) + " " + f1(my + 2) + 'Z" fill="#FF7B9C"' + st.replace(sw, 2) + "/>"); break;
        case 5: m.push('<path d="M' + f1(fx - 6) + " " + f1(my + 1) + "H" + f1(fx + 6) + '" fill="none"' + st.replace(sw, 3) + "/>"); break;
        default: m.push('<path d="M' + f1(fx - 10) + " " + f1(my - 1) + "Q" + f1(fx) + " " + f1(my + 14) + " " + f1(fx + 10) + " " + f1(my - 1) + 'Z" fill="#4A1420"' + st.replace(sw, 2.6) + '/><path d="M' + f1(fx - 5) + " " + f1(my + 6) + "Q" + f1(fx) + " " + f1(my + 2) + " " + f1(fx + 5) + " " + f1(my + 6) + "Q" + f1(fx) + " " + f1(my + 10) + " " + f1(fx - 5) + " " + f1(my + 6) + 'Z" fill="#FF7B9C"/>');
      }
      face.push('<g class="lk-mouth">' + m.join("") + "</g>");
    });

    /* head features (on top) */
    var hx = top[0], hy = top[1];
    var short = [0.7, 0.85, 1][ph.stage];
    if (ph.head === 1 || ph.head === 2) {
      (ph.head === 1 ? [0] : [-15, 15]).forEach(function (o) {
        var bx = hx + o, by = hy + 6, ex2 = bx + o * 0.7 + 6, ey2 = hy - 26 * short;
        over.push('<path d="M' + f1(bx) + " " + f1(by) + "Q" + f1(bx + 2) + " " + f1(ey2 + 10) + " " + f1(ex2) + " " + f1(ey2) + '" fill="none"' + st + '/><circle cx="' + f1(ex2) + '" cy="' + f1(ey2) + '" r="5.5" fill="' + patCol + '"' + st.replace(sw, 2.6) + "/>");
      });
    } else if (ph.head === 5 && !(rare & RARE_BY.crown.bit)) {
      [-1, 1].forEach(function (sd) {
        var bx = hx + sd * 16, by = hy + 8;
        over.push('<path d="M' + f1(bx - 7) + " " + f1(by) + "Q" + f1(bx + sd * 2) + " " + f1(by - 26 * short) + " " + f1(bx + sd * 10) + " " + f1(by - 24 * short) + "Q" + f1(bx + sd * 6) + " " + f1(by - 10) + " " + f1(bx + 7) + " " + f1(by) + 'Z" fill="#F3E9D2"' + st.replace(sw, 2.8) + "/>");
      });
    } else if (ph.head === 6) {
      over.push('<path d="M' + f1(hx) + " " + f1(hy + 4) + "Q" + f1(hx - 2) + " " + f1(hy - 10) + " " + f1(hx + 2) + " " + f1(hy - 18 * short) + '" fill="none" stroke="#2F8F4E" stroke-width="3.4" stroke-linecap="round"/>' +
        '<path d="M' + f1(hx + 2) + " " + f1(hy - 16 * short) + "C" + f1(hx + 10) + " " + f1(hy - 30 * short) + " " + f1(hx + 26) + " " + f1(hy - 26 * short) + " " + f1(hx + 24) + " " + f1(hy - 18 * short) + "C" + f1(hx + 18) + " " + f1(hy - 10) + " " + f1(hx + 8) + " " + f1(hy - 12) + " " + f1(hx + 2) + " " + f1(hy - 16 * short) + 'Z" fill="#7BD389"' + st.replace(sw, 2.6) + "/>" +
        '<path d="M' + f1(hx) + " " + f1(hy - 12 * short) + "C" + f1(hx - 8) + " " + f1(hy - 24 * short) + " " + f1(hx - 22) + " " + f1(hy - 20 * short) + " " + f1(hx - 20) + " " + f1(hy - 13 * short) + "C" + f1(hx - 14) + " " + f1(hy - 6) + " " + f1(hx - 6) + " " + f1(hy - 8) + " " + f1(hx) + " " + f1(hy - 12 * short) + 'Z" fill="#9BE3A6"' + st.replace(sw, 2.6) + "/>");
    } else if (ph.head === 7) {
      [-9, 0, 9].forEach(function (o, i) {
        over.push('<path d="M' + f1(hx + o) + " " + f1(hy + 5) + "Q" + f1(hx + o + (i - 1) * 8) + " " + f1(hy - 14 * short) + " " + f1(hx + o + (i - 1) * 14 + 4) + " " + f1(hy - 10 * short) + '" fill="none"' + st.replace(sw, 3.2) + "/>");
      });
    }
    /* rare head pieces */
    if (rare & RARE_BY.flame.bit) {
      over.push('<path d="M' + f1(hx - 16) + " " + f1(hy + 6) + "C" + f1(hx - 22) + " " + f1(hy - 14) + " " + f1(hx - 8) + " " + f1(hy - 20) + " " + f1(hx - 6) + " " + f1(hy - 34) + "C" + f1(hx + 2) + " " + f1(hy - 22) + " " + f1(hx + 6) + " " + f1(hy - 40) + " " + f1(hx + 4) + " " + f1(hy - 48) +
        "C" + f1(hx + 18) + " " + f1(hy - 34) + " " + f1(hx + 24) + " " + f1(hy - 14) + " " + f1(hx + 16) + " " + f1(hy + 6) + 'Z" fill="#FF7A1A"' + st.replace(sw, 2.8) + '/><path d="M' + f1(hx - 7) + " " + f1(hy + 4) + "C" + f1(hx - 9) + " " + f1(hy - 8) + " " + f1(hx) + " " + f1(hy - 12) + " " + f1(hx + 2) + " " + f1(hy - 24) + "C" + f1(hx + 10) + " " + f1(hy - 12) + " " + f1(hx + 10) + " " + f1(hy - 2) + " " + f1(hx + 7) + " " + f1(hy + 4) + 'Z" fill="#FFD84A"/>');
    }
    if (rare & RARE_BY.flower.bit) {
      var fxx = hx + 14, fyy = hy - 4;
      for (var pe = 0; pe < 5; pe++) {
        var aa = pe * Math.PI * 2 / 5 - Math.PI / 2;
        over.push('<circle cx="' + f1(fxx + Math.cos(aa) * 8) + '" cy="' + f1(fyy + Math.sin(aa) * 8) + '" r="6.5" fill="#FFFFFF"' + st.replace(sw, 2.2) + "/>");
      }
      over.push('<circle cx="' + f1(fxx) + '" cy="' + f1(fyy) + '" r="5" fill="#FFC94D"' + st.replace(sw, 2.2) + "/>");
    }
    if (rare & RARE_BY.crown.bit) {
      over.push('<path d="M' + f1(hx - 22) + " " + f1(hy + 6) + "L" + f1(hx - 26) + " " + f1(hy - 22) + "L" + f1(hx - 12) + " " + f1(hy - 8) + "L" + f1(hx) + " " + f1(hy - 30) + "L" + f1(hx + 12) + " " + f1(hy - 8) + "L" + f1(hx + 26) + " " + f1(hy - 22) + "L" + f1(hx + 22) + " " + f1(hy + 6) + 'Z" fill="#F2C230"' + st.replace(sw, 2.8) +
        '/><circle cx="' + f1(hx) + '" cy="' + f1(hy - 6) + '" r="3.6" fill="#FF4D7D"/>');
    }
    if (rare & RARE_BY.eggcap.bit) {
      over.push('<path d="M' + f1(hx - 26) + " " + f1(hy + 12) + "C" + f1(hx - 26) + " " + f1(hy - 24) + " " + f1(hx + 26) + " " + f1(hy - 24) + " " + f1(hx + 26) + " " + f1(hy + 12) +
        "L" + f1(hx + 18) + " " + f1(hy + 4) + "L" + f1(hx + 10) + " " + f1(hy + 13) + "L" + f1(hx + 2) + " " + f1(hy + 4) + "L" + f1(hx - 6) + " " + f1(hy + 13) + "L" + f1(hx - 14) + " " + f1(hy + 4) + 'Z" fill="#FBF6EA"' + st.replace(sw, 2.8) + ' transform="rotate(-12 ' + f1(hx) + " " + f1(hy) + ')"/>');
    }
    if (rare & RARE_BY.guest.bit) {
      var gx = hx + 4, gy = hy - 16;
      over.push('<path d="M' + f1(gx - 13) + " " + f1(gy + 6) + "C" + f1(gx - 14) + " " + f1(gy - 12) + " " + f1(gx + 14) + " " + f1(gy - 12) + " " + f1(gx + 13) + " " + f1(gy + 6) + "C" + f1(gx + 12) + " " + f1(gy + 12) + " " + f1(gx - 12) + " " + f1(gy + 12) + " " + f1(gx - 13) + " " + f1(gy + 6) + 'Z" fill="' + PAL[(ph.hue + 12) % 24] + '"' + st.replace(sw, 2.6) +
        '/><circle cx="' + f1(gx - 4) + '" cy="' + f1(gy) + '" r="1.8" fill="' + INK + '"/><circle cx="' + f1(gx + 4) + '" cy="' + f1(gy) + '" r="1.8" fill="' + INK + '"/>');
    }
    if (rare & RARE_BY.halo.bit) {
      over.push('<ellipse cx="' + f1(hx) + '" cy="' + f1(hy - 26) + '" rx="24" ry="7" fill="none" stroke="#F2C230" stroke-width="5"/><ellipse cx="' + f1(hx) + '" cy="' + f1(hy - 26) + '" rx="24" ry="7" fill="none" stroke="' + INK + '" stroke-width="1.4"/>');
    }
    if (sleep) over.push('<text x="' + f1(cx + rx * 0.6) + '" y="' + f1(minY + 6) + '" font-size="18" font-family="serif" font-weight="700" fill="' + INK + '">z</text><text x="' + f1(cx + rx * 0.6 + 14) + '" y="' + f1(minY - 8) + '" font-size="13" font-family="serif" font-weight="700" fill="' + INK + '">z</text>');

    var title = opts.title ? "<title>" + esc(opts.title) + "</title>" : "";
    var tr = scale === 1 ? "" : ' transform="translate(' + f1(100 * (1 - scale)) + " " + f1(190 * (1 - scale)) + ") scale(" + scale + ')"';
    var cls = "lk-svg t" + ph.temper + (opts.cls ? " " + opts.cls : "");
    return '<svg class="' + cls + '" viewBox="0 0 200 200" role="img"' + (opts.title ? "" : ' aria-hidden="true"') + ">" + title +
      "<g" + tr + '><g class="lk-bob">' + back.join("") + bodySvg + front.join("") + face.join("") + over.join("") + "</g></g></svg>";
  }

  function eggPath(cx, cy, rx, ry) {
    var pts = [];
    for (var i = 0; i < 40; i++) {
      var t = (i / 40) * Math.PI * 2 - Math.PI / 2, s = Math.sin(t);
      pts.push([cx + Math.cos(t) * rx * (1 - 0.13 * Math.max(0, -s)), cy + s * ry]);
    }
    return smoothPath(pts);
  }
  function svgEgg(ph, label) {
    var id = "eg" + (++uid), R = rng(ph ? ph.seed ^ 0x9e37 : 7);
    var cx = 100, cy = 126, rx = 70, ry = 92;
    var shell = ph ? mix(bodyColor(ph), "#FBF6EA", 0.72) : "#FBF6EA";
    var spot = ph ? mix(PAL[(ph.hue + ph.patOff) % 24], "#FBF6EA", 0.35) : "#E6DCC6";
    var d = eggPath(cx, cy, rx, ry), clip = "e" + id;
    var spots = "";
    for (var i = 0; i < 9; i++) {
      /* 가운데 숫자 자리는 비워 둔다 */
      var ang = R() * Math.PI * 2, rr = 0.5 + R() * 0.45;
      spots += '<ellipse cx="' + f1(cx + Math.cos(ang) * rx * rr) + '" cy="' + f1(cy + Math.sin(ang) * ry * rr) + '" rx="' + f1(5 + R() * 8) + '" ry="' + f1(4 + R() * 6) + '" fill="' + spot + '"/>';
    }
    var zz = "M10 " + (cy - 6);
    for (var k = 0; k <= 10; k++) zz += "L" + (30 + k * 14) + " " + (cy - 6 + (k % 2 ? -12 : 10));
    zz += "L190 " + (cy - 6);
    /* 아래 조각을 2px 겹쳐서 두 조각 사이에 실선 틈이 보이지 않게 한다 */
    var zzLow = zz.replace(/(\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, function (m, xx, yy) { return xx + " " + (parseFloat(yy) - 2); });
    var topClip = zz + "L190 0L10 0Z", botClip = zzLow + "L190 240L10 240Z";
    var egg = '<path d="' + d + '" fill="' + shell + '"/><g clip-path="url(#' + clip + ')">' + spots + "</g>" +
      (label ? '<text x="100" y="' + (cy + 18) + '" text-anchor="middle" class="egg-num">' + esc(label) + "</text>" : "") +
      '<path d="' + d + '" fill="none" stroke="' + INK + '" stroke-width="3.4"/>';
    var cr1 = '<path class="crack c1" d="M96 ' + (cy - 70) + "l6 14 -9 10 8 12" + '" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    var cr2 = '<path class="crack c2" d="M140 ' + (cy - 40) + "l-10 10 6 9 -12 8 M60 " + (cy - 30) + "l10 8 -4 10 12 6" + '" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    var cr3 = '<path class="crack c3" d="' + zz.replace("M10", "M30").replace(/L190 [-\d.]+$/, "") + '" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    return '<svg class="egg-svg" viewBox="0 0 200 240" aria-hidden="true"><defs><clipPath id="' + clip + '"><path d="' + d + '"/></clipPath>' +
      '<clipPath id="t' + clip + '"><path d="' + topClip + '"/></clipPath><clipPath id="b' + clip + '"><path d="' + botClip + '"/></clipPath></defs>' +
      '<g class="egg-bot" clip-path="url(#b' + clip + ')">' + egg + "</g>" +
      '<g class="egg-top" clip-path="url(#t' + clip + ')">' + egg + cr1 + cr2 + "</g>" + cr3 + "</svg>";
  }

  /* ---------- sound ---------- */
  var SOUND_KEY = "linku:sound", soundOn = true, actx = null, noiseBuf = null;
  try { soundOn = localStorage.getItem(SOUND_KEY) !== "off"; } catch (e) { soundOn = true; }
  function audio() {
    if (!soundOn) return null;
    try {
      if (!actx) { var AC = W.AudioContext || W.webkitAudioContext; if (!AC) return null; actx = new AC(); }
      if (actx.state === "suspended" && actx.resume) actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function env(c, t, peak, a, d) {
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(c.destination);
    return g;
  }
  function tone(c, t, type, f0, fEnd, peak, a, d) {
    var o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (fEnd && fEnd !== f0) o.frequency.exponentialRampToValueAtTime(fEnd, t + a + d * 0.7);
    o.connect(env(c, t, peak, a, d)); o.start(t); o.stop(t + a + d + 0.05);
  }
  function hiss(c, t, freq, q, peak, d) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
      var ch = noiseBuf.getChannelData(0);
      for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    var s = c.createBufferSource(), bp = c.createBiquadFilter();
    s.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q;
    s.connect(bp); bp.connect(env(c, t, peak, 0.004, d)); s.start(t); s.stop(t + d + 0.05);
  }
  var sfx = {
    tap: function (i) {
      var c = audio(); if (!c) return; var t = c.currentTime + 0.005;
      hiss(c, t, 2600 - i * 400, 6, 0.22, 0.05 + i * 0.03);
      tone(c, t, "triangle", 900 - i * 120, 500 - i * 60, 0.12, 0.003, 0.06);
    },
    hatch: function () {
      var c = audio(); if (!c) return; var t = c.currentTime + 0.005;
      hiss(c, t, 1800, 2, 0.3, 0.18);
      tone(c, t, "sine", 180, 90, 0.25, 0.005, 0.18);
      [784, 988, 1175, 1568].forEach(function (f, i) { tone(c, t + 0.12 + i * 0.07, "sine", f, f, 0.12, 0.005, 0.22); });
    },
    rare: function () {
      var c = audio(); if (!c) return; var t = c.currentTime + 0.4;
      [1319, 1568, 2093].forEach(function (f, i) { tone(c, t + i * 0.09, "triangle", f, f, 0.09, 0.004, 0.35); });
    },
    cry: function (ph) {
      var c = audio(); if (!c) return;
      var base = 280 + ph.voice * 2.4, type = ["sine", "triangle", "square", "sawtooth"][ph.temper % 4];
      var n = 2 + (ph.temper % 2), up = ph.mouth % 2 === 0;
      for (var i = 0; i < n; i++) {
        var t = c.currentTime + 0.01 + i * 0.12, f0 = base * (i % 2 ? 1.22 : 1), fE = f0 * (up ? 1.45 : 0.72);
        var o = c.createOscillator(), lp = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(fE, t + 0.1);
        lfo.frequency.value = 14 + (ph.voice % 12); lg.gain.value = f0 * 0.05; lfo.connect(lg); lg.connect(o.frequency);
        lp.type = "lowpass"; lp.frequency.value = base * 3.5;
        o.connect(lp); lp.connect(env(c, t, type === "sine" ? 0.2 : 0.09, 0.012, 0.1));
        o.start(t); o.stop(t + 0.16); lfo.start(t); lfo.stop(t + 0.16);
      }
      if (ph.rare & (RARE_BY.gold.bit | RARE_BY.halo.bit | RARE_BY.galaxy.bit)) tone(c, c.currentTime + 0.05, "sine", base * 4, base * 4, 0.05, 0.004, 0.4);
    },
    ok: function () {
      var c = audio(); if (!c) return; var t = c.currentTime + 0.005;
      tone(c, t, "sine", 880, 880, 0.12, 0.004, 0.08); tone(c, t + 0.08, "sine", 1320, 1320, 0.12, 0.004, 0.12);
    },
    tick: function () { var c = audio(); if (!c) return; tone(c, c.currentTime + 0.005, "triangle", 1400, 900, 0.06, 0.002, 0.04); }
  };
  function initSound() {
    var b = $("#snd"); if (!b) return;
    function paint() { b.setAttribute("aria-pressed", soundOn ? "true" : "false"); b.textContent = soundOn ? "소리 켬" : "소리 끔"; }
    b.hidden = false; paint();
    b.addEventListener("click", function () {
      soundOn = !soundOn;
      try { localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off"); } catch (e) { /* ignore */ }
      paint(); if (soundOn) sfx.tick();
    });
  }

  /* ---------- storage ---------- */
  var KEY = "linku:v1", volatile = false;
  var S = (function () {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { s = null; }
    if (!s || s.v !== 1) s = { v: 1, device: (rand32() & 0xffff) || 1, salt: rand32(), owner: "", list: [], hatched: {}, seen: 0, sel: "" };
    return s;
  })();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); volatile = false; } catch (e) { volatile = true; }
  }
  function byId(id) { for (var i = 0; i < S.list.length; i++) if (S.list[i].id === id) return S.list[i]; return null; }
  function addCreature(cr) {
    S.list.unshift(cr);
    if (S.list.length > 40) S.list.length = 40;
    S.sel = cr.id;
    S.seen |= cr.rare;
    save();
  }
  function newId() { return rand32().toString(36) + Date.now().toString(36).slice(-4); }

  /* ---------- links ---------- */
  var BASE = (function () {
    var s = D.currentScript && D.currentScript.src;
    if (!s) { var tags = D.getElementsByTagName("script"); for (var i = 0; i < tags.length; i++) if (/linku\.js/.test(tags[i].src)) s = tags[i].src; }
    return (s || location.href).replace(/linku\.js.*$/, "");
  })();
  var MAXG = (W.LINKU && W.LINKU.maxg) || 300;
  function eggUrl(cr) {
    var g = cr.gen + 1;
    return BASE + "g/" + (g <= MAXG ? g : "many") + "/?k=" + encodeEgg(cr, S.device);
  }
  function backupUrl(cr) { return BASE + "c/?k=" + encodeOwner(cr); }

  /* ---------- ui helpers ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $(".toast");
    if (!t) { t = D.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); D.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function legacyCopy(text) {
    var ta = D.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.top = "-1000px";
    D.body.appendChild(ta); ta.select();
    var ok = false; try { ok = D.execCommand("copy"); } catch (e) { ok = false; }
    D.body.removeChild(ta); return ok;
  }
  function overlay(fill) {
    closeOverlay();
    var wrap = D.createElement("div"), box = D.createElement("div");
    wrap.className = "overlay"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-modal", "true");
    box.className = "overlay-box"; fill(box);
    var close = D.createElement("button"); close.type = "button"; close.className = "linkbtn overlay-close"; close.textContent = "닫기";
    close.addEventListener("click", closeOverlay); box.appendChild(close);
    wrap.appendChild(box); wrap.addEventListener("click", function (e) { if (e.target === wrap) closeOverlay(); });
    D.body.appendChild(wrap);
  }
  function closeOverlay() { var o = $(".overlay"); if (o) o.parentNode.removeChild(o); }
  function copyField(text, msg) {
    overlay(function (box) {
      var p = D.createElement("p"); p.textContent = msg || "아래 링크를 길게 눌러 복사해 주세요.";
      var input = D.createElement("input"); input.className = "copyfield"; input.value = text; input.readOnly = true;
      box.appendChild(p); box.appendChild(input);
      setTimeout(function () { input.focus(); input.select(); }, 60);
    });
  }
  function copyText(text, okMsg) {
    audio();
    var done = function () { toast(okMsg || "링크를 복사했어요."); sfx.ok(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { if (legacyCopy(text)) done(); else copyField(text); });
    } else if (legacyCopy(text)) done(); else copyField(text);
  }
  function shareEgg(cr) {
    audio();
    var url = eggUrl(cr), g = cr.gen + 1;
    var text = cr.name + "의 알이야. 열어 보면 " + g + "세대 링쿠가 태어나.";
    if (navigator.share) {
      navigator.share({ title: "링쿠 알", text: text, url: url }).then(function () { sfx.ok(); }, function (err) {
        if (!err || err.name !== "AbortError") copyText(text + "\n" + url, "알 링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.");
      });
    } else copyText(text + "\n" + url, "알 링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.");
  }

  function kstHour() { return (new Date(Date.now() + 9 * 3600000)).getUTCHours(); }
  function isNight() { var h = kstHour(); return h >= 1 && h < 6; }
  function ageText(cr) {
    var h = (Date.now() - cr.birth) / 3600000, stage = h < 24 ? "아기" : h < 72 ? "어린이" : "어른";
    var t = h < 1 ? "방금 태어났어요" : h < 24 ? "태어난 지 " + Math.floor(h) + "시간" : "태어난 지 " + Math.floor(h / 24) + "일";
    return t + ", " + stage;
  }
  function phOf(cr) { return pheno(cr.genes, cr.rare, cr.birth); }

  function rareBadge(t, gained) {
    return '<li class="is-rare"><a href="' + BASE + "dex/" + t.id + '.html">' + esc(t.ko) + "</a>" + (gained ? " <b>새로 생김</b>" : "") + "</li>";
  }

  /* 생명체 상세 */
  function creatureHTML(cr, news) {
    var ph = phOf(cr), sleep = isNight();
    var rares = rareList(cr.rare), gainedIds = news ? news.gained : [];
    var facts = [
      ["세대", cr.gen + "세대"],
      ["혈통", lineageName(cr.lin) + " 혈통" + (cr.founder ? " (시조 " + esc(cr.founder) + ")" : "")],
      ["부모", cr.gen === 1 ? "없음. 이 혈통의 시조예요" : (esc(cr.parentName || "이름 모름") + (cr.giver ? " (" + esc(cr.giver) + "에게서 받음)" : ""))],
      ["성격", TEMPER_KO[ph.temper]],
      ["나이", ageText(cr)]
    ];
    var traits = traitList(ph).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") +
      rares.map(function (t) { return rareBadge(t, gainedIds.indexOf(t.id) >= 0); }).join("");
    return '<article class="cr" data-id="' + esc(cr.id) + '">' +
      '<div class="cr-stage"><button class="cr-pet" type="button" aria-label="' + esc(cr.name) + ' 쓰다듬기">' + svgCreature(ph, { sleep: sleep, title: cr.name }) + "</button>" +
      (sleep ? '<p class="cr-sleep">새벽이라 자고 있어요. 두드리면 잠깐 깨요.</p>' : "") + "</div>" +
      '<h2 class="cr-name">' + esc(cr.name) + "</h2>" +
      '<p class="cr-common">' + esc(commonName(ph)) + ', <i lang="la">' + esc(sciName(ph)) + "</i></p>" +
      '<dl class="cr-facts">' + facts.map(function (f) { return "<dt>" + f[0] + "</dt><dd>" + f[1] + "</dd>"; }).join("") + "</dl>" +
      '<h3 class="cr-h">생김새</h3><ul class="cr-traits">' + traits + "</ul>" +
      '<div class="cr-actions">' +
      '<button class="btn" type="button" data-act="egg">알 보내기</button>' +
      '<p class="cr-note">보낸 링크를 친구가 열면 ' + (cr.gen + 1) + "세대 링쿠가 태어나요. 한 링크를 여러 명이 열어도 저마다 다른 아이가 나와요.</p>" +
      '<ul class="cr-more">' +
      '<li><button class="linkbtn" type="button" data-act="copyegg">알 링크만 복사</button></li>' +
      '<li><button class="linkbtn" type="button" data-act="card">표본 카드 이미지 저장</button></li>' +
      '<li><button class="linkbtn" type="button" data-act="backup">보관 링크 복사</button> <span class="cr-hint">다른 브라우저나 폰에서 이 링쿠를 다시 데려올 때 써요.</span></li>' +
      "</ul></div></article>";
  }
  function tileHTML(cr, current) {
    var ph = phOf(cr);
    return '<li><button type="button" class="tile' + (current ? " is-current" : "") + '" data-pick="' + esc(cr.id) + '"' + (current ? ' aria-current="true"' : "") + ">" +
      svgCreature(ph, { cls: "tile-svg" }) + '<span class="tile-name">' + esc(cr.name) + '</span><span class="tile-gen">' + cr.gen + "세대</span></button></li>";
  }

  function bindCreature(root, cr) {
    var pet = $(".cr-pet", root);
    if (pet) pet.addEventListener("click", function () {
      var ph = phOf(cr);
      sfx.cry(ph);
      pet.innerHTML = svgCreature(ph, { title: cr.name, mood: "open", cls: "is-jump" });
      setTimeout(function () { pet.innerHTML = svgCreature(ph, { title: cr.name, sleep: isNight() }); }, 520);
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("[data-act]") : null; if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "egg") shareEgg(cr);
      else if (act === "copyegg") copyText(eggUrl(cr), "알 링크를 복사했어요.");
      else if (act === "backup") copyText(backupUrl(cr), "보관 링크를 복사했어요. 카톡 나와의 채팅에 보내 두면 안전해요.");
      else if (act === "card") makeCard(cr);
    });
  }

  function renderMine(target) {
    if (!target) return;
    if (!S.list.length) { target.hidden = true; return; }
    var cur = byId(S.sel) || S.list[0];
    target.hidden = false;
    var others = S.list.length > 1 ? '<h3 class="cr-h">내 링쿠 ' + S.list.length + '마리</h3><ul class="tiles">' + S.list.map(function (c) { return tileHTML(c, c.id === cur.id); }).join("") + "</ul>" : "";
    target.innerHTML = '<h2 class="sec-h">내 링쿠</h2>' + (volatile ? '<p class="warn">이 브라우저에서는 저장이 안 돼요. 보관 링크를 복사해 두세요.</p>' : "") +
      '<div class="mine-cur"></div>' + others;
    var holder = $(".mine-cur", target);
    holder.innerHTML = creatureHTML(cur);
    bindCreature(holder, cur);
    $$("[data-pick]", target).forEach(function (b) {
      b.addEventListener("click", function () { S.sel = b.getAttribute("data-pick"); save(); sfx.tick(); renderMine(target); target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); });
    });
  }

  /* ---------- hatching ---------- */
  function hatchStage(stage, opts) {
    /* opts: {parentPh, label, line1, line2, onHatch(): {cr, news}} */
    var taps = 0, done = false;
    stage.innerHTML =
      '<p class="egg-kicker">' + opts.kicker + "</p>" +
      '<button class="egg-btn" type="button" aria-label="알 두드리기, 세 번 중 첫 번째">' + svgEgg(opts.parentPh, opts.label) + "</button>" +
      '<p class="egg-line">' + opts.line1 + "</p>" +
      (opts.line2 ? '<p class="egg-sub">' + opts.line2 + "</p>" : "") +
      '<p class="egg-how" aria-live="polite">알을 세 번 두드려 깨워 주세요.</p>';
    var btn = $(".egg-btn", stage), how = $(".egg-how", stage);
    btn.addEventListener("click", function () {
      if (done) return;
      taps++;
      sfx.tap(taps - 1);
      btn.classList.remove("is-wobble"); void btn.offsetWidth; btn.classList.add("is-wobble");
      btn.classList.add("crack-" + taps);
      if (taps < 3) {
        how.textContent = taps === 1 ? "금이 갔어요. 두 번 더." : "거의 다 왔어요. 한 번 더.";
        btn.setAttribute("aria-label", "알 두드리기, 세 번 중 " + (taps + 1) + "번째");
        return;
      }
      done = true;
      sfx.hatch();
      btn.classList.add("is-open");
      var res = opts.onHatch();
      setTimeout(function () { reveal(stage, res); }, reduced ? 50 : 520);
    });
  }
  function reveal(stage, res) {
    var cr = res.cr, news = res.news, ph = phOf(cr);
    var gained = news.gained.map(function (id) { return RARE_BY[id]; });
    var banner = gained.length ? '<div class="mut" role="status"><p class="mut-h">돌연변이가 일어났어요</p><ul>' + gained.map(function (t) {
      return "<li>" + esc(josa.ig(t.ko)) + " 생겼어요. " + (t.min > 1 ? t.min + "세대부터 나오는 형질이에요." : (t.keep ? "어느 세대에서나 드물게 나와요." : "알에서 나올 때만 생기는 모양이에요.")) + "</li>";
    }).join("") + "</ul></div>" : "";
    if (gained.length) sfx.rare();
    var diff = news.parentPh ? diffLines(news.parentPh, pheno(cr.genes, cr.rare, 0)) : [];
    var lost = news.lost.map(function (id) { return "부모의 " + josa.eun(RARE_BY[id].ko) + " 물려받지 못했어요"; });
    var lines = diff.concat(lost);
    var diffHTML = news.parentPh ? ('<div class="pair"><figure><div class="pair-svg">' + svgCreature(news.parentPh, { title: "부모" }) + "</div><figcaption>부모 " + esc(news.parentName || "") + "</figcaption></figure>" +
      '<figure><div class="pair-svg">' + svgCreature(ph, { title: "새로 태어난 아이" }) + "</div><figcaption>새로 태어난 " + cr.gen + "세대</figcaption></figure></div>" +
      (lines.length ? '<ul class="diff">' + lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" : '<p class="diff">부모와 꼭 닮았어요.</p>')) : "";
    stage.innerHTML =
      '<div class="born-svg">' + svgCreature(ph, { title: "새로 태어난 링쿠", cls: "is-born" }) + "</div>" +
      '<h1 class="born-h">' + cr.gen + "세대 링쿠가 태어났어요</h1>" + banner + diffHTML +
      '<form class="name-form" novalidate>' +
      '<p><label for="nm">이름</label><input id="nm" name="nm" maxlength="6" autocomplete="off" value="' + esc(cr.name) + '"></p>' +
      '<p><label for="ow">보호자 이름 <span>(내 이름, 다음 사람에게 보여요)</span></label><input id="ow" name="ow" maxlength="6" autocomplete="nickname" value="' + esc(S.owner || "") + '" placeholder="비워 둬도 돼요"></p>' +
      '<p class="form-err" aria-live="polite"></p>' +
      '<button class="btn" type="submit">데려가기</button></form>';
    stage.classList.add("is-born");
    var form = $(".name-form", stage), err = $(".form-err", stage);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nm = cleanName($("#nm").value) || cr.name, ow = cleanName($("#ow").value);
      var bad = nameProblem(nm) || nameProblem(ow);
      if (bad) { err.textContent = bad; return; }
      cr.name = nm; cr.keeper = ow; if (ow) S.owner = ow;
      if (cr.gen === 1) cr.founder = ow;
      addCreature(cr);
      if (news.eggKey) { S.hatched[news.eggKey] = cr.id; save(); }
      sfx.ok();
      showPanel(cr, news, stage);
    });
  }
  function showPanel(cr, news, stage) {
    var panel = $("#panel");
    if (stage) stage.hidden = true;
    if (!panel) {
      var mine = $("#mine");
      renderMine(mine);
      if (mine) mine.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      toast(josa.eul(cr.name) + " 데려왔어요. 알을 보내 2세대를 이어 주세요.");
      return;
    }
    panel.hidden = false;
    panel.innerHTML = '<p class="kept">' + esc(josa.eul(cr.name)) + " 데려왔어요. 이제 알을 보내 다음 세대를 이어 주세요.</p>" +
      creatureHTML(cr, news) + '<p class="back"><a href="' + BASE + '">링쿠 처음으로</a></p>';
    bindCreature(panel, cr);
    W.scrollTo(0, 0);
  }

  function eggKeyOf(k) { return fnv(k).toString(36); }

  function initHatch() {
    var stage = $("#eggStage"); if (!stage) return false;
    var k = new URLSearchParams(location.search).get("k");
    if (!k) { stage.innerHTML = '<p class="egg-kicker">알이 비어 있어요</p><p class="egg-line">링크 끝부분이 잘린 것 같아요. 받은 링크를 처음부터 끝까지 다시 눌러 주세요.</p><p><a href="' + BASE + '">링쿠 처음으로</a></p>'; return true; }
    var egg;
    try { egg = decodeEgg(k); } catch (e) {
      stage.innerHTML = '<p class="egg-kicker">알이 깨져 있어요</p><p class="egg-line">링크가 중간에 잘렸거나 바뀌었어요. 보낸 사람에게 링크를 다시 받아 주세요.</p><p><a href="' + BASE + '">링쿠 처음으로</a></p>';
      return true;
    }
    var key = eggKeyOf(k), pph = pheno(egg.genes, egg.rare, 0), g = egg.gen + 1;
    var already = S.hatched[key] && byId(S.hatched[key]);
    if (already) {
      stage.hidden = true;
      var panel = $("#panel"); panel.hidden = false;
      panel.innerHTML = '<p class="kept">이 알은 이미 이 브라우저에서 깨어났어요.</p>' + creatureHTML(already) + '<p class="back"><a href="' + BASE + '">링쿠 처음으로</a></p>';
      bindCreature(panel, already);
      return true;
    }
    var mine = egg.tag === S.device && S.list.some(function (c) { return c.lin === egg.lin && c.gen === egg.gen && c.genes.join() === egg.genes.join(); });
    if (mine) {
      stage.innerHTML = '<p class="egg-kicker">내가 보낸 알이에요</p>' + '<div class="egg-still">' + svgEgg(pph, g + "") + "</div>" +
        '<p class="egg-line">자기 알은 스스로 깨울 수 없어요. 친구가 열어야 ' + g + "세대가 태어나요.</p>" +
        '<p><a href="' + BASE + '">내 링쿠 보러 가기</a></p>';
      return true;
    }
    var from = egg.keeper ? esc(egg.keeper) + "님이 보낸 알" : "누군가 보낸 알";
    hatchStage(stage, {
      parentPh: pph, label: g + "",
      kicker: from,
      line1: g + "세대 알이에요. " + esc(lineageName(egg.lin)) + " 혈통" + (egg.founder ? ", 시조는 " + esc(egg.founder) : ""),
      line2: "부모 " + esc(egg.name || "이름 모름") + "의 유전자가 이 링크 안에 들어 있어요.",
      onHatch: function () {
        var res = hatchFrom(egg, fnv(k + ":" + S.device + ":" + S.salt));
        var cr = { id: newId(), lin: egg.lin, gen: res.gen, genes: res.genes, rare: res.rare, birth: Date.now(),
          name: creatureName(res.genes, egg.lin), founder: egg.founder, keeper: "", parentName: egg.name, giver: egg.keeper,
          pgenes: egg.genes, prare: egg.rare };
        return { cr: cr, news: { gained: res.gained, lost: res.lost, parentPh: pph, parentName: egg.name, eggKey: key } };
      }
    });
    return true;
  }

  function startFounder(box) {
    box.hidden = false;
    hatchStage(box, {
      parentPh: null, label: "1",
      kicker: "새 혈통의 첫 알",
      line1: "이 알에서 1세대 링쿠가 태어나요. 깨어난 아이가 보낸 알에서 2세대가 이어져요.",
      line2: "",
      onHatch: function () {
        var res = founderFrom(rand32() ^ S.salt);
        var cr = { id: newId(), lin: res.lin, gen: 1, genes: res.genes, rare: res.rare, birth: Date.now(),
          name: creatureName(res.genes, res.lin), founder: "", keeper: "", parentName: "", giver: "", pgenes: res.genes, prare: 0 };
        return { cr: cr, news: { gained: res.gained, lost: [], parentPh: null } };
      }
    });
    box.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  function initHome() {
    var qk = new URLSearchParams(location.search).get("k");
    if (qk) {
      try { var eg = decodeEgg(qk), gg = eg.gen + 1; location.replace(BASE + "g/" + (gg <= MAXG ? gg : "many") + "/?k=" + qk); return; } catch (e) { /* not an egg */ }
    }
    var mine = $("#mine");
    renderMine(mine);
    if (mine && S.list.length && mine.parentNode) {
      var hero0 = $(".hero");
      if (hero0) { hero0.classList.add("is-compact"); mine.parentNode.insertBefore(mine, hero0); }
    }
    var hero = $("#heroCreature");
    if (hero) {
      var demo = founderFrom(rand32());
      var hph = pheno(demo.genes, demo.rare, 0);
      hero.innerHTML = svgCreature(hph, { title: "링쿠" });
      hero.addEventListener("click", function () {
        sfx.cry(hph);
        hero.innerHTML = svgCreature(hph, { title: "링쿠", mood: "open", cls: "is-jump" });
        setTimeout(function () { hero.innerHTML = svgCreature(hph, { title: "링쿠" }); }, 520);
      });
      var linkText = $("#heroLink");
      if (linkText) linkText.textContent = BASE.replace(/^https?:\/\//, "") + "g/" + (2 + (demo.lin % 40)) + "/?k=" + encodeEgg({ lin: demo.lin, gen: 1 + (demo.lin % 40), genes: demo.genes, rare: 0, founder: "", name: "", keeper: "" }, 0).slice(0, 22) + "…";
    }
    var start = $("#startBtn"), box = $("#founder");
    if (start && box) start.addEventListener("click", function (e) { e.preventDefault(); audio(); sfx.tick(); start.hidden = true; startFounder(box); });
    var sample = $("#samples");
    if (sample) {
      var html = "";
      for (var i = 0; i < 6; i++) {
        var f = founderFrom(0x51ed + i * 7919), gen = [2, 9, 27, 55, 104, 160][i], rare = 0;
        var picks = [[], ["stareyes"], ["wings", "heart"], ["crown", "rainbow"], ["galaxy", "flower"], ["halo", "gold"]][i];
        picks.forEach(function (id) { rare |= RARE_BY[id].bit; });
        var ph = pheno(f.genes, rare, 0);
        html += "<li><figure>" + svgCreature(ph, { title: commonName(ph) }) + "<figcaption>" + gen + "세대 " + esc(commonName(ph)) + "</figcaption></figure></li>";
      }
      sample.innerHTML = html;
    }
  }

  function initRestore() {
    var box = $("#restore"); if (!box) return false;
    var k = new URLSearchParams(location.search).get("k"), cr;
    try { cr = decodeOwner(k || ""); } catch (e) {
      box.innerHTML = '<h1 class="born-h">보관 링크가 잘렸어요</h1><p>링크를 처음부터 끝까지 복사했는지 확인해 주세요.</p><p><a href="' + BASE + '">링쿠 처음으로</a></p>';
      return true;
    }
    var exists = S.list.filter(function (c) {
      return c.lin === cr.lin && c.gen === cr.gen && c.genes.join() === cr.genes.join() && Math.round(c.birth / 60000) === Math.round(cr.birth / 60000);
    })[0];
    var ph = phOf(cr);
    box.innerHTML = '<div class="born-svg">' + svgCreature(ph, { title: cr.name }) + "</div>" +
      '<h1 class="born-h">' + esc(cr.name) + ", " + cr.gen + "세대</h1>" +
      "<p>" + esc(lineageName(cr.lin)) + " 혈통" + (cr.keeper ? ", 보호자 " + esc(cr.keeper) : "") + "</p>" +
      (exists ? "<p>이미 이 브라우저에 있는 링쿠예요.</p><p><a class=\"btn\" href=\"" + BASE + "\">보러 가기</a></p>" :
        '<p><button class="btn" type="button" id="takeBack">이 브라우저로 데려오기</button></p>');
    var take = $("#takeBack");
    if (take) take.addEventListener("click", function () {
      cr.id = newId();
      addCreature(cr); sfx.ok();
      location.href = BASE;
    });
    return true;
  }

  function initDex() {
    $$("[data-specimen]").forEach(function (el) {
      var id = el.getAttribute("data-specimen"), t = RARE_BY[id];
      var f = founderFrom(fnv(id) ^ 0x2468);
      var ph = pheno(f.genes, t ? t.bit : 0, 0);
      var seen = t && (S.seen & t.bit);
      el.innerHTML = svgCreature(ph, { title: t ? t.ko : "링쿠", cls: (t && id === "guest" && !seen) ? "is-unknown" : "" });
      var st = el.parentNode && el.parentNode.querySelector("[data-seen]");
      if (st) st.textContent = seen ? "내 링쿠에게서 본 적 있어요" : "아직 못 봤어요";
    });
  }

  /* ---------- specimen card image ---------- */
  function loadFonts() {
    if (!D.fonts || !D.fonts.load) return Promise.resolve();
    return Promise.all(['800 64px "Nanum Myeongjo"', '400 32px "Nanum Myeongjo"'].map(function (f) { return D.fonts.load(f).catch(function () { }); }));
  }
  function svgImage(svg) {
    return new Promise(function (ok, no) {
      var img = new Image();
      img.onload = function () { ok(img); }; img.onerror = no;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" '));
    });
  }
  function makeCard(cr) {
    audio();
    var ph = phOf(cr), cv = D.createElement("canvas");
    cv.width = 1080; cv.height = 1350;
    var x = cv.getContext("2d");
    loadFonts().then(function () { return svgImage(svgCreature(ph, {})); }).then(function (img) {
      var serif = '"Nanum Myeongjo", "NanumMyeongjo", serif';
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 1080, 1350);
      x.fillStyle = "#0000EE"; x.font = "400 34px " + serif; x.fillText("링쿠 표본", 80, 110);
      x.fillRect(80, 122, x.measureText("링쿠 표본").width, 3);
      x.fillStyle = "#111"; x.font = "400 30px " + serif;
      var code = "No. " + cr.lin.toString(16).toUpperCase().padStart(6, "0") + "-" + cr.gen;
      x.textAlign = "right"; x.fillText(code, 1000, 110); x.textAlign = "left";
      x.drawImage(img, 140, 150, 800, 800);
      x.font = "800 92px " + serif; x.fillText(cr.name, 80, 1040);
      x.font = "italic 400 34px " + serif; x.fillStyle = "#333"; x.fillText(sciName(ph), 80, 1096);
      x.fillStyle = "#111"; x.font = "400 36px " + serif;
      var rows = [cr.gen + "세대, " + lineageName(cr.lin) + " 혈통" + (cr.founder ? " (시조 " + cr.founder + ")" : ""),
        cr.gen === 1 ? "이 혈통의 첫 링쿠" : "부모 " + (cr.parentName || "이름 모름") + (cr.giver ? ", " + cr.giver + "에게서 받음" : "")];
      rows.forEach(function (r, i) { x.fillText(r, 80, 1160 + i * 54); });
      x.fillStyle = "#0000EE"; x.font = "400 30px " + serif;
      var u = BASE.replace(/^https?:\/\//, "").replace(/\/$/, "");
      x.fillText(u, 80, 1290); x.fillRect(80, 1300, x.measureText(u).width, 2);
      cv.toBlob(function (blob) {
        if (!blob) { toast("이미지를 만들지 못했어요."); return; }
        var file = null;
        try { file = new File([blob], "linku-" + cr.gen + ".png", { type: "image/png" }); } catch (e) { file = null; }
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: "링쿠 표본 카드" }).then(function () { sfx.ok(); }, function () { });
        } else {
          var url = URL.createObjectURL(blob), a = D.createElement("a");
          a.href = url; a.download = "linku-" + cr.gen + ".png"; D.body.appendChild(a); a.click(); D.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          toast("표본 카드를 저장했어요. 저장이 안 되면 브라우저 앱에서 열어 주세요.");
        }
      }, "image/png");
    }).catch(function () { toast("이미지를 만들지 못했어요."); });
  }

  /* ---------- boot ---------- */
  function boot() {
    initSound();
    if (initHatch()) return;
    if (initRestore()) return;
    initHome();
    initDex();
  }
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", boot); else boot();

  /* 테스트용 노출: 같은 규칙으로 계산하는지 확인할 때만 쓴다 */
  W.__linkuEggSvg = function (ph) { return svgEgg(ph, ""); };
  W.__linku = { hatchFrom: hatchFrom, founderFrom: founderFrom, encodeEgg: encodeEgg, decodeEgg: decodeEgg, encodeOwner: encodeOwner, decodeOwner: decodeOwner,
    pheno: pheno, svgCreature: svgCreature, RARE: RARE, diffLines: diffLines, commonName: commonName, sciName: sciName, creatureName: creatureName };
})();
