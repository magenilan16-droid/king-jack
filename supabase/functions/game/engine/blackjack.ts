// מנוע בלאק ג'ק מרובה משתתפים
import { type Card, newDeck, shuffle, rankOf } from './cards.ts';
import {
  type PlayerBase,
  type LedgerEffect,
  fail,
  TURN_SECONDS,
  cashoutEffects,
  round2,
} from './common.ts';
import { basicStrategy } from './strategy.ts';

export type BJResult = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  fromSplit: boolean;
  result?: BJResult;
  payout?: number;
}

export interface BJPlayer extends PlayerBase {
  bet: number; // ההימור שהוגדר לסיבוב הבא
  ready: boolean;
  hands: BJHand[];
  leaving?: boolean;
}

export interface BJSettings {
  minBet: number;
  maxBet: number;
  buyIn: number;
  dealerMode: 'house' | 'player';
}

export interface BJState {
  kind: 'blackjack';
  phase: 'betting' | 'playing' | 'results';
  players: BJPlayer[];
  dealer: { cards: Card[]; hidden: boolean };
  bankerId: string | null; // null = הבית (המחשב) הוא הדילר
  turn: { p: number; h: number } | null;
  turnDeadline: number | null;
  round: number;
  settings: BJSettings;
  hostId: string;
  houseNet: number;
  log: string[];
}

export interface BJSecret {
  shoe: Card[];
  hole: Card | null;
}

export interface BJFull {
  pub: BJState;
  sec: BJSecret;
}

export type BJMove =
  | { type: 'bet'; amount: number }
  | { type: 'deal' }
  | { type: 'hit' }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' }
  | { type: 'next' }
  | { type: 'timeout' }
  | { type: 'setBanker'; playerId: string | null };

const MAX_PLAYERS = 10;

// ---------- עזרים ----------
export function cardValue(c: Card): number {
  const r = rankOf(c);
  if (r === 14) return 11;
  return Math.min(r, 10);
}

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (rankOf(c) === 14) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export function isNatural(h: BJHand): boolean {
  return !h.fromSplit && h.cards.length === 2 && handValue(h.cards).total === 21;
}

export function canSplit(p: BJPlayer, h: BJHand): boolean {
  return (
    h.cards.length === 2 &&
    cardValue(h.cards[0]) === cardValue(h.cards[1]) &&
    p.hands.length < 4 &&
    p.chips >= h.bet
  );
}

export function canDouble(p: BJPlayer, h: BJHand): boolean {
  return h.cards.length === 2 && !h.doubled && p.chips >= h.bet;
}

function log(s: BJState, msg: string) {
  s.log.push(msg);
  if (s.log.length > 30) s.log.splice(0, s.log.length - 30);
}

function draw(f: BJFull): Card {
  if (f.sec.shoe.length === 0) f.sec.shoe = shuffle(newDeck(6));
  return f.sec.shoe.pop()!;
}

// ---------- יצירה וניהול שחקנים ----------
export function createBlackjack(host: PlayerBase, settings: BJSettings): { full: BJFull; effects: LedgerEffect[] } {
  const full: BJFull = {
    pub: {
      kind: 'blackjack',
      phase: 'betting',
      players: [],
      dealer: { cards: [], hidden: false },
      bankerId: null,
      turn: null,
      turnDeadline: null,
      round: 0,
      settings,
      hostId: host.id,
      houseNet: 0,
      log: [],
    },
    sec: { shoe: shuffle(newDeck(6)), hole: null },
  };
  const effects = joinBlackjack(full, host, settings.buyIn);
  return { full, effects };
}

export function joinBlackjack(f: BJFull, p: PlayerBase, buyIn: number): LedgerEffect[] {
  const s = f.pub;
  if (s.players.find((x) => x.id === p.id)) {
    const existing = s.players.find((x) => x.id === p.id)!;
    existing.leaving = false;
    return [];
  }
  if (s.players.length >= MAX_PLAYERS + 1) fail("השולחן מלא (10 שחקנים) - פתחו שולחן נוסף");
  if (!(buyIn > 0)) fail('סכום קנייה לא תקין');
  s.players.push({ ...p, chips: buyIn, bet: s.settings.minBet, ready: false, hands: [] });
  log(s, `${p.name} הצטרף/ה עם ${buyIn}`);
  return [{ playerId: p.id, isBot: p.isBot, name: p.name, kind: 'buyin', amount: buyIn }];
}

export function rebuyBlackjack(f: BJFull, playerId: string, amount: number): LedgerEffect[] {
  const p = f.pub.players.find((x) => x.id === playerId) ?? fail('לא נמצא שחקן');
  if (!(amount > 0)) fail('סכום לא תקין');
  p.chips = round2(p.chips + amount);
  log(f.pub, `${p.name} קנה/תה עוד ${amount}`);
  return [{ playerId: p.id, isBot: p.isBot, name: p.name, kind: 'buyin', amount }];
}

function hasActiveHands(p: BJPlayer) {
  return p.hands.length > 0;
}

export function leaveBlackjack(f: BJFull, playerId: string): LedgerEffect[] {
  const s = f.pub;
  const idx = s.players.findIndex((x) => x.id === playerId);
  if (idx < 0) return [];
  const p = s.players[idx];
  const bankerBusy = s.bankerId === p.id && s.phase === 'playing';
  if ((s.phase === 'playing' && hasActiveHands(p)) || bankerBusy) {
    p.leaving = true;
    return [];
  }
  return removePlayer(f, idx);
}

function removePlayer(f: BJFull, idx: number): LedgerEffect[] {
  const s = f.pub;
  const p = s.players[idx];
  const turnId = s.turn ? s.players[s.turn.p].id : null;
  s.players.splice(idx, 1);
  if (turnId) s.turn!.p = s.players.findIndex((x) => x.id === turnId);
  if (s.bankerId === p.id) {
    s.bankerId = null;
    log(s, 'הבית חוזר להיות הדילר');
  }
  if (s.hostId === p.id) {
    const nextHost = s.players.find((x) => !x.isBot);
    if (nextHost) s.hostId = nextHost.id;
  }
  log(s, `${p.name} יצא/ה עם ${p.chips}`);
  return cashoutEffects(p);
}

// ---------- מהלכים ----------
export function actBlackjack(f: BJFull, actorId: string, move: BJMove, now: number): LedgerEffect[] {
  const s = f.pub;
  const me = s.players.find((x) => x.id === actorId);
  let effects: LedgerEffect[] = [];
  switch (move.type) {
    case 'bet': {
      if (s.phase !== 'betting') fail('אי אפשר להמר עכשיו');
      if (!me) fail('אתה לא בשולחן');
      if (s.bankerId === me.id) fail('הבנק לא מהמר');
      const amt = Math.floor(move.amount);
      if (amt < s.settings.minBet || amt > s.settings.maxBet)
        fail(`הימור בין ${s.settings.minBet} ל-${s.settings.maxBet}`);
      if (amt > me.chips) fail('אין מספיק ז׳טונים');
      me.bet = amt;
      me.ready = true;
      if (allHumansReady(s)) deal(f, now);
      break;
    }
    case 'deal': {
      if (s.phase !== 'betting') fail('כבר מחלקים');
      if (actorId !== s.hostId) fail('רק המארח יכול לחלק');
      deal(f, now);
      break;
    }
    case 'hit':
    case 'stand':
    case 'double':
    case 'split': {
      if (s.phase !== 'playing' || !s.turn) fail('זה לא הזמן');
      if (s.players[s.turn.p].id !== actorId) fail('זה לא התור שלך');
      playMove(f, move.type);
      advance(f, now);
      break;
    }
    case 'timeout': {
      if (s.phase !== 'playing' || !s.turn || !s.turnDeadline) fail('אין תור פעיל');
      if (now < s.turnDeadline) fail('הזמן עוד לא נגמר');
      log(s, `${s.players[s.turn.p].name} - נגמר הזמן, עומד`);
      playMove(f, 'stand');
      advance(f, now);
      break;
    }
    case 'next': {
      if (s.phase !== 'results') fail('הסיבוב עוד לא נגמר');
      effects = startBetting(f);
      break;
    }
    case 'setBanker': {
      if (actorId !== s.hostId) fail('רק המארח');
      if (s.phase === 'playing') fail('חכו לסוף הסיבוב');
      if (s.settings.dealerMode !== 'player' && move.playerId) fail('בשולחן הזה המחשב הוא הדילר');
      if (move.playerId) {
        const b = s.players.find((x) => x.id === move.playerId) ?? fail('לא נמצא');
        if (b.isBot) fail('בוט לא יכול להיות בנק');
        b.ready = false;
        log(s, `${b.name} הוא/היא הבנק עכשיו 🏦`);
      } else log(s, 'הבית הוא הדילר');
      s.bankerId = move.playerId;
      break;
    }
    default:
      fail('מהלך לא מוכר');
  }
  return effects;
}

function bettors(s: BJState) {
  return s.players.filter((p) => p.id !== s.bankerId && !p.leaving);
}

function allHumansReady(s: BJState): boolean {
  const humans = bettors(s).filter((p) => !p.isBot && p.chips >= s.settings.minBet);
  return humans.length > 0 && humans.every((p) => p.ready);
}

function startBetting(f: BJFull): LedgerEffect[] {
  const s = f.pub;
  let effects: LedgerEffect[] = [];
  for (let i = s.players.length - 1; i >= 0; i--) {
    const p = s.players[i];
    if (p.leaving || (p.isBot && p.chips < s.settings.minBet)) effects = effects.concat(removePlayer(f, i));
  }
  s.phase = 'betting';
  s.turn = null;
  s.turnDeadline = null;
  s.dealer = { cards: [], hidden: false };
  for (const p of s.players) {
    p.hands = [];
    p.ready = false;
    if (p.bet > p.chips) p.bet = Math.max(s.settings.minBet, Math.floor(p.chips));
  }
  return effects;
}

function deal(f: BJFull, now: number) {
  const s = f.pub;
  if (f.sec.shoe.length < 80) {
    f.sec.shoe = shuffle(newDeck(6));
    log(s, '🔀 ערבוב חפיסות חדש');
  }
  // בוטים בוחרים הימור
  for (const p of bettors(s)) {
    if (p.isBot) {
      const want = s.settings.minBet * (1 + Math.floor(Math.random() * 3));
      p.bet = Math.min(want, s.settings.maxBet, Math.floor(p.chips));
      p.ready = p.bet >= s.settings.minBet;
    }
  }
  const players = bettors(s).filter((p) => p.ready && p.bet >= s.settings.minBet && p.bet <= p.chips);
  if (players.length === 0) fail('אף אחד לא הימר');
  for (const p of s.players) p.hands = [];
  for (const p of players) {
    p.chips = round2(p.chips - p.bet);
    p.hands = [{ cards: [], bet: p.bet, doubled: false, done: false, fromSplit: false }];
  }
  for (let r = 0; r < 2; r++) {
    for (const p of players) p.hands[0].cards.push(draw(f));
    if (r === 0) s.dealer.cards = [draw(f)];
    else f.sec.hole = draw(f);
  }
  s.dealer.hidden = true;
  s.round++;
  s.phase = 'playing';
  const up = s.dealer.cards[0];
  // הדילר מציץ אם יש לו בלאק ג'ק
  if (cardValue(up) >= 10 && handValue([up, f.sec.hole!]).total === 21) {
    log(s, 'לדילר יש בלאק ג׳ק! 😱');
    for (const p of players) p.hands[0].done = true;
    finishRound(f);
    return;
  }
  for (const p of players) if (handValue(p.hands[0].cards).total === 21) p.hands[0].done = true;
  s.turn = { p: -1, h: 0 };
  advance(f, now);
}

function playMove(f: BJFull, type: 'hit' | 'stand' | 'double' | 'split') {
  const s = f.pub;
  const p = s.players[s.turn!.p];
  const h = p.hands[s.turn!.h];
  if (type === 'hit') {
    h.cards.push(draw(f));
    const t = handValue(h.cards).total;
    if (t >= 21) h.done = true;
  } else if (type === 'stand') {
    h.done = true;
  } else if (type === 'double') {
    if (!canDouble(p, h)) fail('אי אפשר להכפיל');
    p.chips = round2(p.chips - h.bet);
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(f));
    h.done = true;
    log(s, `${p.name} הכפיל/ה`);
  } else if (type === 'split') {
    if (!canSplit(p, h)) fail('אי אפשר לפצל');
    p.chips = round2(p.chips - h.bet);
    const aces = rankOf(h.cards[0]) === 14;
    const h2: BJHand = { cards: [h.cards[1], draw(f)], bet: h.bet, doubled: false, done: aces, fromSplit: true };
    h.cards = [h.cards[0], draw(f)];
    h.fromSplit = true;
    h.done = aces;
    p.hands.splice(s.turn!.h + 1, 0, h2);
    for (const hh of [h, h2]) if (handValue(hh.cards).total === 21) hh.done = true;
    log(s, `${p.name} פיצל/ה`);
  }
}

// מעבר לתור הבא + הפעלת בוטים
function advance(f: BJFull, now: number) {
  const s = f.pub;
  for (;;) {
    const next = findNextTurn(s);
    if (!next) {
      finishRound(f);
      return;
    }
    s.turn = next;
    const p = s.players[next.p];
    if (p.isBot || p.leaving) {
      const h = p.hands[next.h];
      const mv = p.leaving ? 'stand' : basicStrategy(h.cards, s.dealer.cards[0], canDouble(p, h), canSplit(p, h));
      playMove(f, mv);
      continue;
    }
    s.turnDeadline = now + TURN_SECONDS * 1000;
    return;
  }
}

function findNextTurn(s: BJState): { p: number; h: number } | null {
  for (let pi = 0; pi < s.players.length; pi++) {
    const p = s.players[pi];
    for (let hi = 0; hi < p.hands.length; hi++) if (!p.hands[hi].done) return { p: pi, h: hi };
  }
  return null;
}

function finishRound(f: BJFull) {
  const s = f.pub;
  s.turn = null;
  s.turnDeadline = null;
  s.dealer.cards.push(f.sec.hole!);
  f.sec.hole = null;
  s.dealer.hidden = false;
  const allHands = s.players.flatMap((p) => p.hands);
  const needDealer = allHands.some((h) => handValue(h.cards).total <= 21 && !isNatural(h));
  const dealerNatural = handValue(s.dealer.cards).total === 21 && s.dealer.cards.length === 2;
  if (needDealer && !dealerNatural) {
    while (handValue(s.dealer.cards).total < 17) s.dealer.cards.push(draw(f));
  }
  const d = handValue(s.dealer.cards).total;
  let bankDelta = 0;
  for (const p of s.players) {
    for (const h of p.hands) {
      const t = handValue(h.cards).total;
      let payout = 0;
      let res: BJResult;
      if (t > 21) res = 'bust';
      else if (dealerNatural) res = isNatural(h) ? 'push' : 'lose';
      else if (isNatural(h)) res = 'blackjack';
      else if (d > 21 || t > d) res = 'win';
      else if (t === d) res = 'push';
      else res = 'lose';
      if (res === 'blackjack') payout = h.bet * 2.5;
      else if (res === 'win') payout = h.bet * 2;
      else if (res === 'push') payout = h.bet;
      payout = round2(payout);
      h.result = res;
      h.payout = payout;
      h.done = true;
      p.chips = round2(p.chips + payout);
      bankDelta += h.bet - payout;
    }
  }
  bankDelta = round2(bankDelta);
  const banker = s.players.find((p) => p.id === s.bankerId);
  if (banker) banker.chips = round2(banker.chips + bankDelta);
  else s.houseNet = round2(s.houseNet + bankDelta);
  log(s, `סיבוב ${s.round}: דילר ${d > 21 ? 'נשרף 💥' : d}`);
  s.phase = 'results';
}

// מה הלקוח רואה - הכל ציבורי חוץ מהקלף הסגור והחפיסה
export function blackjackPrivate(): Record<string, unknown> {
  return {};
}
