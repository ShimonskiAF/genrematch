// Reproduce live (020cef0) on the 126 holdout: base features + groove reads, data/genre_profiles.json.
import fs from 'node:fs';
import { classify } from '../../js/scoring.js';
import { scaleGroove } from '../../js/groove.js';
import { featuresFromRaw } from '../evaluate.js';
import { labelFor, buildHoldout, isHeldOut, SKIP_FITTING } from '../labels.js';
const T = JSON.parse(fs.readFileSync(new URL('../features.json', import.meta.url)));
const GT = JSON.parse(fs.readFileSync(new URL('../layers/groove_tracks.json', import.meta.url)));
const P = JSON.parse(fs.readFileSync(new URL('../../data/genre_profiles.json', import.meta.url))).profiles;
buildHoldout(T);
const usable = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate); });
const held = usable.filter(isHeldOut);
const out = held.map((t) => { const f = featuresFromRaw(t.raw); const g = GT[`${t.root}|${t.folder}|${t.file}`]; if (g) Object.assign(f, scaleGroove(g)); const r = classify(f, P); const lab = labelFor(t.folder);
  return { key: `${t.root}|${t.folder}|${t.file}`, crate: lab.crate, family: lab.family, sub: lab.sub, got: r.family, gotSub: r.primary?.id, conf: r.confidence, top3: (r.ranked || []).slice(0, 3).map((x) => x.id), fams: [...new Set((r.ranked || []).map((x) => x.family))].slice(0, 3) }; });
const n = out.length, c = (f) => out.filter(f).length;
console.log('held', n, 'family', c((r) => r.got === r.family), 'sub', c((r) => r.gotSub === r.sub), 'top2fam', c((r) => r.fams.slice(0, 2).includes(r.family)), 'top3fam', c((r) => r.fams.includes(r.family)), 'top3sub', c((r) => r.top3.includes(r.sub)));
for (const k of ['high', 'medium', 'low']) { const s = out.filter((r) => r.conf === k); console.log(k, s.length, s.filter((r) => r.got === r.family).length); }
fs.writeFileSync('/tmp/baseline_rows.json', JSON.stringify(out));
