// Mel path: YAMNet (Apache-2.0, trained on AudioSet) turns a log-mel spectrogram into a 1024-d embedding
// per 0.96 s patch. We average the patches over the same 3 x 20 s windows the hand features use.
// The model computes its own 64-band log-mel frontend from a 16 kHz waveform. Pure audio, no lookup.
// Works with any tfjs instance (browser bundle or Node). Weights: models/yamnet (float16, ~8 MB).
export const MEL_SR = 16000;
export function melWindows(x, sr = MEL_SR) {
  if (x.length / sr < 60) return [x];
  return [0.15, 0.45, 0.75].map((p) => { const s = Math.floor(p * x.length); return x.subarray(s, Math.min(x.length, s + 20 * sr)); });
}
// Returns { emb: number[1024], scores: number[521], patches } or null when the audio is too short.
export async function yamnetEmbed(tf, model, x16k) {
  const E = [], S = [];
  for (const w of melWindows(x16k)) {
    if (w.length < MEL_SR) continue;
    const [s, e] = model.execute(tf.tensor1d(w), ['Identity:0', 'Identity_1:0']);
    const [sa, ea] = [await s.array(), await e.array()];
    tf.dispose([s, e]); S.push(...sa); E.push(...ea);
  }
  if (!E.length) return null;
  const mean = (m) => m[0].map((_, j) => m.reduce((a, r) => a + r[j], 0) / m.length);
  return { emb: mean(E), scores: mean(S), patches: E.length };
}
// AudioSet genre classes YAMNet can name that GenreMatch has no trained crate for. Used only as
// out-of-domain evidence for the estimate shelves (rock, jazz, folk...), never to label in-domain music.
export const OOD_CLASSES = { 214: 'rock', 215: 'metal', 216: 'punk', 217: 'indie', 218: 'rock', 219: 'rock', 220: 'rock', 224: 'country', 225: 'jazz', 226: 'country', 228: 'folk', 230: 'jazz', 232: 'cinematic', 233: 'cinematic', 263: 'cinematic', 265: 'cinematic', 241: 'ambient', 245: 'folk', 246: 'blues', 248: 'ambient', 254: 'soul', 260: 'indie', 266: 'songwriter' };
// All AudioSet music-genre class indices (211-270) for the denominator.
export const GENRE_CLASS_RANGE = [211, 270];
// inDomain (optional Set of trained shelf ids): classes that now map to a trained shelf are not out-of-domain evidence.
export function oodEvidence(scores, inDomain = null) {
  if (!scores) return null;
  let tot = 0, ood = 0; const per = {};
  for (let i = GENRE_CLASS_RANGE[0]; i <= GENRE_CLASS_RANGE[1]; i++) { tot += scores[i]; const p = OOD_CLASSES[i]; if (p && !inDomain?.has(p)) { ood += scores[i]; per[p] = (per[p] || 0) + scores[i]; } }
  return { share: tot > 0 ? ood / tot : 0, per: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, ood > 0 ? v / ood : 0])) };
}

// Windowed-sinc resampler (any ratio) so the browser can feed YAMNet 16 kHz from the 44.1/48 kHz decode
// without relying on OfflineAudioContext sample-rate support.
const _rtab = new Map();
export function resample(x, srIn, srOut = MEL_SR, half = 16) {
  if (srIn === srOut) return x;
  const ratio = srIn / srOut, n = Math.floor(x.length / ratio), y = new Float32Array(n);
  const fc = Math.min(1, srOut / srIn) * 0.94, TW = half * Math.max(1, ratio), L = Math.ceil(TW) + 1, W = 2 * L + 1, Q = 512;
  const key = `${srIn}|${srOut}|${half}`;
  let tab = _rtab.get(key);
  if (!tab) { // taps for k = c-L..c+L at fractional offset q/Q, normalised per phase
    tab = new Float64Array(Q * W);
    for (let q = 0; q < Q; q++) { let ws = 0; for (let j = 0; j < W; j++) { const dt = j - L - q / Q; if (Math.abs(dt) > TW) continue; const d = dt * fc, sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d); const h = sinc * (0.42 + 0.5 * Math.cos((Math.PI * dt) / TW) + 0.08 * Math.cos((2 * Math.PI * dt) / TW)); tab[q * W + j] = h; ws += h; } for (let j = 0; j < W; j++) tab[q * W + j] /= ws; }
    _rtab.set(key, tab);
  }
  for (let i = 0; i < n; i++) {
    const t = i * ratio, c = Math.floor(t), q = Math.min(Q - 1, Math.round((t - c) * Q)), o = q * W;
    let s = 0;
    if (c - L >= 0 && c + L < x.length) for (let j = 0; j < W; j++) s += tab[o + j] * x[c - L + j];
    else for (let j = 0; j < W; j++) { const k = c - L + j; if (k >= 0 && k < x.length) s += tab[o + j] * x[k]; }
    y[i] = s;
  }
  return y;
}
// Browser/Node path from a full-rate mono decode: choose windows at full rate, resample each to 16 kHz.
export function windows16k(x, sr) {
  const dur = x.length / sr;
  const w = dur < 60 ? [x] : [0.15, 0.45, 0.75].map((p) => { const s = Math.floor(p * x.length); return x.subarray(s, Math.min(x.length, s + 20 * sr)); });
  return w.map((v) => resample(v, sr));
}
export async function yamnetEmbedWindows(tf, model, wins16) {
  const E = [], S = [];
  for (const w of wins16) {
    if (w.length < MEL_SR) continue;
    const [s, e] = model.execute(tf.tensor1d(w), ['Identity:0', 'Identity_1:0']);
    const [sa, ea] = [await s.array(), await e.array()]; tf.dispose([s, e]); S.push(...sa); E.push(...ea);
  }
  if (!E.length) return null;
  const mean = (m) => m[0].map((_, j) => m.reduce((a, r) => a + r[j], 0) / m.length);
  return { emb: mean(E), scores: mean(S), patches: E.length };
}
