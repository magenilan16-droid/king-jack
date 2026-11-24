// שרת המשחק: כל מהלך עובר כאן, כדי שאף אחד לא יוכל לרמות
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { createGame, joinGame, act, privateViews, type Full, type GameType, type RoomMove } from './engine/room.ts';
import { GameError, type PlayerBase, type LedgerEffect } from './engine/common.ts';
import { settle } from './engine/settle.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// מריץ משימה ברקע אחרי שהתשובה נשלחה (כדי שהמשחק לא יחכה להתראות)
function background(p: Promise<unknown>) {
  const safe = p.catch((e) => console.error('background', e));
  try {
    EdgeRuntime?.waitUntil(safe);
  } catch {
    /* ignore */
  }
}

// ---------- התראות פוש ----------
let vapidReady = false;
async function ensureVapid(): Promise<boolean> {
  if (vapidReady) return true;
  const { data } = await admin.from('game_config').select('key, value').in('key', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
  if (!m.vapid_public || !m.vapid_private) return false;
  webpush.setVapidDetails('https://magenilan16-droid.github.io/king-jack/', m.vapid_public, m.vapid_private);
  vapidReady = true;
  return true;
}

type Lang = 'he' | 'en';
async function pushTo(userIds: string[], make: (lang: Lang) => Record<string, unknown>): Promise<number> {
  if (!userIds.length || !(await ensureVapid())) return 0;
  const [{ data: subs }, { data: profs }] = await Promise.all([
    admin.from('game_push_subs').select('endpoint, p256dh, auth, user_id').in('user_id', userIds),
    admin.from('game_profiles').select('id, lang').in('id', userIds),
  ]);
  const langOf = new Map((profs ?? []).map((p: { id: string; lang: Lang }) => [p.id, p.lang]));
  let sent = 0;
  await Promise.all(
    (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string; user_id: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ ...make(langOf.get(s.user_id) ?? 'he'), lang: langOf.get(s.user_id) ?? 'he' }),
          { TTL: 600, urgency: 'high' },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from('game_push_subs').delete().eq('endpoint', s.endpoint);
        else console.error('push failed', code, new URL(s.endpoint).host, (e as Error).message, (e as { body?: string }).body ?? '');
      }
    }),
  );
  return sent;
}

// של מי התור עכשיו
function turnUser(pub: Full['pub']): string | null {
  if (pub.kind === 'holdem') return pub.turnId;
  if (pub.phase === 'playing' && pub.turn) return pub.players[pub.turn.p]?.id ?? null;
  return null;
}

// "התור שלך!" - רק למי שלא מסתכל על השולחן כרגע
async function notifyTurn(userId: string, room: { id: string; name: string }) {
  const { data: pres } = await admin.from('game_presence').select('room_id, seen_at').eq('user_id', userId).maybeSingle();
  const fresh = pres && pres.room_id === room.id && Date.now() - new Date(pres.seen_at).getTime() < 25000;
  if (fresh) return;
  await pushTo([userId], (lang) => ({
    title: lang === 'he' ? '⏰ התור שלך!' : "⏰ It's your turn!",
    body: lang === 'he' ? `${room.name} - מחכים לך` : `${room.name} - they're waiting for you`,
    url: `./?room=${room.id}`,
    tag: `turn-${room.id}`,
  }));
}

// סגירת ערב בכסף אמיתי - יוצרים את רשימת החובות (מי מעביר למי)
async function createDebts(roomId: string) {
  const { data: rows } = await admin.from('game_ledger').select('user_id, kind, amount').eq('room_id', roomId);
  const nets = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.user_id) continue;
    const v = Number(r.amount) * (r.kind === 'cashout' ? 1 : -1);
    nets.set(r.user_id, (nets.get(r.user_id) ?? 0) + v);
  }
  const balances = [...nets].map(([id, net]) => ({ id, name: id, net: Math.round(net * 100) / 100 }));
  const kitty = Math.round(-balances.reduce((a, b) => a + b.net, 0) * 100) / 100;
  if (Math.abs(kitty) > 0.005) balances.push({ id: 'kupa', name: 'kupa', net: kitty });
  const transfers = settle(balances);
  if (!transfers.length) return;
  const debtRows = transfers.map((t) => ({
    room_id: roomId,
    from_user: t.from === 'kupa' ? null : t.from,
    to_user: t.to === 'kupa' ? null : t.to,
    amount: t.amount,
  }));
  // החובות נכתבים אחרי שהשולחן כבר נסגר - אם נכשל, מנסים שוב ומתעדים בלוג
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await admin.from('game_debts').insert(debtRows);
    if (!error) return;
    console.error('debts insert failed', roomId, attempt, error.message);
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
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
  const turnSeconds = num(s.turnSeconds, 45, 15, 180);
  // מגבלת קניות חוזרות: null = ללא הגבלה
  const maxRebuys = s.maxRebuys === null || s.maxRebuys === undefined || s.maxRebuys === '' ? null : num(s.maxRebuys, 0, 0, 20);
  if (type === 'blackjack') {
    const minBet = num(s.minBet, 10, 1, 10000);
    return {
      minBet,
      maxBet: Math.max(minBet, num(s.maxBet, minBet * 20, 1, 1000000)),
      buyIn: num(s.buyIn, 500, 1, 1000000),
      dealerMode: s.dealerMode === 'player' ? 'player' : 'house',
      turnSeconds,
      maxRebuys,
    };
  }
  const bb = num(s.bb, 10, 2, 100000);
  const blindUpMinutes = num(s.blindUpMinutes, 0, 0, 120);
  // אומהה = אותו מנוע, 4 קלפים ביד והעלאה עד גודל הקופה
  const variant = s.variant === 'omaha' ? { variant: 'omaha' as const } : {};
  return { bb, sb: Math.max(1, Math.floor(bb / 2)), baseBb: bb, buyIn: num(s.buyIn, bb * 100, 1, 10000000), turnSeconds, blindUpMinutes, maxRebuys, ...variant };
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

// ---------- בוטים ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// אם עכשיו תור של בוט - מתי הוא מסיים "לחשוב"
function botDue(full: Full): number | null {
  const id = turnUser(full.pub);
  if (!id || !id.startsWith('bot-')) return null;
  const at = (full.sec as { bot?: { at?: number } | null }).bot?.at;
  return typeof at === 'number' ? at : Date.now();
}

// הבוטים משחקים כמו בני אדם: מחכים את זמן המחשבה של הבוט, מבצעים, וממשיכים לבוט הבא - עד שמגיע תור של בן אדם
async function runBots(roomId: string, due: number) {
  for (let step = 0; step < 80; step++) {
    await sleep(Math.max(0, due - Date.now()) + 25);
    const box: { next: number | null } = { next: null };
    try {
      const res = await mutate(
        roomId,
        (full) => {
          const id = turnUser(full.pub);
          if (!id || !id.startsWith('bot-')) throw new GameError('אין תור של בוט');
          return act(full, id, { type: 'bot' }, Date.now());
        },
        { bots: false, onSaved: (full) => (box.next = botDue(full)) },
      );
      if (res.status !== 200) return;
    } catch (e) {
      if (!(e instanceof GameError)) {
        console.error('bots', roomId, e);
        return;
      }
      // מישהו אחר כבר הזיז את הבוט (או שהוא עוד חושב) - קוראים שוב את המצב וממשיכים לחכות
      const { data: loaded } = await admin.rpc('game_load', { p_room: roomId });
      if (!loaded || loaded.status !== 'open') return;
      box.next = botDue({ pub: loaded.state, sec: loaded.secret } as Full);
    }
    if (box.next == null) return;
    due = box.next;
  }
}

// טעינה -> פעולה -> שמירה, עם ניסיון חוזר אם מישהו אחר שמר באמצע
async function mutate(
  roomId: string,
  fn: (full: Full) => { effects: LedgerEffect[]; closed?: boolean },
  opts: { bots?: boolean; onSaved?: (full: Full) => void } = {},
): Promise<Response> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: loaded, error } = await admin.rpc('game_load', { p_room: roomId });
    if (error) throw error;
    if (!loaded) return json({ error: 'השולחן לא נמצא' }, 404);
    if (loaded.status !== 'open') return json({ error: 'השולחן נסגר' }, 400);
    const full = { pub: loaded.state, sec: loaded.secret } as Full;
    const before = turnUser(full.pub);
    const dueBefore = botDue(full);
    const handBefore = JSON.stringify(full.pub.lastHand ?? null);
    const res = fn(full);
    if (await save(roomId, loaded.version, full, res.effects, !!res.closed)) {
      opts.onSaved?.(full);
      // התחיל תור חדש של בוט - השרת יפעיל אותו אחרי שיסיים לחשוב
      const due = res.closed ? null : botDue(full);
      if (opts.bots !== false && due != null && due !== dueBefore) background(runBots(roomId, due));
      const after = res.closed ? null : turnUser(full.pub);
      if (after && after !== before && !after.startsWith('bot-')) background(notifyTurn(after, { id: roomId, name: loaded.name }));
      if (res.closed && loaded.money_mode === 'real') await createDebts(roomId);
      // יד/סיבוב הסתיים (או שמישהו הראה קלפים) - שומרים להיסטוריה
      const hand = full.pub.lastHand;
      if (hand && JSON.stringify(hand) !== handBefore) {
        const { error: hErr } = await admin
          .from('game_hands')
          .upsert({ room_id: roomId, hand_no: hand.no, game_type: full.pub.kind, data: hand }, { onConflict: 'room_id,hand_no' });
        if (hErr) console.error('history', hErr.message);
      }
      return json({ ok: true, roomId });
    }
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));
  }
  return json({ error: 'עומס - נסה שוב' }, 409);
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
      const { data: lastInv } = await admin
        .from('game_invites')
        .select('created_at')
        .eq('from_user', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastInv && Date.now() - new Date(lastInv.created_at).getTime() < 15000)
        return json({ error: 'רגע, שלחתם הזמנה הרגע - נסו שוב בעוד כמה שניות' }, 429);
      const { data: valid } = await admin.from('game_profiles').select('id').in('id', ids);
      const to = (valid ?? []).map((p: { id: string }) => p.id);
      if (to.length) {
        await admin.from('game_invites').insert(to.map((t) => ({ room_id: room.id, from_user: userId, to_user: t })));
      }
      const pushed = await pushTo(to, (lang) => ({
        title: lang === 'he' ? `👑 ${me.name} מזמין/ה אותך לשחק!` : `👑 ${me.name} invites you to play!`,
        body: `${room.name} · ${
          room.game_type === 'blackjack'
            ? lang === 'he' ? 'בלאק ג׳ק' : 'Blackjack'
            : room.state?.settings?.variant === 'omaha'
              ? lang === 'he' ? 'אומהה' : 'Omaha'
              : lang === 'he' ? 'טקסס הולדם' : "Texas Hold'em"
        } · ${lang === 'he' ? 'קוד' : 'Code'} ${room.code}`,
        url: `./?join=${room.code}`,
        tag: `invite-${room.code}`,
      }));
      return json({ ok: true, invited: to.length, pushed });
    }

    // זירוז: מזכירים לשחקן שבתור שמחכים לו (התראה לטלפון)
    if (body.op === 'nudge') {
      const { data: room } = await admin.from('game_rooms').select('id, name, status, state').eq('id', body.roomId).single();
      if (!room || room.status !== 'open') return json({ error: 'השולחן נסגר' }, 400);
      const target = String(body.userId ?? '');
      if (!room.state.players.some((p: { id: string }) => p.id === userId)) return json({ error: 'אתה לא בשולחן' }, 403);
      if (turnUser(room.state) !== target || target.startsWith('bot-')) return json({ error: 'אפשר לזרז רק מי שבתור' }, 400);
      const { data: last } = await admin
        .from('game_nudges')
        .select('created_at')
        .eq('room_id', room.id)
        .eq('to_user', target)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last && Date.now() - new Date(last.created_at).getTime() < 20000) return json({ error: 'רגע, כבר זירזו אותו/ה 😅' }, 429);
      await admin.from('game_nudges').insert({ room_id: room.id, from_user: userId, to_user: target });
      background(
        pushTo([target], (lang) => ({
          title: lang === 'he' ? `⏰ ${me.name} מזרז/ת אותך!` : `⏰ ${me.name} is nudging you!`,
          body: lang === 'he' ? `${room.name} - כולם מחכים לך 😅` : `${room.name} - everyone is waiting 😅`,
          url: `./?room=${room.id}`,
          tag: `nudge-${room.id}`,
        })),
      );
      return json({ ok: true });
    }

    // התראת בדיקה לעצמי - כדי לוודא שההתראות עובדות בטלפון
    if (body.op === 'testPush') {
      const { count: devices } = await admin.from('game_push_subs').select('endpoint', { count: 'exact', head: true }).eq('user_id', userId);
      const sent = await pushTo([userId], (lang) => ({
        title: lang === 'he' ? 'King Jack - בדיקה' : 'King Jack - test',
        body: lang === 'he' ? 'ההתראות עובדות בטלפון הזה.' : 'Notifications work on this phone.',
        url: './',
        tag: 'test',
      }));
      console.log('testPush', userId.slice(0, 8), 'devices', devices, 'sent', sent);
      return json({ ok: true, sent, devices: devices ?? 0 });
    }

    // דיווח מהטלפון על ניסיון הפעלת התראות (לאבחון)
    if (body.op === 'pushDiag') {
      console.log('pushDiag', JSON.stringify({ u: userId.slice(0, 8), status: body.status, detail: body.detail, standalone: body.standalone, perm: body.perm, ua: body.ua }));
      return json({ ok: true });
    }

    // מחיקת שולחן מהלובי: אימון - נמחק לגמרי, כסף אמיתי - נסגר עם קיזוז (החובות נשמרים)
    if (body.op === 'removeRoom') {
      const { data: room } = await admin.from('game_rooms').select('id, status, money_mode, host_id, state').eq('id', body.roomId).single();
      if (!room) return json({ error: 'השולחן לא נמצא' }, 404);
      const isHost = room.host_id === userId || room.state?.hostId === userId;
      if (!isHost && !profile.is_admin) return json({ error: 'רק מי שפתח את השולחן או מנהל' }, 403);
      if (room.status === 'open') {
        const res = await mutate(room.id, (full) => act(full, full.pub.hostId, { type: 'close' }, now));
        if (res.status !== 200) return res;
      }
      if (room.money_mode === 'demo') {
        await admin.from('game_rooms').delete().eq('id', room.id);
        return json({ ok: true, deleted: true });
      }
      return json({ ok: true, closed: true });
    }

    // פעולות מנהל
    if (body.op === 'admin') {
      if (!profile.is_admin) return json({ error: 'רק מנהל' }, 403);
      const target = String(body.userId ?? '');
      switch (body.action) {
        case 'setPremium':
          await admin.from('game_profiles').update({ is_premium: !!body.value }).eq('id', target);
          return json({ ok: true });
        case 'setAdmin':
          if (target === userId && !body.value) return json({ error: 'אי אפשר להסיר את עצמך מניהול' }, 400);
          await admin.from('game_profiles').update({ is_admin: !!body.value }).eq('id', target);
          return json({ ok: true });
        case 'resetPassword': {
          const pw = String(100000 + Math.floor(Math.random() * 900000));
          const { error } = await admin.auth.admin.updateUserById(target, { password: `vaad::${pw}` });
          if (error) throw error;
          return json({ ok: true, password: pw });
        }
        case 'forceClose':
          return await mutate(String(body.roomId), (full) => act(full, full.pub.hostId, { type: 'close' }, now));
        case 'cleanup': {
          // שולחנות נטושים: לא היה בהם מהלך / יד / קנייה / שחקן מחובר X שעות
          const hours = Math.min(168, Math.max(1, Number(body.hours) || 3));
          const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
          const { data: open } = await admin.from('game_rooms').select('id, created_at').eq('status', 'open');
          const ids = (open ?? []).map((r: { id: string }) => r.id);
          const active = new Set<string>();
          if (ids.length) {
            const [h, l, p] = await Promise.all([
              admin.from('game_hands').select('room_id').in('room_id', ids).gte('created_at', cutoff),
              admin.from('game_ledger').select('room_id').in('room_id', ids).gte('created_at', cutoff),
              admin.from('game_presence').select('room_id').in('room_id', ids).gte('seen_at', cutoff),
            ]);
            for (const r of [...(h.data ?? []), ...(l.data ?? []), ...(p.data ?? [])]) active.add((r as { room_id: string }).room_id);
          }
          const stale = (open ?? []).filter((r: { id: string; created_at: string }) => !active.has(r.id) && r.created_at < cutoff);
          let closed = 0;
          for (const r of stale) {
            // סגירה מסודרת: כולם יוצאים עם מה שיש להם, ובכסף אמיתי נוצרים חובות
            const res = await mutate(r.id, (full) => act(full, full.pub.hostId, { type: 'close' }, now));
            if (res.status === 200) closed++;
          }
          // שולחנות אימון שנסגרו לפני יותר מיום - נמחקים לגמרי (לא נספרים בשום מקום)
          const { data: del } = await admin
            .from('game_rooms')
            .delete()
            .eq('status', 'closed')
            .eq('money_mode', 'demo')
            .lt('closed_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
            .select('id');
          return json({ ok: true, closed, deleted: del?.length ?? 0 });
        }
        case 'settleAll': {
          const { error } = await admin
            .from('game_debts')
            .update({ paid: true, paid_by: userId, paid_at: new Date().toISOString() })
            .eq('paid', false);
          if (error) throw error;
          return json({ ok: true });
        }
        default:
          return json({ error: 'פעולה לא מוכרת' }, 400);
      }
    }

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
      return await mutate(roomId, (full) => ({ effects: joinGame(full, me) }));
    }
    if (body.op === 'act') {
      return await mutate(roomId, (full) => act(full, userId, body.move as RoomMove, now));
    }
    return json({ error: 'פעולה לא מוכרת' }, 400);
  } catch (e) {
    if (e instanceof GameError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: 'שגיאת שרת' }, 500);
  }
});
