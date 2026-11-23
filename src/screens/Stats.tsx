// סטטיסטיקה: טבלת דירוג, סטטיסטיקה אישית והיסטוריית ערבים
import { useEffect, useState } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { fmt, signed } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { Sheet } from '../components/ui';
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

export function Stats({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const { tr, lang } = useI18n();
  const [tab, setTab] = useState<'board' | 'me' | 'nights'>('board');
  const [period, setPeriod] = useState<'all' | 'month'>('all');
  const [board, setBoard] = useState<LeaderRow[] | null>(null);
  const [mine, setMine] = useState<ResultRow[] | null>(null);
  const [nights, setNights] = useState<RoomRow[] | null>(null);
  const [openNight, setOpenNight] = useState<{ room: RoomRow; ledger: LedgerRow[] } | null>(null);

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
      .then(({ data }) => setNights((data ?? []) as RoomRow[]));
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
  const medal = (i: number) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`);

  const my = mine ?? [];
  const total = my.reduce((a, r) => a + Number(r.net), 0);
  const wins = my.filter((r) => Number(r.net) > 0).length;
  const best = my.length ? Math.max(...my.map((r) => Number(r.net))) : 0;
  const worst = my.length ? Math.min(...my.map((r) => Number(r.net))) : 0;
  const myRank = board ? board.findIndex((b) => b.user_id === profile.id) : -1;

  return (
    <div className="screen has-nav">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label={lang === 'he' ? 'חזרה' : 'Back'}>
          {lang === 'he' ? '➜' : '⬅'}
        </button>
        <h1>{tr('🏆 סטטיסטיקה', '🏆 Stats')}</h1>
        <span />
      </header>
      <div className="content">
        <div className="tabs">
          <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}>
            {tr('דירוג', 'Ranking')}
          </button>
          <button className={tab === 'me' ? 'active' : ''} onClick={() => setTab('me')}>
            {tr('שלי', 'Mine')}
          </button>
          <button className={tab === 'nights' ? 'active' : ''} onClick={() => setTab('nights')}>
            {tr('ערבים וחובות', 'Nights & debts')}
          </button>
        </div>
        <p className="hint center">{tr('נספרים רק שולחנות בכסף אמיתי שנסגרו 💰', 'Only closed real-money tables count 💰')}</p>

        {tab === 'board' && (
          <>
            <div className="seg">
              <button className={period === 'all' ? 'active' : ''} onClick={() => setPeriod('all')}>
                {tr('כל הזמנים', 'All time')}
              </button>
              <button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>
                {tr('החודש', 'This month')}
              </button>
            </div>
            {board == null ? (
              <div className="center">
                <span className="spinner" />
              </div>
            ) : board.length === 0 ? (
              <div className="empty">{tr('עוד אין תוצאות. סגרו ערב ראשון ותראו פה את הדירוג!', 'No results yet. Close your first night to see the ranking!')}</div>
            ) : (
              <div className="leaderboard">
                {board.map((b, i) => (
                  <div key={b.user_id} className={`leader-row ${b.user_id === profile.id ? 'me' : ''}`}>
                    <span className="rank">{medal(i)}</span>
                    <span className="avatar">{b.avatar}</span>
                    <div className="grow">
                      <b>{b.name}</b>
                      <div className="sub">
                        {b.games} {tr('ערבים', 'nights')} · {Math.round((Number(b.wins) / Math.max(1, Number(b.games))) * 100)}%{' '}
                        {tr('ברווח', 'winning')}
                      </div>
                    </div>
                    <span className={`net ${Number(b.net) > 0 ? 'pos' : Number(b.net) < 0 ? 'neg' : ''}`}>
                      {signed(Number(b.net))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'me' && (
          <>
            <div className="profile-card">
              <span className="big-avatar">{profile.avatar}</span>
              <div>
                <h2>{profile.name}</h2>
                {myRank >= 0 && (
                  <div className="sub">
                    {tr('מקום', 'Rank')} {myRank + 1} {tr('מתוך', 'of')} {board?.length}
                  </div>
                )}
              </div>
            </div>
            <div className="stat-grid">
              <Stat label={tr('רווח כולל', 'Total net')} value={signed(total)} tone={total > 0 ? 'pos' : total < 0 ? 'neg' : ''} />
              <Stat label={tr('ערבים', 'Nights')} value={String(my.length)} />
              <Stat label={tr('ערבים ברווח', 'Winning nights')} value={my.length ? `${Math.round((wins / my.length) * 100)}%` : '-'} />
              <Stat label={tr('ממוצע לערב', 'Avg per night')} value={my.length ? fmt(total / my.length) : '-'} />
              <Stat label={tr('הערב הכי טוב', 'Best night')} value={my.length ? signed(best) : '-'} tone="pos" />
              <Stat label={tr('הערב הכי גרוע', 'Worst night')} value={my.length ? fmt(worst) : '-'} tone="neg" />
            </div>
            <h3 className="section-title">{tr('📜 ההיסטוריה שלי', '📜 My history')}</h3>
            {my.length === 0 && <div className="empty">{tr('עוד לא שיחקת ערב בכסף אמיתי', "You haven't played a real-money night yet")}</div>}
            <div className="history">
              {my.map((r) => (
                <button key={r.room_id} className="history-row" onClick={() => openRoom(r.room_id)}>
                  <span>{r.game_type === 'blackjack' ? '🂡' : '♠️'}</span>
                  <div className="grow">
                    <b>{r.room_name}</b>
                    <div className="sub">{dateFmt(r.closed_at)}</div>
                  </div>
                  <span className={`net ${Number(r.net) > 0 ? 'pos' : Number(r.net) < 0 ? 'neg' : ''}`}>
                    {signed(Number(r.net))}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {tab === 'nights' && (
          <div className="history">
            {nights?.length === 0 && <div className="empty">{tr('עוד אין ערבים סגורים', 'No closed nights yet')}</div>}
            {(nights ?? []).map((n) => (
              <button key={n.id} className="history-row" onClick={() => openRoom(n.id)}>
                <span>{n.game_type === 'blackjack' ? '🂡' : '♠️'}</span>
                <div className="grow">
                  <b>{n.name}</b>
                  <div className="sub">{(n as unknown as { closed_at: string }).closed_at && dateFmt((n as unknown as { closed_at: string }).closed_at)}</div>
                </div>
                <span className="chev">{tr('לקיזוז ‹', 'Settle-up ›')}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={!!openNight} onClose={() => setOpenNight(null)} title={openNight ? `📊 ${openNight.room.name}` : ''}>
        {openNight && <Settle room={openNight.room} ledger={openNight.ledger} moneyMode={openNight.room.money_mode} />}
        {openNight && (
          <>
            <h3 className="section-title">{tr('📜 היסטוריית ידיים', '📜 Hand history')}</h3>
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
