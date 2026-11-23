// מסך הוראות התקנה - מזהה אוטומטית אייפון או אנדרואיד
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Download, CheckCircle2 } from 'lucide-react';
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
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={tr('חזרה', 'Back')}>
          <Back size={22} />
        </button>
        <h1>{tr('התקנה בטלפון', 'Install on your phone')}</h1>
      </header>
      <div className="content install">
        {installed ? (
          <div className="ok-banner row gap">
            <CheckCircle2 size={18} /> {tr('האפליקציה כבר מותקנת בטלפון הזה.', 'The app is already installed on this phone.')}
          </div>
        ) : (
          <p className="hint">
            {tr(
              'ההתקנה היא ישירות מהדפדפן: בלי חנות אפליקציות, בחינם, וכמעט בלי מקום בטלפון. בסוף יופיע האייקון של King Jack במסך הבית.',
              'It installs straight from the browser: no app store, free, and almost no space. You end up with a King Jack icon on your home screen.',
            )}
          </p>
        )}

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'ios'} className={tab === 'ios' ? 'active' : ''} onClick={() => setTab('ios')}>
            {tr('אייפון', 'iPhone')}
          </button>
          <button role="tab" aria-selected={tab === 'android'} className={tab === 'android' ? 'active' : ''} onClick={() => setTab('android')}>
            {tr('גלקסי ואנדרואיד', 'Galaxy & Android')}
          </button>
        </div>

        {tab === 'ios' ? (
          <>
            {isIOS && !isIOSSafari && (
              <div className="warn">
                {tr(
                  'נראה שפתחתם לא ב-Safari. באייפון ההתקנה עובדת מ-Safari: העתיקו את הקישור ופתחו אותו שם.',
                  "Looks like you're not in Safari. On iPhone, installing works from Safari: copy the link and open it there.",
                )}
              </div>
            )}
            <div className="steps">
              <Step n={1} title={tr('פותחים את הקישור ב-Safari', 'Open the link in Safari')}>
                {tr('אם פתחתם מוואטסאפ: לוחצים על סמל המצפן או על ⋯ ובוחרים ״פתח ב-Safari״.', 'If you opened it from WhatsApp: tap the compass or ⋯ and choose "Open in Safari".')}
              </Step>
              <Step n={2} title={tr('לוחצים על כפתור השיתוף', 'Tap the Share button')}>
                {tr('הריבוע עם החץ למעלה, בתחתית המסך. בגרסאות חדשות: ⋯ ואז ״שתף״.', 'The square with the up arrow at the bottom. On newer versions: ⋯ then "Share".')}
              </Step>
              <Step n={3} title={tr('בוחרים ״הוסף למסך הבית״', 'Choose "Add to Home Screen"')}>
                {tr('גוללים קצת למטה ברשימה עד שמופיע ״הוסף למסך הבית״.', 'Scroll down the list a bit until you see "Add to Home Screen".')}
              </Step>
              <Step n={4} title={tr('לוחצים ״הוסף״', 'Tap "Add"')}>
                {tr('בפינה העליונה. האייקון יופיע במסך הבית.', 'In the top corner. The icon appears on your home screen.')}
              </Step>
              <Step n={5} title={tr('פותחים מהאייקון ומאשרים התראות', 'Open from the icon and allow notifications')}>
                {tr(
                  'באייפון התראות על הזמנות ותורות עובדות רק כשפותחים את האפליקציה מהאייקון במסך הבית.',
                  'On iPhone, invite and turn notifications only work when you open the app from the home screen icon.',
                )}
              </Step>
            </div>
          </>
        ) : (
          <>
            {canPrompt && (
              <button
                className="btn primary block big"
                onClick={async () => {
                  const ok = await promptInstall();
                  if (ok) toast(tr('האפליקציה הותקנה', 'App installed'), 'win');
                }}
              >
                <Download size={19} /> {tr('התקנה בלחיצה אחת', 'One-tap install')}
              </button>
            )}
            {isAndroid && isInAppBrowser && (
              <div className="warn">
                {tr(
                  'פתחתם מתוך וואטסאפ. לוחצים על ⋮ למעלה ובוחרים ״פתח ב-Chrome״ (או בדפדפן של סמסונג).',
                  'You opened this inside WhatsApp. Tap ⋮ at the top and choose "Open in Chrome" (or Samsung Internet).',
                )}
              </div>
            )}
            <h3 className="section-title">
              Chrome {!isSamsungBrowser && isAndroid ? tr('(הדפדפן שלך)', '(your browser)') : ''}
            </h3>
            <div className="steps">
              <Step n={1} title={tr('לוחצים על ⋮ למעלה', 'Tap ⋮ at the top')}>
                {tr('שלוש הנקודות בפינה העליונה של המסך.', 'The three dots in the top corner of the screen.')}
              </Step>
              <Step n={2} title={tr('בוחרים ״התקנת אפליקציה״', 'Choose "Install app"')}>
                {tr('או ״הוספה למסך הבית״, ואז ״התקן״. האייקון יופיע במסך הבית.', 'Or "Add to Home screen", then "Install". The icon appears on your home screen.')}
              </Step>
            </div>
            <h3 className="section-title">
              Samsung Internet {isSamsungBrowser ? tr('(הדפדפן שלך)', '(your browser)') : ''}
            </h3>
            <div className="steps">
              <Step n={1} title={tr('לוחצים על התפריט למטה', 'Tap the menu at the bottom')}>
                {tr('שלושת הקווים בפינה התחתונה.', 'The three lines in the bottom corner.')}
              </Step>
              <Step n={2} title={tr('בוחרים ״הוסף דף אל״ ואז ״מסך הבית״', 'Choose "Add page to", then "Home screen"')}>
                {tr('ולוחצים ״הוסף״.', 'And tap "Add".')}
              </Step>
              <Step n={3} title={tr('פותחים מהאייקון ומאשרים התראות', 'Open from the icon and allow notifications')}>
                {tr('כך תקבלו התראה כשחבר מזמין אתכם לשולחן.', "That way you'll get notified when a friend invites you to a table.")}
              </Step>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="step">
      <div className="step-num">{n}</div>
      <div className="grow">
        <b>{title}</b>
        <div className="step-text">{children}</div>
      </div>
    </div>
  );
}
