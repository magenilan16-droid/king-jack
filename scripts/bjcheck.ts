// בדיקת שימור ז׳טונים בבלאק ג׳ק
import { createGame, act, joinGame } from '../src/engine/room.ts';
import type { BJFull } from '../src/engine/blackjack.ts';

const human = (id: string) => ({ id, name: id, avatar: 'x', isBot: false, chips: 0 });
for (const mode of ['house', 'player'] as const) {
  const { full } = createGame('blackjack', human('h1'), { minBet: 10, maxBet: 200, buyIn: 1000, dealerMode: mode });
  const f = full as BJFull;
  let bought = 1000;
  joinGame(f, human('h2'), 1000);
  joinGame(f, human('h3'), 1000);
  bought += 2000;
  bought += act(f, 'h1', { type: 'addBot' }, 0).effects.reduce((a, e) => a + e.amount, 0);
  if (mode === 'player') act(f, 'h1', { type: 'setBanker', playerId: 'h3' }, 0);
  for (let r = 0; r < 2000; r++) {
    for (const p of f.pub.players.filter((x) => !x.isBot && x.id !== f.pub.bankerId))
      if (p.chips < 10) bought += act(f, p.id, { type: 'rebuy', amount: 1000 }, 0).effects.reduce((a, e) => a + e.amount, 0);
    if (f.pub.phase === 'betting')
      for (const p of f.pub.players.filter((x) => !x.isBot && x.id !== f.pub.bankerId))
        if (f.pub.phase === 'betting')
          act(f, p.id, { type: 'bet', amount: Math.min(Math.floor(p.chips), 10 + Math.floor(Math.random() * 50)) }, 0);
    let g = 0;
    while (f.pub.phase === 'playing') {
      if (g++ > 200) {
        console.log(JSON.stringify(f.pub.turn), JSON.stringify(f.pub.players.map((p) => p.hands)));
        throw new Error('loop');
      }
      const p = f.pub.players[f.pub.turn!.p];
      const mv = (['hit', 'stand', 'double', 'split'] as const)[Math.floor(Math.random() * 4)];
      try {
        act(f, p.id, { type: mv }, 0);
      } catch {
        act(f, p.id, { type: 'stand' }, 0);
      }
    }
    const sum = f.pub.players.reduce((a, p) => a + p.chips, 0) + f.pub.houseNet;
    if (Math.abs(sum - bought) > 0.01) throw new Error(`mismatch ${mode} r${r}: ${sum} vs ${bought}`);
    if (f.pub.phase !== 'results') throw new Error('phase ' + f.pub.phase);
    act(f, 'h1', { type: 'next' }, 0);
  }
  console.log(mode, 'conserved OK, bot chips:', f.pub.players.find((p) => p.isBot)?.chips);
}
