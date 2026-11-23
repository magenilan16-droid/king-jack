// הפעלת התראות: מנסה להפעיל, ואם משהו חוסם - מסביר בדיוק מה לעשות בטלפון הזה
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { enablePushFlow, getPushState, markPushUnsaved, pushPermission, refreshPushIfGranted, type PushState, type PushStatus } from '../lib/push';
import { gameCall } from '../lib/supabase';
import { isIOS, isAndroid, isSamsungBrowser } from '../lib/platform';
import { useI18n } from '../lib/i18n';
import { Sheet, toast } from './ui';

export async function sendTestPush(tr: (he: string, en: string) => string) {
  try {
    const r = (await gameCall({ op: 'testPush' })) as { sent?: number; devices?: number };
    if (r?.sent) toast(tr('נשלחה התראת בדיקה. היא אמורה להופיע עכשיו.', 'Test notification sent. It should appear now.'), 'win');
    else if (r?.devices) toast(tr('המכשיר רשום אבל השליחה נכשלה. לחצו שוב על הפעלה.', 'Device is registered but sending failed. Tap turn on again.'), 'error');
    else {
      markPushUnsaved();
      toast(tr('הטלפון הזה עוד לא רשום להתראות. לחצו על הפעלה.', "This phone isn't registered yet. Tap turn on."), 'error');
    }
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

export function usePushSetup(onInstall?: () => void) {
  const { tr } = useI18n();
  const [perm, setPerm] = useState(pushPermission());
  // המצב האמיתי: "on" רק כשיש מנוי פעיל בטלפון הזה
  const [state, setState] = useState<PushState | null>(null);
  const [help, setHelp] = useState<{ status: PushStatus; detail?: string } | null>(null);
  // בזמן הפעלה מהכפתור לא מפעילים במקביל גם מהאירועים
  const running = useRef(false);

  const refresh = useCallback(async () => {
    setPerm(pushPermission());
    setState(await getPushState());
  }, []);
  useEffect(() => {
    refresh();
    // אחרי חזרה מההגדרות של הטלפון
    const sync = async () => {
      if (running.current) return;
      if (pushPermission() === 'granted') {
        const was = await getPushState();
        await refreshPushIfGranted();
        if (was === 'on') return refresh();
        if ((await getPushState()) === 'on') {
          setHelp(null);
          toast(tr('ההתראות פעילות', 'Notifications are on'), 'win');
        }
      }
      refresh();
    };
    const onVis = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVis);
    // אישור שהגיע מאוחר (אחרי שהפסקנו לחכות) - נתפס כאן
    let permStatus: PermissionStatus | null = null;
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((st) => {
        permStatus = st;
        st.onchange = () => sync();
      })
      .catch(() => {});
    // אחרי הכניסה האפליקציה נרשמת בשקט - בודקים שוב בעוד רגע
    const t = setTimeout(refresh, 6000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (permStatus) permStatus.onchange = null;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const run = async () => {
    running.current = true;
    const r = await enablePushFlow().finally(() => (running.current = false));
    await refresh();
    if (r.status === 'ok') {
      setHelp(null);
      toast(tr('ההתראות פעילות', 'Notifications are on'), 'win');
      sendTestPush(tr);
      return;
    }
    setHelp(r);
  };

  const sheet = (
    <PushHelpSheet
      status={help?.status ?? null}
      detail={help?.detail}
      onClose={() => setHelp(null)}
      onRetry={run}
      onInstall={onInstall}
    />
  );
  return { perm, state, on: state === 'on', run, sheet, openHelp: (status: PushStatus) => setHelp({ status }) };
}

const chromeIntent = () => `intent://${location.host}${location.pathname}#Intent;scheme=https;package=com.android.chrome;end`;

function OpenInChrome() {
  const { tr } = useI18n();
  if (!isAndroid) return null;
  return (
    <a className="btn ghost block" href={chromeIntent()}>
      {tr('פתיחה בכרום (הכי אמין בהתראות)', 'Open in Chrome (most reliable)')}
    </a>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="push-steps">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  );
}

function PushHelpSheet({
  status,
  detail,
  onClose,
  onRetry,
  onInstall,
}: {
  status: PushStatus | null;
  detail?: string;
  onClose: () => void;
  onRetry: () => Promise<void>;
  onInstall?: () => void;
}) {
  const { tr } = useI18n();
  const [busy, setBusy] = useState(false);
  if (!status || status === 'ok') return null;
  const retry = async () => {
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };

  let title = '';
  let body: ReactNode = null;
  let canRetry = true;
  if (status === 'ios-install') {
    title = tr('באייפון צריך קודם להתקין', 'On iPhone, install first');
    canRetry = false;
    body = (
      <>
        <p>{tr('אפל מאפשרת התראות רק לאפליקציה שמותקנת במסך הבית.', 'Apple only allows notifications for apps added to the home screen.')}</p>
        <Steps
          items={[
            tr('פתחו את הקישור בספארי (או בכרום של האייפון)', 'Open the link in Safari (or Chrome on iPhone)'),
            tr('כפתור השיתוף, ואז "הוספה למסך הבית"', 'Tap Share, then "Add to Home Screen"'),
            tr('פתחו את King Jack מהאייקון במסך הבית', 'Open King Jack from the home screen icon'),
            tr('הפעילו התראות מהלובי או מהפרופיל', 'Turn on notifications from the lobby or profile'),
          ]}
        />
        {onInstall && (
          <button
            className="btn primary block"
            onClick={() => {
              onClose();
              onInstall();
            }}
          >
            {tr('להוראות ההתקנה', 'Show install steps')}
          </button>
        )}
      </>
    );
  } else if (status === 'inapp') {
    title = tr('פתחו בדפדפן הרגיל', 'Open in your regular browser');
    canRetry = false;
    body = (
      <>
        <p>{tr('הקישור נפתח בתוך וואטסאפ או אפליקציה אחרת, ושם אין התראות.', "The link opened inside WhatsApp or another app, which can't show notifications.")}</p>
        <Steps
          items={
            isIOS
              ? [tr('לחצו על סמל המצפן או "פתח בספארי"', 'Tap the compass icon or "Open in Safari"'), tr('התקינו למסך הבית והפעילו התראות', 'Add to the home screen and turn on notifications')]
              : [tr('לחצו על שלוש הנקודות למעלה', 'Tap the three dots at the top'), tr('בחרו "פתח ב-Chrome"', 'Choose "Open in Chrome"'), tr('הפעילו התראות מהלובי', 'Turn on notifications from the lobby')]
          }
        />
        <button
          className="btn primary block"
          onClick={() => {
            navigator.clipboard?.writeText(location.href).then(
              () => toast(tr('הקישור הועתק', 'Link copied'), 'win'),
              () => {},
            );
          }}
        >
          {tr('העתקת הקישור', 'Copy the link')}
        </button>
      </>
    );
  } else if (status === 'denied') {
    title = tr('ההתראות חסומות בטלפון', 'Notifications are blocked');
    canRetry = false;
    body = (
      <>
        <p>{tr('פעם קודמת נבחר "חסום". משחררים את זה בהגדרות, וזה לוקח חצי דקה:', 'Someone tapped "Block" before. You can undo it in settings in half a minute:')}</p>
        {isSamsungBrowser ? (
          <Steps
            items={[
              tr('בדפדפן סמסונג: תפריט ☰ ואז הגדרות', 'In Samsung Internet: menu ☰, then Settings'),
              tr('אתרים והורדות, ואז הודעות', 'Sites and downloads, then Notifications'),
              tr('מצאו את King Jack (github.io) וסמנו "אפשר"', 'Find King Jack (github.io) and set Allow'),
            ]}
          />
        ) : isIOS ? (
          <Steps
            items={[
              tr('פתחו את ההגדרות של האייפון', 'Open iPhone Settings'),
              tr('התראות, ואז King Jack', 'Notifications, then King Jack'),
              tr('הדליקו את "אפשר התראות"', 'Turn on "Allow Notifications"'),
            ]}
          />
        ) : (
          <Steps
            items={[
              tr('לחיצה ארוכה על האייקון של King Jack, ואז "פרטי אפליקציה" (ⓘ)', 'Long-press the King Jack icon, then "App info" (ⓘ)'),
              tr('התראות, והדליקו', 'Notifications, and turn them on'),
              tr('לא מותקן? בכרום: המנעול ליד הכתובת, הרשאות, התראות, אפשר', 'Not installed? In Chrome: the lock by the address, Permissions, Notifications, Allow'),
            ]}
          />
        )}
        <p className="hint">{tr('אחרי זה חזרו לכאן. ההתראות יופעלו לבד.', 'Then come back here. Notifications turn on by themselves.')}</p>
        <OpenInChrome />
        <button className="btn primary block" onClick={retry} disabled={busy}>
          {busy ? <span className="spinner" /> : tr('בדיקה', 'Check')}
        </button>
      </>
    );
  } else if (status === 'timeout' && isSamsungBrowser) {
    title = tr('הטלפון לא הציג חלון אישור', "Your phone didn't show the prompt");
    body = (
      <>
        <p>{tr('בדפדפן של סמסונג ההתראות לפעמים כבויות מראש. משחררים בשני מקומות:', 'Samsung Internet sometimes has notifications off by default. Two places to check:')}</p>
        <Steps
          items={[
            tr('הגדרות הטלפון, אפליקציות, Samsung Internet, הודעות: להדליק', 'Phone Settings, Apps, Samsung Internet, Notifications: turn on'),
            tr('בדפדפן סמסונג: ☰, הגדרות, אתרים והורדות, הודעות: "אפשר לאתרים לבקש"', 'In Samsung Internet: ☰, Settings, Sites and downloads, Notifications: "Allow sites to ask"'),
            tr('חזרו לכאן. ההתראות יופעלו לבד, או לחצו "נסו שוב"', 'Come back here. Notifications turn on by themselves, or tap "Try again"'),
          ]}
        />
        <OpenInChrome />
      </>
    );
  } else if (status === 'timeout') {
    title = tr('הטלפון לא הציג חלון אישור', "Your phone didn't show the prompt");
    body = (
      <>
        <p>{tr('כרום לפעמים מסתיר את הבקשה. מחפשים פעמון קטן עם קו בשורת הכתובת:', 'Chrome sometimes hides the request. Look for a small crossed-out bell in the address bar:')}</p>
        <Steps
          items={[
            tr('לחצו על הפעמון או על המנעול ליד הכתובת', 'Tap the bell or the lock by the address'),
            tr('התראות, ואז אפשר', 'Notifications, then Allow'),
            tr('חזרו ולחצו "נסו שוב"', 'Come back and tap "Try again"'),
          ]}
        />
      </>
    );
  } else if (status === 'dismissed') {
    title = tr('חלון האישור נסגר', 'The prompt was closed');
    body = <p>{tr('לחצו "נסו שוב" ובחרו "אפשר" בחלון שיופיע.', 'Tap "Try again" and choose "Allow" in the prompt.')}</p>;
  } else if (status === 'unsupported') {
    title = tr('הדפדפן הזה לא תומך בהתראות', "This browser doesn't support notifications");
    canRetry = false;
    body = (
      <p>
        {isIOS
          ? tr('צריך אייפון עם iOS 16.4 ומעלה, והאפליקציה מותקנת במסך הבית.', 'You need iOS 16.4 or later, with the app on your home screen.')
          : tr('פתחו את הקישור ב-Chrome או בדפדפן של סמסונג.', 'Open the link in Chrome or Samsung Internet.')}
      </p>
    );
  } else {
    title = tr('ההפעלה לא הצליחה', "Couldn't turn them on");
    body = (
      <>
        <p>{tr('סגרו את האפליקציה לגמרי, פתחו מחדש ונסו שוב.', 'Close the app completely, reopen it and try again.')}</p>
        {detail && <p className="hint" dir="ltr">{detail}</p>}
        <OpenInChrome />
      </>
    );
  }

  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="push-help">
        {body}
        {canRetry && (
          <button className="btn primary block" onClick={retry} disabled={busy}>
            {busy ? <span className="spinner" /> : tr('נסו שוב', 'Try again')}
          </button>
        )}
      </div>
    </Sheet>
  );
}
