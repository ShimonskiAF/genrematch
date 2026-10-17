// Folder (rekordbox crate) -> expected family and subgenre profile id. Her DJ intent, not a hard truth.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
export const LABELS = {
  'Speed House': { family: 'House', sub: 'speedhouse' },
  'Bass House': { family: 'House', sub: 'basshouse' },
  'Tech House': { family: 'House', sub: 'techhouse' },
  'House Dance': { family: 'House', sub: 'house' },
  'Amapiano': { family: 'House', sub: 'amapiano' },
  'Moombahton': { family: 'House', sub: 'moombahton' },
  'Peak Time Techno': { family: 'Techno', sub: 'peaktechno' },
  'Hip Hop': { family: 'Rap', sub: 'hiphop' },
  'Trap Hip Hop': { family: 'Rap', sub: 'trap' },
  'Phonk': { family: 'Rap', sub: 'phonk' },
  'G-Walk': { family: 'Rap', sub: 'gwalk' },
  'Jersey Club': { family: 'Breakbeat', sub: 'jerseyclub' },
  'R&B Soul': { family: "Rhythm 'n' Blues", sub: 'rnb' },
  'Afrobeats': { family: 'World Pop', sub: 'afrobeats' },
  'Baile Funk': { family: 'World Latin', sub: 'bailefunk' },
  'Reggae': { family: 'Jamaican', sub: 'reggae' },
  'Reggaeton': { family: 'Jamaican', sub: 'reggaeton' },
  'DnB': { family: "Drum 'n' Bass", sub: 'dnb' },
  // Round 6 (Shima, Oct 2026): folders under root r6. Peak Time Techno and Phonk join the existing crates.
  'Trap': { family: 'Rap', sub: 'trap' },
  'Soul': { family: "Rhythm 'n' Blues", sub: 'soul' },
  'Neo-Soul': { family: "Rhythm 'n' Blues", sub: 'neosoul' },
  'Alt R&B': { family: "Rhythm 'n' Blues", sub: 'altrnb' },
  'Deep House': { family: 'House', sub: 'deephouse' },
  'Country': { family: 'Country', sub: 'country' },
  'Cinematic': { family: 'Classical', sub: 'cinematic' },
  'Open Format Mashups': { family: 'Rap', sub: null },
  'Acapellas': { family: null, sub: null },
};
export const SKIP_FITTING = new Set(['Acapellas', 'Open Format Mashups']);
export const MIN_FIT = 3;
export const labelFor = (folder) => {
  const leaf = folder.split('/').at(-1).replace(/^\d+\s+/, '');
  return { crate: leaf, ...(LABELS[leaf] || { family: null, sub: null }) };
};
const hash = (t) => parseInt(createHash('sha1').update(labelFor(t.folder).crate + '\0' + t.file).digest('hex').slice(0, 8), 16);
// Holdouts.
// 1) The original 126 tracks (rounds 1-5), frozen in holdout_v1.json so later rounds can't reshuffle them.
// 2) Round 6 (root r6): its own stratified ~30% per folder, lowest hash first, at least 1 when n >= 3.
// isHeldOut = excluded from every fit (either holdout). isHeldV1 / isHeldR6 pick one for benchmarks.
const FROZEN = new Set(JSON.parse(fs.readFileSync(new URL('./holdout_v1.json', import.meta.url))).keys);
export const R6_ROOT = 'r6', R6_FRAC = 0.3;
const keyOf = (t) => `${t.root}|${t.folder}|${t.file}`;
let _held = null, _r6 = null;
export function buildHoldout(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const lab = labelFor(t.folder);
    if (t.root !== R6_ROOT || !lab.family || SKIP_FITTING.has(lab.crate)) continue;
    if (!by.has(lab.crate)) by.set(lab.crate, []);
    by.get(lab.crate).push(t);
  }
  const r6 = new Set();
  for (const [, list] of by) {
    const sorted = [...list].sort((a, b) => hash(a) - hash(b));
    const n = Math.max(list.length >= 3 ? 1 : 0, Math.round(list.length * R6_FRAC));
    for (const t of sorted.slice(0, n)) r6.add(keyOf(t));
  }
  _held = FROZEN; _r6 = r6;
  return new Set([...FROZEN, ...r6]);
}
const need = () => { if (!_held) throw new Error('call buildHoldout(tracks) once before isHeldOut'); };
export function isHeldV1(t) { need(); return _held.has(keyOf(t)); }
export function isHeldR6(t) { need(); return _r6.has(keyOf(t)); }
export function isHeldOut(t) { need(); return _held.has(keyOf(t)) || _r6.has(keyOf(t)); }
