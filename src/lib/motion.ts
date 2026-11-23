// תנועה בסגנון קזינו: מספרים שרצים, ז׳טונים שעפים בין מקומות, פרץ ז׳טונים בניצחון.
// הכל רק transform/opacity (חלק גם בטלפון חלש), ומכבד "הפחתת תנועה" של הטלפון.
import { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// עקומת האטה אחידה לכל התנועות - מהיר בהתחלה ונוחת רך
export const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)';

// מספר שרץ לערך החדש (כמו מונה בקזינו)
export function useTween(value: number, ms = 450): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);
  useEffect(() => {
    if (reducedMotion() || Math.abs(value - from.current) < 1) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (value - a) * e);
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else from.current = value;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf.current);
      from.current = value;
    };
  }, [value, ms]);
  return shown;
}

// שכבה שקופה מעל הכל, שבה עפים הז׳טונים
function layer(): HTMLElement {
  let el = document.getElementById('kj-motion');
  if (!el) {
    el = document.createElement('div');
    el.id = 'kj-motion';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// ז׳טונים עפים ממקום למקום בקשת קלה. color = צבע הז׳טון, או clone = העתק של אלמנט קיים (למשל הז׳טון שנלחץ)
export function flyChips(
  from: Element | null,
  to: Element | null,
  opts: { count?: number; color?: string; clone?: Element; delay?: number; stagger?: number; ms?: number; size?: number } = {},
) {
  if (!from || !to || reducedMotion()) return;
  const a = center(from.getBoundingClientRect());
  const b = center(to.getBoundingClientRect());
  const { count = 1, color = '#c9a24a', delay = 0, stagger = 55, ms = 520, size = 20 } = opts;
  const host = layer();
  for (let i = 0; i < count; i++) {
    const chip = opts.clone ? (opts.clone.cloneNode(true) as HTMLElement) : document.createElement('span');
    if (!opts.clone) {
      chip.className = 'kj-chip';
      chip.style.setProperty('--c', color);
    } else {
      chip.classList.add('kj-clone');
    }
    const w = opts.clone ? (opts.clone as HTMLElement).offsetWidth : size;
    const h = opts.clone ? (opts.clone as HTMLElement).offsetHeight : size;
    chip.style.width = `${w}px`;
    chip.style.height = `${h}px`;
    chip.style.left = `${a.x - w / 2}px`;
    chip.style.top = `${a.y - h / 2}px`;
    host.appendChild(chip);
    const jx = (Math.random() - 0.5) * 14;
    const jy = (Math.random() - 0.5) * 10;
    const dx = b.x - a.x + jx;
    const dy = b.y - a.y + jy;
    const lift = Math.min(70, Math.hypot(dx, dy) * 0.25);
    const end = opts.clone ? 0.45 : 0.85;
    const anim = chip.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${opts.clone ? 0.8 : 1.08})`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${end})`, opacity: 0.9 },
      ],
      { duration: ms, delay: delay + i * stagger, easing: 'cubic-bezier(.3,.6,.25,1)', fill: 'both' },
    );
    anim.onfinish = () => chip.remove();
    anim.oncancel = () => chip.remove();
  }
}

// פרץ ז׳טונים סביב אלמנט (ניצחון שלי)
export function chipBurst(at: Element | null, opts: { count?: number; delay?: number } = {}) {
  if (!at || reducedMotion()) return;
  const c = center(at.getBoundingClientRect());
  const { count = 12, delay = 0 } = opts;
  const host = layer();
  const colors = ['#c9a24a', '#e8c97a', '#2e8b57', '#b3452f', '#f3ede0'];
  for (let i = 0; i < count; i++) {
    const chip = document.createElement('span');
    chip.className = 'kj-chip';
    chip.style.setProperty('--c', colors[i % colors.length]);
    const s = 14 + Math.random() * 6;
    chip.style.width = chip.style.height = `${s}px`;
    chip.style.left = `${c.x - s / 2}px`;
    chip.style.top = `${c.y - s / 2}px`;
    host.appendChild(chip);
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const r = 60 + Math.random() * 45;
    const dx = Math.cos(ang) * r;
    const dy = Math.sin(ang) * r - 20;
    const anim = chip.animate(
      [
        { transform: 'translate(0,0) scale(.4)', opacity: 0 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) scale(1.1)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px, ${dy + 40}px) scale(.8)`, opacity: 0 },
      ],
      { duration: 900, delay: delay + i * 18, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' },
    );
    anim.onfinish = () => chip.remove();
  }
}
