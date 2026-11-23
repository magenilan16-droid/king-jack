// התראות פוש: רישום ה-Service Worker והרשמה לקבלת התראות
import { supabase, gameCall } from './supabase';
import { tr } from './i18n';
import { isIOS, isInAppBrowser, isStandalone } from './platform';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;
const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

// הרישום נשמר מראש - כדי שבלחיצה על "הפעלה" אפשר להירשם מיד (אייפון דורש שזה יקרה צמוד ללחיצה)
let swReg: ServiceWorkerRegistration | null = null;

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' });
    swReg = reg;
    navigator.serviceWorker.ready.then((r) => (swReg = r)).catch(() => {});
    // גרסה חדשה השתלטה - מרעננים פעם אחת כדי לטעון אותה
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    // בודקים עדכון כל פעם שחוזרים לאפליקציה
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (e) {
    console.warn('SW failed', e);
  }
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// מה קרה כשניסינו להפעיל התראות - כדי להראות למשתמש בדיוק מה לעשות
export type PushStatus = 'ok' | 'ios-install' | 'inapp' | 'unsupported' | 'denied' | 'dismissed' | 'timeout' | 'error';
// המצב האמיתי במכשיר הזה (לא רק "יש הרשאה" - אלא שיש מנוי פעיל)
export type PushState = 'on' | 'off' | 'denied' | 'install' | 'unsupported';

const TIMEOUT = Symbol('timeout');
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}

// מחכה ל-Service Worker פעיל (ואם אין רישום - נרשם מחדש)
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  if (swReg?.active) return swReg;
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' });
  swReg = reg;
  if (reg.active) return reg;
  return (swReg = await navigator.serviceWorker.ready);
}

function sameKey(sub: PushSubscription, key: Uint8Array) {
  const cur = sub.options?.applicationServerKey;
  if (!cur) return true;
  const a = new Uint8Array(cur);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS && !isStandalone() && !isInAppBrowser ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try {
    const reg = swReg ?? (await navigator.serviceWorker.getRegistration());
    const sub = await reg?.pushManager.getSubscription();
    return sub && sameKey(sub, b64ToBytes(VAPID)) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// דיווח לשרת על כל ניסיון הפעלה - כדי שאפשר יהיה לראות מה קרה בטלפון של כל אחד
function report(status: PushStatus, detail?: string) {
  gameCall({
    op: 'pushDiag',
    status,
    detail: detail?.slice(0, 200),
    standalone: isStandalone(),
    perm: pushPermission(),
    ua: navigator.userAgent.slice(0, 200),
  }).catch(() => {});
}

async function subscribe(reg: ServiceWorkerRegistration, key: Uint8Array<ArrayBuffer>): Promise<PushSubscription> {
  const opts = { userVisibleOnly: true, applicationServerKey: key };
  try {
    // אם כבר יש מנוי עם אותו מפתח - מקבלים אותו בחזרה
    return await reg.pushManager.subscribe(opts);
  } catch (e) {
    // מנוי ישן עם מפתח אחר - מבטלים ונרשמים מחדש
    const old = await reg.pushManager.getSubscription();
    if (!old) throw e;
    await old.unsubscribe().catch(() => {});
    return reg.pushManager.subscribe(opts);
  }
}

// חייב להיקרא ישירות מלחיצה של המשתמש. לא זורק שגיאות - מחזיר סטטוס
export async function enablePushFlow(): Promise<{ status: PushStatus; detail?: string }> {
  const done = (status: PushStatus, detail?: string) => {
    report(status, detail);
    return { status, detail };
  };
  if (isInAppBrowser) return done('inapp');
  if (!pushSupported()) return done(isIOS && !isStandalone() ? 'ios-install' : 'unsupported');
  if (!VAPID) return done('error', 'missing key');
  if (Notification.permission === 'denied') return done('denied');
  const key = b64ToBytes(VAPID);
  try {
    // שום המתנה לפני חלון האישור - אחרת אייפון לא מציג אותו
    if (Notification.permission !== 'granted') {
      const perm = await withTimeout(Notification.requestPermission(), 20000);
      if (perm === TIMEOUT) return done('timeout');
      if (perm === 'denied') return done('denied');
      if (perm !== 'granted') return done('dismissed');
    }
    const reg = swReg?.active ? swReg : await withTimeout(readyRegistration(), 10000);
    if (reg === TIMEOUT) return done('error', 'service worker not ready');
    const sub = await withTimeout(subscribe(reg, key), 20000);
    if (sub === TIMEOUT) return done('error', 'subscribe timeout');
    await saveSubscription(sub);
    return done('ok', new URL(sub.endpoint).host);
  } catch (e) {
    return done('error', `${(e as Error)?.name ?? ''}: ${(e as Error)?.message ?? String(e)}`);
  }
}

// גרסה שזורקת שגיאה (לשימוש פנימי)
export async function enablePush(): Promise<void> {
  const r = await enablePushFlow();
  if (r.status !== 'ok') throw new Error(r.detail || r.status);
}

async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('game_save_push', {
    p_endpoint: j.endpoint,
    p_p256dh: j.keys?.p256dh,
    p_auth: j.keys?.auth,
  });
  if (error) throw new Error(tr('שמירת ההתראות נכשלה', 'Failed to save notification settings') + ` (${error.message})`);
}

// ביציאה מהחשבון: המכשיר הזה מפסיק לקבל התראות של המשתמש שיצא
export async function forgetPushOnThisDevice() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = swReg ?? (await navigator.serviceWorker.getRegistration());
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.from('game_push_subs').delete().eq('endpoint', sub.endpoint);
  } catch {
    /* ignore */
  }
}

// בכל כניסה: אם יש מנוי - מוודאים שהוא שמור למשתמש הנוכחי. אם אין - מנסים בשקט (באנדרואיד זה עובד בלי לחיצה)
export async function refreshPushIfGranted() {
  if (pushPermission() !== 'granted') return;
  try {
    const reg = await withTimeout(readyRegistration(), 10000);
    if (reg === TIMEOUT) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub && sameKey(sub, b64ToBytes(VAPID))) await saveSubscription(sub);
    else if (!isIOS) {
      const s = await withTimeout(subscribe(reg, b64ToBytes(VAPID)), 20000);
      if (s !== TIMEOUT) await saveSubscription(s);
    }
  } catch {
    /* ignore - הכפתור "הפעלה" יופיע */
  }
}
