// Merge calibration/v2/estimate_shelves.json (Shima's targets as priors) into the shipped profiles and the atlas graph.
// Fitted (calibrated) profiles are never overwritten. node calibration/v2/apply_estimates.js
import fs from 'node:fs';
const u = (p) => new URL(p, import.meta.url);
const E = JSON.parse(fs.readFileSync(u('./estimate_shelves.json'))).profiles;
export function mergeEstimates(profiles) {
  const out = profiles.map((p) => ({ ...p }));
  for (const e of E) {
    const i = out.findIndex((p) => p.id === e.id);
    if (i >= 0 && /calibrated/.test(out[i].status)) continue;
    const { traits, ...p } = e; if (i >= 0) out[i] = { ...out[i], ...p }; else out.push(p);
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const doc = JSON.parse(fs.readFileSync(u('../../data/genre_profiles.json')));
  doc.profiles = mergeEstimates(doc.profiles);
  fs.writeFileSync(u('../../data/genre_profiles.json'), JSON.stringify(doc, null, 1) + '\n');
  const G = JSON.parse(fs.readFileSync(u('../../data/atlas_graph.json'))), H = JSON.parse(fs.readFileSync(u('./shima_genres.json')));
  const bySlug = Object.fromEntries(Object.entries(H).map(([k, v]) => [k.replace(/-/g, ''), v]));
  const alias = { futurebass: 'futurebass', hardstyle: 'hardstyle', ukgarage: 'ukgarage', dancepop: 'dancepop', indiepop: 'indiepop', altrock: 'alternativerock', shoegaze: 'shoegaze', cinematic: 'cinematic', dancehall: 'dancehall' };
  for (const e of E) {
    if (G.profiles[e.id]) continue;
    const h = bySlug[alias[e.id]], lo = Math.min(...h.bpm.map((b) => b[0])), hi = Math.max(...h.bpm.map((b) => b[1]));
    G.profiles[e.id] = { super: G.familySuper[e.family], parent: [], siblings: [], influence: [], pocket: [lo, hi], character: e.traits.join(', '), axes: [], estimate: true };
  }
  fs.writeFileSync(u('../../data/atlas_graph.json'), JSON.stringify(G, null, 1));
  console.log('profiles', doc.profiles.length, 'graph', Object.keys(G.profiles).length);
}
