// Adds the fallback head written by fit_fb.py to data/model_v2.json as model.fb; nothing else changes.
import fs from 'node:fs';
const p = new URL('../../data/model_v2.json', import.meta.url), m = JSON.parse(fs.readFileSync(p));
m.fb = JSON.parse(fs.readFileSync(process.argv[2])); fs.writeFileSync(p, JSON.stringify(m)); console.log('model.fb keys', m.fb.handKeys.length);
