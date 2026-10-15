// Fit genre centres to the labelled crates (training split only), convert the
// remaining estimate profiles to the new feature scales, write data/genre_profiles.json.
// node calibration/calibrate.js [--write]
import fs from 'node:fs';
import { scaleRaw } from '../js/analyser.js';
import { featuresFromRaw, evaluate, summary } from './evaluate.js';
import { labelFor, isHeldOut } from './labels.js';
const K = ['energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse'];
const r2 = (x) => Math.round(x * 100) / 100;
const before = JSON.parse(fs.readFileSync(new URL('./genre_profiles.before.json', import.meta.url)));
const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url)));
export const CFG = { SHRINK: 0.25, BPM_SD: 0.2 };
let { SHRINK, BPM_SD } = CFG;
export const setCfg = (c) => ({ SHRINK, BPM_SD } = { ...CFG, ...c });
const _ = 0; // pull each fitted centre 25% toward the pooled club mean (avoids fitting 2-3 tracks exactly)

// 1. Convert estimate centres from the old divisors to the new scales via the raw quantity.
const oldToRaw = { energy: (v) => v * 24 - 30, brightness: (v) => v * 3500 + 500, bass: (v) => v * 0.45, dynamics: (v) => v * 20, pulse: (v) => v * 8 };
function convert(f) {
  const raw = { bpm: f.bpm, rmsDb: oldToRaw.energy(f.energy), centroid: oldToRaw.brightness(f.brightness), flatness: 1, bassShare: oldToRaw.bass(f.bass), dynRangeDb: oldToRaw.dynamics(f.dynamics), onsetsPerSec: oldToRaw.pulse(f.pulse) };
  const s = scaleRaw(raw);
  s.texture = 0.15 + 0.5 * f.texture; // old texture never matched real audio; keep the ordering only
  return Object.fromEntries([['bpm', f.bpm], ...K.map((k) => [k, r2(s[k])])]);
}

// 2. Fitted subgenres: label id -> name, family, atlas ids, tempo anchor (used only to pick the octave).
const FIT = {
  speedhouse: { name: 'Speed House', family: 'House', atlas_ids: ['hou09', 'hou05'], anchor: 140 },
  basshouse: { name: 'Bass House', family: 'House', atlas_ids: ['hou09', 'hou10', 'brb10'], anchor: 128 },
  techhouse: { name: 'Tech House', family: 'House', atlas_ids: ['tec06', 'hou07'], anchor: 126 },
  peaktechno: { name: 'Peak Time Techno', family: 'Techno', atlas_ids: ['tec01', 'tec04'], anchor: 130 },
  moombahton: { name: 'Moombahton', family: 'House', atlas_ids: ['hou11'], anchor: 110 },
  hiphop: { anchor: 95 }, dnb: { anchor: 174 }, reggaeton: { anchor: 95 },
};
const fold = (b, a) => [b / 2, b, b * 2].reduce((x, y) => (Math.abs(Math.log2(y / a)) < Math.abs(Math.log2(x / a)) ? y : x));
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function fit(train) {
  const rows = train.map((t) => ({ lab: labelFor(t.folder), f: featuresFromRaw(t.raw) }));
  const club = Object.fromEntries(K.map((k) => [k, rows.reduce((a, r) => a + r.f[k], 0) / rows.length]));
  const profiles = before.profiles.map((p) => ({ ...p, features: convert(p.features), status: 'estimate, rescaled to calibrated feature scales' }));
  for (const [id, meta] of Object.entries(FIT)) {
    const mine = rows.filter((r) => r.lab.sub === id);
    if (!mine.length) continue;
    const bs = mine.map((r) => fold(r.f.bpm, meta.anchor)), c = med(bs);
    const sd = Math.sqrt(bs.reduce((a, b) => a + Math.log2(b / c) ** 2, 0) / bs.length);
    const features = { bpm: Math.round(c) };
    // tempo spread: crates that span tempos (hip hop, reggaeton) get a softer tempo term
    if (mine.length >= 2) features.bpmSpread = r2(Math.min(3, Math.max(1, sd / BPM_SD)));
    for (const k of K) features[k] = r2((1 - SHRINK) * (mine.reduce((a, r) => a + r.f[k], 0) / mine.length) + SHRINK * club[k]);
    const p = { id, ...(profiles.find((x) => x.id === id) || {}), ...Object.fromEntries(Object.entries(meta).filter(([k]) => k !== 'anchor')), features, status: `calibrated on ${mine.length} labelled track${mine.length > 1 ? 's' : ''}` };
    const i = profiles.findIndex((x) => x.id === id);
    if (i >= 0) profiles[i] = p; else profiles.push(p);
  }
  return profiles;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const train = T.filter((t) => !isHeldOut(t.file));
  const profiles = fit(train);
  const rows = evaluate(profiles, T);
  for (const r of rows) console.log(`${r.held ? 'H' : ' '} ${r.famOk ? '✓' : '✗'}${r.subOk ? '✓' : r.subOk === null ? '·' : '✗'} ${r.file.slice(0, 40).padEnd(40)} ${r.crate.padEnd(19)} ${r.read.padEnd(22)} [${r.gotSub} ${r.fit} ${r.conf}] bpm ${r.f.bpm}`);
  console.log(JSON.stringify(summary(rows)));
  if (process.argv.includes('--write')) {
    const out = { note: 'Genre centres for the 7 GenreMatch features. Club subgenres are fitted to labelled DJ-library tracks (training split, shrunk 25% toward the pooled mean); the rest are estimates rescaled to the calibrated feature scales. See calibration/.', profiles };
    fs.writeFileSync(new URL('../data/genre_profiles.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
    console.log('wrote data/genre_profiles.json', profiles.length);
  }
}
