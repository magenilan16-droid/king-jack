// יוצר את כל האייקונים של האפליקציה ואת תמונת השיתוף מציור אחד (SVG) - בד ירוק, שני קלפי שנהב J ו-K
// הרצה: node scripts/make-icons.mjs            (כותב לתוך public)
//        node scripts/make-icons.mjs <תיקייה>  (תצוגה מקדימה בלי לגעת בקבצים של האפליקציה)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

// הגופנים מוטמעים ישירות (דף ריק לא טוען קבצים מהמחשב)
const font = (p) => 'data:font/woff2;base64,' + readFileSync(`node_modules/@fontsource/${p}`).toString('base64');
const BARLOW = font('barlow-condensed/files/barlow-condensed-latin-700-normal.woff2');
const RUBIK_L = font('rubik/files/rubik-latin-700-normal.woff2');
const RUBIK_H = font('rubik/files/rubik-hebrew-700-normal.woff2');
const RUBIK_L5 = font('rubik/files/rubik-latin-500-normal.woff2');
const RUBIK_H5 = font('rubik/files/rubik-hebrew-500-normal.woff2');

const DEFS = `
  <defs>
    <radialGradient id="felt" cx="50%" cy="34%" r="78%">
      <stop offset="0" stop-color="#1d7d57"/>
      <stop offset="0.55" stop-color="#0e4d36"/>
      <stop offset="1" stop-color="#062619"/>
    </radialGradient>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/>
    </filter>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fbf6ea"/>
      <stop offset="1" stop-color="#ece3cf"/>
    </linearGradient>
  </defs>`;

// שני הקלפים, במרכז ריבוע של 1024
const CARDS = `
    <g transform="rotate(-11 430 760)" filter="url(#shadow)">
      <rect x="250" y="262" width="350" height="490" rx="36" fill="url(#paper)" stroke="#000" stroke-opacity="0.12" stroke-width="3"/>
      <text x="286" y="398" font-family="KJ" font-weight="700" font-size="150" fill="#b3262f">J</text>
      <text x="284" y="478" font-family="Georgia, serif" font-size="80" fill="#b3262f">♥</text>
    </g>
    <g transform="rotate(9 580 770)" filter="url(#shadow)">
      <rect x="404" y="270" width="350" height="490" rx="36" fill="url(#paper)" stroke="#000" stroke-opacity="0.12" stroke-width="3"/>
      <text x="438" y="406" font-family="KJ" font-weight="700" font-size="150" fill="#15130f">K</text>
      <text x="438" y="486" font-family="Georgia, serif" font-size="80" fill="#15130f">♠</text>
      <text x="592" y="672" text-anchor="middle" font-family="Georgia, serif" font-size="260" fill="#15130f">♠</text>
    </g>`;

// scale: כמה מהריבוע הקלפים תופסים (באייקון "maskable" צריך שוליים בטוחים)
const iconSvg = (scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">${DEFS}
  <rect width="1024" height="1024" fill="url(#felt)"/>
  <rect width="1024" height="1024" fill="#fff" filter="url(#grain)"/>
  <ellipse cx="512" cy="540" rx="430" ry="330" fill="none" stroke="#c9a24a" stroke-opacity="0.38" stroke-width="6"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${CARDS}
  </g>
</svg>`;

// תמונת השיתוף (וואטסאפ וכו׳): 1200x630
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">${DEFS}
  <rect width="1200" height="630" fill="url(#felt)"/>
  <rect width="1200" height="630" fill="#fff" filter="url(#grain)"/>
  <ellipse cx="600" cy="330" rx="560" ry="262" fill="none" stroke="#c9a24a" stroke-opacity="0.32" stroke-width="5"/>
  <g transform="translate(70 40) scale(0.56)">${CARDS}
  </g>
  <rect x="0" y="600" width="1200" height="30" fill="#3b2416"/>
  <rect x="0" y="598" width="1200" height="3" fill="#c9a24a" fill-opacity="0.85"/>
</svg>`;

const page = (body, w, h) => `<!doctype html><html><head><style>
@font-face { font-family: KJ; src: url(${BARLOW}) format('woff2'); font-weight: 700; }
@font-face { font-family: RL; src: url(${RUBIK_L}) format('woff2'); font-weight: 700; }
@font-face { font-family: RH; src: url(${RUBIK_H}) format('woff2'); font-weight: 700; }
@font-face { font-family: RL; src: url(${RUBIK_L5}) format('woff2'); font-weight: 500; }
@font-face { font-family: RH; src: url(${RUBIK_H5}) format('woff2'); font-weight: 500; }
html,body{margin:0;background:transparent;width:${w}px;height:${h}px;overflow:hidden}
svg{display:block}
.og{position:relative;width:1200px;height:630px}
.og .txt{position:absolute;top:0;bottom:30px;right:84px;width:560px;display:flex;flex-direction:column;justify-content:center;gap:14px;text-align:right;direction:rtl;font-family:RL,RH,sans-serif}
.og .wm{font-family:RL,RH;font-weight:700;font-size:96px;line-height:1;color:#e8c97a;direction:ltr;text-align:right;letter-spacing:.5px}
.og .he{font-family:RH,RL;font-weight:700;font-size:44px;color:#f3ede0}
.og .en{font-family:RL,RH;font-weight:500;font-size:28px;color:rgba(243,237,224,.7);direction:ltr;text-align:right}
</style></head><body>${body}</body></html>`;

const ogHtml = page(
  `<div class="og">${ogSvg}<div class="txt"><div class="wm">King Jack</div><div class="he">פוקר ובלאק ג׳ק עם החבר׳ה</div><div class="en">Texas Hold'em, Blackjack and settle-up</div></div></div>`,
  1200,
  630,
);

const out = [
  { file: 'public/icons/icon-512.png', size: 512, scale: 1 },
  { file: 'public/icons/icon-192.png', size: 192, scale: 1 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: 0.8 },
  { file: 'public/favicon.png', size: 64, scale: 1.05 },
  // שמות חדשים - כדי שטלפונים יזהו שהאייקון השתנה וימשכו אותו מחדש
  { file: 'public/icons/kj-512.png', size: 512, scale: 1 },
  { file: 'public/icons/kj-192.png', size: 192, scale: 1 },
  { file: 'public/icons/kj-180.png', size: 180, scale: 1 },
  { file: 'public/icons/kj-maskable-512.png', size: 512, scale: 0.8 },
];

const previewDir = process.argv[2];
const dest = (f) => (previewDir ? `${previewDir}/${f.split('/').pop()}` : f);
const browser = await chromium.launch();
async function render(html, w, h, dpr, file) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  await p.screenshot({ path: dest(file) });
  await p.close();
  console.log('wrote', dest(file));
}
for (const o of out) await render(page(iconSvg(o.scale), 1024, 1024), 1024, 1024, o.size / 1024, o.file);
await render(ogHtml, 1200, 630, 1, 'public/og.png');
await browser.close();
