// תצוגה לפי שפה: שמות בוטים, פעולות אחרונות ושמות ידיים
import { BOT_NAMES } from '../engine/common';
import { HAND_NAMES, HAND_NAMES_EN } from '../engine/handEval';
import type { Lang } from './i18n';

const BOT_EN = ['Robo Rafi', 'Botty', 'Chippy', 'Dr. Card', 'Max', 'Lulu', 'Johnny', 'Bina'];

export function displayName(p: { name: string; isBot?: boolean }, lang: Lang): string {
  if (!p.isBot || lang === 'he') return p.name;
  const i = BOT_NAMES.indexOf(p.name);
  return i >= 0 ? BOT_EN[i] : p.name;
}

export function botNameByHebrew(name: string, lang: Lang): string {
  return displayName({ name, isBot: true }, lang);
}

export function actionLabel(code: string | null, lang: Lang): string {
  if (!code) return '';
  const [kind, n] = code.split(':');
  const he = lang === 'he';
  switch (kind) {
    case 'fold':
      return he ? 'פולד' : 'Fold';
    case 'check':
      return he ? 'צ׳ק' : 'Check';
    case 'call':
      return he ? `קול ${n}` : `Call ${n}`;
    case 'raise':
      return he ? `העלאה ל-${n}` : `Raise to ${n}`;
    case 'allin':
      return he ? 'אול-אין!' : 'All-in!';
    case 'sb':
      return `SB ${n}`;
    case 'bb':
      return `BB ${n}`;
    case 'left':
      return he ? 'יצא' : 'Left';
    default:
      return code; // תאימות לאחור
  }
}

export function handName(cat: number | undefined, lang: Lang): string {
  if (cat == null || cat < 0) return '';
  return (lang === 'he' ? HAND_NAMES : HAND_NAMES_EN)[cat] ?? '';
}
