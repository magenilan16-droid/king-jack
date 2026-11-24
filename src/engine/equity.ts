// חישוב סיכויי ניצחון (אקוויטי) בשיטת מונטה קרלו - סימולציה של אלפי ידיים אקראיות
// עובד גם לטקסס הולדם (2 קלפים ביד) וגם לאומהה (4 קלפים ביד) - ליריבים מחלקים כמה קלפים שיש לי
import { type Card, newDeck } from './cards.ts';
import { bestFor } from './handEval.ts';

export function equity(hole: Card[], board: Card[], opponents: number, iterations = 400): number {
  if (opponents <= 0) return 1;
  const h = hole.length;
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    // ערבוב חלקי מהיר
    const need = 5 - board.length + opponents * h;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      const tmp = rest[i];
      rest[i] = rest[j];
      rest[j] = tmp;
    }
    const fullBoard = board.concat(rest.slice(0, 5 - board.length));
    let k = 5 - board.length;
    const mine = bestFor(hole, fullBoard).score;
    let best = true;
    let ties = 1;
    for (let o = 0; o < opponents; o++) {
      const s = bestFor(rest.slice(k, k + h), fullBoard).score;
      k += h;
      if (s > mine) {
        best = false;
        break;
      }
      if (s === mine) ties++;
    }
    if (best) score += 1 / ties;
  }
  return score / iterations;
}
