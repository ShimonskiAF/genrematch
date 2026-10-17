import json,numpy as np,itertools
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
R=json.load(open('/workspace/rows.json')); tr=[r for r in R if not r['held']]
m=json.load(open('/tmp/oof_meta.json')); cls=m['cls']; y=np.array(m['y']); F=np.load('/tmp/oof_fused.npy')
T=cls.index('peaktechno'); H=[cls.index(c) for c in ['house','techhouse','basshouse','speedhouse']]
top2=np.argsort(-F,1)[:,:2]
pair=np.array([ (T in t) and (t[0] in H or t[1] in H) for t in top2])
idx=np.where(pair)[0]; print('train pair cases',len(idx),'base correct in those',int((F[idx].argmax(1)==y[idx]).sum()),
 'truth techno',int((y[idx]==T).sum()),'truth housefam',int(np.isin(y[idx],H).sum()))
b=lambda r,k: r['base'][k]
feat=np.array([[b(r,'brightness'),b(r,'vocalMid'),b(r,'fourFloor')] for r in tr])
def apply(rule,i):
    t=top2[i]; other=t[0] if t[0]!=T else t[1]; br,vm,ff=feat[i]
    tb,tv,tf,hb,hv=rule
    if br<tb and vm<tv and ff>tf: return T
    if br>hb or vm>hv: return other
    return F[i].argmax()
def score(rule,ids): return sum(apply(rule,i)==y[i] for i in ids)
grid=list(itertools.product([0.3,0.35,0.4,0.45,0.5,9],[0.3,0.4,0.5,0.6,9],[0,0.7,0.8],[0.45,0.5,0.55,0.6,9],[0.5,0.6,0.7,9]))
print('plan rule (0.35,0.4,0.8,0.5,0.5):',score((0.35,0.4,0.8,0.5,0.5),idx),'/',len(idx))
# nested CV over pair cases
rng=np.random.default_rng(0); fo=rng.permutation(len(idx))%5; tot=0; ch=[]
for k in range(5):
    a=idx[fo!=k]; t=idx[fo==k]; best=max(grid,key=lambda g:(score(g,a), g==(9,9,0,9,9))); ch.append(best); tot+=score(best,t)
print('nested-CV rule',tot,'/',len(idx),'chosen',ch)
best=max(grid,key=lambda g:(score(g,idx), g==(9,9,0,9,9))); print('all-train best',best,score(best,idx))
# tiny LR second stage (nested CV): features brightness vocalMid fourFloor bpm + log-ratio
X=np.c_[feat,[r['base']['bpm'] for r in tr],np.log(F[np.arange(len(F)),T]+1e-9)-np.log(np.array([F[i,top2[i][0] if top2[i][0]!=T else top2[i][1]] for i in range(len(F))])+1e-9)]
tot=0
for k in range(5):
    a=idx[fo!=k]; t=idx[fo==k]; ya=(y[a]==T).astype(int)
    sc=StandardScaler().fit(X[a]); lr=LogisticRegression(C=0.3).fit(sc.transform(X[a]),ya)
    pr=lr.predict(sc.transform(X[t]))
    for i,p in zip(t,pr): o=top2[i][0] if top2[i][0]!=T else top2[i][1]; tot+= (T if p else o)==y[i]
print('nested-CV LR stage',tot,'/',len(idx))
