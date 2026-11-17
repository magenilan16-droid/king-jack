import { sha256Hex } from '../src/lib/sha256.ts';
import { createHash } from 'node:crypto';
for (const s of ['', 'abc', 'טסט אלף', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(200), 'אילן 🃏']) {
  const a = sha256Hex(s), b = createHash('sha256').update(s).digest('hex');
  if (a !== b) throw new Error('mismatch for ' + s);
}
console.log('sha256 OK');
