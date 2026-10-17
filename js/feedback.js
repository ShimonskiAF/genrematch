// Local feedback: after a read the artist can mark "Primary right", "Near miss better" or "None of these".
// Stored in this browser only (localStorage). Each mark nudges a small per-shelf log-prior that rankV2 adds
// before it normalises, so a shelf the artist keeps confirming rises and one they keep rejecting falls.
// Simple reweighting, capped, and decays with age so old marks fade. No server, nothing leaves the browser.
export const FB_KEY = 'genrematch.feedback.v1';
export const FB = { step: 0.15, cap: 0.6, halfLifeDays: 60, max: 500 };
export function mark(log, read, choice, chosenId = null, now = Date.now()) {
  const e = { t: now, primary: read.primary?.id, near: (read.nearMisses || []).map((n) => n.id), choice, chosen: chosenId, conf: read.confidencePct };
  return [...log, e].slice(-FB.max);
}
export function biasesFrom(log, now = Date.now()) {
  const b = {};
  const add = (id, v) => { if (id) b[id] = (b[id] || 0) + v; };
  for (const e of log) {
    const w = FB.step * 0.5 ** ((now - e.t) / (FB.halfLifeDays * 864e5));
    if (e.choice === 'primary') add(e.primary, w);
    else if (e.choice === 'near') { add(e.chosen || e.near?.[0], w); add(e.primary, -w); }
    else if (e.choice === 'none') { add(e.primary, -w); for (const n of e.near || []) add(n, -w / 2); }
  }
  for (const k of Object.keys(b)) b[k] = Math.max(-FB.cap, Math.min(FB.cap, b[k]));
  return b;
}
export function summary(log) {
  const n = log.length, c = (k) => log.filter((e) => e.choice === k).length;
  return { n, primary: c('primary'), near: c('near'), none: c('none') };
}
// Browser helpers (guarded so Node tests can import this file).
export function loadLog(store = globalThis.localStorage) { try { return JSON.parse(store?.getItem(FB_KEY) || '[]'); } catch { return []; } }
export function saveLog(log, store = globalThis.localStorage) { try { store?.setItem(FB_KEY, JSON.stringify(log)); } catch { /* private mode: keep in memory */ } }
