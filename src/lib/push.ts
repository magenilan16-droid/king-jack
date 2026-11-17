// התראות פוש: רישום ה-Service Worker והרשמה לקבלת התראות
import { supabase } from './supabase';
import { tr } from './i18n';

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
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
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

// חייב להיקרא מתוך לחיצה של המשתמש
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error(tr('המכשיר/הדפדפן לא תומך בהתראות. באייפון - צריך קודם להתקין למסך הבית', 'This device/browser does not support notifications. On iPhone - install to the home screen first'));
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(tr('ההתראות נחסמו. אפשר לאשר בהגדרות הטלפון', 'Notifications are blocked. You can allow them in your phone settings'));
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
  await saveSubscription(sub);
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

// אם כבר אושר בעבר - מוודא שהמנוי שמור למשתמש הנוכחי
export async function refreshPushIfGranted() {
  if (pushPermission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
    else await enablePush();
  } catch {
    /* ignore */
  }
}
