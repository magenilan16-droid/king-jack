// סיכום ערב: מי המלך, מי תרם, הקופה הגדולה, היד הכי חזקה ועוד - מתוך היסטוריית הידיים והיומן
import type { HoldemHandRecord } from '../engine/holdem';
import type { BlackjackHandRecord } from '../engine/blackjack';
import type { Card } from '../engine/cards';
import type { PlayerLine } from './balances';
import type { Lang } from './i18n';
import { displayName } from './display';

export type HandRow = { hand_no: number; created_at: string; data: HoldemHandRecord | BlackjackHandRecord };

export interface NightStats {
  lines: PlayerLine[]; // מהרווח הגדול לקטן
  king: PlayerLine | null;
  donor: PlayerLine | null;
  hands: number;
  minutes: number;
  startedAt: string | null;
  biggest: { amount: number; name: string; cat?: number } | null;
  best: { cat: number; name: string; cards: Card[] } | null;
  mostWins: { name: string; n: number } | null;
  blackjacks: { name: string; n: number } | null;
}

export function nightStats(lines: PlayerLine[], rows: HandRow[], lang: Lang): NightStats {
  const sorted = [...lines].sort((a, b) => b.net - a.net);
  const king = sorted[0] && sorted[0].net > 0 ? sorted[0] : null;
  const last = sorted[sorted.length - 1];
  const donor = sorted.length >= 2 && last.net < 0 ? last : null;
  let biggest: NightStats['biggest'] = null;
  let best: NightStats['best'] = null;
  let bestPot = 0;
  const wins = new Map<string, { name: string; n: number }>();
  const bjs = new Map<string, { name: string; n: number }>();
  const nameIn = (p: { name: string; isBot: boolean }) => displayName(p, lang);
  for (const r of rows) {
    const d = r.data;
    if (d.kind === 'holdem') {
      const byId = new Map(d.players.map((p) => [p.id, p]));
      const top = [...d.winners].sort((a, b) => b.amount - a.amount)[0];
      if (top && (!biggest || d.pot > biggest.amount)) {
        const p = byId.get(top.id);
        biggest = { amount: d.pot, name: p ? nameIn(p) : top.name, cat: top.cat >= 0 ? top.cat : undefined };
      }
      for (const w of d.winners) {
        const p = byId.get(w.id);
        const name = p ? nameIn(p) : w.name;
        const cur = wins.get(w.id) ?? { name, n: 0 };
        cur.n++;
        wins.set(w.id, cur);
        if (w.cat >= 0 && w.best && (!best || w.cat > best.cat || (w.cat === best.cat && d.pot > bestPot))) {
          best = { cat: w.cat, name, cards: w.best };
          bestPot = d.pot;
        }
      }
    } else {
      for (const p of d.players) {
        const name = nameIn(p);
        if (p.net > 0) {
          const cur = wins.get(p.id) ?? { name, n: 0 };
          cur.n++;
          wins.set(p.id, cur);
          if (!biggest || p.net > biggest.amount) biggest = { amount: p.net, name };
        }
        const n = p.hands.filter((h) => h.result === 'blackjack').length;
        if (n) {
          const cur = bjs.get(p.id) ?? { name, n: 0 };
          cur.n += n;
          bjs.set(p.id, cur);
        }
      }
    }
  }
  const topOf = (m: Map<string, { name: string; n: number }>) => [...m.values()].sort((a, b) => b.n - a.n)[0] ?? null;
  const times = rows.map((r) => new Date(r.created_at).getTime()).filter(Number.isFinite);
  const minutes = times.length > 1 ? Math.round((Math.max(...times) - Math.min(...times)) / 60000) : 0;
  return {
    lines: sorted,
    king,
    donor,
    hands: rows.length,
    minutes,
    startedAt: times.length ? new Date(Math.min(...times)).toISOString() : null,
    biggest,
    best,
    mostWins: topOf(wins),
    blackjacks: topOf(bjs),
  };
}

export function durationText(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === 'he') return h ? `${h}:${String(m).padStart(2, '0')} שעות` : `${m} דקות`;
  return h ? `${h}h ${m}m` : `${m} min`;
}
