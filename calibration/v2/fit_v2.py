# Fit the v2 classifiers on the TRAINING split only; choices by 5-fold CV on that split.
# Writes data/model_v2.json (scalers + linear weights; JS does inference). The holdout is not read here.
# venv: numpy scikit-learn. Usage: python fit_v2.py rows.json yam.json out.json
import json, sys, numpy as np, warnings; warnings.filterwarnings('ignore')
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.model_selection import StratifiedKFold
R = json.load(open(sys.argv[1])); Y = json.load(open(sys.argv[2]))
BK = ['bpm','energy','brightness','texture','bass','dynamics','pulse','fourFloor','tresillo','offbeat','syncop','backbeat','tonal','vocalMid','ghost','tight','kickDensity','hatDensity','backbeat2','kickOff','gTempo','halfTime']
V2K = list(R[0]['v2'].keys())
HK = ['b_' + k for k in BK] + V2K
def hand(r):
    b = r['base']; return [b.get(k) if b.get(k) is not None else 0.5 for k in BK] + [r['v2'][k] for k in V2K]
tr = [r for r in R if not r['held']]
Xh = np.array([hand(r) for r in tr], float); Xm = np.array([Y[r['key']]['emb'] for r in tr], float)
y = np.array([r['sub'] for r in tr]); cls = sorted(set(y)); fam = {r['sub']: r['family'] for r in R}
yi = np.array([cls.index(v) for v in y])
skf = list(StratifiedKFold(5, shuffle=True, random_state=0).split(Xh, y))
def lin(model, sc):  # linear logits: x -> (x-mu)/sd @ W.T + b
    return {'mu': sc.mean_.tolist(), 'sd': sc.scale_.tolist(), 'W': model.coef_.tolist(), 'b': model.intercept_.tolist()}
def fit_lr(X, yy, C):
    sc = StandardScaler().fit(X); m = LogisticRegression(C=C, max_iter=5000, class_weight='balanced').fit(sc.transform(X), yy); return sc, m
def fit_lda(X, yy, s):
    sc = StandardScaler().fit(X); m = LinearDiscriminantAnalysis(solver='lsqr', shrinkage=s).fit(sc.transform(X), yy); return sc, m
def logits(sc, m, X): return sc.transform(X) @ m.coef_.T + m.intercept_
def sm(z): z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
# out-of-fold logits per component
oof = {k: np.zeros((len(y), len(cls))) for k in ['lr', 'lda', 'mel']}
for a, b in skf:
    for k, (X, f, p) in {'lr': (Xh, fit_lr, 0.3), 'lda': (Xh, fit_lda, 0.3), 'mel': (Xm, fit_lr, 0.03)}.items():
        sc, m = f(X[a], yi[a], p); oof[k][b] = logits(sc, m, X[b])
def acc(P):
    p = P.argmax(1); famacc = np.mean([fam[cls[i]] == fam[cls[j]] for i, j in zip(p, yi)])
    # family by summed probability
    fams = sorted(set(fam.values())); F = np.stack([P[:, [i for i, c in enumerate(cls) if fam[c] == f]].sum(1) for f in fams], 1)
    fsum = np.mean([fams[i] == fam[cls[j]] for i, j in zip(F.argmax(1), yi)])
    return famacc, fsum, np.mean(p == yi)
def nll(P): return -np.mean(np.log(P[np.arange(len(yi)), yi] + 1e-12))
# temperatures per component (LDA logits are on a different scale), then fusion weight
T = {}
for k in oof:
    T[k] = min([0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8], key=lambda t: nll(sm(oof[k] / t)))
P = {k: sm(oof[k] / T[k]) for k in oof}
hand_p = (P['lr'] + P['lda']) / 2
res = []
for a in np.linspace(0, 1, 11):
    Pf = np.exp((1 - a) * np.log(hand_p + 1e-9) + a * np.log(P['mel'] + 1e-9)); Pf /= Pf.sum(1, keepdims=True)
    res.append((a, *acc(Pf), nll(Pf)))
for r in res: print('a=%.1f famArgmax %.3f famSum %.3f sub %.3f nll %.3f' % r)
print('hand only', acc(hand_p), 'mel only', acc(P['mel']), 'T', T)
best_a = max(res, key=lambda r: (round(r[2], 3), -r[4]))[0]
Pf = np.exp((1 - best_a) * np.log(hand_p + 1e-9) + best_a * np.log(P['mel'] + 1e-9)); Pf /= Pf.sum(1, keepdims=True)
np.save('/tmp/oof_fused.npy', Pf); np.save('/tmp/oof_hand.npy', hand_p); json.dump({'cls': cls, 'y': yi.tolist()}, open('/tmp/oof_meta.json', 'w'))
# final fit on full training split
out = {'note': 'GenreMatch v2 linear heads. Fitted on the training split only (calibration/v2/fit_v2.py). Hand = base+groove+v2 features (LR + shrinkage LDA, averaged); mel = YAMNet mean embedding (LR). Fused in log space.',
       'classes': cls, 'handKeys': HK, 'temps': T, 'melWeight': float(best_a), 'cv': {'fused': acc(Pf), 'hand': acc(hand_p), 'mel': acc(P['mel'])}}
sc, m = fit_lr(Xh, yi, 0.3); out['lr'] = lin(m, sc)
sc, m = fit_lda(Xh, yi, 0.3); out['lda'] = lin(m, sc)
sc, m = fit_lr(Xm, yi, 0.03); out['mel'] = lin(m, sc)
def rnd(o):
    if isinstance(o, float): return round(o, 5)
    if isinstance(o, list): return [rnd(v) for v in o]
    if isinstance(o, dict): return {k: rnd(v) for k, v in o.items()}
    return o
json.dump(rnd(out), open(sys.argv[3], 'w'))
print('best melWeight', best_a)
