// Family-first scoring against genre centres. Pure functions.
// brightness and dynamics re-weighted by leave-one-out tuning on the training split (calibration/tune.js).
export const WEIGHTS = { bpm: 1.2, energy: 1.0, brightness: 0.4, texture: 0.7, bass: 1.3, dynamics: 1.05, pulse: 0.9 };
export const OCTAVE_PENALTY = 0.06;
export const CLUB_FAMILIES = new Set(['Rap', 'Techno', 'House', 'Trance', "Drum 'n' Bass", 'Breakbeat', 'Jamaican', 'World Pop', 'World Latin']);
export const GATED_FAMILIES = new Set(['Alternative', 'Contemporary', 'Folk', 'Country']);
const KEYS = Object.keys(WEIGHTS);
const nb = (b) => Math.min(1, Math.max(0, (b - 60) / 130));

export function distance(f, centre, bpm) {
  const useTempo = bpm > 0;
  const wsum = KEYS.reduce((a, k) => a + WEIGHTS[k], 0);
  const used = KEYS.reduce((a, k) => a + (k === 'bpm' && !useTempo ? 0 : WEIGHTS[k]), 0);
  const scale = wsum / used;
  let s = 0;
  for (const k of KEYS) {
    if (k === 'bpm') { if (useTempo) s += (WEIGHTS.bpm * scale * (nb(bpm) - nb(centre.bpm)) ** 2) / (centre.bpmSpread || 1) ** 2; continue; }
    s += WEIGHTS[k] * scale * (f[k] - centre[k]) ** 2;
  }
  return Math.sqrt(s);
}
export const fitFromDistance = (d) => Math.round(100 * Math.exp(-1.2 * d));

export function scoreGenre(f, profile) {
  const c = profile.features;
  let best = { d: distance(f, c, f.bpm), bpm: f.bpm, octave: f.bpm > 0 ? 'measured' : 'none' };
  const tries = [];
  if (f.bpm > 0 && f.bpm < 100) tries.push([f.bpm * 2, 'double']);
  if (f.bpm > 140) tries.push([f.bpm / 2, 'half']);
  for (const [b, oct] of tries) {
    if (b < 60 || b > 190) continue;
    const d = distance(f, c, b) + OCTAVE_PENALTY;
    if (d < best.d) best = { d, bpm: b, octave: oct };
  }
  return { id: profile.id, name: profile.name, family: profile.family, centreBpm: c.bpm, fit: fitFromDistance(best.d), d: best.d, tempoUsed: best.bpm, octave: best.octave };
}

export function confidence(top, second) {
  const m = top - (second ?? 0);
  if (top >= 80 && m >= 10) return 'high';
  if (top >= 60 && m >= 5) return 'medium';
  return 'low';
}

export function classify(f, profiles) {
  if (!f || f.silent) return { status: 'none', label: 'No clear genre', reason: 'The file is silent or too short to read.', ranked: [] };
  const ranked = profiles.map((p) => scoreGenre(f, p)).sort((a, b) => b.fit - a.fit);
  const fam = new Map();
  for (const r of ranked) if (!fam.has(r.family) || fam.get(r.family).fit < r.fit) fam.set(r.family, r);
  let families = [...fam.values()].sort((a, b) => b.fit - a.fit);
  const clubby = f.bass >= 0.6 || (f.pulse >= 0.6 && f.dynamics <= 0.35);
  if (clubby) {
    const bestClub = families.filter((r) => CLUB_FAMILIES.has(r.family))[0];
    if (bestClub) families = families.filter((r) => !GATED_FAMILIES.has(r.family) || r.fit >= bestClub.fit + 8);
  }
  const allowed = new Set(families.map((r) => r.family));
  const pool = ranked.filter((r) => allowed.has(r.family));
  const topFam = families[0];
  if (!topFam || topFam.fit < 40) return { status: 'none', label: 'No clear genre', reason: 'Nothing in the atlas sits close enough to name.', ranked: pool };
  const inFam = pool.filter((r) => r.family === topFam.family);
  const primary = inFam[0];
  const second = pool.find((r) => r !== primary);
  const conf = confidence(primary.fit, second?.fit);
  const fam2 = families[1];
  const hybrid = !!fam2 && topFam.fit >= 60 && fam2.fit >= 60 && topFam.fit - fam2.fit <= 6;
  const leans = pool.filter((r) => r !== primary).slice(0, 2).map((r) => r.name);
  let label;
  if (hybrid) label = `${topFam.family} × ${fam2.family}`;
  else if (conf === 'low') label = `${topFam.family}`;
  else label = `${primary.name}`;
  return {
    status: hybrid ? 'hybrid' : conf === 'low' ? 'family' : 'genre',
    label, family: topFam.family, primary, second, secondFamily: fam2?.family ?? null,
    confidence: conf, hybrid, leansToward: leans, tempoUsed: primary.tempoUsed, octave: primary.octave,
    clubGate: clubby, ranked: pool,
  };
}

export function whyLines(f, res) {
  const out = [];
  if (res.status === 'none') return [res.reason];
  if (f.bpm > 0) {
    const o = res.octave === 'half' ? ' (scored as half time)' : res.octave === 'double' ? ' (scored as double time)' : '';
    out.push(`Tempo reads ${Math.round(f.bpm)} BPM${o}. The ${res.primary.name} centre sits near ${res.primary.centreBpm} BPM.`);
  } else out.push('No steady tempo was found, so tempo was left out of the read.');
  if (f.bass >= 0.6) out.push('The low end carries the record, which pulls it toward club and rap rooms.');
  else if (f.bass <= 0.3) out.push('The low end stays light, where folk, songwriter and a lot of guitar music live.');
  if (f.dynamics >= 0.55) out.push('The dynamics actually move, the way played music does.');
  else if (f.dynamics <= 0.3 && f.energy >= 0.7) out.push('Loud and steady, the way a limited dance or rap master behaves.');
  if (f.pulse >= 0.7) out.push('Onsets come fast and dense.');
  else if (f.pulse <= 0.2) out.push('Very few sharp onsets; the track breathes.');
  if (res.status === 'family') out.push(`Low confidence: it sits in ${res.family}, leaning toward ${res.leansToward.join(' / ')}.`);
  if (res.status === 'hybrid') out.push('Two families fit and neither wins. Hybrid songs stay hybrid.');
  return out.slice(0, 4);
}
