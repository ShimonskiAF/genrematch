// Fit genre centres to labelled crates. Training split only. node calibration/calibrate.js [--write]
import fs from 'node:fs';
import { FEATURES } from '../js/analyser.js';
import { featuresFromRaw, evaluate, summary } from './evaluate.js';
import { labelFor, isHeldOut, buildHoldout, SKIP_FITTING, MIN_FIT } from './labels.js';
const K = FEATURES.filter((k) => k !== 'bpm');
const r2 = (x) => Math.round(x * 100) / 100;
const before = JSON.parse(fs.readFileSync(new URL('./genre_profiles.before.json', import.meta.url)));
const T = JSON.parse(fs.readFileSync(new URL('./features.json', import.meta.url)));
buildHoldout(T);
export const CFG = { SHRINK: 0, BPM_SD: 0.15, SPREAD_FLOOR: 0.15 };
let { SHRINK, BPM_SD, SPREAD_FLOOR } = CFG;
export const setCfg = (c) => ({ SHRINK, BPM_SD, SPREAD_FLOOR } = { ...CFG, ...c });

// Atlas links and family for every fitted subgenre.
const FIT_META = {
  speedhouse: { name: 'Speed House', family: 'House', atlas_ids: ['hou09', 'hou05'], anchor: 140 },
  basshouse: { name: 'Bass House', family: 'House', atlas_ids: ['hou09', 'hou10', 'brb10'], anchor: 128 },
  house: { name: 'House', family: 'House', atlas_ids: ['hou01', 'hou04'], anchor: 124 },
  techhouse: { name: 'Tech House', family: 'House', atlas_ids: ['tec06', 'hou07'], anchor: 126 },
  peaktechno: { name: 'Peak Time Techno', family: 'Techno', atlas_ids: ['tec01', 'tec04'], anchor: 130 },
  moombahton: { name: 'Moombahton', family: 'House', atlas_ids: ['hou11'], anchor: 110 },
  amapiano: { name: 'Amapiano', family: 'House', atlas_ids: ['x_amapiano'], anchor: 112 },
  hiphop: { name: 'Hip Hop', family: 'Rap', atlas_ids: ['rap02', 'rap01', 'rap08'], anchor: 95 },
  trap: { name: 'Trap Hip Hop', family: 'Rap', atlas_ids: ['rap09'], anchor: 140 },
  phonk: { name: 'Phonk', family: 'Rap', atlas_ids: ['x_phonk'], anchor: 140 },
  gwalk: { name: 'G-Walk', family: 'Rap', atlas_ids: ['x_gwalk', 'rap03', 'rap04'], anchor: 100 },
  jerseyclub: { name: 'Jersey Club', family: 'Breakbeat', atlas_ids: ['x_jersey_club', 'hou08'], anchor: 140 },
  rnb: { name: 'R&B / Soul', family: "Rhythm 'n' Blues", atlas_ids: ['rnb12', 'rnb13', 'rap10'], anchor: 90 },
  afrobeats: { name: 'Afrobeats', family: 'World Pop', atlas_ids: ['x_afrobeats', 'woC10'], anchor: 105 },
  bailefunk: { name: 'Baile Funk', family: 'World Latin', atlas_ids: ['x_baile_funk', 'x_dembow', 'rap03'], anchor: 130 },
  reggae: { name: 'Reggae', family: 'Jamaican', atlas_ids: ['jam04', 'jam08'], anchor: 80 },
  reggaeton: { name: 'Reggaeton', family: 'Jamaican', atlas_ids: ['jam11', 'x_dembow'], anchor: 95 },
  dnb: { name: 'Drum & Bass', family: "Drum 'n' Bass", atlas_ids: ['dnb01', 'dnb05'], anchor: 174 },
};

// Convert old-divisor centres to the new scales; rhythm stays neutral (0.5) for estimates.
const oldToRaw = { energy: (v) => v * 24 - 30, brightness: (v) => v * 3500 + 500, bass: (v) => v * 0.45, dynamics: (v) => v * 20, pulse: (v) => v * 8 };
import { scaleRaw } from '../js/analyser.js';
function convert(f) {
  const raw = { bpm: f.bpm, rmsDb: oldToRaw.energy(f.energy), centroid: oldToRaw.brightness(f.brightness), flatness: 1, bassShare: oldToRaw.bass(f.bass), dynRangeDb: oldToRaw.dynamics(f.dynamics), onsetsPerSec: oldToRaw.pulse(f.pulse),
    fourFloor: 1.5, tresillo: 1.0, offbeat: 0.8, syncop: 0.8, backbeat: 1.2 };
  const s = scaleRaw(raw);
  s.texture = 0.15 + 0.5 * f.texture;
  for (const k of ['fourFloor', 'tresillo', 'offbeat', 'syncop', 'backbeat']) s[k] = 0.5;
  // No estimate for the harmonic features (tonal, vocalMid): leave them out so unfitted profiles skip them.
  return Object.fromEntries([['bpm', f.bpm], ...K.filter((k) => !['tonal', 'vocalMid'].includes(k)).map((k) => [k, r2(s[k])])]);
}
const fold = (b, a) => [b / 2, b, b * 2].reduce((x, y) => (Math.abs(Math.log2(y / a)) < Math.abs(Math.log2(x / a)) ? y : x));
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (a) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };

export function fit(train) {
  const rows = train.map((t) => ({ lab: labelFor(t.folder), f: featuresFromRaw(t.raw) })).filter((r) => r.lab.sub && !SKIP_FITTING.has(r.lab.crate));
  const club = Object.fromEntries(K.map((k) => [k, rows.reduce((a, r) => a + r.f[k], 0) / Math.max(1, rows.length)]));
  const profiles = before.profiles.map((p) => ({ ...p, features: convert(p.features), status: 'estimate, rescaled' }));
  const counts = {};
  for (const r of rows) counts[r.lab.sub] = (counts[r.lab.sub] || 0) + 1;
  for (const [id, meta] of Object.entries(FIT_META)) {
    const mine = rows.filter((r) => r.lab.sub === id);
    if (mine.length < MIN_FIT) continue;
    const bs = mine.map((r) => fold(r.f.bpm, meta.anchor)), c = med(bs);
    const features = { bpm: Math.round(c) };
    const bpmSd = Math.sqrt(bs.reduce((a, b) => a + Math.log2(b / c) ** 2, 0) / bs.length);
    features.bpmSpread = r2(Math.min(3, Math.max(1, bpmSd / BPM_SD)));
    const spread = {};
    for (const k of K) {
      const vals = mine.map((r) => r.f[k]);
      const centre = med(vals);
      features[k] = r2((1 - SHRINK) * centre + SHRINK * club[k]);
      spread[k] = r2(Math.max(SPREAD_FLOOR, sd(vals)));
    }
    features.spread = spread;
    const p = { id, name: meta.name, family: meta.family, atlas_ids: meta.atlas_ids, features, status: `calibrated on ${mine.length} labelled track${mine.length > 1 ? 's' : ''}` };
    const i = profiles.findIndex((x) => x.id === id);
    if (i >= 0) profiles[i] = p; else profiles.push(p);
  }
  return profiles;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const usable = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate); });
  const train = usable.filter((t) => !isHeldOut(t));
  const profiles = fit(train);
  const rows = evaluate(profiles, usable);
  for (const r of rows) console.log(`${r.held ? 'H' : ' '} ${r.famOk ? '✓' : '✗'}${r.subOk ? '✓' : r.subOk === null ? '·' : '✗'} ${r.file.slice(0, 36).padEnd(36)} ${r.crate.padEnd(18)} ${String(r.read).slice(0, 22).padEnd(22)} [${r.gotSub} ${r.fit}]`);
  console.log(JSON.stringify(summary(rows)));
  console.log('profiles', profiles.length, 'train', train.length, 'held', usable.length - train.length);
  if (process.argv.includes('--write')) {
    const out = { note: 'Genre centres for GenreMatch features (7 acoustic + 5 rhythm). Club/urban subgenres fitted to labelled DJ-library tracks (training split, shrunk toward the pooled mean, with per-feature spread). Estimates rescaled. See calibration/.', profiles };
    fs.writeFileSync(new URL('../data/genre_profiles.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
    console.log('wrote data/genre_profiles.json');
  }
}
