// Convierte los fotogramas de promo/record.mjs en un mp4 vertical (1080x1920, 30 fps, H.264) respetando el tiempo real de cada fotograma.
//   node promo/assemble.mjs [carpeta-de-fotogramas] [salida.mp4]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

const FRAMES = path.resolve(process.argv[2] || new URL('./frames', import.meta.url).pathname);
const OUT = path.resolve(process.argv[3] || new URL('./out/poyo-promo-vertical.mp4', import.meta.url).pathname);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const stamps = JSON.parse(fs.readFileSync(path.join(FRAMES, 'stamps.json'), 'utf8'));
const list = stamps.map(([name, t], i) => `file '${path.join(FRAMES, name)}'\nduration ${Math.max(0.01, (i + 1 < stamps.length ? stamps[i + 1][1] - t : 0.4)).toFixed(4)}`).join('\n') + `\nfile '${path.join(FRAMES, stamps.at(-1)[0])}'\n`;
const listFile = path.join(FRAMES, 'list.txt');
fs.writeFileSync(listFile, list);
const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p',
  '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', '-an', OUT], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
console.log('→', OUT, (fs.statSync(OUT).size / 1e6).toFixed(1) + ' MB');
