// "מה חדש" - נפתח פעם אחת אחרי עדכון גדול, כדי שהחברים יגלו את השדרוגים
import { useState } from 'react';
import { Tv, Share2, Camera, Award, Bot, Eye, Mic, type LucideIcon } from 'lucide-react';
import { Sheet } from './ui';
import { useI18n } from '../lib/i18n';

const KEY = 'kj-news';
const VERSION = '2026-11-27';

// v = באיזה עדכון הפריט נוסף. מי שכבר ראה עדכון קודם רואה רק את מה שנוסף אחריו
const ITEMS: { v: string; icon: LucideIcon; he: string; en: string; heSub: string; enSub: string; photo?: boolean }[] = [
  {
    v: '2026-11-27',
    icon: Mic,
    he: 'הודעות קוליות בשולחן',
    en: 'Voice messages at the table',
    heSub: 'בצ׳אט לוחצים על המיקרופון ומדברים עד 15 שניות. כל השולחן שומע מיד.',
    enSub: 'In the chat, tap the mic and talk for up to 15 seconds. The whole table hears it right away.',
  },
  {
    v: '2026-11-25',
    icon: Tv,
    he: 'אול-אין כמו בטלוויזיה',
    en: 'TV-style all-in',
    heSub: 'כל הקלפים נפתחים, ליד כל שחקן מופיע הסיכוי שלו לנצח, והקלף האחרון יוצא לאט.',
    enSub: 'Every hand is turned up, each player shows their chance to win, and the last card comes slowly.',
  },
  {
    v: '2026-11-25',
    icon: Share2,
    he: 'סיכום ערב לוואטסאפ',
    en: 'Night summary for WhatsApp',
    heSub: 'מלך הערב, הקופה הגדולה והיד הכי חזקה. תמונה אחת שנשלחת לקבוצה.',
    enSub: 'King of the night, the biggest pot and the best hand. One picture for the group.',
  },
  {
    v: '2026-11-25',
    icon: Camera,
    he: 'התמונה שלכם בשולחן',
    en: 'Your photo at the table',
    heSub: 'מעלים תמונה בפרופיל, והחברים רואים את הפרצוף שלכם במקום אימוג׳י.',
    enSub: 'Add a photo in Profile and friends see your face instead of an emoji.',
    photo: true,
  },
  {
    v: '2026-11-25',
    icon: Award,
    he: 'הישגים',
    en: 'Achievements',
    heSub: 'רביעייה, 7-2 מנצח, קופת ענק: חגיגה על כל המסך ואוסף בפרופיל.',
    enSub: 'Four of a kind, a winning 7-2, a monster pot: a full-screen celebration and a collection in Profile.',
  },
  {
    v: '2026-11-25',
    icon: Bot,
    he: 'בוטים חכמים שמדברים',
    en: 'Smarter bots that talk',
    heSub: 'לכל בוט אופי משלו. הם חושבים לפני שהם משחקים, ועוקצים בצ׳אט.',
    enSub: 'Each bot has its own style, thinks before it plays and talks trash in the chat.',
  },
  {
    v: '2026-11-25',
    icon: Eye,
    he: 'מה היה יוצא?',
    en: 'What would have come?',
    heSub: 'כולם קיפלו? לחיצה אחת מראה אילו קלפים היו יוצאים ללוח.',
    enSub: 'Everyone folded? One tap shows which cards would have hit the board.',
  },
];

export function WhatsNew({ onPhoto }: { onPhoto: () => void }) {
  const { tr, lang } = useI18n();
  const [seen] = useState(() => {
    try {
      return localStorage.getItem(KEY) ?? '';
    } catch {
      return VERSION;
    }
  });
  const [open, setOpen] = useState(seen < VERSION);
  const items = ITEMS.filter((it) => it.v > seen);
  const close = () => {
    try {
      localStorage.setItem(KEY, VERSION);
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={tr('מה חדש ב-King Jack', "What's new in King Jack")}
      className="whatsnew"
      footer={
        <button className="btn primary block big" onClick={close}>
          {tr('יאללה לשחק', "Let's play")}
        </button>
      }
    >
      <ul className="wn-list">
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <li key={it.en} style={{ '--i': i } as React.CSSProperties}>
              <span className="wn-ic" aria-hidden="true">
                <Icon size={21} strokeWidth={1.9} />
              </span>
              <div className="grow">
                <b>{lang === 'he' ? it.he : it.en}</b>
                <span>{lang === 'he' ? it.heSub : it.enSub}</span>
                {it.photo && (
                  <button
                    className="wn-link"
                    onClick={() => {
                      close();
                      onPhoto();
                    }}
                  >
                    {tr('להוסיף תמונה עכשיו', 'Add a photo now')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
