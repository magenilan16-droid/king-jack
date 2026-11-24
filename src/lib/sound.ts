// צלילי שולחן ברמת פרימיום: הקלטות אמיתיות של קלפים, ז׳טונים ודפיקות (public/sfx, Kenney CC0),
// ומעליהן מנוע שנותן לכל צליל כיוון (מאיפה שהשחקן יושב), גודל (לפי ההימור) ואקוסטיקה עדינה של חדר קזינו.
import { useSyncExternalStore } from 'react';

// ---------- הגדרות: השתקה ועוצמה ----------
let muted = localStorage.getItem('muted') === '1';
let volume = clamp01(Number(localStorage.getItem('sfx-vol') ?? '0.8'));
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};
function clamp01(n: number) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.8;
}

export function setMuted(m: boolean) {
  muted = m;
  localStorage.setItem('muted', m ? '1' : '0');
  notify();
}
export function useMuted(): [boolean, (m: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => muted), setMuted];
}

// האוזן שומעת עוצמה בצורה לא ליניארית - לכן ריבוע, כדי שהסליידר ירגיש אחיד
const gainOf = (v: number) => v * v * 1.15;
export function setVolume(v: number) {
  volume = clamp01(v);
  localStorage.setItem('sfx-vol', String(volume));
  if (ctx && out) out.gain.setTargetAtTime(gainOf(volume), ctx.currentTime, 0.03);
  notify();
}
export function useVolume(): [number, (v: number) => void] {
  return [useSyncExternalStore(subscribe, () => volume), setVolume];
}

// ---------- ההקלטות ----------
// כמה גרסאות יש מכל צליל ב-public/sfx (deal-1.mp3, deal-2.mp3...) - נוצרות ע״י scripts/make-sfx.mjs
const SOUNDS = {
  deal: 6, // קלף מחליק על הבד
  place: 4, // קלף מונח על השולחן
  fold: 4, // קלפים נדחפים לערימה
  shuffle: 2, // ערבוב (ריפל)
  chip: 3, // ז׳טון בודד מונח
  bet: 4, // ז׳טונים נזרקים ונוקשים זה בזה
  stack: 6, // ערימה מונחת
  handle: 5, // אוספים ערימה ביד
  riffle: 1, // משחקים עם הז׳טונים - "תורך"
  knock: 4, // דפיקה על השולחן
  thud: 2, // פגיעה רכה
  soft: 2, // נגיעה קלה
  glass: 2, // זכוכית
  cash: 1, // שטרות
} as const;
type Name = keyof typeof SOUNDS;

// ---------- שרשרת השמע ----------
// כל צליל -> כיוון -> "אוטובוס" -> (יבש + מעט הד של חדר) -> מדחס -> עוצמה ראשית -> רמקול
let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let out: GainNode | null = null;
function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      const c = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      ctx = c;
      bus = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3.5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      // רמקול של טלפון לא מנגן באסים עמוקים - מורידים אותם כדי שלא "ירעיד" ויעכיר
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 70;
      bus.connect(hp);
      hp.connect(comp);
      // הד קצר של חדר מרופד (שטיח, בד, וילונות) - נותן תחושה של שולחן אמיתי ולא צליל "יבש" באוזן
      const verb = c.createConvolver();
      verb.buffer = roomImpulse(c);
      const send = c.createGain();
      send.gain.value = 0.16;
      hp.connect(send).connect(verb).connect(comp);
      out = c.createGain();
      out.gain.value = gainOf(volume);
      comp.connect(out).connect(c.destination);
      load(c);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// תגובת חדר מלאכותית: רעש שדועך מהר, כהה (בלי גבוהים), קצת שונה בכל אוזן - כמו חדר קטן ומרופד
function roomImpulse(c: AudioContext): AudioBuffer {
  const sr = c.sampleRate;
  const len = Math.floor(sr * 0.8);
  const pre = Math.floor(sr * 0.012);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const x = (Math.random() * 2 - 1) * Math.exp(-t / 0.16);
      y += 0.3 * (x - y); // מסנן פשוט שמעמעם את הגבוהים
      d[i] = y;
    }
  }
  return ir;
}

// טעינה פעם אחת (כ-160KB), מיד אחרי הנגיעה הראשונה במסך
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

// ---------- כיוון: מאיפה הצליל מגיע ----------
// pan: -1 = שמאל, 0 = מרכז, 1 = ימין. מתון בכוונה (עד 0.55) כדי שגם ברמקול אחד הכל יישמע
export function panOf(el: Element | null): number {
  if (!el || typeof window === 'undefined') return 0;
  const r = el.getBoundingClientRect();
  const w = window.innerWidth || 1;
  const x = ((r.left + r.width / 2) / w) * 2 - 1;
  return Math.max(-1, Math.min(1, x)) * 0.55;
}
// הכיוון של מושב שחקן לפי המזהה שלו
export function seatPan(id: string | null | undefined): number {
  if (!id) return 0;
  return panOf(document.querySelector(`[data-pid="${CSS.escape(id)}"]`));
}

const lastPick = new Map<Name, number>();
type PlayOpts = { at?: number; vol?: number; rate?: number; pan?: number; panTo?: number };
// מנגן הקלטה: at = בעוד כמה שניות, vol = עוצמה, rate = מהירות/גובה, pan = כיוון
function play(name: Name, { at = 0, vol = 1, rate = 1, pan = 0, panTo }: PlayOpts = {}) {
  const c = ac();
  const list = bufs.get(name);
  if (!c || !bus || !list?.length) return;
  // גרסה אקראית, אבל לא אותה גרסה פעמיים ברצף
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === lastPick.get(name)) i = (i + 1) % list.length;
  lastPick.set(name, i);
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = list[i];
  src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
  const g = c.createGain();
  g.gain.value = vol * (0.85 + Math.random() * 0.15);
  let node: AudioNode = src.connect(g);
  if (c.createStereoPanner && (pan || panTo != null)) {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(pan, t);
    if (panTo != null) p.pan.linearRampToValueAtTime(panTo, t + list[i].duration);
    node = node.connect(p);
  }
  node.connect(bus);
  src.start(t);
}

// רוח של חפץ שעף באוויר - עוברת מהזורק אל מי שקיבל
let noiseBuf: AudioBuffer | null = null;
function airWhoosh(c: AudioContext, from: number, to: number) {
  if (!bus) return;
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
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  let node: AudioNode = n.connect(f).connect(g);
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(from, t);
    p.pan.linearRampToValueAtTime(to, t + 0.5);
    node = node.connect(p);
  }
  node.connect(bus);
  n.start(t);
  n.stop(t + 0.55);
}

// ---------- הצלילים של השולחן ----------
export const sfx = {
  // קלף מחולק (deal) או מונח פתוח על השולחן (place)
  card(kind: 'deal' | 'place' = 'deal', pan = 0) {
    if (kind === 'place') play('place', { vol: 0.72, pan });
    else play('deal', { vol: 0.6, pan, rate: 1.04 });
  },
  // קלפים נחשפים בסוף היד (מהמושב של השחקן)
  reveal(pan = 0) {
    play('place', { vol: 0.42, rate: 1.22, pan });
    play('place', { at: 0.09, vol: 0.36, rate: 1.3, pan });
  },
  // ערבוב חפיסה בתחילת יד
  shuffle() {
    play('shuffle', { vol: 0.55 });
  },
  // הימור לפי הגודל שלו ביחס לביג בליינד: ז׳טון בודד, כמה ז׳טונים, ערימה, או הר
  bet(amount: number, unit: number, pan = 0) {
    const r = amount / Math.max(1, unit);
    if (r <= 1.5) play('chip', { vol: 0.68, pan });
    else if (r <= 4) {
      play('chip', { vol: 0.62, pan });
      play('bet', { at: 0.06, vol: 0.7, pan });
    } else if (r <= 15) {
      play('bet', { vol: 0.7, pan });
      play('stack', { at: 0.08, vol: 0.55, pan });
    } else {
      play('handle', { vol: 0.6, pan });
      play('bet', { at: 0.16, vol: 0.75, pan });
      play('stack', { at: 0.27, vol: 0.68, pan });
    }
  },
  // כמה ז׳טונים בלי לדעת סכום (בלאק ג׳ק, מגש הז׳טונים)
  chips(count = 3, pan = 0) {
    if (count <= 1) play('chip', { vol: 0.6, pan });
    else play('bet', { vol: 0.7, pan });
    if (count >= 4) play('stack', { at: 0.07, vol: 0.55, pan });
  },
  // סוף סיבוב הימורים: כל הז׳טונים נאספים למרכז
  sweep(players = 2) {
    play('bet', { vol: 0.5 });
    if (players > 2) play('bet', { at: 0.07, vol: 0.4, rate: 1.06 });
    play('stack', { at: 0.14, vol: 0.45 });
  },
  // ערימה נבנית (קנייה, מלך הערב)
  chipStack(pan = 0) {
    play('stack', { vol: 0.7, pan });
    play('stack', { at: 0.1, vol: 0.6, pan });
    play('stack', { at: 0.2, vol: 0.5, pan });
  },
  // צ׳ק: שתי דפיקות על השולחן, מהמושב של מי שעשה צ׳ק
  check(pan = 0) {
    play('knock', { vol: 0.78, pan });
    play('knock', { at: 0.13, vol: 0.62, pan });
  },
  // פולד: הקלפים נזרקים לערימה (של אחרים - קצת יותר שקט)
  fold(pan = 0, mine = false) {
    play('fold', { vol: mine ? 0.62 : 0.42, pan });
  },
  // אול-אין: כל הערימה נדחפת קדימה, עם "משקל"
  allIn(pan = 0) {
    play('handle', { vol: 0.75, pan });
    play('bet', { at: 0.22, vol: 0.82, pan });
    play('stack', { at: 0.34, vol: 0.78, pan });
    play('thud', { at: 0.34, vol: 0.28, rate: 0.7, pan });
    play('bet', { at: 0.46, vol: 0.62, pan });
  },
  // תורך: משחקים עם הז׳טונים
  turn() {
    play('riffle', { vol: 0.85 });
  },
  // השניות האחרונות של התור: נקישה קטנה, קצת יותר חדה בשלוש האחרונות
  tick(urgent = false) {
    play('knock', { vol: urgent ? 0.32 : 0.2, rate: urgent ? 1.95 : 1.7 });
  },
  // ניצחון: הקופה נאספת ונערמת מולך - מתוזמן לרגע שהז׳טונים נוחתים (כשנייה וחצי). קופה גדולה = יותר ערימות
  win(potBB = 10) {
    const stacks = 2 + Math.min(4, Math.floor(potBB / 15));
    play('handle', { at: 0.5, vol: 0.7 });
    for (let k = 0; k < stacks; k++) play('stack', { at: 1.25 + k * 0.12, vol: 0.85 - k * 0.06 });
    play('bet', { at: 1.3 + stacks * 0.12, vol: 0.6 });
  },
  // הפסד: הקלפים שלך נזרקים
  lose() {
    play('fold', { vol: 0.45 });
  },
  // הקופה הולכת לשחקן אחר - נשמע מהמושב שלו
  pot(potBB = 10, pan = 0) {
    const stacks = 1 + Math.min(3, Math.floor(potBB / 20));
    play('handle', { at: 0.5, vol: 0.4, pan });
    for (let k = 0; k < stacks; k++) play('stack', { at: 1.3 + k * 0.13, vol: 0.45 - k * 0.05, pan });
  },
  // הבליינדים עלו: ערימות חדשות על השולחן
  blindsUp() {
    play('handle', { vol: 0.6 });
    play('stack', { at: 0.3, vol: 0.7 });
    play('stack', { at: 0.42, vol: 0.6 });
  },
  // זריקה: רוח באוויר מהזורק למקבל
  whoosh(from = 0, to = 0) {
    const c = ac();
    if (c) airWhoosh(c, from, to);
  },
  // פגיעה, לפי מה שנזרק, במושב של מי שקיבל
  splat(item?: string, pan = 0) {
    if (item === '🍺') play('glass', { vol: 0.7, pan });
    else if (item === '💸') play('cash', { vol: 0.7, pan });
    else if (item === '🌹' || item === '💋' || item === '🧻' || item === '🔥') play('soft', { vol: 0.7, pan });
    else play('thud', { vol: 0.8, pan });
  },
  // אימוג׳י / בקשה קטנה: נקישת ז׳טון קלה
  pop(pan = 0) {
    play('chip', { vol: 0.45, rate: 1.15, pan });
  },
  // זירוז: דפיקות חסרות סבלנות על השולחן
  nudge() {
    play('knock', { vol: 1 });
    play('knock', { at: 0.12, vol: 0.9 });
    play('knock', { at: 0.24, vol: 1 });
  },
};
