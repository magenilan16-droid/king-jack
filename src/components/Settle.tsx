// מסך מאזן וקיזוז: מי קנה כמה, מי ברווח, ומי מעביר למי
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { computeLines, fmt, signed, KUPA_ID } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import type { LedgerRow, RoomRow } from '../lib/useRoom';

export function Settle({ room, ledger, moneyMode }: { room: RoomRow; ledger: LedgerRow[]; moneyMode: 'real' | 'demo' }) {
  const { tr, lang } = useI18n();
  const [names, setNames] = useState<Record<string, { name: string; avatar: string }>>({});
  const ids = [...new Set(ledger.map((l) => l.user_id).filter(Boolean))] as string[];
  const idsKey = ids.sort().join(',');
  useEffect(() => {
    if (!idsKey) return;
    supabase
      .from('game_profiles')
      .select('id, name, avatar')
      .in('id', idsKey.split(','))
      .then(({ data }) => {
        const m: Record<string, { name: string; avatar: string }> = {};
        for (const p of data ?? []) m[p.id] = { name: p.name, avatar: p.avatar };
        setNames(m);
      });
  }, [idsKey]);

  const { lines, kupa, transfers } = computeLines(room, ledger, names);
  const live = room.status === 'open';
  const arrow = lang === 'he' ? '←' : '→';

  const shareText = () => {
    const head = `👑 King Jack · ${room.name} - ${live ? tr('מצב נוכחי', 'current standings') : tr('סיכום ערב', 'night summary')}${
      moneyMode === 'demo' ? tr(' (אימון)', ' (practice)') : ''
    }`;
    const rows = lines.map((l) => `${l.avatar} ${l.name}: ${signed(l.net)}`);
    const tr2 = transfers.map((t) =>
      lang === 'he' ? `💸 ${t.fromName} מעביר/ה ל${t.toName} ${fmt(t.amount)}₪` : `💸 ${t.fromName} pays ${t.toName} ₪${fmt(t.amount)}`,
    );
    return [head, '', ...rows, '', transfers.length ? tr('העברות:', 'Transfers:') : tr('אין העברות 🎉', 'No transfers needed 🎉'), ...tr2].join('\n');
  };

  return (
    <div className="settle">
      {moneyMode === 'demo' && (
        <div className="demo-banner">{tr('🎓 שולחן אימון - לא נספר בחובות ובסטטיסטיקה', '🎓 Practice table - not counted in debts or stats')}</div>
      )}
      {live && <div className="hint">{tr('המאזן מחושב לפי הז׳טונים שיש לכל אחד כרגע על השולחן', "Balances are based on each player's chips on the table right now")}</div>}
      <table className="ledger-table">
        <thead>
          <tr>
            <th>{tr('שחקן', 'Player')}</th>
            <th>{tr('קנה', 'Bought')}</th>
            <th>{live ? tr('יש לו', 'Has') : tr('יצא עם', 'Left with')}</th>
            <th>{tr('רווח', 'Net')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td>
                {l.avatar} {l.name}
              </td>
              <td>{fmt(l.buyin)}</td>
              <td>{fmt(l.out)}</td>
              <td className={l.net > 0 ? 'pos' : l.net < 0 ? 'neg' : ''}>
                {signed(l.net)}
              </td>
            </tr>
          ))}
          {Math.abs(kupa) > 0.005 && (
            <tr className="kupa-row">
              <td>{tr('🏦 הקופה (בית/בוטים)', '🏦 The Kitty (house/bots)')}</td>
              <td />
              <td />
              <td className={kupa > 0 ? 'pos' : 'neg'}>
                {signed(kupa)}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <h3 className="section-title">{tr('💸 מי מעביר למי', '💸 Who pays whom')}</h3>
      {transfers.length === 0 ? (
        <div className="empty">{tr('אין חובות - כולם מאוזנים 🎉', 'No debts - everyone is even 🎉')}</div>
      ) : (
        <div className="transfers">
          {transfers.map((t, i) => (
            <div key={i} className="transfer">
              <span className={t.from === KUPA_ID ? 'kupa' : ''}>{t.fromName}</span>
              <span className="arrow">{arrow}</span>
              <span className={t.to === KUPA_ID ? 'kupa' : ''}>{t.toName}</span>
              <b>₪{fmt(t.amount)}</b>
            </div>
          ))}
        </div>
      )}
      {Math.abs(kupa) > 0.005 && (
        <div className="hint">
          {tr(
            '״הקופה״ = מה שהבית או הבוטים הרוויחו/הפסידו. תחליטו ביחד מה עושים איתה (למשל - קופה לערב הבא 🍕)',
            '"The Kitty" = what the house or bots won/lost. Decide together what to do with it (e.g. fund the next night 🍕)',
          )}
        </div>
      )}
      <a className="btn whatsapp block" href={`https://wa.me/?text=${encodeURIComponent(shareText())}`} target="_blank" rel="noreferrer">
        {tr('שיתוף בוואטסאפ 💬', 'Share on WhatsApp 💬')}
      </a>
    </div>
  );
}
