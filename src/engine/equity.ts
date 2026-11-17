// חישוב סיכויי ניצחון (אקוויטי) בשיטת מונטה קרלו - סימולציה של אלפי ידיים אקראיות
import { type Card, newDeck } from './cards.ts';
import { bestHand } from './handEval.ts';

export function equity(hole: Card[], board: Card[], opponents: number, iterations = 400): number {
  if (opponents <= 0) return 1;
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !known.has(c));
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    // ערבוב חלקי מהיר
    const need = 5 - board.length + opponents * 2;
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      const tmp = rest[i];
      rest[i] = rest[j];
      rest[j] = tmp;
    }
    const fullBoard = board.concat(rest.slice(0, 5 - board.length));
    let k = 5 - board.length;
    const mine = bestHand(hole.concat(fullBoard)).score;
    let best = true;
    let ties = 1;
    for (let o = 0; o < opponents; o++) {
      const s = bestHand([rest[k], rest[k + 1]].concat(fullBoard)).score;
      k += 2;
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
