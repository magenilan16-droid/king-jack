// התראות פוש: רישום ה-Service Worker והרשמה לקבלת התראות
import { supabase } from './supabase';
import { tr } from './i18n';
import { isIOS, isInAppBrowser, isStandalone } from './platform';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

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
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' });
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

const TIMEOUT = Symbol('timeout');
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}

// מחכה ל-Service Worker פעיל (ואם אין רישום - נרשם מחדש)
async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  let reg = await navigator.serviceWorker.getRegistration();
  if (!reg) reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' });
  if (reg.active) return reg;
  return navigator.serviceWorker.ready;
}

function sameKey(sub: PushSubscription, key: Uint8Array) {
  const cur = sub.options?.applicationServerKey;
  if (!cur) return true;
  const a = new Uint8Array(cur);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

// חייב להיקרא מתוך לחיצה של המשתמש. לא זורק שגיאות - מחזיר סטטוס
export async function enablePushFlow(): Promise<{ status: PushStatus; detail?: string }> {
  if (isInAppBrowser) return { status: 'inapp' };
  if (!pushSupported()) return { status: isIOS && !isStandalone() ? 'ios-install' : 'unsupported' };
  if (!VAPID) return { status: 'error', detail: 'missing key' };
  if (Notification.permission === 'denied') return { status: 'denied' };
  try {
    if (Notification.permission !== 'granted') {
      // אם הטלפון לא מציג חלון אישור (למשל כרום במצב "שקט") - לא נתקעים לנצח
      const perm = await withTimeout(Notification.requestPermission(), 15000);
      if (perm === TIMEOUT) return { status: 'timeout' };
      if (perm === 'denied') return { status: 'denied' };
      if (perm !== 'granted') return { status: 'dismissed' };
    }
    const reg = await withTimeout(readyRegistration(), 10000);
    if (reg === TIMEOUT) return { status: 'error', detail: 'service worker not ready' };
    const key = b64ToBytes(VAPID);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) {
      await sub.unsubscribe().catch(() => {});
      sub = null;
    }
    if (!sub) {
      const s = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), 15000);
      if (s === TIMEOUT) return { status: 'error', detail: 'subscribe timeout' };
      sub = s;
    }
    await saveSubscription(sub);
    return { status: 'ok' };
  } catch (e) {
    return { status: 'error', detail: (e as Error)?.message };
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
  if (error) throw new Error(tr('שמירת ההתראות נכשלה', 'Failed to save notification settings'));
}

// ביציאה מהחשבון: המכשיר הזה מפסיק לקבל התראות של המשתמש שיצא
export async function forgetPushOnThisDevice() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.from('game_push_subs').delete().eq('endpoint', sub.endpoint);
  } catch {
    /* ignore */
  }
}

// אם כבר אושר בעבר - מוודא שהמנוי שמור למשתמש הנוכחי
export async function refreshPushIfGranted() {
  if (pushPermission() !== 'granted') return;
  try {
    const reg = await withTimeout(readyRegistration(), 10000);
    if (reg === TIMEOUT) return;
    const sub = await reg.pushManager.getSubscription();
    if (sub && sameKey(sub, b64ToBytes(VAPID))) await saveSubscription(sub);
    else await enablePushFlow();
  } catch {
    /* ignore */
  }
}
