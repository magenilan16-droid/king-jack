// הרשמה: שם + סיסמה אישית. יוצר משתמש מאושר ופרופיל
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sha(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { name, password: pw, avatar } = await req.json();
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    if (clean.length < 2 || clean.length > 16) return json({ error: 'שם בין 2 ל-16 תווים' }, 400);
    if (String(pw || '').length < 4 || String(pw).length > 40) return json({ error: 'סיסמה של 4 תווים לפחות' }, 400);
    const { data: taken } = await admin.from('game_profiles').select('id').ilike('name', clean).maybeSingle();
    if (taken) return json({ error: 'השם הזה תפוס, או שהסיסמה שגויה' }, 409);
    const email = `u${(await sha(clean.toLowerCase())).slice(0, 24)}@players.vaad.game`;
    const password = `vaad::${pw}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return json({ error: 'השם הזה תפוס, או שהסיסמה שגויה' }, 409);
    const { error: pErr } = await admin
      .from('game_profiles')
      .insert({ id: data.user.id, name: clean, avatar: String(avatar || '🃏').slice(0, 8) });
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id);
      return json({ error: 'השם הזה תפוס' }, 409);
    }
    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'שגיאת שרת' }, 500);
  }
});
