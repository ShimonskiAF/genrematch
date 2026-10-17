// Re-run the analyser on every track in calibration/features.json (matched by basename under /workspace/uploads) to refresh raw windows.
import fs from 'node:fs'; import path from 'node:path';
import { analyse } from '../js/analyser.js'; import { decodeFile } from './decode.js';
const [idx, ...names] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(idx));
const out = {};
for (const n of names) { try { const { samples, sampleRate } = decodeFile(map[n]); const a = analyse(samples, sampleRate); out[n] = (a.raw || []).map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v === 'number'))); } catch (e) { console.error('FAIL', n, e.message); } }
process.stdout.write(JSON.stringify(out));
