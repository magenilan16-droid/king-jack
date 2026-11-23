// צלילי פוקר שנוצרים בקוד (בלי קבצי שמע): ערבוב, חלוקה, ז׳טונים, אול-אין, ניצחון ועוד
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
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
const out = () => master!;

// דפדפנים בטלפון מאפשרים צליל רק אחרי נגיעה ראשונה במסך
export function unlockAudio() {
  const once = () => {
    ac();
    window.removeEventListener('pointerdown', once);
  };
  window.addEventListener('pointerdown', once);
}

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  return src;
}

// פרץ רעש מסונן (בסיס לקלפים, החלקות ומכות)
function burst(c: AudioContext, t: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass') {
  const n = noise(c);
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f).connect(g).connect(out());
  n.start(t, Math.random() * 0.5);
  n.stop(t + dur + 0.02);
}

function tone(c: AudioContext, freq: number, t: number, dur: number, vol: number, type: OscillatorType = 'sine', slideTo?: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out());
  o.start(t);
  o.stop(t + dur + 0.02);
}

// נקישת ז׳טון קרמי: שני צלילים גבוהים קצרים + מעט רעש
function clink(c: AudioContext, t: number, vol = 0.12) {
  const base = 2400 + Math.random() * 1600;
  tone(c, base, t, 0.05, vol, 'triangle');
  tone(c, base * 1.48, t + 0.003, 0.04, vol * 0.6, 'sine');
  burst(c, t, 0.025, 5000, 2, vol * 0.8);
}

export const sfx = {
  // קלף נשלף ומונח על הלבד
  card() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.07, 2800, 0.9, 0.32);
    burst(c, t + 0.05, 0.04, 900, 1.2, 0.18, 'lowpass');
  },
  // ערבוב חפיסה (ריפל) בתחילת יד
  shuffle() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 18; i++) burst(c, t + i * 0.028 + Math.random() * 0.01, 0.03, 3000 + Math.random() * 1500, 1.5, 0.12 + Math.random() * 0.05);
    burst(c, t + 0.55, 0.09, 700, 1, 0.25, 'lowpass');
  },
  // כמה ז׳טונים נזרקים לקופה
  chips(count = 3) {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < count; i++) clink(c, t + i * (0.035 + Math.random() * 0.03), 0.1 + Math.random() * 0.05);
  },
  // ערימה גדולה (אול-אין / איסוף קופה)
  chipStack() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 12; i++) clink(c, t + i * 0.028 + Math.random() * 0.015, 0.09);
  },
  check() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    // שתי דפיקות על השולחן
    tone(c, 140, t, 0.08, 0.4, 'sine', 90);
    burst(c, t, 0.03, 400, 1, 0.3, 'lowpass');
    tone(c, 130, t + 0.12, 0.08, 0.35, 'sine', 85);
    burst(c, t + 0.12, 0.03, 400, 1, 0.25, 'lowpass');
  },
  fold() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const n = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4000, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.22);
    const g = c.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(f).connect(g).connect(out());
    n.start(t);
    n.stop(t + 0.25);
  },
  allIn() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 110, t, 0.5, 0.3, 'sawtooth', 220);
    tone(c, 220, t + 0.05, 0.45, 0.12, 'square', 440);
    setTimeout(() => sfx.chipStack(), 280);
  },
  turn() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 880, t, 0.18, 0.18);
    tone(c, 1320, t + 0.13, 0.26, 0.16);
  },
  tick() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 1800, t, 0.03, 0.08, 'square');
  },
  win() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, t + i * 0.09, 0.3, 0.16, 'triangle'));
    tone(c, 1568, t + 0.38, 0.5, 0.1, 'sine');
    setTimeout(() => sfx.chipStack(), 200);
  },
  lose() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 392, t, 0.22, 0.14, 'triangle');
    tone(c, 330, t + 0.18, 0.22, 0.12, 'triangle');
    tone(c, 262, t + 0.36, 0.4, 0.12, 'triangle');
  },
  blindsUp() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    [659, 880, 1175].forEach((f, i) => tone(c, f, t + i * 0.1, 0.25, 0.14, 'square'));
  },
  // זריקה: שריקה באוויר
  whoosh() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const n = noise(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3500, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    n.connect(f).connect(g).connect(out());
    n.start(t);
    n.stop(t + 0.55);
  },
  // פגיעה (עגבנייה, בירה...)
  splat() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.18, 500, 0.7, 0.45, 'lowpass');
    tone(c, 180, t, 0.15, 0.25, 'sine', 60);
  },
  pop() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    tone(c, 600, t, 0.08, 0.2, 'sine', 1200);
  },
  // זמזום של זירוז
  nudge() {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) tone(c, 220, t + i * 0.12, 0.08, 0.25, 'square');
  },
};
