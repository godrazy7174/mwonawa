# -*- coding: utf-8 -*-
"""옛 주소(/mwonawa/)용 이동 페이지를 만든다.

사용법: python3 tools/redirects.py <새 사이트 빌드 폴더> <옛 gh-pages 폴더> <출력 폴더>

- 새 사이트의 HTML마다 같은 이름의 짧은 이동 페이지를 만든다(제목·설명·미리보기 태그는 새 페이지 것을 그대로 씀).
- 옛 미리보기 이미지(og-*.png)는 이미 공유된 링크의 썸네일이 깨지지 않도록 그대로 둔다.
- sitemap.xml, robots.txt, ads.txt는 옛 주소에서 뺀다.
"""
import html
import os
import re
import shutil
import sys

NEW_BASE = "https://godrazy7174.github.io/"
KEEP_META = re.compile(r'^<(title>|meta name="description"|meta property="og:|meta name="twitter:)')


def main(new_dir, old_dir, out_dir):
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    os.makedirs(out_dir)
    for f in sorted(os.listdir(old_dir)):
        if f.startswith("og-") and f.endswith(".png"):
            shutil.copy(os.path.join(old_dir, f), out_dir)
    open(os.path.join(out_dir, ".nojekyll"), "w").close()
    n = 0
    for f in sorted(os.listdir(new_dir)):
        if not f.endswith(".html"):
            continue
        src = open(os.path.join(new_dir, f), encoding="utf-8").read()
        head = src.split("</head>", 1)[0]
        meta = [line for line in head.splitlines() if KEEP_META.match(line)]
        target = NEW_BASE + ("" if f == "index.html" else f)
        t = html.escape(target, quote=True)
        doc = (
            "<!doctype html>\n<html lang=\"ko\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            + "\n".join(meta) + "\n"
            f"<link rel=\"canonical\" href=\"{t}\">\n"
            f"<meta http-equiv=\"refresh\" content=\"0; url={t}\">\n"
            "<meta name=\"robots\" content=\"noindex\">\n"
            f"<script>location.replace({target!r} + location.hash);</script>\n"
            "</head>\n<body>\n"
            f"<p>뭐나와가 새 주소로 옮겼어요. <a href=\"{t}\">새 주소로 이동</a></p>\n"
            "</body>\n</html>\n"
        )
        with open(os.path.join(out_dir, f), "w", encoding="utf-8") as fh:
            fh.write(doc)
        n += 1
    print(f"redirect pages: {n}, kept preview images: {len([x for x in os.listdir(out_dir) if x.endswith('.png')])}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
