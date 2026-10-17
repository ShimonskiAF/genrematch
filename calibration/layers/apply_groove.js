// Round 6+: add groove centres to the fitted profiles with the configuration drums_gate.js chose and shipped
// (calibration/layers/drums_rnb.json: scoring.keys). drums_gate.js itself can't be re-run as a gate any more:
// it compares v1 distance classifiers, and since the estimate shelves (prompt 1) that classifier collapses,
// so its pass/fail no longer measures groove. v2 reads groove directly as hand features; these centres only
// shape the v1 distance used for estimate shelves and the OOD distance gate.
// node calibration/layers/apply_groove.js   (after calibration/calibrate.js --write)
import fs from 'node:fs';
import { scaleGroove } from '../../js/groove.js';
import { labelFor, buildHoldout, isHeldOut, SKIP_FITTING } from '../labels.js';
const J = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const T = J('../features.json'), GT = J('./groove_tracks.json'), DOC = J('./drums_rnb.json'), out = new URL('../../data/genre_profiles.json', import.meta.url);
buildHoldout(T);
const keys = DOC.scoring.keys, prof = JSON.parse(fs.readFileSync(out));
const train = T.filter((t) => { const l = labelFor(t.folder); return l.sub && !SKIP_FITTING.has(l.crate) && !isHeldOut(t); });
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sdv = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
let n = 0;
prof.profiles = prof.profiles.map((p) => {
  if (!String(p.status).startsWith('calibrated')) return p;
  const mine = train.filter((t) => labelFor(t.folder).sub === p.id).map((t) => GT[`${t.root}|${t.folder}|${t.file}`]).filter(Boolean).map(scaleGroove);
  if (mine.length < 3) return p;
  const f = { ...p.features, spread: { ...(p.features.spread || {}) } };
  for (const k of keys) { const v = mine.map((g) => g[k]); f[k] = Math.round(100 * med(v)) / 100; f.spread[k] = Math.round(100 * Math.max(0.15, sdv(v))) / 100; }
  n++; return { ...p, features: f };
});
if (!/groove centres/.test(prof.note)) prof.note += ' Fitted profiles also carry groove centres (layer 1, drums: calibration/layers/drums_rnb.json).';
fs.writeFileSync(out, JSON.stringify(prof, null, 1) + '\n'); console.log('groove centres on', n, 'fitted profiles; keys', keys.join(','));
