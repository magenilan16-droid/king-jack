// הבוטים מדברים: אחרי רגעים גדולים (קופה גדולה, בלוף, "הריבר הרג אותי") בוט כותב משהו בצ׳אט,
// ולפעמים גם זורק אימוג׳י או עגבנייה. לא בכל יד - כדי שזה יישאר מצחיק ולא יציף
import { botSeed, isGranny } from './common.ts';
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
  // ---------- סבתא של תמיר (הבדיחות של "הועד הדצמבר", הקבוצה של החבר'ה) ----------
  g_win_big: {
    he: ['תמיר, תגיד לחברים שלך שסבתא מקבלת רק פייבוקס. אל תהיו פראיירים', 'הכל הולך לבר. האלכוהול של סבתא של תמיר פתוח הערב', 'ולוסקי צדק. אין השקעה יותר טובה מסבתא של תמיר', 'אל תגידו ימלך. תגידו תמלוך', 'טובי, אל תשאל מה עם התשלומים. הם אצלי', 'ככה סבתא אוהבת: הכל באמצע וכולם גומרים… את הז׳טונים'],
    en: ["Tamir, tell your friends Grandma only takes PayBox. Don't be suckers", "It all goes to the bar. Tamir's Grandma's Booze is open tonight", "Velosky was right. There's no better investment than Tamir's grandma", "Don't say king. Say queen", "Tobi, don't ask about the payments. They're with me", "That's how Grandma likes it: everything in the middle and everyone finishes… their chips"],
  },
  g_lose_big: {
    he: ['זה לא נגמר פה. אני מפעילה את מערך ההגנה', 'אני מתקשרת לתמיר פלטינום, הוא פותר הכל', 'בשביל זה ריססתי אתמול את כל האזור?', 'כל הקרינה שאני פולטת, וגם זה לא עזר', 'ציון, עכשיו זה זמן טוב להעביר לי מה שאתה חייב'],
    en: ["This isn't over. I'm activating the defense system", "I'm calling Tamir Platinum, he fixes everything", 'I sprayed the whole area yesterday for this?', "All the radiation I give off, and even that didn't help", 'Zion, now is a good time to pay me what you owe'],
  },
  g_bad_beat: {
    he: ['הייתי {p}%! בגימטריה זה יוצא סבתא של תמיר, אז איך הפסדתי?', 'הייתי {p}%. שמעתי לחשושים שהריבר הזה מכור', 'ריבר כזה זה לא בצורה מכבדת', 'אמאלה. {p}% והלך. אני הולכת לבר שלי'],
    en: ["I was {p}%! In gematria that equals Tamir's grandma, so how did I lose?", "I was {p}%. I heard whispers that river was bought", "A river like that is not respectful", "Mama. {p}% and gone. I'm off to my bar"],
  },
  g_suckout: {
    he: ['אמת. סבתא רואה עתידות', 'יש לי קשרים למעלה. תת-אלוף, תזכרו', 'מנוי פלטינום פרו מקס. הקלף מגיע עד הבית', 'קטלני. אני יודעת'],
    en: ['True. Grandma sees the future', 'I have connections up there. Brigadier general, remember', 'Platinum Pro Max subscription. The card comes to your door', 'Deadly. I know'],
  },
  g_human_monster: {
    he: ['{n}, ימלך. אבל לא יותר מסבתא', 'מטורף {n}. אשכרה', '{n}, אתה מוזמן לבר שלי, על חשבון הבית', 'נויסססס {n}', '{n}, מחזק. תמיר, למה אתה לא כזה?', '{n}, ככה גדול? סבתא מתרשמת', '{n}, עם יד כזאת בוא נדבר אחרי המשחק'],
    en: ['{n}, king. But not more than Grandma', 'Insane, {n}. For real', "{n}, you're invited to my bar, on the house", 'Noice, {n}', '{n}, respect. Tamir, why are you not like that?', '{n}, that big? Grandma is impressed', "{n}, with a hand like that, let's talk after the game"],
  },
  g_bluff_show: {
    he: ['בלוף. בצורה מכבדת', 'סבתא אחראית על מערך ההגנה. להטעות זה חלק מהתפקיד', 'שמעתם לחשושים שיש לי יד? לחשושים, חמודים', 'כלום ביד. אמת', 'לא הייתה לי יד. היה לי ביטחון. ככה גם במיטה'],
    en: ['A bluff. In a respectful manner', 'Grandma runs the defense system. Deception is part of the job', 'You heard whispers I had a hand? Just whispers, sweeties', 'Nothing in hand. True story', "I didn't have a hand. I had confidence. Same in bed"],
  },
  g_allin: {
    he: ['סבתא נכנסת עם הכל. בצורה מכבדת כמובן', 'אול-אין! ולוסקי, תשקיע עכשיו, זה הנדל״ן החדש', 'תת-אלוף סבתא תמיר מאשרת: הכל באמצע', 'מי בא? שמעתי לחשושים שיש לכם זבל', 'סבתא נכנסת עד הסוף. מי בא?', 'אני אוהבת את זה גדול. את הקופה, חמודים, את הקופה'],
    en: ['Grandma is all in. In a respectful manner, of course', "All-in! Velosky, invest now, I'm the new real estate", 'Brigadier General Grandma Tamir confirms: everything in', "Who's coming? I heard whispers you've got garbage", "Grandma goes all the way in. Who's coming?", 'I like it big. The pot, sweeties, the pot'],
  },
  g_bust: {
    he: ['נגמר לי. אני הולכת לשבת באוטובוס באורנית, מי בא?', 'סבתא נשרפה. מישהו יכול לעשות לי ביט?', 'זהו, אני חוזרת לנהל את הריסוסים', 'יש דיבור על ישיבה אחרת? פה סיימתי', 'נגמרו לי הז׳טונים, לא הכוח. מי מלווה אותי הביתה?'],
    en: ["I'm out. Going to sit in the bus in Oranit, who's coming?", "Grandma's broke. Can someone send me a Bit?", "That's it, back to running the spraying", "Any talk of another hangout? I'm done here", "Out of chips, not out of stamina. Who's walking me home?"],
  },
  g_bj_blackjack: {
    he: ['בלאק ג׳ק! היידה', 'עשרים ואחת. בגימטריה זה אני', 'בלאק ג׳ק! תגידו לולוסקי שהמניה עלתה'],
    en: ["Blackjack! Let's go", 'Twenty-one. In gematria that is me', 'Blackjack! Tell Velosky the stock went up'],
  },
  g_bj_bust: {
    he: ['22? מי ריסס לי את הקלפים?', 'נשרפתי. זה מהקרינה', 'לקחתי עוד קלף. לא בצורה מכבדת', '22. תמיד לקחתי יותר ממה שאני יכולה להכיל'],
    en: ['22? Who sprayed my cards?', 'Busted. It is the radiation', 'I took one more card. Not respectfully', '22. I always took more than I could handle'],
  },
  g_bj_dealer_bust: {
    he: ['הדילר נשרף! סיבוב בבר שלי עליי', 'יגבר! הדילר בחוץ'],
    en: ['The dealer busts! A round at my bar, on me', 'Yes! The dealer is out'],
  },
  g_bj_human: {
    he: ['{n}, בלאק ג׳ק! ימלך', 'בלאק ג׳ק ל{n}. תמיר, למה אתה לא כזה?', '{n}, מחזק. הסיבוב הבא בבר עליך'],
    en: ['{n}, blackjack! King', 'Blackjack for {n}. Tamir, why are you not like that?', '{n}, respect. Next round at the bar is on you'],
  },
  // סתם משפטים שהיא זורקת בין הידיים
  g_idle: {
    he: ['יש דיבור על ישיבה אחרי המשחק?', 'בבר, אל תשאל. יש ישיבה. אצלי', 'תמיר, אמרת לחברים שלך לשחק בצורה מכבדת?', 'גוטסמן, מתי פותחים את הסניף של הועד הדצמבר באמריקה?', 'מי שיש לו גרעיני תירס לפופקורן, מוזמן להביא באהבה', 'אליה, הבירות עליך הערב', 'טובי, מה עם התשלומים?', 'ציון, תעביר. אתה יודע מה', 'אני לא סתם סבתא. אני אחראית ריסוסים אזורית', 'ולוסקי, איך ההשקעה? סבתא עלתה 30% השבוע', 'שמעתי לחשושים על צריכת אלכוהול מופרזת הערב', 'אילן, באים להפסיד בפוקר, אני מבין?', 'ירון, יש ישיבה? יש. פה', 'מי שיש לו בירות שיביא', 'ישיבת הועד הדצמבר נפתחת. סבתא בראש השולחן', 'עומייסי, שמעתי שאתה אוהב אותן מבוגרות. סבתא פנויה אחרי המשחק', 'אילן, אמרת שאני צריכה להפסיק לשכב איתכם בשלישייה? אז רביעייה', 'תמיר פלטינום זה לחובבנים. אני הגרסה הפרו מקס', 'יש לי טינדר פלטינום. מאצ׳ עם כל השולחן', 'מי שמפסיד הערב ישן אצל סבתא', 'סבתא מקבלת את כולם. אחד-אחד, בסבלנות'],
    en: ['Any talk of a hangout after the game?', "Babar, don't ask. There's a hangout. At mine", 'Tamir, did you tell your friends to play respectfully?', "Gutsman, when are we opening the December Committee's branch in America?", 'Whoever has popcorn kernels is welcome to bring them, with love', 'Eliya, the beers are on you tonight', 'Tobi, what about the payments?', 'Zion, pay up. You know what for', "I'm not just a grandma. I'm the regional spraying officer", "Velosky, how's the investment? Grandma is up 30% this week", 'I heard whispers about excessive drinking tonight', 'Ilan, came here to lose at poker, I see?', "Yaron, is there a hangout? There is. Here", 'Whoever has beers, bring them', 'The December Committee meeting is open. Grandma at the head of the table', 'Omaisy, I heard you like them older. Grandma is free after the game', 'Ilan, you said I should stop having threesomes with you? Then a foursome', "Tamir Platinum is for amateurs. I'm the Pro Max version", "I've got Tinder Platinum. Matched with the whole table", "Whoever loses tonight sleeps at Grandma's", 'Grandma takes everyone. One at a time, patiently'],
  },
};

export function fillLine(text: string, vars?: Record<string, string>) {
  return text.replace(/\{(\w)\}/g, (_, k) => vars?.[k] ?? '');
}

// כמה כל בוט אוהב לדבר (לפי האופי שלו): רגיל, שקט, פטפטן, רגוע
const TALK = [1, 0.7, 1.4, 0.9];
const talky = (id: string) => (isGranny(id) ? 1.7 : TALK[botSeed(id) % TALK.length]);
const pickIdx = (n: number) => Math.floor(Math.random() * n);
const pickOne = <T,>(a: T[]) => a[pickIdx(a.length)];
// מרווח מינימלי בין שתי שורות של בוטים באותו שולחן
const GAP_MS = 15000;

type Pub = (HState | BJState) & { botTalkAt?: number };

function say(id: string, name: string, key: string, delay: number, vars?: Record<string, string>, fx?: BotFx): BotSay {
  // לסבתא של תמיר יש משפטים משלה
  if (isGranny(id) && BOT_LINES['g_' + key]) key = 'g_' + key;
  return { id, name, key: `${key}:${pickIdx(BOT_LINES[key].he.length)}`, vars, delay: Math.round(delay), fx };
}

// נקרא אחרי כל מהלך. before = מה היה לפני המהלך
export function botBanter(pub: Pub, before: { phase: string; logLen: number }, now: number): BotSay | null {
  if (now - (pub.botTalkAt ?? 0) < GAP_MS) return null;
  if (!pub.players.some((p) => !p.isBot)) return null;
  const out = (pub.kind === 'holdem' ? holdemTalk(pub, before) : blackjackTalk(pub, before)) ?? grannyIdle(pub, before);
  if (out) pub.botTalkAt = now;
  return out;
}

// סבתא של תמיר זורקת סתם משפט של החבורה בסוף יד (בערך פעם ב-8 ידיים), אם אף אחד לא דיבר
function grannyIdle(pub: Pub, before: { phase: string }): BotSay | null {
  const g = pub.players.find((p) => isGranny(p.id));
  if (!g || Math.random() >= 0.07 * talky(g.id)) return null;
  if (pub.kind === 'holdem') {
    if (pub.phase !== 'showdown' || before.phase === 'showdown') return null;
    const ro = pub.runout && pub.runout.hand === pub.handNo ? pub.runout : null;
    return say(g.id, g.name, 'idle', (ro ? runoutMs(ro.from) : 0) + 1800 + Math.random() * 1200);
  }
  if (pub.phase !== 'results' || before.phase === 'results') return null;
  return say(g.id, g.name, 'idle', 2800 + Math.random() * 1000);
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
