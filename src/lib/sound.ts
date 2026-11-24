// צלילי שולחן אמיתיים: הקלטות של קלפים, ז׳טונים ודפיקות על השולחן (public/sfx, רישיון CC0 של Kenney).
// כל צליל מגיע בכמה גרסאות ומתנגן עם שינוי קטן בגובה ובעוצמה - כדי ששום קלף לא יישמע בדיוק כמו הקודם.
import { useSyncExternalStore } from 'react';

let muted = localStorage.getItem('muted') === '1';
const subs = new Set<() => void>();

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('muted', m ? '1' : '0');
  subs.forEach((f) => f());
}

export function useMuted(): [boolean, (m: boolean) => void] {
  const m = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => muted,
  );
  return [m, setMuted];
}

// כמה גרסאות יש מכל צליל בתיקייה public/sfx (deal-1.mp3, deal-2.mp3...)
const SOUNDS = {
  deal: 4, // קלף מחליק על הבד
  place: 3, // קלף מונח על השולחן (פלופ, טרן, ריבר)
  fold: 3, // קלפים נדחפים לערימה
  shuffle: 2, // ערבוב (ריפל)
  chip: 3, // ז׳טון בודד מונח
  bet: 3, // ז׳טונים נזרקים ונוקשים זה בזה
  stack: 3, // ערימה מונחת
  handle: 3, // אוספים ערימת ז׳טונים ביד
  riffle: 1, // משחקים עם הז׳טונים - "תורך"
  knock: 3, // דפיקה על השולחן - צ׳ק
  thud: 2, // פגיעה רכה (עגבנייה, ביצה...)
  soft: 2, // נגיעה קלה (ורד, נשיקה...)
  glass: 2, // זכוכית (בירה)
  cash: 1, // שטרות מתעופפים
} as const;
type Name = keyof typeof SOUNDS;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      // מדחס קל - כדי שהצלילים יישמעו "מלאים" ולא יקפצו בעוצמה
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp).connect(ctx.destination);
      load(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
const out = () => master!;

// טעינת ההקלטות פעם אחת (כ-120KB), מיד אחרי הנגיעה הראשונה במסך
const bufs = new Map<Name, AudioBuffer[]>();
function load(c: AudioContext) {
  for (const [name, n] of Object.entries(SOUNDS) as [Name, number][]) {
    for (let i = 1; i <= n; i++) {
      fetch(new URL(`sfx/${name}-${i}.mp3`, document.baseURI))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        // הצורה עם callback עובדת גם בספארי ישן
        .then((a) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(a, res, rej)))
        .then((b) => bufs.set(name, [...(bufs.get(name) ?? []), b]))
        .catch(() => {});
    }
  }
}

// דפדפנים בטלפון מאפשרים צליל רק אחרי נגיעה ראשונה במסך
export function unlockAudio() {
  const once = () => {
    ac();
    window.removeEventListener('pointerdown', once);
  };
  window.addEventListener('pointerdown', once);
}

const lastPick = new Map<Name, number>();
// מנגן הקלטה: at = בעוד כמה שניות, vol = עוצמה, rate = מהירות/גובה
function play(name: Name, at = 0, vol = 1, rate = 1) {
  const c = ac();
  const list = bufs.get(name);
  if (!c || !list?.length) return;
  // גרסה אקראית, אבל לא אותה גרסה פעמיים ברצף
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastPick.get(name)) i = (i + 1) % list.length;
  lastPick.set(name, i);
  const src = c.createBufferSource();
  src.buffer = list[i];
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = c.createGain();
  g.gain.value = vol * (0.85 + Math.random() * 0.15);
  src.connect(g).connect(out());
  src.start(c.currentTime + at);
}

// רוח קלה של חפץ שעף באוויר (רעש מסונן - אין לזה הקלטה)
let noiseBuf: AudioBuffer | null = null;
function airWhoosh(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime;
  const n = c.createBufferSource();
  n.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 2;
  f.frequency.setValueAtTime(500, t);
  f.frequency.exponentialRampToValueAtTime(2200, t + 0.45);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  n.connect(f).connect(g).connect(out());
  n.start(t);
  n.stop(t + 0.55);
}

export const sfx = {
  // קלף מחולק (deal) או מונח פתוח על השולחן (place)
  card(kind: 'deal' | 'place' = 'deal') {
    if (kind === 'place') play('place', 0, 0.75);
    else play('deal', 0, 0.55);
  },
  // ערבוב חפיסה בתחילת יד
  shuffle() {
    play('shuffle', 0, 0.6);
  },
  // ז׳טונים נכנסים לקופה: אחד מונח, כמה נזרקים, הרבה = גם ערימה
  chips(count = 3) {
    if (count <= 1) play('chip', 0, 0.6);
    else play('bet', 0, 0.7);
    if (count >= 4) play('stack', 0.07, 0.55);
  },
  // ערימה נבנית (קנייה, מלך הערב)
  chipStack() {
    play('stack', 0, 0.7);
    play('stack', 0.1, 0.6);
    play('stack', 0.2, 0.5);
  },
  // צ׳ק: שתי דפיקות על השולחן
  check() {
    play('knock', 0, 0.9);
    play('knock', 0.13, 0.75);
  },
  // פולד: הקלפים נזרקים לערימה
  fold() {
    play('fold', 0, 0.6);
  },
  // אול-אין: אוספים את כל הערימה ודוחפים קדימה
  allIn() {
    play('handle', 0, 0.75);
    play('bet', 0.22, 0.8);
    play('stack', 0.34, 0.75);
    play('bet', 0.44, 0.6);
  },
  // תורך: משחקים עם הז׳טונים
  turn() {
    play('riffle', 0, 0.85);
  },
  // השניות האחרונות של התור: נקישה קטנה ושקטה
  tick() {
    play('knock', 0, 0.22, 1.7);
  },
  // ניצחון: הקופה נאספת ונערמת מולך - מתוזמן לרגע שהז׳טונים נוחתים במושב (כשנייה וחצי)
  win() {
    play('handle', 0.5, 0.7);
    play('stack', 1.25, 0.85);
    play('stack', 1.4, 0.75);
    play('bet', 1.55, 0.65);
  },
  // הפסד: הקלפים שלך נזרקים, הז׳טונים עוזבים
  lose() {
    play('fold', 0, 0.45);
    play('bet', 1.25, 0.35);
  },
  // הקופה הולכת לשחקן אחר (כשלא היית ביד)
  pot() {
    play('handle', 0.5, 0.4);
    play('stack', 1.3, 0.4);
  },
  // הבליינדים עלו: ערימות חדשות על השולחן
  blindsUp() {
    play('handle', 0, 0.6);
    play('stack', 0.3, 0.7);
    play('stack', 0.42, 0.6);
  },
  // זריקה: רוח באוויר
  whoosh() {
    const c = ac();
    if (c) airWhoosh(c);
  },
  // פגיעה, לפי מה שנזרק
  splat(item?: string) {
    if (item === '🍺') play('glass', 0, 0.7);
    else if (item === '💸') play('cash', 0, 0.7);
    else if (item === '🌹' || item === '💋' || item === '🧻' || item === '🔥') play('soft', 0, 0.7);
    else play('thud', 0, 0.8);
  },
  // אימוג׳י / בקשה קטנה: נקישת ז׳טון קלה
  pop() {
    play('chip', 0, 0.45, 1.15);
  },
  // זירוז: דפיקות חסרות סבלנות על השולחן
  nudge() {
    play('knock', 0, 1);
    play('knock', 0.12, 0.9);
    play('knock', 0.24, 1);
  },
};
