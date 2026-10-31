# -*- coding: utf-8 -*-
"""뭐나와 정적 사이트 빌더.

사용법
  python3 build.py                 # 배포용 → build/site
  PREVIEW=1 python3 build.py       # 미리보기용 → build/preview (광고 자리 표시, index는 조각 형식)

환경 변수
  BASE_URL        사이트 주소 (끝에 / 포함). 기본값: https://godrazy7174.github.io/mwonawa/
  ADSENSE_CLIENT  애드센스 게시자 ID (예: ca-pub-1234567890123456). 비우면 광고 코드 없음
  AD_SLOTS        수동 광고 단위 ID, "result_top=123,result_bottom=456,test_bottom=789" 형식 (선택)
  CONTACT_EMAIL   문의 이메일 (소개·개인정보처리방침에 표시)
  CUSTOM_DOMAIN   개인 도메인 (CNAME 파일 생성)
"""
import html
import json
import os
import shutil
import sys
from datetime import date

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from content.emoji import TEST as EMOJI  # noqa: E402
from content.chat import TEST as CHAT  # noqa: E402
from content.year2027 import TEST as YEAR  # noqa: E402
from content import site as SITE_TEXT  # noqa: E402

PREVIEW = bool(os.environ.get("PREVIEW"))
BASE_URL = os.environ.get("BASE_URL", "https://godrazy7174.github.io/mwonawa/")
if not BASE_URL.endswith("/"):
    BASE_URL += "/"
ADSENSE_CLIENT = os.environ.get("ADSENSE_CLIENT", "").strip()
AD_SLOTS = dict(kv.split("=", 1) for kv in os.environ.get("AD_SLOTS", "").split(",") if "=" in kv)
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL", "").strip()
CUSTOM_DOMAIN = os.environ.get("CUSTOM_DOMAIN", "").strip()
SITE_LABEL = (CUSTOM_DOMAIN or BASE_URL.split("://", 1)[-1].rstrip("/"))
OUT = os.path.join(ROOT, "build", "preview" if PREVIEW else "site")
TODAY = date.today().isoformat()
WEIGHTS = json.load(open(os.path.join(ROOT, "content", "weights.json"), encoding="utf-8"))

TESTS = [EMOJI, CHAT, YEAR]
CANVAS = {
    "yolk": {"fill": "#FFC93E", "ink": "#2B2200", "panel": "#FFFFFF", "panelInk": "#1D2033", "sub": "#4E5470", "accent": "#1D2033"},
    "mint": {"fill": "#63CFAB", "ink": "#04291D", "panel": "#FFFFFF", "panelInk": "#1D2033", "sub": "#4E5470", "accent": "#1D2033"},
    "lacquer": {"fill": "#DF402E", "ink": "#FFF4E2", "panel": "#FFF4E2", "panelInk": "#3A140F", "sub": "#7A3A2E", "accent": "#DF402E"},
}
PAGES = []  # (path, priority) for sitemap


def e(s):
    return html.escape(str(s), quote=True)


def emo(ch, extra=""):
    return f'<span class="emo{(" " + extra) if extra else ""}" aria-hidden="true">{e(ch)}</span>'


def test_file(t):
    return f"t-{t['slug']}.html"


def result_file(t, rid):
    return f"r-{t['slug']}-{rid}.html"


def og_file(name):
    return f"og-{name}.png"


def ad(slot):
    if PREVIEW:
        return '<aside class="ad ad--placeholder" aria-label="광고 자리">광고 자리 (애드센스 승인 후 표시)</aside>'
    if ADSENSE_CLIENT and AD_SLOTS.get(slot):
        return (
            '<aside class="ad"><p class="ad-label">광고</p>'
            f'<ins class="adsbygoogle" style="display:block" data-ad-client="{e(ADSENSE_CLIENT)}" '
            f'data-ad-slot="{e(AD_SLOTS[slot])}" data-ad-format="auto" data-full-width-responsive="true"></ins>'
            "<script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>"
        )
    return ""


FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&amp;family=IBM+Plex+Sans+KR:wght@400;500;700&amp;display=swap">')


def head_meta(title, desc, path, og_image, og_title=None):
    url = BASE_URL + ("" if path == "index.html" else path)
    parts = [
        f"<title>{e(title)}</title>",
        f'<meta name="description" content="{e(desc)}">',
    ]
    if PREVIEW:
        parts.append('<meta name="claude:viewport-fit-sides" content="cover">')
    else:
        parts += [
            f'<link rel="canonical" href="{e(url)}">',
            '<meta property="og:type" content="website">',
            '<meta property="og:site_name" content="뭐나와">',
            '<meta property="og:locale" content="ko_KR">',
            f'<meta property="og:title" content="{e(og_title or title)}">',
            f'<meta property="og:description" content="{e(desc)}">',
            f'<meta property="og:url" content="{e(url)}">',
            f'<meta property="og:image" content="{e(BASE_URL + og_image)}">',
            '<meta property="og:image:width" content="1200">',
            '<meta property="og:image:height" content="630">',
            '<meta name="twitter:card" content="summary_large_image">',
        ]
        if ADSENSE_CLIENT:
            parts.append(f'<meta name="google-adsense-account" content="{e(ADSENSE_CLIENT)}">')
            parts.append(f'<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client={e(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>')
    parts += [
        '<meta name="theme-color" content="#ECEFF3">',
        '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
        '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
        FONTS,
        '<link rel="stylesheet" href="style.css">',
    ]
    return "\n".join(parts)


HEADER = ('<header class="top"><a class="logo" href="index.html" aria-label="뭐나와 홈"><b>뭐나와</b></a>'
          '<a class="top-link" href="index.html#tests">테스트 목록</a></header>')
FOOTER = ('<footer class="foot"><nav aria-label="사이트 정보"><a href="about.html">소개</a>'
          '<a href="privacy.html">개인정보처리방침</a></nav>'
          '<p>© 2026 뭐나와. 모든 테스트는 재미로 봐 주세요.</p></footer>')


def page(path, title, desc, body, og_image, page_class="", tail="", og_title=None, priority="0.6", fragment=False):
    meta = head_meta(title, desc, path, og_image, og_title)
    inner = f'<div class="page {page_class}">\n{HEADER}\n{body}\n{FOOTER}\n</div>\n{tail}\n<script src="app.js" defer></script>'
    if fragment:
        doc = f"{meta}\n{inner}\n"
    else:
        doc = ("<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n"
               "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
               f"{meta}\n</head>\n<body>\n{inner}\n</body>\n</html>\n")
    with open(os.path.join(OUT, path), "w", encoding="utf-8") as f:
        f.write(doc)
    if path != "404.html":
        PAGES.append((path, priority))


def json_script(id_, data):
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f'<script id="{id_}" type="application/json">{raw}</script>'


# ---------------------------------------------------------------- cards
def card_art(t):
    if t["slug"] == "emoji":
        return '<div class="tcard-art">' + "".join(emo(c) for c in t["cover"]) + "</div>"
    if t["slug"] == "chat":
        return '<div class="mini-chat" aria-hidden="true"><span>다음 주 언제 돼?</span><span>📌 투표 올렸어</span></div>'
    return '<div class="mini-deck" aria-hidden="true"><i></i><i></i><i></i></div>'


def meta_line(t):
    if t["slug"] == "2027":
        return "카드 한 장, 10초"
    return f"{len(t['questions'])}문제, {t['minutes']}분"


def go_label(t):
    return "카드 뽑기" if t["slug"] == "2027" else "시작하기"


def test_card(t, feature=False):
    cls = "tcard sticker sticker--fill theme-" + t["theme"] + (" tcard--feature tape" if feature else "")
    return (f'<div class="{cls}" data-test="{e(t["slug"])}">'
            f'<span class="tcard-stamp" aria-hidden="true"></span>'
            f'{card_art(t)}'
            f'<h3 class="tcard-title"><a class="tcard-main" href="{test_file(t)}">{e(t["title"])}</a></h3>'
            f'<p class="tcard-sub">{e(t["subtitle"])}</p>'
            f'<p class="tcard-meta"><span>{e(meta_line(t))}</span><span class="tcard-go" aria-hidden="true">{go_label(t)}</span></p>'
            f'<a class="tcard-mine" href="#">내 결과 다시 보기</a>'
            "</div>")


def type_grid(t, current=None):
    order = t["order"]
    cols = {12: "", 10: " cols-2", 20: " cols-4"}.get(len(order), "")
    items = []
    for rid in order:
        r = t["results"][rid]
        icon = emo(r["icon"]) if r.get("icon") else ""
        cur = ' aria-current="page"' if rid == current else ""
        items.append(f'<li><a href="{result_file(t, rid)}"{cur}>{icon}<span>{e(r["name"])}</span></a></li>')
    return f'<ul class="typegrid{cols}">' + "".join(items) + "</ul>"


# ---------------------------------------------------------------- home
def build_home():
    H = SITE_TEXT.HOME
    body = f'''<main class="wrap">
<section class="hero" aria-labelledby="hero-title">
  <p class="bubble bubble--friend">이 테스트 해 봤어? 나 {emo("🫠")} 녹는 중 나왔어</p>
  <h1 id="hero-title" class="bubble bubble--friend bubble--shout">너 뭐 나와?</h1>
  <a class="bubble bubble--me" href="{test_file(EMOJI)}">잠깐만, 나도 해 볼게</a>
  <p class="lede">{e(H["lede"])}</p>
</section>
<section id="tests" class="tests" aria-label="테스트 목록">
{test_card(EMOJI, feature=True)}
{test_card(CHAT)}
{test_card(YEAR)}
</section>
<section class="blurb">
  <h2>{e(H["about_title"])}</h2>
  {"".join(f"<p>{e(p)}</p>" for p in H["about"])}
</section>
</main>'''
    title = "뭐나와 테스트" if PREVIEW else "뭐나와 | 1분 심리테스트 모음"
    page("index.html", title, H["description"], body, og_file("home"), "page-home",
         priority="1.0", fragment=PREVIEW, og_title="뭐나와: 너 뭐 나와?")


# ---------------------------------------------------------------- quiz pages
def build_quiz(t):
    intro_art = "".join(emo(c) for c in t["cover"])
    data = {
        "slug": t["slug"], "order": t["order"], "w": WEIGHTS[t["slug"]],
        "questions": [{"q": q["q"], "o": [{"t": txt, "s": sc} for txt, sc in q["options"]]} for q in t["questions"]],
    }
    body = f'''<main class="wrap">
<nav class="crumb" aria-label="이동"><a href="index.html">테스트 목록</a></nav>
<section class="quiz" aria-labelledby="test-title">
  <div class="sticker sticker--fill intro tape" id="intro">
    <div class="intro-art">{intro_art}</div>
    <h1 id="test-title" class="intro-title">{e(t["title"])}</h1>
    <p class="intro-sub">{e(t["subtitle"])}</p>
    {"".join(f'<p class="copy">{e(p)}</p>' for p in t["intro"])}
    <p class="intro-meta">{e(meta_line(t))}이면 끝나</p>
    <button class="btn btn--ink btn--wide" id="start" type="button">테스트 시작</button>
  </div>
  <div class="qbox" id="qbox" hidden>
    <div class="chart" id="chart" aria-hidden="true"></div>
    <p class="qcount" id="qcount" aria-live="polite"></p>
    <h2 class="qtext" id="qtext"></h2>
    <div class="opts" id="opts"></div>
    <div class="qnav"><button class="linkbtn" id="prev" type="button" hidden>이전 문제로</button></div>
  </div>
  <div class="sticker done" id="done" hidden>
    <div class="stamp" aria-hidden="true"><small>참</small><b>잘했어요</b></div>
    <p class="done-title">결과가 나왔어!</p>
    <a class="btn btn--ink btn--wide" id="see" href="#">내 결과 보기</a>
    <button class="linkbtn" id="restart" type="button">처음부터 다시 하기</button>
  </div>
</section>
<section class="typelist">
  <h2 class="rsec-title">나올 수 있는 {e(t["result_label"])} {len(t["order"])}가지</h2>
  {type_grid(t)}
</section>
{ad("test_bottom")}
</main>'''
    page(test_file(t), f"{t['seo_title']} | 뭐나와", t["summary"], body, og_file(t["slug"]),
         "theme-" + t["theme"], tail=json_script("test-data", data), priority="0.9")


def build_draw(t):
    data = {"order": t["order"], "results": {k: {"name": r["name"], "tagline": r["tagline"]} for k, r in t["results"].items()}}
    cards = "".join(
        f'<button class="card" type="button" id="card-{i}" aria-label="{n} 카드 뒤집기" aria-pressed="false">'
        f'<span class="card-face card-back"><small>2027 정미년</small><b>?</b></span>'
        f'<span class="card-face card-front" aria-live="polite"></span></button>'
        for i, n in enumerate(["첫 번째", "두 번째", "세 번째"]))
    body = f'''<main class="wrap">
<nav class="crumb" aria-label="이동"><a href="index.html">테스트 목록</a></nav>
<section class="quiz" aria-labelledby="test-title">
  <div class="sticker sticker--fill intro tape">
    <div class="intro-art">{"".join(emo(c) for c in t["cover"])}</div>
    <h1 id="test-title" class="intro-title">{e(t["title"])}</h1>
    <p class="intro-sub">{e(t["subtitle"])}</p>
    <p class="copy">{e(t["intro"][0])}</p>
  </div>
  <div class="deck" id="deck">{cards}</div>
  <p class="deck-hint" id="hint" aria-live="polite">마음이 가는 카드 한 장을 골라 봐</p>
  <div class="reveal" id="reveal" hidden>
    <a class="btn btn--ink btn--wide" id="see" href="#">내 키워드 풀이 보기</a>
    <button class="linkbtn" id="again" type="button">카드 다시 섞기</button>
  </div>
  <p class="draw-note">{e(t["intro"][1])}</p>
</section>
<section class="typelist">
  <h2 class="rsec-title">2027 키워드 {len(t["order"])}가지</h2>
  {type_grid(t)}
</section>
{ad("test_bottom")}
</main>'''
    page(test_file(t), f"{t['seo_title']} | 뭐나와", t["summary"], body, og_file(t["slug"]),
         "theme-" + t["theme"], tail=json_script("draw-data", data), priority="0.9")


# ---------------------------------------------------------------- result pages
def others(t):
    return [x for x in TESTS if x is not t]


def more_tests(t):
    cards = "".join(test_card(x) for x in others(t))
    return f'<section class="more"><h2 class="rsec-title">다른 테스트도 해 볼래?</h2><div class="tests">{cards}</div></section>'


def share_block(t):
    again = "카드 다시 뽑기" if t["slug"] == "2027" else "테스트 다시 하기"
    try_label = "나도 한 장 뽑아 보기" if t["slug"] == "2027" else "나도 테스트하기"
    return f'''<div class="share">
  <button class="btn btn--ink" id="btnShare" type="button">결과 공유하기</button>
  <button class="btn" id="btnCopy" type="button">링크 복사</button>
  <button class="btn" id="btnImage" type="button">이미지로 저장</button>
</div>
<a class="btn btn--ink btn--wide friend-only" href="{test_file(t)}">{try_label}</a>
<div class="again me-only" hidden><a class="linkbtn" href="{test_file(t)}">{again}</a></div>'''


def card_data(t, rid, r, facts=None):
    if t["slug"] == "emoji":
        share = f"이거 제 이모지야 {r['icon']} 나는 ‘{r['name']}’ 나왔어. 너는 뭐 나와?"
        footer, kind = "너는 뭐 나와?", "emoji"
    elif t["slug"] == "chat":
        share = f"단톡방 속 내 캐릭터는 ‘{r['name']}’ {r['icon']} 너는 뭐 나와?"
        footer, kind = "너는 뭐 나와?", "chat"
    else:
        share = f"2027년 내 키워드는 ‘{r['name']}’! 너도 한 장 뽑아 봐"
        footer, kind = "너도 한 장 뽑아 봐", "year"
    return {
        "slug": t["slug"], "id": rid, "file": result_file(t, rid), "kind": kind,
        "name": r["name"], "icon": r.get("icon", ""), "stampIcon": r.get("icon") or "27",
        "tagline": r["tagline"], "tags": r.get("tags", []), "chat": r.get("chat"), "facts": facts,
        "testTitle": t["title"], "pageTitle": f"{r['name']} | {t['title']}",
        "shareText": share, "footer": footer, "siteLabel": SITE_LABEL, "colors": CANVAS[t["theme"]],
    }


def match_card(t, kind_label, pair):
    rid, why = pair
    r = t["results"][rid]
    return (f'<a class="mcard sticker" href="{result_file(t, rid)}">'
            f'<span class="mcard-kind">{e(kind_label)}</span>{emo(r["icon"], "mcard-icon")}'
            f'<span class="mcard-name">{e(r["name"])}</span><span class="mcard-why">{e(why)}</span></a>')


def build_result(t, rid):
    r = t["results"][rid]
    icon = r["icon"]
    if t["slug"] == "chat":
        bubbles = "".join(
            f'<p class="bubble bubble--{"me" if who == "me" else "friend"}{" bubble--pic" if txt.startswith("[짤]") else ""}">{e(txt)}</p>'
            for who, txt in r["chat"])
        visual = f'<div class="chatmock" aria-label="단톡방에서 자주 하는 말">{bubbles}</div>'
        moments_h = "단톡방에서 이런 모습"
        manual_h = "이 캐릭터와 단톡하는 법"
        who_friend = "이 캐릭터가 나온 사람은"
        who_me = "단톡방 속 나의 캐릭터는"
    else:
        visual = f'<div class="rcard-icon">{emo(icon)}</div>'
        moments_h = f"이럴 때 꼭 {icon}가 돼"
        manual_h = f"{icon} 사용설명서"
        who_friend = "이 이모지가 나온 사람은"
        who_me = "나를 닮은 이모지는"
    best_label = "찰떡 궁합" if t["slug"] == "emoji" else "찰떡 단톡 메이트"
    worst_label = "상극" if t["slug"] == "emoji" else "환장의 조합"
    body = f'''<main class="wrap">
<nav class="crumb" aria-label="이동"><a href="{test_file(t)}">{e(t["title"])}</a></nav>
<p class="friend-note friend-only" id="friendNote">친구가 보낸 결과야. 너는 뭐 나올까?</p>
<article class="result">
  <div class="sticker sticker--fill rcard tape">
    <p class="rcard-who"><span class="friend-only">{who_friend}</span><span class="me-only" hidden>{who_me}</span></p>
    {visual}
    <h1 class="rcard-name">{e(r["name"])}</h1>
    <p class="rcard-tagline">{e(r["tagline"])}</p>
    <p class="rcard-tags">{" ".join("#" + e(x) for x in r["tags"])}</p>
  </div>
</article>
{share_block(t)}
{ad("result_top")}
<section class="rsec"><h2>이런 사람이야</h2>{"".join(f"<p>{e(p)}</p>" for p in r["body"])}</section>
<section class="rsec"><h2>{e(moments_h)}</h2><ul>{"".join(f"<li>{e(m)}</li>" for m in r["moments"])}</ul></section>
<section class="rsec"><h2>{e(manual_h)}</h2><ul>{"".join(f"<li>{e(m)}</li>" for m in r["manual"])}</ul></section>
<section class="rsec"><h2>궁합</h2><div class="match">{match_card(t, best_label, r["best"])}{match_card(t, worst_label, r["worst"])}</div></section>
{ad("result_bottom")}
{more_tests(t)}
<section class="typelist"><h2 class="rsec-title">{e(t["title"])} 결과 {len(t["order"])}가지</h2>{type_grid(t, rid)}</section>
</main>'''
    desc = f"{t['title']} 결과 ‘{r['name']}’. {r['tagline']}. {r['body'][0].split('. ')[0]}."
    title = f"{r['name']} {icon} | {t['seo_title'].split(':')[0]} 결과 | 뭐나와"
    og_title = f"{icon} {r['name']} | {t['title']}"
    page(result_file(t, rid), title, desc, body, og_file(f"{t['slug']}-{rid}"), "theme-" + t["theme"],
         tail=json_script("card-data", card_data(t, rid, r)), og_title=og_title, priority="0.7")


def build_year_result(t, rid):
    r = t["results"][rid]
    sw = SITE_TEXT.LUCKY_COLORS.get(r["color"], "#DDDDDD")
    facts = [f"행운의 달 {r['month']}", f"행운 아이템 {r['item']}", f"행운 컬러 {r['color']}"]
    body = f'''<main class="wrap">
<nav class="crumb" aria-label="이동"><a href="{test_file(t)}">{e(t["title"])}</a></nav>
<p class="friend-note friend-only" id="friendNote">친구가 뽑은 키워드야. 너는 뭐 나올까?</p>
<article class="result">
  <div class="sticker sticker--fill rcard rcard--year tape">
    <p class="rcard-year"><span class="friend-only">2027 새해 키워드</span><span class="me-only" hidden>2027 나의 키워드</span></p>
    <h1 class="rcard-name">{e(r["name"])}</h1>
    <p class="rcard-tagline">{e(r["tagline"])}</p>
  </div>
</article>
{share_block(t)}
{ad("result_top")}
<section class="rsec"><h2>키워드 풀이</h2>{"".join(f"<p>{e(p)}</p>" for p in r["body"])}</section>
<section class="rsec"><h2>행운 포인트</h2>
  <dl class="luck">
    <div class="sticker"><dt>행운의 달</dt><dd>{e(r["month"])}</dd></div>
    <div class="sticker"><dt>행운 컬러</dt><dd><span class="swatch" style="--sw:{sw}" aria-hidden="true"></span>{e(r["color"])}</dd></div>
    <div class="sticker wide"><dt>행운 아이템</dt><dd>{e(r["item"])}</dd></div>
    <div class="sticker wide"><dt>조심할 것</dt><dd>{e(r["caution"])}</dd></div>
  </dl>
</section>
<section class="sticker quote"><small>2027년의 너에게</small><p>{e(r["message"])}</p></section>
{ad("result_bottom")}
{more_tests(t)}
<section class="typelist"><h2 class="rsec-title">다른 키워드도 구경하기</h2>{type_grid(t, rid)}</section>
</main>'''
    desc = f"2027년 나의 키워드 ‘{r['name']}’: {r['tagline']}. 행운의 달은 {r['month']}, 행운 아이템은 {r['item']}."
    title = f"2027 키워드 ‘{r['name']}’ | 새해 키워드 카드 | 뭐나와"
    og_title = f"2027년 나의 키워드는 ‘{r['name']}’"
    page(result_file(t, rid), title, desc, body, og_file(f"2027-{rid}"), "theme-" + t["theme"],
         tail=json_script("card-data", card_data(t, rid, r, facts)), og_title=og_title, priority="0.7")


# ---------------------------------------------------------------- docs
def contact_block():
    if CONTACT_EMAIL:
        return f'<div class="sticker contact"><span>문의 메일</span><strong>{e(CONTACT_EMAIL)}</strong></div>'
    return '<div class="sticker contact"><span>문의 메일</span><strong>운영자 이메일을 곧 안내할게요</strong></div>'


def build_docs():
    A = SITE_TEXT.ABOUT
    secs = "".join(f"<section><h2>{e(h)}</h2>{''.join(f'<p>{e(p)}</p>' for p in ps)}</section>" for h, ps in A["sections"])
    body = f'''<main class="wrap doc">
<h1>{e(A["title"])}</h1>
{secs}
<section><h2>문의</h2><p>제안이나 오류 제보는 아래 메일로 보내 주세요.</p>{contact_block()}</section>
</main>'''
    page("about.html", "뭐나와 소개", A["description"], body, og_file("home"), "theme-yolk", priority="0.3")

    P = SITE_TEXT.PRIVACY
    secs = []
    for h, ps in P["sections"]:
        extra = contact_block() if h.startswith("6.") else ""
        secs.append(f"<section><h2>{e(h)}</h2>{''.join(f'<p>{e(p)}</p>' for p in ps)}{extra}</section>")
    body = f'''<main class="wrap doc">
<h1>{e(P["title"])}</h1>
<p class="meta">시행일: {e(P["effective"])}</p>
{"".join(secs)}
</main>'''
    page("privacy.html", "개인정보처리방침 | 뭐나와", P["description"], body, og_file("home"), "theme-yolk", priority="0.2")

    body = '''<main class="wrap doc">
<h1>페이지를 찾을 수 없어요</h1>
<p>주소가 바뀌었거나 없어진 페이지예요. 테스트 목록에서 다시 골라 봐.</p>
<a class="btn btn--ink" href="index.html">테스트 목록으로</a>
</main>'''
    page("404.html", "페이지를 찾을 수 없어요 | 뭐나와", "요청한 페이지를 찾을 수 없습니다.", body, og_file("home"), "theme-yolk")


# ---------------------------------------------------------------- images
FONT_DIR = os.path.expanduser("~/.local/share/fonts")
EMOJI_FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def make_images():
    from PIL import Image, ImageDraw, ImageFont, ImageFilter

    bagel = lambda s: ImageFont.truetype(os.path.join(FONT_DIR, "BagelFatOne-Regular.ttf"), s)  # noqa: E731
    plex = lambda s, w="Bold": ImageFont.truetype(os.path.join(FONT_DIR, f"IBMPlexSansKR-{w}.ttf"), s)  # noqa: E731
    efont = ImageFont.truetype(EMOJI_FONT, 109)

    def emoji_img(ch, size):
        tmp = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((20, 20), ch, font=efont, embedded_color=True)
        tmp = tmp.crop(tmp.getbbox())
        scale = size / max(tmp.size)
        return tmp.resize((round(tmp.width * scale), round(tmp.height * scale)), Image.LANCZOS)

    def ground(fill, W=1200, H=630, line=(255, 255, 255, 40)):
        im = Image.new("RGBA", (W, H), hexrgb(fill) + (255,))
        d = ImageDraw.Draw(im)
        for x in range(0, W + 1, 30):
            d.line([(x, 0), (x, H)], fill=line, width=1)
        for y in range(0, H + 1, 30):
            d.line([(0, y), (W, y)], fill=line, width=1)
        return im

    def panel(im, box, color, radius=44):
        x0, y0, x1, y1 = box
        sh = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle((x0 - 10, y0 - 2, x1 + 10, y1 + 18), radius + 10, fill=(20, 24, 40, 70))
        im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
        d = ImageDraw.Draw(im)
        d.rounded_rectangle((x0 - 10, y0 - 10, x1 + 10, y1 + 10), radius + 10, fill=(255, 255, 255, 255))
        d.rounded_rectangle(box, radius, fill=hexrgb(color) + (255,))

    def ctext(d, cx, y, text, font, fill):
        w = d.textlength(text, font=font)
        d.text((cx - w / 2, y), text, font=font, fill=fill)

    def wrap(d, text, font, maxw):
        words, lines, line = text.split(" "), [], ""
        for w in words:
            t = (line + " " + w).strip()
            if d.textlength(t, font=font) > maxw and line:
                lines.append(line)
                line = w
            else:
                line = t
        if line:
            lines.append(line)
        return lines

    def save(im, name):
        im.convert("RGB").save(os.path.join(OUT, name), "PNG", optimize=True)

    # home
    im = ground("#ECEFF3", line=(200, 208, 220, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((80, 120, 640, 200), 28, fill=(255, 255, 255), outline=(29, 32, 51), width=4)
    d.text((112, 136), "이 테스트 해 봤어?", font=plex(38), fill=(29, 32, 51))
    d.rounded_rectangle((80, 222, 900, 420), 48, fill=(255, 255, 255), outline=(29, 32, 51), width=5)
    d.text((124, 238), "너 뭐 나와?", font=bagel(132), fill=(29, 32, 51))
    d.rounded_rectangle((640, 446, 1120, 526), 28, fill=(29, 32, 51))
    d.text((676, 462), "잠깐만, 나도 해 볼게", font=plex(36), fill=(255, 255, 255))
    for i, ch in enumerate(["🫠", "😎", "🥳"]):
        g = emoji_img(ch, 120)
        im.alpha_composite(g, (940 + (i % 2) * 90, 110 + i * 70))
    d.text((84, 560), "뭐나와  1분 심리테스트 모음", font=plex(30, "Medium"), fill=(78, 84, 112))
    save(im, og_file("home"))

    # tests + results
    for t in TESTS:
        C = CANVAS[t["theme"]]
        im = ground(C["fill"])
        panel(im, (90, 70, 1110, 520), C["panel"])
        d = ImageDraw.Draw(im)
        if t["slug"] == "chat":
            d.rounded_rectangle((300, 120, 760, 196), 30, fill=(255, 255, 255), outline=hexrgb(C["ink"]), width=4)
            d.text((332, 132), "다음 주에 다들 언제 돼?", font=plex(36), fill=hexrgb(C["ink"]))
            d.rounded_rectangle((470, 212, 900, 288), 30, fill=hexrgb(C["fill"]), outline=hexrgb(C["ink"]), width=4)
            d.text((502, 224), "투표 올렸어. 오늘 마감!", font=plex(36), fill=hexrgb(C["ink"]))
        else:
            n = len(t["cover"])
            x0 = 600 - (n * 170 + (n - 1) * 30) // 2
            for i, ch in enumerate(t["cover"]):
                g = emoji_img(ch, 170)
                im.alpha_composite(g, (x0 + i * 200 + (170 - g.width) // 2, 105))
        ctext(d, 600, 320, t["title"], bagel(96), hexrgb(C["panelInk"]))
        ctext(d, 600, 440, t["subtitle"], plex(40), hexrgb(C["sub"]))
        ctext(d, 600, 560, "뭐나와", bagel(44), hexrgb(C["ink"]))
        save(im, og_file(t["slug"]))

        for rid in t["order"]:
            r = t["results"][rid]
            im = ground(C["fill"])
            panel(im, (90, 50, 1110, 540), C["panel"])
            d = ImageDraw.Draw(im)
            if t["slug"] == "2027":
                ctext(d, 600, 100, "2027 나의 키워드", bagel(50), hexrgb(C["accent"]))
                size = 170 if len(r["name"]) <= 3 else 140
                ctext(d, 600, 175, r["name"], bagel(size), hexrgb(C["panelInk"]))
                lines = wrap(d, r["tagline"], plex(44), 900)
                for li, l in enumerate(lines[:2]):
                    ctext(d, 600, 410 + li * 58, l, plex(44), hexrgb(C["panelInk"]))
            else:
                g = emoji_img(r["icon"], 190)
                im.alpha_composite(g, (600 - g.width // 2, 82))
                name_font = bagel(104 if len(r["name"]) <= 5 else 90)
                ctext(d, 600, 286, r["name"], name_font, hexrgb(C["panelInk"]))
                lines = wrap(d, r["tagline"], plex(40), 920)
                for li, l in enumerate(lines[:2]):
                    ctext(d, 600, 418 + li * 52, l, plex(40), hexrgb(C["sub"]))
            ctext(d, 600, 566, f"{t['title']}  |  뭐나와", plex(30, "Medium"), hexrgb(C["ink"]))
            save(im, og_file(f"{t['slug']}-{rid}"))

    # apple touch icon
    ic = Image.new("RGBA", (180, 180), hexrgb("#FFC93E") + (255,))
    d = ImageDraw.Draw(ic)
    d.rounded_rectangle((18, 34, 162, 128), 26, fill=hexrgb("#1D2033"))
    d.polygon([(40, 126), (64, 126), (38, 150)], fill=hexrgb("#1D2033"))
    f = bagel(38)
    w = d.textlength("뭐나와", font=f)
    d.text((90 - w / 2, 58), "뭐나와", font=f, fill=(255, 255, 255))
    ic.convert("RGB").save(os.path.join(OUT, "apple-touch-icon.png"), "PNG", optimize=True)


FAVICON = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#FFC93E"/>
<path d="M14 14h36a8 8 0 0 1 8 8v18a8 8 0 0 1-8 8H26l-10 9v-9h-2a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" fill="#1D2033"/>
<circle cx="21" cy="31" r="4" fill="#FFC93E"/><circle cx="32" cy="31" r="4" fill="#FFC93E"/><circle cx="43" cy="31" r="4" fill="#FFC93E"/>
</svg>
'''


def write_misc():
    with open(os.path.join(OUT, "favicon.svg"), "w", encoding="utf-8") as f:
        f.write(FAVICON)
    if PREVIEW:
        return
    with open(os.path.join(OUT, ".nojekyll"), "w") as f:
        f.write("")
    with open(os.path.join(OUT, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\n\nSitemap: {BASE_URL}sitemap.xml\n")
    urls = []
    for path, pr in PAGES:
        loc = BASE_URL + ("" if path == "index.html" else path)
        urls.append(f"  <url><loc>{e(loc)}</loc><lastmod>{TODAY}</lastmod><priority>{pr}</priority></url>")
    with open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(urls) + "\n</urlset>\n")
    with open(os.path.join(OUT, "ads.txt"), "w", encoding="utf-8") as f:
        if ADSENSE_CLIENT:
            f.write(f"google.com, {ADSENSE_CLIENT.replace('ca-', '')}, DIRECT, f08c47fec0942fa0\n")
        else:
            f.write("# 애드센스 승인 후 아래 줄의 pub-ID를 바꾸고 맨 앞 #을 지우세요\n"
                    "# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0\n")
    if CUSTOM_DOMAIN:
        with open(os.path.join(OUT, "CNAME"), "w", encoding="utf-8") as f:
            f.write(CUSTOM_DOMAIN + "\n")


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    shutil.copy(os.path.join(ROOT, "src", "style.css"), OUT)
    shutil.copy(os.path.join(ROOT, "src", "app.js"), OUT)
    build_home()
    build_quiz(EMOJI)
    build_quiz(CHAT)
    build_draw(YEAR)
    for rid in EMOJI["order"]:
        build_result(EMOJI, rid)
    for rid in CHAT["order"]:
        build_result(CHAT, rid)
    for rid in YEAR["order"]:
        build_year_result(YEAR, rid)
    build_docs()
    make_images()
    write_misc()
    n = len(os.listdir(OUT))
    print(f"built {n} files → {OUT}  (preview={PREVIEW}, base={BASE_URL}, adsense={'on' if ADSENSE_CLIENT else 'off'})")


if __name__ == "__main__":
    main()
