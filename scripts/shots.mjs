// צילומי מסך במידות טלפון - לבדיקה ויזואלית (סיסמת שחקן הבדיקה מגיעה ממשתנה סביבה QA_PW_A)
import { chromium } from 'playwright';

const OUT = process.argv[2];
const BASE = 'http://localhost:4173/';
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
page.on('console', (m) => m.type() === 'error' && !m.text().includes('400') && console.log('CONSOLE:', m.text()));
const shot = async (n, wait = 700) => {
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${n}.png` });
  console.log('shot', n);
};
const sheet = () => page.locator('.sheet');
const closeSheet = () => page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } });

await page.goto(BASE);
await shot('01-login');
await page.locator('.tabs button').nth(1).click();
await page.locator('input').nth(0).fill('QA Tester1');
await page.locator('input[type=password]').fill(process.env.QA_PW_A);
await page.getByRole('button', { name: /כניסה/ }).last().click();
await page.waitForSelector('.lobby', { timeout: 15000 });
await page.waitForTimeout(1500);
const notNow = page.getByRole('button', { name: 'לא עכשיו' });
if (await notNow.isVisible().catch(() => false)) await notNow.click();
await shot('02-lobby', 1200);

// פוקר
await page.locator('.game-tile.holdem').click();
await sheet().getByRole('button', { name: 'אימון', exact: true }).click();
await sheet().getByRole('group', { name: 'בליינדים עולים' }).getByRole('button', { name: '10', exact: true }).click();
await sheet().getByRole('group', { name: 'בוטים' }).getByRole('button', { name: '3', exact: true }).click();
await shot('03-create');
await sheet().locator('.gp.blackjack').click();
await shot('03b-create-bj', 300);
await sheet().locator('.gp.holdem').click();
await sheet().getByRole('button', { name: 'פתיחת שולחן', exact: true }).click();
await page.waitForSelector('.pk-table', { timeout: 20000 });
await shot('04-holdem-waiting', 1500);
await page.getByRole('button', { name: /התחלת יד/ }).click();
await page.waitForTimeout(2500);
let shotTurn = false;
for (let i = 0; i < 12; i++) {
  const b = page.locator('.pk-btnrow.three .pk-btn.call').first();
  if (await b.isVisible().catch(() => false)) {
    if (!shotTurn) { await shot('05-holdem-myturn', 300); shotTurn = true; }
    await b.click();
  }
  await page.waitForTimeout(1500);
  if (await page.locator('.pk-result').isVisible().catch(() => false)) break;
}
await shot('06-holdem-showdown', 400);
// זריקה על חבר
await page.locator('.pk-seat:not(.me)').first().click();
await shot('07-player-menu');
await sheet().getByRole('button', { name: '🍅' }).click();
await shot('08-throw', 420);
await page.waitForTimeout(1500);
await page.locator('button[aria-label="תגובה"]').click();
await sheet().getByRole('button', { name: '😂' }).click();
await shot('09-emote', 400);
await page.waitForTimeout(1500);
await page.locator('button[aria-label="היסטוריה"]').click();
await shot('10-history', 1500);
await closeSheet();
await page.locator('button[aria-label="תפריט"]').click();
await shot('11-menu');
await page.getByRole('button', { name: 'English' }).click();
await page.getByRole('button', { name: /Crypto/ }).click();
await closeSheet();
await shot('12-holdem-en-crypto');
await page.locator('button[aria-label="Menu"]').click();
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: /End the night/ }).click();
await page.waitForTimeout(2500);
await shot('13-closed');
await page.getByRole('tab', { name: 'Hand history' }).click();
await shot('14-closed-history', 1500);
await page.getByRole('button', { name: 'Back to lobby' }).click();

// חזרה לעברית + בלאק ג׳ק
await page.locator('.bottom-nav .nav-item').nth(3).click();
await page.getByRole('button', { name: 'עברית' }).click();
await page.getByRole('button', { name: /קלאסי/ }).click();
await shot('15-profile');
await page.locator('.menu-item', { hasText: 'התראות' }).first().click();
await shot('15b-push-help', 1200);
if (await page.locator('.sheet-backdrop').isVisible().catch(() => false)) await closeSheet();
await page.locator('.bottom-nav .nav-item').nth(0).click();
await page.locator('.game-tile.blackjack').click();
await sheet().getByRole('button', { name: 'אימון', exact: true }).click();
await sheet().getByRole('group', { name: 'בוטים' }).getByRole('button', { name: '2', exact: true }).click();
await sheet().getByRole('button', { name: 'פתיחת שולחן', exact: true }).click();
await page.waitForSelector('.bk-table', { timeout: 20000 });
await shot('16-bj-betting', 1200);
await page.locator('.bk-chip').nth(1).click();
await page.locator('.bk-chip').nth(0).click();
await shot('16b-bj-chips', 300);
await page.locator('.bk-betrow .pk-btn.gold').click();
await shot('17-bj-playing', 2500);
for (let i = 0; i < 8; i++) {
  const st = page.locator('.pk-actions .pk-btn.fold');
  if (await st.isVisible().catch(() => false)) await st.click();
  await page.waitForTimeout(1500);
  if (await page.locator('.bk-net').isVisible().catch(() => false)) break;
}
await shot('17b-bj-result', 500);
await page.locator('button[aria-label="ללובי"]').click();
await page.waitForSelector('.lobby', { timeout: 15000 });
await page.waitForTimeout(1500);
await shot('17c-lobby-tables', 300);
await page.locator('.room-del').first().click();
await shot('17d-remove-sheet', 400);
await sheet().locator('.btn.danger').click();
await page.waitForTimeout(2500);
await shot('17e-lobby-after-remove', 300);
await page.locator('.join-code-btn').click();
await shot('17f-join-code', 500);
await closeSheet();
await page.locator('.bottom-nav .nav-item').nth(1).click();
await shot('18-ranking', 1500);
await page.getByRole('tab', { name: 'שלי' }).click();
await shot('18b-my-stats', 1200);
await page.locator('.bottom-nav .nav-item').nth(2).click();
await shot('19-debts', 2000);
await page.locator('.bottom-nav .nav-item').nth(3).click();
await page.locator('.menu-item', { hasText: 'התקנה בטלפון' }).click();
await shot('20-install', 800);
await page.setViewportSize({ width: 360, height: 640 });
await page.locator('button[aria-label="חזרה"]').click();
await page.locator('.bottom-nav .nav-item').nth(0).click();
await page.waitForTimeout(800);
await shot('21-small-lobby', 600);
await page.locator('.game-tile.holdem').click();
await shot('22-small-create', 600);
await sheet().locator('.gp.blackjack').click();
await shot('23-small-create-bj', 400);
await browser.close();
