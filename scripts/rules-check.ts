// בדיקות חוקים ותקינות שנמצאו באודיט - כל באג שתוקן מקבל כאן בדיקה שלא יחזור
// הרצה: node scripts/rules-check.ts
import { createHoldem, joinHoldem, actHoldem, leaveHoldem, potSize, type HFull } from '../src/engine/holdem.ts';
import { createBlackjack, joinBlackjack, actBlackjack, betWindowMs, type BJFull } from '../src/engine/blackjack.ts';
import { act } from '../src/engine/room.ts';

const P = (id: string) => ({ id, name: id, avatar: '', isBot: false, chips: 0 });
let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
  if (!ok) fails++;
};
const tryAct = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

// 1. אול-אין קצר לא פותח מחדש העלאות למי שכבר פעל
{
  const { full: f } = createHoldem(P('A'), { sb: 5, bb: 10, buyIn: 1000 });
  joinHoldem(f, P('B'), 1000);
  joinHoldem(f, P('C'), 160);
  const s = f.pub;
  actHoldem(f, 'A', { type: 'start' }, 0);
  while (s.phase === 'preflop') {
    const p = s.players.find((x) => x.id === s.turnId)!;
    actHoldem(f, p.id, p.bet < s.currentBet ? { type: 'call' } : { type: 'check' }, 0);
  }
  const first = s.turnId!;
  actHoldem(f, first, { type: 'raise', to: 100 }, 0);
  const second = s.turnId!;
  const secondP = s.players.find((x) => x.id === second)!;
  if (secondP.chips > 100 && secondP.chips < 200) {
    actHoldem(f, second, { type: 'allin' }, 0); // העלאה קצרה
    const third = s.turnId!;
    if (third !== first) actHoldem(f, third, { type: 'call' }, 0);
    check('short all-in: original bettor may only call/fold', s.turnId === first && tryAct(() => actHoldem(f, first, { type: 'raise', to: 400 }, 0)) !== null);
    check('short all-in: original bettor may call', tryAct(() => actHoldem(f, first, { type: 'call' }, 0)) === null);
  } else {
    check('short all-in scenario set up', false, `second stack ${secondP.chips}`);
  }
}

// 2. העלאה בלי סכום / סכום לא מספרי - נדחית ולא מעלימה ז׳טונים
{
  const { full: f } = createHoldem(P('A'), { sb: 5, bb: 10, buyIn: 1000 });
  joinHoldem(f, P('B'), 1000);
  const s = f.pub;
  actHoldem(f, 'A', { type: 'start' }, 0);
  const before = s.players.reduce((a, p) => a + p.chips, 0) + potSize(s);
  const who = s.turnId!;
  const err1 = tryAct(() => actHoldem(f, who, { type: 'raise' } as never, 0));
  const err2 = tryAct(() => actHoldem(f, who, { type: 'raise', to: 'abc' } as never, 0));
  const after = s.players.reduce((a, p) => a + p.chips, 0) + potSize(s);
  check('raise without amount rejected', !!err1 && !!err2);
  check('chips unchanged after bad raise', before === after && Number.isFinite(after), `${before} -> ${after}`);
}

// 3. עזיבה באמצע יד כשהשחקן באול-אין - נשאר זכאי לקופה
{
  const { full: f } = createHoldem(P('A'), { sb: 5, bb: 10, buyIn: 1000 });
  joinHoldem(f, P('B'), 1000);
  joinHoldem(f, P('C'), 50);
  const s = f.pub;
  actHoldem(f, 'A', { type: 'start' }, 0);
  let guard = 0;
  while (s.turnId !== 'C' && guard++ < 5) {
    const p = s.players.find((x) => x.id === s.turnId)!;
    actHoldem(f, p.id, p.bet < s.currentBet ? { type: 'call' } : { type: 'check' }, 0);
  }
  actHoldem(f, 'C', { type: 'allin' }, 0);
  leaveHoldem(f as HFull, 'C', 0);
  const c = s.players.find((x) => x.id === 'C')!;
  check('all-in player who leaves is not folded', !!c && !c.folded && c.leaving === true);
}

// 4. הימור בלאק ג׳ק לא מספרי נדחה
{
  const { full: f } = createBlackjack(P('A'), { minBet: 10, maxBet: 100, buyIn: 500, dealerMode: 'house' });
  const err = tryAct(() => actBlackjack(f, 'A', { type: 'bet', amount: 'x' } as never, 0));
  check('blackjack NaN bet rejected', !!err && f.pub.players[0].bet !== null && Number.isFinite(f.pub.players[0].bet));
}

// 5. שחקן שלא מהמר לא תוקע את השולחן: אחרי הדדליין כל אחד יכול לחלק
{
  const { full: f } = createBlackjack(P('A'), { minBet: 10, maxBet: 100, buyIn: 500, dealerMode: 'house' });
  joinBlackjack(f as BJFull, P('B'), 500);
  joinBlackjack(f as BJFull, P('C'), 500);
  actBlackjack(f, 'B', { type: 'bet', amount: 20 }, 1000);
  const dl = f.pub.betDeadline!;
  check('bet starts a deadline', dl === 1000 + betWindowMs(f.pub));
  check('non-host cannot deal before deadline', tryAct(() => actBlackjack(f, 'B', { type: 'deal' }, dl - 1)) !== null);
  check('non-host can deal after deadline', tryAct(() => actBlackjack(f, 'B', { type: 'deal' }, dl + 1)) === null && f.pub.phase !== 'betting');
  const c = f.pub.players.find((p) => p.id === 'C')!;
  check('player who did not bet gets a strike', (c.strikes ?? 0) === 1);
}

// 6. אי אפשר לדלג על מסך התוצאה מיד, ורק מי שיושב יכול
{
  const { full: f } = createBlackjack(P('A'), { minBet: 10, maxBet: 100, buyIn: 500, dealerMode: 'house' });
  const full = f as unknown as Parameters<typeof act>[0];
  act(full, 'A', { type: 'bet', amount: 20 } as never, 0);
  let g = 0;
  while (f.pub.phase === 'playing' && g++ < 10) act(full, 'A', { type: 'stand' } as never, 10);
  check('round reached results', f.pub.phase === 'results');
  check('next too early is rejected', tryAct(() => act(full, 'A', { type: 'next' } as never, 100)) !== null);
  check('spectator cannot press next', tryAct(() => act(full, 'ZZ', { type: 'next' } as never, 10000)) !== null);
  check('seated player can press next after the pause', tryAct(() => act(full, 'A', { type: 'next' } as never, 10000)) === null);
}

// 7. צ׳אט מוגבל בקצב
{
  const { full: f } = createBlackjack(P('A'), { minBet: 10, maxBet: 100, buyIn: 500, dealerMode: 'house' });
  const full = f as unknown as Parameters<typeof act>[0];
  act(full, 'A', { type: 'chat', text: 'hi' } as never, 0);
  check('chat flood rejected', tryAct(() => act(full, 'A', { type: 'chat', text: 'hi again' } as never, 300)) !== null);
  check('chat after a pause ok', tryAct(() => act(full, 'A', { type: 'chat', text: 'ok now' } as never, 2000)) === null);
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
