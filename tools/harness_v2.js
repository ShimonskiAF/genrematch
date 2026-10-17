// Full v2 read in Node, same code path as the browser: node tools/harness_v2.js file.mp3 [...]
// Uses the vendored tfjs (vendor/tfjs) + YAMNet (models/yamnet) on the WASM backend.
import fs from 'node:fs'; import path from 'node:path'; import { analyse } from '../js/analyser.js'; import { groove, scaleGroove } from '../js/groove.js';
import { extractV2 } from '../js/features2.js'; import { windows16k, yamnetEmbedWindows } from '../js/melpath.js';
import { rankV2 } from '../js/rank2.js'; import { reasonsV2 } from '../js/reasons2.js';
import { decodeFile } from './decode.js'; import { loadYamnet } from './tf_node.js';
const root = new URL('..', import.meta.url).pathname;
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p)));
const P = J('data/genre_profiles.json').profiles, MODEL = J('data/model_v2.json'), GRAPH = J('data/atlas_graph.json');
let tf = null, model = null;
if (!process.env.NO_MEL) ({ tf, model } = await loadYamnet());
for (const file of process.argv.slice(2)) {
  const { samples, sampleRate } = decodeFile(file);
  const f = analyse(samples, sampleRate);
  if (!f.silent && f.bpm > 0) { f.groove = groove(samples, sampleRate, f.bpm); Object.assign(f, scaleGroove(f.groove)); }
  const x2 = f.silent ? null : extractV2(samples, sampleRate, f.bpm || 0);
  const mel = model && !f.silent ? await yamnetEmbedWindows(tf, model, windows16k(samples, sampleRate)) : null;
  const r = rankV2({ f, v2: x2?.v2, mel, profiles: P, model: MODEL, graph: GRAPH });
  const rs = reasonsV2(r, f, MODEL, GRAPH);
  if (process.env.DEBUG) console.log(JSON.stringify(r.trace.ood));
  console.log(`\n${path.basename(file)}\n  read   ${r.label}  ${r.super ?? ''} › ${r.family ?? ''}  ${r.confidencePct}% ${r.confidence}${r.nearMisses?.length ? '  near: ' + r.nearMisses.map((n) => `${n.name} ${n.fit}%`).join(', ') : ''}\n  why    ${rs.lines.join('\n         ')}`);
}
