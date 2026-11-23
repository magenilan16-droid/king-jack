// מסך מנהל: אישור פרימיום, איפוס סיסמה לחבר ששכח, סגירת שולחנות שנשכחו
import { useCallback, useEffect, useState } from 'react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { AsyncButton, Sheet, toast } from '../components/ui';

interface RoomLite {
  id: string;
  name: string;
  code: string;
  game_type: string;
  created_at: string;
  state: { players: { isBot: boolean }[] };
}

export function Admin({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const { tr, lang } = useI18n();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [rooms, setRooms] = useState<RoomLite[]>([]);
  const [q, setQ] = useState('');
  const [newPw, setNewPw] = useState<{ name: string; pw: string } | null>(null);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('game_profiles').select('*').order('name'),
      supabase.from('game_rooms').select('id, name, code, game_type, created_at, state').eq('status', 'open').order('created_at'),
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
        <button className="icon-btn" onClick={onBack}>
          {lang === 'he' ? '➜' : '⬅'}
        </button>
        <h1>{tr('🛡️ ניהול', '🛡️ Admin')}</h1>
        <span />
      </header>
      <div className="content">
        <h3 className="section-title">
          {tr('👥 שחקנים', '👥 Players')} ({players.length})
        </h3>
        <input className="input" placeholder={tr('חיפוש...', 'Search...')} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="history">
          {list.map((p) => (
            <div key={p.id} className="admin-row">
              <span className="avatar">{p.avatar}</span>
              <b className="grow" dir="auto">
                {p.name} {p.id === profile.id && tr('(אני)', '(me)')}
              </b>
              <AsyncButton
                className={`btn small ${p.is_premium ? 'primary' : 'ghost'}`}
                onClick={async () => {
                  await adminCall({ action: 'setPremium', userId: p.id, value: !p.is_premium });
                  toast(!p.is_premium ? tr(`⭐ ${p.name} קיבל/ה פרימיום`, `⭐ ${p.name} is now premium`) : tr('הפרימיום בוטל', 'Premium removed'), 'win');
                }}
              >
                ⭐
              </AsyncButton>
              <AsyncButton
                className={`btn small ${p.is_admin ? 'primary' : 'ghost'}`}
                disabled={p.id === profile.id}
                onClick={async () => {
                  await adminCall({ action: 'setAdmin', userId: p.id, value: !p.is_admin });
                }}
              >
                🛡️
              </AsyncButton>
              <AsyncButton
                className="btn small ghost"
                onClick={async () => {
                  if (!confirm(tr(`לאפס את הסיסמה של ${p.name}?`, `Reset ${p.name}'s password?`))) return;
                  const r = await adminCall({ action: 'resetPassword', userId: p.id });
                  if (r.password) setNewPw({ name: p.name, pw: r.password });
                }}
              >
                🔑
              </AsyncButton>
            </div>
          ))}
        </div>
        <p className="hint">{tr('⭐ = פרימיום (עוזר AI) · 🛡️ = מנהל · 🔑 = איפוס סיסמה', '⭐ = premium (AI coach) · 🛡️ = admin · 🔑 = reset password')}</p>

        <h3 className="section-title">
          {tr('🟢 שולחנות פתוחים', '🟢 Open tables')} ({rooms.length})
        </h3>
        <div className="history">
          {rooms.length === 0 && <div className="empty">{tr('אין שולחנות פתוחים', 'No open tables')}</div>}
          {rooms.map((r) => (
            <div key={r.id} className="admin-row">
              <span>{r.game_type === 'blackjack' ? '🂡' : '♠️'}</span>
              <div className="grow">
                <b dir="auto">{r.name}</b>
                <div className="sub">
                  {r.code} · {r.state.players.filter((p) => !p.isBot).length} {tr('שחקנים', 'players')} · {tr(`לפני ${age(r.created_at)} שעות`, `${age(r.created_at)}h ago`)}
                </div>
              </div>
              <AsyncButton
                className="btn small ghost danger-text"
                onClick={async () => {
                  if (!confirm(tr('לסגור את השולחן? כולם יוצאים עם מה שיש להם.', 'Close this table? Everyone cashes out with what they have.'))) return;
                  await adminCall({ action: 'forceClose', roomId: r.id });
                  toast(tr('השולחן נסגר', 'Table closed'), 'win');
                }}
              >
                {tr('סגירה', 'Close')}
              </AsyncButton>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={!!newPw} onClose={() => setNewPw(null)} title={tr('🔑 סיסמה חדשה', '🔑 New password')}>
        {newPw && (
          <div className="invite-pop">
            <p>
              {tr('הסיסמה החדשה של', 'New password for')} <b>{newPw.name}</b>:
            </p>
            <div className="invite-code">
              <b>{newPw.pw}</b>
            </div>
            <a
              className="btn whatsapp block"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(
                tr(
                  `👑 King Jack\nהסיסמה החדשה שלך: ${newPw.pw}\n(השם נשאר: ${newPw.name})\n${location.origin}${location.pathname}`,
                  `👑 King Jack\nYour new password: ${newPw.pw}\n(Your name stays: ${newPw.name})\n${location.origin}${location.pathname}`,
                ),
              )}`}
            >
              {tr('שליחה לחבר בוואטסאפ 💬', 'Send to your friend on WhatsApp 💬')}
            </a>
          </div>
        )}
      </Sheet>
    </div>
  );
}
