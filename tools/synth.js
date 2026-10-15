// Synthetic test audio generators + minimal WAV read/write (16-bit PCM mono).
import fs from 'node:fs';
export const SR = 22050;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

export function clubLoop(bpm, seconds) {
  // Kick on every beat (808 on 1 and 3), snare/clap on 2 and 4, 16th hats, a sustained saw stab layer.
  const n = Math.floor(seconds * SR), x = new Float32Array(n), r = rng(7), beat = 60 / bpm;
  const add = (t0, fn, len) => { const s = Math.floor(t0 * SR); for (let i = 0; i < len * SR && s + i < n; i++) x[s + i] += fn(i / SR); };
  const kick = (t) => Math.sin(2 * Math.PI * (45 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 7) * 0.9;
  const s808 = (t) => Math.sin(2 * Math.PI * 49 * t) * Math.exp(-t * 0.9) * 0.75;
  const hat = (t) => r() * Math.exp(-t * 70) * 0.22;
  const snare = (t) => (r() * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.3) * Math.exp(-t * 18) * 0.5;
  const saw = (f) => (t) => (((t * f) % 1) * 2 - 1) * 0.07 * Math.exp(-t * 2);
  for (let b = 0, t = 0; t < seconds; b++, t = b * beat) {
    add(t, kick, 0.4);
    if (b % 2 === 0) add(t, s808, beat * 2);
    if (b % 2 === 1) add(t, snare, 0.3);
    for (let h = 0; h < 4; h++) add(t + (h * beat) / 4, hat, 0.06);
    add(t, saw(330 * (1 + (b % 3) * 0.25)), beat);
  }
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  for (let i = 0; i < n; i++) x[i] = Math.tanh((x[i] / pk) * 2.5) * 0.89; // limited, loud master
  return x;
}

export function acousticGuitar(seconds, bpm = 96) {
  const n = Math.floor(seconds * SR), x = new Float32Array(n), r = rng(3), beat = 60 / bpm;
  const chords = [[196, 247, 294, 392], [220, 262, 330, 440], [175, 220, 262, 349], [196, 247, 294, 392]];
  for (let b = 0, t = 0; t < seconds; b++, t = b * beat) {
    const phrase = Math.floor(b / 8) % 3, amp = [0.45, 1.0, 0.2][phrase]; // dynamics moves between phrases
    const ch = chords[Math.floor(b / 4) % 4];
    ch.forEach((f, j) => {
      const P = Math.round(SR / f), buf = Float32Array.from({ length: P }, () => r() * amp);
      const s = Math.floor((t + j * 0.012) * SR);
      for (let i = 0, k = 0; i < SR * 1.6 && s + i < n; i++, k = (k + 1) % P) { const nx = buf[(k + 1) % P]; x[s + i] += buf[k] * 0.5; buf[k] = 0.996 * 0.5 * (buf[k] + nx); }
    });
  }
  return x;
}

export const silence = (seconds) => new Float32Array(Math.floor(seconds * SR));

export function writeWav(path, x, sr = SR) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(path, b);
}
export function readWav(path) {
  const b = fs.readFileSync(path);
  let o = 12, sr = 0, ch = 1, bits = 16, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(o + 10); sr = b.readUInt32LE(o + 12); bits = b.readUInt16LE(o + 22); }
    if (id === 'data') data = b.subarray(o + 8, o + 8 + sz);
    o += 8 + sz + (sz % 2); }
  if (bits !== 16) throw new Error('only 16-bit PCM WAV supported');
  const n = data.length / 2 / ch, x = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let c = 0; c < ch; c++) s += data.readInt16LE((i * ch + c) * 2); x[i] = s / ch / 32768; }
  return { samples: x, sampleRate: sr };
}
