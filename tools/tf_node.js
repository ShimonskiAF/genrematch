// Load the vendored tfjs + WASM backend + YAMNet in Node (same bundles the site ships).
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), root = new URL('..', import.meta.url).pathname;
const umd = (p, req) => { const f = path.join(root, p), m = { exports: {} }; new Function('module', 'exports', 'require', '__filename', '__dirname', fs.readFileSync(f, 'utf8'))(m, m.exports, req, f, path.dirname(f)); return m.exports; };
export async function loadYamnet() {
  const tf = umd('vendor/tfjs/tf.min.js', require); globalThis.tf = tf;
  const wasm = umd('vendor/tfjs/tf-backend-wasm.min.js', (id) => (id.startsWith('@tensorflow/') ? tf : require(id)));
  wasm.setWasmPaths(path.join(root, 'vendor/tfjs/')); await tf.setBackend('wasm'); await tf.ready();
  const dir = path.join(root, 'models/yamnet/');
  const model = await tf.loadGraphModel({ load: async () => { const j = JSON.parse(fs.readFileSync(dir + 'model.json')); const all = Buffer.concat(j.weightsManifest[0].paths.map((p) => fs.readFileSync(dir + p))); return { modelTopology: j.modelTopology, weightSpecs: j.weightsManifest[0].weights, weightData: all.buffer.slice(all.byteOffset, all.byteOffset + all.length), format: j.format }; } });
  return { tf, model };
}
