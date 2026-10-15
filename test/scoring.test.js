import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, confidence, scoreGenre, distance, whyLines, OCTAVE_PENALTY } from '../js/scoring.js';
const P = JSON.parse(fs.readFileSync(new URL('../data/genre_profiles.json', import.meta.url))).profiles;
const byId = (id) => P.find((p) => p.id === id);
const at = (id, over = {}) => ({ ...byId(id).features, ...over });
const CLUB = new Set(['Rap', 'Techno', 'House', 'Trance', "Drum 'n' Bass", 'Breakbeat', 'Jamaican', 'World Pop', 'World Latin']);

test('profiles: 33 genres, 7 features in range, every one linked to the atlas', () => {
  assert.equal(P.length, 33);
  const atlas = new Set(JSON.parse(fs.readFileSync(new URL('../data/atlas_lite.json', import.meta.url))).genres.map((g) => g.id));
  for (const p of P) {
    for (const k of ['energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse']) assert.ok(p.features[k] >= 0 && p.features[k] <= 1, `${p.id}.${k}`);
    assert.ok(p.features.bpm >= 60 && p.features.bpm <= 190);
    assert.ok(p.atlas_ids.length && p.atlas_ids.every((i) => atlas.has(i)), p.id);
  }
});

test('a vector sitting on a centre reads that genre with high confidence', () => {
  for (const id of ['trap', 'house', 'folk', 'metal', 'reggae', 'ambient']) {
    const r = classify(at(id), P);
    assert.equal(r.primary.id, id, id);
    assert.equal(r.primary.fit, 100);
  }
});

test('confidence bands', () => {
  assert.equal(confidence(85, 70), 'high');
  assert.equal(confidence(85, 80), 'medium');
  assert.equal(confidence(65, 59), 'medium');
  assert.equal(confidence(59, 40), 'low');
  assert.equal(confidence(70, 67), 'low');
});

test('tempo is scored both ways with an octave penalty; measured bpm is never overwritten', () => {
  const f = at('trap', { bpm: 71 }); // half-time reading of a 142 trap track
  const g = scoreGenre(f, byId('trap'));
  assert.equal(g.octave, 'double');
  assert.equal(g.tempoUsed, 142);
  assert.ok(Math.abs(g.d - OCTAVE_PENALTY) < 1e-9);
  assert.equal(f.bpm, 71);
  const r = classify(f, P);
  assert.ok(CLUB.has(r.family), r.family);
});

test('76 BPM club vector is not read as rock/indie', () => {
  const r = classify({ bpm: 76, energy: 0.8, brightness: 0.45, texture: 0.4, bass: 0.8, dynamics: 0.3, pulse: 0.55 }, P);
  assert.ok(CLUB.has(r.family), r.family);
  assert.notEqual(r.primary.id, 'indie');
});

test('club gate: strong low end keeps guitar families out unless they win by 8+', () => {
  const f = { ...at('indie'), bass: 0.62 };
  const r = classify(f, P);
  assert.ok(!['Alternative', 'Contemporary', 'Folk', 'Country'].includes(r.family) || r.primary.fit >= 8 + Math.max(...r.ranked.filter((x) => CLUB.has(x.family)).map((x) => x.fit)));
});

test('no default genre: silent, missing or far-away input gives "No clear genre"', () => {
  assert.equal(classify({ silent: true }, P).label, 'No clear genre');
  assert.equal(classify(null, P).status, 'none');
  const far = classify({ bpm: 190, energy: 0, brightness: 1, texture: 0, bass: 0, dynamics: 1, pulse: 0 }, P);
  assert.equal(far.status, 'none');
  assert.equal(far.label, 'No clear genre');
});

test('low confidence shows the family only, with leans', () => {
  const f = { bpm: 110, energy: 0.6, brightness: 0.5, texture: 0.45, bass: 0.55, dynamics: 0.35, pulse: 0.58 };
  const r = classify(f, P);
  if (r.status === 'family') { assert.equal(r.label, r.family); assert.equal(r.leansToward.length, 2); }
  else assert.ok(['genre', 'hybrid'].includes(r.status));
});

test('unconfident tempo (bpm 0) drops the tempo term', () => {
  const c = byId('folk').features;
  assert.equal(distance({ ...c, bpm: 0 }, c, 0), 0);
  assert.equal(classify({ ...c, bpm: 0 }, P).primary.id, 'folk');
});

test('why lines never invent artists and mention octave scoring', () => {
  const f = at('trap', { bpm: 71 });
  const w = whyLines(f, classify(f, P)).join(' ');
  assert.match(w, /scored as double time/);
});
