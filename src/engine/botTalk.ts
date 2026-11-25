// הבוטים מדברים: אחרי רגעים גדולים (קופה גדולה, בלוף, "הריבר הרג אותי") בוט כותב משהו בצ׳אט,
// ולפעמים גם זורק אימוג׳י או עגבנייה. לא בכל יד - כדי שזה יישאר מצחיק ולא יציף
import { botSeed } from './common.ts';
import { type HState, runoutMs, runoutStages } from './holdem.ts';
import type { BJState } from './blackjack.ts';

export type BotFx = { kind: 'emote'; emoji: string } | { kind: 'throw'; to: string; item: string };

export interface BotSay {
  id: string;
  name: string;
  key: string; // שם הקבוצה + מספר השורה, למשל "win_big:2" (כדי שכל אחד יראה בשפה שלו)
  vars?: Record<string, string>;
  delay: number; // אחרי כמה זמן להציג (שלא יגלה תוצאה לפני שהקלפים נחשפו)
  fx?: BotFx;
}

// {n} = שם, {p} = אחוז
export const BOT_LINES: Record<string, { he: string[]; en: string[] }> = {
  win_big: {
    he: ['תודה על התרומה', 'בדיוק מה שהייתי צריך', 'אל תדאגו, אני אשמור עליהם טוב', 'עוד אחת כזאת ואני פורש לאילת', 'מי אמר שבוטים לא מרגישים? אני מרגיש עשיר'],
    en: ['Thanks for the donation', 'Exactly what I needed', "Don't worry, I'll take good care of them", 'One more like that and I retire to the beach', 'Who says bots have no feelings? I feel rich'],
  },
  lose_big: {
    he: ['אוקיי, זה כאב', 'היה לי חישוב. כנראה עם באג', 'נו באמת?!', 'אני הולך לעשות ריסטארט', 'שמרו לי מקום, אני עוד חוזר'],
    en: ['Okay, that hurt', 'I had a calculation. Apparently with a bug', 'Oh, come on?!', "I'm going to reboot", "Save my seat, I'll be back"],
  },
  bad_beat: {
    he: ['הייתי {p}% לפני הקלף הזה!', 'הריבר הזה… אין לי מילים', 'הקלף האחרון שונא אותי', 'זה מזל, זה לא פוקר'],
    en: ['I was {p}% before that card!', 'That river… no words', 'The last card hates me', "That's luck, not poker"],
  },
  suckout: {
    he: ['סליחה, סליחה… בעצם לא סליחה', 'ידעתי שהוא יגיע', 'הקלף הזה היה שלי מההתחלה', 'אמרתי לכם שאני בר מזל'],
    en: ['Sorry, sorry… actually, not sorry', 'I knew it was coming', 'That card was mine all along', 'Told you I was lucky'],
  },
  human_monster: {
    he: ['וואו {n}, כל הכבוד', 'עם יד כזאת גם אני הייתי מנצח', 'אוקיי {n}, הפעם הרווחת את זה', 'מי לימד אותך לשחק ככה?'],
    en: ['Wow {n}, well played', "With a hand like that I'd win too", 'Okay {n}, you earned that one', 'Who taught you to play like that?'],
  },
  bluff_show: {
    he: ['רק שתדעו', 'בלוף? אני? אף פעם', 'הייתם צריכים להשוות', 'הראיתי כי אני נדיב היום'],
    en: ['Just so you know', 'A bluff? Me? Never', 'You should have called', "I'm showing because I'm generous today"],
  },
  allin: {
    he: ['הכל באמצע. מי בא?', 'אול-אין. תחשבו טוב', 'בואו נראה אם יש לכם אומץ'],
    en: ["Everything in. Who's coming?", 'All-in. Think carefully', "Let's see if you've got the nerve"],
  },
  bust: {
    he: ['נגמרו לי הז׳טונים… מישהו מלווה?', 'אני הולך להטעין סוללה', 'GG, ניפגש בערב הבא'],
    en: ['Out of chips… anyone lending?', "I'm going to recharge", 'GG, see you next time'],
  },
  bj_blackjack: {
    he: ['בלאק ג׳ק! כמה נעים', 'אס ותמונה, השילוב הכי יפה', 'ככה משחקים'],
    en: ['Blackjack! So nice', 'Ace and a face, the prettiest combo', "That's how it's done"],
  },
  bj_bust: {
    he: ['עוד קלף אחד מיותר…', 'הייתי צריך לעצור', 'אוף, 22'],
    en: ['One card too many…', 'Should have stopped', 'Ugh, 22'],
  },
  bj_dealer_bust: {
    he: ['הדילר נשרף! כולם מרוויחים', 'יאללה דילר, תמשיך ככה', 'זה הסיבוב שלנו'],
    en: ['The dealer busts! Everyone wins', 'Keep it up, dealer', 'This round is ours'],
  },
  bj_human: {
    he: ['בלאק ג׳ק ל{n}, יפה', '{n} עם בלאק ג׳ק. מי מחלק פה?', 'נו {n}, תשאיר גם לנו'],
    en: ['Blackjack for {n}, nice', '{n} with a blackjack. Who is dealing here?', 'Come on {n}, leave some for us'],
  },
};

export function fillLine(text: string, vars?: Record<string, string>) {
  return text.replace(/\{(\w)\}/g, (_, k) => vars?.[k] ?? '');
}

// כמה כל בוט אוהב לדבר (לפי האופי שלו): רגיל, שקט, פטפטן, רגוע
const TALK = [1, 0.7, 1.4, 0.9];
const talky = (id: string) => TALK[botSeed(id) % TALK.length];
const pickIdx = (n: number) => Math.floor(Math.random() * n);
const pickOne = <T,>(a: T[]) => a[pickIdx(a.length)];
// מרווח מינימלי בין שתי שורות של בוטים באותו שולחן
const GAP_MS = 15000;

type Pub = (HState | BJState) & { botTalkAt?: number };

function say(id: string, name: string, key: string, delay: number, vars?: Record<string, string>, fx?: BotFx): BotSay {
  return { id, name, key: `${key}:${pickIdx(BOT_LINES[key].he.length)}`, vars, delay: Math.round(delay), fx };
}

// נקרא אחרי כל מהלך. before = מה היה לפני המהלך
export function botBanter(pub: Pub, before: { phase: string; logLen: number }, now: number): BotSay | null {
  if (now - (pub.botTalkAt ?? 0) < GAP_MS) return null;
  if (!pub.players.some((p) => !p.isBot)) return null;
  const out = pub.kind === 'holdem' ? holdemTalk(pub, before) : blackjackTalk(pub, before);
  if (out) pub.botTalkAt = now;
  return out;
}

function holdemTalk(s: HState, before: { phase: string; logLen: number }): BotSay | null {
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? '';
  const isBot = (id: string) => id.startsWith('bot-');
  const roll = (id: string, p: number) => Math.random() < p * talky(id);

  // בוט נכנס לאול-אין מול בני אדם
  if (s.phase !== 'showdown') {
    const fresh = (s.handLog ?? []).slice(before.logLen);
    const shove = fresh.find((e) => isBot(e.id) && e.a === 'allin');
    const humansIn = s.players.some((p) => !p.isBot && p.inHand && !p.folded);
    if (shove && humansIn && roll(shove.id, 0.2)) return say(shove.id, nameOf(shove.id), 'allin', 500);
    return null;
  }
  if (before.phase === 'showdown') return null;
  const rec = s.lastHand;
  if (!rec || rec.no !== s.handNo) return null;
  const bb = Math.max(1, rec.blinds[1]);
  const humans = rec.players.filter((p) => !p.isBot);
  if (!humans.length) return null;
  const ro = s.runout && s.runout.hand === s.handNo ? s.runout : null;
  // התגובה מגיעה רק אחרי שהלוח נחשף (באול-אין) ועוד רגע "לעכל"
  const delay = (ro ? runoutMs(ro.from) : 0) + 1200 + Math.random() * 900;
  const won = new Set(rec.winners.map((w) => w.id));
  const potOf = (id: string) => rec.winners.find((w) => w.id === id)?.amount ?? 0;
  const bots = rec.players.filter((p) => p.isBot);

  // כולם קיפלו: בוט שניצח והראה קלפים מתגרה
  if (rec.reason === 'fold') {
    const w = rec.winners[0];
    const wp = w && rec.players.find((p) => p.id === w.id);
    if (wp?.isBot && wp.shown && roll(wp.id, 0.85)) return say(wp.id, wp.name, 'bluff_show', 900, undefined, { kind: 'emote', emoji: '😎' });
    return null;
  }

  // אול-אין: מי היה מוביל ומי ניצח בסוף
  if (ro) {
    const st = runoutStages(ro.from);
    const beforeRiver = st.length - 2;
    for (const p of bots) {
      const e = ro.eq[p.id];
      if (!e || won.has(p.id)) continue;
      if (e[beforeRiver] >= 70 && roll(p.id, 0.8)) return say(p.id, p.name, 'bad_beat', delay, { p: String(e[beforeRiver]) }, { kind: 'emote', emoji: '😭' });
    }
    for (const p of bots) {
      const e = ro.eq[p.id];
      if (!e || !won.has(p.id)) continue;
      if (e[0] <= 35 && roll(p.id, 0.65)) return say(p.id, p.name, 'suckout', delay, undefined, { kind: 'emote', emoji: '🤑' });
    }
  }

  // בן אדם ניצח עם יד ענקית (פול האוס ומעלה) - בוט שהפסיד לו מחמיא (ולפעמים זורק פרח)
  const monster = rec.winners.find((w) => !isBot(w.id) && w.cat >= 6);
  if (monster) {
    const loser = bots.find((p) => !won.has(p.id) && !p.folded);
    if (loser && roll(loser.id, 0.6)) {
      const fx: BotFx | undefined = Math.random() < 0.35 ? { kind: 'throw', to: monster.id, item: '🌹' } : undefined;
      return say(loser.id, loser.name, 'human_monster', delay, { n: monster.name }, fx);
    }
  }

  // בוט נשאר בלי ז׳טונים
  const busted = bots.find((p) => (s.players.find((x) => x.id === p.id)?.chips ?? 1) <= 0);
  if (busted && roll(busted.id, 0.7)) return say(busted.id, busted.name, 'bust', delay, undefined, { kind: 'emote', emoji: '🥶' });

  // בוט לקח קופה גדולה מבני אדם
  const bigBot = rec.winners.find((w) => isBot(w.id) && w.amount >= 30 * bb);
  if (bigBot && humans.some((h) => !h.folded) && roll(bigBot.id, 0.45)) {
    return say(bigBot.id, nameOf(bigBot.id) || bigBot.name, 'win_big', delay, undefined, Math.random() < 0.5 ? { kind: 'emote', emoji: pickOne(['😎', '🤑']) } : undefined);
  }

  // בוט הפסיד קופה גדולה לבן אדם
  const humanBig = rec.winners.find((w) => !isBot(w.id) && potOf(w.id) >= 30 * bb);
  if (humanBig) {
    const loser = bots.find((p) => !won.has(p.id) && !p.folded);
    if (loser && roll(loser.id, 0.45)) {
      const r = Math.random();
      const fx: BotFx | undefined = r < 0.3 ? { kind: 'throw', to: humanBig.id, item: '🍅' } : r < 0.6 ? { kind: 'emote', emoji: '🤯' } : undefined;
      return say(loser.id, loser.name, 'lose_big', delay, undefined, fx);
    }
  }
  return null;
}

function blackjackTalk(s: BJState, before: { phase: string; logLen: number }): BotSay | null {
  if (s.phase !== 'results' || before.phase === 'results') return null;
  const rec = s.lastHand;
  if (!rec || rec.no !== s.round) return null;
  const roll = (id: string, p: number) => Math.random() < p * talky(id);
  // הדילר חושף ומושך קלפים באנימציה - מחכים שזה ייגמר
  const delay = 2200 + Math.random() * 800;
  const bots = rec.players.filter((p) => p.isBot);
  const has = (p: (typeof rec.players)[number], r: string) => p.hands.some((h) => h.result === r);
  const human = rec.players.find((p) => !p.isBot && has(p, 'blackjack'));
  if (human && bots.length) {
    const b = pickOne(bots);
    if (roll(b.id, 0.35)) return say(b.id, b.name, 'bj_human', delay, { n: human.name });
  }
  for (const b of bots) if (has(b, 'blackjack') && roll(b.id, 0.45)) return say(b.id, b.name, 'bj_blackjack', delay, undefined, { kind: 'emote', emoji: '😎' });
  if (rec.dealerTotal > 21) {
    const b = bots.find((p) => has(p, 'win'));
    if (b && roll(b.id, 0.35)) return say(b.id, b.name, 'bj_dealer_bust', delay, undefined, { kind: 'emote', emoji: '🔥' });
  }
  for (const b of bots) if (has(b, 'bust') && roll(b.id, 0.25)) return say(b.id, b.name, 'bj_bust', delay, undefined, { kind: 'emote', emoji: '🤯' });
  return null;
}
