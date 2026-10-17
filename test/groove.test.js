import test from 'node:test';
import assert from 'node:assert/strict';
import { groove, GROOVE_KEYS, scaleGroove, GROOVE_SCORED } from '../js/groove.js';

// Synthetic drum loop: kick on 1 and 3, snare on 2 and 4, hats on 8ths (offbeat hats at `swingPos` of the beat).
function loop({ bpm = 96, bars = 8, swingPos = 0.5, sr = 44100 } = {}) {
  const beat = 60 / bpm, n = Math.floor(bars * 4 * beat * sr), x = new Float32Array(n);
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const hit = (t, kind) => { const s = Math.floor(t * sr); const len = Math.floor((kind === 'kick' ? 0.15 : kind === 'snare' ? 0.12 : 0.03) * sr);
    for (let i = 0; i < len && s + i < n; i++) { const e = Math.exp(-i / (len / 5)); x[s + i] += kind === 'kick' ? 0.8 * e * Math.sin(2 * Math.PI * 60 * i / sr) : kind === 'snare' ? 0.4 * e * rnd() : 0.15 * e * (rnd() - (i % 2 ? 0.5 : -0.5)); } };
  for (let b = 0; b < bars * 4; b++) { const t = b * beat; hit(t, b % 2 ? 'snare' : 'kick'); hit(t, 'hat'); hit(t + swingPos * beat, 'hat'); }
  return { x, sr };
}
test('groove returns every key, finite', () => {
  const { x, sr } = loop(); const g = groove(x, sr, 96);
  for (const k of GROOVE_KEYS) assert.ok(Number.isFinite(g[k]), k);
  for (const v of Object.values(scaleGroove(g))) assert.ok(v >= 0 && v <= 1);
  assert.equal(Object.keys(scaleGroove(g)).length, GROOVE_SCORED.length);
});
test('swung hats read as more swing than straight hats', () => {
  const a = loop({ swingPos: 0.5 }), b = loop({ swingPos: 2 / 3 });
  const s0 = groove(a.x, a.sr, 96).swing8, s1 = groove(b.x, b.sr, 96).swing8;
  assert.ok(s1 > s0 + 0.3, `straight ${s0.toFixed(2)} swung ${s1.toFixed(2)}`);
});
test('no tempo, no groove read', () => { const { x, sr } = loop(); assert.equal(groove(x, sr, 0), null); assert.deepEqual(scaleGroove(null), {}); });
