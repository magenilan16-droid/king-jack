// זיהוי סוג המכשיר - כדי להציג הוראות התקנה מתאימות
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

export const isIOS =
  /iphone|ipad|ipod/i.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /android/i.test(ua);
export const isSamsungBrowser = /SamsungBrowser/i.test(ua);
export const isIOSSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA/i.test(ua);
export const isInAppBrowser = /FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)/i.test(ua);

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

// אנדרואיד: הדפדפן נותן "אירוע התקנה" שאפשר להפעיל בלחיצת כפתור
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export function canPromptInstall() {
  return !!deferred;
}

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  deferred = null;
  listeners.forEach((l) => l());
  return choice.outcome === 'accepted';
}
