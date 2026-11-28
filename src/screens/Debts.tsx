// לוח חובות: מה פתוח בין כל הערבים, סימון "שולם", וקיזוז כולל
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BellRing, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { settle } from '../engine/settle';
import { fmt } from '../lib/balances';
import { useI18n, count } from '../lib/i18n';
import { KITTY, netsByPerson, owedTotals, type PersonNet } from '../lib/debtNets';
import { avatarEmoji } from '../lib/display';
import { AsyncButton, Sheet, toast } from '../components/ui';

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

export function Debts({ profile }: { profile: Profile; onBack?: () => void }) {
  const { tr, lang } = useI18n();
  const [tab, setTab] = useState<'mine' | 'all' | 'paid'>('mine');
  const [debts, setDebts] = useState<DebtRow[] | null>(null);
  const [rooms, setRooms] = useState<Record<string, { name: string; closed_at: string }>>({});
  const [people, setPeople] = useState<Record<string, { name: string; avatar: string }>>({});
  // תזכורת שלא הגיעה לטלפון (אין לו התראות) - מציעים לשלוח את אותו נוסח בוואטסאפ
  const [wa, setWa] = useState<{ name: string; text: string } | null>(null);

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
  // השורה התחתונה מול כל חבר: חייב לו 50+75 והוא חייב לי 99 = אני מעביר לו 26
  const perPerson = netsByPerson(profile.id, mine);
  const { owe: iOwe, owed: owedToMe } = owedTotals(perPerson);

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

  // "סבתא גובה חובות": מי שבשורה התחתונה חייב לי מקבל תזכורת בקול של סבתא של תמיר
  const remind = async (other: string) => {
    const r = await gameCall<{ ok: boolean; pushed: number; name: string; text: string }>({ op: 'debtNudge', userId: other });
    if (r.pushed > 0) toast(tr(`סבתא של תמיר שלחה תזכורת ל${r.name}`, `Tamir's Grandma reminded ${r.name}`), 'win');
    else setWa({ name: r.name, text: r.text });
  };

  // "סגרנו": מסמנים כשולמו את כל החובות הפתוחים מול החבר הזה (אחרי שהעבירו את השורה התחתונה)
  const closeWith = async (n: PersonNet<DebtRow>) => {
    const name = who(n.other === KITTY ? null : n.other);
    if (n.debts.length > 1) {
      const all = count(n.debts.length, 'החוב', 'החובות', 'the debt', 'debts');
      const msg =
        n.net < 0
          ? tr(`העברת ל${name} ₪${fmt(-n.net)}? כל ${all} ביניכם יסומנו כשולמו`, `Did you send ${name} ₪${fmt(-n.net)}? All ${all} between you will be marked paid`)
          : n.net > 0
            ? tr(`${name} העביר לך ₪${fmt(n.net)}? כל ${all} ביניכם יסומנו כשולמו`, `Did ${name} send you ₪${fmt(n.net)}? All ${all} between you will be marked paid`)
            : tr(`החובות מול ${name} מתקזזים לאפס. לסמן את כולם כשולמו?`, `Debts with ${name} cancel out. Mark them all as paid?`);
      if (!confirm(msg)) return;
    }
    for (const d of n.debts) {
      const { error } = await supabase.rpc('game_mark_debt', { p_id: d.id, p_paid: true });
      if (error) throw new Error(tr('אין הרשאה', 'Not allowed'));
    }
    toast(tr(`הכל סגור מול ${name}`, `All settled with ${name}`), 'win');
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

  // שורה אחת לכל חבר: מי מעביר למי כמה, אחרי קיזוז
  const NetRow = ({ n }: { n: PersonNet<DebtRow> }) => {
    const other = n.other === KITTY ? null : n.other;
    const one = n.debts.length === 1 ? n.debts[0] : null;
    return (
      <div className="debt-row net-row">
        <div className="grow">
          <div className="debt-who">
            {n.net === 0 ? (
              <span dir="auto">{tr(`מול ${who(other)}`, `With ${who(other)}`)}</span>
            ) : (
              <>
                <span dir="auto">{n.net < 0 ? who(profile.id) : who(other)}</span>
                <Arrow size={15} aria-label={tr('משלם ל', 'pays')} />
                <span dir="auto">{n.net < 0 ? who(other) : who(profile.id)}</span>
              </>
            )}
          </div>
          <div className="sub facts-line">
            {one ? (
              <>
                <span dir="auto">{rooms[one.room_id]?.name ?? ''}</span>
                <span>{dateFmt(rooms[one.room_id]?.closed_at ?? one.created_at)}</span>
              </>
            ) : n.net === 0 ? (
              <span>{tr(`${n.debts.length} חובות שמתקזזים לאפס`, `${n.debts.length} debts that cancel out`)}</span>
            ) : (
              <span>{tr(`בשורה התחתונה, אחרי קיזוז של ${n.debts.length} חובות`, `Bottom line after netting ${n.debts.length} debts`)}</span>
            )}
          </div>
        </div>
        <b className={`debt-amount ${n.net < 0 ? 'neg' : n.net > 0 ? 'pos' : ''}`}>₪{fmt(Math.abs(n.net))}</b>
        {n.net > 0 && other && (
          <AsyncButton className="btn small ghost debt-remind" label={tr(`תזכורת מסבתא ל${who(other)}`, `Grandma reminds ${who(other)}`)} onClick={() => remind(other)}>
            <BellRing size={16} />
          </AsyncButton>
        )}
        <AsyncButton className="btn small primary" onClick={() => closeWith(n)}>
          {n.debts.length > 1 ? tr('סגרנו', 'Settled') : tr('שולם', 'Paid')}
        </AsyncButton>
      </div>
    );
  };

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
          <>
            <div className="history">
              {perPerson.map((n) => (
                <NetRow key={n.other} n={n} />
              ))}
            </div>
            {/* כשיש כמה חובות מול אותו חבר - הפירוט לפי ערבים */}
            {mine.length > perPerson.length && (
              <>
                <h3 className="section-title">{tr('הפירוט לפי ערבים', 'By night')}</h3>
                <div className="history">
                  {mine.map((d) => (
                    <Row key={d.id} d={d} />
                  ))}
                </div>
              </>
            )}
          </>
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
        {owedToMe > 0 && <p className="hint center">{tr('הפעמון ליד מי שחייב לך = סבתא של תמיר שולחת לו תזכורת.', "The bell next to someone who owes you = Tamir's Grandma sends a reminder.")}</p>}
      </div>
      <Sheet
        open={!!wa}
        onClose={() => setWa(null)}
        title={tr('התזכורת לא הגיעה לטלפון', 'The reminder did not reach the phone')}
        footer={
          wa && (
            <a
              className="btn whatsapp block big"
              href={`https://wa.me/?text=${encodeURIComponent(`${wa.text}\n${location.origin}${location.pathname}?debts=1`)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setWa(null)}
            >
              <MessageCircle size={18} /> {tr('שליחה בוואטסאפ', 'Send on WhatsApp')}
            </a>
          )
        }
      >
        <p className="tk-explain" dir="auto">
          {tr(`ל${wa?.name ?? ''} אין התראות פעילות. אפשר לשלוח את התזכורת של סבתא בוואטסאפ:`, `${wa?.name ?? ''} has notifications off. You can send Grandma's reminder on WhatsApp:`)}
        </p>
        <blockquote className="debt-quote" dir="auto">
          {wa?.text}
        </blockquote>
      </Sheet>
    </div>
  );
}
