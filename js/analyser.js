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
  let prev = null, lowFlux = [], cent = 0, flat = 0, bassP = 0, totP = 0, nUsed = 0;
  const flux = [];
  for (let f = 0; f < nFrames; f++) {
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) { re[i] = (x[o + i] || 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    const mag = new Float64Array(half);
    let sM = 0, sMf = 0, sP = 0, sLog = 0, fl = 0, lf = 0;
    for (let k = 1; k < half; k++) {
      const m = Math.hypot(re[k], im[k]), p = m * m;
      mag[k] = m; sM += m; sMf += m * k * binHz; sP += p; sLog += Math.log(p + 1e-12);
      if (k <= bassBin) bassP += p;
      if (prev) { const d = Math.log1p(100 * m) - Math.log1p(100 * prev[k]); if (d > 0) { fl += d; if (k * binHz <= 300) lf += d; } }
    }
    totP += sP; flux.push(fl); lowFlux.push(lf); prev = mag;
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
  let t = tempoFromFlux(lowFlux, fr);
  if (!t.bpm) t = tempoFromFlux(flux, fr);
  return {
    bpm: t.bpm,
    energy: clamp((rmsDb + 30) / 24),
    brightness: clamp((cent / nUsed - 500) / 3500),
    texture: clamp(flat / nUsed / 0.30),
    bass: clamp(bassP / totP / 0.45),
    dynamics: clamp(dynRange / 20),
    pulse: clamp(onsets / (x.length / sr) / 8),
    raw: { rmsDb, centroid: cent / nUsed, flatness: flat / nUsed, bassShare: bassP / totP, dynRangeDb: dynRange, onsetsPerSec: onsets / (x.length / sr), tempoConf: t.conf || 0 },
  };
}

export const FEATURES = ['bpm', 'energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse'];

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
  out.bpm = Math.round(out.bpm);
  out.raw = good.map((r) => r.raw);
  return out;
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, m = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) m[i] += c[i] / channels.length;
  return m;
}
