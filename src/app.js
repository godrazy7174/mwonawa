/* 뭐나와 — 테스트 진행, 카드 뽑기, 결과 공유 */
(function () {
  "use strict";

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function readJSON(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  /* ---------- storage (per-viewer convenience only) ---------- */
  var store = {
    get: function (key, fallback) {
      try { var v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };
  var DONE_KEY = "mwonawa:done";

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $(".toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- copy ---------- */
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function showCopyField(text) {
    openOverlay(function (box) {
      var p = document.createElement("p");
      p.textContent = "아래 링크를 길게 눌러 복사해 줘";
      var input = document.createElement("input");
      input.className = "copyfield";
      input.id = "copyfield";
      input.value = text;
      input.readOnly = true;
      box.appendChild(p);
      box.appendChild(input);
      setTimeout(function () { input.focus(); input.select(); }, 50);
    });
  }
  function copyText(text, okMsg) {
    var done = function () { toast(okMsg || "링크를 복사했어요"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        if (legacyCopy(text)) done(); else showCopyField(text);
      });
    } else if (legacyCopy(text)) {
      done();
    } else {
      showCopyField(text);
    }
  }

  /* ---------- overlay ---------- */
  function openOverlay(fill) {
    closeOverlay();
    var wrap = document.createElement("div");
    wrap.className = "overlay";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    var box = document.createElement("div");
    box.className = "overlay-box";
    fill(box);
    var close = document.createElement("button");
    close.className = "btn";
    close.type = "button";
    close.textContent = "닫기";
    close.addEventListener("click", closeOverlay);
    box.appendChild(close);
    wrap.appendChild(box);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closeOverlay(); });
    document.addEventListener("keydown", escClose);
    document.body.appendChild(wrap);
  }
  function escClose(e) { if (e.key === "Escape") closeOverlay(); }
  function closeOverlay() {
    var o = $(".overlay");
    if (o) o.parentNode.removeChild(o);
    document.removeEventListener("keydown", escClose);
  }

  /* ---------- result decision (shared rule with the build's calibration) ---------- */
  function decide(test, answers) {
    var s = {}, last = {};
    test.order.forEach(function (k) { s[k] = 0; last[k] = -1; });
    answers.forEach(function (ai, qi) {
      var sc = test.questions[qi].o[ai].s;
      Object.keys(sc).forEach(function (k) { s[k] += sc[k]; last[k] = qi; });
    });
    var best = null;
    test.order.forEach(function (k) {
      var v = Math.round(s[k] * (test.w[k] || 1) * 1e9) / 1e9;
      if (best === null || v > best.v + 1e-12 || (Math.abs(v - best.v) <= 1e-12 && last[k] > best.l)) {
        best = { k: k, v: v, l: last[k] };
      }
    });
    return best.k;
  }
  window.__mwonawaDecide = decide;

  /* ---------- home: stamp finished tests ---------- */
  function initHome() {
    var done = store.get(DONE_KEY, {});
    $$("[data-test]").forEach(function (card) {
      var r = done[card.getAttribute("data-test")];
      if (!r || !r.url) return;
      card.classList.add("is-done");
      var stamp = $(".tcard-stamp", card);
      if (stamp) { stamp.textContent = r.icon || "✓"; stamp.setAttribute("aria-label", "완료"); }
      var mine = $(".tcard-mine", card);
      if (mine) { mine.href = r.url; mine.textContent = "내 결과 다시 보기: " + r.name; }
    });
  }

  /* ---------- quiz ---------- */
  function initQuiz(test) {
    var intro = $("#intro"), qbox = $("#qbox"), doneBox = $("#done");
    var qtext = $("#qtext"), opts = $("#opts"), qcount = $("#qcount"), chart = $("#chart");
    var prev = $("#prev"), see = $("#see");
    var n = test.questions.length, i = 0, answers = [], busy = false;

    for (var c = 0; c < n; c++) chart.appendChild(document.createElement("i"));

    function render() {
      var q = test.questions[i];
      qcount.textContent = (i + 1) + " / " + n;
      qtext.textContent = q.q;
      opts.innerHTML = "";
      q.o.forEach(function (o, ai) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "opt" + (answers[i] === ai ? " is-picked" : "");
        b.id = "opt-" + i + "-" + ai;
        b.textContent = o.t;
        b.addEventListener("click", function () { pick(ai, b); });
        opts.appendChild(b);
      });
      $$("i", chart).forEach(function (dot, di) {
        dot.className = di < i || answers[di] !== undefined && di !== i ? "on" : (di === i ? "now" : "");
      });
      prev.hidden = i === 0;
      busy = false;
    }
    function pick(ai, btn) {
      if (busy) return;
      busy = true;
      answers[i] = ai;
      $$(".opt", opts).forEach(function (b) { b.classList.remove("is-picked"); });
      btn.classList.add("is-picked");
      setTimeout(function () {
        if (i < n - 1) { i++; render(); qtext.focus({ preventScroll: true }); }
        else finish();
      }, reduced ? 60 : 220);
    }
    function finish() {
      var id = decide(test, answers.slice(0, n));
      see.href = "r-" + test.slug + "-" + id + ".html#me";
      qbox.hidden = true;
      doneBox.hidden = false;
      extras.forEach(function (el) { el.hidden = false; });
      var st = $(".stamp", doneBox);
      if (st && !reduced) { st.classList.remove("thud"); void st.offsetWidth; st.classList.add("thud"); }
      see.focus({ preventScroll: true });
      doneBox.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    }
    var extras = $$(".typelist, .ad");
    $("#start").addEventListener("click", function () {
      extras.forEach(function (el) { el.hidden = true; });
      intro.hidden = true;
      qbox.hidden = false;
      i = 0;
      render();
      qbox.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    });
    prev.addEventListener("click", function () { if (i > 0) { i--; render(); } });
    var restart = $("#restart");
    if (restart) restart.addEventListener("click", function () {
      answers = []; i = 0; doneBox.hidden = true; qbox.hidden = false; render();
    });
    qtext.setAttribute("tabindex", "-1");
  }

  /* ---------- 2027 card draw ---------- */
  function initDraw(data) {
    var deck = $("#deck"), hint = $("#hint"), reveal = $("#reveal"), see = $("#see"), again = $("#again");
    var cards = $$(".card", deck);
    var picked = false;

    function deal() {
      deck.classList.remove("picked");
      cards.forEach(function (c) {
        c.classList.remove("flipped");
        c.setAttribute("aria-pressed", "false");
        $(".card-front", c).innerHTML = "";
      });
      reveal.hidden = true;
      hint.textContent = "마음이 가는 카드 한 장을 골라 봐";
      picked = false;
      if (!reduced) {
        deck.classList.add("stacked");
        requestAnimationFrame(function () { requestAnimationFrame(function () { deck.classList.remove("stacked"); }); });
      }
    }
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        if (picked) return;
        picked = true;
        var key = data.order[Math.floor(Math.random() * data.order.length)];
        var r = data.results[key];
        var front = $(".card-front", card);
        front.innerHTML = "";
        var b = document.createElement("b"); b.textContent = r.name;
        var s = document.createElement("small"); s.textContent = r.tagline;
        front.appendChild(b); front.appendChild(s);
        card.classList.add("flipped");
        card.setAttribute("aria-pressed", "true");
        deck.classList.add("picked");
        hint.textContent = "2027년 너의 키워드는 ‘" + r.name + "’";
        see.href = "r-2027-" + key + ".html#me";
        setTimeout(function () { reveal.hidden = false; see.focus({ preventScroll: true }); }, reduced ? 0 : 650);
      });
    });
    again.addEventListener("click", deal);
    deal();
  }

  /* ---------- result page ---------- */
  function shareUrl() {
    var canon = $('link[rel="canonical"]');
    if (canon && canon.href && /^https?:/.test(canon.href) && canon.href.indexOf(location.host) !== -1) return canon.href;
    return location.href.split("#")[0];
  }

  function initResult(card) {
    var key = "me:" + location.pathname;
    var isMe = location.hash === "#me";
    try {
      if (isMe) sessionStorage.setItem(key, "1");
      else if (sessionStorage.getItem(key) === "1") isMe = true;
    } catch (e) { /* ignore */ }

    if (isMe) {
      document.body.classList.add("is-me");
      $$(".friend-only").forEach(function (el) { el.hidden = true; });
      $$(".me-only").forEach(function (el) { el.hidden = false; });
      var done = store.get(DONE_KEY, {});
      done[card.slug] = { id: card.id, name: card.name, icon: card.stampIcon, url: location.pathname.split("/").pop() || card.file };
      store.set(DONE_KEY, done);
      if (location.hash === "#me" && window.history && history.replaceState) {
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* ignore */ }
      }
    }

    if (!isMe) {
      // a visitor who came from search or from another page here was not sent this result by a friend
      var ref = "";
      try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) { ref = ""; }
      var note = $("#friendNote");
      if (note && ref && (ref === location.hostname || /(^|\.)(google|naver|daum|bing|yahoo|duckduckgo)\./.test(ref))) note.hidden = true;
    }

    var url = shareUrl();
    var text = card.shareText;

    $("#btnShare").addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: card.pageTitle, text: text, url: url }).catch(function (err) {
          if (err && err.name === "AbortError") return;
          copyText(text + "\n" + url);
        });
      } else {
        copyText(text + "\n" + url, "링크를 복사했어요. 단톡방에 붙여 넣어 봐");
      }
    });
    $("#btnCopy").addEventListener("click", function () { copyText(url); });
    $("#btnImage").addEventListener("click", function () { saveImage(card, url); });
  }

  /* ---------- share image ---------- */
  function wrapLines(ctx, text, maxW) {
    var words = String(text).split(" "), lines = [], line = "";
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    var out = [];
    lines.forEach(function (l) {
      if (ctx.measureText(l).width <= maxW) { out.push(l); return; }
      var cur = "";
      Array.from(l).forEach(function (ch) {
        if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch;
      });
      if (cur) out.push(cur);
    });
    return out;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  var DISPLAY = '"Bagel Fat One", "Jua", sans-serif';
  var BODY = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  var EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

  function drawCard(card, siteLabel) {
    var W = 1080, H = 1350;
    var cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var g = cv.getContext("2d");
    var C = card.colors;

    // grid-paper ground in the test colour
    g.fillStyle = C.fill; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = 2;
    for (var x = 0; x <= W; x += 54) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (var y = 0; y <= H; y += 54) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

    // header
    g.fillStyle = C.ink; g.textAlign = "center"; g.textBaseline = "alphabetic";
    g.font = "400 50px " + DISPLAY;
    g.fillText(card.testTitle, W / 2, 128);

    // sticker panel with die-cut edge
    var px = 84, py = 180, pw = W - 168, ph = 960;
    g.save();
    g.shadowColor = "rgba(20,24,40,0.28)"; g.shadowBlur = 40; g.shadowOffsetY = 16;
    g.fillStyle = "#FFFFFF"; roundRect(g, px - 14, py - 14, pw + 28, ph + 28, 70); g.fill();
    g.restore();
    g.fillStyle = C.panel; roundRect(g, px, py, pw, ph, 58); g.fill();

    var cx = W / 2, top = py;
    g.textAlign = "center";
    if (card.kind === "year") {
      g.fillStyle = C.accent; g.font = "400 56px " + DISPLAY;
      g.fillText("2027 나의 키워드", cx, top + 150);
      g.fillStyle = C.panelInk; g.font = "400 " + (card.name.length > 3 ? 190 : 230) + "px " + DISPLAY;
      g.fillText(card.name, cx, top + 420);
      g.font = "700 46px " + BODY; g.fillStyle = C.panelInk;
      wrapLines(g, card.tagline, pw - 140).slice(0, 2).forEach(function (l, li) { g.fillText(l, cx, top + 540 + li * 64); });
      g.font = "500 38px " + BODY; g.fillStyle = C.sub;
      (card.facts || []).forEach(function (f, fi) { g.fillText(f, cx, top + 720 + fi * 62); });
    } else {
      var isChat = card.kind === "chat" && card.chat;
      var yName = top + 640, yTag = top + 740, yTags = top + 890;
      if (isChat) {
        var by = top + 80;
        g.font = "500 38px " + BODY;
        card.chat.forEach(function (m) {
          var lines = wrapLines(g, m[1], 560).slice(0, 2);
          var bw = Math.max.apply(null, lines.map(function (l) { return g.measureText(l).width; })) + 64;
          var bh = lines.length * 52 + 40;
          var bx = m[0] === "me" ? px + pw - 56 - bw : px + 56;
          g.fillStyle = m[0] === "me" ? C.fill : "#FFFFFF";
          roundRect(g, bx, by, bw, bh, 34); g.fill();
          g.lineWidth = 5; g.strokeStyle = C.ink; g.stroke();
          g.fillStyle = C.ink;
          g.textAlign = "left";
          lines.forEach(function (l, li) { g.fillText(l, bx + 32, by + 64 + li * 52); });
          by += bh + 20;
        });
        g.textAlign = "center";
        g.font = "400 130px " + EMOJI; g.fillStyle = C.ink;
        g.fillText(card.icon, cx, top + 545);
        yName = top + 675; yTag = top + 765; yTags = top + 900;
      } else {
        g.font = "400 300px " + EMOJI; g.fillStyle = C.ink;
        g.fillText(card.icon, cx, top + 390);
      }
      g.fillStyle = C.panelInk;
      g.font = "400 " + (card.name.length > 6 ? 104 : 126) + "px " + DISPLAY;
      g.fillText(card.name, cx, yName);
      g.font = "700 46px " + BODY; g.fillStyle = C.panelInk;
      wrapLines(g, card.tagline, pw - 140).slice(0, 2).forEach(function (l, li) { g.fillText(l, cx, yTag + li * 60); });
      g.font = "500 38px " + BODY; g.fillStyle = C.sub;
      g.fillText((card.tags || []).map(function (t) { return "#" + t; }).join("  "), cx, yTags);
    }

    // footer
    g.fillStyle = C.ink; g.textAlign = "center";
    g.font = "400 58px " + DISPLAY;
    g.fillText(card.footer, W / 2, H - 92);
    g.font = "500 32px " + BODY;
    g.fillText(siteLabel, W / 2, H - 42);
    return cv;
  }

  function saveImage(card, url) {
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load('400 120px "Bagel Fat One"'),
          document.fonts.load('700 46px "IBM Plex Sans KR"'),
          document.fonts.load('500 38px "IBM Plex Sans KR"')
        ]).catch(function () { return null; })
      : Promise.resolve();
    fontsReady.then(function () {
      var cv = drawCard(card, card.siteLabel);
      var dataUrl = cv.toDataURL("image/png");
      var fallback = function () {
        openOverlay(function (box) {
          var img = document.createElement("img");
          img.src = dataUrl;
          img.alt = card.name + " 결과 이미지";
          var p = document.createElement("p");
          p.textContent = "이미지를 길게 눌러 저장해 줘";
          box.appendChild(img);
          box.appendChild(p);
          var a = document.createElement("a");
          a.className = "btn btn--ink";
          a.href = dataUrl;
          a.download = "mwonawa-" + card.slug + "-" + card.id + ".png";
          a.textContent = "파일로 저장 (PC)";
          box.appendChild(a);
        });
      };
      if (!cv.toBlob || !navigator.canShare) { fallback(); return; }
      cv.toBlob(function (blob) {
        if (!blob) { fallback(); return; }
        var file;
        try { file = new File([blob], "mwonawa-" + card.slug + "-" + card.id + ".png", { type: "image/png" }); }
        catch (e) { fallback(); return; }
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: card.pageTitle, text: card.shareText + "\n" + url }).catch(function (err) {
            if (err && err.name === "AbortError") return;
            fallback();
          });
        } else {
          fallback();
        }
      }, "image/png");
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    if ($(".page-home")) initHome();
    var test = readJSON("test-data");
    if (test) initQuiz(test);
    var draw = readJSON("draw-data");
    if (draw) initDraw(draw);
    var card = readJSON("card-data");
    if (card) initResult(card);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
