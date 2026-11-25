// דיווח תקלות: כשמסך נשבר בטלפון של מישהו - הפרטים נשלחים ליומן של השרת (כדי שאפשר יהיה לתקן)
import { gameCall } from './supabase';

const sent = new Set<string>();

export function reportCrash(err: unknown, where = '') {
  try {
    const e = err as { name?: string; message?: string; stack?: string } | string;
    const msg = typeof e === 'string' ? e : `${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`;
    const key = msg + where.slice(0, 80);
    if (sent.has(key) || sent.size > 8) return;
    sent.add(key);
    const stack = typeof e === 'string' ? '' : (e?.stack ?? '');
    const detail = `${msg}\n${stack.slice(0, 1400)}\n${where.slice(0, 900)}`;
    void gameCall({
      op: 'pushDiag',
      status: 'crash',
      detail,
      standalone: matchMedia('(display-mode: standalone)').matches,
      perm: location.pathname + location.search,
      ua: navigator.userAgent,
    }).catch(() => {});
  } catch {
    /* דיווח לא אמור להפיל כלום */
  }
}

export function installCrashReporter() {
  window.addEventListener('error', (e) => reportCrash(e.error ?? e.message, `${e.filename}:${e.lineno}:${e.colno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string } | undefined;
    // תקלות רשת רגילות לא מעניינות
    if (r?.message && /fetch|network|Failed to|Load failed|abort/i.test(r.message)) return;
    reportCrash(e.reason, 'unhandledrejection');
  });
}
