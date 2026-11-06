# -*- coding: utf-8 -*-
"""하늘봐 페이지를 OUT/sky/ 에 만든다. 뭐나와 build.py가 불러 쓴다.
숫자 자료(data/)는 make_data.py로 미리 만들어 둔다."""
import datetime
import html
import json
import os
import shutil

from . import content as C

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Dodum&amp;family=Song+Myung&amp;display=swap">')
WD = "월화수목금토일"
# 처음 그릴 때 깜박이지 않게, 시각만 보고 낮·노을·밤을 대강 정해 둔다. 정확한 값은 sky.js가 해의 고도로 다시 정한다.
THEME_JS = ("<script>(function(){var h=(new Date().getUTCHours()+9)%24;"
            "document.documentElement.setAttribute('data-sky',h>=7&&h<17?'day':(h>=17&&h<19)||(h>=5&&h<7)?'dusk':'night');})();</script>")


def e(s):
    return html.escape(str(s), quote=True)


def load(name):
    with open(os.path.join(DATA, name), encoding="utf-8") as f:
        return json.load(f)


def ko_time(hm):
    h, m = map(int, hm.split(":"))
    ap = "오전" if h < 12 else "오후"
    hh = h if h <= 12 else h - 12
    return f"{ap} {hh}시" + (f" {m}분" if m else "")


def moon_icon(p, f, r=7):
    """밤 9시 달 모양 작은 그림. 차오를 때는 오른쪽, 기울 때는 왼쪽이 밝다."""
    nm = phase_name(p)
    c = r + 1
    if f < 0.03:
        lit = ""
    elif f > 0.97:
        lit = f'<circle class="lit" cx="{c}" cy="{c}" r="{r}"/>'
    else:
        rx = abs(2 * f - 1) * r
        right = p < 0.5
        s1 = 1 if right else 0
        s2 = (1 if f > 0.5 else 0) if right else (0 if f > 0.5 else 1)
        lit = (f'<path class="lit" d="M{c} {c - r}A{r} {r} 0 0 {s1} {c} {c + r}A{rx:.2f} {r} 0 0 {s2} {c} {c - r}Z"/>')
    return (f'<svg class="mi" viewBox="0 0 {2 * c} {2 * c}" width="{2 * c}" height="{2 * c}" role="img" aria-label="{nm}"><title>{nm}</title>'
            f'<circle class="disc" cx="{c}" cy="{c}" r="{r}"/>{lit}</svg>')


def mins(hm):
    h, m = map(int, hm.split(":"))
    return h * 60 + m


def phase_name(p):
    if p < 0.03 or p >= 0.97:
        return "삭"
    for lim, nm in ((0.22, "초승달"), (0.28, "상현달"), (0.47, "차오르는 달"), (0.53, "보름달"), (0.72, "기우는 달"), (0.78, "하현달")):
        if p < lim:
            return nm
    return "그믐달"


class Site:
    def __init__(self, ctx):
        self.ctx = ctx
        self.out = os.path.join(ctx["OUT"], "sky")
        self.base = ctx["BASE_URL"] + "sky/"
        self.pages = []
        self.hol = load("holidays.json")
        self.moons = load("moons.json")
        self.alm = {}
        for f in sorted(os.listdir(DATA)):
            if f.startswith("alm-"):
                self.alm.update(load(f))
        self.months = sorted({k[:7] for k in self.alm})
        self.alm_years = sorted({int(k[:4]) for k in self.alm})
        self.being = {b["id"]: b for b in C.BEINGS}

    # ---------- frame ----------
    def data_js(self, extra=None):
        d = {"holidays": self.hol, "showers": [[m, dd, nm, rate] for m, dd, nm, rate, *_ in C.SHOWERS],
             "months": self.months, "almYears": self.alm_years}
        if extra:
            d.update(extra)
        return "<script>window.HANEUL=" + json.dumps(d, ensure_ascii=False, separators=(",", ":")) + ";</script>"

    def head(self, title, desc, path, og="og-home.png", og_title=None, noindex=False, rel=""):
        url = self.base + ("" if path == "index.html" else path.replace("index.html", ""))
        p = [f"<title>{e(title)}</title>", f'<meta name="description" content="{e(desc)}">']
        if noindex:
            p.append('<meta name="robots" content="noindex">')
        if not self.ctx["PREVIEW"]:
            p += [
                f'<link rel="canonical" href="{e(url)}">',
                '<meta property="og:type" content="website">',
                '<meta property="og:site_name" content="하늘봐">',
                '<meta property="og:locale" content="ko_KR">',
                f'<meta property="og:title" content="{e(og_title or title)}">',
                f'<meta property="og:description" content="{e(desc)}">',
                f'<meta property="og:url" content="{e(url)}">',
                f'<meta property="og:image" content="{e(self.base + og)}">',
                '<meta property="og:image:width" content="1200">',
                '<meta property="og:image:height" content="630">',
                '<meta name="twitter:card" content="summary_large_image">',
            ]
            client = self.ctx["ADSENSE_CLIENT"]
            if client:
                p.append(f'<meta name="google-adsense-account" content="{e(client)}">')
                p.append(f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={e(client)}" crossorigin="anonymous"></script>')
        p += [
            '<meta name="theme-color" content="#0F1830">',
            f'<link rel="icon" href="{rel}favicon.svg" type="image/svg+xml">',
            f'<link rel="apple-touch-icon" href="{rel}apple-touch-icon.png">',
            FONTS,
            f'<link rel="stylesheet" href="{rel}sky.css">',
        ]
        return "\n".join(p)

    def foot(self, rel):
        root = self.ctx["BASE_URL"]
        return ('<footer class="foot"><nav aria-label="하늘봐 안내">'
                f'<a href="{rel}beings/">하늘에 사는 것들</a><a href="{rel}calendar.html">하늘봐 달력</a>'
                f'<a href="{rel}sun/">해와 달 시각표</a><a href="{rel}about.html">하늘봐 소개</a>'
                f'<a href="{root}privacy.html">개인정보처리방침</a></nav>'
                f'<nav aria-label="같은 사람이 만든 사이트"><a href="{root}">심리테스트 뭐나와</a>'
                f'<a href="{root}galae/">밸런스 게임 갈래</a><a href="{root}linku/">링쿠</a></nav>'
                '<p>© 2026 하늘봐. 하늘을 지나가는 존재들은 상상이에요.</p></footer>')

    def write(self, path, title, desc, body, top, og="og-home.png", og_title=None, noindex=False, priority=None, extra=None, cls="page"):
        rel = "../" * path.count("/")
        doc = ("<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n"
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
               f"{THEME_JS}\n{self.head(title, desc, path, og, og_title, noindex, rel)}\n</head>\n<body class=\"{cls}\">\n"
               f"{top(rel)}\n<main class=\"sheet\" id=\"main\">\n{body}\n</main>\n{self.foot(rel)}\n"
               f"{self.data_js(extra)}\n<script src=\"{rel}sky.js\" defer></script>\n</body>\n</html>\n")
        full = os.path.join(self.out, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(doc)
        if priority:
            self.pages.append(("sky/" + path, priority))

    def ad(self, slot):
        return self.ctx["ad"](slot)

    @staticmethod
    def sky_top(rel):
        return ('<div class="sky" id="sky">\n'
                '<canvas id="skyCanvas" role="img" aria-label="지금 서울 하늘 그림. 해와 달과 별이 실제 자리에 떠 있어요."></canvas>\n'
                f'<header class="sky-top"><a class="mark" href="{rel or "./"}">하늘봐</a>'
                '<button class="snd" id="snd" type="button" aria-pressed="false" hidden>소리 켜기</button></header>\n'
                '<p class="from" id="from" hidden></p>\n'
                '<div class="sky-bottom">\n<p class="status" id="status">서울 하늘을 그리는 중이에요</p>\n'
                '<p class="acts"><button class="btn sun" id="witness" type="button" hidden></button>'
                '<button class="btn line" id="share" type="button">하늘 봐! 보내기</button></p>\n'
                '<p class="dir" id="dir"></p>\n</div>\n'
                '<noscript><p class="nojs">하늘봐는 자바스크립트가 켜져 있어야 하늘을 그릴 수 있어요.</p></noscript>\n</div>')

    @staticmethod
    def band_top(rel):
        return ('<header class="band">'
                f'<a class="band-sky" href="{rel or "./"}" aria-label="지금 서울 하늘 보러 가기"><canvas id="skyCanvas" data-band aria-hidden="true"></canvas></a>'
                f'<a class="mark" href="{rel or "./"}">하늘봐</a></header>')

    # ---------- pages ----------
    def beings_list(self, rel):
        return '<ul class="beings">' + "".join(
            f'<li><a href="{rel}beings/{b["id"]}.html">{e(b["name"])}</a><span class="kind">{e(b["kind"])}</span><p>{e(b["short"])}</p></li>'
            for b in C.BEINGS) + "</ul>"

    def live_body(self, rel):
        H = C.HOME
        how = "".join(f"<p>{e(p)}</p>" for p in H["howto"])
        return f"""<section class="card" id="card" hidden></section>
<h1>지금 서울 하늘</h1>
<p class="lede">{e(H["lede"])}</p>
<h2>오늘의 하늘 예보</h2>
<div id="forecast" class="forecast"><p>예보를 불러오는 중이에요.</p></div>
<h2>오늘 서울의 해와 달</h2>
<div id="almanac"><p>해와 달 시각을 계산하는 중이에요.</p></div>
<h2>다가오는 날</h2>
<div id="upcoming" class="upcoming"></div>
<h2>내 목격 일지</h2>
<div id="log" class="log"></div>
{self.ad("sky_home")}
<h2>하늘에 사는 것들</h2>
{self.beings_list(rel)}
<h2>이 하늘을 보는 법</h2>
{how}
<p><a href="{rel}about.html">무엇이 진짜 하늘이고 무엇이 상상인지 읽어 보기</a></p>"""

    def home(self):
        H = C.HOME
        self.write("index.html", H["title"], H["desc"], self.live_body(""), self.sky_top, priority="0.9", cls="live")
        for bid, t in C.NOW_TITLE.items():
            self.write(f"now/{bid}/index.html", t, C.NOW_DESC, self.live_body("../../"), self.sky_top,
                       og=f"og-now-{bid}.png", noindex=True, extra={"from": bid}, cls="live")

    def facts_table(self, b):
        rows = list(b["facts"])
        if b["id"] in ("kites", "lanterns", "bridge", "rabbit"):
            key = next(k for k, v in C.HOLIDAYS.items() if v[1] == b["id"])
            dates = [v for k, v in sorted(self.hol.items()) if k.endswith(":" + key)]
            rows.append(("날짜", ", ".join(self.ymd_ko(d) for d in dates)))
        if not rows:
            return ""
        return '<table class="facts">' + "".join(f"<tr><th>{e(a)}</th><td>{e(v)}</td></tr>" for a, v in rows) + "</table>"

    def ymd_ko(self, iso):
        d = datetime.date.fromisoformat(iso)
        return f"{d.year}년 {d.month}월 {d.day}일({WD[d.weekday()]})"

    def shower_table(self, rel=""):
        rows = "".join(
            f'<tr><th>{e(nm)} 유성우<small>{e(par)}</small></th><td>{e(peak)}<small>활동 기간 {e(act)}</small></td><td class="num">{zhr}</td></tr>'
            for m, d, nm, rate, zhr, act, par, peak in C.SHOWERS)
        return ('<table class="grid two showers"><thead><tr><th>유성우와 어미 천체</th><th>극대 무렵</th><th class="num">ZHR</th></tr></thead>'
                f"<tbody>{rows}</tbody></table>")

    def beings(self):
        body = f"""<h1>하늘에 사는 것들</h1>
<p class="lede">하늘봐의 하늘을 지나가는 존재와 풍경이에요. 날마다 오는 것도 있고, 일 년에 하루만 오는 것도 있어요.</p>
{self.beings_list("../")}
{self.ad("sky_page")}"""
        self.write("beings/index.html", "하늘에 사는 것들 | 하늘봐", "하늘고래, 청룡, 봉황, 방패연, 소원 등불, 오작교, 달토끼, 새해 불꽃, 별똥별까지 하늘봐 하늘을 지나가는 것들을 모았어요.",
                   body, self.band_top, priority="0.7")
        for i, b in enumerate(C.BEINGS):
            prev_b = C.BEINGS[i - 1] if i else None
            next_b = C.BEINGS[i + 1] if i + 1 < len(C.BEINGS) else None
            nav = []
            if prev_b:
                nav.append(f'<a href="{prev_b["id"]}.html">이전: {e(prev_b["name"])}</a>')
            if next_b:
                nav.append(f'<a href="{next_b["id"]}.html">다음: {e(next_b["name"])}</a>')
            paras = "".join(f"<p>{e(p)}</p>" for p in b["body"])
            lore = ("<h2>이야기</h2>" + "".join(f"<p>{e(p)}</p>" for p in b["lore"])) if b["lore"] and b["id"] != "meteors" else ""
            if b["id"] == "meteors":
                lore = ("<h2>진짜 별똥별은</h2>" + "".join(f"<p>{e(p)}</p>" for p in b["lore"]) +
                        "<h2>2026년 유성우 극대일</h2>" + f"<p>{e(C.CALENDAR['shower_intro'])}</p>" + self.shower_table() +
                        f'<p class="note">{e(C.CALENDAR["zhr"])}</p>')
            tips = ("<h2>잘 보는 법</h2><ul>" + "".join(f"<li>{e(t)}</li>" for t in b["tips"]) + "</ul>") if b["tips"] else ""
            body = f"""<p class="crumb"><a href="./">하늘에 사는 것들</a></p>
<h1>{e(b["name"])}</h1>
<p class="lede">{e(b["short"])}</p>
<canvas class="specimen" data-being="{b["id"]}" role="img" aria-label="{e(b["name"])} 그림"></canvas>
{self.facts_table(b)}
{paras}
{lore}
{tips}
{self.ad("sky_page")}
<p class="pager">{' '.join(nav)}</p>
<p><a href="../">지금 서울 하늘 보러 가기</a></p>"""
            desc = (b["short"] + " " + b["body"][0])[:150]
            title = f"{b['name']} | 하늘봐" if b["id"] != "everyday" else "날마다 보이는 것들: 비행기, 새, 인공위성, 구름 | 하늘봐"
            self.write(f"beings/{b['id']}.html", title, desc, body, self.band_top, priority="0.6")

    def calendar(self):
        K = C.CALENDAR
        today = self.ctx["TODAY"]
        years = [y for y in sorted({int(k.split(":")[0]) for k in self.hol})
                 if any(v >= today for k, v in self.hol.items() if k.startswith(f"{y}:")) or f"{y}-01-01" >= today]
        blocks = []
        for y in years:
            rows = []
            for key, (nm, bid, what, when) in C.HOLIDAYS.items():
                iso = self.hol.get(f"{y}:{key}")
                if iso:
                    rows.append((iso, nm, bid, what, when))
            rows.append((f"{y}-01-01", "새해 첫날", "fireworks", "0시가 되면 남쪽 하늘에 불꽃이 터져요", "0시부터 10분 동안"))
            rows.sort()
            tr = "".join(
                f'<tr data-date="{iso}"><th>{e(self.ymd_ko(iso).split("년 ")[1])}</th><td><a href="beings/{bid}.html">{e(nm)}</a> {e(what)}<small>{e(when)}</small></td></tr>'
                for iso, nm, bid, what, when in rows)
            blocks.append(f'<h3>{y}년</h3><table class="grid two cal"><thead><tr><th>날짜</th><th>하늘봐에서는</th></tr></thead><tbody>{tr}</tbody></table>')
        body = f"""<h1>하늘봐 달력</h1>
<p class="lede">{e(K["intro"])}</p>
<p>{e(K["secret"])}</p>
<h2>명절과 새해</h2>
{''.join(blocks)}
{self.ad("sky_page")}
<h2>유성우</h2>
<p>{e(K["shower_intro"])}</p>
{self.shower_table()}
<p class="note">{e(K["zhr"])}</p>
<p>유성우 날짜 출처: <a href="https://www.imo.net/resources/calendar/">IMO Meteor Shower Calendar</a></p>"""
        self.write("calendar.html", K["title"], K["desc"], body, self.band_top, priority="0.6")

    def month_page(self, ym, i):
        y, m = map(int, ym.split("-"))
        S = C.SUN
        days = sorted(k for k in self.alm if k.startswith(ym))
        marks = {}
        for k, iso in self.hol.items():
            if iso.startswith(ym):
                marks.setdefault(iso, []).append(C.HOLIDAYS[k.split(":")[1]][0])
        for mm, dd, nm, *_ in C.SHOWERS:
            if mm == m:
                marks.setdefault(f"{ym}-{dd:02d}", []).append(f"{nm} 유성우")
        if m == 1:
            marks.setdefault(f"{ym}-01", []).insert(0, "새해 첫날")
        rows, lens = [], []
        for iso in days:
            sr, ss, mr, ms, ph, fr = self.alm[iso]
            d = datetime.date.fromisoformat(iso)
            ln = mins(ss) - mins(sr)
            lens.append((ln, d.day))
            cls = {5: "sat", 6: "sun"}.get(d.weekday(), "")
            tag = "".join(f"<em>{e(t)}</em>" for t in marks.get(iso, []))
            rows.append(f'<tr class="{cls}" data-date="{iso}"><th>{d.day}<span>{WD[d.weekday()]}</span>{tag}</th>'
                        f"<td>{sr}</td><td>{ss}</td><td>{ln // 60}:{ln % 60:02d}</td><td>{mr}</td><td>{ms}</td><td>{moon_icon(ph, fr)}</td></tr>")
        longest = max(lens)
        shortest = min(lens)
        ev = self.moons.get(ym, [])
        summary = (f"<p>이달 낮이 가장 긴 날은 {longest[1]}일({longest[0] // 60}시간 {longest[0] % 60}분)이고, "
                   f"가장 짧은 날은 {shortest[1]}일({shortest[0] // 60}시간 {shortest[0] % 60}분)이에요.</p>")
        if ev:
            summary += ('<table class="facts phases"><caption>달의 모양이 바뀌는 때</caption>' + "".join(
                f"<tr><th>{C.PHASE_KO[k]}</th><td>{int(t[8:10])}일 {ko_time(t[11:])}</td></tr>" for k, t in ev) + "</table>")
        prev_ym = self.months[i - 1] if i else None
        next_ym = self.months[i + 1] if i + 1 < len(self.months) else None
        nav = []
        if prev_ym:
            py, pm = map(int, prev_ym.split("-"))
            nav.append(f'<a href="{prev_ym}.html">이전 달: {py}년 {pm}월</a>')
        if next_ym:
            ny, nm_ = map(int, next_ym.split("-"))
            nav.append(f'<a href="{next_ym}.html">다음 달: {ny}년 {nm_}월</a>')
        body = f"""<p class="crumb"><a href="./">해와 달 시각표</a></p>
<h1>{y}년 {m}월 서울의 해와 달</h1>
<p class="lede">{e(S["intro"])}</p>
{summary}
<div class="scroll"><table class="grid month"><thead><tr><th>날</th><th>해 뜸</th><th>해 짐</th><th>낮 길이</th><th>달 뜸</th><th>달 짐</th><th>달</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>
<p class="note">{e(S["moon_note"])}</p>
<p class="note">{e(S["method"])}</p>
{self.ad("sky_page")}
<p class="pager">{' '.join(nav)}</p>
<p><a href="../">지금 서울 하늘 보러 가기</a></p>"""
        title = f"{y}년 {m}월 서울 해 뜨는 시각, 해 지는 시각, 달 뜨는 시각 | 하늘봐"
        desc = f"{y}년 {m}월 서울의 해와 달이 뜨고 지는 시각을 날마다 정리했어요. 낮의 길이, 밤 9시의 달 모양, 보름과 삭 시각도 함께 볼 수 있어요."
        self.write(f"sun/{ym}.html", title, desc, body, self.band_top, priority="0.4")

    def sun(self):
        for i, ym in enumerate(self.months):
            self.month_page(ym, i)
        by_year = {}
        for ym in self.months:
            by_year.setdefault(int(ym[:4]), []).append(ym)
        blocks = "".join(
            f'<h2>{y}년</h2><ul class="months">' + "".join(f'<li><a href="{ym}.html">{int(ym[5:])}월</a></li>' for ym in yms) + "</ul>"
            for y, yms in sorted(by_year.items()))
        body = f"""<h1>서울 해와 달 시각표</h1>
<p class="lede">{e(C.SUN["intro"])}</p>
{blocks}
<p class="note">{e(C.SUN["method"])}</p>
{self.ad("sky_page")}"""
        self.write("sun/index.html", "서울 해와 달 시각표: 해 뜨는 시각, 해 지는 시각, 달 뜨는 시각 | 하늘봐",
                   f"{self.months[0][:4]}년 {int(self.months[0][5:])}월부터 {self.months[-1][:4]}년 {int(self.months[-1][5:])}월까지 서울의 해와 달 뜨고 지는 시각을 달마다 정리했어요.",
                   body, self.band_top, priority="0.5")

    def about(self):
        A = C.ABOUT
        secs = "".join(f"<h2>{e(h)}</h2>" + "".join(f"<p>{e(p)}</p>" for p in ps) for h, ps in A["sections"])
        truth = '<table class="facts">' + "".join(f"<tr><th>{e(a)}</th><td>{e(b)}</td></tr>" for a, b in A["truth"]) + "</table>"
        calc = "".join(f"<p>{e(p)}</p>" for p in A["calc"])
        store = "".join(f"<p>{e(p)}</p>" for p in A["store"])
        mail = self.ctx.get("CONTACT_EMAIL")
        contact = (f'<h2>문의</h2><p>궁금한 점이나 고칠 점은 <a href="mailto:{e(mail)}">{e(mail)}</a>으로 보내 주세요.</p>' if mail else "")
        body = f"""<h1>{e(A["title"])}</h1>
{secs}
<h2>진짜인 것과 상상인 것</h2>
{truth}
<h2>어떻게 계산하나요</h2>
{calc}
<p>참고한 곳: <a href="https://github.com/mourner/suncalc">SunCalc</a>, <a href="https://rhodesmill.org/pyephem/">PyEphem</a>, <a href="https://astro.kasi.re.kr/">한국천문연구원 천문우주정보</a>, <a href="https://www.imo.net/resources/calendar/">IMO 유성우 달력</a></p>
<h2>저장하는 것</h2>
{store}
{contact}
<p><a href="{self.ctx["BASE_URL"]}privacy.html">개인정보처리방침 읽기</a></p>"""
        self.write("about.html", "하늘봐 소개", A["desc"], body, self.band_top, priority="0.4")

    def assets(self):
        os.makedirs(self.out, exist_ok=True)
        for f in ("sky.js", "sky.css"):
            shutil.copy(os.path.join(HERE, f), self.out)
        adir = os.path.join(HERE, "assets")
        for f in sorted(os.listdir(adir)):
            shutil.copy(os.path.join(adir, f), self.out)
        for y in self.alm_years:
            rows = {k: v for k, v in self.alm.items() if k.startswith(str(y))}
            with open(os.path.join(self.out, f"alm-{y}.json"), "w", encoding="utf-8") as f:
                json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))


def build(ctx):
    s = Site(ctx)
    s.assets()
    s.home()
    s.beings()
    s.calendar()
    s.sun()
    s.about()
    return s.pages
