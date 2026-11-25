// תמונת "סיכום הערב" לשיתוף בוואטסאפ (1080x1350) - נמשכת בטלפון, בלי שרת
import type { NightStats } from './nightStats';
import { durationText } from './nightStats';
import type { Lang } from './i18n';
import { handName } from './display';
import { fmt, signed } from './balances';

const W = 1080;
const H = 1350;
const BRASS = '#C9A24A';
const BRASS_HI = '#E4C57A';
const IVORY = '#F3EDE0';
const SANS = "'Rubik', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const NUM = "'Barlow Condensed', 'Rubik', 'Arial Narrow', system-ui, sans-serif";

type Opt = { size: number; weight?: number; color?: string; align?: CanvasTextAlign; dir?: CanvasDirection; font?: string; max?: number };

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, o: Opt) {
  let size = o.size;
  const set = () => (ctx.font = `${o.weight ?? 600} ${size}px ${o.font ?? SANS}`);
  set();
  if (o.max) while (size > o.size * 0.55 && ctx.measureText(s).width > o.max) {
    size -= 2;
    set();
  }
  ctx.fillStyle = o.color ?? IVORY;
  ctx.textAlign = o.align ?? 'center';
  ctx.direction = o.dir ?? 'inherit';
  ctx.fillText(s, x, y);
}

function crown(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number) {
  const h = w * 0.62;
  const g = ctx.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  g.addColorStop(0, BRASS_HI);
  g.addColorStop(1, '#9C7A2E');
  ctx.fillStyle = g;
  ctx.beginPath();
  const l = cx - w / 2;
  const r = cx + w / 2;
  const top = cy - h / 2;
  const base = cy + h / 2;
  ctx.moveTo(l, base);
  ctx.lineTo(l, top + h * 0.25);
  ctx.lineTo(cx - w * 0.25, top + h * 0.55);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + w * 0.25, top + h * 0.55);
  ctx.lineTo(r, top + h * 0.25);
  ctx.lineTo(r, base);
  ctx.closePath();
  ctx.fill();
  for (const [x, y] of [
    [l, top + h * 0.22],
    [cx, top - 4],
    [r, top + h * 0.22],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, w * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function drawNightCard(st: NightStats, roomName: string, lang: Lang): Promise<Blob> {
  const he = lang === 'he';
  const dir: CanvasDirection = he ? 'rtl' : 'ltr';
  // הגופנים של האפליקציה חייבים להיטען לפני שמציירים
  await Promise.all(['500 30px Rubik', '600 30px Rubik', '700 30px Rubik', '800 30px Rubik', '700 30px "Barlow Condensed"'].map((f) => document.fonts.load(f, 'אבג 123'))).catch(() => {});
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;

  // לבד ירוק עם מסגרת פליז
  const bg = ctx.createRadialGradient(W / 2, 420, 60, W / 2, 520, 1050);
  bg.addColorStop(0, '#1a5a40');
  bg.addColorStop(0.55, '#0c2d20');
  bg.addColorStop(1, '#061510');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BRASS;
  ctx.lineWidth = 3;
  round(ctx, 34, 34, W - 68, H - 68, 44);
  ctx.stroke();
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1.5;
  round(ctx, 50, 50, W - 100, H - 100, 34);
  ctx.stroke();
  ctx.globalAlpha = 1;

  text(ctx, 'KING JACK', W / 2, 128, { size: 34, weight: 800, color: BRASS, font: SANS });
  text(ctx, roomName, W / 2, 196, { size: 52, weight: 700, dir: 'inherit', max: 820 });
  const date = st.startedAt ? new Date(st.startedAt).toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const meta = [date, he ? `${st.hands} ידיים` : `${st.hands} hands`, st.minutes ? durationText(st.minutes, lang) : ''].filter(Boolean).join('   ');
  text(ctx, meta, W / 2, 246, { size: 28, weight: 500, color: 'rgba(243,237,224,0.62)', dir, max: 860 });

  ctx.fillStyle = 'rgba(201,162,74,0.35)';
  ctx.fillRect(150, 290, W - 300, 2);

  if (st.king) {
    crown(ctx, W / 2, 372, 120);
    text(ctx, he ? 'מלך הערב' : 'King of the night', W / 2, 482, { size: 38, weight: 600, color: BRASS_HI, dir });
    text(ctx, st.king.name, W / 2, 590, { size: 104, weight: 800, dir: 'inherit', max: 880 });
    text(ctx, '+' + fmt(st.king.net), W / 2, 712, { size: 128, weight: 800, color: BRASS_HI, font: NUM, dir: 'ltr' });
  } else {
    text(ctx, he ? 'ערב שוויוני' : 'An even night', W / 2, 520, { size: 84, weight: 800, dir });
    text(ctx, he ? 'אף אחד לא יצא ברווח' : 'Nobody finished ahead', W / 2, 600, { size: 36, weight: 500, color: 'rgba(243,237,224,0.7)', dir });
  }

  // הדירוג: עד 4 שורות
  const rows = st.lines.slice(0, 4);
  const nameX = he ? W - 160 : 160;
  const numX = he ? 160 : W - 160;
  let y = 812;
  rows.forEach((l, i) => {
    ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.14)' : 'rgba(0,0,0,0.24)';
    round(ctx, 120, y - 46, W - 240, 64, 16);
    ctx.fill();
    text(ctx, String(i + 1), he ? W - 150 : 150, y, { size: 34, weight: 700, color: BRASS, font: NUM, align: 'center', dir: 'ltr' });
    text(ctx, l.name, he ? nameX - 40 : nameX + 40, y, { size: 38, weight: 600, align: he ? 'right' : 'left', dir: 'inherit', max: 520 });
    text(ctx, signed(l.net).replace(/[⁦-⁩]/g, ''), numX, y, { size: 42, weight: 700, font: NUM, align: he ? 'left' : 'right', dir: 'ltr', color: l.net > 0 ? '#8ff0b6' : l.net < 0 ? '#ff9c8a' : IVORY });
    y += 70;
  });

  // שתי עובדות בתחתית
  const facts: { label: string; value: string; sub: string }[] = [];
  if (st.biggest)
    facts.push({ label: he ? 'הקופה הגדולה' : 'Biggest pot', value: fmt(st.biggest.amount), sub: st.biggest.name + (st.biggest.cat != null ? ` (${handName(st.biggest.cat, lang)})` : '') });
  if (st.best) facts.push({ label: he ? 'היד הכי חזקה' : 'Best hand', value: handName(st.best.cat, lang), sub: st.best.name });
  else if (st.blackjacks) facts.push({ label: he ? 'הכי הרבה בלאק ג׳ק' : 'Most blackjacks', value: String(st.blackjacks.n), sub: st.blackjacks.name });
  else if (st.mostWins) facts.push({ label: he ? 'הכי הרבה ניצחונות' : 'Most wins', value: String(st.mostWins.n), sub: st.mostWins.name });
  const fy = Math.max(y + 10, 1090);
  const fw = facts.length === 2 ? 400 : 820;
  facts.slice(0, 2).forEach((f, i) => {
    const x = facts.length === 2 ? (he ? W - 130 - fw - i * (fw + 20) : 130 + i * (fw + 20)) : 130;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    round(ctx, x, fy, fw, 150, 22);
    ctx.fill();
    ctx.strokeStyle = 'rgba(201,162,74,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const cx = x + fw / 2;
    text(ctx, f.label, cx, fy + 42, { size: 26, weight: 500, color: 'rgba(243,237,224,0.62)', dir });
    text(ctx, f.value, cx, fy + 92, { size: 44, weight: 800, color: BRASS_HI, dir: 'inherit', max: fw - 40, font: /^[\d,.]+$/.test(f.value) ? NUM : SANS });
    text(ctx, f.sub, cx, fy + 130, { size: 26, weight: 500, dir: 'inherit', max: fw - 40 });
  });

  text(ctx, he ? 'שוחק ב-King Jack' : 'Played on King Jack', W / 2, H - 70, { size: 26, weight: 500, color: 'rgba(243,237,224,0.5)', dir });

  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('canvas'))), 'image/png'));
}
