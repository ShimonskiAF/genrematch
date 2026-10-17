// YAMNet embeddings for calibration tracks via the shipped path (decode 44.1k -> windows16k -> YAMNet f16).
// node tools/mel_extract.js <paths.json {key: file}> <shard> <nShards> > part.json
import fs from 'node:fs';
import { decodeFile } from './decode.js'; import { loadYamnet } from './tf_node.js';
import { windows16k, yamnetEmbedWindows } from '../js/melpath.js';
const [pathsFile, shard = 0, nsh = 1] = process.argv.slice(2);
const PATHS = JSON.parse(fs.readFileSync(pathsFile)), keys = Object.keys(PATHS).sort(), out = {};
const { tf, model } = await loadYamnet();
for (let i = +shard; i < keys.length; i += +nsh) {
  try { const { samples, sampleRate } = decodeFile(PATHS[keys[i]]); const r = await yamnetEmbedWindows(tf, model, windows16k(samples, sampleRate)); out[keys[i]] = { emb: r.emb.map((v) => +v.toFixed(4)), scores: r.scores.map((v) => +v.toFixed(5)) }; }
  catch (e) { console.error('FAIL', keys[i], e.message.slice(0, 80)); }
}
process.stdout.write(JSON.stringify(out));
