// Folder (rekordbox crate) -> expected family and subgenre profile id. Her DJ intent, not a hard truth.
import { createHash } from 'node:crypto';
export const LABELS = {
  'Speed House': { family: 'House', sub: 'speedhouse' },
  'Bass House': { family: 'House', sub: 'basshouse' },
  'Tech House': { family: 'House', sub: 'techhouse' },
  'Amapiano': { family: 'House', sub: 'amapiano' },
  'Moombahton': { family: 'House', sub: 'moombahton' },
  'Peak Time Techno': { family: 'Techno', sub: 'peaktechno' },
  'Hip Hop': { family: 'Rap', sub: 'hiphop' },
  'Phonk': { family: 'Rap', sub: 'phonk' },
  'G-Walk': { family: 'Rap', sub: 'gwalk' },
  'Jersey Club': { family: 'Breakbeat', sub: 'jerseyclub' },
  'R&B Soul': { family: "Rhythm 'n' Blues", sub: 'rnb' },
  'Afrobeats': { family: 'World Pop', sub: 'afrobeats' },
  'Baile Funk': { family: 'World Latin', sub: 'bailefunk' },
  'Reggae': { family: 'Jamaican', sub: 'reggae' },
  'Reggaeton': { family: 'Jamaican', sub: 'reggaeton' },
  'DnB': { family: "Drum 'n' Bass", sub: 'dnb' },
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
// Stratified ~25% holdout: within each crate, hold out the lowest-hash quartile (at least 1 when n≥4).
let _held = null;
export function buildHoldout(tracks) {
  const by = new Map();
  for (const t of tracks) {
    const lab = labelFor(t.folder);
    if (!lab.family || SKIP_FITTING.has(lab.crate)) continue;
    if (!by.has(lab.crate)) by.set(lab.crate, []);
    by.get(lab.crate).push(t);
  }
  const held = new Set();
  for (const [, list] of by) {
    const sorted = [...list].sort((a, b) => hash(a) - hash(b));
    const n = Math.max(list.length >= 4 ? 1 : 0, Math.floor(list.length * 0.25));
    for (const t of sorted.slice(0, n)) held.add(t.folder + '/' + t.file);
  }
  _held = held;
  return held;
}
export function isHeldOut(t) {
  if (!_held) throw new Error('call buildHoldout(tracks) once before isHeldOut');
  return _held.has(t.folder + '/' + t.file);
}
