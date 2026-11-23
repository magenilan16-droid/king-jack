// חישוב מאזן לכל שחקן בשולחן: כמה קנה, כמה יש לו עכשיו / יצא, ורווח/הפסד
import type { RoomRow, LedgerRow } from './useRoom';
import type { BJState } from '../engine/blackjack';
import type { HState } from '../engine/holdem';
import { settle, type Balance, type Transfer } from '../engine/settle';
import { tr, getLang } from './i18n';

export interface PlayerLine {
  id: string;
  name: string;
  avatar: string;
  buyin: number;
  out: number; // יצא עם + מה שיש לו עכשיו על השולחן
  net: number;
  seated: boolean;
}

export const KUPA_ID = 'kupa';

function inPlay(state: RoomRow['state'], id: string): number {
  if (state.kind === 'blackjack') {
    const s = state as BJState;
    const p = s.players.find((x) => x.id === id);
    if (!p) return 0;
    const bets = s.phase === 'playing' ? p.hands.reduce((a, h) => a + h.bet, 0) : 0;
    return p.chips + bets;
  }
  const s = state as HState;
  const p = s.players.find((x) => x.id === id);
  if (!p) return 0;
  const running = s.phase !== 'waiting' && s.phase !== 'showdown';
  return p.chips + p.pending + (running ? p.total : 0);
}

export function computeLines(
  room: RoomRow,
  ledger: LedgerRow[],
  names: Record<string, { name: string; avatar: string }>,
): { lines: PlayerLine[]; kupa: number; transfers: Transfer[] } {
  const map = new Map<string, PlayerLine>();
  const seatedIds = new Set(room.status === 'open' ? room.state.players.filter((p) => !p.isBot).map((p) => p.id) : []);
  let botsNet = 0;
  for (const l of ledger) {
    if (!l.user_id) {
      botsNet += l.kind === 'cashout' ? Number(l.amount) : -Number(l.amount);
      continue;
    }
    let line = map.get(l.user_id);
    if (!line) {
      const pl = room.state.players.find((p) => p.id === l.user_id);
      const n = names[l.user_id] ?? { name: pl?.name ?? '?', avatar: pl?.avatar ?? '🙂' };
      line = { id: l.user_id, name: n.name, avatar: n.avatar, buyin: 0, out: 0, net: 0, seated: false };
      map.set(l.user_id, line);
    }
    if (l.kind === 'buyin') line.buyin += Number(l.amount);
    else line.out += Number(l.amount);
  }
  for (const line of map.values()) {
    if (seatedIds.has(line.id)) {
      line.seated = true;
      line.out += inPlay(room.state, line.id);
    }
    line.out = Math.round(line.out * 100) / 100;
    line.net = Math.round((line.out - line.buyin) * 100) / 100;
  }
  const lines = [...map.values()].sort((a, b) => b.net - a.net);
  // הקופה = כל מה שהבוטים/הבית הרוויחו או הפסידו מול החברים
  const kupa = Math.round(-lines.reduce((a, l) => a + l.net, 0) * 100) / 100;
  void botsNet;
  const balances: Balance[] = lines.map((l) => ({ id: l.id, name: l.name, net: l.net }));
  if (Math.abs(kupa) > 0.005) balances.push({ id: KUPA_ID, name: tr('🏦 הקופה', '🏦 The Kitty'), net: kupa });
  return { lines, kupa, transfers: settle(balances) };
}

// סכום עם סימן (+120 / -50) שנשאר בצד הנכון גם בעברית
export function signed(n: number, unit = ''): string {
  const r = Math.round(n * 100) / 100;
  const sign = r > 0 ? '+' : r < 0 ? '-' : '';
  return `‎${sign}${unit}${fmt(Math.abs(r))}`;
}

export function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString(getLang() === 'he' ? 'he-IL' : 'en-US', { maximumFractionDigits: 2 });
}
