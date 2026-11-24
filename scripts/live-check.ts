// בדיקה חיה של השרת: התראת בדיקה, פתיחת שולחן אימון, משחק קצר מול בוט ומחיקת השולחן
// הרצה: QA_PW_A=... node scripts/live-check.ts
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '../src/lib/sha256.ts';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const login = await sb.auth.signInWithPassword({
  email: `u${sha256Hex('qa tester1').slice(0, 24)}@players.vaad.game`,
  password: `vaad::${process.env.QA_PW_A}`,
});
if (login.error) throw login.error;

async function call(body: Record<string, unknown>) {
  const { data, error } = await sb.functions.invoke('game', { body, region: 'ap-northeast-1' } as never);
  if (error) {
    const ctx = (error as { context?: Response }).context;
    throw new Error(`${body.op}: ${ctx ? await ctx.text() : error.message}`);
  }
  return data as Record<string, unknown>;
}
let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!ok) fails++;
};

const t = await call({ op: 'testPush' });
check('testPush answers', t.ok === true, `sent=${t.sent}`);

for (const gameType of ['holdem', 'blackjack'] as const) {
  const settings = gameType === 'holdem' ? { bb: 2, buyIn: 200 } : { minBet: 10, maxBet: 200, buyIn: 200 };
  const c = await call({ op: 'create', gameType, name: `QA live ${gameType}`, moneyMode: 'demo', settings });
  const roomId = c.roomId as string;
  check(`${gameType}: create`, !!roomId);
  await call({ op: 'act', roomId, move: { type: 'addBot' } });
  if (gameType === 'holdem') {
    await call({ op: 'act', roomId, move: { type: 'start' } });
    // העלאה בלי סכום חייבת להידחות בשרת (ולא להעלים ז׳טונים)
    let rejected = false;
    try {
      await call({ op: 'act', roomId, move: { type: 'raise' } });
    } catch {
      rejected = true;
    }
    check('holdem: raise without amount rejected by server', rejected);
  } else {
    await call({ op: 'act', roomId, move: { type: 'bet', amount: 20 } });
  }
  const { data: room } = await sb.from('game_rooms').select('state').eq('id', roomId).single();
  const st = room!.state as { phase: string; players: unknown[] };
  check(`${gameType}: hand started`, st.phase !== 'waiting' && st.phase !== 'betting', `phase=${st.phase} players=${st.players.length}`);

  // הבוט "חושב" ואז משחק לבד - השרת מפעיל אותו (בלי שאף טלפון יבקש)
  {
    type S = { phase: string; turnId?: string | null; turn?: { p: number } | null; players: { id: string }[]; handLog?: unknown[]; round?: number };
    const load = async () => (await sb.from('game_rooms').select('state').eq('id', roomId).single()).data!.state as S;
    const myId = login.data.user!.id;
    const turnOf = (x: S) => (gameType === 'holdem' ? x.turnId : x.phase === 'playing' && x.turn ? x.players[x.turn.p]?.id : null);
    let cur = await load();
    if (turnOf(cur) === myId) {
      await call({ op: 'act', roomId, move: gameType === 'holdem' ? { type: 'call' } : { type: 'stand' } }).catch(() => {});
      cur = await load();
    }
    const botTurn = turnOf(cur)?.startsWith('bot-');
    const sig = (x: S) => JSON.stringify([x.phase, turnOf(x), x.handLog?.length ?? 0]);
    const start = Date.now();
    const before = sig(cur);
    let moved = false;
    while (botTurn && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 250));
      if (sig(await load()) !== before) {
        moved = true;
        break;
      }
    }
    const ms = Date.now() - start;
    if (botTurn) check(`${gameType}: bot thinks, then plays by itself`, moved && ms >= 400, `after ${ms}ms`);
    else check(`${gameType}: (no bot turn to watch)`, true, `phase=${cur.phase}`);
  }
  const rm = await call({ op: 'removeRoom', roomId });
  check(`${gameType}: removeRoom deletes practice table`, rm.deleted === true);
  const { data: gone } = await sb.from('game_rooms').select('id').eq('id', roomId).maybeSingle();
  check(`${gameType}: row is gone`, !gone);
}

// אומהה: השרת שומר את סוג המשחק, מחלק 4 קלפים, ולא נותן להעלות מעל גודל הקופה
{
  const c = await call({ op: 'create', gameType: 'holdem', name: 'QA live omaha', moneyMode: 'demo', settings: { bb: 2, buyIn: 200, variant: 'omaha' } });
  const roomId = c.roomId as string;
  await call({ op: 'act', roomId, move: { type: 'addBot' } });
  await call({ op: 'act', roomId, move: { type: 'start' } });
  const { data: room } = await sb.from('game_rooms').select('state').eq('id', roomId).single();
  const st = room!.state as { phase: string; turnId: string; settings: { variant?: string } };
  check('omaha: server keeps the variant', st.settings.variant === 'omaha');
  const { data: priv } = await sb.from('game_private').select('data').eq('room_id', roomId).maybeSingle();
  const hole = (priv?.data as { hole?: string[] } | undefined)?.hole ?? [];
  check('omaha: I get 4 hole cards', hole.length === 4, hole.length + ' cards');
  if (st.turnId === login.data.user!.id) {
    let rejected = false;
    try {
      await call({ op: 'act', roomId, move: { type: 'allin' } }); // 200 ז׳טונים, הקופה קטנה בהרבה
    } catch (e) {
      rejected = /אומהה|קופה/.test((e as Error).message);
    }
    check('omaha: all-in over the pot is rejected by server', rejected);
  } else check('omaha: (bot acted first, pot-limit check skipped)', true);
  const rm = await call({ op: 'removeRoom', roomId });
  check('omaha: removeRoom deletes practice table', rm.deleted === true);
}

// מי שלא פתח את השולחן לא יכול למחוק (שולחן לא קיים = 404)
try {
  await call({ op: 'removeRoom', roomId: '00000000-0000-0000-0000-000000000000' });
  check('removeRoom unknown room rejected', false);
} catch (e) {
  check('removeRoom unknown room rejected', /לא נמצא|404|PGRST/.test((e as Error).message), (e as Error).message.slice(0, 80));
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
