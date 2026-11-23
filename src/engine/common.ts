// טיפוסים משותפים לכל המשחקים

export interface PlayerBase {
  id: string; // user id או "bot-xxx"
  name: string;
  avatar: string;
  isBot: boolean;
  chips: number;
}

// אירוע כספי שהשרת רושם ביומן
export interface LedgerEffect {
  playerId: string;
  isBot: boolean;
  name: string;
  kind: 'buyin' | 'cashout';
  amount: number;
}

export class GameError extends Error {}

export function fail(msg: string): never {
  throw new GameError(msg);
}

export const TURN_SECONDS = 45;

// זמן תור (מילישניות) לפי הגדרת השולחן, ברירת מחדל 45 שניות
export function turnMs(settings: unknown): number {
  const t = Number((settings as { turnSeconds?: number })?.turnSeconds);
  return (Number.isFinite(t) && t >= 15 && t <= 180 ? t : TURN_SECONDS) * 1000;
}

// אחרי כמה פספוסי תור ברצף מושיבים את השחקן בצד
export const MAX_STRIKES = 2;

export const BOT_NAMES = ['רובוט רפי', 'בוטי', 'צ׳יפי', 'ד״ר קלף', 'מקס', 'לולו', 'ג׳וני', 'בינה'];
export const BOT_AVATARS = ['🤖', '👾', '🦾', '🧠', '🎰', '🦊', '🐙', '🦉'];

// כשמישהו יוצא עם יתרה שלילית (קרה לבנק) - זה נרשם כקנייה נוספת
export function cashoutEffects(p: PlayerBase): LedgerEffect[] {
  const base = { playerId: p.id, isBot: p.isBot, name: p.name };
  if (p.chips < 0)
    return [
      { ...base, kind: 'buyin', amount: -p.chips },
      { ...base, kind: 'cashout', amount: 0 },
    ];
  return [{ ...base, kind: 'cashout', amount: p.chips }];
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
