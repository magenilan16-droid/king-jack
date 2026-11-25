// לוח חובות: מה פתוח בין כל הערבים, סימון "שולם", וקיזוז כולל
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { settle } from '../engine/settle';
import { fmt } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { avatarEmoji } from '../lib/display';
import { AsyncButton, toast } from '../components/ui';

interface DebtRow {
  id: number;
  room_id: string;
  from_user: string | null;
  to_user: string | null;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}

const KITTY = 'kitty';

export function Debts({ profile }: { profile: Profile; onBack?: () => void }) {
  const { tr, lang } = useI18n();
  const [tab, setTab] = useState<'mine' | 'all' | 'paid'>('mine');
  const [debts, setDebts] = useState<DebtRow[] | null>(null);
  const [rooms, setRooms] = useState<Record<string, { name: string; closed_at: string }>>({});
  const [people, setPeople] = useState<Record<string, { name: string; avatar: string }>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('game_debts').select('*').order('created_at', { ascending: false }).limit(500);
    const rows = (data ?? []) as DebtRow[];
    const roomIds = [...new Set(rows.map((d) => d.room_id))];
    const userIds = [...new Set(rows.flatMap((d) => [d.from_user, d.to_user]).filter(Boolean))] as string[];
    const [r, p] = await Promise.all([
      roomIds.length ? supabase.from('game_rooms').select('id, name, closed_at').in('id', roomIds) : Promise.resolve({ data: [] }),
      userIds.length ? supabase.from('game_profiles').select('id, name, avatar').in('id', userIds) : Promise.resolve({ data: [] }),
    ]);
    setRooms(Object.fromEntries(((r.data ?? []) as { id: string; name: string; closed_at: string }[]).map((x) => [x.id, x])));
    setPeople(Object.fromEntries(((p.data ?? []) as { id: string; name: string; avatar: string }[]).map((x) => [x.id, x])));
    setDebts(rows); // מציגים רק אחרי שהשמות נטענו
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('debts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_debts' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const who = (id: string | null) => (id ? (people[id]?.name ?? '?') : tr('הקופה', 'The Kitty'));
  const whoText = (id: string | null) => (id ? (people[id] ? `${avatarEmoji(people[id].avatar)} ${people[id].name}`.trim() : '?') : tr('הקופה', 'The Kitty'));
  const dateFmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short' }) : '';
  const Arrow = lang === 'he' ? ArrowLeft : ArrowRight;

  const open = (debts ?? []).filter((d) => !d.paid);
  const paid = (debts ?? []).filter((d) => d.paid);
  const mine = open.filter((d) => d.from_user === profile.id || d.to_user === profile.id);
  const iOwe = mine.filter((d) => d.from_user === profile.id).reduce((a, d) => a + Number(d.amount), 0);
  const owedToMe = mine.filter((d) => d.to_user === profile.id).reduce((a, d) => a + Number(d.amount), 0);

  // קיזוז כולל: מאחדים את כל החובות הפתוחים להעברות מינימליות
  const nets = new Map<string, number>();
  for (const d of open) {
    const f = d.from_user ?? KITTY;
    const t = d.to_user ?? KITTY;
    nets.set(f, (nets.get(f) ?? 0) - Number(d.amount));
    nets.set(t, (nets.get(t) ?? 0) + Number(d.amount));
  }
  const combined = settle([...nets].map(([id, net]) => ({ id, name: id, net: Math.round(net * 100) / 100 })));

  const canMark = (d: DebtRow) => profile.is_admin || d.from_user === profile.id || d.to_user === profile.id;
  const mark = async (d: DebtRow, value: boolean) => {
    const { error } = await supabase.rpc('game_mark_debt', { p_id: d.id, p_paid: value });
    if (error) throw new Error(tr('אין הרשאה', 'Not allowed'));
    toast(value ? tr('סומן כשולם', 'Marked as paid') : tr('הסימון בוטל', 'Unmarked'), 'win');
    load();
  };

  const shareText = () => {
    const lines = combined.map((t) =>
      lang === 'he'
        ? `${whoText(t.from === KITTY ? null : t.from)} מעביר/ה ל${whoText(t.to === KITTY ? null : t.to)} ${fmt(t.amount)}₪`
        : `${whoText(t.from === KITTY ? null : t.from)} pays ${whoText(t.to === KITTY ? null : t.to)} ₪${fmt(t.amount)}`,
    );
    return [`King Jack - ${tr('חובות פתוחים (קיזוז כולל)', 'Open debts (combined)')}`, '', ...lines].join('\n');
  };

  const Row = ({ d }: { d: DebtRow }) => (
    <div className={`debt-row ${d.paid ? 'paid' : ''}`}>
      <div className="grow">
        <div className="debt-who">
          <span dir="auto">{who(d.from_user)}</span>
          <Arrow size={15} aria-label={tr('משלם ל', 'pays')} />
          <span dir="auto">{who(d.to_user)}</span>
        </div>
        <div className="sub facts-line">
          <span dir="auto">{rooms[d.room_id]?.name ?? ''}</span>
          <span>{dateFmt(rooms[d.room_id]?.closed_at ?? d.created_at)}</span>
          {d.paid && <span className="pos">{tr(`שולם ${dateFmt(d.paid_at ?? undefined)}`, `Paid ${dateFmt(d.paid_at ?? undefined)}`)}</span>}
        </div>
      </div>
      <b className="debt-amount">₪{fmt(Number(d.amount))}</b>
      {canMark(d) && (
        <AsyncButton className={`btn small ${d.paid ? 'ghost' : 'primary'}`} onClick={() => mark(d, !d.paid)}>
          {d.paid ? tr('ביטול', 'Undo') : tr('שולם', 'Paid')}
        </AsyncButton>
      )}
    </div>
  );

  return (
    <div className="screen has-nav">
      <header className="topbar">
        <h1>{tr('חובות', 'Debts')}</h1>
      </header>
      <div className="content">
        <div className="ledger-head">
          <div>
            <div className="stat-label">{tr('אני חייב', 'I owe')}</div>
            <div className={`stat-value ${iOwe > 0 ? 'neg' : ''}`}>₪{fmt(iOwe)}</div>
          </div>
          <div>
            <div className="stat-label">{tr('חייבים לי', 'Owed to me')}</div>
            <div className={`stat-value ${owedToMe > 0 ? 'pos' : ''}`}>₪{fmt(owedToMe)}</div>
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>
            {tr('שלי', 'Mine')}
            {mine.length > 0 && <span className="tab-count">{mine.length}</span>}
          </button>
          <button role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
            {tr('כל הקבוצה', 'Everyone')}
          </button>
          <button role="tab" aria-selected={tab === 'paid'} className={tab === 'paid' ? 'active' : ''} onClick={() => setTab('paid')}>
            {tr('שולמו', 'Paid')}
          </button>
        </div>

        {debts == null && (
          <div className="center pad">
            <span className="spinner" />
          </div>
        )}

        {tab === 'mine' && debts && (mine.length === 0 ? <div className="empty">{tr('אין לך חובות פתוחים', 'You have no open debts')}</div> : (
          <div className="history">
            {mine.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        ))}

        {tab === 'all' && debts && (
          <>
            {combined.length > 0 && (
              <>
                <h3 className="section-title">{tr('קיזוז כולל: הדרך הקצרה לסגור הכל', 'Combined settle-up: the shortest way to close everything')}</h3>
                <div className="transfers">
                  {combined.map((t, i) => (
                    <div key={i} className="transfer">
                      <span dir="auto">{who(t.from === KITTY ? null : t.from)}</span>
                      <Arrow size={15} />
                      <span dir="auto">{who(t.to === KITTY ? null : t.to)}</span>
                      <b>₪{fmt(t.amount)}</b>
                    </div>
                  ))}
                </div>
                <a className="btn whatsapp block" href={`https://wa.me/?text=${encodeURIComponent(shareText())}`} target="_blank" rel="noreferrer">
                  <MessageCircle size={18} /> {tr('שיתוף בוואטסאפ', 'Share on WhatsApp')}
                </a>
                {profile.is_admin && (
                  <AsyncButton
                    className="btn ghost block"
                    onClick={async () => {
                      if (!confirm(tr('לסמן את כל החובות הפתוחים כשולמו? (אחרי שכולם העבירו לפי הקיזוז הכולל)', 'Mark ALL open debts as paid? (after everyone paid per the combined settle-up)')))
                        return;
                      await gameCall({ op: 'admin', action: 'settleAll' });
                      toast(tr('כל החובות נסגרו', 'All debts closed'), 'win');
                      load();
                    }}
                  >
                    <ShieldCheck size={18} /> {tr('סגירת כל החובות (מנהל)', 'Close all debts (admin)')}
                  </AsyncButton>
                )}
              </>
            )}
            <h3 className="section-title">{tr('כל החובות הפתוחים', 'All open debts')}</h3>
            {open.length === 0 ? (
              <div className="empty">{tr('אין חובות פתוחים בקבוצה', 'No open debts in the group')}</div>
            ) : (
              <div className="history">
                {open.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'paid' && debts && (paid.length === 0 ? <div className="empty">{tr('עוד לא סומנו תשלומים', 'No payments marked yet')}</div> : (
          <div className="history">
            {paid.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        ))}
        <p className="hint center">{tr('חובות נוצרים אוטומטית כשסוגרים ערב בכסף אמיתי.', 'Debts are created automatically when a real-money night is closed.')}</p>
      </div>
    </div>
  );
}
