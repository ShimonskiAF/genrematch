// Dump one row per usable track (labels, split, base+groove features, v2, mel summary) for model fitting.
import fs from 'node:fs';
import { scaleGroove } from '../../js/groove.js';
import { featuresFromRaw } from '../evaluate.js';
import { labelFor, buildHoldout, isHeldOut, isHeldV1, isHeldR6, SKIP_FITTING } from '../labels.js';
const T = JSON.parse(fs.readFileSync(new URL('../features.json', import.meta.url)));
const GT = JSON.parse(fs.readFileSync(new URL('../layers/groove_tracks.json', import.meta.url)));
const V2 = JSON.parse(fs.readFileSync(new URL('./features_v2.json', import.meta.url)));
const FOF = JSON.parse(fs.readFileSync(new URL('./fof_b.json', import.meta.url))); // js/fourfloor.js, tools/fof_extract.js
buildHoldout(T);
const rows = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate); }).map((t) => {
  const key = `${t.root}|${t.folder}|${t.file}`, lab = labelFor(t.folder), base = featuresFromRaw(t.raw), g = GT[key];
  if (g) Object.assign(base, scaleGroove(g));
  if (FOF[key] != null) base.fofB = FOF[key];
  return { key, ...lab, held: isHeldOut(t), heldV1: isHeldV1(t), heldR6: isHeldR6(t), base, v2: V2[key]?.v2, mel: V2[key]?.mel };
});
fs.writeFileSync(process.argv[2] || '/tmp/rows.json', JSON.stringify(rows));
console.log(rows.length, rows.filter((r) => r.heldV1).length, rows.filter((r) => r.heldR6).length, rows.filter((r) => !r.v2).length);
