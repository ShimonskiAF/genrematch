// Fair gate: live (10509fa profiles + weights) vs freshly fitted profiles on the SAME stratified holdout.
// node calibration/compare.js [livePROFILES.json] [--weights k=v,...]
import fs from 'node:fs';
import { WEIGHTS } from '../js/scoring.js';
import { fit } from './calibrate.js';
import { evaluate, summary } from './evaluate.js';
import { labelFor, isHeldOut, buildHoldout, SKIP_FITTING } from './labels.js';
const LIVE_W = { bpm: 1.2, energy: 1.0, brightness: 0.4, texture: 0.7, bass: 1.3, dynamics: 1.05, pulse: 0.9, fourFloor: 1.4, tresillo: 1.5, offbeat: 0.9, syncop: 0.8, backbeat: 1.1, tonal: 0, vocalMid: 0 };
const NEW_W = { ...WEIGHTS };
const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url)));
buildHoldout(T);
const usable = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate); });
const held = usable.filter(isHeldOut), train = usable.filter((t) => !isHeldOut(t));
const live = JSON.parse(fs.readFileSync(process.argv[2] || '/tmp/live_profiles.json')).profiles;
const run = (P, W, rows) => { Object.assign(WEIGHTS, W); return evaluate(P, rows); };
const perCrate = (rows) => { const m = {}; for (const r of rows) { m[r.crate] ??= [0, 0]; m[r.crate][1]++; if (r.famOk) m[r.crate][0]++; } return Object.fromEntries(Object.entries(m).map(([k, [a, b]]) => [k, `${a}/${b}`])); };
const L = run(live, LIVE_W, held);
const P = fit(train); const N = run(P, NEW_W, held);
const fam = (rs) => `${rs.filter((r) => r.famOk).length}/${rs.length} (${Math.round(100 * rs.filter((r) => r.famOk).length / rs.length)}%)`;
const unseen = (rs) => rs.filter((_, i) => !['cal', 'r2'].includes(held[i].root));
console.log('held', held.length, 'train', train.length);
console.log('LIVE family', fam(L), 'sub', summary(L).held.subgenre, '| on tracks live never saw:', fam(unseen(L)));
console.log('NEW  family', fam(N), 'sub', summary(N).held.subgenre, '| on tracks live never saw:', fam(unseen(N)));
console.log('per crate live', JSON.stringify(perCrate(L)));
console.log('per crate new ', JSON.stringify(perCrate(N)));
const conf = {}; for (const r of N) if (!r.famOk) { const k = `${r.family} -> ${r.gotFam}`; conf[k] = (conf[k] || 0) + 1; }
console.log('new confusions', JSON.stringify(Object.entries(conf).sort((a, b) => b[1] - a[1])));
let b = 0, c = 0; L.forEach((r, i) => { if (r.famOk && !N[i].famOk) b++; if (!r.famOk && N[i].famOk) c++; });
console.log(`paired: new-only right ${c}, live-only right ${b}, McNemar chi2 ${((Math.abs(b - c) - 1) ** 2 / Math.max(1, b + c)).toFixed(2)}`);
