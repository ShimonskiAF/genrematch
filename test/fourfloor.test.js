import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fourOnFloorB } from '../js/fourfloor.js';
import { rankV2, inDomain, handHead } from '../js/rank2.js';
import { reasonsV2 } from '../js/reasons2.js';

const J = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const MODEL = J('../data/model_v2.json'), GRAPH = J('../data/atlas_graph.json'), P = J('../data/genre_profiles.json').profiles, FIX = J('./fixtures/v2_holdout.json');
const SR = 44100;
function kicks(bpm, sec, every = 1, jitter = 0) {
  const x = new Float32Array(sec * SR), beat = 60 / bpm; let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b * beat < sec; b++) {
    if (b % every) continue; const t0 = Math.floor((b * beat + (rnd() - 0.5) * jitter) * SR);
    for (let i = 0; i < 0.2 * SR && t0 + i < x.length; i++) { if (t0 + i < 0) continue; const t = i / SR; x[t0 + i] += 0.8 * Math.sin(2 * Math.PI * (150 * Math.exp(-t * 28) + 46) * t) * Math.exp(-t * 26); }
  }
  return x;
}

test('fourfloor: a steady 124 BPM kick reads as a strong grid; silence and short clips read 0', () => {
  const v = fourOnFloorB(kicks(124, 30), SR);
  assert.ok(v > 0.6, `steady kick ${v}`);
  assert.equal(fourOnFloorB(new Float32Array(SR * 10), SR), 0);
  assert.equal(fourOnFloorB(new Float32Array(SR), SR), 0);
});

test('fourfloor: a kick scattered off the grid reads lower than a locked one', () => {
  const locked = fourOnFloorB(kicks(124, 30), SR), loose = fourOnFloorB(kicks(124, 30, 1, 0.25), SR);
  assert.ok(loose < locked, `${loose} vs ${locked}`);
});

test('fallback head: used only without the mel path; full path is the original heads', () => {
  assert.ok(MODEL.fb && MODEL.fb.handKeys.includes('b_fofB'));
  assert.deepEqual(MODEL.fb.handKeys.slice(0, MODEL.handKeys.length), MODEL.handKeys);
  assert.equal(handHead(MODEL, null).handKeys, MODEL.fb.handKeys);
  assert.equal(handHead(MODEL, [0]), MODEL);
  const t = FIX[0], { fb, ...noFb } = MODEL;
  const a = inDomain(MODEL, t.base, t.v2, t.emb), b = inDomain(noFb, t.base, t.v2, t.emb);
  assert.deepEqual(a.p, b.p); // fb never touches the fused read
  const h = inDomain(MODEL, t.base, t.v2, null);
  assert.equal(h.x.length, MODEL.fb.handKeys.length);
  assert.ok(Math.abs(h.p.reduce((s, v) => s + v, 0) - 1) < 1e-9);
});

test('fallback head: reads and reasons work on the 18 fixture tracks without mel', () => {
  for (const t of FIX) {
    const r = rankV2({ f: t.base, v2: t.v2, mel: null, profiles: P, model: MODEL, graph: GRAPH });
    assert.ok(r.family && r.primary); assert.equal(r.trace.head.handKeys, MODEL.fb.handKeys);
    const rs = reasonsV2(r, t.base, MODEL, GRAPH); assert.ok(rs.headline.includes('→'), rs.headline);
  }
});
