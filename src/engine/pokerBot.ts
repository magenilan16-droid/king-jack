// המוח של הבוטים בפוקר (טקסס הולדם ואומהה)
// כל בוט עם אופי משלו, משחק לפי המיקום ולפי מה שהיריבים עשו, מהמר בסכומים "עגולים" כמו בן אדם,
// ולוקח זמן לחשוב: החלטה קלה - מהר, החלטה גדולה - מתלבט
import { type Card, rankOf, suitOf } from './cards.ts';
import { bestFor } from './handEval.ts';
import { equityVs, type HandFilter } from './equity.ts';
import { botSeed, botSpeed, between, isGranny } from './common.ts';
import { type HFull, type HPlayer, type HMove, type HState, type HandLogEntry, potSize, potLimitTo, isOmaha, canAct } from './holdem.ts';

// ---------- אופי ----------
interface Style {
  loose: number; // הזזת סף הידיים לפני הפלופ (חיובי = משחק יותר ידיים)
  aggr: number; // 0-1: כמה אוהב להעלות במקום רק להשוות
  bluff: number; // הסתברות לבלוף במצבים שמתאימים לזה
  trap: number; // הסתברות להסתיר יד חזקה (צ׳ק במקום הימור)
}
const STYLES: Style[] = [
  { loose: 0, aggr: 0.7, bluff: 0.1, trap: 0.15 }, // סולידי ואגרסיבי
  { loose: -0.8, aggr: 0.5, bluff: 0.05, trap: 0.25 }, // זהיר, מתלבט (גם איטי יותר - ראו botSpeed)
  { loose: 1, aggr: 0.85, bluff: 0.16, trap: 0.1 }, // פרוע ומהיר
  { loose: 0.5, aggr: 0.45, bluff: 0.07, trap: 0.2 }, // רגוע, אוהב לראות פלופים
];
// סבתא של תמיר: מחכה לקלפים טובים, כמעט לא מבלפת, אוהבת להסתיר יד חזקה
const GRANNY: Style = { loose: -1.6, aggr: 0.35, bluff: 0.02, trap: 0.45 };
export const styleOf = (id: string): Style => (isGranny(id) ? GRANNY : STYLES[botSeed(id) % STYLES.length]);

// ---------- חוזק יד לפני הפלופ ----------
// נוסחת צ׳ן (Chen) - דירוג מקובל של 2 קלפים: AA=20, KK=16, AKs=12, 72o=-1
export function chen(hole: Card[]): number {
  let a = rankOf(hole[0]);
  let b = rankOf(hole[1]);
  if (b > a) [a, b] = [b, a];
  const pts = (r: number) => (r === 14 ? 10 : r === 13 ? 8 : r === 12 ? 7 : r === 11 ? 6 : r / 2);
  if (a === b) return Math.max(5, pts(a) * 2);
  let s = pts(a);
  if (suitOf(hole[0]) === suitOf(hole[1])) s += 2;
  const gap = a - b - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && a < 12) s += 1;
  return Math.ceil(s);
}

// אומהה: ניקוד פשוט ל-4 קלפים - קלפים גבוהים, זוגות, צבעים (עם אס - הכי טוב), קלפים מחוברים
// AAKK בשני צבעים ~35, AKQJ ~16, JT98 בשני צבעים ~13, יד זבל ~2
export function omahaScore(hole: Card[]): number {
  const ranks = hole.map(rankOf).sort((x, y) => y - x);
  const hi = (r: number) => (r === 14 ? 4 : r === 13 ? 3 : r === 12 ? 2.5 : r === 11 ? 2 : r === 10 ? 1.5 : r === 9 ? 1 : 0);
  let s = 0;
  for (const r of ranks) s += hi(r);
  const cnt = new Map<number, number>();
  for (const r of ranks) cnt.set(r, (cnt.get(r) ?? 0) + 1);
  for (const [r, c] of cnt) {
    if (c === 2) s += r === 14 ? 8 : r === 13 ? 4.5 : r === 12 ? 4 : r === 11 ? 3.5 : r === 10 ? 3 : r >= 7 ? 2 : 1.5;
    if (c >= 3) s -= 3; // קלף מת
  }
  const bySuit = new Map<string, number[]>();
  for (const c of hole) bySuit.set(suitOf(c), [...(bySuit.get(suitOf(c)) ?? []), rankOf(c)]);
  for (const rs of bySuit.values()) {
    if (rs.length === 2 || rs.length === 3) s += (rs.length === 2 ? 2 : 1) + (rs.includes(14) ? 1.5 : rs.includes(13) ? 0.5 : 0);
  }
  const uniq = [...new Set(ranks)];
  for (let i = 0; i + 1 < uniq.length; i++) {
    const gap = uniq[i] - uniq[i + 1];
    s += gap === 1 ? 1.5 : gap === 2 ? 1 : gap === 3 ? 0.5 : 0;
  }
  // קלף "תלוי": רחוק מכל השאר ולא באותו צבע עם אף אחד
  for (const c of hole) {
    const r = rankOf(c);
    if (!hole.some((d) => d !== c && (Math.abs(rankOf(d) - r) <= 3 || suitOf(d) === suitOf(c)))) s -= 1.5;
  }
  return s;
}

// ---------- מה היריבים כנראה מחזיקים ----------
const isRaise = (a: string) => a.startsWith('raise') || a === 'allin';

// הדירוג של הלוח לבד (רק זוגות/שלישיות) - כדי לדעת אם היד של היריב "משתמשת" בקלפים שלה
function boardCat(board: Card[]): number {
  const cnt = new Map<number, number>();
  for (const c of board) cnt.set(rankOf(c), (cnt.get(rankOf(c)) ?? 0) + 1);
  const g = [...cnt.values()].sort((a, b) => b - a);
  if (g[0] >= 4) return 7;
  if (g[0] === 3) return g[1] >= 2 ? 6 : 3;
  if (g[0] === 2) return g[1] === 2 ? 2 : 1;
  return 0;
}

// האם היד "פגעה" בלוח: זוג ומעלה מהקלפים שלה, או דרו לצבע / לרצף
function connects(hand: Card[], board: Card[]): boolean {
  if (bestFor(hand, board).cat > boardCat(board)) return true;
  if (board.length >= 5) return false;
  const omaha = hand.length === 4;
  for (const su of 'shdc') {
    const h = hand.filter((c) => suitOf(c) === su).length;
    const b = board.filter((c) => suitOf(c) === su).length;
    if (omaha ? h >= 2 && b >= 2 : h >= 1 && h + b >= 4) return true;
  }
  if (!omaha) {
    const all = new Set([...hand, ...board].map(rankOf));
    const mine = new Set(hand.map(rankOf));
    if (all.has(14)) all.add(1);
    if (mine.has(14)) mine.add(1);
    for (let lo = 1; lo <= 10; lo++) {
      let have = 0;
      let fromHand = false;
      for (let r = lo; r < lo + 5; r++)
        if (all.has(r)) {
          have++;
          if (mine.has(r)) fromHand = true;
        }
      if (have >= 4 && fromHand) return true;
    }
  }
  return false;
}

// הטווח של יריב לפי מה שעשה ביד הזו: מי שהעלה לפני הפלופ - יד טובה, מי שהימר עכשיו - כנראה פגע בלוח
function rangeOf(s: HState, o: HPlayer): HandFilter {
  const mine = (s.handLog ?? []).filter((e) => e.id === o.id);
  const omaha = isOmaha(s);
  const preRaise = mine.some((e) => e.st === 'preflop' && isRaise(e.a));
  const preCall = mine.some((e) => e.st === 'preflop' && e.a.startsWith('call'));
  const betNow = mine.some((e) => e.st === s.phase && isRaise(e.a));
  const stayedEarlier = mine.some((e) => e.st !== 'preflop' && e.st !== s.phase && (e.a.startsWith('call') || isRaise(e.a)));
  const minChen = omaha ? null : preRaise ? 8 : preCall ? 5 : null;
  // כמה מהזמן הוא עושה את זה גם בלי כלום (בלוף / סתם סקרנות)
  const leak = betNow ? 0.3 : stayedEarlier ? 0.5 : 1;
  if (minChen == null && leak >= 1) return null;
  const board = s.board;
  return (hand) => {
    if (minChen != null && chen(hand) < minChen && Math.random() > 0.15) return false;
    if (leak < 1 && Math.random() > leak && !connects(hand, board)) return false;
    return true;
  };
}

// ---------- מצב השולחן מנקודת המבט של הבוט ----------
interface Ctx {
  s: HState;
  p: HPlayer;
  st: Style;
  hole: Card[];
  omaha: boolean;
  bb: number;
  pot: number;
  toCall: number;
  potOdds: number;
  commit: number; // כמה מהערימה שנשארה צריך לשים כדי להשוות
  maxTo: number; // אול-אין
  capTo: number; // הכי הרבה שמותר (באומהה - גודל הקופה)
  minTo: number;
  canRaise: boolean;
  opps: HPlayer[];
  log: HandLogEntry[];
  street: HandLogEntry[];
  raises: number; // כמה העלאות היו בסיבוב הזה
  callers: number;
  behind: number; // כמה שחקנים עוד ידברו אחריי
  effBB: number; // הערימה האפקטיבית בביג בליינדים
}

interface Decision {
  move: HMove;
  hard: number; // 0-1: כמה ההחלטה קשה (משפיע על זמן המחשבה)
}

function context(f: HFull, p: HPlayer): Ctx {
  const s = f.pub;
  const omaha = isOmaha(s);
  const pot = potSize(s);
  const toCall = Math.max(0, s.currentBet - p.bet);
  const maxTo = p.bet + p.chips;
  const opps = s.players.filter((x) => x !== p && x.inHand && !x.folded);
  const log = s.handLog ?? [];
  const street = log.filter((e) => e.st === s.phase && !/^(sb|bb):/.test(e.a));
  const biggest = Math.max(0, ...opps.map((o) => o.chips + o.bet));
  return {
    s,
    p,
    st: styleOf(p.id),
    hole: f.sec.holes[p.id] ?? [],
    omaha,
    bb: s.settings.bb,
    pot,
    toCall,
    potOdds: toCall > 0 ? toCall / (pot + toCall) : 0,
    commit: toCall / Math.max(1, p.chips),
    maxTo,
    capTo: omaha ? Math.min(maxTo, potLimitTo(s, p)) : maxTo,
    minTo: Math.min(maxTo, s.currentBet + s.minRaise),
    canRaise: !p.acted && maxTo > s.currentBet,
    opps,
    log,
    street,
    raises: street.filter((e) => isRaise(e.a)).length,
    callers: street.filter((e) => e.a.startsWith('call')).length,
    behind: s.players.filter((x) => x !== p && canAct(x) && !x.acted).length,
    effBB: Math.min(maxTo, biggest) / s.settings.bb,
  };
}

// סכום "עגול" כמו שבן אדם היה שם
function nice(x: number, bb: number): number {
  const sb = Math.max(1, Math.floor(bb / 2));
  const unit = x >= 40 * bb ? 5 * bb : x >= 12 * bb ? bb : sb;
  return Math.max(unit, Math.round(x / unit) * unit);
}

const passive = (c: Ctx): HMove => (c.toCall > 0 ? { type: 'call' } : { type: 'check' });
const foldOr = (c: Ctx): HMove => (c.toCall > 0 ? { type: 'fold' } : { type: 'check' });

// העלאה ל-target (סכום כולל בסיבוב). דואג לחוקים: מינימום, מקסימום, פוט-לימיט, ואול-אין כשזה כמעט הכל
function raise(c: Ctx, target: number): HMove {
  if (!c.canRaise) return passive(c);
  let to = Math.max(nice(target, c.bb), c.minTo);
  if (to >= c.capTo) to = c.capTo;
  if (to >= c.maxTo) return { type: 'allin' };
  if (!c.omaha && c.maxTo - to < to * 0.35) return { type: 'allin' };
  if (to <= c.s.currentBet) return passive(c);
  return { type: 'raise', to };
}

function shove(c: Ctx): HMove {
  if (c.maxTo <= c.s.currentBet) return { type: 'allin' }; // אול-אין שהוא בעצם השוואה
  if (!c.canRaise) return passive(c);
  if (c.omaha && c.maxTo > c.capTo) return raise(c, c.capTo);
  return { type: 'allin' };
}

// הימור כשאין הימור קודם: חלק מהקופה
const bet = (c: Ctx, frac: number) => raise(c, Math.max(c.bb, c.pot * frac));
// העלאה מול הימור: בערך פי x מההימור
const reraise = (c: Ctx, x: number) => raise(c, Math.max(c.s.currentBet * x, c.s.currentBet + (c.pot + c.toCall) * 0.6));

// ---------- לפני הפלופ - טקסס ----------
function holdemPreflop(c: Ctx): Decision {
  const { s, st, bb, toCall } = c;
  const raw = chen(c.hole);
  const suited = suitOf(c.hole[0]) === suitOf(c.hole[1]);
  const str = raw + st.loose + (Math.random() - 0.5) * 1.5;
  const r = Math.random();

  // ערימה קצרה: הכל או כלום
  if (c.effBB <= 12) {
    if (c.raises === 0) {
      if (str >= (c.behind >= 4 ? 8 : c.behind >= 2 ? 7 : 5.5)) return { move: shove(c), hard: 0.5 };
      return { move: foldOr(c), hard: 0.2 };
    }
    if (raw >= 9 || (c.potOdds < 0.3 && raw >= 7)) return { move: shove(c), hard: 0.6 };
    return { move: foldOr(c), hard: 0.4 };
  }

  if (c.raises === 0) {
    // ביג בליינד, כולם רק השוו
    if (toCall === 0) {
      if (str >= 10 && r < 0.45 + st.aggr * 0.45) return { move: raise(c, (3.5 + c.callers) * bb), hard: 0.3 };
      return { move: { type: 'check' }, hard: 0.05 };
    }
    let thr = c.behind >= 5 ? 8.5 : c.behind >= 3 ? 7.5 : c.behind >= 2 ? 6.5 : 6;
    if (c.callers > 0) thr += 1;
    if (str >= thr) {
      if (st.aggr < 0.55 && r < 0.15) return { move: passive(c), hard: 0.2 }; // לפעמים רק משווה עם יד טובה
      const open = (c.behind <= 2 ? 2.5 : 3) * bb + c.callers * bb;
      return { move: raise(c, open), hard: Math.abs(str - thr) < 1 ? 0.5 : 0.15 };
    }
    const cheap = toCall * 2 <= bb;
    if ((c.callers > 0 && str >= thr - 2.5) || (cheap && str >= 4) || (st.aggr < 0.55 && str >= thr - 1 && r < 0.35))
      return { move: passive(c), hard: 0.35 };
    // גניבת בליינדים ממיקום מאוחר
    if (c.behind <= 2 && c.callers === 0 && str >= 3 && r < st.bluff * 1.5) return { move: raise(c, 2.5 * bb), hard: 0.4 };
    return { move: foldOr(c), hard: Math.abs(str - thr) < 1.5 ? 0.45 : 0 };
  }

  const raiseBB = s.currentBet / bb;
  if (c.raises === 1) {
    const need = 8 + (raiseBB > 8 ? 2 : raiseBB > 4 ? 1 : 0) + (c.commit > 0.3 ? 1.5 : 0) - (c.potOdds < 0.22 ? 1.5 : 0);
    if (raw >= 12 || (raw >= 11 && r < 0.4 + st.aggr * 0.4)) return { move: raise(c, s.currentBet * (3 + c.callers)), hard: 0.4 };
    if (str >= need) return { move: passive(c), hard: Math.abs(str - need) < 1 ? 0.6 : 0.3 };
    if (suited && str >= 6 && r < st.bluff * 0.7) return { move: raise(c, s.currentBet * 3), hard: 0.6 }; // ריראייז בלוף
    return { move: foldOr(c), hard: Math.abs(str - need) < 1.2 ? 0.5 : 0.1 };
  }
  if (c.raises === 2) {
    if (raw >= 16 || (raw >= 14 && r < 0.7)) return { move: raise(c, s.currentBet * 2.3), hard: 0.6 };
    if (raw >= 12 && c.commit < 0.35) return { move: passive(c), hard: 0.7 };
    if (raw >= 10 && c.commit < 0.12 && c.potOdds < 0.3) return { move: passive(c), hard: 0.7 };
    return { move: foldOr(c), hard: raw >= 10 ? 0.7 : 0.2 };
  }
  // 4-בט ומעלה
  if (raw >= 16) return { move: shove(c), hard: 0.5 };
  if (raw >= 14 && (c.commit < 0.5 || r < 0.5)) return { move: c.commit >= 0.5 ? shove(c) : passive(c), hard: 0.9 };
  if (raw >= 12 && c.commit < 0.2) return { move: passive(c), hard: 0.8 };
  return { move: foldOr(c), hard: raw >= 12 ? 0.9 : 0.3 };
}

// ---------- לפני הפלופ - אומהה ----------
function omahaPreflop(c: Ctx): Decision {
  const { s, st, toCall, bb } = c;
  const raw = omahaScore(c.hole);
  const str = raw + st.loose * 1.5 + (Math.random() - 0.5) * 2;
  const r = Math.random();
  const potRaise = () => raise(c, c.capTo * between(0.7, 1));
  if (c.raises === 0) {
    if (toCall === 0) {
      if (str >= 21 && r < 0.4 + st.aggr * 0.4) return { move: potRaise(), hard: 0.3 };
      return { move: { type: 'check' }, hard: 0.05 };
    }
    const thr = c.behind >= 5 ? 16 : c.behind >= 3 ? 14 : 12;
    if (str >= thr) {
      if (r < 0.55 + st.aggr * 0.35) return { move: potRaise(), hard: 0.3 };
      return { move: passive(c), hard: 0.25 };
    }
    if (str >= thr - 4 || (toCall * 2 <= bb && str >= 7)) return { move: passive(c), hard: 0.35 };
    return { move: foldOr(c), hard: Math.abs(str - thr) < 2 ? 0.45 : 0 };
  }
  const raiseBB = s.currentBet / bb;
  if (c.raises === 1) {
    if (raw >= 22 && r < 0.5 + st.aggr * 0.4) return { move: potRaise(), hard: 0.4 };
    const need = 14 + (raiseBB > 5 ? 1.5 : 0) + (c.commit > 0.3 ? 2 : 0) - (c.potOdds < 0.22 ? 2 : 0);
    if (str >= need) return { move: passive(c), hard: Math.abs(str - need) < 1.5 ? 0.6 : 0.3 };
    return { move: foldOr(c), hard: Math.abs(str - need) < 2 ? 0.5 : 0.1 };
  }
  if (raw >= 25) return { move: potRaise(), hard: 0.6 };
  if (raw >= 19 && c.commit < 0.35) return { move: passive(c), hard: 0.7 };
  return { move: foldOr(c), hard: raw >= 17 ? 0.7 : 0.2 };
}

// ---------- אחרי הפלופ (שני המשחקים) ----------
function postflop(c: Ctx): Decision {
  const { s, p, st, toCall, pot } = c;
  const n = c.opps.length;
  // הרבה יריבים = פחות דיוק נדרש (וחוסך זמן מחשב בשרת)
  const eq = equityVs(c.hole, s.board, c.opps.map((o) => rangeOf(s, o)), Math.round((c.omaha ? 140 : 220) * (n >= 3 ? 0.7 : 1)));
  const fair = 1 / (n + 1);
  const r = Math.random();
  const river = s.phase === 'river';
  const pre = c.log.filter((e) => e.st === 'preflop' && isRaise(e.a));
  const wasAggressor = pre.length > 0 && pre[pre.length - 1].id === p.id;

  if (toCall <= 0) {
    const strong = Math.max(0.62, fair + 0.33);
    const value = fair + 0.13 + 0.03 * (n - 1);
    if (eq >= strong) {
      if (!river && r < st.trap) return { move: { type: 'check' }, hard: 0.3 }; // מסתיר יד חזקה
      return { move: bet(c, between(0.55, 0.85)), hard: 0.25 };
    }
    if (eq >= value) {
      if (r < 0.6 + st.aggr * 0.3) return { move: bet(c, between(0.4, 0.7)), hard: 0.35 };
      return { move: { type: 'check' }, hard: 0.3 };
    }
    // המשך הימור אחרי שהעליתי לפני הפלופ
    if (wasAggressor && s.phase === 'flop' && n <= 2 && r < 0.3 + st.aggr * 0.4) return { move: bet(c, between(0.3, 0.5)), hard: 0.2 };
    // חצי בלוף עם דרו
    if (!river && eq >= 0.3 && r < st.aggr * 0.35) return { move: bet(c, between(0.45, 0.65)), hard: 0.4 };
    // בלוף בריבר מול יריב אחד
    if (river && n === 1 && eq < 0.25 && r < st.bluff) return { move: bet(c, between(0.55, 0.8)), hard: 0.6 };
    return { move: { type: 'check' }, hard: 0.1 };
  }

  const need =
    c.potOdds +
    0.02 +
    (c.commit >= 0.9 ? 0.06 : c.commit > 0.4 ? 0.04 : c.commit > 0.2 ? 0.02 : 0) -
    (s.phase === 'flop' ? 0.03 : s.phase === 'turn' ? 0.015 : 0);
  const raiseThr = Math.max(0.6, fair + 0.25);
  const hard = 1 - Math.min(1, Math.abs(eq - need) / 0.12);
  if (eq >= raiseThr && c.canRaise && c.raises < 3) {
    if (eq >= 0.85 && c.raises >= 2) return { move: shove(c), hard: 0.6 };
    if (river || r < 0.45 + st.aggr * 0.45) return { move: reraise(c, between(2.6, 3.3)), hard: 0.45 };
    return { move: passive(c), hard: 0.4 }; // מסתיר: רק משווה
  }
  if (eq >= need) return { move: passive(c), hard };
  // חצי בלוף: העלאה עם דרו מול יריב אחד
  if (!river && n === 1 && eq >= 0.3 && c.canRaise && c.raises === 1 && r < st.bluff * 0.8) return { move: reraise(c, 2.8), hard: 0.7 };
  // הימור קטן - לפעמים משווה "לראות מה קורה"
  if (toCall <= pot * 0.3 && eq >= need - 0.06 && r < 0.3) return { move: passive(c), hard: 0.6 };
  if (r < 0.015) return { move: passive(c), hard: 1 }; // "אני לא מאמין לך"
  return { move: { type: 'fold' }, hard };
}

// ---------- זמן מחשבה ----------
function thinkTime(c: Ctx, d: Decision): number {
  const { s } = c;
  const kind = d.move.type;
  const preflop = s.phase === 'preflop';
  let t =
    kind === 'fold'
      ? preflop
        ? between(600, 1400)
        : between(900, 1800)
      : kind === 'check'
        ? between(800, 1700)
        : kind === 'call'
          ? between(1000, 2300)
          : kind === 'raise'
            ? between(1300, 2800)
            : between(1800, 3600);
  t += d.hard * between(800, 3000);
  if (s.phase === 'river') t += 300;
  if (Math.random() < 0.05 && !(kind === 'fold' && preflop)) t += between(1800, 3200); // מתלבט
  t *= botSpeed(c.p.id);
  // אין בן אדם ביד - משחקים קצת יותר מהר כדי שלא יחכו סתם
  if (!s.players.some((x) => !x.isBot && x.inHand && !x.folded)) t *= 0.6;
  // הקלפים עוד עפים על השולחן: חלוקה בתחילת יד / קלפי לוח חדשים
  if (c.street.length === 0) {
    const dealt = s.players.filter((x) => x.inHand).length * c.hole.length;
    t += preflop ? 750 + dealt * (c.omaha ? 55 : 75) : 800;
  }
  return Math.round(Math.min(9000, Math.max(450, t)));
}

// ההחלטה של הבוט + כמה זמן "לחשוב" עליה
export function pokerBotPlan(f: HFull, p: HPlayer): { move: HMove; think: number } {
  const c = context(f, p);
  const d =
    c.hole.length < 2
      ? { move: foldOr(c), hard: 0 }
      : f.pub.phase === 'preflop'
        ? c.omaha
          ? omahaPreflop(c)
          : holdemPreflop(c)
        : postflop(c);
  // ולפעמים סבתא משתגעת: אול-אין לפני הפלופ, עם מה שיש לה ביד
  if (isGranny(p.id) && f.pub.phase === 'preflop' && c.canRaise && Math.random() < 0.03) return { move: shove(c), think: thinkTime(c, { move: shove(c), hard: 1 }) };
  return { move: d.move, think: thinkTime(c, d) };
}
