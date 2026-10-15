// Offline harness: node tools/harness.js [file.wav ...]
// With no args it generates synthetic audio into test-audio/ and reads it.
import fs from 'node:fs';
import path from 'node:path';
import { analyse } from '../js/analyser.js';
import { classify, whyLines } from '../js/scoring.js';
import { SR, clubLoop, acousticGuitar, silence, writeWav, readWav } from './synth.js';
const P = JSON.parse(fs.readFileSync(new URL('../data/genre_profiles.json', import.meta.url))).profiles;
let files = process.argv.slice(2);
if (!files.length) {
  fs.mkdirSync('test-audio', { recursive: true });
  const gen = { 'club_144bpm.wav': clubLoop(144, 70), 'club_76bpm.wav': clubLoop(76, 40), 'acoustic_guitar.wav': acousticGuitar(40), 'silence.wav': silence(10) };
  for (const [n, x] of Object.entries(gen)) writeWav(path.join('test-audio', n), x);
  files = Object.keys(gen).map((n) => path.join('test-audio', n));
}
for (const f of files) {
  if (!f.toLowerCase().endsWith('.wav')) { console.log(`${f}: skipped (harness reads 16-bit WAV; convert with ffmpeg -i in.mp3 -ac 1 -ar 22050 out.wav)`); continue; }
  const { samples, sampleRate } = readWav(f);
  const feat = analyse(samples, sampleRate), r = classify(feat, P);
  const { raw, ...show } = feat;
  console.log(`\n${path.basename(f)}`);
  console.log('  features', JSON.stringify(show));
  console.log(`  read     ${r.label}  [${r.status}${r.confidence ? ', ' + r.confidence : ''}]${r.primary ? '  fit ' + r.primary.fit + '  tempo ' + r.tempoUsed + ' (' + r.octave + ')' : ''}`);
  console.log('  top 3   ', (r.ranked || []).slice(0, 3).map((g) => `${g.name} ${g.fit}`).join(' | '));
  console.log('  why     ', whyLines(feat, r).join(' '));
  if (raw) console.log('  raw     ', JSON.stringify(raw.map((w) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, Math.round(v * 1000) / 1000])))));
}
