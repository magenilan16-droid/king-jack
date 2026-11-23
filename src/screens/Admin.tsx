// מסך מנהל: אישור פרימיום, איפוס סיסמה לחבר ששכח, סגירת שולחנות שנשכחו
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Star, Shield, KeyRound, MessageCircle } from 'lucide-react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { useI18n, count } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { AsyncButton, Sheet, toast } from '../components/ui';
import { GameGlyph } from './Stats';

interface RoomLite {
  id: string;
  name: string;
  code: string;
  game_type: string;
  money_mode: string;
  created_at: string;
  state: { players: { isBot: boolean }[] };
}

export function Admin({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const { tr, lang } = useI18n();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [q, setQ] = useState('');
  const [newPw, setNewPw] = useState<{ name: string; pw: string } | null>(null);
  const [cleanHours, setCleanHours] = useState(3);
  const Back = lang === 'he' ? ArrowRight : ArrowLeft;

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('game_profiles').select('*').order('name'),
      supabase.from('game_rooms').select('id, name, code, game_type, money_mode, created_at, state').eq('status', 'open').order('created_at'),
    ]);
    setPlayers((p.data ?? []) as Profile[]);
    setRooms((r.data ?? []) as RoomLite[]);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const adminCall = async (body: Record<string, unknown>) => {
    const r = await gameCall<{ ok: boolean; password?: string }>({ op: 'admin', ...body });
    await load();
    return r;
  };

  const list = players.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const age = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 3600000);

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={tr('חזרה', 'Back')}>
          <Back size={22} />
        </button>
        <h1>{tr('ניהול הקבוצה', 'Group admin')}</h1>
      </header>
      <div className="content">
        <h3 className="section-title">
          {tr('שחקנים', 'Players')} <span className="count-pill">{players.length}</span>
        </h3>
        <input className="input" placeholder={tr('חיפוש לפי שם', 'Search by name')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr('חיפוש שחקן', 'Search player')} />
        <div className="history">
          {list.map((p) => (
            <div key={p.id} className="admin-row">
              <Avatar name={p.name} emoji={p.avatar} size={32} />
              <b className="grow" dir="auto">
                {p.name} {p.id === profile.id && <span className="sub">{tr('(אני)', '(me)')}</span>}
              </b>
              <AsyncButton
                className={`icon-toggle ${p.is_premium ? 'on' : ''}`}
                label={tr('פרימיום', 'Premium')}
                onClick={async () => {
                  await adminCall({ action: 'setPremium', userId: p.id, value: !p.is_premium });
                  toast(!p.is_premium ? tr(`${p.name} קיבל/ה פרימיום`, `${p.name} is now premium`) : tr('הפרימיום בוטל', 'Premium removed'), 'win');
                }}
              >
                <Star size={17} />
              </AsyncButton>
              <AsyncButton
                className={`icon-toggle ${p.is_admin ? 'on' : ''}`}
                label={tr('מנהל', 'Admin')}
                disabled={p.id === profile.id}
                onClick={async () => {
                  await adminCall({ action: 'setAdmin', userId: p.id, value: !p.is_admin });
                }}
              >
                <Shield size={17} />
              </AsyncButton>
              <AsyncButton
                className="icon-toggle"
                label={tr('איפוס סיסמה', 'Reset password')}
                onClick={async () => {
                  if (!confirm(tr(`לאפס את הסיסמה של ${p.name}?`, `Reset ${p.name}'s password?`))) return;
                  const r = await adminCall({ action: 'resetPassword', userId: p.id });
                  if (r.password) setNewPw({ name: p.name, pw: r.password });
                }}
              >
                <KeyRound size={17} />
              </AsyncButton>
            </div>
          ))}
        </div>
        <div className="legend">
          <span>
            <Star size={14} /> {tr('פרימיום (מאמן AI)', 'Premium (AI coach)')}
          </span>
          <span>
            <Shield size={14} /> {tr('מנהל', 'Admin')}
          </span>
          <span>
            <KeyRound size={14} /> {tr('איפוס סיסמה', 'Reset password')}
          </span>
        </div>

        <h3 className="section-title">{tr('ניקוי שולחנות ישנים', 'Clean up old tables')}</h3>
        <div className="card-group">
          <div className="hint">
            {tr(
              'סוגר שולחנות שלא היה בהם שום מהלך בזמן שבחרת (כל אחד יוצא עם מה שיש לו, ובכסף אמיתי נוצר קיזוז חובות), ומוחק לגמרי שולחנות אימון ישנים שכבר נסגרו.',
              'Closes tables with no activity for the chosen time (everyone cashes out; real-money tables get a settle-up), and fully deletes old closed practice tables.',
            )}
          </div>
          <div className="seg" role="group" aria-label={tr('ללא פעילות במשך', 'Inactive for')}>
            {[3, 12, 24].map((h) => (
              <button key={h} className={cleanHours === h ? 'active' : ''} aria-pressed={cleanHours === h} onClick={() => setCleanHours(h)}>
                {tr(`${h} שעות`, `${h} hours`)}
              </button>
            ))}
          </div>
          <AsyncButton
            className="btn primary block"
            onClick={async () => {
              if (!confirm(tr(`לסגור שולחנות שלא היו פעילים ${cleanHours} שעות ולמחוק שולחנות אימון ישנים?`, `Close tables inactive for ${cleanHours} hours and delete old practice tables?`))) return;
              const r = await gameCall<{ ok: boolean; closed: number; deleted: number }>({ op: 'admin', action: 'cleanup', hours: cleanHours });
              await load();
              toast(tr(`נסגרו ${r.closed} שולחנות, נמחקו ${r.deleted} שולחנות אימון`, `Closed ${r.closed} tables, deleted ${r.deleted} practice tables`), 'win');
            }}
          >
            {tr('ניקוי עכשיו', 'Clean up now')}
          </AsyncButton>
        </div>

        <h3 className="section-title">
          {tr('שולחנות פתוחים', 'Open tables')} <span className="count-pill">{rooms.length}</span>
        </h3>
        {rooms.length === 0 ? (
          <div className="empty">{tr('אין שולחנות פתוחים', 'No open tables')}</div>
        ) : (
          <div className="history">
            {rooms.map((r) => (
              <div key={r.id} className="admin-row">
                <GameGlyph type={r.game_type} />
                <div className="grow">
                  <b dir="auto">{r.name}</b>
                  <div className="sub facts-line">
                    <span className="num" translate="no">
                      {r.code}
                    </span>
                    <span>{count(r.state.players.filter((p) => !p.isBot).length, 'שחקן אחד', 'שחקנים', '1 player', 'players')}</span>
                    <span>{tr(`לפני ${age(r.created_at)} שעות`, `${age(r.created_at)}h ago`)}</span>
                  </div>
                </div>
                <AsyncButton
                  className="btn small ghost danger-text"
                  onClick={async () => {
                    const demo = r.money_mode === 'demo';
                    const msg = demo
                      ? tr('למחוק את שולחן האימון לגמרי?', 'Delete this practice table completely?')
                      : tr('לסגור את השולחן? כולם יוצאים עם מה שיש להם והחובות מחושבים.', 'Close this table? Everyone cashes out and debts are settled.');
                    if (!confirm(msg)) return;
                    const res = await gameCall<{ ok: boolean; deleted?: boolean }>({ op: 'removeRoom', roomId: r.id });
                    toast(res.deleted ? tr('השולחן נמחק', 'Table deleted') : tr('השולחן נסגר', 'Table closed'), 'win');
                    await load();
                  }}
                >
                  {r.money_mode === 'demo' ? tr('מחיקה', 'Delete') : tr('סגירה', 'Close')}
                </AsyncButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!newPw} onClose={() => setNewPw(null)} title={tr('סיסמה חדשה', 'New password')}>
        {newPw && (
          <div className="invite-pop">
            <p>
              {tr('הסיסמה החדשה של', 'New password for')} <b dir="auto">{newPw.name}</b>
            </p>
            <div className="invite-code">
              <b translate="no">{newPw.pw}</b>
            </div>
            <a
              className="btn whatsapp block"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(
                tr(
                  `King Jack\nהסיסמה החדשה שלך: ${newPw.pw}\n(השם נשאר: ${newPw.name})\n${location.origin}${location.pathname}`,
                  `King Jack\nYour new password: ${newPw.pw}\n(Your name stays: ${newPw.name})\n${location.origin}${location.pathname}`,
                ),
              )}`}
            >
              <MessageCircle size={18} /> {tr('שליחה לחבר בוואטסאפ', 'Send to your friend on WhatsApp')}
            </a>
          </div>
        )}
      </Sheet>
    </div>
  );
}
