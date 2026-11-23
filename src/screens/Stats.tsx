// סטטיסטיקה: טבלת דירוג, סטטיסטיקה אישית והיסטוריית ערבים
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, type Profile } from '../lib/supabase';
import { signed } from '../lib/balances';
import { useI18n, count } from '../lib/i18n';
import { Sheet } from '../components/ui';
import { Avatar } from '../components/Avatar';
import { Settle } from '../components/Settle';
import { HandHistory } from '../components/HandHistory';
import type { LedgerRow, RoomRow } from '../lib/useRoom';

interface LeaderRow {
  user_id: string;
  name: string;
  avatar: string;
  games: number;
  net: number;
  best: number;
  worst: number;
  wins: number;
  buyin: number;
}

interface ResultRow {
  room_id: string;
  room_name: string;
  game_type: 'blackjack' | 'holdem';
  closed_at: string;
  user_id: string;
  name: string;
  avatar: string;
  buyin: number;
  cashout: number;
  net: number;
}

export function GameGlyph({ type }: { type: string }) {
  return (
    <span className={`game-glyph ${type}`} aria-hidden="true">
      {type === 'blackjack' ? '21' : '♠'}
    </span>
  );
}

export function Stats({ profile }: { profile: Profile; onBack?: () => void }) {
  const { tr, lang } = useI18n();
  const [tab, setTab] = useState<'board' | 'me' | 'nights'>('board');
  const [period, setPeriod] = useState<'all' | 'month'>('all');
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [mine, setMine] = useState<ResultRow[] | null>(null);
  const [nights, setNights] = useState<(RoomRow & { closed_at?: string })[] | null>(null);
  const [openNight, setOpenNight] = useState<{ room: RoomRow; ledger: LedgerRow[] } | null>(null);
  const Chev = lang === 'he' ? ChevronLeft : ChevronRight;

  useEffect(() => {
    const since = period === 'month' ? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString() : null;
    supabase.rpc('game_leaderboard', { p_since: since }).then(({ data }) => setBoard((data ?? []) as LeaderRow[]));
  }, [period]);

  useEffect(() => {
    supabase
      .from('game_results')
      .select('*')
      .eq('user_id', profile.id)
      .order('closed_at', { ascending: false })
      .then(({ data }) => setMine((data ?? []) as ResultRow[]));
    supabase
      .from('game_rooms')
      .select('id, code, name, game_type, status, money_mode, state, version, closed_at')
      .eq('status', 'closed')
      .eq('money_mode', 'real')
      .order('closed_at', { ascending: false })
      .limit(60)
      .then(({ data }) => setNights((data ?? []) as (RoomRow & { closed_at?: string })[]));
  }, [profile.id]);

  const openRoom = async (roomId: string) => {
    const [r, l] = await Promise.all([
      supabase.from('game_rooms').select('id, code, name, game_type, status, money_mode, state, version').eq('id', roomId).single(),
      supabase.from('game_ledger').select('id, user_id, bot_name, kind, amount').eq('room_id', roomId).order('id'),
    ]);
    if (r.data) setOpenNight({ room: r.data as RoomRow, ledger: (l.data ?? []) as LedgerRow[] });
  };

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

  const my = mine ?? [];
  const total = my.reduce((a, r) => a + Number(r.net), 0);
  const wins = my.filter((r) => Number(r.net) > 0).length;
  const best = my.length ? Math.max(...my.map((r) => Number(r.net))) : 0;
  const worst = my.length ? Math.min(...my.map((r) => Number(r.net))) : 0;
  const myRank = board ? board.findIndex((b) => b.user_id === profile.id) : -1;
  const tone = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

  return (
    <div className="screen has-nav">
      <header className="topbar">
        <h1>{tr('דירוג וסטטיסטיקה', 'Ranking & stats')}</h1>
      </header>
      <div className="content">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'board'} className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>
            {tr('דירוג', 'Ranking')}
          </button>
          <button role="tab" aria-selected={tab === 'me'} className={tab === 'me' ? 'active' : ''} onClick={() => setTab('me')}>
            {tr('שלי', 'Mine')}
          </button>
          <button role="tab" aria-selected={tab === 'nights'} className={tab === 'nights' ? 'active' : ''} onClick={() => setTab('nights')}>
            {tr('ערבים', 'Nights')}
          </button>
        </div>

        {tab === 'board' && (
          <>
            <div className="seg" role="group" aria-label={tr('תקופה', 'Period')}>
              <button className={period === 'all' ? 'active' : ''} aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>
                {tr('כל הזמנים', 'All time')}
              </button>
              <button className={period === 'month' ? 'active' : ''} aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>
                {tr('החודש', 'This month')}
              </button>
            </div>
            {board == null ? (
              <div className="center pad">
                <span className="spinner" />
              </div>
            ) : board.length === 0 ? (
              <div className="empty">{tr('עוד אין תוצאות. אחרי שסוגרים ערב ראשון בכסף אמיתי, הדירוג יופיע כאן.', 'No results yet. Close your first real-money night to see the ranking.')}</div>
            ) : (
              <div className="leaderboard">
                {board.map((b, i) => (
                  <div key={b.user_id} className={`leader-row ${b.user_id === profile.id ? 'me' : ''}`}>
                    <span className={`rank ${i < 3 ? `r${i + 1}` : ''}`}>{i + 1}</span>
                    <Avatar name={b.name} emoji={b.avatar} size={36} />
                    <div className="grow">
                      <b dir="auto">{b.name}</b>
                      <div className="sub">
                        {count(Number(b.games), 'ערב אחד', 'ערבים', '1 night', 'nights')}
                        {tr(
                          `, ${Math.round((Number(b.wins) / Math.max(1, Number(b.games))) * 100)}% ברווח`,
                          `, ${Math.round((Number(b.wins) / Math.max(1, Number(b.games))) * 100)}% winning`,
                        )}
                      </div>
                    </div>
                    <span className={`net ${tone(Number(b.net))}`}>{signed(Number(b.net))}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="hint center">{tr('נספרים רק שולחנות בכסף אמיתי שנסגרו.', 'Only closed real-money tables count.')}</p>
          </>
        )}

        {tab === 'me' && (
          <>
            <div className="profile-card">
              <Avatar name={profile.name} emoji={profile.avatar} size={52} />
              <div>
                <h2 dir="auto">{profile.name}</h2>
                {myRank >= 0 && (
                  <div className="sub">{tr(`מקום ${myRank + 1} מתוך ${board?.length}`, `Rank ${myRank + 1} of ${board?.length}`)}</div>
                )}
              </div>
            </div>
            <div className="stat-grid">
              <Stat label={tr('רווח כולל', 'Total net')} value={signed(total)} tone={tone(total)} />
              <Stat label={tr('ערבים', 'Nights')} value={String(my.length)} />
              <Stat label={tr('ערבים ברווח', 'Winning nights')} value={my.length ? `${Math.round((wins / my.length) * 100)}%` : '-'} />
              <Stat label={tr('ממוצע לערב', 'Avg per night')} value={my.length ? signed(total / my.length) : '-'} tone={tone(total)} />
              <Stat label={tr('הערב הכי טוב', 'Best night')} value={my.length ? signed(best) : '-'} tone={my.length ? tone(best) : ''} />
              <Stat label={tr('הערב הכי גרוע', 'Worst night')} value={my.length ? signed(worst) : '-'} tone={my.length ? tone(worst) : ''} />
            </div>
            <h3 className="section-title">{tr('ההיסטוריה שלי', 'My history')}</h3>
            {my.length === 0 ? (
              <div className="empty">{tr('עוד לא שיחקת ערב בכסף אמיתי', "You haven't played a real-money night yet")}</div>
            ) : (
              <div className="history">
                {my.map((r) => (
                  <button key={r.room_id} className="history-row" onClick={() => openRoom(r.room_id)}>
                    <GameGlyph type={r.game_type} />
                    <div className="grow">
                      <b dir="auto">{r.room_name}</b>
                      <div className="sub">{dateFmt(r.closed_at)}</div>
                    </div>
                    <span className={`net ${tone(Number(r.net))}`}>{signed(Number(r.net))}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'nights' &&
          (nights == null ? (
            <div className="center pad">
              <span className="spinner" />
            </div>
          ) : nights.length === 0 ? (
            <div className="empty">{tr('עוד אין ערבים סגורים', 'No closed nights yet')}</div>
          ) : (
            <div className="history">
              {nights.map((n) => (
                <button key={n.id} className="history-row" onClick={() => openRoom(n.id)}>
                  <GameGlyph type={n.game_type} />
                  <div className="grow">
                    <b dir="auto">{n.name}</b>
                    <div className="sub">{n.closed_at && dateFmt(n.closed_at)}</div>
                  </div>
                  <span className="chev">
                    {tr('קיזוז', 'Settle-up')} <Chev size={16} />
                  </span>
                </button>
              ))}
            </div>
          ))}
      </div>

      <Sheet open={!!openNight} onClose={() => setOpenNight(null)} title={openNight ? openNight.room.name : ''}>
        {openNight && <Settle room={openNight.room} ledger={openNight.ledger} moneyMode={openNight.room.money_mode} />}
        {openNight && (
          <>
            <h3 className="section-title">{tr('היסטוריית ידיים', 'Hand history')}</h3>
            <HandHistory roomId={openNight.room.id} myId={profile.id} />
          </>
        )}
      </Sheet>
    </div>
  );
}

function Stat({ label, value, tone = '' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="stat">
      <div className={`stat-value ${tone}`}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
