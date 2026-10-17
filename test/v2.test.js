import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractV2, frames, downsample, melFilterbank, tempogramSummary, V2_KEYS, NMEL } from '../js/features2.js';
import { resample, oodEvidence, windows16k } from '../js/melpath.js';
import { rankV2, relation, inDomain, handVector, CONF_BANDS } from '../js/rank2.js';
import { reasonsV2, contributions } from '../js/reasons2.js';
import { mark, biasesFrom, FB, summary } from '../js/feedback.js';

const J = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const MODEL = J('../data/model_v2.json'), GRAPH = J('../data/atlas_graph.json'), P = J('../data/genre_profiles.json').profiles, FIX = J('./fixtures/v2_holdout.json');
const SR = 44100;
const sine = (f, sec, a = 0.5, sr = SR) => Float32Array.from({ length: Math.floor(sec * sr) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));
const clicks = (bpm, sec, sr = SR) => { const x = new Float32Array(Math.floor(sec * sr)), step = Math.round((60 / bpm) * sr); for (let i = 0; i < x.length; i += step) for (let k = 0; k < 200 && i + k < x.length; k++) x[i + k] = (1 - k / 200) * (Math.random() * 2 - 1); return x; };

test('features2: every documented key is produced and finite', () => {
  const r = extractV2(sine(440, 10), SR, 120);
  assert.deepEqual(Object.keys(r.v2).sort(), [...V2_KEYS].sort());
  for (const k of V2_KEYS) assert.ok(Number.isFinite(r.v2[k]), k);
  assert.equal(r.mel.mean.length, NMEL);
});

test('features2: a 440 Hz sine reads as A, centroid near 440, ZCR ~ 2f/sr, RMS ~ -9 dBFS', () => {
  const { v2 } = extractV2(sine(440, 8), SR, 0);
  const F = frames(downsample(sine(440, 4), SR).y, 22050);
  const ch = F.chroma[20]; assert.equal(ch.indexOf(1), 9); // C=0 ... A=9
  assert.ok(Math.abs(v2.centM - 440) < 60, v2.centM);
  assert.ok(Math.abs(v2.zcrM - (2 * 440) / 22050) < 0.005, v2.zcrM);
  assert.ok(Math.abs(v2.rmsDb - 20 * Math.log10(0.5 / Math.SQRT2)) < 1, v2.rmsDb);
  assert.ok(v2.flatM < -3, 'pure tone is not flat');
});

test('features2: white noise is flat and bright; tone is not', () => {
  const noise = Float32Array.from({ length: SR * 6 }, () => Math.random() - 0.5);
  const n = extractV2(noise, SR, 0).v2, t = extractV2(sine(300, 6), SR, 0).v2;
  assert.ok(n.flatM > t.flatM + 2);
  assert.ok(n.centM > 3000 && t.centM < 600);
});

test('features2: a click track at 120 BPM is regular and peaks at the beat lag', () => {
  const { v2 } = extractV2(clicks(120, 20), SR, 120);
  assert.ok(v2.regularity > 0.5, v2.regularity);
  assert.ok(v2.acBeat > v2.acThreeQ, `${v2.acBeat} vs ${v2.acThreeQ}`);
  const tg = tempogramSummary(Array.from({ length: 800 }, (_, i) => (i % 21 === 0 ? 1 : 0)), 22050 / 512, 123);
  assert.ok(tg.acBeat > 0.5);
});

test('mel filterbank: 64 bands, all non-empty, increasing centres', () => {
  const fb = melFilterbank(22050);
  assert.equal(fb.length, 64);
  let last = 0; for (const b of fb) { assert.ok(b.length > 0); const c = b.reduce((a, [k, w]) => a + k * w, 0) / b.reduce((a, [, w]) => a + w, 0); assert.ok(c >= last); last = c; }
});

test('resample 44.1k -> 16k keeps pitch and level, and windows16k picks 3 x 20 s on long files', () => {
  const y = resample(sine(1000, 2), SR, 16000);
  assert.ok(Math.abs(y.length - 32000) <= 1);
  let zc = 0; for (let i = 1; i < y.length; i++) if ((y[i] >= 0) !== (y[i - 1] >= 0)) zc++;
  assert.ok(Math.abs(zc / 2 / 2 - 1000) < 5, zc);
  const mid = y.subarray(1000, 31000); const rms = Math.sqrt(mid.reduce((a, v) => a + v * v, 0) / mid.length);
  assert.ok(Math.abs(rms - 0.5 / Math.SQRT2) < 0.01, rms);
  assert.equal(windows16k(new Float32Array(SR * 90), SR).length, 3);
});

test('model_v2: shapes line up and classes are atlas-linked profiles', () => {
  const ids = new Set(P.map((p) => p.id));
  for (const c of MODEL.classes) assert.ok(ids.has(c), c);
  for (const h of ['lr', 'lda']) { assert.equal(MODEL[h].mu.length, MODEL.handKeys.length); assert.equal(MODEL[h].W.length, MODEL.classes.length); assert.equal(MODEL[h].W[0].length, MODEL.handKeys.length); }
  assert.equal(MODEL.mel.W[0].length, 1024);
  assert.ok(MODEL.melWeight > 0 && MODEL.melWeight < 1);
  for (const k of ['thetaDist', 'thetaYam']) assert.ok(MODEL.ood[k] > 0 && MODEL.ood[k] < 1, k);
  assert.ok(MODEL.ood.novLo >= 2.5);
});

test('atlas graph: every profile has a super-genre, links resolve, families map to the six shelves', () => {
  for (const p of P) { const g = GRAPH.profiles[p.id]; assert.ok(g, p.id); assert.ok(GRAPH.supergenres.includes(g.super), p.id); assert.equal(GRAPH.familySuper[p.family], g.super); }
  assert.equal(GRAPH.supergenres.length, 6);
  const fam = Object.fromEntries(P.map((p) => [p.id, p.family]));
  assert.equal(relation(GRAPH, 'house', 'techhouse', fam), 1);
  assert.ok(relation(GRAPH, 'punk', 'rock', fam) < 0, 'anti-link');
  assert.equal(relation(GRAPH, 'trap', 'trap', fam), 0);
});

test('rankV2: probabilities sum to 1; hierarchy is consistent; near misses exclude the primary', () => {
  for (const t of FIX) {
    const r = rankV2({ f: t.base, v2: t.v2, mel: { emb: t.emb, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH });
    const s = r.ranked.reduce((a, g) => a + g.p, 0); assert.ok(Math.abs(s - 1) < 1e-6, s);
    assert.equal(r.primary.family, r.family); assert.equal(GRAPH.familySuper[r.family], r.super);
    assert.ok(r.nearMisses.length <= 2 && r.nearMisses.every((n) => n.id !== r.primary.id));
    assert.ok(r.confidencePct >= 0 && r.confidencePct <= 100);
    assert.equal(r.confidence, r.familyP >= CONF_BANDS.high ? 'high' : r.familyP >= CONF_BANDS.medium ? 'medium' : 'low');
  }
});

test('rankV2 on 18 held-out tracks (one per crate, features only, no audio): mel path beats features alone', () => {
  const acc = (useMel) => FIX.filter((t) => rankV2({ f: t.base, v2: t.v2, mel: useMel ? { emb: t.emb, scores: t.scores } : null, profiles: P, model: MODEL, graph: GRAPH }).family === t.family).length;
  const withMel = acc(true), handOnly = acc(false);
  assert.ok(withMel >= 12, `with mel ${withMel}/18`);
  assert.ok(withMel >= handOnly, `${withMel} vs ${handOnly}`);
});

test('rankV2: silent input reads as none; missing mel falls back to features', () => {
  assert.equal(rankV2({ f: { silent: true }, v2: null, profiles: P, model: MODEL, graph: GRAPH }).status, 'none');
  const t = FIX[0], r = rankV2({ f: t.base, v2: t.v2, mel: null, profiles: P, model: MODEL, graph: GRAPH });
  assert.equal(r.trace.melUsed, false); assert.ok(r.primary);
});

test('feedback: marks move the per-shelf prior, are capped, decay, and can flip a close read', () => {
  const now = Date.UTC(2026, 9, 18);
  const read = { primary: { id: 'house' }, nearMisses: [{ id: 'techhouse' }], confidencePct: 50 };
  let log = mark([], read, 'primary', null, now); assert.ok(biasesFrom(log, now).house > 0);
  log = mark([], read, 'near', 'techhouse', now); const b = biasesFrom(log, now); assert.ok(b.techhouse > 0 && b.house < 0);
  log = []; for (let i = 0; i < 50; i++) log = mark(log, read, 'none', null, now); assert.equal(biasesFrom(log, now).house, -FB.cap);
  const old = mark([], read, 'primary', null, now - FB.halfLifeDays * 864e5); assert.ok(Math.abs(biasesFrom(old, now).house - FB.step / 2) < 1e-9);
  assert.deepEqual(summary(mark(mark([], read, 'primary', null, now), read, 'none', null, now)), { n: 2, primary: 1, near: 0, none: 1 });
  const t = FIX.find((x) => x.sub === 'techhouse') || FIX[0];
  const base = rankV2({ f: t.base, v2: t.v2, mel: { emb: t.emb, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH });
  const alt = base.ranked[1].id;
  const flipped = rankV2({ f: t.base, v2: t.v2, mel: { emb: t.emb, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH, bias: { [alt]: 3 } });
  assert.ok(flipped.ranked.find((g) => g.id === alt).p > base.ranked.find((g) => g.id === alt).p);
});

test('reasons: headline is feature-based and ends with the primary shelf; lines stay short', () => {
  for (const t of FIX.slice(0, 6)) {
    const r = rankV2({ f: t.base, v2: t.v2, mel: { emb: t.emb, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH });
    const rs = reasonsV2(r, t.base, MODEL, GRAPH);
    assert.ok(rs.headline.endsWith(`→ ${r.primary.name}`), rs.headline);
    if (t.base.bpm) assert.match(rs.headline, /^\d+ BPM/);
    assert.ok(rs.lines.length <= 5 && rs.lines.every((l) => l.length < 160));
  }
  const x = handVector(FIX[0].base, FIX[0].v2, MODEL.handKeys);
  const c = contributions(MODEL, x, MODEL.classes[0], MODEL.classes[1]);
  assert.ok(c.length > 5 && c[0].c >= c.at(-1).c);
});

test('oodEvidence: rock-heavy AudioSet scores read as out-of-domain', () => {
  const s = new Array(521).fill(0); s[214] = 0.5; s[212] = 0.1;
  const e = oodEvidence(s); assert.ok(e.share > 0.8); assert.ok(e.per.rock > 0.99);
  assert.equal(oodEvidence(null), null);
});

test('inDomain: hand-only and fused both give a distribution', () => {
  const t = FIX[1];
  for (const emb of [null, t.emb]) { const r = inDomain(MODEL, t.base, t.v2, emb); assert.ok(Math.abs(r.p.reduce((a, b) => a + b, 0) - 1) < 1e-9); }
});

test('OOD gates: a far-off embedding pushes the read to estimate shelves', () => {
  const t = FIX[0], far = MODEL.mel.mu.map((m, j) => m + 6 * MODEL.mel.sd[j]);
  const r = rankV2({ f: t.base, v2: t.v2, mel: { emb: far, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH });
  assert.ok(r.trace.ood.gates.novelty > 0.9);
  const near = rankV2({ f: t.base, v2: t.v2, mel: { emb: t.emb, scores: t.scores }, profiles: P, model: MODEL, graph: GRAPH });
  assert.ok(near.trace.ood.m < 0.2, near.trace.ood.m);
});

test('prompt 4: slug-group cues only appear when the measurement agrees', async () => {
  const { groupCues, groupOf } = await import('../js/reasons2.js');
  const model = JSON.parse(fs.readFileSync(new URL('../data/model_v2.json', import.meta.url)));
  assert.equal(groupOf('cinematic'), 'lowRhythm'); assert.equal(groupOf('hardstyle'), 'highEnergy'); assert.equal(groupOf('futurebass'), 'vocalPop'); assert.equal(groupOf('house'), null);
  const x = model.lr.mu.slice(); assert.deepEqual(groupCues(model, x, 'cinematic'), []); // average track: no cue claimed
  const j = model.handKeys.indexOf('regularity'); x[j] = model.lr.mu[j] - 2 * model.lr.sd[j];
  assert.ok(groupCues(model, x, 'cinematic').includes('loose, non-grid rhythm'));
  assert.ok(!groupCues(model, x, 'hardstyle').length);
});
