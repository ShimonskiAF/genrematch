// Four-on-the-floor grid read, ported from the Bloom builder app (ShimonskiAF/bloom-moss-gold-flame,
// src/lib/analyze.ts: sliceWindow, extract -> lowFlux / betterBpm / envelopeAt / fourOnFloor). Kept numerically
// identical to that code (Float32 buffers, same smoothing order) so the calibration values match.
// Used only by the features-only fallback head (model.fb) when the YAMNet mel path is unavailable.
const RATE = 22050, NFFT = 2048, HOP = 256;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const HANN = new Float32Array(NFFT);
for (let i = 0; i < NFFT; i++) HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (NFFT - 1)));

function resample(input, from, to) {
  if (from === to) return input;
  const ratio = from / to, n = Math.max(1, Math.floor(input.length / ratio)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i * ratio, i0 = Math.floor(x), i1 = Math.min(i0 + 1, input.length - 1), fr = x - i0; out[i] = input[i0] * (1 - fr) + input[i1] * fr; }
  return out;
}
function sliceWindow(s, sr) {
  const max = Math.floor(sr * 22); if (s.length <= max) return s;
  let bestStart = 0, best = -1;
  for (let start = 0; start + max <= s.length; start += sr) { let e = 0; for (let i = start; i < start + max; i += 32) e += s[i] * s[i]; if (e > best) { best = e; bestStart = start; } }
  return s.subarray(bestStart, bestStart + max);
}
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr0 = Math.cos(ang), wi0 = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const ur = re[i + j], ui = im[i + j], vr = re[i + j + half] * wr - im[i + j + half] * wi, vi = re[i + j + half] * wi + im[i + j + half] * wr;
        re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + half] = ur - vr; im[i + j + half] = ui - vi;
        const nr = wr * wr0 - wi * wi0; wi = wr * wi0 + wi * wr0; wr = nr;
      }
    }
  }
}
function envelopeAt(env, lag) {
  const l = Math.round(lag); if (l < 2 || l >= env.length - 2) return 0;
  let m = 0; for (let i = 0; i < env.length; i++) m += env[i]; m /= Math.max(1, env.length);
  let e = 0; for (let i = 0; i < env.length; i++) { const d = env[i] - m; e += d * d; } if (e < 1e-8) return 0;
  let s = 0; for (let i = 0; i < env.length - l; i++) s += (env[i] - m) * (env[i + l] - m);
  return clamp(s / e, 0, 1);
}
function tempo(flux, hopRate) {
  const minLag = Math.max(2, Math.round((hopRate * 60) / 185)), maxLag = Math.min(flux.length - 2, Math.round((hopRate * 60) / 68));
  let mean = 0; for (let i = 0; i < flux.length; i++) mean += flux[i]; mean /= Math.max(1, flux.length);
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) { let s = 0; for (let i = 0; i < flux.length - lag; i++) s += (flux[i] - mean) * (flux[i + lag] - mean); corr[lag] = s; }
  const at = (lag) => { const l = Math.round(lag); return l < minLag || l > maxLag ? 0 : corr[l]; };
  const cands = []; for (let lag = minLag; lag <= maxLag; lag++) cands.push({ lag, score: corr[lag] + 0.55 * at(lag * 2) + 0.35 * at(lag / 2) + 0.2 * at(lag * 4) });
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, 6); let bestLag = top[0]?.lag ?? minLag, bestScore = top[0]?.score ?? -Infinity;
  for (const c of top) {
    const g = (60 * hopRate) / c.lag; let prior = 1;
    if (g >= 70 && g <= 180) prior = 1.08; if (g >= 90 && g <= 150) prior = 1.14;
    if (c.lag * 2 <= maxLag && at(c.lag * 2) > at(c.lag) * 0.65) prior *= 1.06;
    if (c.score * prior > bestScore) { bestScore = c.score * prior; bestLag = c.lag; }
  }
  const l = at(bestLag - 1), m = at(bestLag), r = at(bestLag + 1), den = l - 2 * m + r;
  const delta = den === 0 ? 0 : clamp((0.5 * (l - r)) / den, -0.5, 0.5);
  return clamp((60 * hopRate) / (bestLag + delta), 60, 200);
}
// 0-1: how strongly the 30-180 Hz onsets repeat at the beat and its multiples. 0 for near-silent or very short audio.
export function fourOnFloorB(samples, sampleRate) {
  if (!samples || samples.length < sampleRate * 1.2) return 0;
  const w = sliceWindow(resample(samples, sampleRate, RATE), RATE);
  let rs = 0; for (let i = 0; i < w.length; i++) rs += w[i] * w[i]; if (Math.sqrt(rs / Math.max(1, w.length)) < 0.004) return 0;
  const frameCount = Math.max(1, Math.floor((w.length - NFFT) / HOP)), bins = NFFT / 2, binHz = RATE / NFFT;
  const flux = new Float32Array(frameCount), low = new Float32Array(frameCount), re = new Float32Array(NFFT), im = new Float32Array(NFFT), prev = new Float32Array(bins);
  for (let f = 0; f < frameCount; f++) {
    const o = f * HOP; for (let i = 0; i < NFFT; i++) { re[i] = w[o + i] * HANN[i]; im[i] = 0; }
    fft(re, im);
    let fv = 0, lv = 0;
    for (let i = 1; i < bins; i++) { const mag = Math.hypot(re[i], im[i]), hz = i * binHz; if (mag > prev[i] * 1.4 + 1e-5) { const rise = mag - prev[i]; fv += rise; if (hz >= 30 && hz < 180) lv += rise; } prev[i] = mag; }
    flux[f] = fv; low[f] = lv;
  }
  for (let i = 1; i < flux.length - 1; i++) flux[i] = flux[i - 1] * 0.2 + flux[i] * 0.6 + flux[i + 1] * 0.2;
  const hopRate = RATE / HOP; let meanFlux = 0; for (let i = 0; i < flux.length; i++) meanFlux += flux[i]; meanFlux /= Math.max(1, flux.length);
  if (meanFlux < 1.6) return 0;
  const lag = (hopRate * 60) / Math.max(60, tempo(flux, hopRate));
  const grid = (envelopeAt(low, lag) + 0.7 * envelopeAt(low, lag * 2) + 0.4 * envelopeAt(low, lag * 4) + 0.25 * envelopeAt(low, lag / 2)) / 2.35;
  return clamp(grid * 1.6, 0, 1);
}
