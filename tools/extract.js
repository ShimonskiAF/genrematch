// Extract features for the calibration set: node tools/extract.js <dir...> > calibration/features.json
import fs from 'node:fs'; import path from 'node:path';
import { analyse } from '../js/analyser.js'; import { decodeFile } from './decode.js';
const roots = process.argv.slice(2);
if (!roots.length) { console.error('usage: extract.js <dir> [dir...]'); process.exit(1); }
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const out = [];
for (const root of roots) {
  for (const f of walk(root).filter((f) => /\.(mp3|wav|m4a|aiff?)$/i.test(f)).sort()) {
    try {
      const { samples, sampleRate } = decodeFile(f); const { raw, ...feat } = analyse(samples, sampleRate);
      const rel = path.relative(root, f).split(path.sep);
      out.push({ file: rel.at(-1), folder: rel.slice(0, -1).join('/'), root: path.basename(root), features: feat, raw });
      console.error(`[${out.length}] ${feat.silent ? 'SILENT' : Math.round(feat.bpm) + 'bpm'} ${rel.at(-1).slice(0, 50)}`);
    } catch (e) { console.error('FAIL', f, e.message); }
  }
}
console.log(JSON.stringify(out, null, 1));
