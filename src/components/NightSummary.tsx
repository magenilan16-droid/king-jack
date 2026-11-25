// סיכום הערב: המלך, הדירוג, הקופה הגדולה, היד הכי חזקה - ותמונה לשיתוף בקבוצת הוואטסאפ
import { useEffect, useState } from 'react';
import { Crown, Share2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { computeLines, fmt, signed } from '../lib/balances';
import { useI18n, count } from '../lib/i18n';
import { handName } from '../lib/display';
import { nightStats, durationText, type HandRow, type NightStats } from '../lib/nightStats';
import { drawNightCard } from '../lib/shareCard';
import type { LedgerRow, RoomRow } from '../lib/useRoom';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { toast } from './ui';

export function NightSummary({ room, ledger, refreshKey }: { room: RoomRow; ledger: LedgerRow[]; refreshKey?: number | string }) {
  const { tr, lang } = useI18n();
  const [rows, setRows] = useState<HandRow[] | null>(null);
  const [names, setNames] = useState<Record<string, { name: string; avatar: string }>>({});
  const [img, setImg] = useState<Blob | null>(null);
  const idsKey = [...new Set(ledger.map((l) => l.user_id).filter(Boolean))].sort().join(',');

  useEffect(() => {
    supabase
      .from('game_hands')
      .select('hand_no, created_at, data')
      .eq('room_id', room.id)
      .order('hand_no')
      .limit(3000)
      .then(({ data }) => setRows((data ?? []) as HandRow[]));
  }, [room.id, refreshKey]);
  useEffect(() => {
    if (!idsKey) return;
    supabase
      .from('game_profiles')
      .select('id, name, avatar')
      .in('id', idsKey.split(','))
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((p) => [p.id, { name: p.name, avatar: p.avatar }]))));
  }, [idsKey]);

  const st: NightStats | null = rows ? nightStats(computeLines(room, ledger, names).lines, rows, lang) : null;
  // התמונה מוכנה מראש - כדי שהשיתוף ייפתח מיד בלחיצה (אייפון דורש את זה)
  const stKey = st ? JSON.stringify([st.lines.map((l) => [l.name, l.net]), st.hands, st.biggest, st.best?.cat, lang]) : '';
  useEffect(() => {
    if (!st) return;
    let live = true;
    drawNightCard(st, room.name, lang)
      .then((b) => live && setImg(b))
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stKey, room.name]);

  if (!st) return <div className="center pad"><span className="spinner" /></div>;
  if (!st.hands && !st.lines.length) return <div className="empty">{tr('עוד לא שוחקו ידיים בשולחן הזה', 'No hands played at this table yet')}</div>;

  const share = async () => {
    const text = tr(`סיכום הערב ב-King Jack: ${room.name}`, `Tonight on King Jack: ${room.name}`);
    const file = img ? new File([img], 'king-jack-night.png', { type: 'image/png' }) : null;
    try {
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    // בלי שיתוף קבצים (מחשב): מורידים את התמונה ופותחים וואטסאפ עם טקסט
    if (img) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(img);
      a.download = 'king-jack-night.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(tr('התמונה ירדה למכשיר. אפשר לצרף אותה בוואטסאפ.', 'The image was downloaded. Attach it in WhatsApp.'), 'win');
    }
    const lines = st.lines.map((l, i) => `${i + 1}. ${l.name} ${signed(l.net)}`).join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\n\n${lines}`)}`, '_blank', 'noopener');
  };

  const kingAvatar = st.king ? names[st.king.id]?.avatar ?? st.king.avatar : undefined;
  return (
    <div className="ns">
      <div className="ns-hero">
        {st.king ? (
          <>
            <span className="ns-av">
              <Avatar name={st.king.name} emoji={kingAvatar} size={84} />
              <span className="kj-crown ns-crown">
                <Crown size={20} strokeWidth={2.4} />
              </span>
            </span>
            <span className="ns-kicker">{tr('מלך הערב', 'King of the night')}</span>
            <h2 dir="auto">{st.king.name}</h2>
            <b className="ns-amt num" dir="ltr">
              +{fmt(st.king.net)}
            </b>
          </>
        ) : (
          <>
            <span className="ns-kicker">{tr('ערב שוויוני', 'An even night')}</span>
            <h2>{tr('אף אחד לא יצא ברווח', 'Nobody finished ahead')}</h2>
          </>
        )}
        <span className="ns-meta">
          {count(st.hands, 'יד אחת', 'ידיים', '1 hand', 'hands')}
          {st.minutes > 0 && <span>{durationText(st.minutes, lang)}</span>}
        </span>
      </div>

      {st.lines.length > 0 && (
        <ol className="ns-rank">
          {st.lines.map((l, i) => (
            <li key={l.id}>
              <span className="ns-pos num">{i + 1}</span>
              <Avatar name={l.name} emoji={names[l.id]?.avatar ?? l.avatar} size={30} />
              <span className="grow" dir="auto">
                {l.name}
              </span>
              <b className={`num ${l.net > 0 ? 'pos' : l.net < 0 ? 'neg' : ''}`}>{signed(l.net)}</b>
            </li>
          ))}
        </ol>
      )}

      <div className="ns-facts">
        {st.biggest && (
          <div className="ns-fact">
            <span>{tr('הקופה הגדולה', 'Biggest pot')}</span>
            <b className="num">{fmt(st.biggest.amount)}</b>
            <small dir="auto">
              {st.biggest.name}
              {st.biggest.cat != null ? ` (${handName(st.biggest.cat, lang)})` : ''}
            </small>
          </div>
        )}
        {st.best && (
          <div className="ns-fact">
            <span>{tr('היד הכי חזקה', 'Best hand')}</span>
            <b>{handName(st.best.cat, lang)}</b>
            <small dir="auto">{st.best.name}</small>
            <span className="ns-cards">
              {st.best.cards.map((c) => (
                <Card key={c} card={c} size="sm" />
              ))}
            </span>
          </div>
        )}
        {st.mostWins && (
          <div className="ns-fact">
            <span>{tr('הכי הרבה ניצחונות', 'Most wins')}</span>
            <b className="num">{st.mostWins.n}</b>
            <small dir="auto">{st.mostWins.name}</small>
          </div>
        )}
        {st.blackjacks && (
          <div className="ns-fact">
            <span>{tr('מלך הבלאק ג׳ק', 'Blackjack king')}</span>
            <b className="num">{st.blackjacks.n}</b>
            <small dir="auto">{st.blackjacks.name}</small>
          </div>
        )}
        {st.donor && (
          <div className="ns-fact donor">
            <span>{tr('התורם הנדיב של הערב', 'Most generous donor')}</span>
            <b className="num neg">{signed(st.donor.net)}</b>
            <small dir="auto">
              {st.donor.name} {tr('(תודה רבה)', '(thank you)')}
            </small>
          </div>
        )}
      </div>

      <button className="btn whatsapp block big" onClick={share} disabled={!img}>
        <Share2 size={18} /> {tr('שיתוף התמונה בוואטסאפ', 'Share the picture on WhatsApp')}
      </button>
    </div>
  );
}
