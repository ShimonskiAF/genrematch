import fs from 'node:fs';
// float32 tfjs graph model -> float16 weights. node tools/q16.js <float32 model dir/> <out dir/>
const [src, dst] = [process.argv[2], process.argv[3]];
fs.mkdirSync(dst, { recursive: true });
const j = JSON.parse(fs.readFileSync(src + 'model.json'));
const all = Buffer.concat(j.weightsManifest[0].paths.map((p) => fs.readFileSync(src + p)));
const f32 = new Float32Array(all.buffer.slice(all.byteOffset, all.byteOffset + all.length));
// float32 -> float16 (round to nearest even)
const fb = new Float32Array(1), ib = new Uint32Array(fb.buffer);
function h(v) { fb[0] = v; const x = ib[0], s = (x >>> 16) & 0x8000; let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e >= 31) return s | 0x7c00; if (e <= 0) { if (e < -10) return s; m = (m | 0x800000) >> (1 - e); return s | ((m + 0x1000) >> 13); }
  const r = s | (e << 10) | (m >> 13); return (m & 0x1fff) > 0x1000 || ((m & 0x1fff) === 0x1000 && (r & 1)) ? r + 1 : r; }
let off = 0; const parts = [];
for (const w of j.weightsManifest[0].weights) {
  const n = w.shape.reduce((a, b) => a * b, 1);
  if (w.dtype === 'float32') { const o = new Uint16Array(n); for (let i = 0; i < n; i++) o[i] = h(f32[off + i]); parts.push(Buffer.from(o.buffer)); w.quantization = { dtype: 'float16', original_dtype: 'float32' }; }
  else parts.push(all.subarray(off * 4, (off + n) * 4));
  off += n;
}
const buf = Buffer.concat(parts);
fs.writeFileSync(dst + 'group1-shard1of1.bin', buf);
j.weightsManifest[0].paths = ['group1-shard1of1.bin'];
fs.writeFileSync(dst + 'model.json', JSON.stringify(j));
console.log('bytes', buf.length);
