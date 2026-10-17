import { analyse, toMono } from './analyser.js';
import { groove, scaleGroove } from './groove.js';
import { extractV2 } from './features2.js';
import { rankV2 } from './rank2.js';
import { reasonsV2 } from './reasons2.js';
import { melRead, loadMel } from './mel_browser.js';
import { loadLog, saveLog, mark, biasesFrom, summary as fbSummary } from './feedback.js';
import { marketFor } from './market.js';
import { briefArticle, briefDocument, printDocument } from './brief.js';

const view = document.getElementById('view');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let PROFILES = [], ATLAS = { genres: [], families: [] }, ATLAS_BY_ID = new Map(), MODEL = null, GRAPH = null;
let FEEDBACK = loadLog();
const lastRead = { current: null };
const project = { name: '', kind: 'EP', tracks: [] }; // in memory only; gone when the tab closes

async function loadData() {
  const [p, a, m, g] = await Promise.all(['data/genre_profiles.json', 'data/atlas_lite.json', 'data/model_v2.json', 'data/atlas_graph.json'].map((u) => fetch(u).then((r) => r.json())));
  PROFILES = p.profiles; MODEL = m; GRAPH = g; ATLAS = a; ATLAS_BY_ID = new Map(a.genres.map((g) => [g.id, g]));
  for (const pr of PROFILES) pr.atlas = pr.atlas_ids.map((id) => ATLAS_BY_ID.get(id)).filter(Boolean);
}

function listenAlikes(res) {
  if (res.status === 'none') return [];
  const pr = PROFILES.find((p) => p.id === res.primary.id);
  const out = [];
  for (const g of pr?.atlas || []) {
    out.push({ name: g.name, family: g.family, bpm: g.bpm_range ? `${g.bpm_range[0]}–${g.bpm_range[1]} BPM` : '', line: [g.artists.length ? `Artists: ${g.artists.slice(0, 3).join(', ')}` : '', g.related.length ? `Related: ${g.related.slice(0, 3).join(', ')}` : ''].filter(Boolean).join('. ') });
  }
  return out;
}

async function decodeFile(file) {
  // Decode at 44.1 kHz whatever the device rate, to match calibration (ffmpeg, 44.1 kHz).
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const data = await file.arrayBuffer();
  let buf;
  try { buf = await new OAC(1, 1, 44100).decodeAudioData(data.slice(0)); }
  catch { const AC = window.AudioContext || window.webkitAudioContext; const ctx = new AC(); try { buf = await ctx.decodeAudioData(data); } finally { ctx.close(); } }
  const ch = []; for (let i = 0; i < buf.numberOfChannels; i++) ch.push(buf.getChannelData(i));
  return { samples: toMono(ch), sampleRate: buf.sampleRate };
}

async function readFile(file) {
  const { samples, sampleRate } = await decodeFile(file);
  await new Promise((r) => setTimeout(r, 20));
  const features = analyse(samples, sampleRate);
  if (!features.silent && features.bpm > 0) { features.groove = groove(samples, sampleRate, features.bpm); Object.assign(features, scaleGroove(features.groove)); }
  const x2 = features.silent ? null : extractV2(samples, sampleRate, features.bpm || 0);
  let mel = null;
  if (!features.silent) { try { mel = await melRead(samples, sampleRate); } catch (e) { console.warn('[GenreMatch] mel path failed', e); } }
  const result = rankV2({ f: features, v2: x2?.v2, mel, profiles: PROFILES, model: MODEL, graph: GRAPH, bias: biasesFrom(FEEDBACK) });
  const rs = reasonsV2(result, features, MODEL, GRAPH);
  console.info('[GenreMatch] read', { raw: features.raw, v2: x2?.v2, drivers: rs.drivers, supers: result.supers, families: result.families, mel: mel ? mel.backend : 'off' });
  return { source: file.name, features, v2: x2?.v2, melOn: !!mel, result, why: rs.lines, headline: rs.headline, listen: listenAlikes(result), fb: null };
}

function confText(r) {
  if (r.status === 'none') return 'No clear genre';
  if (r.hybrid) return 'Hybrid';
  if (isEstRead(r)) return 'Estimated';
  return { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[r.confidence];
}
// Estimate shelves (no labelled tracks yet): always shown as estimated, low confidence (v2-tweaks D).
const EST = { chip: 'Estimated · low confidence', line: 'No labelled tracks for this shelf yet.', tag: ' · est.' };
const isEstRead = (r) => r.status !== 'none' && !!r.primary?.estimate;
const TRUST = { high: 'Trust the primary.', medium: 'Check the near misses.', low: 'Treat it as a lean.' };
function feedbackRow(read) {
  const r = read.result;
  if (r.status === 'none') return '';
  if (read.fb) return `<div class="gm-fb"><span class="gm-caps">Thanks</span><span class="gm-muted">Saved on this device. Future reads lean your way.</span></div>`;
  const nm = (r.nearMisses || []).map((n) => `<button class="gm-btn gm-btn--ghost gm-btn--sm" data-fb="near" data-id="${esc(n.id)}">${esc(n.name)} fits better</button>`).join('');
  return `<div class="gm-fb"><span class="gm-caps">Was this right?</span><div class="gm-row"><button class="gm-btn gm-btn--sm" data-fb="primary">Primary right</button>${nm}<button class="gm-btn gm-btn--ghost gm-btn--sm" data-fb="none">None of these</button></div></div>`;
}

function readCard(read) {
  const { features: f, result: r, why, listen } = read;
  const meter = (k, v, p) => `<div class="gm-meter" style="--v:${p}%"><span>${k}</span><span>${v}</span></div>`;
  const tempo = f.bpm ? `${Math.round(f.bpm)} BPM${r.octave === 'half' ? ' · scored half time' : r.octave === 'double' ? ' · scored double time' : ''}` : '—';
  const sub = r.status === 'none' ? r.reason : r.status === 'family' ? `${confText(r)}. ${r.family} only${r.leansToward.length ? `, leaning ${r.leansToward.join(' / ')}` : ''}.` : r.hybrid ? `Hybrid: ${r.family} with ${r.secondFamily}. Both fit.` : `${confText(r)}.`;
  const m = marketFor(r.family);
  return `<section class="gm-card gm-stack" aria-live="polite">
    <div class="gm-readhead"><div><div class="gm-caps">Primary read</div><div class="gm-genre">${esc(r.label)}</div><p><em>${esc(sub)}</em></p></div>
    <div><div class="gm-caps">Confidence</div><div class="gm-fit">${r.status === 'none' ? '—' : r.confidencePct + '%'}</div><div class="gm-muted">${r.status === 'none' ? '' : esc(isEstRead(r) ? TRUST.low : TRUST[r.confidence])}</div></div></div>
    ${isEstRead(r) ? `<p class="gm-est"><span class="gm-chip gm-chip--est">${EST.chip}</span><span class="gm-muted">${EST.line}</span></p>` : ''}
    ${r.status === 'none' ? '' : `<p class="gm-path"><span>${esc(r.super)}</span> › <span>${esc(r.family)}</span> › <strong>${esc(r.primary.name)}</strong></p>`}
    ${r.nearMisses?.length ? `<div class="gm-near"><span class="gm-caps">Near misses</span>${r.nearMisses.map((n) => `<span class="gm-chip${n.estimate ? ' gm-chip--est' : ''}">${esc(n.name)} ${n.fit}%${n.relation ? ` · ${esc(n.relation)}` : ''}${n.estimate ? EST.tag : ''}</span>`).join('')}</div>` : ''}
    ${feedbackRow(read)}
    <p class="gm-muted gm-file">Source: ${esc(read.source)}${read.melOn ? '' : ' · Spectrogram model off (features only)'}</p>
    <div class="gm-grid2">
      <div><div class="gm-caps">Closest genres</div>${(r.ranked || []).slice(0, 5).map((g) => meter(esc(g.name) + (g.estimate ? `<span class="gm-est-tag">${EST.tag}</span>` : ''), g.fit, g.fit)).join('')}</div>
      <div><div class="gm-caps">What was measured</div>${meter('Tempo', tempo, f.bpm ? Math.round(Math.max(0, Math.min(1, (f.bpm - 60) / 130)) * 100) : 0)}${['energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse'].map((k) => meter({ energy: 'Energy', brightness: 'Brightness', texture: 'Texture', bass: 'Low end', dynamics: 'Dynamics', pulse: 'Pulse' }[k], f.silent ? '—' : f[k].toFixed(2), f.silent ? 0 : Math.round(f[k] * 100))).join('')}</div>
    </div>
    <div class="gm-why"><div class="gm-caps">Why this read</div>${why.map((w, i) => `<p${i === 0 ? ' class="gm-why-head"' : ''}>${esc(w)}</p>`).join('')}</div>
    ${r.status === 'none' ? '' : `<div class="gm-grid3"><div><div class="gm-caps">Audience</div><p>${esc(m.audience)}</p></div><div><div class="gm-caps">Sync</div><p>${esc(m.sync)}</p></div><div><div class="gm-caps">How to spend the push</div><p>${esc(m.push)}</p><p class="gm-muted">${esc(m.channels)}</p></div></div>`}
    ${listen.length ? `<div><div class="gm-caps">Listen-alikes from the atlas</div><ul class="gm-list">${listen.map((x) => `<li><span><strong>${esc(x.name)}</strong> <span class="gm-muted">${esc(x.bpm)}</span></span><span class="gm-muted">${esc(x.line)}</span></li>`).join('')}</ul></div>` : ''}
    <div class="gm-row"><button class="gm-btn" id="dl">Download brief (PDF)</button><span class="gm-muted">Opens your print dialog. Choose “Save as PDF”. A4, one page.</span></div>
  </section>`;
}

function dropZone(id, multiple) {
  return `<label class="gm-drop" id="${id}"><input type="file" accept="audio/*,.wav,.mp3,.m4a,.aiff,.aif,.flac,.ogg" ${multiple ? 'multiple' : ''}>
    <strong>Drop ${multiple ? 'tracks' : 'a track'} here, or choose ${multiple ? 'files' : 'a file'}</strong>
    <p class="gm-muted">WAV, MP3, AIFF or M4A. Measured in this browser. Nothing is uploaded or kept.</p></label>`;
}
function wireDrop(id, onFiles) {
  const el = document.getElementById(id), inp = el.querySelector('input');
  inp.addEventListener('change', () => inp.files.length && onFiles([...inp.files]));
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]); });
}
const briefBase = () => new URL('assets/', location.href).href;

function pageRead() {
  view.innerHTML = `<section class="gm-hero"><h1 class="gm-display">Where your song meets its <em>audience</em>.</h1>
    <p class="gm-lede">GenreMatch reads a track, released or still a demo, and names the room it belongs in. It measures tempo, groove, timbre, harmony and the spectrogram, then names a super-genre, a family and a shelf, with near misses and a confidence score.</p></section>
    <div class="gm-stack">${dropZone('drop', false)}<div class="gm-progress" hidden id="prog"><i style="--v:60%"></i></div><div id="out">${lastRead.current ? readCard(lastRead.current) : ''}</div></div>`;
  if (lastRead.current) wireBrief();
  wireDrop('drop', async ([file]) => {
    const out = document.getElementById('out'), prog = document.getElementById('prog');
    prog.hidden = false; out.innerHTML = `<p class="gm-muted">Listening to ${esc(file.name)}…</p>`;
    try { loadMel(); lastRead.current = await readFile(file); out.innerHTML = readCard(lastRead.current); wireBrief(); }
    catch (e) { console.error(e); out.innerHTML = `<p class="gm-err">This file could not be decoded in your browser. Try a WAV or MP3.</p>`; }
    finally { prog.hidden = true; }
  });
}
function wireBrief() {
  document.getElementById('dl')?.addEventListener('click', () => printDocument(briefDocument([briefArticle(lastRead.current)], briefBase())));
  document.querySelectorAll('[data-fb]').forEach((b) => b.addEventListener('click', () => {
    const read = lastRead.current; FEEDBACK = mark(FEEDBACK, read.result, b.dataset.fb, b.dataset.id || null); saveLog(FEEDBACK);
    read.fb = b.dataset.fb; document.getElementById('out').innerHTML = readCard(read); wireBrief();
  }));
}

function projectSummary() {
  const reads = project.tracks.filter((t) => t.read);
  if (!reads.length) return '';
  const counts = new Map();
  for (const t of reads) { const fam = t.read.result.status === 'none' ? 'No clear genre' : t.read.result.family; counts.set(fam, (counts.get(fam) || 0) + 1); }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [p, s] = sorted;
  const pm = marketFor(p[0]), sm = s ? marketFor(s[0]) : null;
  const tagAs = !s ? `File it as ${p[0]}.` : p[1] >= reads.length * 0.7 ? `File it as ${p[0]}; ${s[0]} is a side lane.` : `File it as a hybrid: ${p[0]} × ${s[0]}.`;
  return `<section class="gm-card gm-stack"><div class="gm-caps">${esc(project.kind)} · ${esc(project.name || 'Untitled')}</div>
  <ul class="gm-list">${reads.map((t, i) => `<li><span>${i + 1}. ${esc(t.read.source)}</span><span>${esc(t.read.result.label)} · ${t.read.result.status === 'none' ? '—' : t.read.result.primary.fit} · next ${esc(t.read.result.second?.name ?? '—')} · ${t.read.features.bpm ? Math.round(t.read.features.bpm) + ' BPM' : '—'}<br><span class="gm-muted">${esc(t.read.why[0] || '')}</span></span></li>`).join('')}</ul>
  <div class="gm-grid2"><div><div class="gm-caps">Primary market</div><h3>${esc(p[0])}</h3><p>${esc(pm.audience)} ${esc(pm.push)}</p><p class="gm-muted">${esc(pm.channels)}</p></div>
  <div><div class="gm-caps">Secondary market</div>${s ? `<h3>${esc(s[0])}</h3><p>${esc(sm.audience)} ${esc(sm.sync)}</p>` : '<p>The tracks sit in one lane. There is no honest secondary market to force.</p>'}</div></div>
  <p><strong>Spread:</strong> ${sorted.map(([k, v]) => `${v} in ${esc(k)}`).join(', ')}. ${esc(tagAs)}</p>
  <div class="gm-row"><button class="gm-btn" id="pdl">Download project brief (PDF)</button></div></section>`;
}

function pageProject() {
  view.innerHTML = `<section class="gm-hero"><h1>Read a project</h1><p class="gm-lede">An album, an EP or a loose set. Add tracks in order. Each gets a read, then one market read for the whole release.</p></section>
  <div class="gm-stack"><div class="gm-row"><input type="text" id="pname" placeholder="Project name" value="${esc(project.name)}">
  <select id="pkind">${['Album', 'EP', 'Project'].map((k) => `<option ${k === project.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
  ${dropZone('pdrop', true)}<div id="plist">${trackList()}</div><div id="psum">${projectSummary()}</div></div>`;
  document.getElementById('pname').oninput = (e) => (project.name = e.target.value);
  document.getElementById('pkind').onchange = (e) => (project.kind = e.target.value);
  wirePdl();
  wireDrop('pdrop', async (files) => {
    for (const file of files) {
      const t = { name: file.name, read: null }; project.tracks.push(t); refresh();
      try { t.read = await readFile(file); } catch { t.error = true; }
      refresh();
    }
  });
  function refresh() { document.getElementById('plist').innerHTML = trackList(); document.getElementById('psum').innerHTML = projectSummary(); wirePdl(); }
  function trackList() { return project.tracks.length ? `<ul class="gm-list">${project.tracks.map((t, i) => `<li><span>${i + 1}. ${esc(t.name)}</span><span class="gm-muted">${t.error ? 'Could not decode' : t.read ? esc(t.read.result.label) : 'Listening…'}</span></li>`).join('')}</ul><button class="gm-btn gm-btn--ghost" id="pclear">Clear project</button>` : ''; }
  function wirePdl() {
    document.getElementById('pclear')?.addEventListener('click', () => { project.tracks = []; refresh(); });
    document.getElementById('pdl')?.addEventListener('click', () => {
      const reads = project.tracks.filter((t) => t.read).map((t) => t.read);
      const cover = `<article class="gm-brief"><header><div class="brand"><img src="genrematch_mark.svg" alt=""><div><div class="wm">Genre<i>Match</i></div><div class="sub">Project brief · ${esc(project.kind)}</div></div></div></header>
        <section class="primary"><div><div class="cap">Project</div><div class="genre">${esc(project.name || 'Untitled')}</div></div></section>${document.getElementById('psum').querySelector('.gm-card').innerHTML.replace(/<div class="gm-row">[\s\S]*$/, '')}
        <footer><span>Acoustic read only. Not a substitute for a supervisor’s ear.</span><span>a Craving Sofa Entertainment tool · 01</span></footer></article>`;
      printDocument(briefDocument([cover, ...reads.map((r, i) => briefArticle({ ...r, page: i + 2 }))], briefBase()));
    });
  }
}

function pageAtlas() {
  const supOf = (f) => GRAPH?.familySuper?.[f] || 'Other';
  const order = [...(GRAPH?.supergenres || []), 'Other'];
  const fams = [...new Set(ATLAS.genres.map((g) => g.family || 'Not on Musicmap'))].sort((a, b) => order.indexOf(supOf(a)) - order.indexOf(supOf(b)) || a.localeCompare(b));
  view.innerHTML = `<section class="gm-hero"><h1>Atlas</h1><p class="gm-lede">${ATLAS.genres.length} genres in ${fams.length} families, from Musicmap (families and lineage), Every Noise (neighbours) and Chosic (tempo ranges and traits). The atlas labels a read. It does not store or match songs.</p></section>
  <input type="search" id="q" placeholder="Search a genre, alias or artist" aria-label="Search the atlas"><div id="alist" class="gm-stack"></div>`;
  const render = (q = '') => {
    q = q.toLowerCase();
    const hit = (g) => !q || [g.name, g.family, ...(g.aliases || []), ...(g.artists || [])].join(' ').toLowerCase().includes(q);
    document.getElementById('alist').innerHTML = fams.map((fam) => {
      const gs = ATLAS.genres.filter((g) => (g.family || 'Not on Musicmap') === fam && hit(g));
      return gs.length ? `<section><div class="gm-caps">${esc(supOf(fam))}</div><h3>${esc(fam)}</h3><ul class="gm-list">${gs.map((g) => `<li><span><strong>${esc(g.name)}</strong>${g.bpm_range ? ` <span class="gm-muted">${g.bpm_range[0]}–${g.bpm_range[1]} BPM</span>` : ''}</span><span class="gm-muted">${esc(g.related.slice(0, 4).join(', '))}</span></li>`).join('')}</ul></section>` : '';
    }).join('') || '<p class="gm-muted">Nothing matches.</p>';
  };
  render(); document.getElementById('q').oninput = (e) => render(e.target.value);
}

function pageMarket(id) {
  if (id) {
    const p = PROFILES.find((x) => x.id === id);
    if (!p) return pageMarket();
    const m = marketFor(p.family), at = p.atlas;
    const artists = [...new Set(at.flatMap((g) => g.artists))].slice(0, 6), related = [...new Set(at.flatMap((g) => g.related))].slice(0, 8);
    const bpms = at.map((g) => g.bpm_range).filter(Boolean);
    view.innerHTML = `<p><a href="#/market">← All genres</a></p><section class="gm-hero"><div class="gm-caps">${esc(p.family)}</div><h1 class="gm-display">${esc(p.name)}</h1>
      ${MODEL && !MODEL.classes.includes(p.id) ? `<p class="gm-est"><span class="gm-chip gm-chip--est">${EST.chip}</span><span class="gm-muted">${EST.line}</span></p>` : ''}
      ${bpms.length ? `<p class="gm-muted">Typical tempo in the atlas: ${Math.min(...bpms.map((b) => b[0]))}–${Math.max(...bpms.map((b) => b[1]))} BPM</p>` : ''}
      ${GRAPH?.profiles?.[p.id] ? (() => { const g = GRAPH.profiles[p.id], nm = (ids) => ids.map((i) => PROFILES.find((x) => x.id === i)?.name).filter(Boolean).join(', '); return `<p><strong>${esc(g.super)}</strong> · pocket ${g.pocket[0]}–${g.pocket[1]} BPM · ${esc(g.character)}</p><p class="gm-muted">${[g.parent.length ? `Parent: ${esc(nm(g.parent))}` : '', g.siblings.length ? `Siblings: ${esc(nm(g.siblings))}` : '', g.influence.length ? `Influence: ${esc(nm(g.influence))}` : ''].filter(Boolean).join(' · ')}</p>`; })() : ''}</section>
      <div class="gm-grid3"><div class="gm-card gm-card--flat"><div class="gm-caps">Audience</div><p>${esc(m.audience)}</p></div><div class="gm-card gm-card--flat"><div class="gm-caps">Sync</div><p>${esc(m.sync)}</p></div><div class="gm-card gm-card--flat"><div class="gm-caps">How to spend the push</div><p>${esc(m.push)}</p><p class="gm-muted">${esc(m.channels)}</p></div></div>
      <div class="gm-grid2" style="margin-top:var(--gm-space-6)"><div><div class="gm-caps">Related genres</div><div class="gm-chips">${related.map((r) => `<span class="gm-chip">${esc(r)}</span>`).join('')}</div></div>
      <div><div class="gm-caps">Example artists (atlas)</div><p>${esc(artists.join(', ')) || '—'}</p></div></div>
      <p class="gm-muted" style="margin-top:var(--gm-space-6)">Plans and paid briefs are coming later. Everything here is free.</p>`;
    return;
  }
  const fams = [...new Set(PROFILES.map((p) => p.family))];
  view.innerHTML = `<section class="gm-hero"><h1>Market</h1><p class="gm-lede">Where each lane lives: who listens, where it gets synced, and how to spend the push. Writing notes, not a guarantee of placement.</p></section>
    ${fams.map((f) => `<section style="margin-bottom:var(--gm-space-5)"><div class="gm-caps">${esc(f)}</div><div class="gm-chips">${PROFILES.filter((p) => p.family === f).map((p) => `<a class="gm-chip" href="#/market/${p.id}">${esc(p.name)}</a>`).join('')}</div></section>`).join('')}`;
}

function route() {
  const [, page = 'read', arg] = (location.hash || '#/read').split('/');
  document.querySelectorAll('.gm-nav a').forEach((a) => a.classList.toggle('is-active', a.dataset.r === page));
  ({ read: pageRead, project: pageProject, atlas: pageAtlas, market: () => pageMarket(arg) }[page] || pageRead)();
  view.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
loadData().then(route).catch((e) => { console.error(e); view.innerHTML = '<p class="gm-err">The genre data could not load. Serve this folder over http (not file://).</p>'; });
