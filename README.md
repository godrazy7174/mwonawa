# 뭐나와

1분이면 끝나는 공유형 심리테스트 사이트의 소스입니다. 테스트 10개(결과 118개, 퀴즈형은 모두 15문제), 누를 때마다 나는 효과음(Web Audio 합성, 상단에서 켜고 끔).

- 새 테스트 추가: `content/<이름>.py`를 만들고 `content/registry.py`의 `MODULES`에 넣은 뒤 `python3 tools/calibrate.py`로 결과 비율을 보정. 질문은 15개, 보기는 4개, 보기마다 주 유형 2점과 보조 유형 1점을 주고 유형마다 주 유형으로 나오는 횟수를 비슷하게 맞춤

- `content/` 테스트 질문·결과 풀이·사이트 문구
- `src/` 스타일시트와 스크립트
- `build.py` 정적 페이지·미리보기 이미지·sitemap 생성

```bash
python3 build.py                                   # build/site 생성
ADSENSE_CLIENT=ca-pub-XXXX CUSTOM_DOMAIN=example.com BASE_URL=https://example.com/ python3 build.py
```

## 배포

- 사이트 주소: https://godrazy7174.github.io/
- 배포: `python3 build.py` 결과물(`build/site`)을 `godrazy7174/godrazy7174.github.io` 저장소의 `main` 브랜치에 올림
- 이 저장소의 `gh-pages` 브랜치: 옛 주소(`/mwonawa/`)를 새 주소로 보내는 이동 페이지 (`tools/redirects.py`로 생성)
- 애드센스 승인 후: `ADSENSE_CLIENT=ca-pub-… python3 build.py`로 광고 코드와 ads.txt를 넣어 다시 배포

## 빌드 준비물

- Python 3, Pillow (미리보기 이미지 생성)
- 글꼴: `BagelFatOne-Regular.ttf`, `IBMPlexSansKR-{Regular,Medium,Bold}.ttf`를 `~/.local/share/fonts`에 (google/fonts 저장소)
- 컬러 이모지 글꼴: `/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf`
- 결과 비율 보정: `python3 tools/calibrate.py` (numpy 필요)
