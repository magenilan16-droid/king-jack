// בדיקה מול השרת האמיתי: הרשמה, שולחן אימון, הזמנה, משחק, סגירה
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '../src/lib/sha256.ts';

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const URL = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;

async function login(name: string, pw: string) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const email = `u${sha256Hex(name.trim().toLowerCase()).slice(0, 24)}@players.vaad.game`;
  let r = await sb.auth.signInWithPassword({ email, password: `vaad::${pw}` });
  if (r.error) {
    const reg = await sb.functions.invoke('register', { body: { name, password: pw, avatar: '🧪' } });
    if (reg.error) throw new Error('register ' + (await (reg.error as any).context?.text?.()));
    r = await sb.auth.signInWithPassword({ email, password: `vaad::${pw}` });
    if (r.error) throw r.error;
  }
  return { sb, id: r.data.user!.id };
}
async function call(sb: any, body: unknown) {
  const { data, error } = await sb.functions.invoke('game', { body });
  if (error) throw new Error(await (error as any).context.text());
  return data;
}

const a = await login('QA Tester1', process.env.QA_PW_A!);
const b = await login('QA Tester2', process.env.QA_PW_B!);
console.log('login ok');

// שולחן אימון (דמו)
const { roomId, code } = await call(a.sb, { op: 'create', gameType: 'holdem', name: 'QA practice', moneyMode: 'demo', settings: { bb: 10, buyIn: 1000 } });
const { data: rm } = await a.sb.from('game_rooms').select('money_mode').eq('id', roomId).single();
console.log('room', code, 'money_mode =', rm.money_mode);

// הזמנה: B עוד לא בשולחן
const inv = await call(a.sb, { op: 'invite', roomId, userIds: [b.id] });
console.log('invite result', inv);
const { data: bInv } = await b.sb.from('game_invites').select('room_id, seen').eq('room_id', roomId);
console.log('B sees invite rows:', bInv?.length);
// מי שלא יושב לא יכול להזמין
try { await call(b.sb, { op: 'invite', roomId, userIds: [a.id] }); console.log('ERROR: B could invite'); } catch (e) { console.log('B blocked from inviting ✔', (e as Error).message); }

await call(b.sb, { op: 'join', code, buyIn: 500 });
await call(a.sb, { op: 'act', roomId, move: { type: 'addBot' } });
await call(a.sb, { op: 'act', roomId, move: { type: 'start' } });
for (let i = 0; i < 30; i++) {
  const { data: room } = await a.sb.from('game_rooms').select('state').eq('id', roomId).single();
  const s = room!.state;
  if (s.phase === 'showdown') { console.log('winners', JSON.stringify(s.winners), 'actions', s.players.map((p: any) => p.lastAction)); break; }
  const who = s.turnId === a.id ? a : s.turnId === b.id ? b : null;
  if (!who) throw new Error('turn not human ' + s.turnId);
  const me = s.players.find((p: any) => p.id === s.turnId);
  await call(who.sb, { op: 'act', roomId, move: me.bet < s.currentBet ? { type: 'call' } : { type: 'check' } });
}
await call(a.sb, { op: 'act', roomId, move: { type: 'close' } });
const { data: closed } = await a.sb.from('game_rooms').select('status').eq('id', roomId).single();
console.log('closed:', closed.status);
const { data: lb } = await a.sb.rpc('game_leaderboard', { p_since: null });
console.log('leaderboard has QA (should be false - demo):', (lb ?? []).some((r: any) => r.name.startsWith('QA')));
