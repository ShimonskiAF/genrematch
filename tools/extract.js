// Extract features for the calibration set: node tools/extract.js <dir> > calibration/features.json
import fs from 'node:fs'; import path from 'node:path';
import { analyse } from '../js/analyser.js'; import { decodeFile } from './decode.js';
const root = process.argv[2]; const out = [];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(root).filter((f) => /\.(mp3|wav|m4a|aiff?)$/i.test(f)).sort()) {
  const { samples, sampleRate } = decodeFile(f); const { raw, ...feat } = analyse(samples, sampleRate);
  const rel = path.relative(root, f).split(path.sep);
  out.push({ file: rel.at(-1), folder: rel.slice(0, -1).join('/'), features: feat, raw });
  console.error(rel.at(-1).slice(0, 40), JSON.stringify(feat));
}
console.log(JSON.stringify(out, null, 1));
