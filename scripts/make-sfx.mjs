// יוצר מחדש את צלילי השולחן ב-public/sfx מתוך חבילות ההקלטות החינמיות של Kenney (רישיון CC0):
//   Casino Audio  - https://kenney.nl/assets/casino-audio
//   Impact Sounds - https://kenney.nl/assets/impact-sounds
// הורדה, חילוץ, ואז: node scripts/make-sfx.mjs <casino>/Audio <impact>/Audio public/sfx
// (צריך ffmpeg). אחרי שינוי מספר הגרסאות של צליל - לעדכן את SOUNDS ב-src/lib/sound.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [casino, impact, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const C = (f) => join(casino, f + '.ogg');
const I = (f) => join(impact, f + '.ogg');

// שם בקובץ -> מקור (+ חלון זמן אופציונלי, + פילטר נוסף)
const MAP = {
  deal: [1, 2, 3, 5, 6, 7].map((n) => C('card-slide-' + n)),
  place: [1, 2, 3, 4].map((n) => C('card-place-' + n)),
  fold: [1, 2, 3, 4].map((n) => C('card-shove-' + n)),
  shuffle: [
    { src: C('card-shuffle'), from: 2.64, to: 2.99 },
    { src: C('card-shuffle'), from: 0.86, to: 1.19 },
  ],
  chip: [1, 2, 3].map((n) => C('chip-lay-' + n)),
  bet: [1, 2, 3, 4].map((n) => C('chips-collide-' + n)),
  stack: [1, 2, 3, 4, 5, 6].map((n) => C('chips-stack-' + n)),
  handle: [1, 2, 3, 4, 6].map((n) => C('chips-handle-' + n)),
  riffle: [C('chips-handle-5')],
  knock: [0, 1, 2, 3].map((n) => ({ src: I('impactWood_light_00' + n), extra: 'lowpass=f=3200' })),
  thud: [I('impactSoft_heavy_000'), I('impactSoft_heavy_001')],
  soft: [I('impactSoft_medium_000'), I('impactSoft_medium_001')],
  glass: [I('impactGlass_light_000'), I('impactGlass_light_001')],
  cash: [C('card-fan-1')],
};

const SR = 44100;
function pcm(src, from, to) {
  const args = ['-v', 'error'];
  if (from != null) args.push('-ss', String(from), '-to', String(to));
  args.push('-i', src, '-ac', '1', '-ar', String(SR), '-af', 'highpass=f=70', '-f', 'f32le', '-');
  const raw = execFileSync('ffmpeg', args, { maxBuffer: 1 << 27 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

let total = 0;
for (const [name, list] of Object.entries(MAP)) {
  list.forEach((item, idx) => {
    const it = typeof item === 'string' ? { src: item } : item;
    const x = pcm(it.src, it.from, it.to);
    // חלונות של 5ms: איפה הצליל מתחיל ואיפה נגמר באמת
    const win = Math.round(SR * 0.005);
    const db = [];
    for (let s = 0; s < x.length; s += win) {
      let e = 0;
      const end = Math.min(x.length, s + win);
      for (let i = s; i < end; i++) e += x[i] * x[i];
      db.push(10 * Math.log10(e / (end - s) + 1e-12));
    }
    const peakDb = Math.max(...db);
    const first = Math.max(0, db.findIndex((d) => d > peakDb - 38) - 2);
    let last = db.length - 1;
    while (last > first && db[last] < peakDb - 36) last--;
    const start = (first * win) / SR;
    const dur = Math.min(x.length / SR - start, ((last - first + 1) * win) / SR + 0.03);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    const gain = -1 - 20 * Math.log10(peak);
    const offs = (it.from ?? 0) + start;
    const fadeOut = Math.min(0.04, dur / 3);
    const filters = ['highpass=f=70', it.extra, `volume=${gain.toFixed(2)}dB`, 'afade=t=in:d=0.004', `afade=t=out:st=${(dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`]
      .filter(Boolean)
      .join(',');
    const out = join(outDir, `${name}-${idx + 1}.mp3`);
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-ss', offs.toFixed(3), '-t', dur.toFixed(3),
      '-i', it.src,
      '-ac', '1', '-ar', String(SR),
      '-af', filters,
      '-c:a', 'libmp3lame', '-q:a', '5',
      '-map_metadata', '-1',
      out,
    ]);
    const size = statSync(out).size;
    total += size;
    console.log(`${name}-${idx + 1}.mp3  ${dur.toFixed(2)}s  ${(size / 1024).toFixed(1)}KB  gain ${gain.toFixed(1)}dB`);
  });
}
console.log(`total ${(total / 1024).toFixed(0)}KB`);
