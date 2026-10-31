# 뭐나와

1분이면 끝나는 공유형 심리테스트 사이트의 소스입니다.

- `content/` 테스트 질문·결과 풀이·사이트 문구
- `src/` 스타일시트와 스크립트
- `build.py` 정적 페이지·미리보기 이미지·sitemap 생성

```bash
python3 build.py                                   # build/site 생성
ADSENSE_CLIENT=ca-pub-XXXX CUSTOM_DOMAIN=example.com BASE_URL=https://example.com/ python3 build.py
```

배포 브랜치(`gh-pages`)에는 `build/site`의 결과물만 올라갑니다.

## 빌드 준비물

- Python 3, Pillow (미리보기 이미지 생성)
- 글꼴: `BagelFatOne-Regular.ttf`, `IBMPlexSansKR-{Regular,Medium,Bold}.ttf`를 `~/.local/share/fonts`에 (google/fonts 저장소)
- 컬러 이모지 글꼴: `/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf`
- 결과 비율 보정: `python3 tools/calibrate.py` (numpy 필요)
