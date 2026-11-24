// מעתיק את מנוע המשחק לתיקיית השרת, ומכין קובץ JSON לפריסה
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const files = ['cards.ts', 'common.ts', 'handEval.ts', 'equity.ts', 'strategy.ts', 'pokerBot.ts', 'blackjack.ts', 'holdem.ts', 'room.ts', 'settle.ts'];
mkdirSync('supabase/functions/game/engine', { recursive: true });
const out = [{ name: 'index.ts', content: readFileSync('supabase/functions/game/index.ts', 'utf8') }];
for (const f of files) {
  const c = readFileSync('src/engine/' + f, 'utf8');
  writeFileSync('supabase/functions/game/engine/' + f, c);
  out.push({ name: 'engine/' + f, content: c });
}
const dest = process.argv[2];
if (dest) writeFileSync(dest, JSON.stringify(out));
console.log('synced', out.length, 'files', dest ? '-> ' + dest : '');
