// GenreMatch ranking v2: hierarchical (super-genre -> family -> shelf), multi-label, with confidence.
// Inputs: v1 features (analyser + groove), v2 features (features2.js), optional mel-path embedding (melpath.js).
// In-domain shelves (the 18 crates we have labelled audio for) use linear heads fitted on the training split
// (data/model_v2.json). Estimate shelves (rock, jazz, folk...) keep the v1 distance read, plus YAMNet's
// out-of-domain genre evidence when the mel path ran. Musicmap relations re-rank near misses. Pure functions.
import { scoreGenre } from './scoring.js';
import { oodEvidence } from './melpath.js';

export const CONF_BANDS = { high: 0.65, medium: 0.4 };
export const NEAR = { beta: 0.25, minP: 0.08, rel: 0.35, max: 2 };
export const SUPER_KEEP = 0.6; // keep every super-genre within 60% of the best one, then pick the family
export const HYBRID = 0.6;     // second family at >= 60% of the first, both >= 25%: show as a hybrid

const softmax = (z, T = 1) => { const m = Math.max(...z); const e = z.map((v) => Math.exp((v - m) / T)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); };
export function handVector(f, v2, keys) { return keys.map((k) => { if (k.startsWith('b_')) { const v = f?.[k.slice(2)]; return v == null || Number.isNaN(v) ? 0.5 : v; } const v = v2?.[k]; return v == null || Number.isNaN(v) ? 0 : v; }); }
export function headLogits(h, x) { const z = h.W.map((row, c) => { let s = h.b[c]; for (let j = 0; j < row.length; j++) s += row[j] * ((x[j] - h.mu[j]) / (h.sd[j] || 1)); return s; }); return z; }

// In-domain probabilities over model.classes. Mel is optional; the hand heads always run.
export function inDomain(model, f, v2, emb) {
  const x = handVector(f, v2, model.handKeys);
  const pl = softmax(headLogits(model.lr, x), model.temps.lr), pd = softmax(headLogits(model.lda, x), model.temps.lda);
  const hand = pl.map((v, i) => (v + pd[i]) / 2);
  if (!emb) return { classes: model.classes, p: hand, hand, mel: null, x };
  const mel = softmax(headLogits(model.mel, emb), model.temps.mel), a = model.melWeight;
  const g = hand.map((v, i) => Math.exp((1 - a) * Math.log(v + 1e-9) + a * Math.log(mel[i] + 1e-9))), s = g.reduce((u, v) => u + v, 0);
  return { classes: model.classes, p: g.map((v) => v / s), hand, mel, x };
}

export function relation(graph, a, b, famOf) {
  if (a === b) return 0;
  const A = graph.profiles[a], B = graph.profiles[b], w = graph.relWeights;
  if (!A || !B) return 0;
  if (A.anti?.includes(b) || B.anti?.includes(a)) return w.anti;
  let r = 0;
  if (A.siblings.includes(b) || B.siblings.includes(a)) r = Math.max(r, w.sibling);
  if (A.parent.includes(b) || B.parent.includes(a)) r = Math.max(r, w.parent);
  if (A.influence.includes(b) || B.influence.includes(a)) r = Math.max(r, w.influence);
  if (famOf && famOf[a] === famOf[b]) r = Math.max(r, w.family);
  return r;
}
export function relationWord(graph, a, b) {
  const A = graph.profiles[a], B = graph.profiles[b];
  if (!A || !B) return '';
  if (A.siblings.includes(b) || B.siblings.includes(a)) return 'sibling';
  if (A.parent.includes(b)) return 'parent';
  if (B.parent.includes(a)) return 'offshoot';
  if (A.influence.includes(b) || B.influence.includes(a)) return 'influence';
  return '';
}

// Out-of-domain mass: how much of the read belongs to shelves we only have estimates for. Three gates,
// each 0 until its evidence passes the 95th percentile seen on in-domain TRAINING tracks (model.ood):
// the v1 distance read prefers an estimate shelf; YAMNet names a genre we have no crate for; the
// embedding sits far from anything we trained on (novelty). The strongest gate wins.
const gate = (v, th) => Math.max(0, Math.min(1, (v - th) / (1 - th)));
export function novelty(model, emb) {
  if (!emb) return 0; const { mu, sd } = model.mel; let s = 0;
  for (let j = 0; j < emb.length; j++) if (sd[j] > 1e-6) s += Math.min(100, ((emb[j] - mu[j]) / sd[j]) ** 2);
  return s / emb.length;
}
export function oodMass(model, distFits, isEst, yamScores, emb) {
  const o = model.ood || {}, K = o.K ?? 4;
  let se = 0, sa = 0; for (const r of distFits) { const w = (r.fit / 100) ** K; sa += w; if (isEst(r.id)) se += w; }
  const mDist = sa > 0 ? se / sa : 0, ev = oodEvidence(yamScores), nov = novelty(model, emb);
  const gd = gate(mDist, o.thetaDist ?? 0.57), gy = ev ? gate(ev.share, o.thetaYam ?? 0.23) : 0;
  const gn = emb ? Math.max(0, Math.min(1, (nov - (o.novLo ?? 2.5)) / (o.novSpan ?? 5))) : 0;
  return { m: Math.max(gd, gy, gn), mDist, yam: ev, nov, gates: { dist: gd, yam: gy, novelty: gn } };
}

export function rankV2({ f, v2, mel, profiles, model, graph, bias = {}, opts = {} }) {
  // opts (benchmarks only): flat = family of the top shelf, no super-genre step; beta = relation weight; noOod = in-domain only
  if (!f || f.silent || !v2) return { status: 'none', label: 'No clear genre', reason: 'The file is silent or too short to read.', ranked: [], confidence: 'low', confidencePct: 0 };
  const famOf = Object.fromEntries(profiles.map((p) => [p.id, p.family]));
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const inSet = new Set(model.classes), isEst = (id) => !inSet.has(id);
  const dist = profiles.map((p) => scoreGenre(f, p));
  const distById = Object.fromEntries(dist.map((r) => [r.id, r]));
  const ind = inDomain(model, f, v2, mel?.emb);
  const ood = opts.noOod ? { m: 0, yam: null, gates: {}, nov: 0 } : oodMass(model, dist, isEst, mel?.scores, mel?.emb);
  // estimate shelves: v1 distance fit, mixed with YAMNet's out-of-domain genre split when present
  const est = dist.filter((r) => isEst(r.id)); let es = 0; const ew = {};
  for (const r of est) { ew[r.id] = (r.fit / 100) ** (model.ood?.K ?? 4); es += ew[r.id]; }
  const P = {};
  for (const r of est) { const d = es > 0 ? ew[r.id] / es : 1 / est.length; const y = ood.yam?.per?.[r.id]; P[r.id] = ood.m * (y != null ? 0.5 * d + 0.5 * y : ood.yam ? 0.5 * d : d); }
  ind.classes.forEach((c, i) => { P[c] = (1 - ood.m) * ind.p[i]; });
  // local feedback: small log-prior per shelf (js/feedback.js)
  let z = 0; for (const k of Object.keys(P)) { P[k] = P[k] * Math.exp(bias[k] || 0); z += P[k]; }
  for (const k of Object.keys(P)) P[k] /= z || 1;
  const sup = (id) => graph.familySuper[famOf[id]] || 'Other';
  const S = {}, F = {};
  for (const [id, p] of Object.entries(P)) { S[sup(id)] = (S[sup(id)] || 0) + p; F[famOf[id]] = (F[famOf[id]] || 0) + p; }
  const supers = Object.entries(S).sort((a, b) => b[1] - a[1]);
  const keep = new Set(supers.filter(([, v]) => v >= SUPER_KEEP * supers[0][1]).map(([k]) => k));
  const fams = Object.entries(F).sort((a, b) => b[1] - a[1]);
  const fam1 = opts.flat ? famOf[Object.keys(P).sort((a, b) => P[b] - P[a])[0]] : fams.find(([k]) => keep.has(graph.familySuper[k]))[0];
  const primaryId = Object.keys(P).filter((id) => famOf[id] === fam1).sort((a, b) => P[b] - P[a])[0];
  const famP = F[fam1], conf = famP >= CONF_BANDS.high ? 'high' : famP >= CONF_BANDS.medium ? 'medium' : 'low';
  const others = Object.keys(P).filter((id) => id !== primaryId).map((id) => ({ id, p: P[id], score: P[id] * (1 + (opts.beta ?? NEAR.beta) * relation(graph, primaryId, id, famOf)) })).sort((a, b) => b.score - a.score);
  const near = others.filter((o) => o.p >= NEAR.minP && o.p >= NEAR.rel * P[primaryId]).slice(0, NEAR.max);
  const fam2 = fams.find(([k]) => k !== fam1);
  const hybrid = !!fam2 && fam2[1] >= HYBRID * famP && fam2[1] >= 0.25;
  const item = (id) => ({ id, name: byId[id].name, family: famOf[id], super: sup(id), p: P[id], fit: Math.round(100 * P[id]), centreBpm: byId[id].features.bpm, tempoUsed: distById[id].tempoUsed, octave: distById[id].octave, relation: id === primaryId ? '' : relationWord(graph, primaryId, id), estimate: isEst(id) });
  const primary = item(primaryId);
  const ranked = [primaryId, ...others.map((o) => o.id)].map(item);
  const nearMisses = near.map((o) => item(o.id));
  const label = hybrid ? `${fam1} × ${fam2[0]}` : conf === 'low' ? fam1 : primary.name;
  return {
    status: hybrid ? 'hybrid' : conf === 'low' ? 'family' : 'genre', label, super: sup(primaryId), superP: S[sup(primaryId)], family: fam1, familyP: famP,
    primary, second: ranked[1], nearMisses, secondFamily: fam2?.[0] ?? null, hybrid, confidence: conf, confidencePct: Math.round(100 * famP),
    leansToward: nearMisses.map((n) => n.name), tempoUsed: primary.tempoUsed, octave: primary.octave, ranked,
    supers: supers.map(([k, v]) => ({ name: k, p: v })), families: fams.map(([k, v]) => ({ name: k, p: v })),
    trace: { ood: { m: ood.m, gates: ood.gates, nov: ood.nov }, melUsed: !!ind.mel, x: ind.x, hand: ind.hand, mel: ind.mel, classes: ind.classes },
  };
}
