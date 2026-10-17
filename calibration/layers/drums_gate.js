// Layer 1 gate: do the drum/groove features help the full-track classifier?
// node calibration/layers/drums_gate.js <groove_tracks.json> <loop_groove.json> <selected.json> [--write]
// Training split only for every choice (feature set, weights, prior scale) via 5-fold CV; the 126-track holdout is read once at the end.
import fs from 'node:fs';
import { GROOVE_KEYS } from '../../js/groove.js';
import { WEIGHTS, classify } from '../../js/scoring.js';
import { featuresFromRaw } from '../evaluate.js';
import { fit } from '../calibrate.js';
import { labelFor, buildHoldout, isHeldOut, SKIP_FITTING } from '../labels.js';
import { fitGauss, logLik, fStat, hash } from './groove_lib.js';
const [gtPath, glPath, selPath] = process.argv.slice(2);
const GT = JSON.parse(fs.readFileSync(gtPath)), GL = JSON.parse(fs.readFileSync(glPath)), SEL = JSON.parse(fs.readFileSync(selPath));
const T = JSON.parse(fs.readFileSync(new URL('../features.json', import.meta.url)));
buildHoldout(T);
const BASE_W = { ...WEIGHTS };
const usable = T.filter((t) => { const l = labelFor(t.folder); return l.family && !SKIP_FITTING.has(l.crate); })
  .map((t) => ({ ...t, lab: labelFor(t.folder), g: GT[`${t.root}|${t.folder}|${t.file}`] || null, base: featuresFromRaw(t.raw) }));
const held = usable.filter(isHeldOut), train = usable.filter((t) => !isHeldOut(t));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
const med = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sdv = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const withG = train.filter((t) => t.g);
// 0..1 scales from training tracks (5th..95th percentile)
const GSCALES = Object.fromEntries(GROOVE_KEYS.map((k) => { const v = withG.map((t) => t.g[k]); return [k, { lo: pct(v, 0.05), hi: pct(v, 0.95) }]; }));
const scaleG = (g) => g ? Object.fromEntries(GROOVE_KEYS.map((k) => [k, Math.min(1, Math.max(0, (g[k] - GSCALES[k].lo) / (GSCALES[k].hi - GSCALES[k].lo || 1)))])) : {};
const RNB_FAM = "Rhythm 'n' Blues", CONTRAST = new Set(['hiphop', 'trap', 'house', 'techhouse', 'basshouse', 'afrobeats', 'amapiano', 'phonk', 'gwalk']);

// --- contrast: R&B-family loops vs Rap/Trap/House/Afrobeats training-track drums, and R&B training tracks vs the same
const loopRows = SEL.filter((s) => GL[s.id]).map((s) => ({ g: GL[s.id], c: 'rnbfam' }));
const conRows = withG.filter((t) => CONTRAST.has(t.lab.sub)).map((t) => ({ g: t.g, c: 'contrast', sub: t.lab.sub }));
const rnbTracks = withG.filter((t) => t.lab.sub === 'rnb').map((t) => ({ g: t.g, c: 'rnbfam' }));
const fLoop = GROOVE_KEYS.map((k) => [k, fStat([...loopRows, ...conRows], k, (r) => r.c)]);
const fTrack = GROOVE_KEYS.map((k) => [k, fStat([...rnbTracks, ...conRows], k, (r) => r.c)]);
const dir = (rows, k) => med(rows.filter((r) => r.c === 'rnbfam').map((r) => r.g[k])) - med(rows.filter((r) => r.c === 'contrast').map((r) => r.g[k]));
const contrast = GROOVE_KEYS.map((k, i) => ({ k, Floops: +fLoop[i][1].toFixed(1), Ftracks: +fTrack[i][1].toFixed(1), loopDir: Math.sign(dir([...loopRows, ...conRows], k)), trackDir: Math.sign(dir([...rnbTracks, ...conRows], k)),
  rnbLoops: +med(loopRows.map((r) => r.g[k])).toFixed(3), rnbTracks: +med(rnbTracks.map((r) => r.g[k])).toFixed(3), rap: +med(conRows.filter((r) => ['hiphop', 'trap'].includes(r.sub)).map((r) => r.g[k])).toFixed(3), house: +med(conRows.filter((r) => ['house', 'techhouse', 'basshouse'].includes(r.sub)).map((r) => r.g[k])).toFixed(3), afro: +med(conRows.filter((r) => r.sub === 'afrobeats').map((r) => r.g[k])).toFixed(3) }))
  .sort((a, b) => b.Floops - a.Floops);

// --- variant A: groove keys as extra profile features (centres from training tracks), weight wg
function addGroove(P, rows, keys) {
  return P.map((p) => {
    const mine = rows.filter((t) => t.lab.sub === p.id && t.g); if (mine.length < 3) return p;
    const f = { ...p.features, spread: { ...(p.features.spread || {}) } };
    for (const k of keys) { const v = mine.map((t) => scaleG(t.g)[k]); f[k] = Math.round(100 * med(v)) / 100; f.spread[k] = Math.round(100 * Math.max(0.15, sdv(v))) / 100; }
    return { ...p, features: f };
  });
}
// --- variant B: R&B loop-groove prior. Log-likelihood ratio of the R&B-family loop model vs a contrast-track model, added to the R&B fit.
function priorModel(conTrain, keys) {
  const rows = [...loopRows.map((r) => ({ g: r.g, genre: 'rnbfam' })), ...conTrain.map((t) => ({ g: t.g, genre: 'contrast' }))];
  return fitGauss(rows, keys, (r) => r.genre);
}
function run(P, rows, cfg) {
  Object.assign(WEIGHTS, BASE_W); for (const k of GROOVE_KEYS) delete WEIGHTS[k];
  if (cfg.keys && cfg.wg) for (const k of cfg.keys) WEIGHTS[k] = cfg.wg;
  return rows.map((t) => {
    const f = { ...t.base, ...(cfg.keys ? scaleG(t.g) : {}) };
    let r = classify(f, P);
    if (cfg.prior && t.g && r.ranked?.length) {
      const ll = logLik(cfg.prior, t.g), llr = Math.max(-6, Math.min(6, ll.rnbfam - ll.contrast));
      const ranked = r.ranked.map((x) => x.family === RNB_FAM ? { ...x, fit: x.fit + cfg.alpha * llr } : x).sort((a, b) => b.fit - a.fit);
      r = ranked[0].fit < 40 ? { family: null, primary: null } : { family: ranked[0].family, primary: ranked[0] };
    }
    return { ok: r.family === t.lab.family, sub: r.primary?.id === t.lab.sub, crate: t.lab.crate, got: r.family };
  });
}
const acc = (rs) => rs.filter((r) => r.ok).length;
const folds = (t) => hash(t.file) % 5;
function cv(cfg) {
  let ok = 0, rnbOk = 0, rnbN = 0;
  for (let f = 0; f < 5; f++) {
    const tr = train.filter((t) => folds(t) !== f), te = train.filter((t) => folds(t) === f);
    let P = fit(tr); if (cfg.keys && cfg.wg) P = addGroove(P, tr, cfg.keys);
    const c = { ...cfg }; if (cfg.alpha) c.prior = priorModel(tr.filter((t) => t.g && CONTRAST.has(t.lab.sub)), cfg.pkeys);
    const rs = run(P, te, c); ok += acc(rs); for (const r of rs) if (r.crate === 'R&B Soul') { rnbN++; if (r.ok) rnbOk++; }
  }
  return { acc: ok / train.length, rnb: `${rnbOk}/${rnbN}` };
}
const byLoop = contrast.map((c) => c.k);
const agree = contrast.filter((c) => c.loopDir === c.trackDir && c.Ftracks >= 2).map((c) => c.k);
const grid = [{ name: 'base' }];
for (const n of [3, 5, 8, 13]) for (const wg of [0.2, 0.4, 0.8, 1.6]) { grid.push({ name: `A top${n} loopF w${wg}`, keys: byLoop.slice(0, n), wg }); }
for (const wg of [0.4, 0.8, 1.6]) grid.push({ name: `A agree(${agree.length}) w${wg}`, keys: agree, wg });
for (const n of [3, 5, 8]) for (const alpha of [1, 2, 4]) grid.push({ name: `B prior top${n} a${alpha}`, pkeys: byLoop.slice(0, n), alpha });
for (const alpha of [0.5, 1, 2, 4]) grid.push({ name: `B prior agree a${alpha}`, pkeys: agree, alpha });
for (const wg of [0.4, 0.8, 1.6]) for (const alpha of [0.5, 1, 2]) grid.push({ name: `A+B agree w${wg} a${alpha}`, keys: agree, wg, pkeys: agree, alpha });
const cvRes = grid.map((g) => ({ ...g, ...cv(g) }));
const rnbOf = (r) => +r.rnb.split('/')[0];
cvRes.sort((a, b) => b.acc - a.acc || rnbOf(b) - rnbOf(a)); // ties: better R&B recall in CV
const best = cvRes[0];
// final: fit on full training split, read the 126 once for baseline and the CV pick
const finalCfg = (cfg) => { let P = fit(train); if (cfg.keys && cfg.wg) P = addGroove(P, train, cfg.keys); const c = { ...cfg }; if (cfg.alpha) c.prior = priorModel(withG.filter((t) => CONTRAST.has(t.lab.sub)), cfg.pkeys); return { P, c }; };
const report = (cfg) => { const { P, c } = finalCfg(cfg); const rs = run(P, held, c); const rnb = rs.filter((r) => r.crate === 'R&B Soul'); const pc = {}; for (const r of rs) { pc[r.crate] ??= [0, 0]; pc[r.crate][1]++; if (r.ok) pc[r.crate][0]++; } return { perCrate: Object.fromEntries(Object.entries(pc).map(([k, [a, b]]) => [k, `${a}/${b}`])), family: `${acc(rs)}/${rs.length}`, sub: `${rs.filter((r) => r.sub).length}/${rs.length}`, rnb: `${acc(rnb)}/${rnb.length}`, rnbAs: Object.entries(rnb.filter((r) => !r.ok).reduce((m, r) => (m[r.got] = (m[r.got] || 0) + 1, m), {})), n: acc(rs), rnbN: acc(rnb) }; };
const baseH = report({ name: 'base' }), bestH = best.name === 'base' ? baseH : report(best);
const pass = best.name !== 'base' && bestH.n >= baseH.n && bestH.rnbN >= baseH.rnbN && (bestH.n > baseH.n || bestH.rnbN > baseH.rnbN);
const out = { trainN: train.length, heldN: held.length, tracksWithGroove: usable.filter((t) => t.g).length, contrast, agree, cvAll: cvRes.map((r) => [r.name, +(100 * r.acc).toFixed(1), r.rnb]), cvBase: cvRes.find((r) => r.name === 'base'), best: best.name, held: { base: baseH, best: bestH }, pass, GSCALES };
{ const L = run(finalCfg({ name: 'base' }).P, held, { name: 'base' }), { P, c } = finalCfg(best), N = run(P, held, c); let b = 0, cc = 0; L.forEach((r, i) => { if (r.ok && !N[i].ok) b++; if (!r.ok && N[i].ok) cc++; }); out.paired = { newOnly: cc, baseOnly: b, mcnemar: +(((Math.abs(b - cc) - 1) ** 2) / Math.max(1, b + cc)).toFixed(2) }; }
console.log(JSON.stringify(out, null, 1));
Object.assign(WEIGHTS, BASE_W);
if (process.argv.includes('--write')) {
  const loopModel = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--loops') + 1]));
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const doc = { layer: 'drums/grooves', family: "Rhythm 'n' Blues", genres: ['R&B', 'Soul', 'Neo-Soul', 'Alt R&B'], made: new Date().toISOString().slice(0, 10),
    loops: { counts: loopModel.counts, source: 'Factory drum loops on the Studio drive (Logic Apple Loops: Modern RnB, TRAKGIRL, Soulection, Tom Misch, Session Player, Motown/Jam Packs; one own Soul loop). Ableton Loopmasters packs are copy-protected and were skipped.', heldOut: loopModel.held, trainN: loopModel.trainN, heldN: loopModel.heldN, cvByK: loopModel.cvByK, featureRank: loopModel.featureRank, keys: loopModel.keys, model: loopModel.model, medians: loopModel.medians },
    contrast: out.contrast, scoring: { pass: out.pass, chosen: best.name, keys: best.keys || null, weight: best.wg || null, scales: Object.fromEntries(Object.entries(GSCALES).map(([k, v]) => [k, { lo: r3(v.lo), hi: r3(v.hi) }])), cv: out.cvAll.slice(0, 10), held126: out.held, paired: out.paired } };
  fs.writeFileSync(new URL('./drums_rnb.json', import.meta.url), JSON.stringify(doc, null, 1) + '\n');
  if (out.pass) {
    const P = addGroove(fit(train), train, best.keys);
    const prev = JSON.parse(fs.readFileSync(new URL('../../data/genre_profiles.json', import.meta.url)));
    fs.writeFileSync(new URL('../../data/genre_profiles.json', import.meta.url), JSON.stringify({ note: prev.note + ' Fitted profiles also carry groove centres (layer 1, drums: calibration/layers/drums_rnb.json).', profiles: P }, null, 1) + '\n');
    console.error('wrote data/genre_profiles.json + calibration/layers/drums_rnb.json');
  } else console.error('gate failed: wrote calibration/layers/drums_rnb.json only');
}
