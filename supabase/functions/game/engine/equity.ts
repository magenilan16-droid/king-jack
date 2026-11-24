// חישוב סיכויי ניצחון (אקוויטי) בשיטת מונטה קרלו - סימולציה של אלפי ידיים אקראיות
// עובד גם לטקסס הולדם (2 קלפים ביד) וגם לאומהה (4 קלפים ביד) - ליריבים מחלקים כמה קלפים שיש לי
import { type Card, newDeck } from './cards.ts';
import { bestFor } from './handEval.ts';

// "טווח" של יריב: מקבל יד אפשרית ומחליט אם היא מתאימה למה שהיריב עשה (null = כל יד)
export type HandFilter = ((hand: Card[]) => boolean) | null;

export function equity(hole: Card[], board: Card[], opponents: number, iterations = 400): number {
  return equityVs(hole, board, Array.from({ length: Math.max(0, opponents) }, () => null), iterations);
}

// כמו equity, אבל לכל יריב מגרילים רק ידיים שמתאימות לטווח שלו (מי שהעלה - כנראה מחזיק משהו)
export function equityVs(hole: Card[], board: Card[], ranges: HandFilter[], iterations = 400): number {
  const opponents = ranges.length;
  if (opponents <= 0) return 1;
  const h = hole.length;
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !known.has(c));
  const n = rest.length;
  const nb = 5 - board.length;
  // מגריל cnt קלפים למקומות from..from+cnt-1 מתוך מה שעוד לא חולק
  const draw = (from: number, cnt: number) => {
    for (let i = from; i < from + cnt; i++) {
      const j = i + Math.floor(Math.random() * (n - i));
      const tmp = rest[i];
      rest[i] = rest[j];
      rest[j] = tmp;
    }
  };
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    draw(0, nb);
    const fullBoard = board.concat(rest.slice(0, nb));
    let k = nb;
    const mine = bestFor(hole, fullBoard).score;
    let best = true;
    let ties = 1;
    for (let o = 0; o < opponents; o++) {
      const accept = ranges[o];
      let hand: Card[];
      // דגימה עם דחייה: מגרילים שוב עד שהיד מתאימה לטווח (עד 10 ניסיונות)
      for (let tries = 0; ; tries++) {
        draw(k, h);
        hand = rest.slice(k, k + h);
        if (!accept || tries >= 9 || accept(hand)) break;
      }
      k += h;
      const s = bestFor(hand, fullBoard).score;
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
