// Layer 1, R&B family: learn groove profiles for R&B / Soul / Neo-Soul / Alt R&B from drum loops.
// node calibration/layers/drums_loops.js <selected.json> <loop_groove.json>
import fs from 'node:fs';
import { GROOVE_KEYS } from '../../js/groove.js';
import { groupedHoldout, groupOf, hash, fitGauss, predict, fStat } from './groove_lib.js';
const sel = JSON.parse(fs.readFileSync(process.argv[2])), G = JSON.parse(fs.readFileSync(process.argv[3]));
const rows = sel.filter((s) => G[s.id]).map((s) => ({ ...s, g: G[s.id] }));
const held = groupedHoldout(rows, 0.2);
const train = rows.filter((r) => !held.has(r.id)), test = rows.filter((r) => held.has(r.id));
const cls = (r) => r.genre;
// rank features on training loops only
const rank = GROOVE_KEYS.map((k) => [k, fStat(train, k, cls)]).sort((a, b) => b[1] - a[1]);
// pick how many top features by grouped 5-fold CV on the training split
const folds = (r) => hash(groupOf(r.file) + r.genre) % 5;
const cv = (keys) => { let ok = 0; for (let f = 0; f < 5; f++) { const tr = train.filter((r) => folds(r) !== f), te = train.filter((r) => folds(r) === f); const m = fitGauss(tr, keys, cls); ok += te.filter((r) => predict(m, r.g) === r.genre).length; } return ok / train.length; };
const tries = []; for (let k = 3; k <= GROOVE_KEYS.length; k++) tries.push([k, cv(rank.slice(0, k).map((x) => x[0]))]);
const [bestK] = tries.reduce((a, b) => (b[1] > a[1] + 1e-9 ? b : a));
const keys = rank.slice(0, bestK).map((x) => x[0]);
const model = fitGauss(train, keys, cls);
const conf = {}; let ok = 0;
for (const r of test) { const p = predict(model, r.g); if (p === r.genre) ok++; conf[r.genre] ??= {}; conf[r.genre][p] = (conf[r.genre][p] || 0) + 1; }
const per = Object.fromEntries(Object.entries(conf).map(([g, m]) => [g, `${m[g] || 0}/${Object.values(m).reduce((a, b) => a + b, 0)}`]));
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const medians = {}; for (const g of [...new Set(rows.map(cls))]) medians[g] = Object.fromEntries(GROOVE_KEYS.map((k) => [k, Math.round(1000 * med(rows.filter((r) => r.genre === g).map((r) => r.g[k]))) / 1000]));
const counts = {}; for (const r of rows) counts[r.genre] = (counts[r.genre] || 0) + 1;
const result = { counts, trainN: train.length, heldN: test.length, featureRank: rank.map(([k, f]) => [k, Math.round(f * 10) / 10]), cvByK: tries.map(([k, a]) => [k, Math.round(a * 1000) / 10]), keys, held: { acc: `${ok}/${test.length}`, perGenre: per, confusion: conf }, medians, model };
console.log(JSON.stringify(result, null, 1));
