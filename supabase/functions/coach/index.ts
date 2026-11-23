// מאמן AI אישי (פרימיום): מקבל את המצב בשולחן ומחזיר המלצה קצרה בעזרת Claude
// חשוב: נשלח למודל רק מה שהשחקן עצמו רשאי לראות - הקלפים שלו + מה שגלוי על השולחן
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

// מודלים שתומכים במעבר אוטומטי למודל גיבוי אם הבקשה נדחית
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const DAILY_LIMIT = 200;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Card = string;
interface Player {
  id: string;
  name: string;
  isBot: boolean;
  chips: number;
  [k: string]: unknown;
}

function cardValue(c: Card) {
  const r = '23456789TJQKA'.indexOf(c[0]) + 2;
  return r === 14 ? 11 : Math.min(r, 10);
}
function bjTotal(cards: Card[]) {
  let t = 0;
  let aces = 0;
  for (const c of cards) {
    t += cardValue(c);
    if (c[0] === 'A') aces++;
  }
  while (t > 21 && aces) {
    t -= 10;
    aces--;
  }
  return { t, soft: aces > 0 };
}

// תיאור המצב לפוקר - רק מידע שהשחקן רשאי לראות
function holdemSituation(s: Record<string, any>, me: Player, hole: Card[]) {
  const players: Player[] = s.players;
  const myIdx = players.findIndex((p) => p.id === me.id);
  const order = players.slice(myIdx + 1).concat(players.slice(0, myIdx));
  const pot = players.reduce((a, p) => a + Number(p.total ?? 0), 0);
  const toCall = Math.max(0, s.currentBet - Number(me.bet ?? 0));
  const dealer = players[s.dealerIdx]?.id;
  const status = (p: Player) =>
    p.folded ? 'folded' : p.allIn ? 'all-in' : p.sitOut ? 'sitting out' : p.inHand ? 'in hand' : 'not in this hand';
  const lines = [
    `Game: No-Limit Texas Hold'em, blinds ${s.settings.sb}/${s.settings.bb}.`,
    `Street: ${s.phase}. Board: ${s.board.length ? s.board.join(' ') : '(no community cards yet)'}.`,
    `My hole cards: ${hole.join(' ')}. My stack: ${me.chips}. I already put ${me.bet ?? 0} in this street.`,
    `Pot: ${pot}. To call: ${toCall}. Minimum raise: to ${s.currentBet + s.minRaise}.${dealer === me.id ? ' I am on the dealer button.' : ''}`,
    `Other players, in acting order after me:`,
    ...order.map(
      (p) =>
        `- ${p.name}${p.isBot ? ' (bot)' : ''}: stack ${p.chips}, bet this street ${p.bet ?? 0}, ${status(p)}${
          p.lastAction ? `, last action ${p.lastAction}` : ''
        }${dealer === p.id ? ' [dealer]' : ''}`,
    ),
    s.turnId === me.id ? 'It is my turn to act now.' : 'It is not my turn yet.',
  ];
  return lines.join('\n');
}

// תיאור המצב לבלאק ג׳ק
function blackjackSituation(s: Record<string, any>, me: Player & { hands?: any[]; bet?: number }) {
  const up = s.dealer?.cards?.[0];
  const lines = [
    'Game: Blackjack, 6 decks, dealer stands on 17, blackjack pays 3:2, double after split allowed, no insurance or surrender.',
    `Phase: ${s.phase}. Table bet limits ${s.settings.minBet}-${s.settings.maxBet}. My chips: ${me.chips}.`,
  ];
  if (up) lines.push(`Dealer up card: ${up}.`);
  const hands = me.hands ?? [];
  if (hands.length) {
    hands.forEach((h: { cards: Card[]; bet: number; done: boolean; doubled: boolean }, i: number) => {
      const { t, soft } = bjTotal(h.cards);
      const current = s.turn && s.players[s.turn.p]?.id === me.id && s.turn.h === i;
      lines.push(
        `My hand ${i + 1}: ${h.cards.join(' ')} (total ${soft && t < 21 ? 'soft ' : ''}${t}), bet ${h.bet}${current ? ' <- deciding this hand now' : h.done ? ' (finished)' : ''}.`,
      );
      if (current) {
        const opts = ['hit', 'stand'];
        if (h.cards.length === 2 && me.chips >= h.bet) opts.push('double');
        if (h.cards.length === 2 && cardValue(h.cards[0]) === cardValue(h.cards[1]) && hands.length < 4 && me.chips >= h.bet) opts.push('split');
        lines.push(`My options: ${opts.join(', ')}.`);
      }
    });
  } else if (s.phase === 'betting') {
    lines.push(`I am choosing my bet for the next round (currently ${me.bet ?? s.settings.minBet}).`);
  }
  return lines.join('\n');
}

function systemPrompt(lang: 'he' | 'en') {
  return `You are the personal AI coach inside King Jack, a friendly home poker and blackjack game played among friends.
The player asks what to do in their current spot. Give one clear recommendation.

How to answer:
- Answer in ${lang === 'he' ? 'Hebrew, using the poker words Israeli players use (פולד, צ׳ק, קול, העלאה, אול-אין, דאבל, ספליט)' : 'English'}.
- Start with the recommended action in bold, for example **Call**, **Fold**, **Raise to 40**, **Stand**, **Double**.
- Then one or two short sentences on why: hand strength, odds versus the price, position, stack sizes, what the other players' actions suggest.
- At most three sentences in total. No lists and no headings. A light joke is welcome.
- You only know what the situation text shows. Never claim to know other players' hidden cards; talk about likely ranges instead.

Card notation: rank then suit; T means 10; s = spades, h = hearts, d = diamonds, c = clubs.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: 'צריך להתחבר' }, 401);
    const userId = u.user.id;
    const { data: profile } = await admin.from('game_profiles').select('name, is_premium, lang').eq('id', userId).single();
    if (!profile?.is_premium) return json({ error: 'המאמן זמין רק למנויי פרימיום ⭐' }, 403);
    if (!anthropic) return json({ error: 'המאמן עוד לא הופעל - חסר מפתח API' }, 503);
    const lang: 'he' | 'en' = profile.lang === 'en' ? 'en' : 'he';

    // הגבלת קצב: פעם ב-4 שניות, ועד 200 ביום
    const { data: recent } = await admin
      .from('game_coach_log')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false });
    if (recent?.length && Date.now() - new Date(recent[0].created_at).getTime() < 4000)
      return json({ error: 'רגע, המאמן עוד חושב על השאלה הקודמת 🤔' }, 429);
    if ((recent?.length ?? 0) >= DAILY_LIMIT) return json({ error: 'הגעתם למכסה היומית של המאמן' }, 429);

    const body = await req.json();
    const roomId = String(body.roomId ?? '');
    const question = String(body.question ?? '').trim().slice(0, 200);
    const { data: loaded } = await admin.rpc('game_load', { p_room: roomId });
    if (!loaded || loaded.status !== 'open') return json({ error: 'השולחן לא נמצא' }, 404);
    const s = loaded.state;
    const me = (s.players as Player[]).find((p) => p.id === userId);
    if (!me) return json({ error: 'אתה לא בשולחן' }, 400);

    let situation: string;
    if (s.kind === 'holdem') {
      const hole: Card[] = loaded.secret?.holes?.[userId] ?? [];
      if (hole.length !== 2) return json({ error: 'אין לך קלפים ביד הזאת' }, 400);
      situation = holdemSituation(s, me, hole);
    } else {
      situation = blackjackSituation(s, me);
    }
    if (question) situation += `\n\nThe player's question: ${question}`;

    const { data: cfg } = await admin.from('game_config').select('value').eq('key', 'coach_model').maybeSingle();
    const model = cfg?.value || 'claude-opus-5-5';
    const withFallback = FALLBACK_MODELS.has(model);

    const msg = await anthropic.beta.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: systemPrompt(lang),
      messages: [{ role: 'user', content: situation }],
      ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
    } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

    await admin.from('game_coach_log').insert({
      user_id: userId,
      room_id: roomId,
      model: msg.model,
      input_tokens: msg.usage?.input_tokens ?? null,
      output_tokens: msg.usage?.output_tokens ?? null,
    });

    if (msg.stop_reason === 'refusal') {
      return json({ tip: lang === 'he' ? 'המאמן לא יכול לעזור בזה כרגע 🙈' : "The coach can't help with that right now 🙈" });
    }
    const tip = msg.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return json({ tip: tip || (lang === 'he' ? 'המאמן שתק הפעם 🤐' : 'The coach has nothing to add 🤐') });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'המאמן עמוס כרגע - נסו שוב בעוד רגע' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'מפתח ה-API של המאמן לא תקין' }, 503);
    if (e instanceof Anthropic.APIConnectionError) return json({ error: 'אין חיבור לשרת המאמן - נסו שוב' }, 503);
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic error', e.status, e.message);
      return json({ error: 'המאמן נתקל בשגיאה - נסו שוב' }, 502);
    }
    console.error(e);
    return json({ error: 'שגיאת שרת' }, 500);
  }
});
