// GenreMatch groove layer (layer 1: drums/grooves). Pure functions over mono Float32Array samples.
// Reads band onset envelopes (kick / snare / hats) at ~3 ms resolution, folds them onto the beat and bar
// at a given tempo, and describes the groove: swing, timing looseness, hat density, ghost notes,
// backbeat strength, half-time feel, kick syncopation, triplet feel. Browser and Node.
const FRAME = 1024, HOP = 128;
const HANN = Float32Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2; const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
}
const BANDS = { kick: [30, 150], snare: [1000, 5000], hat: [7000, 16000] };
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function bandEnvelopes(x, sr) {
  const n = Math.floor((x.length - FRAME) / HOP) + 1;
  const re = new Float64Array(FRAME), im = new Float64Array(FRAME), half = FRAME / 2, binHz = sr / FRAME;
  const names = Object.keys(BANDS);
  const rng = names.map((k) => [Math.max(1, Math.floor(BANDS[k][0] / binHz)), Math.min(half - 1, Math.ceil(BANDS[k][1] / binHz))]);
  const pow = names.map(() => new Float64Array(n));
  for (let f = 0; f < n; f++) {
    const o = f * HOP;
    for (let i = 0; i < FRAME; i++) { re[i] = (x[o + i] || 0) * HANN[i]; im[i] = 0; }
    fft(re, im);
    rng.forEach(([a, z], j) => { let s = 0; for (let k = a; k <= z; k++) s += re[k] * re[k] + im[k] * im[k]; pow[j][f] = s; });
  }
  // band power -> log level relative to the band's loud level -> positive change over ~6 ms = hit strength
  const fr = sr / HOP, env = {};
  names.forEach((k, j) => {
    const p = pow[j], ref = Math.max(1e-12, pctl(p, 0.99)), lv = new Float64Array(n), e = new Float64Array(n);
    for (let i = 0; i < n; i++) lv[i] = Math.log10(1 + 1000 * p[i] / ref);
    for (let i = 2; i < n; i++) e[i] = Math.max(0, lv[i] - lv[i - 2]);
    env[k] = e;
  });
  return { env, fr };
}

const pctl = (e, p) => { const a = Float64Array.from(e).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
// Onset events of one band: local maxima above 8% of the band's loud level, with a minimum gap.
function events(e, fr, minGapS) {
  const loud = pctl(e, 0.995) || 1e-12, th = 0.08 * loud, gap = Math.round(minGapS * fr), out = [];
  for (let i = 1; i < e.length - 1; i++) if (e[i] > th && e[i] >= e[i - 1] && e[i] > e[i + 1]) {
    if (out.length && i - out.at(-1)[0] < gap) { if (e[i] > out.at(-1)[1]) out[out.length - 1] = [i, e[i]]; continue; }
    out.push([i, e[i]]);
  }
  return { ev: out, loud };
}
const toSparse = (n, ev) => { const a = new Float64Array(n); for (const [i, v] of ev) a[i] = v; return a; };
// Fold an envelope onto a cycle of `period` frames, `bins` bins, starting at frame `phase`.
function fold(e, period, bins, phase = 0) {
  const h = new Float64Array(bins);
  for (let i = 0; i < e.length; i++) { if (!e[i]) continue; let p = ((i - phase) / period) % 1; if (p < 0) p += 1; h[Math.floor(p * bins) % bins] += e[i]; }
  return h;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);
const win = (h, c, w) => { const n = h.length; let s = 0; for (let d = -w; d <= w; d++) s += h[(((Math.round(c * n) + d) % n) + n) % n]; return s; };
const centroidIn = (h, a, b) => { const n = h.length; let s = 0, w = 0; for (let i = Math.floor(a * n); i < Math.ceil(b * n); i++) { const p = (i + 0.5) / n; s += h[i % n] * p; w += h[i % n]; } return w > 0 ? s / w : null; };

export const GROOVE_KEYS = ['gTempo', 'swing8', 'swing16', 'tight', 'hatDensity', 'hat16', 'triplet', 'kickDensity', 'kickOff', 'snareOn', 'backbeat2', 'halfTime', 'ghost'];

export function grooveWindow(x, sr, bpm) {
  if (!bpm || bpm <= 0) return null;
  const { env, fr } = bandEnvelopes(x, sr);
  const n = env.kick.length; if (n < fr * 2) return null;
  const K = events(env.kick, fr, 0.06), S = events(env.snare, fr, 0.05), H = events(env.hat, fr, 0.03);
  const ev = { kick: toSparse(n, K.ev), snare: toSparse(n, S.ev), hat: toSparse(n, H.ev) };
  let b = bpm; while (b < 80) b *= 2; while (b >= 160) b /= 2;      // same fold as the analyser's rhythm read
  const NB = 96;
  // tempo refine ±1.5% and beat phase: maximise the peak of the kick+snare beat fold
  const ks = new Float64Array(n); for (let i = 0; i < n; i++) ks[i] = ev.kick[i] + ev.snare[i];
  let best = { s: -1, P: (60 * fr) / b };
  for (let r = -6; r <= 6; r++) { const P = (60 * fr) / (b * (1 + r * 0.0025)); const h = fold(ks, P, NB); let mx = 0; for (let i = 0; i < NB; i++) { const v = h[i] + h[(i + 1) % NB] + h[(i + NB - 1) % NB]; if (v > mx) mx = v; } if (mx > best.s) best = { s: mx, P }; }
  const P = best.P;
  // beat phase from the kick (beat 1 carries the kick in nearly every style); kick+snare if the kick is thin
  const hkK = fold(ev.kick, P, NB), useK = K.ev.length >= 0.5 * (n / P) / 4;
  const hk = useK ? hkK : fold(ks, P, NB); let pk = 0, pv = -1;
  for (let i = 0; i < NB; i++) { const v = hk[i] + 0.7 * (hk[(i + 1) % NB] + hk[(i + NB - 1) % NB]); if (v > pv) { pv = v; pk = i; } }
  const phase = (pk / NB) * P;
  const kB = fold(ev.kick, P, NB, phase), sB = fold(ev.snare, P, NB, phase), hB = fold(ev.hat, P, NB, phase);
  const hs = hB.map((v, i) => v + 0.5 * sB[i]);
  const tot = sum(hs) || 1e-12, kT = sum(kB) || 1e-12, sT = sum(sB) || 1e-12;
  // swing: where the off-8th and off-16ths actually land (straight = 0, full triplet swing = 1)
  const c8 = centroidIn(hs, 0.40, 0.80), c16a = centroidIn(hs, 0.15, 0.42), c16b = centroidIn(hs, 0.65, 0.92);
  const swing8 = c8 == null ? 0 : (c8 - 0.5) / (1 / 6);
  const swing16 = c16a == null || c16b == null ? 0 : ((c16a - 0.25) + (c16b - 0.75)) / 2 / (1 / 12);
  // timing tightness: share of hat+snare energy within ±2 bins (~2% of a beat) of the fold's peaks
  const pkIdx = []; const mx = Math.max(...hs); for (let i = 0; i < NB; i++) if (hs[i] >= 0.1 * mx && hs[i] >= hs[(i + NB - 1) % NB] && hs[i] >= hs[(i + 1) % NB]) pkIdx.push(i);
  const near = new Uint8Array(NB); for (const i of pkIdx) for (let d = -2; d <= 2; d++) near[(i + d + NB) % NB] = 1;
  let tE = 0; for (let i = 0; i < NB; i++) if (near[i]) tE += hs[i];
  const tight = tE / tot;
  // hats: 16th vs 8th grid, triplet positions vs straight
  const hT = sum(hB) || 1e-12;
  const on8 = win(hB, 0, 3) + win(hB, 0.5, 3), on16 = win(hB, 0.25, 3) + win(hB, 0.75, 3);
  const hat16 = on16 / (on8 + on16 + 1e-12);
  const trip = win(hs, 1 / 3, 2) + win(hs, 2 / 3, 2), str = win(hs, 0.25, 2) + win(hs, 0.5, 2) + win(hs, 0.75, 2);
  const triplet = trip / (trip + str + 1e-12);
  const beats = n / P;
  const hatDensity = H.ev.filter((p) => p[1] >= 0.25 * H.loud).length / beats;
  const kickDensity = K.ev.filter((p) => p[1] >= 0.3 * K.loud).length / beats;
  const kickOff = 1 - win(kB, 0, 6) / kT;                                  // kick energy away from the beat
  const snareOn = (win(sB, 0, 6) + win(sB, 0.5, 4)) / sT;                  // snare on beat / off-8th vs elsewhere
  // bar level: snare energy on each of 4 beats (rotation unknown, so read rotation-free contrasts)
  const sBar = fold(ev.snare, 4 * P, 4 * NB, phase), e = [0, 1, 2, 3].map((j) => win(sBar, j / 4, 8)), eT = sum(e) || 1e-12;
  const backbeat2 = Math.abs(e[0] + e[2] - e[1] - e[3]) / eT;              // 2&4 (or 1&3) alternation
  let im = 0; for (let j = 1; j < 4; j++) if (e[j] > e[im]) im = j;
  const halfTime = (e[im] - e[(im + 2) % 4]) / (e[im] + e[(im + 2) % 4] + 1e-12); // one big snare per bar (beat 3)
  // ghost notes: soft snare-band hits (15-45% of the loud ones) per beat
  const loud = median(S.ev.map((p) => p[1]).sort((a, z) => z - a).slice(0, Math.max(1, Math.round(S.ev.length * 0.2))));
  const ghost = S.ev.filter((p) => p[1] >= 0.12 * loud && p[1] <= 0.4 * loud).length / beats;
  let gt = 60 * fr / P; while (gt >= 130) gt /= 2; while (gt < 65) gt *= 2;
  return { gTempo: gt, swing8, swing16, tight, hatDensity, hat16, triplet, kickDensity, kickOff, snareOn, backbeat2, halfTime, ghost };
}

// Same windows as analyse(): whole file under 60 s, else three 20 s windows. bpm = analyser's voted tempo.
export function groove(samples, sr, bpm) {
  const dur = samples.length / sr, wins = [];
  if (dur < 60) wins.push(samples);
  else for (const p of [0.15, 0.45, 0.75]) { const s = Math.floor(p * samples.length), n = Math.floor(20 * sr); wins.push(samples.subarray(s, Math.min(samples.length, s + n))); }
  const res = wins.filter((w) => w.length >= sr * 2).map((w) => grooveWindow(w, sr, bpm)).filter(Boolean);
  if (!res.length) return null;
  return Object.fromEntries(GROOVE_KEYS.map((k) => [k, median(res.map((r) => r[k]))]));
}

// Layer 1 scoring hook (calibration/layers/drums_rnb.json): the groove reads that passed the gate, scaled 0..1
// on training-track 5th..95th percentiles. Profiles carry centres for these keys; weights live in scoring.js.
export const GROOVE_SCORED = ["ghost", "tight", "kickDensity", "hatDensity", "backbeat2", "kickOff", "gTempo", "halfTime"];
export const GROOVE_SCALES = {"ghost": {"lo": 1.381, "hi": 3.894}, "tight": {"lo": 0.636, "hi": 0.974}, "kickDensity": {"lo": 1.425, "hi": 4.92}, "hatDensity": {"lo": 1.722, "hi": 4.88}, "backbeat2": {"lo": 0.027, "hi": 0.419}, "kickOff": {"lo": 0.53, "hi": 0.823}, "gTempo": {"lo": 67.5, "hi": 128}, "halfTime": {"lo": 0.034, "hi": 0.501}};
export function scaleGroove(g) {
  if (!g) return {};
  return Object.fromEntries(GROOVE_SCORED.map((k) => { const s = GROOVE_SCALES[k]; return [k, Math.min(1, Math.max(0, (g[k] - s.lo) / (s.hi - s.lo || 1)))]; }));
}
