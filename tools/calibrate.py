"""결과가 한쪽으로 쏠리지 않도록 유형별 가중치를 보정해 content/weights.json에 저장한다. (numpy 필요)"""
import sys, importlib, json
import numpy as np
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

def matrices(test, N, seed):
    order = test["order"]; K = len(order); idx = {k:i for i,k in enumerate(order)}
    rng = np.random.default_rng(seed)
    Q = len(test["questions"])
    S = np.zeros((N, K)); L = -np.ones((N, K))
    for qi, q in enumerate(test["questions"]):
        a = rng.integers(0, len(q["options"]), size=N)
        for ai, (_, sc) in enumerate(q["options"]):
            m = a == ai
            for k, p in sc.items():
                S[m, idx[k]] += p; L[m, idx[k]] = qi
    return S, L

def decide(S, L, w):
    # exact lexicographic rule shared with app.js: weighted score, then latest hit, then list order
    P = np.round(S * w, 9)
    M1 = P >= P.max(axis=1, keepdims=True) - 1e-12
    L2 = np.where(M1, L, -9)
    M2 = M1 & (L2 == L2.max(axis=1, keepdims=True))
    return M2.argmax(axis=1)

def calibrate(test, iters=60):
    K = len(test["order"])
    S, L = matrices(test, 120000, 11)
    w = np.ones(K)
    for it in range(iters):
        r = decide(S, L, w)
        f = np.bincount(r, minlength=K) / len(r)
        w *= (1.0 / K / np.maximum(f, 1e-4)) ** 0.15
        w /= w.mean()
    # validate on fresh sample
    S2, L2 = matrices(test, 200000, 99)
    f2 = np.bincount(decide(S2, L2, w), minlength=K) / len(S2)
    return w, f2

out = {}
for mod in ["content.emoji", "content.chat"]:
    t = importlib.import_module(mod).TEST
    w, f = calibrate(t)
    w = np.round(w, 3)
    S2, L2 = matrices(t, 200000, 123)
    f = np.bincount(decide(S2, L2, w), minlength=len(w)) / len(S2)
    print(mod)
    for k, wi, fi in zip(t["order"], w, f):
        print(f"  {k:10s} w={wi:.3f}  {fi*100:5.1f}%")
    out[t["slug"]] = {k: float(wi) for k, wi in zip(t["order"], w)}
json.dump(out, open(os.path.join(ROOT, "content", "weights.json"), "w"), indent=1)
print(json.dumps(out))
