// סימולציה: מריץ הרבה ידיים ובודק שאין ז׳טונים שנעלמים
import { createGame, act, joinGame, type Full } from '../src/engine/room.ts';
import type { HFull } from '../src/engine/holdem.ts';
import type { BJFull } from '../src/engine/blackjack.ts';
import { settle } from '../src/engine/settle.ts';
import { bestHand } from '../src/engine/handEval.ts';

let now = 0;
const human = (id: string) => ({ id, name: id, avatar: 'x', isBot: false, chips: 0 });

// בדיקות דירוג ידיים
const t = (cards: string, name: string) => {
  const r = bestHand(cards.split(' '));
  if (r.name !== name) throw new Error(`eval ${cards}: ${r.name} != ${name}`);
};
t('As Ks Qs Js Ts 2d 3c', 'רצף צבע');
t('Ah 2d 3c 4s 5h Kd Kc', 'רצף');
t('Ah Ad Ac Kd Kc 2s 3s', 'פול האוס');
t('2h 2d 3c 3s 4h 4d Ac', 'שני זוגות');
if (bestHand('Ah Kd 3c 4s 5h 9d 2c'.split(' ')).score <= bestHand('Kh Qd Jc 9s 8h 7d 2c'.split(' ')).score)
  throw new Error('wheel vs high');

// ---- הולדם ----
{
  const { full, effects } = createGame('holdem', human('h1'), { sb: 5, bb: 10, buyIn: 1000 });
  const f = full as HFull;
  let bought = effects.reduce((a, e) => a + e.amount, 0);
  let cashed = 0;
  let sidePots = 0;
  bought += joinGame(f, human('h2'), 1000).reduce((a, e) => a + e.amount, 0);
  for (let i = 0; i < 4; i++) bought += act(f, 'h1', { type: 'addBot' }, now).effects.reduce((a, e) => a + e.amount, 0);
  act(f, 'h1', { type: 'start' }, now);
  for (let hand = 0; hand < 150; hand++) {
    let guard = 0;
    while (f.pub.phase !== 'showdown' && f.pub.phase !== 'waiting') {
      if (guard++ > 200) throw new Error('loop');
      const id = f.pub.turnId!;
      const p = f.pub.players.find((x) => x.id === id)!;
      const r = Math.random();
      const toCall = f.pub.currentBet - p.bet;
      const mv =
        r < 0.15 ? { type: 'fold' as const } : r < 0.25 ? { type: 'allin' as const } :
        r < 0.4 && p.chips > toCall + f.pub.minRaise ? { type: 'raise' as const, to: f.pub.currentBet + f.pub.minRaise } :
        toCall > 0 ? { type: 'call' as const } : { type: 'check' as const };
      act(f, id, mv, now);
    }
    // היסטוריה ופוטים: סכום הקופות = הקופה, ורווח השחקנים ביד מתאפס
    const lh = f.pub.lastHand;
    if (!lh || lh.no !== f.pub.handNo) throw new Error('missing hand record ' + f.pub.handNo);
    const potsSum = lh.pots.reduce((a, p) => a + p.amount, 0);
    if (potsSum !== lh.pot) throw new Error('pots mismatch ' + potsSum + ' vs ' + lh.pot);
    const netSum = lh.players.reduce((a, p) => a + p.net, 0);
    if (netSum !== 0) throw new Error('hand net not zero: ' + netSum + ' hand ' + lh.no);
    if (lh.pots.length > 1) sidePots++;
    // שימור ז׳טונים
    const onTable = f.pub.players.reduce((a, p) => a + p.chips + p.pending, 0);
    if (onTable + cashed !== bought) throw new Error(`holdem chips mismatch hand ${hand}: ${onTable + cashed} vs ${bought}`);
    for (const p of f.pub.players) if (p.chips < 0) throw new Error('negative');
    for (const p of f.pub.players.filter((x) => !x.isBot && x.chips === 0)) {
      bought += act(f, p.id, { type: 'rebuy', amount: 500 }, now).effects.reduce((a, e) => a + e.amount, 0);
    }
    if (f.pub.players.filter((x) => x.isBot).length < 2) bought += act(f, 'h1', { type: 'addBot' }, now).effects.reduce((a, e) => a + e.amount, 0);
    const before = f.pub.players.length;
    now += 5000; // מסך התוצאה מוצג לפחות 3 שניות
    const res = act(f, 'h1', f.pub.phase === 'waiting' ? { type: 'start' } : { type: 'next' }, now);
    cashed += res.effects.filter((e) => e.kind === 'cashout').reduce((a, e) => a + e.amount, 0);
    bought += res.effects.filter((e) => e.kind === 'buyin').reduce((a, e) => a + e.amount, 0);
    void before;
  }
  console.log('holdem OK, hands:', f.pub.handNo, 'hands with side pots:', sidePots);
}

// ---- בלאק ג׳ק ----
for (const mode of ['house', 'player'] as const) {
  const { full } = createGame('blackjack', human('h1'), { minBet: 10, maxBet: 200, buyIn: 1000, dealerMode: mode });
  const f = full as BJFull;
  joinGame(f, human('h2'), 1000);
  joinGame(f, human('h3'), 1000);
  act(f, 'h1', { type: 'addBot' }, now);
  if (mode === 'player') act(f, 'h1', { type: 'setBanker', playerId: 'h3' }, now);
  const total0 = 4000;
  for (let r = 0; r < 3000; r++) {
    for (const p of f.pub.players.filter((x) => !x.isBot && x.id !== f.pub.bankerId)) {
      if (p.chips < 10) act(f, p.id, { type: 'rebuy', amount: 0.0001 + 999.9999 }, now);
    }
    for (const p of f.pub.players.filter((x) => !x.isBot && x.id !== f.pub.bankerId))
      if (f.pub.phase === 'betting') act(f, p.id, { type: 'bet', amount: Math.min(Math.floor(p.chips), 10 + Math.floor(Math.random() * 50)) }, now);
    let guard = 0;
    while (f.pub.phase === 'playing') {
      if (guard++ > 100) throw new Error('bj loop');
      const p = f.pub.players[f.pub.turn!.p];
      const opts = ['hit', 'stand', 'double', 'split'] as const;
      const mv = opts[Math.floor(Math.random() * 4)];
      try {
        act(f, p.id, { type: mv }, now);
      } catch {
        act(f, p.id, { type: 'stand' }, now);
      }
    }
    now += 5000;
    act(f, 'h1', { type: 'next' }, now);
  }
  const res = act(f, 'h1', { type: 'close' }, now);
  const nets = new Map<string, number>();
  // נטו = יציאה - קנייה (כולל קניות חוזרות)
  void total0;
  for (const e of res.effects) nets.set(e.playerId, (nets.get(e.playerId) || 0) + (e.kind === 'cashout' ? e.amount : -e.amount));
  console.log('blackjack', mode, 'OK. houseNet:', f.pub.houseNet, 'cashouts:', res.effects.length);
}

console.log(settle([
  { id: 'a', name: 'A', net: 120 },
  { id: 'b', name: 'B', net: -70 },
  { id: 'c', name: 'C', net: -80 },
  { id: 'd', name: 'D', net: 30 },
]));
now++;

// ---- בליינדים עולים ----
{
  const { full } = createGame('holdem', human('b1'), { sb: 1, bb: 2, buyIn: 500, blindUpMinutes: 10 } as never);
  const f = full as HFull;
  joinGame(f, human('b2'));
  let t = 1_000_000;
  act(f, 'b1', { type: 'start' }, t);
  const seen: string[] = [];
  for (let k = 0; k < 6; k++) {
    // משחקים יד עד הסוף בפולד, ומתקדמים 10 דקות
    while (f.pub.phase !== 'showdown') act(f, f.pub.turnId!, { type: 'fold' }, t);
    seen.push(`${f.pub.settings.sb}/${f.pub.settings.bb}`);
    t += 10 * 60000;
    act(f, 'b1', { type: 'next' }, t);
  }
  console.log('blind levels:', seen.join(' -> '));
  // קנייה חוזרת אסורה כשיש ז׳טונים
  try { act(f, 'b1', { type: 'rebuy', amount: 99999 }, t); console.log('ERROR: rebuy allowed with chips'); } catch { console.log('rebuy blocked while holding chips ✔'); }
}
