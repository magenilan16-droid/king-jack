// מנוע טקסס הולדם (No-Limit) מרובה משתתפים
import { type Card, newDeck, shuffle } from './cards.ts';
import { bestHand, HAND_NAMES } from './handEval.ts';
import { equity } from './equity.ts';
import { type PlayerBase, type LedgerEffect, fail, TURN_SECONDS, cashoutEffects } from './common.ts';

export interface HPlayer extends PlayerBase {
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  bet: number; // בסיבוב ההימורים הנוכחי
  total: number; // בכל היד
  acted: boolean;
  sitOut: boolean;
  leaving?: boolean;
  pending: number; // קנייה שתיכנס ביד הבאה
  shown: Card[] | null;
  lastAction: string | null; // קוד: fold / check / call:N / raise:N / allin / sb:N / bb:N / left
}

export interface HSettings {
  sb: number;
  bb: number;
  buyIn: number;
}

export interface HWinner {
  id: string;
  name: string;
  amount: number;
  cat: number; // סוג היד (0-8), -1 = כולם קיפלו
}

export type HPhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface HState {
  kind: 'holdem';
  phase: HPhase;
  players: HPlayer[];
  board: Card[];
  dealerIdx: number;
  currentBet: number;
  minRaise: number;
  turnId: string | null;
  turnDeadline: number | null;
  handNo: number;
  winners: HWinner[];
  settings: HSettings;
  hostId: string;
  log: string[];
}

export interface HSecret {
  deck: Card[];
  holes: Record<string, Card[]>;
}

export interface HFull {
  pub: HState;
  sec: HSecret;
}

export type HMove =
  | { type: 'start' }
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; to: number }
  | { type: 'allin' }
  | { type: 'next' }
  | { type: 'timeout' }
  | { type: 'sitOut'; value: boolean };

const MAX_PLAYERS = 10;

export function potSize(s: HState): number {
  return s.players.reduce((a, p) => a + p.total, 0);
}

export function canAct(p: HPlayer): boolean {
  return p.inHand && !p.folded && !p.allIn;
}

function log(s: HState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 30) s.log.splice(0, s.log.length - 30);
}

// ---------- יצירה וניהול ----------
export function createHoldem(host: PlayerBase, settings: HSettings): { full: HFull; effects: LedgerEffect[] } {
  const full: HFull = {
    pub: {
      kind: 'holdem',
      phase: 'waiting',
      players: [],
      board: [],
      dealerIdx: -1,
      currentBet: 0,
      minRaise: settings.bb,
      turnId: null,
      turnDeadline: null,
      handNo: 0,
      winners: [],
      settings,
      hostId: host.id,
      log: [],
    },
    sec: { deck: [], holes: {} },
  };
  const effects = joinHoldem(full, host, settings.buyIn);
  return { full, effects };
}

export function joinHoldem(f: HFull, p: PlayerBase, buyIn: number): LedgerEffect[] {
  const s = f.pub;
  const existing = s.players.find((x) => x.id === p.id);
  if (existing) {
    existing.leaving = false;
    existing.sitOut = false;
    return [];
  }
  if (s.players.length >= MAX_PLAYERS) fail('השולחן מלא (10 שחקנים) - פתחו שולחן נוסף');
  if (!(buyIn > 0)) fail('סכום קנייה לא תקין');
  s.players.push({
    ...p,
    chips: Math.floor(buyIn),
    inHand: false,
    folded: false,
    allIn: false,
    bet: 0,
    total: 0,
    acted: false,
    sitOut: false,
    pending: 0,
    shown: null,
    lastAction: null,
  });
  log(s, `${p.name} התיישב/ה עם ${buyIn}`);
  return [{ playerId: p.id, isBot: p.isBot, name: p.name, kind: 'buyin', amount: Math.floor(buyIn) }];
}

export function rebuyHoldem(f: HFull, playerId: string, amount: number): LedgerEffect[] {
  const s = f.pub;
  const p = s.players.find((x) => x.id === playerId) ?? fail('לא נמצא שחקן');
  amount = Math.floor(amount);
  if (!(amount > 0)) fail('סכום לא תקין');
  if (p.inHand && !p.folded && isHandRunning(s)) {
    p.pending += amount;
    log(s, `${p.name} קנה/תה ${amount} (ייכנס ביד הבאה)`);
  } else {
    p.chips += amount;
    log(s, `${p.name} קנה/תה עוד ${amount}`);
  }
  return [{ playerId: p.id, isBot: p.isBot, name: p.name, kind: 'buyin', amount }];
}

function isHandRunning(s: HState) {
  return s.phase !== 'waiting' && s.phase !== 'showdown';
}

export function leaveHoldem(f: HFull, playerId: string, now: number): LedgerEffect[] {
  const s = f.pub;
  const idx = s.players.findIndex((x) => x.id === playerId);
  if (idx < 0) return [];
  const p = s.players[idx];
  if (isHandRunning(s) && p.inHand) {
    p.leaving = true;
    if (!p.folded) {
      const wasTurn = s.turnId === p.id;
      p.folded = true;
      p.lastAction = 'left';
      if (wasTurn || s.players.filter((x) => x.inHand && !x.folded).length <= 1) {
        advance(f, now, wasTurn ? p.id : null);
      }
    }
    return [];
  }
  return removeAt(f, idx);
}

function removeAt(f: HFull, idx: number): LedgerEffect[] {
  const s = f.pub;
  const p = s.players[idx];
  s.players.splice(idx, 1);
  if (idx <= s.dealerIdx) s.dealerIdx--;
  delete f.sec.holes[p.id];
  if (s.hostId === p.id) {
    const nh = s.players.find((x) => !x.isBot);
    if (nh) s.hostId = nh.id;
  }
  log(s, `${p.name} קם/ה מהשולחן עם ${p.chips + p.pending}`);
  return cashoutEffects({ ...p, chips: p.chips + p.pending });
}

// ---------- מהלכים ----------
export function actHoldem(f: HFull, actorId: string, move: HMove, now: number): LedgerEffect[] {
  const s = f.pub;
  let effects: LedgerEffect[] = [];
  switch (move.type) {
    case 'start': {
      if (s.phase !== 'waiting') fail('יד כבר רצה');
      effects = startHand(f, now);
      break;
    }
    case 'next': {
      if (s.phase !== 'showdown') fail('היד עוד לא נגמרה');
      effects = startHand(f, now);
      break;
    }
    case 'sitOut': {
      const p = s.players.find((x) => x.id === actorId) ?? fail('לא בשולחן');
      p.sitOut = move.value;
      break;
    }
    case 'timeout': {
      if (!isHandRunning(s) || !s.turnId || !s.turnDeadline) fail('אין תור פעיל');
      if (now < s.turnDeadline) fail('הזמן עוד לא נגמר');
      const p = s.players.find((x) => x.id === s.turnId)!;
      applyBet(f, p, p.bet === s.currentBet ? { type: 'check' } : { type: 'fold' });
      if (!p.isBot) p.sitOut = true; // לא נמצא - מושב בצד
      advance(f, now, p.id);
      break;
    }
    case 'fold':
    case 'check':
    case 'call':
    case 'raise':
    case 'allin': {
      if (!isHandRunning(s)) fail('אין יד פעילה');
      if (s.turnId !== actorId) fail('זה לא התור שלך');
      const p = s.players.find((x) => x.id === actorId)!;
      applyBet(f, p, move);
      advance(f, now, p.id);
      break;
    }
    default:
      fail('מהלך לא מוכר');
  }
  return effects;
}

function applyBet(f: HFull, p: HPlayer, move: HMove) {
  const s = f.pub;
  const toCall = s.currentBet - p.bet;
  const put = (amt: number) => {
    amt = Math.min(amt, p.chips);
    p.chips -= amt;
    p.bet += amt;
    p.total += amt;
    if (p.chips === 0) p.allIn = true;
  };
  switch (move.type) {
    case 'fold':
      p.folded = true;
      p.lastAction = 'fold';
      break;
    case 'check':
      if (toCall > 0) fail('אי אפשר צ׳ק - יש הימור');
      p.lastAction = 'check';
      break;
    case 'call':
      if (toCall <= 0) fail('אין מה להשוות');
      put(toCall);
      p.lastAction = p.allIn ? 'allin' : `call:${p.bet}`;
      break;
    case 'allin':
    case 'raise': {
      const to = move.type === 'allin' ? p.bet + p.chips : Math.floor(move.to);
      const max = p.bet + p.chips;
      if (to > max) fail('אין מספיק ז׳טונים');
      if (to <= s.currentBet) {
        if (move.type === 'allin') {
          put(max - p.bet);
          p.lastAction = 'allin';
          break;
        }
        fail('ההעלאה חייבת להיות גבוהה מההימור הנוכחי');
      }
      const raiseBy = to - s.currentBet;
      if (raiseBy < s.minRaise && to < max) fail(`העלאה מינימלית ל-${s.currentBet + s.minRaise}`);
      put(to - p.bet);
      if (raiseBy >= s.minRaise) {
        s.minRaise = raiseBy;
        for (const o of s.players) if (o !== p && canAct(o)) o.acted = false;
      }
      s.currentBet = to;
      p.lastAction = p.allIn ? 'allin' : `raise:${to}`;
      break;
    }
    default:
      fail('מהלך לא מוכר');
  }
  p.acted = true;
}

function nextIdx(s: HState, from: number, pred: (p: HPlayer) => boolean): number {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (((from + i) % n) + n) % n;
    if (pred(s.players[idx])) return idx;
  }
  return -1;
}

function startHand(f: HFull, now: number): LedgerEffect[] {
  const s = f.pub;
  let effects: LedgerEffect[] = [];
  // מסירים את מי שעזב ומכניסים קניות ממתינות
  for (let i = s.players.length - 1; i >= 0; i--) {
    const p = s.players[i];
    p.chips += p.pending;
    p.pending = 0;
    if (p.leaving) effects = effects.concat(removeAt(f, i));
    else if (p.isBot && p.chips <= 0) effects = effects.concat(removeAt(f, i));
  }
  for (const p of s.players) {
    Object.assign(p, { inHand: false, folded: false, allIn: false, bet: 0, total: 0, acted: false, shown: null, lastAction: null });
  }
  s.board = [];
  s.winners = [];
  s.turnId = null;
  s.turnDeadline = null;
  f.sec.holes = {};
  const eligible = s.players.filter((p) => p.chips > 0 && !p.sitOut);
  if (eligible.length < 2) {
    s.phase = 'waiting';
    return effects;
  }
  for (const p of eligible) p.inHand = true;
  s.dealerIdx = nextIdx(s, s.dealerIdx, (p) => p.inHand);
  f.sec.deck = shuffle(newDeck());
  for (const p of eligible) f.sec.holes[p.id] = [f.sec.deck.pop()!, f.sec.deck.pop()!];
  s.handNo++;
  s.phase = 'preflop';
  const headsUp = eligible.length === 2;
  const sbIdx = headsUp ? s.dealerIdx : nextIdx(s, s.dealerIdx, (p) => p.inHand);
  const bbIdx = nextIdx(s, sbIdx, (p) => p.inHand);
  const post = (idx: number, amt: number, label: string) => {
    const p = s.players[idx];
    const a = Math.min(amt, p.chips);
    p.chips -= a;
    p.bet = a;
    p.total = a;
    if (p.chips === 0) p.allIn = true;
    p.lastAction = label;
  };
  post(sbIdx, s.settings.sb, `sb:${s.settings.sb}`);
  post(bbIdx, s.settings.bb, `bb:${s.settings.bb}`);
  s.currentBet = s.settings.bb;
  s.minRaise = s.settings.bb;
  log(s, `יד #${s.handNo} - הדילר: ${s.players[s.dealerIdx].name}`);
  // מי שמתחיל: הבא אחרי הביג בליינד
  advance(f, now, s.players[bbIdx].id);
  return effects;
}

// בודק אם סיבוב ההימורים הסתיים, ומעביר לתור / לרחוב הבא / לשואודאון
function advance(f: HFull, now: number, lastId: string | null) {
  const s = f.pub;
  for (;;) {
    const alive = s.players.filter((p) => p.inHand && !p.folded);
    if (alive.length === 1) {
      winUncontested(f, alive[0]);
      return;
    }
    const actors = s.players.filter(canAct);
    const roundDone =
      actors.length === 0 ||
      (actors.length === 1 && actors[0].bet >= s.currentBet && (actors[0].acted || alive.length > 1 && everyoneElseAllIn(s, actors[0]))) ||
      actors.every((p) => p.acted && p.bet === s.currentBet);
    if (!roundDone) {
      const fromIdx = lastId ? s.players.findIndex((p) => p.id === lastId) : s.dealerIdx;
      const idx = nextIdx(s, fromIdx, (p) => canAct(p) && (!p.acted || p.bet < s.currentBet));
      const p = s.players[idx];
      s.turnId = p.id;
      s.turnDeadline = now + TURN_SECONDS * 1000;
      if (p.isBot) {
        applyBet(f, p, botDecision(f, p));
        lastId = p.id;
        continue;
      }
      if (p.sitOut) {
        // שחקן שישב בצד - פולד/צ׳ק אוטומטי
        applyBet(f, p, p.bet === s.currentBet ? { type: 'check' } : { type: 'fold' });
        lastId = p.id;
        continue;
      }
      return;
    }
    // סיבוב נגמר - אוספים הימורים
    for (const p of s.players) {
      p.bet = 0;
      p.acted = false;
    }
    s.currentBet = 0;
    s.minRaise = s.settings.bb;
    if (s.phase === 'river') {
      showdown(f);
      return;
    }
    dealStreet(f);
    // אם רק שחקן אחד (או אף אחד) יכול לפעול - מריצים את הלוח עד הסוף
    if (s.players.filter(canAct).length <= 1) {
      while (s.board.length < 5) dealStreet(f);
      showdown(f);
      return;
    }
    lastId = null; // הראשון אחרי הדילר מתחיל
  }
}

function everyoneElseAllIn(s: HState, actor: HPlayer) {
  return s.players.every((p) => p === actor || !p.inHand || p.folded || p.allIn);
}

function dealStreet(f: HFull) {
  const s = f.pub;
  f.sec.deck.pop(); // שריפת קלף
  if (s.board.length === 0) {
    s.board.push(f.sec.deck.pop()!, f.sec.deck.pop()!, f.sec.deck.pop()!);
    s.phase = 'flop';
  } else if (s.board.length === 3) {
    s.board.push(f.sec.deck.pop()!);
    s.phase = 'turn';
  } else {
    s.board.push(f.sec.deck.pop()!);
    s.phase = 'river';
  }
  for (const p of s.players) if (canAct(p)) p.lastAction = null;
}

function winUncontested(f: HFull, w: HPlayer) {
  const s = f.pub;
  const pot = potSize(s);
  w.chips += pot;
  s.winners = [{ id: w.id, name: w.name, amount: pot, cat: -1 }];
  log(s, `${w.name} לקח/ה ${pot} 🏆`);
  endHand(s);
}

function endHand(s: HState) {
  s.phase = 'showdown';
  s.turnId = null;
  s.turnDeadline = null;
  for (const p of s.players) {
    p.bet = 0;
  }
}

function showdown(f: HFull) {
  const s = f.pub;
  const alive = s.players.filter((p) => p.inHand && !p.folded);
  const evals = new Map(alive.map((p) => [p.id, bestHand(f.sec.holes[p.id].concat(s.board))]));
  for (const p of alive) p.shown = f.sec.holes[p.id];
  // בניית פוטים (כולל פוטים צדדיים)
  const levels = [...new Set(alive.map((p) => p.total))].sort((a, b) => a - b);
  let prev = 0;
  const won = new Map<string, number>();
  const pots: { amount: number; eligible: HPlayer[] }[] = [];
  for (const L of levels) {
    let amount = 0;
    for (const p of s.players) amount += Math.min(p.total, L) - Math.min(p.total, prev);
    pots.push({ amount, eligible: alive.filter((p) => p.total >= L) });
    prev = L;
  }
  let leftover = 0;
  for (const p of s.players) leftover += Math.max(0, p.total - prev);
  if (pots.length) pots[pots.length - 1].amount += leftover;

  for (const pot of pots) {
    if (pot.amount <= 0) continue;
    const best = Math.max(...pot.eligible.map((p) => evals.get(p.id)!.score));
    // סדר לפי מיקום אחרי הדילר - מי שראשון מקבל את השארית
    const ws = pot.eligible
      .filter((p) => evals.get(p.id)!.score === best)
      .sort((a, b) => seatDist(s, a) - seatDist(s, b));
    const share = Math.floor(pot.amount / ws.length);
    let rem = pot.amount - share * ws.length;
    for (const w of ws) {
      const amt = share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      w.chips += amt;
      won.set(w.id, (won.get(w.id) || 0) + amt);
    }
  }
  s.winners = [...won.entries()].map(([id, amount]) => {
    const p = s.players.find((x) => x.id === id)!;
    return { id, name: p.name, amount, cat: evals.get(id)!.cat };
  });
  for (const w of s.winners) log(s, `${w.name} זכה/תה ב-${w.amount} עם ${HAND_NAMES[w.cat]} 🏆`);
  endHand(s);
}

function seatDist(s: HState, p: HPlayer) {
  const n = s.players.length;
  const i = s.players.indexOf(p);
  return (i - s.dealerIdx - 1 + n) % n;
}

// ---------- בוט ----------
function botDecision(f: HFull, p: HPlayer): HMove {
  const s = f.pub;
  const opps = s.players.filter((x) => x !== p && x.inHand && !x.folded).length;
  const eq = equity(f.sec.holes[p.id], s.board, opps, 250);
  const pot = potSize(s);
  const toCall = s.currentBet - p.bet;
  const r = Math.random();
  // סף "יד חזקה" יורד ככל שיש פחות יריבים
  const strong = Math.min(0.85, 1.6 / (opps + 1));
  const raiseTo = (frac: number) => {
    const size = Math.max(s.minRaise, Math.round(pot * frac));
    const to = s.currentBet + size;
    return to >= p.bet + p.chips ? ({ type: 'allin' } as HMove) : ({ type: 'raise', to } as HMove);
  };
  if (toCall <= 0) {
    if (eq > strong && r < 0.75) return raiseTo(0.6);
    if (r < 0.1) return raiseTo(0.4); // בלוף קטן
    return { type: 'check' };
  }
  const potOdds = toCall / (pot + toCall);
  if (eq > strong + 0.1 && r < 0.6) return raiseTo(0.75);
  if (eq >= potOdds + 0.03) return { type: 'call' };
  if (toCall <= s.settings.bb && r < 0.4) return { type: 'call' };
  if (r < 0.05) return { type: 'call' };
  return { type: 'fold' };
}

// מה כל שחקן מקבל באופן פרטי - הקלפים הסגורים שלו
export function holdemPrivate(f: HFull, playerId: string): { hole: Card[] } {
  return { hole: f.sec.holes[playerId] ?? [] };
}
