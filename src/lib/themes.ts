// ערכות נושא - כל שחקן בוחר לעצמו. משנה צבעים, שמות כפתורים ובדיחות (בעברית ובאנגלית)
import type { Lang } from './i18n';

export type ThemeId = 'classic' | 'conspiracy' | 'crypto' | 'politics';

interface ThemeText {
  name: string;
  labels: {
    hit: string;
    stand: string;
    double: string;
    split: string;
    fold: string;
    check: string;
    call: string;
    raise: string;
    allin: string;
    chips: string;
    dealer: string;
  };
  quips: string[];
  win: string[];
  lose: string[];
  quickChat: string[];
}

interface ThemeDef {
  id: ThemeId;
  emoji: string;
  vars: Record<string, string>;
  he: ThemeText;
  en: ThemeText;
}

export type Theme = Omit<ThemeDef, 'he' | 'en'> & ThemeText;

const DEFS: ThemeDef[] = [
  {
    id: 'classic',
    emoji: '🎩',
    vars: { '--felt': '#0f5132', '--felt2': '#0a3a24', '--accent': '#f5c542', '--bg': '#07140e' },
    he: {
      name: 'קלאסי',
      labels: {
        hit: 'קלף',
        stand: 'עומד',
        double: 'דאבל',
        split: 'ספליט',
        fold: 'פולד',
        check: 'צ׳ק',
        call: 'קול',
        raise: 'העלאה',
        allin: 'אול-אין',
        chips: 'ז׳טונים',
        dealer: 'דילר',
      },
      quips: ['בהצלחה לכולם 🍀', 'הבית תמיד מנצח... בדרך כלל', 'מי הביא את הבורקס?', 'King Jack מחלק, אתם רק מתפללים 🙏'],
      win: ['יפה מאוד! 🎉', 'מלך/ת השולחן 👑', 'כסף קל 💸'],
      lose: ['קורה לטובים ביותר', 'בפעם הבאה 🍀', 'אוי'],
      quickChat: ['🔥', '😂', '😱', '👏', 'נייס!', 'בלוף!', 'יאללה מהר', 'GG'],
    },
    en: {
      name: 'Classic',
      labels: {
        hit: 'Hit',
        stand: 'Stand',
        double: 'Double',
        split: 'Split',
        fold: 'Fold',
        check: 'Check',
        call: 'Call',
        raise: 'Raise',
        allin: 'All-in',
        chips: 'chips',
        dealer: 'Dealer',
      },
      quips: ['Good luck everyone 🍀', 'The house always wins... usually', 'Who brought the snacks?', 'King Jack deals, you just pray 🙏'],
      win: ['Nice! 🎉', 'Ruler of the table 👑', 'Easy money 💸'],
      lose: ['Happens to the best', 'Next time 🍀', 'Ouch'],
      quickChat: ['🔥', '😂', '😱', '👏', 'Nice!', 'Bluff!', 'Hurry up', 'GG'],
    },
  },
  {
    id: 'conspiracy',
    emoji: '🛸',
    vars: { '--felt': '#2b1747', '--felt2': '#170a2b', '--accent': '#39ff88', '--bg': '#0b0614' },
    he: {
      name: 'קונספירציה',
      labels: {
        hit: 'תן עוד (הם צופים)',
        stand: 'נשאר בבונקר',
        double: 'כפול - זה מתואם!',
        split: 'פצל סימולציה',
        fold: 'מתקפל - זה ה-5G',
        check: 'צ׳ק... שקט, מאזינים',
        call: 'משווה, לא סומך על אף אחד',
        raise: 'עקבו אחרי הכסף',
        allin: 'הכל על כובע הנייר 🧢',
        chips: 'אסימוני אילומינטי',
        dealer: 'הלטאה 🦎',
      },
      quips: [
        'הדילר הוא לטאה. תסתכלו לו בעיניים 🦎',
        'החפיסה עורבבה ע״י ביל גייטס 💉',
        'הקלפים לא נחתו על הירח 🌙',
        'הבוטים? סוכני מוסד 🕵️',
        'כדור הארץ שטוח, וגם הפוט',
        'למה תמיד יוצא לו אס? תשאלו את המפעילים שלו',
      ],
      win: ['הם נתנו לך לנצח... בינתיים 👁️', 'האמת יצאה לאור!', 'ניצחון מתואם מראש'],
      lose: ['ברור שזה מכור', 'זה היה מתוכנן מ-1947', 'החייזרים לקחו לך את הכסף 👽'],
      quickChat: ['👁️', '🦎', '🛸', '🧢', 'זה מכור!', 'תעשו מחקר', 'הם מקשיבים', 'פייק!'],
    },
    en: {
      name: 'Conspiracy',
      labels: {
        hit: "Hit me (they're watching)",
        stand: 'Stay in the bunker',
        double: "Double - it's coordinated!",
        split: 'Split the simulation',
        fold: "Fold - it's the 5G",
        check: 'Check... shh, they listen',
        call: 'Call, trust no one',
        raise: 'Follow the money',
        allin: 'All on the tinfoil hat 🧢',
        chips: 'Illuminati tokens',
        dealer: 'The Lizard 🦎',
      },
      quips: [
        'The dealer is a lizard. Look into his eyes 🦎',
        'The deck was shuffled by Bill Gates 💉',
        'These cards never landed on the moon 🌙',
        'The bots? Undercover agents 🕵️',
        'The earth is flat, and so is the pot',
        'Why does he always get aces? Ask his handlers',
      ],
      win: ['They let you win... for now 👁️', 'The truth is out!', 'A pre-arranged victory'],
      lose: ["Obviously it's rigged", 'This was planned decades ago', 'Aliens took your money 👽'],
      quickChat: ['👁️', '🦎', '🛸', '🧢', 'Rigged!', 'Do your research', 'They listen', 'Fake!'],
    },
  },
  {
    id: 'crypto',
    emoji: '🚀',
    vars: { '--felt': '#1a1a1a', '--felt2': '#0a0a0a', '--accent': '#f7931a', '--bg': '#000000' },
    he: {
      name: 'קריפטו',
      labels: {
        hit: 'BUY THE DIP',
        stand: 'HODL 💎🙌',
        double: 'LEVERAGE x2',
        split: 'HARD FORK 🍴',
        fold: 'RUG PULL',
        check: 'WAGMI',
        call: 'FOMO IN',
        raise: 'PUMP IT 📈',
        allin: 'TO THE MOON 🚀',
        chips: 'שיטקוינים',
        dealer: 'הבורסה',
      },
      quips: [
        'זה לא ייעוץ השקעות 🙅',
        'הפוט הזה לא מפוקח ע״י רשות ני״ע',
        'קניתי בשיא, מוכר בשפל 📉',
        'האקר צפון קוריאני ראה את הקלפים שלך',
        'מי שלא HODL - בוכה',
        'הארנק שלי ב-cold storage. גם הקלפים',
      ],
      win: ['WAGMI 🚀', 'למבו לירח! 🌕', 'נר ירוק 🟢'],
      lose: ['NGMI 📉', 'חוסלת 😵', 'נר אדום, תחזיק חזק'],
      quickChat: ['🚀', '📉', '💎🙌', '🌕', 'HODL!', 'רגפול!', 'WAGMI', 'NGMI'],
    },
    en: {
      name: 'Crypto',
      labels: {
        hit: 'BUY THE DIP',
        stand: 'HODL 💎🙌',
        double: 'LEVERAGE x2',
        split: 'HARD FORK 🍴',
        fold: 'RUG PULL',
        check: 'WAGMI',
        call: 'FOMO IN',
        raise: 'PUMP IT 📈',
        allin: 'TO THE MOON 🚀',
        chips: 'shitcoins',
        dealer: 'The Exchange',
      },
      quips: [
        'Not financial advice 🙅',
        'This pot is totally unregulated',
        'Bought the top, selling the bottom 📉',
        'A North Korean hacker saw your cards',
        "Those who don't HODL - cry",
        "My wallet's in cold storage. So are my cards",
      ],
      win: ['WAGMI 🚀', 'Lambo to the moon! 🌕', 'Green candle 🟢'],
      lose: ['NGMI 📉', 'Liquidated 😵', 'Red candle, hold tight'],
      quickChat: ['🚀', '📉', '💎🙌', '🌕', 'HODL!', 'Rug pull!', 'WAGMI', 'NGMI'],
    },
  },
  {
    id: 'politics',
    emoji: '🏛️',
    vars: { '--felt': '#0b3d91', '--felt2': '#062659', '--accent': '#ffffff', '--bg': '#030f26' },
    he: {
      name: 'פוליטיקה',
      labels: {
        hit: 'עוד מנדט',
        stand: 'קואליציה יציבה',
        double: 'חוק עוקף בג״ץ',
        split: 'פילוג בסיעה',
        fold: 'מתפטר (בינתיים)',
        check: 'נבחן בוועדה',
        call: 'מצטרף לממשלה',
        raise: 'הולכים לבחירות!',
        allin: 'בחירות שישיות 🗳️',
        chips: 'מנדטים',
        dealer: 'יו״ר הכנסת',
      },
      quips: [
        'אין כלום כי לא היה כלום 🤷',
        'הקלפים נמצאו בתיק 4000 📁',
        'הסיגרים והשמפניה על חשבון הקופה 🍾',
        'ביבי: "זה לא פוקר, זו התקשורת העוינת"',
        'הבוטים? מכונת רעל 🤖',
        'הדילר מינה את אחיו לחשב השולחן',
      ],
      win: ['ניצחון מוחץ! 🏆', 'רוב של 61!', 'המנדטים אמרו את שלהם'],
      lose: ['הבחירות נגנבו!', 'זו תפירת תיקים', 'דורשים ועדת חקירה'],
      quickChat: ['🗳️', '🍾', '📁', '🤷', 'שקר!', 'לבחירות!', 'תפירת תיק', 'אין כלום'],
    },
    en: {
      name: 'Politics',
      labels: {
        hit: 'One more seat',
        stand: 'Stable coalition',
        double: 'Override the court',
        split: 'Party split',
        fold: 'Resign (for now)',
        check: 'Sent to committee',
        call: 'Join the government',
        raise: 'Snap elections!',
        allin: 'Sixth elections 🗳️',
        chips: 'Knesset seats',
        dealer: 'The Speaker',
      },
      quips: [
        "There's nothing because there was nothing 🤷",
        'The cards were found in Case 4000 📁',
        'Cigars and champagne are on the house 🍾',
        'Bibi: "This isn\'t poker, it\'s the hostile media"',
        'The bots? A poison machine 🤖',
        "The dealer appointed his brother as the table's treasurer",
      ],
      win: ['Landslide victory! 🏆', 'A 61-seat majority!', 'The voters have spoken'],
      lose: ['The election was stolen!', "It's a witch hunt", 'Demanding an inquiry committee'],
      quickChat: ['🗳️', '🍾', '📁', '🤷', 'Lies!', 'Elections!', 'Witch hunt', 'Nothing there'],
    },
  },
];

export function getTheme(id: string | null, lang: Lang): Theme {
  const d = DEFS.find((t) => t.id === id) ?? DEFS[0];
  const { he, en, ...rest } = d;
  return { ...rest, ...(lang === 'he' ? he : en) };
}

export function allThemes(lang: Lang): Theme[] {
  return DEFS.map((d) => getTheme(d.id, lang));
}

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const AVATARS = ['🃏', '😎', '🦁', '🐯', '🦊', '🐻', '🐼', '🐸', '👑', '🎩', '🤠', '🧔', '👨‍🦲', '🥷', '🧙', '🦄', '🐙', '🦈'];
