// GenreMatch feature set v2: librosa-style descriptors in plain JS (browser + Node).
// MFCC (20, mean/std/delta-std), spectral centroid/bandwidth/rolloff/flatness/contrast, chroma,
// RMS, zero-crossing rate, onset strength, tempogram summary, plus danceability / acousticness /
// instrumentalness proxies. Also returns a compact log-mel summary for the mel path (js/melpath.js).
// Pure functions over mono Float32Array samples. Conventions follow librosa defaults where cheap:
// 22.05 kHz, n_fft 2048, hop 512, 64 mel bands, top_db 80, contrast bands from 200 Hz in octaves.
export const SR2 = 22050, NFFT = 2048, HOP2 = 512, NMEL = 64, NMFCC = 20;
const HANN = Float64Array.from({ length: NFFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NFFT));

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const a = i + k, b = a + h; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}

// Integer-factor decimation with a windowed-sinc low-pass (44.1k -> 22.05k, 48k -> 24k).
export function downsample(x, sr) {
  const q = Math.max(1, Math.round(sr / SR2));
  if (q === 1) return { y: x, sr };
  const taps = 32 * q + 1, c = (taps - 1) / 2, fc = 0.45 / q, h = new Float64Array(taps);
  let s = 0;
  for (let i = 0; i < taps; i++) { const t = i - c; h[i] = (t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t)) * (0.42 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)) + 0.08 * Math.cos((4 * Math.PI * i) / (taps - 1))); s += h[i]; }
  for (let i = 0; i < taps; i++) h[i] /= s;
  const n = Math.floor(x.length / q), y = new Float32Array(n);
  for (let j = 0; j < n; j++) { const o = j * q - c; let a = 0; for (let i = 0; i < taps; i++) { const k = o + i; if (k >= 0 && k < x.length) a += h[i] * x[k]; } y[j] = a; }
  return { y, sr: sr / q };
}

const hz2mel = (f) => 2595 * Math.log10(1 + f / 700), mel2hz = (m) => 700 * (10 ** (m / 2595) - 1);
const _fb = new Map();
export function melFilterbank(sr, nfft = NFFT, nmel = NMEL, fmin = 30, fmax = sr / 2) {
  const key = `${sr}|${nfft}|${nmel}`; if (_fb.has(key)) return _fb.get(key);
  const half = nfft / 2 + 1, pts = Array.from({ length: nmel + 2 }, (_, i) => mel2hz(hz2mel(fmin) + ((hz2mel(fmax) - hz2mel(fmin)) * i) / (nmel + 1)));
  const fb = [];
  for (let m = 0; m < nmel; m++) {
    const [a, b, c] = [pts[m], pts[m + 1], pts[m + 2]], lo = Math.floor((a * nfft) / sr), hi = Math.ceil((c * nfft) / sr), w = [];
    const norm = 2 / (c - a); // Slaney area normalisation
    for (let k = Math.max(1, lo); k <= Math.min(half - 1, hi); k++) { const f = (k * sr) / nfft; const v = f <= b ? (f - a) / (b - a) : (c - f) / (c - b); if (v > 0) w.push([k, v * norm]); }
    fb.push(w);
  }
  _fb.set(key, fb); return fb;
}
const DCT = Array.from({ length: NMFCC }, (_, q) => Float64Array.from({ length: NMEL }, (_, m) => Math.cos((Math.PI * q * (m + 0.5)) / NMEL) * Math.sqrt((q === 0 ? 1 : 2) / NMEL)));
// Krumhansl-Schmuckler key profiles (major, minor), C first.
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b) { const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n; let x = 0, y = 0, z = 0; for (let i = 0; i < n; i++) { x += (a[i] - ma) * (b[i] - mb); y += (a[i] - ma) ** 2; z += (b[i] - mb) ** 2; } return y && z ? x / Math.sqrt(y * z) : 0; }
const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
const std = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length)); };
const sig = (x) => 1 / (1 + Math.exp(-x));

// Frame-level pass over one window (already at ~22 kHz).
export function frames(x, sr) {
  const n = Math.floor((x.length - NFFT) / HOP2) + 1;
  if (n < 16) return null;
  const half = NFFT / 2, binHz = sr / NFFT, fb = melFilterbank(sr), re = new Float64Array(NFFT), im = new Float64Array(NFFT);
  const pc = new Int8Array(half + 1).fill(-1); for (let k = 1; k <= half; k++) { const f = k * binHz; if (f >= 65 && f <= 4200) pc[k] = ((Math.round(12 * Math.log2(f / 261.6256)) % 12) + 12) % 12; }
  const edges = [0, 200, 400, 800, 1600, 3200, 6400, sr / 2].map((f) => Math.min(half, Math.round(f / binHz)));
  const F = { logmel: [], mfcc: [], cent: [], bw: [], roll: [], flat: [], contrast: [], rms: [], zcr: [], chroma: [] };
  const mag = new Float64Array(half + 1);
  for (let f = 0; f < n; f++) {
    const o = f * HOP2;
    let ss = 0, zc = 0;
    for (let i = 0; i < NFFT; i++) { const v = x[o + i] || 0; re[i] = v * HANN[i]; im[i] = 0; ss += v * v; if (i && (v >= 0) !== ((x[o + i - 1] || 0) >= 0)) zc++; }
    fft(re, im);
    let sM = 0, sMf = 0, sP = 0, sLog = 0;
    const ch = new Float64Array(12);
    for (let k = 0; k <= half; k++) { const p = re[k] * re[k] + im[k] * im[k], m = Math.sqrt(p); mag[k] = m; if (k) { sM += m; sMf += m * k * binHz; sP += p; sLog += Math.log(p + 1e-10); if (pc[k] >= 0) ch[pc[k]] += p; } }
    const c = sM > 0 ? sMf / sM : 0;
    let bw = 0, cum = 0, roll = 0; for (let k = 1; k <= half; k++) bw += mag[k] * (k * binHz - c) ** 2;
    for (let k = 1; k <= half; k++) { cum += mag[k]; if (cum >= 0.85 * sM) { roll = k * binHz; break; } }
    const mel = new Float64Array(NMEL); for (let m = 0; m < NMEL; m++) { let s = 0; for (const [k, w] of fb[m]) s += w * mag[k] * mag[k]; mel[m] = 10 * Math.log10(Math.max(s, 1e-10)); }
    const con = [];
    for (let b = 0; b < 7; b++) { const seg = Array.from(mag.subarray(Math.max(1, edges[b]), Math.max(edges[b] + 2, edges[b + 1]))).sort((p, q) => p - q); const q = Math.max(1, Math.round(0.02 * seg.length)); const lo = mean(seg.slice(0, q)), hi = mean(seg.slice(-q)); con.push(10 * Math.log10(Math.max(hi * hi, 1e-10)) - 10 * Math.log10(Math.max(lo * lo, 1e-10))); }
    const cm = Math.max(...ch);
    F.logmel.push(mel); F.cent.push(c); F.bw.push(sM > 0 ? Math.sqrt(bw / sM) : 0); F.roll.push(roll);
    F.flat.push(sP > 0 ? Math.exp(sLog / half) / (sP / half) : 1); F.contrast.push(con);
    F.rms.push(Math.sqrt(ss / NFFT)); F.zcr.push(zc / NFFT); F.chroma.push(cm > 0 ? Array.from(ch, (v) => v / cm) : new Array(12).fill(0));
  }
  // top_db 80 clip, then MFCC by orthonormal DCT-II, and onset strength (mean positive log-mel difference).
  let top = -Infinity; for (const m of F.logmel) for (const v of m) if (v > top) top = v;
  const onset = [0];
  for (let f = 0; f < n; f++) {
    const m = F.logmel[f]; for (let i = 0; i < NMEL; i++) if (m[i] < top - 80) m[i] = top - 80;
    F.mfcc.push(DCT.map((row) => { let s = 0; for (let i = 0; i < NMEL; i++) s += row[i] * m[i]; return s; }));
    if (f) { let s = 0; const p = F.logmel[f - 1]; for (let i = 0; i < NMEL; i++) s += Math.max(0, m[i] - p[i]); onset.push(s / NMEL); }
  }
  F.onset = onset; F.fr = sr / HOP2; F.n = n;
  return F;
}

// Tempogram summary from the onset envelope: normalised autocorrelation over 30-300 BPM lags.
export function tempogramSummary(onset, fr, bpm) {
  const n = onset.length, m = mean(onset), x = onset.map((v) => v - m);
  let e0 = 0; for (const v of x) e0 += v * v;
  const ac = (lag) => { const L = Math.round(lag); if (L < 1 || L >= n) return 0; let s = 0; for (let i = 0; i + L < n; i++) s += x[i] * x[i + L]; return e0 > 0 ? s / e0 * (n / (n - L)) : 0; };
  const lags = []; for (let L = Math.floor((60 / 300) * fr); L <= Math.ceil((60 / 30) * fr); L++) lags.push(Math.max(0, ac(L)));
  const tot = lags.reduce((a, b) => a + b, 0) || 1e-9;
  const ent = -lags.reduce((a, v) => a + (v > 0 ? (v / tot) * Math.log(v / tot) : 0), 0) / Math.log(lags.length);
  let peak = 0; for (let L = Math.floor((60 / 180) * fr); L <= Math.ceil((60 / 60) * fr); L++) peak = Math.max(peak, ac(L));
  let b = bpm || 0; if (b) { while (b < 80) b *= 2; while (b >= 160) b /= 2; }
  const beat = b ? (60 * fr) / b : 0;
  const at = (k) => (beat ? Math.max(0, ac(beat * k)) : 0);
  return { regularity: peak, tgEntropy: ent, acHalf: at(0.5), acBeat: at(1), acThreeQ: at(0.75), acBar: at(4), acTwo: at(2), acQuarter: at(0.25), acDotted: at(1.5) };
}

export const V2_KEYS = (() => {
  const k = [];
  for (let i = 0; i < NMFCC; i++) k.push(`mfccM${i}`); for (let i = 0; i < NMFCC; i++) k.push(`mfccS${i}`); for (let i = 0; i < NMFCC; i++) k.push(`mfccD${i}`);
  k.push('centM', 'centS', 'bwM', 'bwS', 'rollM', 'rollS', 'flatM', 'flatS');
  for (let i = 0; i < 7; i++) k.push(`conM${i}`); for (let i = 0; i < 7; i++) k.push(`conS${i}`);
  k.push('rmsDb', 'rmsCv', 'lowEnergy', 'zcrM', 'zcrS', 'onsetM', 'onsetCv', 'chromaEnt', 'chromaPeak', 'keyClarity', 'minorness', 'chromaFlux',
    'regularity', 'tgEntropy', 'acHalf', 'acBeat', 'acThreeQ', 'acBar', 'acTwo', 'acQuarter', 'acDotted', 'danceability', 'acousticness', 'instrumentalness');
  return k;
})();

// Window choice mirrors analyser.js (3 x 20 s at 15/45/75 %, whole file under 60 s).
export function windows(samples, sr) {
  const dur = samples.length / sr, out = [];
  if (dur < 60) out.push(samples);
  else for (const p of [0.15, 0.45, 0.75]) { const s = Math.floor(p * samples.length); out.push(samples.subarray(s, Math.min(samples.length, s + Math.floor(20 * sr)))); }
  return out.filter((w) => w.length >= sr * 2);
}

export function extractV2(samples, sr, bpm = 0) {
  const per = [];
  for (const w of windows(samples, sr)) { const { y, sr: s2 } = downsample(w, sr); const F = frames(y, s2); if (F) per.push(F); }
  if (!per.length) return null;
  const all = (k) => per.flatMap((F) => F[k]);
  const mf = all('mfcc'), lm = all('logmel'), con = all('contrast'), chroma = all('chroma');
  const out = {};
  for (let i = 0; i < NMFCC; i++) { const c = mf.map((r) => r[i]); out[`mfccM${i}`] = mean(c); out[`mfccS${i}`] = std(c); }
  const d = []; for (const F of per) for (let f = 2; f < F.n - 2; f++) d.push(F.mfcc[f + 1].map((v, i) => (F.mfcc[f + 1][i] - F.mfcc[f - 1][i] + 2 * (F.mfcc[f + 2][i] - F.mfcc[f - 2][i])) / 10));
  for (let i = 0; i < NMFCC; i++) out[`mfccD${i}`] = std(d.map((r) => r[i]));
  const fl = all('flat').map((v) => Math.log10(Math.max(v, 1e-10)));
  Object.assign(out, { centM: mean(all('cent')), centS: std(all('cent')), bwM: mean(all('bw')), bwS: std(all('bw')), rollM: mean(all('roll')), rollS: std(all('roll')), flatM: mean(fl), flatS: std(fl) });
  for (let i = 0; i < 7; i++) { const c = con.map((r) => r[i]); out[`conM${i}`] = mean(c); out[`conS${i}`] = std(c); }
  const rms = all('rms'), rm = mean(rms);
  out.rmsDb = 20 * Math.log10(Math.max(rm, 1e-9)); out.rmsCv = rm > 0 ? std(rms) / rm : 0; out.lowEnergy = rms.filter((v) => v < rm).length / rms.length;
  out.zcrM = mean(all('zcr')); out.zcrS = std(all('zcr'));
  const on = all('onset'), om = mean(on); out.onsetM = om; out.onsetCv = om > 0 ? std(on) / om : 0;
  const cmean = Array.from({ length: 12 }, (_, i) => mean(chroma.map((r) => r[i]))), cs = cmean.reduce((a, b) => a + b, 0) || 1e-9;
  out.chromaEnt = -cmean.reduce((a, v) => a + (v > 0 ? (v / cs) * Math.log(v / cs) : 0), 0) / Math.log(12);
  out.chromaPeak = Math.max(...cmean) / cs;
  let bMaj = -1, bMin = -1; for (let r = 0; r < 12; r++) { const rot = cmean.map((_, i) => cmean[(i + r) % 12]); bMaj = Math.max(bMaj, corr(rot, KS_MAJ)); bMin = Math.max(bMin, corr(rot, KS_MIN)); }
  out.keyClarity = Math.max(bMaj, bMin); out.minorness = bMin - bMaj;
  let cf = 0, cn = 0; for (const F of per) for (let f = 1; f < F.n; f++) { let s = 0; for (let i = 0; i < 12; i++) s += Math.abs(F.chroma[f][i] - F.chroma[f - 1][i]); cf += s / 12; cn++; } out.chromaFlux = cn ? cf / cn : 0;
  const tg = per.map((F) => tempogramSummary(F.onset, F.fr, bpm));
  for (const k of Object.keys(tg[0])) out[k] = mean(tg.map((t) => t[k]));
  // Proxies (0..1). Hand-set, documented, not Spotify's models: they explain a read, the classifier learns its own use of them.
  const tempoFit = bpm ? Math.exp(-0.5 * (Math.log2(bpm / 118) / 0.35) ** 2) : 0.5;
  out.danceability = sig(4 * (out.regularity - 0.3)) * (0.5 + 0.5 * tempoFit) * sig(3 * (1 - out.onsetCv));
  out.acousticness = sig(-2.2 * (out.flatM + 2.2)) * sig(2 * (out.rmsCv - 0.45)) * sig(-(out.rmsDb + 14) / 3);
  // Voice adds fast, smooth spectral-envelope motion in the 300-3000 Hz region: mid MFCC deltas vs low ones.
  const midD = mean([2, 3, 4, 5, 6].map((i) => out[`mfccD${i}`])), lowD = out.mfccD1 || 1e-9;
  out.instrumentalness = sig(-3 * (midD / lowD - 0.9));
  // Mel summary for the mel path: per-band mean and std of log-mel (dB re track peak).
  const mt = Math.max(...lm.map((r) => Math.max(...r)));
  const melM = Array.from({ length: NMEL }, (_, i) => mean(lm.map((r) => r[i] - mt))), melS = Array.from({ length: NMEL }, (_, i) => std(lm.map((r) => r[i])));
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 1e5) / 1e5;
  return { v2: out, mel: { mean: melM.map((v) => Math.round(v * 100) / 100), std: melS.map((v) => Math.round(v * 100) / 100) } };
}
