// דירוג ידי פוקר: מחזיר מספר - גבוה יותר = יד חזקה יותר
import { type Card, rankOf, suitOf } from './cards.ts';

export const HAND_NAMES = [
  'קלף גבוה',
  'זוג',
  'שני זוגות',
  'שלישייה',
  'רצף',
  'צבע',
  'פול האוס',
  'רביעייה',
  'רצף צבע',
];

export const HAND_NAMES_EN = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];

// מדרג 5 קלפים בדיוק
function score5(cards: Card[]): number {
  const ranks = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(ranks)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (ranks[0] - ranks[4] === 4) straightHigh = ranks[0];
    else if (ranks[0] === 14 && ranks[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  // מיון לפי כמות ואז לפי דרגה
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.map((g) => g[0]);
  let cat: number;
  let kickers: number[];
  if (straightHigh && flush) {
    cat = 8;
    kickers = [straightHigh];
  } else if (groups[0][1] === 4) {
    cat = 7;
    kickers = ordered;
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    cat = 6;
    kickers = ordered;
  } else if (flush) {
    cat = 5;
    kickers = ranks;
  } else if (straightHigh) {
    cat = 4;
    kickers = [straightHigh];
  } else if (groups[0][1] === 3) {
    cat = 3;
    kickers = ordered;
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    cat = 2;
    kickers = ordered;
  } else if (groups[0][1] === 2) {
    cat = 1;
    kickers = ordered;
  } else {
    cat = 0;
    kickers = ranks;
  }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kickers[i] || 0);
  return s;
}

// היד הטובה ביותר מתוך 5-7 קלפים
export function bestHand(cards: Card[]): { score: number; cat: number; name: string; best: Card[] } {
  let bestScore = -1;
  let best: Card[] = [];
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const h = [cards[a], cards[b], cards[c], cards[d], cards[e]];
            const s = score5(h);
            if (s > bestScore) {
              bestScore = s;
              best = h;
            }
          }
  const cat = Math.floor(bestScore / 15 ** 5);
  return { score: bestScore, cat, name: HAND_NAMES[cat], best };
}

// אומהה: חובה להשתמש בדיוק ב-2 קלפים מהיד וב-3 מהלוח (לא יותר ולא פחות)
export function bestOmaha(hole: Card[], board: Card[]): { score: number; cat: number; name: string; best: Card[] } {
  let bestScore = -1;
  let best: Card[] = [];
  for (let a = 0; a < hole.length; a++)
    for (let b = a + 1; b < hole.length; b++)
      for (let c = 0; c < board.length; c++)
        for (let d = c + 1; d < board.length; d++)
          for (let e = d + 1; e < board.length; e++) {
            const h = [hole[a], hole[b], board[c], board[d], board[e]];
            const s = score5(h);
            if (s > bestScore) {
              bestScore = s;
              best = h;
            }
          }
  if (bestScore < 0) return { score: 0, cat: 0, name: HAND_NAMES[0], best: [] }; // עוד אין 3 קלפים בלוח
  const cat = Math.floor(bestScore / 15 ** 5);
  return { score: bestScore, cat, name: HAND_NAMES[cat], best };
}

// היד הטובה ביותר לפי סוג המשחק: 4 קלפים ביד = אומהה, 2 = טקסס הולדם
export function bestFor(hole: Card[], board: Card[]) {
  return hole.length === 4 ? bestOmaha(hole, board) : bestHand(hole.concat(board));
}
