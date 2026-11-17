// צילומי מסך במידות טלפון - לבדיקה ויזואלית
import { chromium } from 'playwright';

const OUT = process.argv[2];
const BASE = 'http://localhost:4173/';
const iphoneUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: iphoneUA });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text()));
const shot = async (n) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot', n);
};

await page.goto(BASE);
await shot('01-login-he');
await page.getByRole('button', { name: 'כבר רשום? כניסה' }).click();
await page.locator('input').nth(0).fill('QA Tester1');
await page.locator('input[type=password]').fill(process.env.QA_PW_A);
await page.getByRole('button', { name: /כניסה/ }).last().click();
await page.waitForSelector('.lobby', { timeout: 15000 });
await shot('02-lobby');

// פתיחת שולחן פוקר עם 3 בוטים דרך המסך
await page.getByRole('button', { name: /פתיחת שולחן/ }).first().click();
await page.getByRole('button', { name: '🎓 אימון (דמו)' }).click();
await page.getByRole('button', { name: '3 🤖' }).click();
await shot('03-create');
await page.getByRole('button', { name: /פתיחת שולחן 🎲/ }).click();
await page.waitForSelector('.hd', { timeout: 20000 });
await shot('04-holdem-waiting');
await page.getByRole('button', { name: /התחל יד/ }).click();
await page.waitForTimeout(2500);
await shot('05-holdem-hand');

// משחקים כמה צעדים: צ׳ק/קול עד הסוף
for (let i = 0; i < 8; i++) {
  const check = page.locator('.btn.act.check, .btn.act.call').first();
  if (await check.isVisible().catch(() => false)) {
    if (i === 1) await shot('06-holdem-myturn');
    await check.click();
    await page.waitForTimeout(1500);
  } else break;
}
await shot('07-holdem-later');
await page.locator('button[aria-label="מאזן"]').click();
await shot('08-settle');
await page.keyboard.press('Escape');
await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
await page.locator('button[aria-label="תפריט"]').click();
await shot('09-menu');
// מעבר לאנגלית + ערכת קריפטו
await page.getByRole('button', { name: 'English' }).click();
await page.getByRole('button', { name: /Crypto/ }).click();
await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
await shot('10-holdem-en-crypto');
// סגירת השולחן
await page.locator('button[aria-label="Menu"]').click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: /End the night/ }).click();
await page.waitForTimeout(2500);
await shot('11-closed-summary');
await page.getByRole('button', { name: 'Back to lobby' }).click();

// בלאק ג׳ק עם בוט, ערכת פוליטיקה בעברית
await page.locator('button[aria-label="Settings"]').click();
await page.getByRole('button', { name: 'עברית' }).click();
await page.getByRole('button', { name: /פוליטיקה/ }).click();
await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });
await page.getByRole('button', { name: /פתיחת שולחן/ }).first().click();
await page.getByRole('button', { name: /בלאק ג׳ק/ }).first().click();
await page.getByRole('button', { name: '🎓 אימון (דמו)' }).click();
await page.getByRole('button', { name: '2 🤖' }).click();
await page.getByRole('button', { name: /פתיחת שולחן 🎲/ }).click();
await page.waitForSelector('.bj', { timeout: 20000 });
await shot('12-bj-betting');
await page.getByRole('button', { name: /הימור/ }).last().click();
await page.waitForTimeout(2500);
await shot('13-bj-playing');
// סוגרים
await page.locator('button[aria-label="תפריט"]').click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: /סיום ערב/ }).click();
await page.waitForTimeout(2000);
await page.getByRole('button', { name: 'חזרה ללובי' }).click();

await page.locator('button[aria-label="סטטיסטיקה"]').click();
await shot('14-stats');
await page.locator('.topbar .icon-btn').first().click();
await page.locator('button[aria-label="הגדרות"]').click();
await page.getByRole('button', { name: /קלאסי/ }).click();
await page.getByRole('button', { name: /הוראות התקנה/ }).click();
await shot('15-install-ios');

await browser.close();
