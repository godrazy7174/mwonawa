# -*- coding: utf-8 -*-
"""결과가 한쪽으로 쏠리지 않도록 유형별 가중치를 보정해 content/weights.json에 저장한다. (numpy 필요)

사용법: python3 tools/calibrate.py            # 모든 테스트 보정 후 저장
        python3 tools/calibrate.py --check    # 저장하지 않고 분포·도달 가능 여부만 확인

결정 규칙은 src/app.js의 decide()와 같다: 가중 점수가 가장 높은 유형, 같으면 마지막으로 점수를 받은 유형, 그래도 같으면 목록 앞쪽.
"""
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from content.registry import load_tests  # noqa: E402


def matrices(test, n, seed):
    order = test["order"]
    idx = {k: i for i, k in enumerate(order)}
    rng = np.random.default_rng(seed)
    S = np.zeros((n, len(order)))
    L = -np.ones((n, len(order)))
    for qi, q in enumerate(test["questions"]):
        a = rng.integers(0, len(q["options"]), size=n)
        for ai, (_, sc) in enumerate(q["options"]):
            m = a == ai
            for k, p in sc.items():
                S[m, idx[k]] += p
                L[m, idx[k]] = qi
    return S, L


def decide(S, L, w):
    P = np.round(S * w, 9)
    m1 = P >= P.max(axis=1, keepdims=True) - 1e-12
    L2 = np.where(m1, L, -9)
    m2 = m1 & (L2 == L2.max(axis=1, keepdims=True))
    return m2.argmax(axis=1)


def decide_one(test, answers, w):
    order = test["order"]
    s = {k: 0 for k in order}
    last = {k: -1 for k in order}
    for qi, ai in enumerate(answers):
        for k, p in test["questions"][qi]["options"][ai][1].items():
            s[k] += p
            last[k] = qi
    best = None
    for k in order:
        v = round(s[k] * w.get(k, 1), 9)
        if best is None or v > best[1] + 1e-12 or (abs(v - best[1]) <= 1e-12 and last[k] > best[2]):
            best = (k, v, last[k])
    return best[0]


def persona_mismatches(test, w):
    bad = []
    for k in test["order"]:
        ans = []
        for q in test["questions"]:
            vals = [sc.get(k, 0) for _, sc in q["options"]]
            ans.append(vals.index(max(vals)))
        got = decide_one(test, ans, w)
        if got != k:
            bad.append((k, got))
    return bad


def calibrate(test, iters=60):
    K = len(test["order"])
    S, L = matrices(test, 120000, 11)
    w = np.ones(K)
    for _ in range(iters):
        f = np.bincount(decide(S, L, w), minlength=K) / len(S)
        w *= (1.0 / K / np.maximum(f, 1e-4)) ** 0.15
        w /= w.mean()
    return np.round(w, 3)


def share(test, w):
    S, L = matrices(test, 200000, 123)
    return np.bincount(decide(S, L, w), minlength=len(test["order"])) / len(S)


def main():
    check_only = "--check" in sys.argv
    path = os.path.join(ROOT, "content", "weights.json")
    weights = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {}
    ok = True
    for t in load_tests():
        if "questions" not in t:
            continue
        raw = share(t, np.ones(len(t["order"])))
        w = calibrate(t)
        wd = {k: float(v) for k, v in zip(t["order"], w)}
        f = share(t, w)
        bad = persona_mismatches(t, wd)
        ok &= not bad
        print(f"[{t['slug']}] raw {raw.min()*100:4.1f}~{raw.max()*100:4.1f}%  ->  calibrated {f.min()*100:4.1f}~{f.max()*100:4.1f}%  "
              f"weights {w.min():.2f}~{w.max():.2f}  persona {'OK' if not bad else bad}")
        weights[t["slug"]] = wd
    if not check_only:
        json.dump(weights, open(path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print("saved", path)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
