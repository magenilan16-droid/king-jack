// שרת המשחק: כל מהלך עובר כאן, כדי שאף אחד לא יוכל לרמות
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { createGame, joinGame, act, privateViews, type Full, type GameType, type RoomMove } from './engine/room.ts';
import { GameError, type PlayerBase, type LedgerEffect } from './engine/common.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ---------- התראות פוש ----------
let vapidReady = false;
async function ensureVapid(): Promise<boolean> {
  if (vapidReady) return true;
  const { data } = await admin.from('game_config').select('key, value').in('key', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!m.vapid_public || !m.vapid_private) return false;
  webpush.setVapidDetails('mailto:noreply@kingjack.app', m.vapid_public, m.vapid_private);
  vapidReady = true;
  return true;
}

async function pushTo(userIds: string[], payload: Record<string, unknown>): Promise<number> {
  if (!userIds.length || !(await ensureVapid())) return 0;
  const { data: subs } = await admin.from('game_push_subs').select('endpoint, p256dh, auth').in('user_id', userIds);
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('game_push_subs').delete().eq('endpoint', s.endpoint);
        else console.error('push failed', code, (e as Error).message);
      }
    }),
  );
  return sent;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeCode() {
  let c = '';
  for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

function clampSettings(type: GameType, s: Record<string, unknown>) {
  const num = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : d;
  };
  if (type === 'blackjack') {
    const minBet = num(s.minBet, 10, 1, 10000);
    return {
      minBet,
      maxBet: Math.max(minBet, num(s.maxBet, minBet * 20, 1, 1000000)),
      buyIn: num(s.buyIn, 500, 1, 1000000),
      dealerMode: s.dealerMode === 'player' ? 'player' : 'house',
    };
  }
  const bb = num(s.bb, 10, 2, 100000);
  return { bb, sb: Math.max(1, Math.floor(bb / 2)), buyIn: num(s.buyIn, bb * 100, 1, 10000000) };
}

async function save(roomId: string, version: number, full: Full, effects: LedgerEffect[], closed = false) {
  const { data, error } = await admin.rpc('game_save', {
    p_room: roomId,
    p_version: version,
    p_state: full.pub,
    p_secret: full.sec,
    p_privates: privateViews(full),
    p_ledger: effects,
    p_closed: closed,
  });
  if (error) throw error;
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u.user) return json({ error: 'צריך להתחבר' }, 401);
    const userId = u.user.id;
    const { data: profile } = await admin.from('game_profiles').select('*').eq('id', userId).single();
    if (!profile) return json({ error: 'צריך להגדיר שם קודם' }, 400);
    const me: PlayerBase = { id: userId, name: profile.name, avatar: profile.avatar, isBot: false, chips: 0 };

    const body = await req.json();
    const now = Date.now();

    if (body.op === 'create') {
      const type: GameType = body.gameType === 'holdem' ? 'holdem' : 'blackjack';
      const settings = clampSettings(type, body.settings || {});
      if (body.buyIn) settings.buyIn = Math.max(1, Math.floor(Number(body.buyIn)) || settings.buyIn);
      const { full, effects } = createGame(type, me, settings as never);
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = makeCode();
        const { data: room, error } = await admin
          .from('game_rooms')
          .insert({
            code,
            name: String(body.name || 'שולחן').slice(0, 40),
            game_type: type,
            money_mode: body.moneyMode === 'demo' ? 'demo' : 'real',
            host_id: userId,
            settings,
            state: full.pub,
          })
          .select('id, version')
          .single();
        if (error) {
          if (error.code === '23505') continue; // קוד תפוס
          throw error;
        }
        // שומרים סודות וקנייה ראשונה
        await save(room.id, room.version, full, effects);
        return json({ roomId: room.id, code });
      }
      return json({ error: 'נסה שוב' }, 500);
    }

    // הזמנת חברים: רק מי שיושב בשולחן יכול להזמין
    if (body.op === 'invite') {
      const { data: room } = await admin
        .from('game_rooms')
        .select('id, name, code, game_type, status, state')
        .eq('id', body.roomId)
        .single();
      if (!room || room.status !== 'open') return json({ error: 'השולחן נסגר' }, 400);
      const seated: string[] = (room.state.players ?? []).map((p: { id: string }) => p.id);
      if (!seated.includes(userId)) return json({ error: 'צריך לשבת בשולחן כדי להזמין' }, 403);
      const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(String))]
        .filter((id) => id !== userId && !seated.includes(id))
        .slice(0, 30);
      if (!ids.length) return json({ error: 'לא נבחרו חברים' }, 400);
      const { data: valid } = await admin.from('game_profiles').select('id').in('id', ids);
      const to = (valid ?? []).map((p: { id: string }) => p.id);
      if (to.length) {
        await admin.from('game_invites').insert(to.map((t) => ({ room_id: room.id, from_user: userId, to_user: t })));
      }
      const gameHe = room.game_type === 'blackjack' ? 'בלאק ג׳ק' : 'טקסס הולדם';
      const pushed = await pushTo(to, {
        title: `👑 ${me.name} מזמין/ה אותך לשחק!`,
        body: `${room.name} · ${gameHe} · Code ${room.code}`,
        url: `./?join=${room.code}`,
        tag: `invite-${room.code}`,
      });
      return json({ ok: true, invited: to.length, pushed });
    }

    // join / act - טוענים, מפעילים, שומרים (עם ניסיון חוזר אם מישהו אחר שמר באמצע)
    let roomId: string = body.roomId;
    if (body.op === 'join') {
      const { data: r } = await admin
        .from('game_rooms')
        .select('id')
        .eq('code', String(body.code || '').toUpperCase().trim())
        .eq('status', 'open')
        .maybeSingle();
      if (!r) return json({ error: 'לא נמצא שולחן פתוח עם הקוד הזה' }, 404);
      roomId = r.id;
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: loaded, error } = await admin.rpc('game_load', { p_room: roomId });
      if (error) throw error;
      if (!loaded) return json({ error: 'השולחן לא נמצא' }, 404);
      if (loaded.status !== 'open') return json({ error: 'השולחן נסגר' }, 400);
      const full = { pub: loaded.state, sec: loaded.secret } as Full;
      let effects: LedgerEffect[];
      let closed = false;
      if (body.op === 'join') {
        const buyIn = Number(body.buyIn) || full.pub.settings.buyIn;
        effects = joinGame(full, me, buyIn);
      } else if (body.op === 'act') {
        const res = act(full, userId, body.move as RoomMove, now);
        effects = res.effects;
        closed = !!res.closed;
      } else return json({ error: 'פעולה לא מוכרת' }, 400);
      if (await save(roomId, loaded.version, full, effects, closed)) return json({ ok: true, roomId });
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
    }
    return json({ error: 'עומס - נסה שוב' }, 409);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'שגיאת שרת' }, 500);
  }
});
