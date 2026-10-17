// Dev-only calibration table (Shima prompt 5). Not used by the UI.
// node calibration/v2/devtable.js <rows.json> <yam.json> [--held|--train] [--pair Techno,House] [--all] [--json out.json]
// Columns: file, expected shelf, predicted shelf, score gap (fused prob predicted - expected, pp), top mismatches:
// the feature groups that pushed predicted ahead of expected (linear-head contributions) and the measured
// features furthest from the expected shelf's training mean (z).
import fs from 'node:fs';
import { rankV2, inDomain, handVector } from '../../js/rank2.js';
import { contributions } from '../../js/reasons2.js';
const a = process.argv.slice(2), [rowsPath, yamPath] = a, flag = (k) => a.includes(k), arg = (k) => (a.includes(k) ? a[a.indexOf(k) + 1] : null);
const R = JSON.parse(fs.readFileSync(rowsPath)), Y = JSON.parse(fs.readFileSync(yamPath));
const J = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const model = J('../../data/model_v2.json'), P = J('../../data/genre_profiles.json').profiles, graph = J('../../data/atlas_graph.json');
const name = Object.fromEntries(P.map((p) => [p.id, p.name])), famOf = Object.fromEntries(P.map((p) => [p.id, p.family]));
const train = R.filter((r) => !r.held), pool = flag('--train') ? train : flag('--held') || !flag('--all') ? R.filter((r) => r.held) : R;
// per-shelf training mean / sd of every hand feature, for the z mismatch column
const X = (r) => handVector(r.base, r.v2, model.handKeys), stat = {};
for (const r of train) { (stat[r.sub] ??= []).push(X(r)); }
const ms = Object.fromEntries(Object.entries(stat).map(([k, xs]) => { const m = xs[0].map((_, j) => xs.reduce((s, x) => s + x[j], 0) / xs.length); return [k, m]; }));
const sd = model.handKeys.map((_, j) => model.lr.sd[j] || 1);
const pair = arg('--pair')?.split(',');
const out = [];
for (const r of pool) {
  const x = rankV2({ f: r.base, v2: r.v2, mel: Y[r.key], profiles: P, model, graph });
  const pred = x.primary?.id; if (!pred) continue;
  if (pred === r.sub && !flag('--all')) continue;
  if (pair && !(famOf[r.sub] === pair[0] && famOf[pred] === pair[1])) continue;
  const fz = inDomain(model, r.base, r.v2, Y[r.key].emb), ci = (id) => model.classes.indexOf(id);
  const gap = ci(pred) >= 0 && ci(r.sub) >= 0 ? Math.round(100 * (fz.p[ci(pred)] - fz.p[ci(r.sub)])) : null;
  const melGap = ci(pred) >= 0 && ci(r.sub) >= 0 ? Math.round(100 * (fz.mel[ci(pred)] - fz.mel[ci(r.sub)])) : null;
  const push = contributions(model, X(r), pred, r.sub).filter((d) => d.c > 0.05).slice(0, 3).map((d) => `${d.g} +${d.c.toFixed(2)}`);
  const xv = X(r), m = ms[r.sub], zs = m ? model.handKeys.map((k, j) => [k, (xv[j] - m[j]) / sd[j]]).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 3).map(([k, z]) => `${k} ${z > 0 ? '+' : ''}${z.toFixed(1)}`) : [];
  out.push({ bpm: Math.round(r.base.bpm), file: r.key.split('|').at(-1), expected: name[r.sub], predicted: name[pred], gap, melGap, conf: x.confidencePct, push, offMean: zs });
}
const pad = (s, n) => String(s ?? '').slice(0, n).padEnd(n);
console.log(pad('bpm', 4), pad('file', 30), pad('expected', 16), pad('predicted', 16), 'gap  mel  | pushed to predicted (groups)       | furthest from expected mean (z)');
for (const o of out) console.log(pad(o.bpm, 4), pad(o.file, 30), pad(o.expected, 16), pad(o.predicted, 16), String(o.gap).padStart(4), String(o.melGap).padStart(4), ' |', pad(o.push.join(', '), 34), '|', o.offMean.join(', '));
console.log(`${out.length} rows`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(out, null, 1));
