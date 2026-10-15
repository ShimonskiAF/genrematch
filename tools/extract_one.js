import fs from 'node:fs'; import path from 'node:path';
import { analyse } from '../js/analyser.js'; import { decodeFile } from './decode.js';
const [root, ...files] = process.argv.slice(2);
const out = [];
for (const f of files) {
  try {
    const { samples, sampleRate } = decodeFile(f);
    const a = analyse(samples, sampleRate);
    const { raw, ...feat } = a;
    const clean = (raw || []).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number')));
    const rel = path.relative(root, f).split(path.sep);
    out.push({ file: rel.at(-1), folder: rel.slice(0, -1).join('/'), root: path.basename(root), features: feat, raw: clean });
  } catch (e) { console.error('FAIL', f, e.message); }
}
process.stdout.write(JSON.stringify(out));
