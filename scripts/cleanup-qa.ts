// סוגר שולחנות פתוחים שנשארו משחקן הבדיקה
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { sha256Hex } from '../src/lib/sha256.ts';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const r = await sb.auth.signInWithPassword({ email: `u${sha256Hex('qa tester1').slice(0, 24)}@players.vaad.game`, password: `vaad::${process.env.QA_PW_A}` });
const me = r.data.user!.id;
const { data: rooms } = await sb.from('game_rooms').select('id, name, state').eq('status', 'open');
for (const room of rooms ?? []) {
  if (room.state.hostId !== me) continue;
  const { error } = await sb.functions.invoke('game', { body: { op: 'act', roomId: room.id, move: { type: 'close' } }, region: 'ap-northeast-1' } as any);
  console.log('closed', room.name, error ? 'ERR' : 'ok');
}
