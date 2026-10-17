// node tools/fof_extract.js <shard> <n> > part.json  -> {key: fourOnFloorB} for every track in /workspace/v2_paths.json
import fs from 'node:fs'; import { decodeFile } from './decode.js'; import { fourOnFloorB } from '../js/fourfloor.js';
const [shard, n] = process.argv.slice(2).map(Number), P = JSON.parse(fs.readFileSync('/workspace/v2_paths.json')), out = {};
Object.keys(P).forEach((k, i) => { if (i % n !== shard) return; try { const { samples, sampleRate } = decodeFile(P[k]); out[k] = +fourOnFloorB(samples, sampleRate).toFixed(5); } catch (e) { console.error(k, e.message); } });
process.stdout.write(JSON.stringify(out));
