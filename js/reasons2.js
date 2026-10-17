// Feature-based reasons for a v2 read: which measured features pushed the primary shelf ahead of the
// runner-up (linear-head contributions, grouped), phrased short. Example:
// "124 BPM + four-on-the-floor lock + low spectral flatness + high rhythmic regularity → House".
const GROUPS = [
  { g: 'tempo', keys: ['b_bpm', 'b_gTempo'] },
  { g: 'lock', keys: ['b_fourFloor', 'b_kickDensity'], rep: 'b_fourFloor', hi: 'four-on-the-floor lock', lo: 'no four-on-the-floor kick' },
  { g: 'backbeat', keys: ['b_backbeat', 'b_backbeat2', 'b_halfTime'], rep: 'b_backbeat2', hi: 'strong 2 & 4 backbeat', lo: 'soft backbeat' },
  { g: 'synco', keys: ['b_tresillo', 'b_syncop', 'b_offbeat', 'b_kickOff', 'acThreeQ', 'acDotted'], rep: 'b_kickOff', hi: 'syncopated kick (3-3-2 feel)', lo: 'straight kick pattern' },
  { g: 'regular', keys: ['regularity', 'tgEntropy', 'acBeat', 'acBar', 'acTwo', 'acHalf', 'acQuarter', 'b_tight'], rep: 'regularity', hi: 'high rhythmic regularity', lo: 'loose, shifting rhythm' },
  { g: 'groove', keys: ['b_ghost', 'b_hatDensity'], rep: 'b_ghost', hi: 'ghost notes and busy hats', lo: 'sparse drums' },
  { g: 'flat', keys: ['flatM', 'flatS', 'b_texture', 'zcrM', 'zcrS'], rep: 'flatM', hi: 'high spectral flatness (noisy)', lo: 'low spectral flatness (tonal)' },
  { g: 'bright', keys: ['centM', 'centS', 'rollM', 'rollS', 'bwM', 'bwS', 'b_brightness'], rep: 'centM', hi: 'bright spectrum', lo: 'dark spectrum' },
  { g: 'low', keys: ['b_bass', 'conM0', 'conS0', 'conM1', 'conS1'], rep: 'b_bass', hi: 'heavy low end', lo: 'light low end' },
  { g: 'contrast', keys: ['conM2', 'conM3', 'conM4', 'conM5', 'conM6', 'conS2', 'conS3', 'conS4', 'conS5', 'conS6'], rep: 'conM4', hi: 'high spectral contrast (clear peaks)', lo: 'smeared, dense spectrum' },
  { g: 'loud', keys: ['rmsDb', 'rmsCv', 'lowEnergy', 'b_energy', 'b_dynamics'], rep: 'rmsDb', hi: 'loud, steady master', lo: 'quieter, dynamic mix' },
  { g: 'onsets', keys: ['onsetM', 'onsetCv', 'b_pulse'], rep: 'onsetM', hi: 'dense onsets', lo: 'few sharp onsets' },
  { g: 'harmony', keys: ['chromaEnt', 'chromaPeak', 'keyClarity', 'minorness', 'chromaFlux', 'b_tonal'], rep: 'keyClarity', hi: 'clear key centre', lo: 'blurred harmony' },
  { g: 'timbre', keys: [...Array.from({ length: 20 }, (_, i) => `mfccM${i}`), ...Array.from({ length: 20 }, (_, i) => `mfccS${i}`), ...Array.from({ length: 20 }, (_, i) => `mfccD${i}`), 'b_vocalMid', 'instrumentalness'], rep: 'b_vocalMid', hi: 'voice-forward mids (MFCC timbre)', lo: 'instrumental timbre (MFCC)' },
  { g: 'dance', keys: ['danceability'], rep: 'danceability', hi: 'high danceability', lo: 'low danceability' },
  { g: 'acoustic', keys: ['acousticness'], rep: 'acousticness', hi: 'acoustic-leaning sound', lo: 'produced, electronic sound' },
];
const G_OF = {}; for (const G of GROUPS) for (const k of G.keys) G_OF[k] = G;

// Contributions of each group to logit(primary) - logit(rival), averaged over the LR and LDA heads.
export function contributions(model, x, a, b) {
  const ia = model.classes.indexOf(a), ib = model.classes.indexOf(b);
  if (ia < 0 || ib < 0) return [];
  const out = {};
  for (const [h, T] of [[model.lr, model.temps.lr], [model.lda, model.temps.lda]]) {
    model.handKeys.forEach((k, j) => { const zx = (x[j] - h.mu[j]) / (h.sd[j] || 1), c = (zx * (h.W[ia][j] - h.W[ib][j])) / T / 2; const G = G_OF[k]; if (G) out[G.g] = (out[G.g] || 0) + c; });
  }
  return Object.entries(out).map(([g, c]) => ({ g, c })).sort((p, q) => q.c - p.c);
}
const zOf = (model, x, key) => { const j = model.handKeys.indexOf(key); return j < 0 ? 0 : (x[j] - model.lr.mu[j]) / (model.lr.sd[j] || 1); };

export function phrase(model, x, g, f) {
  const G = GROUPS.find((q) => q.g === g);
  if (g === 'tempo') return f.bpm ? `${Math.round(f.bpm)} BPM` : null;
  const z = zOf(model, x, G.rep);
  if (Math.abs(z) < 0.35) return null;
  return z > 0 ? G.hi : G.lo;
}

// Returns { headline, lines[] }. Short and scannable.
export function reasonsV2(res, f, model, graph) {
  if (res.status === 'none') return { headline: res.reason, lines: [res.reason], drivers: [] };
  const x = res.trace.x, p = res.primary, rival = res.ranked.find((r) => r.id !== p.id && !r.estimate);
  let drivers = [];
  if (!p.estimate && rival) drivers = contributions(model, x, p.id, rival.id).filter((d) => d.c > 0.05);
  const bits = []; const used = new Set();
  if (f.bpm) { bits.push(`${Math.round(f.bpm)} BPM`); used.add('tempo'); }
  const mi = model.classes.indexOf(p.id), melLead = res.trace.melUsed && mi >= 0 && res.trace.mel[mi] > res.trace.hand[mi] + 0.15;
  if (melLead) bits.push('spectrogram sound-alike');
  for (const d of drivers) { if (bits.length >= 4) break; if (used.has(d.g)) continue; const t = phrase(model, x, d.g, f); if (t) { bits.push(t); used.add(d.g); } }
  if (bits.length < 3) for (const G of GROUPS) { if (bits.length >= 4) break; if (used.has(G.g) || G.g === 'tempo' || G.g === 'timbre') continue; const t = phrase(model, x, G.g, f); if (t && Math.abs(zOf(model, x, G.rep)) > 1) { bits.push(t); used.add(G.g); } }
  const headline = `${bits.join(' + ')} → ${p.name}`;
  const lines = [headline];
  const g = graph.profiles[p.id];
  if (g?.pocket && f.bpm) { const b = res.tempoUsed || f.bpm; const inP = b >= g.pocket[0] - 2 && b <= g.pocket[1] + 2; lines.push(`${inP ? 'Inside' : 'Outside'} the ${p.name} pocket (${g.pocket[0]}–${g.pocket[1]} BPM).${res.octave === 'half' ? ' Scored at half time.' : res.octave === 'double' ? ' Scored at double time.' : ''}`); }
  if (res.trace.melUsed) {
    const i = model.classes.indexOf(p.id), mp = i >= 0 ? res.trace.mel[i] : null, hp = i >= 0 ? res.trace.hand[i] : null;
    if (mp != null) lines.push(`${p.name}: spectrogram model ${Math.round(100 * mp)}%, features ${Math.round(100 * hp)}%.${Math.max(mp, hp) < 0.3 ? ' Neither is sure.' : Math.abs(mp - hp) < 0.15 ? ' They agree.' : mp > hp ? ' The spectrogram carries it.' : ' The features carry it.'}`);
  }
  if (res.nearMisses.length) lines.push(`Near miss: ${res.nearMisses.map((n) => `${n.name} ${n.fit}%${n.relation ? ` (${n.relation})` : ''}`).join(', ')}.`);
  if (res.trace.ood.m > 0.2) lines.push('Outside the crates we trained on, so this read leans on estimates.');
  return { headline, lines: lines.slice(0, 5), drivers: drivers.slice(0, 6) };
}
