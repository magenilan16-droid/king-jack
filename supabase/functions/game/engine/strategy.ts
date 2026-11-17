// אסטרטגיה בסיסית לבלאק ג'ק (6 חפיסות, דילר עומד על 17 רך, הכפלה אחרי פיצול מותרת)
import { type Card, rankOf } from './cards.ts';

type Move = 'hit' | 'stand' | 'double' | 'split';

function val(c: Card): number {
  const r = rankOf(c);
  return r === 14 ? 11 : Math.min(r, 10);
}

function total(cards: Card[]): { t: number; soft: boolean } {
  let t = 0;
  let a = 0;
  for (const c of cards) {
    t += val(c);
    if (rankOf(c) === 14) a++;
  }
  while (t > 21 && a) {
    t -= 10;
    a--;
  }
  return { t, soft: a > 0 };
}

export function basicStrategy(cards: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean): Move {
  const d = val(dealerUp); // 2..11
  const { t, soft } = total(cards);

  if (canSplit && cards.length === 2) {
    const v = val(cards[0]);
    const split =
      v === 11 ||
      v === 8 ||
      (v === 9 && ![7, 10, 11].includes(d)) ||
      (v === 7 && d <= 7) ||
      (v === 6 && d <= 6) ||
      ((v === 2 || v === 3) && d <= 7) ||
      (v === 4 && (d === 5 || d === 6));
    if (split) return 'split';
  }

  if (soft) {
    if (t >= 20) return 'stand';
    if (t === 19) return canDouble && d === 6 ? 'double' : 'stand';
    if (t === 18) {
      if (canDouble && d >= 2 && d <= 6) return 'double';
      return d <= 8 ? 'stand' : 'hit';
    }
    if (t === 17) return canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
    if (t === 15 || t === 16) return canDouble && d >= 4 && d <= 6 ? 'double' : 'hit';
    if (t === 13 || t === 14) return canDouble && d >= 5 && d <= 6 ? 'double' : 'hit';
    return 'hit';
  }

  if (t >= 17) return 'stand';
  if (t >= 13) return d <= 6 ? 'stand' : 'hit';
  if (t === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (t === 11) return canDouble ? 'double' : 'hit';
  if (t === 10) return canDouble && d <= 9 ? 'double' : 'hit';
  if (t === 9) return canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
  return 'hit';
}

export const MOVE_HE: Record<Move, string> = {
  hit: 'למשוך קלף',
  stand: 'לעמוד',
  double: 'להכפיל',
  split: 'לפצל',
};

export const MOVE_EN: Record<Move, string> = {
  hit: 'hit',
  stand: 'stand',
  double: 'double down',
  split: 'split',
};

export function strategyExplain(cards: Card[], dealerUp: Card, move: Move, lang: 'he' | 'en' = 'he'): string {
  const { t, soft } = total(cards);
  const d = val(dealerUp);
  const weakDealer = d >= 2 && d <= 6;
  if (lang === 'en') {
    const dEn = d === 11 ? 'an ace' : String(d);
    switch (move) {
      case 'split':
        return `Splitting ${cards[0][0] === 'A' ? 'aces' : val(cards[0]) + 's'} against ${dEn} gives you better odds`;
      case 'double':
        return `${soft ? 'Soft ' : ''}${t} against ${dEn} - a great spot to double your bet`;
      case 'stand':
        return weakDealer && t < 17
          ? `Dealer shows ${dEn} - likely to bust, let them take the risk`
          : `${t} is good enough against ${dEn}`;
      case 'hit':
        return `${t} is too weak against ${dEn}${!weakDealer ? ' (strong dealer card)' : ''} - take a card`;
    }
  }
  const dTxt = d === 11 ? 'אס' : String(d);
  switch (move) {
    case 'split':
      return `לפצל זוג ${cards[0][0] === 'A' ? 'אסים' : val(cards[0])} מול ${dTxt} נותן יותר סיכוי לרווח`;
    case 'double':
      return `${soft ? 'יד רכה ' : ''}${t} מול ${dTxt} - מצב מעולה להכפיל את ההימור`;
    case 'stand':
      return weakDealer && t < 17
        ? `לדילר ${dTxt} - יש לו סיכוי גבוה להישרף, תן לו לקחת את הסיכון`
        : `${t} זה מספיק טוב מול ${dTxt}`;
    case 'hit':
      return `${t} חלש מדי מול ${dTxt}${!weakDealer ? ' (קלף חזק לדילר)' : ''} - כדאי למשוך`;
  }
}
