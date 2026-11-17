// מסך הוראות התקנה - מזהה אוטומטית אייפון או אנדרואיד
import { useEffect, useState } from 'react';
import {
  isIOS,
  isAndroid,
  isIOSSafari,
  isSamsungBrowser,
  isInAppBrowser,
  isStandalone,
  canPromptInstall,
  onInstallChange,
  promptInstall,
} from '../lib/platform';
import { useI18n } from '../lib/i18n';
import { toast } from '../components/ui';

export function Install({ onBack }: { onBack: () => void }) {
  const { tr, lang } = useI18n();
  const [tab, setTab] = useState<'ios' | 'android'>(isIOS ? 'ios' : 'android');
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onInstallChange(() => setCanPrompt(canPromptInstall())), []);
  const installed = isStandalone();

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack}>
          {lang === 'he' ? '➜' : '⬅'}
        </button>
        <h1>{tr('📲 התקנה בטלפון', '📲 Install on your phone')}</h1>
        <span />
      </header>
      <div className="content install">
        {installed ? (
          <div className="ok-banner">{tr('✅ האפליקציה כבר מותקנת אצלך. מעולה!', '✅ The app is already installed. Great!')}</div>
        ) : (
          <p className="hint center">
            {tr(
              'האפליקציה מותקנת ישירות מהדפדפן - בלי חנות אפליקציות, בחינם, ותופסת כמעט אפס מקום. אחרי ההתקנה יהיה לכם אייקון 👑 במסך הבית.',
              "The app installs straight from the browser - no app store, free, and it takes almost no space. After installing you'll have a 👑 icon on your home screen.",
            )}
          </p>
        )}

        <div className="tabs">
          <button className={tab === 'ios' ? 'active' : ''} onClick={() => setTab('ios')}>
            📱 {tr('אייפון', 'iPhone')}
          </button>
          <button className={tab === 'android' ? 'active' : ''} onClick={() => setTab('android')}>
            🤖 {tr('גלקסי / אנדרואיד', 'Galaxy / Android')}
          </button>
        </div>

        {tab === 'ios' ? (
          <div className="steps">
            {isIOS && !isIOSSafari && (
              <div className="warn">
                {tr(
                  '⚠️ נראה שפתחתם לא ב-Safari. באייפון ההתקנה עובדת הכי טוב מ-Safari - העתיקו את הקישור ופתחו אותו שם.',
                  "⚠️ Looks like you're not in Safari. On iPhone, installing works best from Safari - copy the link and open it there.",
                )}
              </div>
            )}
            <Step n={1} icon="🧭" title={tr('פותחים את הקישור ב-Safari', 'Open the link in Safari')}>
              {tr('אם פתחתם מוואטסאפ - לחצו על סמל המצפן 🧭 או על ⋯ ובחרו ״פתח ב-Safari״.', 'If you opened it from WhatsApp - tap the compass 🧭 or ⋯ and choose "Open in Safari".')}
            </Step>
            <Step n={2} icon="⬆️" title={tr('לוחצים על כפתור השיתוף', 'Tap the Share button')}>
              {tr('הריבוע עם החץ למעלה ⬆️ בתחתית המסך. בגרסאות חדשות: לוחצים על ⋯ ואז ״שתף״.', 'The square with the up arrow ⬆️ at the bottom. On newer versions: tap ⋯ then "Share".')}
            </Step>
            <Step n={3} icon="➕" title={tr('בוחרים ״הוסף למסך הבית״', 'Choose "Add to Home Screen"')}>
              {tr('גוללים קצת למטה ברשימה עד שמופיע ״הוסף למסך הבית״.', 'Scroll down the list a bit until you see "Add to Home Screen".')}
            </Step>
            <Step n={4} icon="✅" title={tr('לוחצים ״הוסף״', 'Tap "Add"')}>
              {tr('בפינה העליונה. זהו! האייקון 👑 יופיע במסך הבית.', "In the top corner. That's it! The 👑 icon appears on your home screen.")}
            </Step>
            <Step n={5} icon="🔔" title={tr('פותחים מהאייקון ומאשרים התראות', 'Open from the icon and allow notifications')}>
              {tr(
                'חשוב: באייפון התראות על הזמנות למשחק עובדות רק כשפותחים את האפליקציה מהאייקון במסך הבית.',
                'Important: on iPhone, game invite notifications only work when you open the app from the home screen icon.',
              )}
            </Step>
          </div>
        ) : (
          <div className="steps">
            {canPrompt && (
              <button
                className="btn primary block big"
                onClick={async () => {
                  const ok = await promptInstall();
                  if (ok) toast(tr('הותקן! 🎉', 'Installed! 🎉'), 'win');
                }}
              >
                {tr('📲 התקנה בלחיצה אחת', '📲 One-tap install')}
              </button>
            )}
            {isAndroid && isInAppBrowser && (
              <div className="warn">
                {tr(
                  '⚠️ פתחתם מתוך וואטסאפ. לחצו על ⋮ למעלה ובחרו ״פתח ב-Chrome״ (או בדפדפן של סמסונג).',
                  '⚠️ You opened this inside WhatsApp. Tap ⋮ at the top and choose "Open in Chrome" (or Samsung Internet).',
                )}
              </div>
            )}
            <h3 className="section-title">
              Chrome {!isSamsungBrowser && isAndroid ? tr('(הדפדפן שלך)', '(your browser)') : ''}
            </h3>
            <Step n={1} icon="⋮" title={tr('לוחצים על שלוש הנקודות למעלה', 'Tap the three dots at the top')}>
              {tr('בפינה העליונה של המסך.', 'In the top corner of the screen.')}
            </Step>
            <Step n={2} icon="📲" title={tr('בוחרים ״התקנת אפליקציה״ או ״הוספה למסך הבית״', 'Choose "Install app" or "Add to Home screen"')}>
              {tr('ואז לוחצים ״התקן״. האייקון יופיע במסך הבית ובמגירת האפליקציות.', 'Then tap "Install". The icon appears on your home screen and app drawer.')}
            </Step>
            <h3 className="section-title">
              Samsung Internet {isSamsungBrowser ? tr('(הדפדפן שלך)', '(your browser)') : ''}
            </h3>
            <Step n={1} icon="☰" title={tr('לוחצים על התפריט (שלושה קווים) למטה', 'Tap the menu (three lines) at the bottom')}>
              {tr('בפינה התחתונה של המסך.', 'In the bottom corner of the screen.')}
            </Step>
            <Step n={2} icon="➕" title={tr('בוחרים ״הוסף דף אל״ ← ״מסך הבית״', 'Choose "Add page to" → "Home screen"')}>
              {tr('ולוחצים ״הוסף״.', 'And tap "Add".')}
            </Step>
            <Step n={3} icon="🔔" title={tr('פותחים מהאייקון ומאשרים התראות', 'Open from the icon and allow notifications')}>
              {tr('כך תקבלו התראה כשחבר מזמין אתכם לשולחן.', "That way you'll get notified when a friend invites you to a table.")}
            </Step>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="step">
      <div className="step-num">{n}</div>
      <div className="step-icon">{icon}</div>
      <div className="grow">
        <b>{title}</b>
        <div className="step-text">{children}</div>
      </div>
    </div>
  );
}
