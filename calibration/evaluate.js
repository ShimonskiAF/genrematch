import fs from 'node:fs';
import { scaleRaw, FEATURES, voteTempo } from '../js/analyser.js';
import { classify } from '../js/scoring.js';
import { labelFor, isHeldOut, buildHoldout, SKIP_FITTING } from './labels.js';
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const oldScale = (r) => ({ bpm: r.bpm, energy: Math.min(1, Math.max(0, (r.rmsDb + 30) / 24)), brightness: Math.min(1, Math.max(0, (r.centroid - 500) / 3500)), texture: Math.min(1, Math.max(0, r.flatness / 0.3)), bass: Math.min(1, Math.max(0, r.bassShare / 0.45)), dynamics: Math.min(1, Math.max(0, r.dynRangeDb / 20)), pulse: Math.min(1, Math.max(0, r.onsetsPerSec / 8)) });
export function featuresFromRaw(raws, scaler = scaleRaw) {
  const w = raws.map(scaler), out = { silent: false };
  for (const k of FEATURES) { const v = w.map((r) => r[k]).filter((x) => k !== 'bpm' || x > 0); out[k] = Math.round((v.length ? med(v) : 0) * 100) / 100; }
  out.bpm = Math.round(voteTempo(w.map((r) => r.bpm))); return out;
}
export function evaluate(profiles, tracks, scaler) {
  return tracks.map((t) => {
    const lab = labelFor(t.folder), f = featuresFromRaw(t.raw, scaler), r = classify(f, profiles);
    return { file: t.file, crate: lab.crate, family: lab.family, sub: lab.sub, held: isHeldOut(t), f, read: r.label, gotFam: r.family, gotSub: r.primary?.id, conf: r.confidence, fit: r.primary?.fit,
      famOk: !!lab.family && r.family === lab.family, subOk: lab.sub ? r.primary?.id === lab.sub : null };
  });
}
export function summary(rows) {
  const s = (rs) => { const sub = rs.filter((r) => r.subOk !== null); return { n: rs.length, family: `${rs.filter((r) => r.famOk).length}/${rs.length}`, familyPct: rs.length ? rs.filter((r) => r.famOk).length / rs.length : 0, subgenre: `${sub.filter((r) => r.subOk).length}/${sub.length}`, subPct: sub.length ? sub.filter((r) => r.subOk).length / sub.length : 0 }; };
  return { all: s(rows), train: s(rows.filter((r) => !r.held)), held: s(rows.filter((r) => r.held)) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const P = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../data/genre_profiles.json', import.meta.url))).profiles;
  const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url)));
buildHoldout(T);
  const rows = evaluate(P, T, process.argv[3] === 'old' ? oldScale : undefined);
  for (const r of rows) console.log(`${r.held ? 'H' : ' '} ${r.famOk ? '✓' : '✗'}${r.subOk ? '✓' : r.subOk === null ? '·' : '✗'} ${r.file.slice(0, 40).padEnd(40)} ${r.crate.padEnd(18)} ${String(r.read).slice(0, 24)}`);
  console.log(JSON.stringify(summary(rows)));
}
