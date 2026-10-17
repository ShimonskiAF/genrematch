// Shared helpers for the groove layer: z-scored Gaussian (diagonal) classifier, grouped holdout, feature ranking.
import { createHash } from 'node:crypto';
export const hash = (s) => parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16);
// Loops from one pack come in numbered variants ("Beat 01", "Beat 02"): hold out whole variant groups.
export const groupOf = (file) => file.replace(/\.wav$/i, '').replace(/[\s_-]*\d+$/,'').replace(/[\s_-]*\d+(bpm)?$/i, '').trim().toLowerCase();
export function groupedHoldout(items, frac = 0.2) {
  const byG = new Map();
  for (const it of items) { const k = it.genre; byG.set(k, byG.get(k) || []); byG.get(k).push(it); }
  const held = new Set();
  for (const [g, list] of byG) {
    const groups = new Map(); for (const it of list) { const k = groupOf(it.file); groups.set(k, [...(groups.get(k) || []), it]); }
    const order = [...groups.keys()].sort((a, b) => hash(g + a) - hash(g + b));
    let n = 0; const want = frac * list.length;
    for (const k of order) { if (n >= want) break; const sz = groups.get(k).length; if (n + sz > want * 1.25 && sz > 2) continue; for (const it of groups.get(k)) held.add(it.id); n += sz; }
  }
  return held;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, a.length - 1)); };
export function fitGauss(rows, keys, classOf) {
  const classes = [...new Set(rows.map(classOf))].sort();
  const glob = Object.fromEntries(keys.map((k) => [k, { m: mean(rows.map((r) => r.g[k])), s: sd(rows.map((r) => r.g[k])) || 1 }]));
  const z = (r, k) => (r.g[k] - glob[k].m) / glob[k].s;
  const prof = {};
  for (const c of classes) {
    const mine = rows.filter((r) => classOf(r) === c);
    prof[c] = { n: mine.length, mean: {}, sd: {} };
    for (const k of keys) { const v = mine.map((r) => z(r, k)); prof[c].mean[k] = mean(v); prof[c].sd[k] = Math.max(0.35, sd(v) || 1); }
  }
  return { keys, glob, prof };
}
export function logLik(model, g) {
  const out = {};
  for (const [c, p] of Object.entries(model.prof)) {
    let s = 0;
    for (const k of model.keys) { const z = (g[k] - model.glob[k].m) / model.glob[k].s; s += -0.5 * ((z - p.mean[k]) / p.sd[k]) ** 2 - Math.log(p.sd[k]); }
    out[c] = s;
  }
  return out;
}
export const predict = (model, g) => Object.entries(logLik(model, g)).sort((a, b) => b[1] - a[1])[0][0];
// One-way ANOVA F per feature: how well it splits the classes.
export function fStat(rows, k, classOf) {
  const all = rows.map((r) => r.g[k]), m = mean(all), cls = [...new Set(rows.map(classOf))];
  let bss = 0, wss = 0;
  for (const c of cls) { const v = rows.filter((r) => classOf(r) === c).map((r) => r.g[k]); const mc = mean(v); bss += v.length * (mc - m) ** 2; wss += v.reduce((a, x) => a + (x - mc) ** 2, 0); }
  return (bss / (cls.length - 1)) / (wss / (rows.length - cls.length) || 1e-12);
}
export function knnPredict(train, keys, g, k = 7, classOf = (r) => r.genre) {
  const m = {}, s = {};
  for (const key of keys) { const v = train.map((r) => r.g[key]); m[key] = v.reduce((a, b) => a + b, 0) / v.length; s[key] = Math.sqrt(v.reduce((a, b) => a + (b - m[key]) ** 2, 0) / v.length) || 1; }
  const d = train.map((r) => [keys.reduce((a, key) => a + ((r.g[key] - g[key]) / s[key]) ** 2, 0), classOf(r)]).sort((a, b) => a[0] - b[0]).slice(0, k);
  const votes = {}; for (const [dd, c] of d) votes[c] = (votes[c] || 0) + 1 / (1e-6 + Math.sqrt(dd));
  return Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
}
