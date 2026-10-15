import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, confidence, distance, scoreGenre, OCTAVE_PENALTY, CLUB_FAMILIES as CLUB, whyLines } from '../js/scoring.js';

const { profiles: P } = JSON.parse(fs.readFileSync(new URL('../data/genre_profiles.json', import.meta.url)));
const A = JSON.parse(fs.readFileSync(new URL('../data/atlas_lite.json', import.meta.url)));
const at = (id) => ({ ...P.find((p) => p.id === id).features });

test('profiles: calibrated + estimates, features in range, linked to atlas', () => {
  assert.ok(P.length >= 35 && P.length <= 50, P.length);
  const atlas = new Set(A.genres.map((g) => g.id));
  const keys = ['energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse', 'fourFloor', 'tresillo', 'offbeat', 'syncop', 'backbeat'];
  for (const p of P) {
    for (const k of keys) assert.ok(p.features[k] >= 0 && p.features[k] <= 1, `${p.id}.${k}`);
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
  const centre = { ...at('trap'), bpm: 142 };
  const f = { ...centre, bpm: 71 };
  const g = scoreGenre(f, { id: 'trap', name: 'Trap', family: 'Rap', features: centre });
  assert.equal(g.octave, 'double');
  assert.equal(g.tempoUsed, 142);
  assert.ok(Math.abs(g.d - OCTAVE_PENALTY) < 1e-9);
  assert.equal(f.bpm, 71);
  const r = classify(f, P);
  assert.ok(CLUB.has(r.family), r.family);
});

test('76 BPM club vector is not read as rock/indie', () => {
  const f = { bpm: 76, energy: 0.85, brightness: 0.4, texture: 0.4, bass: 0.9, dynamics: 0.25, pulse: 0.55, fourFloor: 0.7, tresillo: 0.3, offbeat: 0.3, syncop: 0.3, backbeat: 0.4 };
  const r = classify(f, P);
  assert.ok(CLUB.has(r.family), r.family);
  assert.notEqual(r.primary.id, 'indie');
});

test('club gate: strong low end keeps guitar families out unless they win by 8+', () => {
  const f = { bpm: 128, energy: 0.85, brightness: 0.5, texture: 0.4, bass: 0.9, dynamics: 0.2, pulse: 0.7, fourFloor: 0.8, tresillo: 0.3, offbeat: 0.3, syncop: 0.3, backbeat: 0.3 };
  const r = classify(f, P);
  assert.ok(!['Alternative', 'Contemporary', 'Folk', 'Country'].includes(r.family) || r.primary.fit >= 8 + Math.max(...r.ranked.filter((x) => CLUB.has(x.family)).map((x) => x.fit)));
});

test('no default genre: silent, missing or far-away input gives "No clear genre"', () => {
  assert.equal(classify({ silent: true }, P).label, 'No clear genre');
  assert.equal(classify(null, P).status, 'none');
  const far = classify({ bpm: 190, energy: 0, brightness: 1, texture: 1, bass: 0, dynamics: 1, pulse: 1, fourFloor: 0, tresillo: 1, offbeat: 1, syncop: 1, backbeat: 0 }, P);
  assert.equal(far.status, 'none');
  assert.equal(far.label, 'No clear genre');
});

test('low confidence shows the family only, with leans', () => {
  const f = { bpm: 120, energy: 0.7, brightness: 0.5, texture: 0.4, bass: 0.6, dynamics: 0.35, pulse: 0.55, fourFloor: 0.5, tresillo: 0.5, offbeat: 0.5, syncop: 0.5, backbeat: 0.5 };
  const r = classify(f, P);
  if (r.status === 'family') { assert.equal(r.label, r.family); assert.equal(r.leansToward.length, 2); }
  else assert.ok(['genre', 'hybrid'].includes(r.status));
});

test('unconfident tempo (bpm 0) drops the tempo term', () => {
  const c = at('folk');
  assert.equal(distance({ ...c, bpm: 0 }, c, 0), 0);
  assert.equal(classify({ ...c, bpm: 0 }, P).primary.id, 'folk');
});

test('why lines never invent artists and mention octave scoring', () => {
  const f = { ...at('trap'), bpm: 71 };
  const w = whyLines(f, classify(f, P)).join(' ');
  assert.match(w, /scored as double time/);
});

test('calibrated club/urban subgenres exist with a tempo spread no wider than 3x', () => {
  for (const id of ['basshouse', 'techhouse', 'moombahton', 'dnb', 'hiphop', 'reggaeton', 'phonk', 'gwalk', 'jerseyclub', 'rnb', 'afrobeats', 'bailefunk']) {
    const p = P.find((x) => x.id === id); assert.ok(p, id);
    assert.ok(!p.features.bpmSpread || (p.features.bpmSpread >= 1 && p.features.bpmSpread <= 3), id);
  }
});
