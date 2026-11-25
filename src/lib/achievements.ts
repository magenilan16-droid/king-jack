// הישגים: רגעים מיוחדים ביד (רביעייה, 7-2 מנצח, קופת ענק...). נחגגים בשולחן ונאספים בפרופיל
import type { HoldemHandRecord } from '../engine/holdem';
import type { BlackjackHandRecord } from '../engine/blackjack';
import type { Card } from '../engine/cards';
import { bestFor } from '../engine/handEval';
import { supabase } from './supabase';

export type AchId = 'royal' | 'sflush' | 'quads' | 'seventwo' | 'monster' | 'bluff' | 'blackjack';

// מהנדיר לנפוץ - כשיש כמה ביד אחת, חוגגים את הראשון
export const ACH_ORDER: AchId[] = ['royal', 'sflush', 'quads', 'seventwo', 'monster', 'bluff', 'blackjack'];

export const ACH_INFO: Record<AchId, { he: string; en: string; heHow: string; enHow: string }> = {
  royal: { he: 'רויאל פלאש', en: 'Royal flush', heHow: 'לנצח עם 10 עד אס, הכל באותה צורה', enHow: 'Win with ten to ace, all one suit' },
  sflush: { he: 'רצף צבע', en: 'Straight flush', heHow: 'לנצח עם 5 קלפים ברצף באותה צורה', enHow: 'Win with five in a row, all one suit' },
  quads: { he: 'רביעייה', en: 'Four of a kind', heHow: 'לנצח עם ארבעה קלפים מאותה דרגה', enHow: 'Win with four of the same rank' },
  seventwo: { he: '7-2 מנצח', en: 'Winning 7-2', heHow: 'לנצח עם 7 ו-2, היד הכי גרועה בפוקר, ולהראות אותה', enHow: 'Win with 7-2, the worst hand in poker, and show it' },
  monster: { he: 'קופת ענק', en: 'Monster pot', heHow: 'לקחת קופה של 100 ביג בליינדים ומעלה', enHow: 'Take a pot of 100 big blinds or more' },
  bluff: { he: 'בלוף מוצג', en: 'Shown bluff', heHow: 'כולם קיפלו מולך, ואז הראית שלא היה לך כלום', enHow: 'Everyone folded, then you showed you had nothing' },
  blackjack: { he: 'בלאק ג׳ק', en: 'Blackjack', heHow: 'לקבל אס ותמונה בבלאק ג׳ק', enHow: 'Get an ace and a ten-value card' },
};

const rank = (c: Card) => c[0];

// אילו הישגים שחקן השיג ביד הזאת (רק מה שכולם ראו - קלפים שלא נחשפו לא נספרים)
export function holdemAch(rec: HoldemHandRecord, id: string): AchId[] {
  const out: AchId[] = [];
  const w = rec.winners.find((x) => x.id === id);
  const p = rec.players.find((x) => x.id === id);
  if (!w || !p) return out;
  if (w.cat === 8) {
    const rs = (w.best ?? []).map(rank);
    out.push(rs.includes('A') && rs.includes('K') ? 'royal' : 'sflush');
  }
  if (w.cat === 7) out.push('quads');
  if (rec.variant !== 'omaha' && p.shown?.length === 2 && p.shown.map(rank).sort().join('') === '27') out.push('seventwo');
  if (w.amount >= 100 * Math.max(1, rec.blinds[1])) out.push('monster');
  if (rec.reason === 'fold' && p.shown?.length) {
    if (rec.board.length >= 3) {
      if (bestFor(p.shown, rec.board).cat === 0) out.push('bluff');
    } else if (p.shown.length === 2 && rank(p.shown[0]) !== rank(p.shown[1]) && p.shown.every((c) => '23456789'.includes(rank(c)))) out.push('bluff');
  }
  return out;
}

export function bjAch(rec: BlackjackHandRecord, id: string): AchId[] {
  const p = rec.players.find((x) => x.id === id);
  return p?.hands.some((h) => h.result === 'blackjack') ? ['blackjack'] : [];
}

// כמה פעמים השגתי כל הישג (מכל השולחנות). פוקר: רק ידיים שניצחתי בהן. בלאק ג׳ק: רק סיבובים עם בלאק ג׳ק
export async function loadMyAchievements(id: string): Promise<{ counts: Record<AchId, number>; wins: number }> {
  const counts = Object.fromEntries(ACH_ORDER.map((a) => [a, 0])) as Record<AchId, number>;
  const [h, b] = await Promise.all([
    supabase.from('game_hands').select('data').eq('game_type', 'holdem').contains('data', { winners: [{ id }] }).limit(3000),
    supabase
      .from('game_hands')
      .select('hand_no', { count: 'exact', head: true })
      .eq('game_type', 'blackjack')
      .contains('data', { players: [{ id, hands: [{ result: 'blackjack' }] }] }),
  ]);
  const rows = (h.data ?? []) as { data: HoldemHandRecord }[];
  for (const r of rows) for (const a of holdemAch(r.data, id)) counts[a]++;
  counts.blackjack = b.count ?? 0;
  return { counts, wins: rows.length };
}
