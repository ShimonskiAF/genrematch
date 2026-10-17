// 5-fold crate-stratified CV on the TRAINING split only (holdout never touched). Coordinate search over weights.
import fs from 'node:fs';
import { WEIGHTS } from '../js/scoring.js';
import { fit } from './calibrate.js';
import { evaluate } from './evaluate.js';
import { labelFor, isHeldOut, buildHoldout, SKIP_FITTING } from './labels.js';
const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url)));
buildHoldout(T);
const train = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate) && !isHeldOut(t); });
const by = {}; for (const t of train) (by[labelFor(t.folder).crate] ??= []).push(t);
const fold = new Map(); for (const ts of Object.values(by)) ts.forEach((t, i) => fold.set(t, i % 5));
const cv = () => { let ok = 0; for (let k = 0; k < 5; k++) { const P = fit(train.filter((t) => fold.get(t) !== k)); ok += evaluate(P, train.filter((t) => fold.get(t) === k)).filter((r) => r.famOk).length; } return ok; };
const W0 = { ...WEIGHTS }; let best = cv(); console.log('start', best, '/', train.length);
const mult = [0, 0.5, 1.5, 2];
for (let pass = 0; pass < 2; pass++) for (const k of Object.keys(W0).filter((k) => k !== 'dynamics')) { // dynamics pinned: club-only data can't see what it does for played music
  const base = WEIGHTS[k]; let bk = base;
  for (const m of mult) { const v = Math.round((base === 0 ? m * 0.5 : base * m) * 100) / 100; if (v === base) continue; WEIGHTS[k] = v; const s = cv(); if (s > best) { best = s; bk = v; } }
  WEIGHTS[k] = bk; console.log(pass, k, bk, best);
}
console.log(JSON.stringify(WEIGHTS));
