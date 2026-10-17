// Browser loader for the mel path. Loads the vendored TensorFlow.js + YAMNet once, on the first read.
// WASM backend first (same numbers as calibration), then WebGL, then CPU. If anything fails the read
// still runs on the hand-crafted features alone and says so.
import { windows16k, yamnetEmbedWindows } from './melpath.js';
let _p = null;
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('load ' + src)); document.head.appendChild(s); });
export function loadMel(base = 'vendor/tfjs/', modelUrl = 'models/yamnet/model.json') {
  if (_p) return _p;
  _p = (async () => {
    if (!window.tf) await loadScript(base + 'tf.min.js');
    const tf = window.tf;
    try { if (!tf.wasm) await loadScript(base + 'tf-backend-wasm.min.js'); tf.wasm.setWasmPaths(new URL(base, location.href).href); await tf.setBackend('wasm'); }
    catch { try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); } }
    await tf.ready();
    const model = await tf.loadGraphModel(modelUrl);
    return { tf, model, backend: tf.getBackend() };
  })().catch((e) => { console.warn('[GenreMatch] mel path off:', e); _p = null; return null; });
  return _p;
}
export async function melRead(samples, sampleRate) {
  const m = await loadMel();
  if (!m) return null;
  const r = await yamnetEmbedWindows(m.tf, m.model, windows16k(samples, sampleRate));
  return r && { ...r, backend: m.backend };
}
