// Leave-one-out tuning on the TRAINING split only (held-out tracks never seen).
import fs from 'node:fs';
import { WEIGHTS } from '../js/scoring.js';
import { fit, setCfg } from './calibrate.js';
import { evaluate } from './evaluate.js';
import { isHeldOut } from './labels.js';
const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url))).filter((t) => !isHeldOut(t.file));
const W0 = { ...WEIGHTS };
const loo = () => { let fam = 0, sub = 0; for (let i = 0; i < T.length; i++) { const P = fit(T.filter((_, j) => j !== i)); const r = evaluate(P, [T[i]])[0]; fam += r.famOk; sub += !!r.subOk; } return fam + 0.5 * sub; };
const grid = { SHRINK: [0, 0.25, 0.5], BPM_SD: [0.05, 0.1, 0.2], bpm: [0.6, 1, 1.6], texture: [0.5, 1, 1.5], brightness: [0.5, 1, 1.5], dynamics: [0.5, 1, 1.5], pulse: [0.5, 1, 1.5] };
const keys = Object.keys(grid); let best = { s: -1 }; const all = [];
const rec = (i, c) => {
  if (i === keys.length) {
    setCfg({ SHRINK: c.SHRINK, BPM_SD: c.BPM_SD });
    for (const k of ['bpm', 'texture', 'brightness', 'dynamics', 'pulse']) WEIGHTS[k] = W0[k] * c[k];
    const s = loo(); all.push({ s, c: { ...c } }); if (s > best.s) best = { s, c: { ...c } }; return;
  }
  for (const v of grid[keys[i]]) rec(i + 1, { ...c, [keys[i]]: v });
};
rec(0, {}); const dev = (c) => Object.entries(c).reduce((a, [k, v]) => a + Math.abs(Math.log(v || 0.01) - Math.log({ SHRINK: 0.25, BPM_SD: 0.1 }[k] ?? 1)), 0); const top = all.filter((x) => x.s >= best.s - 0.5).sort((a, b) => b.s - a.s || dev(a.c) - dev(b.c)); console.log(top.length, JSON.stringify(top.slice(0, 6)));
