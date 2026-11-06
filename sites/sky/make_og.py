# -*- coding: utf-8 -*-
"""하늘봐 미리보기 이미지(1200x630)와 아이콘을 sky.js 그림 그대로 찍어 assets/에 저장한다.
그림이나 일정 규칙을 바꿨을 때만 다시 돌리면 된다:  python3 sites/sky/make_og.py"""
import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))
from sites.sky import content as C  # noqa: E402

OUT = os.path.join(HERE, "assets")

PAGE = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<style>
html,body{margin:0;background:#0F1830}
#og{position:relative;width:1200px;height:630px;overflow:hidden}
#skyCanvas{position:absolute;inset:0;width:1200px;height:630px;display:block}
#sc{position:absolute;left:0;right:0;bottom:0;height:62%%;background:linear-gradient(to top,rgba(6,10,26,.62),rgba(6,10,26,.28) 55%%,rgba(6,10,26,0))}
#t{position:absolute;left:72px;bottom:118px;margin:0;font:400 66px/1.22 "Song Myung",serif;color:#fff;letter-spacing:-1px;text-shadow:0 2px 10px rgba(5,10,30,.6);max-width:900px;word-break:keep-all}
#u{position:absolute;left:76px;bottom:58px;margin:0;font:400 28px/1 "Gowun Dodum",sans-serif;color:rgba(255,255,255,.88);text-shadow:0 1px 4px rgba(0,0,0,.6)}
#ic{width:180px;height:180px}
</style></head><body>
<div id="og"><canvas id="skyCanvas" data-span="60"></canvas><div id="sc"></div><p id="t"></p><p id="u">godrazy7174.github.io/sky</p></div>
<script>window.HANEUL=%s;</script><script src="file://%s"></script></body></html>"""

# 장면마다 그 존재가 하늘에 떠 있는 시각을 찾는 코드 (페이지 안에서 돈다)
FIND = """(id) => {
  const H = window.__haneul, DAY = 864e5, now = Date.now(), d00 = H.day0(now);
  const hol = (key, h, m) => { const ks = Object.keys(window.HANEUL.holidays).filter(k => k.endsWith(':' + key)).map(k => window.HANEUL.holidays[k]).sort();
    const iso = ks.find(x => Date.parse(x + 'T00:00:00+09:00') > now) || ks[ks.length - 1]; return Date.parse(iso + 'T00:00:00+09:00') + (h * 60 + m) * 60e3; };
  if (id === 'whale' || id === 'home') { for (let i = 0; i < 400; i++) { const w = H.whaleOn(d00 + i * DAY), k = new Date(w.start + 9 * 3600e3).getUTCHours();
      const ill = H.moonIllum(w.start).fraction; if (k >= 20 && k <= 22 && ill > 0.35 && ill < 0.7) return w.start + 110e3; } }
  if (id === 'dragon') { for (let i = 0; i < 60; i++) { const ds = H.dragonNear(now + i * 7 * DAY).filter(e => e.start > now); if (ds.length) return ds[0].start + 75e3; } }
  if (id === 'phoenix') { for (let i = 0; i < 24; i++) { const ps = H.phoenixNear(now + i * 30 * DAY).filter(e => e.start > now); if (ps.length) return ps[0].start + 60e3; } }
  if (id === 'kites') return hol('seollal', 11, 0);
  if (id === 'lanterns') return hol('boreum', 21, 10);
  if (id === 'bridge') return hol('chilseok', 23, 20);
  if (id === 'rabbit') return hol('chuseok', 21, 40);
  if (id === 'fireworks') { const y = new Date(now + 9 * 3600e3).getUTCFullYear() + 1; return Date.UTC(y, 0, 1) - 9 * 3600e3 + 25e3; }
  return now;
}"""


async def main():
    hol = json.load(open(os.path.join(HERE, "data", "holidays.json"), encoding="utf-8"))
    data = {"holidays": hol, "showers": [[m, d, nm, r] for m, d, nm, r, *_ in C.SHOWERS], "months": [], "almYears": [], "clear": True, "aim": 0.36, "maxAlt": 34, "scale": 1.25}
    tmp = os.path.join(HERE, "_og.html")
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(PAGE % (json.dumps(data, ensure_ascii=False), os.path.join(HERE, "sky.js")))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = await b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        await page.goto("file://" + tmp)
        await page.wait_for_function("window.__haneul")
        await page.evaluate("document.fonts.ready")
        scenes = [("home", "og-home.png", "지금 하늘 봐.\n서울 하늘에 고래가 지나가요")]
        scenes += [(bid, f"og-now-{bid}.png", t) for bid, t in C.NOW_TITLE.items()]
        for sid, name, title in scenes:
            at = await page.evaluate(f"({FIND})('{sid}')")
            await page.evaluate("(at) => { window.__haneul.setOffset(at - Date.now()); }", at)
            await page.evaluate("(t) => { document.getElementById('t').innerText = t; }", title.replace("지금 ", "지금 ", 1))
            await page.wait_for_timeout(900)
            el = await page.query_selector("#og")
            await el.screenshot(path=os.path.join(OUT, name))
            print("shot", name)
        await page.set_content('<html><body style="margin:0"><div id="ic">' + open(os.path.join(OUT, "favicon.svg"), encoding="utf-8").read()
                               .replace('rx="13"', 'rx="0"').replace("<svg ", '<svg width="180" height="180" ') + "</div></body></html>")
        await page.set_viewport_size({"width": 180, "height": 180})
        el = await page.query_selector("#ic")
        await el.screenshot(path=os.path.join(OUT, "apple-touch-icon.png"))
        await b.close()
    os.remove(tmp)


asyncio.run(main())
