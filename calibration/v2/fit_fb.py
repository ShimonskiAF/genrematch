# Features-only fallback head (used when the YAMNet mel path is unavailable). TRAINING split only.
# Candidates from the Bloom builder app (fourOnFloorB, hatDensity, 8-band mel) were compared by 3x5-fold CV on the
# training split (see PROMPTS_LOG / README); fourOnFloorB alone won on family accuracy. Same heads as fit_v2.py
# (LR C=0.3 + shrinkage-LDA 0.3, averaged; temperatures by CV). Adds model['fb'] and leaves every other key untouched.
# Usage: python fit_fb.py rows.json data/model_v2.json /tmp/fb.json && node calibration/v2/merge_fb.js /tmp/fb.json
import json, sys, numpy as np, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.model_selection import StratifiedKFold
R = json.load(open(sys.argv[1])); M = json.load(open(sys.argv[2]))
EXTRA = ['b_fofB']
HK = M['handKeys'] + EXTRA
def val(r, k):
    if k.startswith('b_'): v = r['base'].get(k[2:]); return 0.5 if v is None else v
    return r['v2'][k]
tr = [r for r in R if not r['held']]
cls = M['classes']; yi = np.array([cls.index(r['sub']) for r in tr])
X = np.array([[val(r, k) for k in HK] for r in tr], float)
fam = {r['sub']: r['family'] for r in R}; fams = sorted(set(fam.values()))
def sm(z): z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
def lg(sc, m, Z): return sc.transform(Z) @ m.coef_.T + m.intercept_
def fit(kind, Z, yy):
    sc = StandardScaler().fit(Z)
    m = LogisticRegression(C=0.3, max_iter=5000, class_weight='balanced') if kind == 'lr' else LinearDiscriminantAnalysis(solver='lsqr', shrinkage=0.3)
    return sc, m.fit(sc.transform(Z), yy)
oof = {k: np.zeros((len(yi), len(cls))) for k in ['lr', 'lda']}
for a, b in StratifiedKFold(5, shuffle=True, random_state=0).split(X, yi):
    for k in oof: sc, m = fit(k, X[a], yi[a]); oof[k][b] = lg(sc, m, X[b])
nll = lambda P: -np.mean(np.log(P[np.arange(len(yi)), yi] + 1e-12))
T = {k: min([0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8], key=lambda t: nll(sm(oof[k] / t))) for k in oof}
H = (sm(oof['lr'] / T['lr']) + sm(oof['lda'] / T['lda'])) / 2
F = np.stack([H[:, [i for i, c in enumerate(cls) if fam[c] == f]].sum(1) for f in fams], 1)
cvf = float(np.mean([fams[i] == fam[cls[j]] for i, j in zip(F.argmax(1), yi)]))
def lin(sc, m): return {'mu': sc.mean_.tolist(), 'sd': sc.scale_.tolist(), 'W': m.coef_.tolist(), 'b': m.intercept_.tolist()}
def rnd(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, list): return [rnd(v) for v in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
fb = {'note': 'Features-only fallback head: handKeys + Bloom fourOnFloorB (js/fourfloor.js). Used only when mel is unavailable. calibration/v2/fit_fb.py', 'handKeys': HK, 'temps': T, 'cv': {'famSum': round(cvf, 4)}}
fb['lr'] = lin(*fit('lr', X, yi)); fb['lda'] = lin(*fit('lda', X, yi))
json.dump(rnd(fb), open(sys.argv[3], 'w'))
print('fallback head written; CV famSum', round(cvf, 4), 'T', T)
