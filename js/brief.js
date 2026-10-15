// One-page A4 brief built from the Overlap brief template (assets/genrematch_brief_template.html + css/genrematch-brief.css).
import { marketFor } from './market.js';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
const DISCLAIMER = 'Acoustic read only. Not a trained neural net, and not a substitute for a supervisor’s ear. Your file stays in your browser.';

export function briefArticle({ source, features: f, result: r, why, listen, page = 1 }) {
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const none = r.status === 'none';
  const m = marketFor(r.family);
  const conf = none ? 'No clear genre' : r.hybrid ? 'Hybrid' : { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[r.confidence];
  const desc = none ? r.reason : r.status === 'family' ? `${conf}. Leans toward ${r.leansToward.join(' / ')}.` : `${conf}.`;
  const fit = none ? '—' : r.primary.fit;
  const closest = (r.ranked || []).slice(0, 5).map((g, i) => `<div class="meter${i === 0 ? ' top' : ''}" style="--v:${g.fit}%"><span>${esc(g.name)}</span><span>${g.fit}</span></div>`).join('');
  const meas = [['Tempo', f.bpm ? `${Math.round(f.bpm)} BPM` : '—', f.bpm ? pct((f.bpm - 60) / 130) : 0], ['Energy', f.energy], ['Brightness', f.brightness], ['Texture', f.texture], ['Low end', f.bass], ['Dynamics', f.dynamics], ['Pulse', f.pulse]]
    .map(([k, v, p]) => `<div class="meter" style="--v:${p ?? pct(v ?? 0)}%"><span>${k}</span><span>${typeof v === 'number' ? v.toFixed(2) : v ?? '—'}</span></div>`).join('');
  const refs = (listen || []).slice(0, 2).map((x) => `<div class="ref"><div><b>${esc(x.name)}</b><div class="m">${esc(x.family || '')}${x.bpm ? ' · ' + x.bpm : ''}</div></div><div>${esc(x.line)}</div></div>`).join('');
  return `<article class="gm-brief" style="${page > 1 ? 'break-before:page;' : ''}">
<header><div class="brand"><img src="genrematch_mark.svg" alt=""><div><div class="wm">Genre<i>Match</i></div><div class="sub">Genre Analysis Hub · ${esc(date)}</div></div></div><div class="plan"><span class="cap">Plan</span><b>Free read</b></div></header>
<section class="primary"><div><div class="cap">Primary read</div><div class="genre">${esc(r.label)}</div><div class="desc">${esc(desc)}</div><p class="lede">${esc(none ? '' : `${r.family} family. Fit is against the ${r.primary.name} centre.`)}</p></div>
<div class="fit"><div class="cap">Fit</div><div class="n">${fit}</div><small>of 100${none ? '' : ` · against the ${esc(r.primary.name)} centre`}</small></div></section>
<section class="facts"><div><span class="cap">Source</span><div class="src">${esc(source)}</div></div><div><span class="cap">Family</span><div>${esc(none ? '—' : r.family)}</div></div><div><span class="cap">Beside</span><div>${esc(r.second ? `${r.second.name} ${r.second.fit}` : '—')}</div></div></section>
<section class="two"><div><div class="cap">Closest genres</div>${closest}</div><div><div class="cap">What was measured</div>${meas}</div></section>
<section class="why"><div class="cap">Why this read</div>${why.map((w) => `<p>${esc(w)}</p>`).join('')}</section>
<section class="three"><div><div class="cap">Audience</div><p>${esc(none ? '—' : m.audience)}</p></div><div><div class="cap">Sync</div><p>${esc(none ? '—' : m.sync)}</p></div><div><div class="cap">How to spend the push</div><p>${esc(none ? '—' : m.push)}</p><p class="chan">${esc(none ? '' : m.channels)}</p></div></section>
${refs ? `<section class="refs"><div class="cap">Listen-alikes from the atlas</div>${refs}</section>` : ''}
<footer><span>${DISCLAIMER}</span><span>a Craving Sofa Entertainment tool · ${String(page).padStart(2, '0')}</span></footer>
</article>`;
}

export function briefDocument(articles, baseHref) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${baseHref}"><title>GenreMatch brief</title>
<link rel="stylesheet" href="../css/genrematch-brief.css">
<style>.src{overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.cap{white-space:nowrap}.gm-brief{min-height:auto!important}.three p,.ref div{overflow-wrap:break-word;hyphens:auto}footer span:last-child{white-space:nowrap;margin-left:6mm}@media print{@page{margin:12mm 15mm 10mm}.meter{min-height:5mm}}</style>
</head><body>${articles.join('\n')}</body></html>`;
}

export function printDocument(html) {
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(ifr);
  ifr.srcdoc = html;
  ifr.onload = () => { setTimeout(() => { ifr.contentWindow.focus(); ifr.contentWindow.print(); setTimeout(() => ifr.remove(), 60000); }, 400); };
}
