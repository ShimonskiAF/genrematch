// GenreMatch analyser: pure functions over mono Float32Array samples.
// Works in the browser (after Web Audio decode) and in Node (tests/harness).
export const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const FRAME = 2048, HOP = 512;

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const HANN = Float32Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const db = (x) => 20 * Math.log10(Math.max(x, 1e-9));

export function tempoFromFlux(flux, frameRate) {
  const n = flux.length;
  if (n < 32) return { bpm: 0, confident: false };
  const mean = flux.reduce((a, b) => a + b, 0) / n;
  const x = flux.map((v) => v - mean);
  let e0 = 0; for (const v of x) e0 += v * v;
  if (e0 < 1e-12) return { bpm: 0, confident: false };
  const minLag = Math.floor((60 / 190) * frameRate), maxLag = Math.min(n - 2, Math.ceil((60 / 60) * frameRate));
  const ac = new Float64Array(maxLag + 2);
  for (let L = minLag - 1; L <= maxLag + 1; L++) { let s = 0; for (let i = 0; i + L < n; i++) s += x[i] * x[i + L]; ac[L] = s / (n - L); }
  let best = -1, bestV = -Infinity;
  let bestW = -Infinity;
  for (let L = minLag; L <= maxLag; L++) if (ac[L] > ac[L - 1] && ac[L] >= ac[L + 1] && ac[L] > 0) {
    const w = ac[L] * Math.exp(-0.5 * (Math.log2((60 * frameRate) / L / 115) / 0.9) ** 2); // mild prior toward ~115 BPM
    if (w > bestW) { bestW = w; bestV = ac[L]; best = L; }
  }
  if (best < 0 || bestV <= 0) return { bpm: 0, confident: false };
  const a = ac[best - 1], b = ac[best], c = ac[best + 1], den = a - 2 * b + c;
  const lag = best + (den !== 0 ? (0.5 * (a - c)) / den : 0);
  const bpm = (60 * frameRate) / lag;
  const conf = bestV / (e0 / n);
  return { bpm: bpm >= 60 && bpm <= 190 && conf > 0.1 ? Math.round(bpm * 10) / 10 : 0, confident: conf > 0.1, conf };
}

export function analyseWindow(x, sr) {
  const nFrames = Math.floor((x.length - FRAME) / HOP) + 1;
  if (nFrames < 8) return null;
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME);
  const half = FRAME / 2, binHz = sr / FRAME, bassBin = Math.floor(150 / binHz);
  let prev = null, lowFlux = [], midFlux = [], kickFlux = [], cent = 0, flat = 0, bassP = 0, totP = 0, nUsed = 0;
  const flux = [];
  for (let f = 0; f < nFrames; f++) {
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) { re[i] = (x[o + i] || 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(half);
    let sM = 0, sMf = 0, sP = 0, sLog = 0, fl = 0, lf = 0, mf = 0, kf = 0;
    for (let k = 1; k < half; k++) {
      const m = Math.hypot(re[k], im[k]), p = m * m;
      mag[k] = m; sM += m; sMf += m * k * binHz; sP += p; sLog += Math.log(p + 1e-12);
      if (k <= bassBin) bassP += p;
      if (prev) { const d = Math.log1p(100 * m) - Math.log1p(100 * prev[k]); if (d > 0) { fl += d; const hz = k * binHz; if (hz <= 300) lf += d; if (hz <= 150) kf += d; else if (hz >= 200 && hz <= 3000) mf += d; } }
    }
    totP += sP; flux.push(fl); lowFlux.push(lf); midFlux.push(mf); kickFlux.push(kf); prev = mag;
    if (sP > 1e-8) { cent += sMf / sM; flat += Math.exp(sLog / (half - 1)) / (sP / (half - 1)); nUsed++; }
  }
  // energy: overall RMS in dBFS
  let ss = 0; for (let i = 0; i < x.length; i++) ss += x[i] * x[i];
  const rmsDb = db(Math.sqrt(ss / x.length));
  if (rmsDb < -60 || nUsed < 4) return { silent: true };
  // dynamics: 0.4 s blocks
  const B = Math.floor(0.4 * sr), blocks = [];
  for (let o = 0; o + B <= x.length; o += B) { let s = 0; for (let i = o; i < o + B; i++) s += x[i] * x[i]; blocks.push(db(Math.sqrt(s / B))); }
  const loud = blocks.filter((v) => v > -70);
  const dynRange = loud.length >= 3 ? pct(loud, 0.9) - pct(loud, 0.1) : 0;
  // onsets from flux peaks
  const fr = sr / HOP, fm = flux.reduce((a, b) => a + b, 0) / flux.length;
  const fsd = Math.sqrt(flux.reduce((a, b) => a + (b - fm) ** 2, 0) / flux.length);
  let onsets = 0, last = -1e9; const gap = Math.round(0.06 * fr);
  for (let i = 1; i < flux.length - 1; i++) if (flux[i] > fm + 0.5 * fsd && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && i - last >= gap) { onsets++; last = i; }
  const tLow = tempoFromFlux(lowFlux, fr), tFull = tempoFromFlux(flux, fr);
  // Full-band flux is steadier on real mixes (kick+snare+hats); low-band flux settles
  // octave doubts (hats can double a half-time groove). Calibrated on calibration/.
  const octaveApart = tLow.bpm && tFull.bpm && Math.abs(Math.log2(tFull.bpm / tLow.bpm)) > 0.9 && Math.abs(Math.log2(tFull.bpm / tLow.bpm)) < 1.1;
  let t = octaveApart || !tFull.bpm ? tLow : tFull;
  const rh = rhythmDescriptors({ kickFlux, midFlux, flux, fr }, t.bpm, onsets / (x.length / sr));
  const raw = { ...rh, bpm: t.bpm || 0, rmsDb, centroid: cent / nUsed, flatness: flat / nUsed, bassShare: bassP / totP, dynRangeDb: dynRange, onsetsPerSec: onsets / (x.length / sr), tempoConf: t.conf || 0, bpmLow: tLow.bpm, bpmFull: tFull.bpm };
  return { ...scaleRaw(raw), raw };
}

// Rhythm: tempo-relative autocorrelation peaks of kick/mid/full flux. Cheap, client-side.
function acfAt(x, lag) {
  if (!lag || lag < 1 || lag >= x.length) return 0;
  const L = Math.round(lag); let s = 0, n = 0;
  for (let i = 0; i + L < x.length; i++) { s += x[i] * x[i + L]; n++; }
  return n ? s / n : 0;
}
function acf0(x) { let s = 0; for (const v of x) s += v * v; return s / Math.max(1, x.length); }
export function rhythmDescriptors(raw, bpm, onsetsPerSec) {
  const { kickFlux, midFlux, flux, fr } = raw;
  if (!bpm || !kickFlux || !flux || (onsetsPerSec != null && onsetsPerSec < 2.5)) return { fourFloor: null, tresillo: null, offbeat: null, syncop: null, backbeat: null };
  let b = bpm; while (b < 80) b *= 2; while (b >= 160) b /= 2;
  const beat = (60 * fr) / b, half = beat / 2, qtr = beat / 4;
  const k0 = acf0(kickFlux) || 1e-12, f0 = acf0(flux) || 1e-12, m0 = acf0(midFlux) || 1e-12;
  const kBeat = acfAt(kickFlux, beat) / k0;
  const kHalf = acfAt(kickFlux, half) / k0;
  const fBeat = acfAt(flux, beat) / f0;
  const fHalf = acfAt(flux, half) / f0;
  const fQtr = acfAt(flux, qtr) / f0;
  // dembow / tresillo: strong ACF at 0.75 beat (3/4) and 1.5 beat relative to the beat
  const f75 = acfAt(flux, beat * 0.75) / f0;
  const f150 = acfAt(flux, beat * 1.5) / f0;
  const mBeat = acfAt(midFlux, beat) / m0;
  const mHalf = acfAt(midFlux, half) / m0; // backbeat / clap often half-bar in 4/4 when bpm is half
  return {
    fourFloor: Math.max(0, kBeat),                          // kick locked to the beat
    tresillo: Math.max(0, (f75 + f150) / (fBeat + 1e-9)),    // 3-3-2 / dembow vs straight
    offbeat: Math.max(0, fHalf / (fBeat + 1e-9)),            // half-beat energy (hats, offbeat)
    syncop: Math.max(0, fQtr / (fBeat + 1e-9)),              // 16th / jersey bounce
    backbeat: Math.max(0, mHalf / (mBeat + 1e-9)),           // snare/clap between kicks
  };
}

// Feature scales (0..1). Calibrated on real club tracks (calibration/), wide enough
// to keep quiet acoustic material on-scale. value = clamp((raw - lo) / (hi - lo)).
export const SCALES = {
  energy: { raw: 'rmsDb', lo: -24, hi: -2 },
  brightness: { raw: 'centroid', lo: 1000, hi: 5000 },
  texture: { raw: 'log10Flatness', lo: -5, hi: -1.5 },
  bass: { raw: 'bassShare', lo: 0, hi: 0.9 },
  dynamics: { raw: 'dynRangeDb', lo: 0, hi: 16 },
  pulse: { raw: 'onsetsPerSec', lo: 0, hi: 9 },
  fourFloor: { raw: 'fourFloor', lo: 0, hi: 0.8 },
  tresillo: { raw: 'tresillo', lo: 0, hi: 2.5 },
  offbeat: { raw: 'offbeat', lo: 0, hi: 2.5 },
  syncop: { raw: 'syncop', lo: 0, hi: 2.0 },
  backbeat: { raw: 'backbeat', lo: 0, hi: 3.0 },
};
export function scaleRaw(raw) {
  const v = { ...raw, log10Flatness: Math.log10(Math.max(raw.flatness, 1e-12)) };
  const out = { bpm: raw.bpm };
  for (const [k, s] of Object.entries(SCALES)) {
    if (v[s.raw] == null) { out[k] = 0.5; continue; } // neutral when tempo unknown
    out[k] = clamp((v[s.raw] - s.lo) / (s.hi - s.lo));
  }
  return out;
}

export const FEATURES = ['bpm', 'energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse', 'fourFloor', 'tresillo', 'offbeat', 'syncop', 'backbeat'];

export function analyse(samples, sr) {
  const dur = samples.length / sr;
  const wins = [];
  if (dur < 60) wins.push(samples);
  else for (const p of [0.15, 0.45, 0.75]) { const s = Math.floor(p * samples.length), n = Math.floor(20 * sr); wins.push(samples.subarray(s, Math.min(samples.length, s + n))); }
  const res = wins.filter((w) => w.length >= sr * 2).map((w) => analyseWindow(w, sr)).filter(Boolean);
  const good = res.filter((r) => !r.silent);
  if (dur < 3 || good.length === 0) return { silent: true, duration: dur };
  const out = { silent: false, duration: dur };
  for (const k of FEATURES) {
    const vals = good.map((r) => r[k]).filter((v) => k !== 'bpm' || v > 0);
    out[k] = Math.round((vals.length ? median(vals) : 0) * 100) / 100;
  }
  out.bpm = Math.round(voteTempo(good.map((r) => r.bpm)));
  out.raw = good.map((r) => r.raw);
  return out;
}

// Octave-aware tempo vote across windows: the value most windows agree with
// (counting x2 / /2 as half a vote), then the median of the windows at that octave.
export function voteTempo(bpms) {
  const v = bpms.filter((b) => b > 0);
  if (!v.length) return 0;
  const near = (a, b) => Math.abs(Math.log2(a / b)) < 0.05;
  let best = v[0], bestS = -1;
  for (const c of v) {
    const s = v.reduce((a, b) => a + (near(b, c) ? 1 : near(b * 2, c) || near(b / 2, c) ? 0.5 : 0), 0);
    if (s > bestS) { bestS = s; best = c; }
  }
  return median(v.filter((b) => near(b, best)));
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, m = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
}
