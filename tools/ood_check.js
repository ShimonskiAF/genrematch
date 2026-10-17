// Sanity check on out-of-domain audio (no crate for these): node tools/ood_check.js <dir>
// Files named "<expected super-ish label> - title.ext". Prints the read and whether it landed in Electronic.
import fs from 'node:fs'; import path from 'node:path';
import { analyse } from '../js/analyser.js'; import { groove, scaleGroove } from '../js/groove.js';
import { extractV2 } from '../js/features2.js'; import { windows16k, yamnetEmbedWindows } from '../js/melpath.js';
import { rankV2 } from '../js/rank2.js'; import { decodeFile } from './decode.js'; import { loadYamnet } from './tf_node.js';
const root = new URL('..', import.meta.url).pathname, J = (p) => JSON.parse(fs.readFileSync(path.join(root, p)));
const P = J('data/genre_profiles.json').profiles, MODEL = J('data/model_v2.json'), GRAPH = J('data/atlas_graph.json');
const { tf, model } = await loadYamnet();
const dir = process.argv[2], rows = [];
for (const f of fs.readdirSync(dir).sort()) {
  const { samples, sampleRate } = decodeFile(path.join(dir, f)); const ft = analyse(samples, sampleRate);
  if (!ft.silent && ft.bpm > 0) Object.assign(ft, scaleGroove(groove(samples, sampleRate, ft.bpm)));
  const v2 = extractV2(samples, sampleRate, ft.bpm || 0)?.v2, mel = await yamnetEmbedWindows(tf, model, windows16k(samples, sampleRate));
  const r = rankV2({ f: ft, v2, mel, profiles: P, model: MODEL, graph: GRAPH });
  const top3 = r.ranked.slice(0, 3).map((g) => `${g.name} ${g.fit}`).join(', ');
  rows.push({ f, exp: f.split(' - ')[0], read: r.label, super: r.super, fam: r.family, conf: r.confidencePct, electronic: r.super === 'Electronic', ood: +r.trace.ood.m.toFixed(2), top3 });
}
for (const x of rows) console.log(`${x.exp.padEnd(9)} ${x.electronic ? 'ELEC' : '    '} ${String(x.read).slice(0, 22).padEnd(22)} ${String(x.super).padEnd(11)} ${String(x.conf).padStart(3)}%  ood ${x.ood}  | ${x.top3} | ${x.f.slice(x.exp.length + 3, x.exp.length + 40)}`);
console.log('electronic on non-electronic material:', rows.filter((x) => x.electronic).length, '/', rows.length);
