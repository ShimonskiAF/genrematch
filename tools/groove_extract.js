// node tools/groove_extract.js <list.json> > out.json   list: [{id, path, bpm, tile?}]
// tile: repeat a short loop until it covers ≥20 s (seamless loops), so every loop gets a full window.
import fs from 'node:fs';
import { groove } from '../js/groove.js'; import { decodeFile } from './decode.js';
const list = JSON.parse(fs.readFileSync(process.argv[2]));
const out = {};
for (const it of list) {
  try {
    let { samples, sampleRate } = decodeFile(it.path);
    if (it.tile && samples.length < 20 * sampleRate) { const reps = Math.ceil((20 * sampleRate) / samples.length); const t = new Float32Array(samples.length * reps); for (let r = 0; r < reps; r++) t.set(samples, r * samples.length); samples = t; }
    out[it.id] = groove(samples, sampleRate, it.bpm);
  } catch (e) { console.error('FAIL', it.id, e.message); }
}
process.stdout.write(JSON.stringify(out));
