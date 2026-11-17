import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createECDH, randomBytes } from 'node:crypto';
import { sha256Hex } from '../src/lib/sha256.ts';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
async function login(name: string, pw: string) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const r = await sb.auth.signInWithPassword({ email: `u${sha256Hex(name.toLowerCase()).slice(0, 24)}@players.vaad.game`, password: `vaad::${pw}` });
  if (r.error) throw r.error;
  return { sb, id: r.data.user!.id };
}
const a = await login('QA Tester1', process.env.QA_PW_A!);
const b = await login('QA Tester2', process.env.QA_PW_B!);
const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
const sub = { p_endpoint: 'https://fcm.googleapis.com/fcm/send/qa-fake-endpoint-' + Date.now(), p_p256dh: ecdh.getPublicKey().toString('base64url'), p_auth: randomBytes(16).toString('base64url') };
const s1 = await b.sb.rpc('game_save_push', sub);
console.log('save sub:', s1.error ?? 'ok');
const { data: c } = await a.sb.functions.invoke('game', { body: { op: 'create', gameType: 'blackjack', name: 'QA push', moneyMode: 'demo', settings: {} } });
const { data: inv, error } = await a.sb.functions.invoke('game', { body: { op: 'invite', roomId: c.roomId, userIds: [b.id] } });
console.log('invite:', inv ?? (await (error as any).context.text()));
const { data: left } = await b.sb.from('game_push_subs').select('endpoint').eq('endpoint', sub.p_endpoint);
console.log('fake sub still stored (removed if push service said 404/410):', left?.length);
await a.sb.functions.invoke('game', { body: { op: 'act', roomId: c.roomId, move: { type: 'close' } } });
