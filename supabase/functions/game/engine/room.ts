// שכבה אחידה מעל שני המשחקים - השרת קורא רק לפונקציות כאן
import { type PlayerBase, type LedgerEffect, fail, BOT_NAMES, BOT_AVATARS, cashoutEffects } from './common.ts';
import {
  type BJFull,
  type BJMove,
  type BJSettings,
  createBlackjack,
  joinBlackjack,
  rebuyBlackjack,
  leaveBlackjack,
  actBlackjack,
} from './blackjack.ts';
import {
  type HFull,
  type HMove,
  type HSettings,
  createHoldem,
  joinHoldem,
  rebuyHoldem,
  leaveHoldem,
  actHoldem,
  holdemPrivate,
} from './holdem.ts';

export type GameType = 'blackjack' | 'holdem';
export type Full = BJFull | HFull;

export interface ChatMsg {
  id: string;
  name: string;
  text: string;
  at: number;
}

export type RoomMove =
  | { type: 'rebuy'; amount: number }
  | { type: 'leave' }
  | { type: 'addBot' }
  | { type: 'removeBot'; botId: string }
  | { type: 'chat'; text: string }
  | { type: 'close' }
  | BJMove
  | HMove;

export function createGame(
  type: GameType,
  host: PlayerBase,
  settings: BJSettings | HSettings,
): { full: Full; effects: LedgerEffect[] } {
  const res = type === 'blackjack' ? createBlackjack(host, settings as BJSettings) : createHoldem(host, settings as HSettings);
  res.full.pub.buyCount = { [host.id]: 1 };
  return res;
}

// הצטרפות: תמיד בסכום הקבוע של השולחן. חזרה אחרי יציאה נחשבת קנייה חוזרת
export function joinGame(f: Full, p: PlayerBase, _requested?: number): LedgerEffect[] {
  void _requested;
  const pub = f.pub;
  const amount = pub.settings.buyIn;
  const counts = (pub.buyCount ??= {});
  const seated = pub.players.some((x) => x.id === p.id);
  if (!seated && !p.isBot && (counts[p.id] ?? 0) >= 1) checkRebuyLimit(f, p.id);
  const effects = pub.kind === 'blackjack' ? joinBlackjack(f as BJFull, p, amount) : joinHoldem(f as HFull, p, amount);
  if (effects.length) counts[p.id] = (counts[p.id] ?? 0) + 1;
  return effects;
}

function checkRebuyLimit(f: Full, playerId: string) {
  const max = (f.pub.settings as { maxRebuys?: number | null }).maxRebuys;
  const used = Math.max(0, (f.pub.buyCount?.[playerId] ?? 1) - 1);
  if (max != null && used >= max) fail('נגמרו הקניות החוזרות בשולחן הזה');
}

// כמה קניות חוזרות נשארו (null = ללא הגבלה)
export function rebuysLeft(pub: Full['pub'], playerId: string): number | null {
  const max = (pub.settings as { maxRebuys?: number | null }).maxRebuys;
  if (max == null) return null;
  return Math.max(0, max - Math.max(0, (pub.buyCount?.[playerId] ?? 1) - 1));
}

// אפשר לקנות שוב רק כשנגמרו הז׳טונים
export function canRebuyNow(pub: Full['pub'], playerId: string): boolean {
  const p = pub.players.find((x) => x.id === playerId);
  if (!p) return false;
  if (pub.kind === 'blackjack') {
    if (pub.bankerId === playerId) return false;
    return p.chips < pub.settings.minBet;
  }
  const hp = p as HFull['pub']['players'][number];
  return hp.chips === 0 && hp.pending === 0 && !(hp.allIn && hp.inHand && !hp.folded && pub.phase !== 'waiting' && pub.phase !== 'showdown');
}

function chatOf(f: Full): ChatMsg[] {
  const pub = f.pub as unknown as { chat?: ChatMsg[] };
  if (!pub.chat) pub.chat = [];
  return pub.chat;
}

export function act(f: Full, actorId: string, move: RoomMove, now: number): { effects: LedgerEffect[]; closed?: boolean } {
  const pub = f.pub;
  const me = pub.players.find((p) => p.id === actorId);
  switch (move.type) {
    case 'rebuy':
      if (!me) fail('אתה לא בשולחן');
      if (!canRebuyNow(pub, actorId)) fail('אפשר לקנות שוב רק כשנגמרים הז׳טונים');
      checkRebuyLimit(f, actorId);
      {
        const amount = pub.settings.buyIn;
        const effects =
          pub.kind === 'blackjack' ? rebuyBlackjack(f as BJFull, actorId, amount) : rebuyHoldem(f as HFull, actorId, amount);
        const counts = (pub.buyCount ??= {});
        counts[actorId] = (counts[actorId] ?? 1) + 1;
        return { effects };
      }
    case 'leave':
      return {
        effects: pub.kind === 'blackjack' ? leaveBlackjack(f as BJFull, actorId) : leaveHoldem(f as HFull, actorId, now),
      };
    case 'chat': {
      if (!me) fail('אתה לא בשולחן');
      const text = String(move.text || '').trim().slice(0, 120);
      if (!text) fail('הודעה ריקה');
      const chat = chatOf(f);
      chat.push({ id: actorId, name: me.name, text, at: now });
      if (chat.length > 40) chat.splice(0, chat.length - 40);
      return { effects: [] };
    }
    case 'addBot': {
      if (actorId !== pub.hostId) fail('רק המארח יכול להוסיף בוטים');
      const used = new Set(pub.players.map((p) => p.name));
      const i = BOT_NAMES.findIndex((n) => !used.has(n));
      if (i < 0) fail('אין עוד בוטים פנויים');
      const bot: PlayerBase = {
        id: 'bot-' + Math.random().toString(36).slice(2, 8),
        name: BOT_NAMES[i],
        avatar: BOT_AVATARS[i],
        isBot: true,
        chips: 0,
      };
      return { effects: joinGame(f, bot, pub.settings.buyIn) };
    }
    case 'removeBot': {
      if (actorId !== pub.hostId) fail('רק המארח');
      const b = pub.players.find((p) => p.id === move.botId && p.isBot) ?? fail('בוט לא נמצא');
      return { effects: act(f, b.id, { type: 'leave' }, now).effects };
    }
    case 'close': {
      if (actorId !== pub.hostId) fail('רק המארח יכול לסגור את השולחן');
      // כולם יוצאים עם מה שיש להם. ז׳טונים שנמצאים כרגע במשחק חוזרים לבעליהם
      let effects: LedgerEffect[] = [];
      for (const p of pub.players) {
        let chips = p.chips;
        if (pub.kind === 'blackjack') {
          const bp = p as BJFull['pub']['players'][number];
          if (pub.phase === 'playing') chips += bp.hands.reduce((a, h) => a + h.bet, 0);
        } else {
          const hp = p as HFull['pub']['players'][number];
          if (pub.phase !== 'showdown' && pub.phase !== 'waiting') chips += hp.total;
          chips += hp.pending;
        }
        effects = effects.concat(cashoutEffects({ ...p, chips }));
      }
      pub.players = [] as never;
      return { effects, closed: true };
    }
    default:
      if (!me && move.type !== 'timeout' && move.type !== 'next') fail('אתה לא בשולחן');
      return {
        effects:
          pub.kind === 'blackjack'
            ? actBlackjack(f as BJFull, actorId, move as BJMove, now)
            : actHoldem(f as HFull, actorId, move as HMove, now),
      };
  }
}

// הנתונים הפרטיים לכל שחקן אנושי (קלפים סגורים בפוקר)
export function privateViews(f: Full): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.pub.kind !== 'holdem') return out;
  for (const p of f.pub.players) if (!p.isBot) out[p.id] = holdemPrivate(f as HFull, p.id);
  return out;
}
