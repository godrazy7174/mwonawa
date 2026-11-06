# -*- coding: utf-8 -*-
"""링쿠 미리보기 이미지와 아이콘을 linku.js의 그림 그대로 찍어 assets/에 저장한다.
그림 규칙을 바꿨을 때만 다시 돌리면 된다:  python3 sites/linku/make_og.py"""
import asyncio
import os

from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "assets")
JS = "file://" + os.path.join(HERE, "linku.js")

PAGE = """<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="file://%s">
<style>
html,body{margin:0;background:#fff}
.og{width:1200px;height:630px;position:relative;overflow:hidden;background:#fff;font-family:"NanumMyeongjo","Nanum Myeongjo",serif;color:#000}
.og h1{position:absolute;left:84px;top:88px;margin:0;font-size:86px;font-weight:800;line-height:1.16;letter-spacing:-2px}
.og .by{position:absolute;left:88px;bottom:76px;font-size:34px;color:#0000ee;text-decoration:underline;text-underline-offset:8px;text-decoration-thickness:3px}
.og .url{position:absolute;left:84px;right:84px;top:424px;height:6px;background:#0000ee}
.og .utext{position:absolute;left:88px;top:362px;font-size:38px;color:#0000ee}
.og .cr{position:absolute;width:250px;height:250px}
.og .egg{position:absolute;right:120px;top:70px;width:360px}
.og .sub{position:absolute;left:88px;top:330px;font-size:40px;line-height:1.45;color:#222}
.ic{width:180px;height:180px;background:#fff;display:flex;align-items:center;justify-content:center}
.ic svg{width:160px;height:160px}
.lk-bob,.lk-eyes{animation:none!important}
</style></head><body><div id="root"></div><script src="%s"></script></body></html>"""


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        page = await b.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        tmp = os.path.join(HERE, "_og.html")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(PAGE % (os.path.join(HERE, "linku.css"), JS))
        await page.goto("file://" + tmp)
        await page.wait_for_function("window.__linku")
        await page.evaluate("document.fonts.ready")

        async def shot(name, html_js, w=1200, h=630):
            await page.set_viewport_size({"width": w, "height": h})
            await page.evaluate(html_js)
            await page.wait_for_timeout(150)
            el = await page.query_selector("#root > *")
            await el.screenshot(path=os.path.join(OUT, name))

        await shot("og-home.png", """(() => {
          const L = window.__linku, mk = (seed, rare) => { const f = L.founderFrom(seed); return L.pheno(f.genes, rare||0, 0); };
          const R = {}; L.RARE.forEach(t => R[t.id] = t.bit);
          document.getElementById('root').innerHTML = `<div class="og"><h1>링크 속에<br>사는 생물</h1>
            <p class="utext">godrazy7174.github.io/linku</p><div class="url"></div>
            <div class="cr" style="left:600px;top:178px;width:265px;height:265px">${L.svgCreature(mk(11), {})}</div>
            <div class="cr" style="left:790px;top:150px;width:290px;height:290px">${L.svgCreature(mk(4242, R.stareyes), {})}</div>
            <div class="cr" style="left:960px;top:188px;width:240px;height:240px">${L.svgCreature(mk(907, R.wings), {})}</div>
            <p class="by">친구가 보낸 링크를 누르면 알이 깨어나요</p></div>`;
        })()""")
        tiers = {"a": ("알이 도착했어요", 0, None), "b": ("10세대가 넘은 알", 33, "heart"),
                 "c": ("30세대가 넘은 알", 77, "gold"), "d": ("100세대가 넘은 알", 501, "galaxy")}
        for key, (title, seed, rare) in tiers.items():
            await shot(f"og-egg-{key}.png", """(() => {
              const L = window.__linku, R = {}; L.RARE.forEach(t => R[t.id] = t.bit);
              const f = L.founderFrom(%d); const ph = L.pheno(f.genes, %s, 0);
              const egg = window.__linkuEgg ? '' : '';
              document.getElementById('root').innerHTML = `<div class="og"><h1>%s</h1>
                <p class="sub">누르고 세 번 두드리면 깨어나요.<br>무엇이 태어날지는 아무도 몰라요.</p>
                <div class="egg">${document.createElement('div').outerHTML}</div>
                <p class="by">링쿠, 링크로 번식하는 생물</p></div>`;
              const holder = document.querySelector('.egg');
              holder.innerHTML = window.__linkuEggSvg(ph);
            })()""" % (seed, f"R.{rare}" if rare else "0", title))
        await shot("apple-touch-icon.png", """(() => {
          const L = window.__linku, f = L.founderFrom(11), ph = L.pheno(f.genes, 0, 0);
          document.getElementById('root').innerHTML = `<div class="ic">${L.svgCreature(ph, {})}</div>`;
        })()""", 180, 180)
        await b.close()
        os.remove(tmp)

asyncio.run(main())
