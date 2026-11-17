// עברית / English - כל טקסט באפליקציה נכתב כ-tr('עברית', 'English')
import { useSyncExternalStore } from 'react';

export type Lang = 'he' | 'en';

let lang: Lang = (localStorage.getItem('lang') as Lang) || 'he';
const subs = new Set<() => void>();

function apply() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}
apply();

export function setLang(l: Lang) {
  lang = l;
  localStorage.setItem('lang', l);
  apply();
  subs.forEach((f) => f());
}

export function getLang(): Lang {
  return lang;
}

// לשימוש מחוץ לקומפוננטות
export function tr(he: string, en: string): string {
  return lang === 'he' ? he : en;
}

export function useI18n() {
  const l = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
  return { lang: l, tr: (he: string, en: string) => (l === 'he' ? he : en), setLang };
}

// הודעות שגיאה מהשרת מגיעות בעברית - מתרגמים לאנגלית
const ERRORS: Record<string, string> = {
  'השולחן מלא (10 שחקנים) - פתחו שולחן נוסף': 'Table is full (10 players) - open another table',
  'סכום קנייה לא תקין': 'Invalid buy-in amount',
  'לא נמצא שחקן': 'Player not found',
  'סכום לא תקין': 'Invalid amount',
  'אי אפשר להמר עכשיו': "Can't bet right now",
  'אתה לא בשולחן': "You're not at this table",
  'הבנק לא מהמר': "The bank doesn't bet",
  'אין מספיק ז׳טונים': 'Not enough chips',
  'כבר מחלקים': 'Already dealing',
  'רק המארח יכול לחלק': 'Only the host can deal',
  'זה לא הזמן': 'Not now',
  'זה לא התור שלך': "It's not your turn",
  'אין תור פעיל': 'No active turn',
  'הזמן עוד לא נגמר': "Time isn't up yet",
  'הסיבוב עוד לא נגמר': "The round isn't over yet",
  'רק המארח': 'Host only',
  'חכו לסוף הסיבוב': 'Wait for the round to end',
  'בשולחן הזה המחשב הוא הדילר': 'At this table the computer is the dealer',
  'לא נמצא': 'Not found',
  'בוט לא יכול להיות בנק': "A bot can't be the bank",
  'מהלך לא מוכר': 'Unknown move',
  'אף אחד לא הימר': 'Nobody placed a bet',
  'אי אפשר להכפיל': "Can't double",
  'אי אפשר לפצל': "Can't split",
  'יד כבר רצה': 'A hand is already running',
  'היד עוד לא נגמרה': "The hand isn't over yet",
  'לא בשולחן': 'Not at the table',
  'אין יד פעילה': 'No active hand',
  'אי אפשר צ׳ק - יש הימור': "Can't check - there's a bet",
  'אין מה להשוות': 'Nothing to call',
  'ההעלאה חייבת להיות גבוהה מההימור הנוכחי': 'A raise must be higher than the current bet',
  'הודעה ריקה': 'Empty message',
  'רק המארח יכול להוסיף בוטים': 'Only the host can add bots',
  'אין עוד בוטים פנויים': 'No more bots available',
  'בוט לא נמצא': 'Bot not found',
  'רק המארח יכול לסגור את השולחן': 'Only the host can close the table',
  'צריך להתחבר': 'Please log in',
  'צריך להגדיר שם קודם': 'Please set up your name first',
  'נסה שוב': 'Please try again',
  'לא נמצא שולחן פתוח עם הקוד הזה': 'No open table with this code',
  'השולחן לא נמצא': 'Table not found',
  'השולחן נסגר': 'The table is closed',
  'פעולה לא מוכרת': 'Unknown action',
  'עומס - נסה שוב': 'Busy - please try again',
  'שגיאת שרת': 'Server error',
  'שם בין 2 ל-16 תווים': 'Name must be 2-16 characters',
  'סיסמה של 4 תווים לפחות': 'Password must be at least 4 characters',
  'השם הזה תפוס, או שהסיסמה שגויה': 'This name is taken, or the password is wrong',
  'השם הזה תפוס': 'This name is taken',
  'צריך לשבת בשולחן כדי להזמין': 'You need to sit at the table to invite',
  'לא נבחרו חברים': 'No friends selected',
};

export function translateError(msg: string): string {
  if (lang === 'he') return msg;
  if (ERRORS[msg]) return ERRORS[msg];
  let m = msg.match(/^הימור בין (\d+) ל-(\d+)$/);
  if (m) return `Bet must be between ${m[1]} and ${m[2]}`;
  m = msg.match(/^העלאה מינימלית ל-(\d+)$/);
  if (m) return `Minimum raise is to ${m[1]}`;
  return msg;
}
