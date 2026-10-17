// Batch v2 features for calibration tracks: node tools/extract_v2.js <shard> <nShards> > part.json
import fs from 'node:fs';
import { extractV2 } from '../js/features2.js'; import { decodeFile } from './decode.js';
const [shard, nsh] = process.argv.slice(2).map(Number);
const T = JSON.parse(fs.readFileSync(new URL('../calibration/features.json', import.meta.url)));
const PATHS = JSON.parse(fs.readFileSync(process.env.V2_PATHS || '/workspace/v2_paths.json'));
const DONE = process.env.V2_DONE ? JSON.parse(fs.readFileSync(process.env.V2_DONE)) : {};
const out = {};
T.forEach((t, i) => {
  if (i % nsh !== shard) return;
  const key = `${t.root}|${t.folder}|${t.file}`, p = PATHS[key];
  if (!p || DONE[key]) return;
  try { const { samples, sampleRate } = decodeFile(p); out[key] = extractV2(samples, sampleRate, t.features.bpm || 0); }
  catch (e) { console.error('FAIL', p, e.message.slice(0, 100)); }
});
process.stdout.write(JSON.stringify(out));
