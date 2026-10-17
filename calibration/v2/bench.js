// Stage benchmark on the SAME 126-track holdout as live. Training split only for theta (OOD gate).
// node calibration/v2/bench.js <rows.json> <yam.json> [--write-ood]
import fs from 'node:fs';
import { classify } from '../../js/scoring.js';
import { rankV2 } from '../../js/rank2.js';
import { reasonsV2 } from '../../js/reasons2.js';
const [rowsPath, yamPath] = process.argv.slice(2);
const R = JSON.parse(fs.readFileSync(rowsPath)), Y = JSON.parse(fs.readFileSync(yamPath));
const modelPath = new URL('../../data/model_v2.json', import.meta.url);
const model = JSON.parse(fs.readFileSync(modelPath));
const P = JSON.parse(fs.readFileSync(new URL('../../data/genre_profiles.json', import.meta.url))).profiles;
const graph = JSON.parse(fs.readFileSync(new URL('../../data/atlas_graph.json', import.meta.url)));
const famOf = Object.fromEntries(P.map((p) => [p.id, p.family])), supOf = (fam) => graph.familySuper[fam];
const train = R.filter((r) => !r.held), held = R.filter((r) => r.held);
// OOD gates: 95th percentile of each signal on in-domain TRAINING tracks (see rank2.oodMass). Holdout not used.
import { novelty } from '../../js/rank2.js';
import { oodEvidence } from '../../js/melpath.js';
const inSet = new Set(model.classes), pc = (a, p) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(p * (s.length - 1))].toFixed(4); };
const mD = train.map((r) => { let se = 0, sa = 0; for (const p of P) { const w = (classify(r.base, [p]).ranked[0].fit / 100) ** 4; sa += w; if (!inSet.has(p.id)) se += w; } return se / sa; });
model.ood = { K: 4, thetaDist: pc(mD, 0.95), thetaYam: pc(train.map((r) => oodEvidence(Y[r.key].scores).share), 0.95), novLo: Math.max(2.5, pc(train.map((r) => novelty(model, Y[r.key].emb)), 0.99)), novSpan: 5 };
if (process.argv.includes('--write-ood')) { const m = JSON.parse(fs.readFileSync(modelPath)); m.ood = model.ood; fs.writeFileSync(modelPath, JSON.stringify(m)); }
const fams = (ranked) => { const o = []; for (const r of ranked) if (!o.includes(r.family)) o.push(r.family); return o; };
function score(name, rows, read) {
  const out = rows.map((r) => { const x = read(r); return { r, x, fam: x.family === r.family, sup: (x.super || supOf(x.family)) === supOf(r.family), sub: x.primary?.id === r.sub, f2: x.fams.slice(0, 2).includes(r.family), f3: x.fams.slice(0, 3).includes(r.family), s2: x.subs.slice(0, 2).includes(r.sub), s3: x.subs.slice(0, 3).includes(r.sub), conf: x.conf }; });
  const c = (k) => out.filter((o) => o[k]).length, n = out.length;
  const band = (b) => { const s = out.filter((o) => o.conf === b); return `${s.filter((o) => o.fam).length}/${s.length}`; };
  const line = { stage: name, family: `${c('fam')}/${n} (${Math.round((100 * c('fam')) / n)}%)`, super: `${c('sup')}/${n} (${Math.round((100 * c('sup')) / n)}%)`, sub: `${c('sub')}/${n}`, top2fam: c('f2'), top3fam: c('f3'), top2sub: c('s2'), top3sub: c('s3'), high: band('high'), medium: band('medium'), low: band('low') };
  return { line, out };
}
const v1 = (r) => { const x = classify(r.base, P); return { ...x, fams: fams(x.ranked), subs: x.ranked.map((g) => g.id), conf: x.confidence }; };
const v2 = (opts, useMel) => (r) => { const m2 = model; const x = rankV2({ f: r.base, v2: r.v2, mel: useMel ? Y[r.key] : null, profiles: P, model: m2, graph, opts }); return { ...x, fams: fams(x.ranked), subs: x.ranked.map((g) => g.id), conf: x.confidence }; };
const stages = [
  ['S0 live (020cef0)', v1],
  ['S1 +v2 features, flat', v2({ flat: true, beta: 0, noOod: true }, false)],
  ['S2 +hierarchy +Musicmap near misses', v2({ noOod: true }, false)],
  ['S3 +mel path (YAMNet) fused', v2({ noOod: true }, true)],
  ['S4 shipped (+estimate shelves gate)', v2({}, true)],
  ['S4b shipped, mel unavailable', v2({}, false)],
];
const res = {};
for (const [n, fn] of stages) { res[n] = score(n, held, fn); console.log(JSON.stringify(res[n].line)); }
console.log('theta', model.ood);
const a = res['S0 live (020cef0)'].out, b = res['S4 shipped (+estimate shelves gate)'].out;
let only1 = 0, only2 = 0; a.forEach((o, i) => { if (o.fam && !b[i].fam) only1++; if (!o.fam && b[i].fam) only2++; });
console.log(`paired vs live: new-only right ${only2}, live-only right ${only1}, McNemar chi2 ${((Math.abs(only1 - only2) - 1) ** 2 / Math.max(1, only1 + only2)).toFixed(2)}`);
const perCrate = {}; b.forEach((o, i) => { const k = o.r.crate; perCrate[k] ??= [0, 0, 0]; perCrate[k][2]++; if (o.fam) perCrate[k][1]++; if (a[i].fam) perCrate[k][0]++; });
console.log('per crate live/new/n', JSON.stringify(perCrate));
const conf = {}; for (const o of b) if (!o.fam) { const k = `${o.r.family} -> ${o.x.family}`; conf[k] = (conf[k] || 0) + 1; }
console.log('confusions', JSON.stringify(Object.entries(conf).sort((p, q) => q[1] - p[1]).slice(0, 8)));
// a few example reasons
if (process.argv.includes('--examples')) for (const o of b.filter((_, i) => [3, 40, 77, 101].includes(i))) { const rs = reasonsV2(o.x, o.r.base, model, graph); console.log('\n' + o.r.key.split('|').at(-1), '| label:', o.r.crate, '| read:', o.x.label, o.x.confidencePct + '%', o.x.confidence, '| near:', o.x.nearMisses.map((n) => n.name + ' ' + n.fit + '%').join(', ')); console.log('  ' + rs.lines.join('\n  ')); }
fs.writeFileSync('/tmp/bench_rows.json', JSON.stringify(b.map((o) => ({ key: o.r.key, crate: o.r.crate, fam: o.fam, read: o.x.label, conf: o.x.confidencePct }))));
