# -*- coding: utf-8 -*-
"""링쿠 페이지를 OUT/linku/ 에 만든다. 뭐나와 build.py가 불러 쓴다.

알 링크(/linku/g/<세대>/?k=...)는 세대마다 정적 페이지를 하나씩 두어,
카톡 미리보기 제목에 그 세대 숫자가 보이게 한다. 내용(유전자)은 ?k= 쪽에 있다."""
import html
import os
import re
import shutil

from . import content as C

HERE = os.path.dirname(os.path.abspath(__file__))
MAXG = 300
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&amp;display=swap">')
OG_TIERS = [(2, 9, "a"), (10, 29, "b"), (30, 99, "c"), (100, 10 ** 9, "d")]


def e(s):
    return html.escape(str(s), quote=True)


def check_tables():
    """content.py의 형질 수치가 linku.js와 어긋나면 빌드를 멈춘다."""
    js = open(os.path.join(HERE, "linku.js"), encoding="utf-8").read()
    rows = re.findall(r'\{ id: "(\w+)", ko: "([^"]+)", la: "\w+", min: (\d+), p: ([\d.]+), keep: ([\d.]+) \}', js)
    got = [(i, k, int(m), float(p), float(kp)) for i, k, m, p, kp in rows]
    want = [(t["id"], t["ko"], t["min"], t["p"], float(t["keep"])) for t in C.TRAITS]
    if got != want:
        raise SystemExit("linku: content.py TRAITS와 linku.js RARE가 다릅니다\n" + repr(got) + "\n" + repr(want))


class Site:
    def __init__(self, ctx):
        self.ctx = ctx
        self.out = os.path.join(ctx["OUT"], "linku")
        self.base = ctx["BASE_URL"] + "linku/"
        self.pages = []

    def head(self, title, desc, path, og="og-home.png", og_title=None, noindex=False, rel=""):
        url = self.base + ("" if path == "index.html" else path.replace("index.html", ""))
        p = [f"<title>{e(title)}</title>", f'<meta name="description" content="{e(desc)}">']
        if noindex:
            p.append('<meta name="robots" content="noindex">')
        if not self.ctx["PREVIEW"]:
            p += [
                f'<link rel="canonical" href="{e(url)}">',
                '<meta property="og:type" content="website">',
                '<meta property="og:site_name" content="링쿠">',
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
            '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
            '<meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">',
            f'<link rel="icon" href="{rel}favicon.svg" type="image/svg+xml">',
            f'<link rel="apple-touch-icon" href="{rel}apple-touch-icon.png">',
            FONTS,
            f'<link rel="stylesheet" href="{rel}linku.css">',
        ]
        return "\n".join(p)

    def write(self, path, title, desc, body, og="og-home.png", og_title=None, noindex=False, priority=None):
        depth = path.count("/")
        rel = "../" * depth
        root = self.ctx["BASE_URL"]
        foot = ('<footer class="foot"><nav aria-label="링쿠 안내">'
                f'<a href="{rel}about.html">링쿠 소개</a><a href="{rel}dex/">도감</a>'
                f'<a href="{rel}notes/how-it-spreads.html">연구 노트</a>'
                f'<a href="{root}privacy.html">개인정보처리방침</a></nav>'
                f'<nav aria-label="같은 사람이 만든 사이트"><a href="{root}">심리테스트 뭐나와</a>'
                f'<a href="{root}galae/">밸런스 게임 갈래</a><a href="{root}sky/">하늘봐</a></nav>'
                '<p>© 2026 링쿠. 링쿠는 상상의 생물이에요.</p></footer>')
        doc = ("<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n"
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
               f"{self.head(title, desc, path, og, og_title, noindex, rel)}\n</head>\n<body>\n<div class=\"wrap\">\n"
               f'<header class="lk-top"><a class="lk-logo" href="{rel or "./"}">링쿠</a>'
               '<button class="lk-snd" id="snd" type="button" aria-pressed="true" hidden>소리 켬</button></header>\n'
               f"<main>\n{body}\n</main>\n{foot}\n</div>\n"
               f'<script>window.LINKU={{maxg:{MAXG}}};</script>\n<script src="{rel}linku.js" defer></script>\n</body>\n</html>\n')
        full = os.path.join(self.out, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8") as f:
            f.write(doc)
        if priority:
            self.pages.append(("linku/" + path, priority))

    def ad(self, slot):
        return self.ctx["ad"](slot)

    # ---------- pages ----------
    def home(self):
        notes = "".join(f'<li><a href="notes/{n["slug"]}.html">{e(n["title"])}</a></li>' for n in C.NOTES)
        body = f"""<section class="hero">
<h1>링크 속에 사는 생물</h1>
<div class="hero-stage">
<button class="hero-creature" id="heroCreature" type="button" aria-label="링쿠 울음소리 듣기"></button>
<a class="hero-link" id="heroLink" href="#how">godrazy7174.github.io/linku/g/12/?k=EQB7c2xpbmt1</a>
</div>
<p class="lede">친구가 보낸 링크를 누르면 알이 깨어나요. 그 아이가 보내는 링크에서는 다음 세대가 태어나요. 사람을 거칠수록 세대가 쌓이고, 깊은 세대에서만 볼 수 있는 모습이 나타나요.</p>
<p><a class="btn" id="startBtn" href="#founder">새 혈통 시작하기</a></p>
<p class="hint">받은 알이 있다면 카톡에서 그 링크를 눌러 주세요.</p>
</section>
<section class="egg-stage" id="founder" hidden></section>
<section id="mine" hidden></section>
<h2 id="how">이렇게 퍼져요</h2>
<ol>
<li>친구가 보낸 알 링크를 누르고, 알을 세 번 두드려 깨워요.</li>
<li>태어난 링쿠에게 이름을 지어 데려와요.</li>
<li>알 보내기를 눌러 다른 친구에게 보내요. 친구가 열면 다음 세대가 태어나요.</li>
</ol>
<p>내가 보낸 알은 내가 깨울 수 없어요. 세대를 하나 늘리려면 꼭 다른 사람이 열어야 해요. 한 링크를 단톡방에 올리면 방에 있는 친구들이 저마다 다른 형제를 데려가요.</p>
<h2>세대가 깊을수록</h2>
<p>몇몇 모습은 정해진 세대를 넘은 혈통에서만 나와요. 별눈은 3세대, 날개는 25세대, 은하 무늬는 100세대부터예요.</p>
<ul class="samples" id="samples"></ul>
<p><a href="dex/">링쿠 도감 보기</a></p>
<h2>연구 노트</h2>
<ul>{notes}</ul>
{self.ad("linku_home")}"""
        self.write("index.html", "링쿠: 링크 속에 사는 생물",
                   "친구가 보낸 링크를 누르면 알이 깨어나요. 사람을 거칠 때마다 세대가 쌓이고 모습이 조금씩 바뀌는 생물, 링쿠.",
                   body, priority="0.9")

    def eggs(self):
        body = ('<section class="egg-stage" id="eggStage"><p class="egg-kicker">알을 불러오는 중이에요</p></section>\n'
                '<section id="panel" hidden></section>\n'
                '<noscript><p>링쿠 알은 자바스크립트가 켜져 있어야 깨울 수 있어요.</p></noscript>\n'
                + self.ad("linku_hatch"))
        desc = "열어 보기 전에는 무엇이 태어날지 아무도 몰라요. 링크를 누르고 알을 세 번 두드려 주세요."
        for n in list(range(2, MAXG + 1)) + ["many"]:
            tier = "d" if n == "many" else next(t for lo, hi, t in OG_TIERS if lo <= n <= hi)
            label = f"{MAXG}세대가 넘은" if n == "many" else f"{n}세대"
            self.write(f"g/{n}/index.html", f"{label} 링쿠 알이 도착했어요", desc, body,
                       og=f"og-egg-{tier}.png", noindex=True)
        self.write("c/index.html", "링쿠 보관 링크", "보관해 둔 링쿠를 이 브라우저로 다시 데려와요.",
                   '<section class="restore" id="restore"><p>보관 링크를 읽는 중이에요.</p></section>', noindex=True)

    def dex(self):
        items = []
        for t in C.TRAITS:
            name = "???" if t["id"] == "guest" else t["ko"]
            items.append(f'<li><div class="sp" data-specimen="{t["id"]}"></div><div><a href="{t["id"]}.html">{e(name)}</a>'
                         f'<p>{t["min"]}세대부터, {C.rarity(t["p"])}</p><p data-seen></p></div></li>')
        commons = [
            ("몸 모양", "방울형, 콩형, 떡형, 물방울형, 종형, 고구마형, 별사탕형, 구름형"),
            ("몸 색", "빨강부터 잿빛까지 스물네 가지, 각각 연한 빛과 진한 빛이 있어요"),
            ("무늬", "점박이 무늬, 줄무늬, 주근깨, 얼룩, 배띠, 그리고 무늬 없음"),
            ("눈", "점눈, 동그란 눈, 졸린 눈, 왕눈, 웃는 눈, 외눈"),
            ("입", "작은 미소, 오 모양 입, 고양이 입, 토끼 이빨, 메롱, 일자 입, 함박웃음"),
            ("머리", "더듬이 하나, 더듬이 둘, 둥근 귀, 뾰족한 귀, 작은 뿔, 새싹, 머리털"),
            ("팔다리와 꼬리", "두 발, 팔과 발, 촉수, 네 발. 꼬리는 돌돌 꼬리, 짧은 꼬리, 긴 꼬리, 복슬 꼬리"),
            ("성격", "느긋함, 호기심 많음, 겁 많음, 장난꾸러기, 다정함, 새침함, 씩씩함, 잠꾸러기. 성격에 따라 숨 쉬는 박자가 달라요"),
        ]
        rows = "".join(f"<tr><th>{a}</th><td>{b}</td></tr>" for a, b in commons)
        body = f"""<h1>링쿠 도감</h1>
<p>깊은 세대에서만 나오는 링쿠의 돌연변이 형질 열여섯 가지를 모았어요. 내 링쿠에게서 본 적 있는 형질에는 표시가 붙어요.</p>
<ul class="dex">{''.join(items)}</ul>
<h2>누구에게나 있는 형질</h2>
<p>돌연변이가 아니어도 링쿠는 저마다 다르게 생겼어요. 아래 형질은 유전자 숫자에 따라 정해지고, 세대를 건널 때 조금씩 바뀌어요.</p>
<table>{rows}</table>
<p><a href="../notes/genes.html">유전자가 이어지고 바뀌는 방식 읽어 보기</a></p>
{self.ad("linku_dex")}"""
        self.write("dex/index.html", "링쿠 도감: 돌연변이 형질 열여섯 가지",
                   "별눈, 날개, 금빛 몸, 은하 무늬처럼 깊은 세대에서만 나오는 링쿠의 돌연변이 형질과 나오는 세대를 정리했어요.",
                   body, priority="0.7")
        for i, t in enumerate(C.TRAITS):
            prev_t = C.TRAITS[i - 1] if i else None
            next_t = C.TRAITS[i + 1] if i + 1 < len(C.TRAITS) else None
            hide = t["id"] == "guest"
            name = "???" if hide else t["ko"]
            keep = "물려주지 않아요" if not t["keep"] else "열에 여덟꼴로 물려줘요"
            nav = []
            if prev_t:
                nav.append(f'<a href="{prev_t["id"]}.html">이전: {"???" if prev_t["id"] == "guest" else e(prev_t["ko"])}</a>')
            if next_t:
                nav.append(f'<a href="{next_t["id"]}.html">다음: {"???" if next_t["id"] == "guest" else e(next_t["ko"])}</a>')
            paras = "".join(f"<p>{e(x)}</p>" for x in t["body"])
            body = f"""<p><a href="./">링쿠 도감</a></p>
<h1>{e(name)}</h1>
<div class="specimen-big" data-specimen="{t["id"]}"></div>
<table><tr><th>나오는 세대</th><td>{t["min"]}세대부터</td></tr><tr><th>나오는 정도</th><td>{C.rarity(t["p"])}</td></tr><tr><th>물려주기</th><td>{keep}</td></tr></table>
{paras}
<p class="seen" data-seen></p>
<p>{' '.join(nav)}</p>
<p><a href="../notes/deep-generations.html">세대가 깊을수록 희귀해지는 이유</a></p>
{self.ad("linku_dex")}"""
            title = "링쿠 도감: 아직 아무도 본 적 없는 형질" if hide else f"링쿠 도감: {t['ko']}"
            desc = (f"링쿠의 돌연변이 형질 {t['ko']}. {t['min']}세대부터 {C.rarity(t['p'])}. " + t["body"][0])[:150]
            if hide:
                desc = "링쿠 도감에서 모습이 가려진 형질이에요. 300세대부터 나온다고 알려져 있어요."
            self.write(f"dex/{t['id']}.html", title, desc, body, priority="0.5")

    def notes(self):
        table = "<table><tr><th>형질</th><th>나오는 세대</th><th>나오는 정도</th></tr>" + "".join(
            f'<tr><td><a href="../dex/{t["id"]}.html">{"???" if t["id"] == "guest" else e(t["ko"])}</a></td><td>{t["min"]}세대부터</td><td>{C.rarity(t["p"])}</td></tr>'
            for t in C.TRAITS) + "</table>"
        for n in C.NOTES:
            secs = []
            for h, paras in n["sections"]:
                inner = "".join(table if p == "TABLE" else f"<p>{e(p)}</p>" for p in paras)
                secs.append(f"<h2>{e(h)}</h2>{inner}")
            others = "".join(f'<li><a href="{o["slug"]}.html">{e(o["title"])}</a></li>' for o in C.NOTES if o is not n)
            body = f"""<p><a href="../">링쿠</a></p>
<h1>{e(n["title"])}</h1>
<p class="lede">{e(n["desc"])}</p>
{''.join(secs)}
<hr>
<h2>다른 연구 노트</h2>
<ul>{others}</ul>
{self.ad("linku_note")}"""
            self.write(f"notes/{n['slug']}.html", f"{n['title']} | 링쿠 연구 노트", n["desc"], body, priority="0.6")

    def about(self):
        A = C.ABOUT
        secs = "".join(f"<h2>{e(h)}</h2>" + "".join(f"<p>{e(p)}</p>" for p in ps) for h, ps in A["sections"])
        mail = self.ctx.get("CONTACT_EMAIL")
        contact = (f'<h2>문의</h2><p>궁금한 점이나 고칠 점은 <a href="mailto:{e(mail)}">{e(mail)}</a>으로 보내 주세요.</p>' if mail else "")
        body = f"""<h1>{e(A["title"])}</h1>
{secs}{contact}
<p><a href="{self.ctx["BASE_URL"]}privacy.html">개인정보처리방침 읽기</a></p>"""
        self.write("about.html", "링쿠 소개", A["desc"], body, priority="0.4")

    def assets(self):
        os.makedirs(self.out, exist_ok=True)
        for f in ("linku.js", "linku.css"):
            shutil.copy(os.path.join(HERE, f), self.out)
        adir = os.path.join(HERE, "assets")
        for f in sorted(os.listdir(adir)):
            shutil.copy(os.path.join(adir, f), self.out)


def build(ctx):
    check_tables()
    s = Site(ctx)
    s.assets()
    s.home()
    s.eggs()
    s.dex()
    s.notes()
    s.about()
    return s.pages
