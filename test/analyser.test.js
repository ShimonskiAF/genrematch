import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyse } from '../js/analyser.js';
import { classify } from '../js/scoring.js';
import { SR, clubLoop, acousticGuitar, silence, writeWav, readWav } from '../tools/synth.js';
const P = JSON.parse(fs.readFileSync(new URL('../data/genre_profiles.json', import.meta.url))).profiles;
const CLUB = new Set(['Rap', 'Techno', 'House', 'Trance', 'Hardcore Techno', "Drum 'n' Bass", 'Breakbeat', 'Jamaican', 'World Pop', 'World Latin']);
const ROCKISH = new Set(['Alternative', 'Contemporary', 'Folk', 'Country']);

test('club loop at 144 BPM: tempo ~144, heavy low end, steady dynamics, club/rap family', () => {
  const f = analyse(clubLoop(144, 70), SR); // >60 s, so the 3-window path runs
  assert.ok(Math.abs(f.bpm - 144) <= 3, `bpm ${f.bpm}`);
  assert.ok(f.bass >= 0.6, `bass ${f.bass}`);
  assert.ok(f.dynamics <= 0.4, `dyn ${f.dynamics}`);
  const r = classify(f, P);
  assert.ok(CLUB.has(r.family), `family ${r.family}`);
});

test('club loop at 76 BPM: tempo stays 76 (not 152), not read as rock/indie', () => {
  const f = analyse(clubLoop(76, 40), SR);
  assert.ok(Math.abs(f.bpm - 76) <= 3, `bpm ${f.bpm}`);
  assert.ok(f.bass >= 0.6 && f.dynamics <= 0.4, JSON.stringify(f));
  const r = classify(f, P);
  // A slow bass-heavy loop can fairly read as R&B; the point is it never reads as rock/indie.
  assert.ok((CLUB.has(r.family) || r.family === "Rhythm 'n' Blues") && !ROCKISH.has(r.family), `family ${r.family}`);
});

test('acoustic guitar: light low end, moving dynamics, Folk or Singer-Songwriter', () => {
  const f = analyse(acousticGuitar(40), SR);
  assert.ok(f.bass <= 0.35, `bass ${f.bass}`);
  assert.ok(f.dynamics >= 0.5, `dyn ${f.dynamics}`);
  const r = classify(f, P);
  const names = [r.primary?.name, r.family, r.label].join(' ');
  assert.match(names, /Folk|Singer-Songwriter/);
});

test('silence and a 2 s file give "No clear genre" without crashing', () => {
  assert.equal(classify(analyse(silence(10), SR), P).label, 'No clear genre');
  assert.equal(classify(analyse(clubLoop(144, 2), SR), P).label, 'No clear genre');
});

test('WAV round-trip feeds the same analyser', () => {
  const p = '/tmp/gm_rt.wav';
  writeWav(p, clubLoop(144, 12));
  const { samples, sampleRate } = readWav(p);
  assert.equal(sampleRate, SR);
  assert.ok(Math.abs(analyse(samples, sampleRate).bpm - 144) <= 3);
});

test('tempo vote is octave-aware across windows', async () => {
  const { voteTempo } = await import('../js/analyser.js');
  assert.equal(Math.round(voteTempo([126, 83, 126])), 126);
  assert.equal(Math.round(voteTempo([87, 174, 87])), 87);
  assert.equal(voteTempo([0, 0]), 0);
});
