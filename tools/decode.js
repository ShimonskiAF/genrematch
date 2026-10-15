// Decode any audio file to mono Float32 via ffmpeg, mirroring the browser:
// decodeAudioData at the context rate (44.1 kHz) then channel average (toMono).
import { execFileSync } from 'node:child_process';
export const DECODE_SR = 44100;
export function decodeFile(file, sr = DECODE_SR) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return { samples: new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), sampleRate: sr };
}
