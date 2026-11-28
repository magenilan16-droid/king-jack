// פרסי השפלה: תארים מצחיקים (באהבה) לחברים, לפי איך ששיחקו הערב.
// פונקציה טהורה - מקבלת את היסטוריית הידיים ואת השורות של היומן, ומחזירה עד 6 פרסים
import type { HoldemHandRecord } from '../engine/holdem';
import { handValue, type BlackjackHandRecord } from '../engine/blackjack';
import { bestFor } from '../engine/handEval';
import type { PlayerLine } from './balances';
import { fmt } from './balances';
import type { Lang } from './i18n';
import { displayName, handName } from './display';

export type AwardId = 'atm' | 'grandma' | 'cowboy' | 'bluffer' | 'heartbreak' | 'lucky' | 'curious' | 'burner' | 'splitter';

export interface Award {
  id: AwardId;
  title: string;
  line: string; // למה הוא/היא קיבלו את הפרס - עם המספר
  playerId: string;
  name: string;
  avatar: string;
  isBot: boolean;
}

export const MAX_AWARDS = 6;
const MAX_PER_PLAYER = 2; // שלא יהיה ערב שבו אחד לוקח את כל הפרסים

type Rec = { data: HoldemHandRecord | BlackjackHandRecord };
type Who = { name: string; avatar: string; isBot: boolean };
// מועמד: score קובע, tie שובר שוויון, ובשוויון מלא - בן אדם לפני בוט
type Cand = { id: string; score: number; tie?: number; line: string };

const TITLES: Record<AwardId, [string, string]> = {
  atm: ['כספומט הערב', 'ATM of the night'],
  grandma: ['סבתא של הערב', 'Grandma of the night'],
  cowboy: ['הקאובוי', 'The cowboy'],
  bluffer: ['הבלופר', 'The bluffer'],
  heartbreak: ['שבר לב', 'Heartbreak'],
  lucky: ['המזליסט', 'Lucky charm'],
  curious: ['הסקרן', 'The curious one'],
  burner: ['השורף', 'The burner'],
  splitter: ['הפצלן', 'The splitter'],
};

// סדר העדיפות כשיש יותר מדי פרסים (הראשונים - האהובים על החבורה)
const ORDER_HOLDEM: AwardId[] = ['grandma', 'atm', 'cowboy', 'bluffer', 'heartbreak', 'lucky', 'curious'];
const ORDER_BJ: AwardId[] = ['atm', 'burner', 'grandma', 'cowboy', 'heartbreak', 'lucky', 'splitter'];

function top(cands: Cand[], who: Map<string, Who>): Cand | null {
  let best: Cand | null = null;
  for (const c of cands) {
    if (!who.has(c.id)) continue;
    if (!best) {
      best = c;
      continue;
    }
    const d = c.score - best.score || (c.tie ?? 0) - (best.tie ?? 0);
    if (d > 0 || (d === 0 && who.get(best.id)!.isBot && !who.get(c.id)!.isBot)) best = c;
  }
  return best;
}

type HStat = {
  dealt: number;
  folds: number;
  allins: number;
  steals: number; // קופות שנלקחו בלי שאף אחד ראה קלפים (אחרי הימור/העלאה שלו)
  sdSeen: number;
  sdLost: number;
  suckouts: number; // היה מאחור בטרן וניצח בריבר
  suckPot: number;
  worst: number; // ההפסד הכי גדול ביד אחת
  worstBb: number;
  worstCat?: number;
};

type BStat = {
  hands: number;
  busts: number;
  stands: number; // עצר על 12-16
  lowWins: number; // ניצח עם 16 ומטה (הדילר נשרף)
  maxBet: number;
  worst: number;
  splits: number;
};

export function computeAwards(lines: PlayerLine[], rows: Rec[], lang: Lang, buyCount?: Record<string, number>): Award[] {
  const he = lang === 'he';
  const t = (h: string, e: string) => (he ? h : e);

  // מי זה מי: מההיסטוריה (כולל בוטים), ואז מהיומן (שמות ותמונות פרופיל עדכניים)
  const who = new Map<string, Who>();
  const rowNet = new Map<string, number>();
  for (const r of rows)
    for (const p of r.data.players) {
      who.set(p.id, { name: displayName(p, lang), avatar: p.avatar, isBot: p.isBot });
      rowNet.set(p.id, (rowNet.get(p.id) ?? 0) + p.net);
    }
  for (const l of lines) who.set(l.id, { name: l.name, avatar: l.avatar, isBot: false });
  const netOf = (id: string) => lines.find((l) => l.id === id)?.net ?? rowNet.get(id) ?? 0;

  const found = new Map<AwardId, Cand>();
  const put = (id: AwardId, cands: Cand[]) => {
    const c = top(cands, who);
    if (c) found.set(id, c);
  };

  // ---------- כספומט: הכי הרבה קניות חוזרות (ובלי קניות חוזרות - ההפסד הכי גדול) ----------
  const rebuys: Cand[] = Object.entries(buyCount ?? {})
    .filter(([, n]) => n >= 2)
    .map(([id, n]) => ({
      id,
      score: n - 1,
      tie: -netOf(id),
      line: n === 2 ? t('קנייה חוזרת אחת', 'Reloaded once') : t(`${n - 1} קניות חוזרות`, `Reloaded ${n - 1} times`),
    }));
  if (rebuys.some((c) => who.has(c.id))) put('atm', rebuys);
  else
    put(
      'atm',
      lines
        .filter((l) => l.net < 0 && -l.net >= l.buyin * 0.5)
        .map((l) => ({ id: l.id, score: -l.net, line: t(`${fmt(-l.net)} נשארו על השולחן`, `Left ${fmt(-l.net)} on the table`) })),
    );

  // ---------- הולדם / אומהה ----------
  const H = new Map<string, HStat>();
  const hs = (id: string) => {
    let s = H.get(id);
    if (!s) H.set(id, (s = { dealt: 0, folds: 0, allins: 0, steals: 0, sdSeen: 0, sdLost: 0, suckouts: 0, suckPot: 0, worst: 0, worstBb: 0 }));
    return s;
  };
  // ---------- בלאק ג׳ק ----------
  const B = new Map<string, BStat>();
  const bs = (id: string) => {
    let s = B.get(id);
    if (!s) B.set(id, (s = { hands: 0, busts: 0, stands: 0, lowWins: 0, maxBet: 0, worst: 0, splits: 0 }));
    return s;
  };
  const bets: number[] = [];

  for (const r of rows) {
    const d = r.data;
    if (d.kind === 'holdem') {
      const winners = new Set(d.winners.map((w) => w.id));
      const acts = new Map<string, string[]>();
      for (const e of d.log ?? []) acts.set(e.id, [...(acts.get(e.id) ?? []), e.a]);
      const bb = d.blinds?.[1] ?? 0;
      for (const p of d.players) {
        const s = hs(p.id);
        const a = acts.get(p.id) ?? [];
        s.dealt++;
        if (p.folded) s.folds++;
        if (a.includes('allin')) s.allins++;
        if (d.reason === 'fold' && winners.has(p.id) && !p.shown && a.some((x) => x === 'allin' || x.startsWith('raise'))) s.steals++;
        if (d.reason === 'showdown' && !p.folded) {
          s.sdSeen++;
          if (!winners.has(p.id)) s.sdLost++;
        }
        if (-p.net > s.worst) {
          s.worst = -p.net;
          s.worstBb = bb;
          s.worstCat = d.reason === 'showdown' && !p.folded ? p.cat : undefined;
        }
      }
      // המזליסט: מי שהיה מאחור אחרי הטרן - והריבר הציל אותו
      if (d.reason === 'showdown' && d.board.length === 5) {
        const alive = d.players.filter((p) => !p.folded && p.shown && p.shown.length >= 2);
        if (alive.length >= 2) {
          const turn = d.board.slice(0, 4);
          const at = alive.map((p) => ({ id: p.id, score: bestFor(p.shown!, turn).score }));
          const lead = Math.max(...at.map((x) => x.score));
          const leaders = at.filter((x) => x.score === lead);
          if (leaders.every((x) => !winners.has(x.id)))
            for (const w of d.winners) {
              if (!at.some((x) => x.id === w.id)) continue;
              const s = hs(w.id);
              s.suckouts++;
              s.suckPot += w.amount;
            }
        }
      }
    } else {
      const dealerBJ = d.dealer.length === 2 && d.dealerTotal === 21;
      for (const p of d.players) {
        const s = bs(p.id);
        if (p.hands.length > 1) s.splits++;
        if (-p.net > s.worst) s.worst = -p.net;
        for (const h of p.hands) {
          s.hands++;
          bets.push(h.bet);
          s.maxBet = Math.max(s.maxBet, h.bet);
          const total = handValue(h.cards).total;
          if (h.result === 'bust') s.busts++;
          else if (!dealerBJ && total >= 12 && total <= 16) {
            s.stands++;
            if (h.result === 'win') s.lowWins++;
          }
        }
      }
    }
  }

  const hList = [...H.entries()];
  if (hList.length) {
    const maxDealt = Math.max(...hList.map(([, s]) => s.dealt));
    put(
      'grandma',
      hList
        .filter(([, s]) => s.dealt >= 8 && s.dealt >= maxDealt * 0.3 && s.folds >= 3)
        .map(([id, s]) => ({
          id,
          score: s.folds / s.dealt,
          tie: s.folds,
          line: t(`${s.folds} קיפולים מתוך ${s.dealt} ידיים`, `Folded ${s.folds} of ${s.dealt} hands`),
        })),
    );
    put(
      'cowboy',
      hList
        .filter(([, s]) => s.allins >= 2)
        .map(([id, s]) => ({ id, score: s.allins, tie: -s.dealt, line: t(`${s.allins} פעמים אול-אין`, `All-in ${s.allins} times`) })),
    );
    put(
      'bluffer',
      hList
        .filter(([, s]) => s.steals >= 2)
        .map(([id, s]) => ({
          id,
          score: s.steals,
          tie: -s.dealt,
          line: t(`${s.steals} קופות בלי להראות קלף`, `Took ${s.steals} pots without showing a card`),
        })),
    );
    put(
      'heartbreak',
      hList
        .filter(([, s]) => s.worst > 0 && s.worst >= s.worstBb * 25)
        .map(([id, s]) => {
          const hand = s.worstCat != null && s.worstCat >= 2 ? ` (${handName(s.worstCat, lang)})` : '';
          return { id, score: s.worst, line: t(`יד אחת שעלתה ${fmt(s.worst)}`, `One hand cost ${fmt(s.worst)}`) + hand };
        }),
    );
    put(
      'lucky',
      hList
        .filter(([, s]) => s.suckouts >= 1)
        .map(([id, s]) => ({
          id,
          score: s.suckouts,
          tie: s.suckPot,
          line:
            s.suckouts === 1
              ? t('הריבר הציל פעם אחת', 'Saved by the river once')
              : t(`הריבר הציל ${s.suckouts} פעמים`, `Saved by the river ${s.suckouts} times`),
        })),
    );
    put(
      'curious',
      hList
        .filter(([, s]) => s.sdLost >= 3)
        .map(([id, s]) => ({
          id,
          score: s.sdLost,
          tie: s.sdLost / s.sdSeen,
          line: t(`${s.sdLost} הפסדים בקלפים פתוחים`, `Lost ${s.sdLost} showdowns`),
        })),
    );
  }

  const bList = [...B.entries()];
  if (bList.length) {
    const sorted = [...bets].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    put(
      'burner',
      bList
        .filter(([, s]) => s.busts >= 2)
        .map(([id, s]) => ({ id, score: s.busts, tie: s.busts / s.hands, line: t(`${s.busts} פעמים מעל 21`, `Busted ${s.busts} times`) })),
    );
    put(
      'grandma',
      bList
        .filter(([, s]) => s.stands >= 3)
        .map(([id, s]) => ({
          id,
          score: s.stands,
          tie: s.stands / s.hands,
          line: t(`${s.stands} עצירות על 16 ומטה`, `Stood on 16 or less ${s.stands} times`),
        })),
    );
    put(
      'cowboy',
      bList
        .filter(([, s]) => median > 0 && s.maxBet >= median * 2)
        .map(([id, s]) => ({ id, score: s.maxBet, line: t(`הימור של ${fmt(s.maxBet)} על יד אחת`, `Bet ${fmt(s.maxBet)} on a single hand`) })),
    );
    put(
      'heartbreak',
      bList
        .filter(([, s]) => median > 0 && s.worst >= median * 2)
        .map(([id, s]) => ({ id, score: s.worst, line: t(`סיבוב אחד שעלה ${fmt(s.worst)}`, `One round cost ${fmt(s.worst)}`) })),
    );
    put(
      'lucky',
      bList
        .filter(([, s]) => s.lowWins >= 2)
        .map(([id, s]) => ({ id, score: s.lowWins, line: t(`${s.lowWins} ניצחונות עם 16 ומטה`, `Won ${s.lowWins} times holding 16 or less`) })),
    );
    put(
      'splitter',
      bList
        .filter(([, s]) => s.splits >= 2)
        .map(([id, s]) => ({ id, score: s.splits, line: t(`${s.splits} פיצולים`, `Split ${s.splits} times`) })),
    );
  }

  // לפי סדר העדיפות, עד 6 פרסים ועד 2 לכל שחקן
  const order = bList.length > hList.length ? ORDER_BJ : ORDER_HOLDEM;
  const per = new Map<string, number>();
  const out: Award[] = [];
  for (const id of order) {
    const c = found.get(id);
    if (!c || out.length >= MAX_AWARDS) continue;
    const n = per.get(c.id) ?? 0;
    if (n >= MAX_PER_PLAYER) continue;
    per.set(c.id, n + 1);
    const w = who.get(c.id)!;
    out.push({ id, title: t(...TITLES[id]), line: c.line, playerId: c.id, name: w.name, avatar: w.avatar, isBot: w.isBot });
  }
  return out;
}
