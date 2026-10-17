// node tools/fof_extract_paths.js <paths.json {key: file}> > part.json  (fof_extract.js for a subset of paths; used for round 7)
import fs from 'node:fs'; import { decodeFile } from './decode.js'; import { fourOnFloorB } from '../js/fourfloor.js';
const P = JSON.parse(fs.readFileSync(process.argv[2])), out = {};
for (const k of Object.keys(P)) { try { const { samples, sampleRate } = decodeFile(P[k]); out[k] = +fourOnFloorB(samples, sampleRate).toFixed(5); } catch (e) { console.error(k, e.message); } }
process.stdout.write(JSON.stringify(out));
