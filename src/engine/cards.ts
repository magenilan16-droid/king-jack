// קלף = מחרוזת של 2 תווים: דרגה + צורה. לדוגמה "As" = אס עלה, "Td" = 10 יהלום
export type Card = string;

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc'; // spades, hearts, diamonds, clubs

export function rankOf(c: Card): number {
  return RANKS.indexOf(c[0]) + 2; // 2..14
}
export function suitOf(c: Card): string {
  return c[1];
}

export function newDeck(decks = 1): Card[] {
  const d: Card[] = [];
  for (let n = 0; n < decks; n++) for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

function randInt(max: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const SUIT_SYMBOL: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export function rankLabel(c: Card): string {
  return c[0] === 'T' ? '10' : c[0];
}
