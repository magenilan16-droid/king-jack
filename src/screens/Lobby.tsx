import { useCallback, useEffect, useState } from 'react';
import { KeyRound, ChevronLeft, ChevronRight, Bell, Download, Trash2 } from 'lucide-react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { isStandalone, isIOS } from '../lib/platform';
import { usePushSetup } from '../components/PushSetup';
import { Avatar } from '../components/Avatar';
import { ChipStack } from '../components/Chips';
import { fmt, signed } from '../lib/balances';
import { useI18n, count } from '../lib/i18n';
import { Sheet, AsyncButton, toast } from '../components/ui';
import { CreateSheet, type GamePick } from './CreateSheet';
import type { RoomState } from '../lib/useRoom';

interface LobbyRoom {
  id: string;
  code: string;
  name: string;
  game_type: 'blackjack' | 'holdem';
  money_mode: 'real' | 'demo';
  state: RoomState;
  created_at: string;
}

export function Lobby({
  profile,
  openTable,
  onInstall,
  onDebts,
  pendingJoin,
  clearPendingJoin,
}: {
  profile: Profile;
  openTable: (roomId: string) => void;
  onInstall: () => void;
  onDebts: () => void;
  pendingJoin: string | null;
  clearPendingJoin: () => void;
}) {
  const { tr, lang } = useI18n();
  const [rooms, setRooms] = useState<LobbyRoom[] | null>(null);
  const [sheet, setSheet] = useState<null | 'create' | 'join'>(null);
  const [createType, setCreateType] = useState<GamePick>('holdem');
  const [joinCode, setJoinCode] = useState('');
  const [joinRoom, setJoinRoom] = useState<LobbyRoom | null>(null);
  const push = usePushSetup(onInstall);
  const [removing, setRemoving] = useState<LobbyRoom | null>(null);
  const [month, setMonth] = useState<{ net: number; nights: number } | null>(null);
  const [debt, setDebt] = useState<{ owe: number; owed: number } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('game_rooms')
      .select('id, code, name, game_type, money_mode, state, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(40);
    const list = (data ?? []) as LobbyRoom[];
    // שולחן נחשב פעיל אם נפתח, שוחקה בו יד או הייתה בו קנייה ב-6 השעות האחרונות
    const since = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const ids = list.map((r) => r.id);
    const active = new Set<string>();
    if (ids.length) {
      const [h, l] = await Promise.all([
        supabase.from('game_hands').select('room_id').in('room_id', ids).gte('created_at', since),
        supabase.from('game_ledger').select('room_id').in('room_id', ids).gte('created_at', since),
      ]);
      for (const r of [...(h.data ?? []), ...(l.data ?? [])]) active.add((r as { room_id: string }).room_id);
    }
    setRooms(list.filter((r) => r.created_at > since || active.has(r.id) || r.state.players.some((p) => p.id === profile.id)));
  }, [profile.id]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms' }, () => load())
      .subscribe();
    const t = setInterval(load, 15000);
    return () => {
      clearInterval(t);
      supabase.removeChannel(ch);
    };
  }, [load]);

  // כרטיס הפתיחה: איך הלך לי החודש + חובות פתוחים
  useEffect(() => {
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    supabase
      .from('game_results')
      .select('net')
      .eq('user_id', profile.id)
      .gte('closed_at', since)
      .then(({ data }) => setMonth({ net: (data ?? []).reduce((a, r) => a + Number(r.net), 0), nights: data?.length ?? 0 }));
    supabase
      .from('game_debts')
      .select('from_user, to_user, amount')
      .eq('paid', false)
      .or('from_user.eq.' + profile.id + ',to_user.eq.' + profile.id)
      .then(({ data }) =>
        setDebt({
          owe: (data ?? []).filter((d) => d.from_user === profile.id).reduce((a, d) => a + Number(d.amount), 0),
          owed: (data ?? []).filter((d) => d.to_user === profile.id).reduce((a, d) => a + Number(d.amount), 0),
        }),
      );
  }, [profile.id]);

  // הגעה מקישור הזמנה
  useEffect(() => {
    if (!pendingJoin) return;
    openJoinByCode(pendingJoin);
    clearPendingJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoin]);

  async function openJoinByCode(code: string) {
    const c = code.trim().toUpperCase();
    const { data } = await supabase.from('game_rooms').select('id, code, name, game_type, money_mode, state, created_at').eq('code', c).eq('status', 'open').maybeSingle();
    if (!data) return toast(tr(`לא נמצא שולחן פתוח עם הקוד ${c}`, `No open table with code ${c}`), 'error');
    const r = data as LobbyRoom;
    if (r.state.players.some((p) => p.id === profile.id)) return openTable(r.id);
    setJoinRoom(r);
    setSheet('join');
  }

  const hour = new Date().getHours();
  const greet =
    hour < 5 ? tr('לילה טוב', 'Good night') : hour < 12 ? tr('בוקר טוב', 'Good morning') : hour < 18 ? tr('צהריים טובים', 'Good afternoon') : tr('ערב טוב', 'Good evening');
  const Chev = lang === 'he' ? ChevronLeft : ChevronRight;
  const isOmahaRoom = (r: LobbyRoom) => (r.state.settings as { variant?: string }).variant === 'omaha';
  const gameName = (r: LobbyRoom) =>
    r.game_type === 'blackjack' ? tr('בלאק ג׳ק', 'Blackjack') : isOmahaRoom(r) ? tr('אומהה', 'Omaha') : tr('טקסס הולדם', "Texas Hold'em");
  const limitsOf = (r: LobbyRoom): { l: string; v: string } =>
    'sb' in r.state.settings
      ? { l: tr('בליינדים', 'Blinds'), v: `${r.state.settings.sb}/${r.state.settings.bb}` }
      : 'minBet' in r.state.settings
        ? { l: tr('הימור', 'Bet'), v: `${r.state.settings.minBet}-${r.state.settings.maxBet}` }
        : { l: '', v: '' };
  const debtNet = debt ? debt.owed - debt.owe : 0;
  const debtSub = !debt
    ? ''
    : debt.owe > 0 && debt.owed > 0
      ? tr(`לשלם ₪${fmt(debt.owe)}, לקבל ₪${fmt(debt.owed)}`, `Pay ₪${fmt(debt.owe)}, get ₪${fmt(debt.owed)}`)
      : debt.owe > 0
        ? tr('לשלם', 'To pay')
        : debt.owed > 0
          ? tr('לקבל', 'To collect')
          : tr('הכל סגור', 'All settled');
  const openCreate = (t: GamePick) => {
    setCreateType(t);
    setSheet('create');
  };

  return (
    <div className="screen lobby has-nav">
      <header className="lobby-top">
        <div className="brand-row">
          <img src="icons/kj-192.png" alt="" className="brand-logo" />
          <span className="wordmark" translate="no">
            King Jack
          </span>
        </div>
      </header>

      <div className="content">
        {/* המקום שלי: חודש וחובות */}
        <section className="seat-card">
          <div className="sc-top">
            <Avatar name={profile.name} emoji={profile.avatar} size={46} />
            <div className="grow">
              <div className="sc-greet">{greet}</div>
              <div className="sc-name" dir="auto">
                {profile.name}
              </div>
            </div>
            {profile.is_premium && <span className="tag brass">Premium</span>}
          </div>
          <div className="sc-stats">
            <div className="sc-stat">
              <span className="sc-label">{tr('החודש', 'This month')}</span>
              <b className={`sc-num ${month && month.net > 0 ? 'pos' : month && month.net < 0 ? 'neg' : ''}`}>{month ? signed(month.net) : '…'}</b>
              <span className="sc-sub">{month ? count(month.nights, 'ערב אחד', 'ערבים', '1 night', 'nights') : ''}</span>
            </div>
            <button className="sc-stat link" onClick={onDebts}>
              <span className="sc-label">
                {tr('חובות פתוחים', 'Open debts')} <Chev size={14} />
              </span>
              <b className={`sc-num ${debtNet > 0 ? 'pos' : debtNet < 0 ? 'neg' : ''}`}>{debt ? (debtNet === 0 ? '0' : signed(debtNet, '₪')) : '…'}</b>
              <span className="sc-sub">{debtSub}</span>
            </button>
          </div>
        </section>

        {!isStandalone() && (
          <button className="banner" onClick={onInstall}>
            <span className="banner-ic">
              <Download size={19} />
            </span>
            <div className="grow">
              <b>{tr('התקנה למסך הבית', 'Install on your home screen')}</b>
              <div className="sub">{isIOS ? tr('באייפון זה גם מה שמפעיל התראות', 'On iPhone this is also what enables notifications') : tr('נפתח כמו אפליקציה, בלי דפדפן', 'Opens like an app, no browser bar')}</div>
            </div>
            <Chev size={18} className="banner-chev" />
          </button>
        )}
        {(isStandalone() || !isIOS) && push.state !== null && push.state !== 'on' && push.state !== 'unsupported' && (
          <div className="banner">
            <span className="banner-ic">
              <Bell size={19} />
            </span>
            <div className="grow">
              <b>{push.state === 'denied' ? tr('ההתראות חסומות', 'Notifications are blocked') : tr('התראות כבויות', 'Notifications are off')}</b>
              <div className="sub">{tr('הזמנות, תור שלך וזירוזים מחברים', 'Invites, your turn and nudges from friends')}</div>
            </div>
            {push.state === 'denied' ? (
              <button className="btn small ghost" onClick={() => push.openHelp('denied')}>
                {tr('איך משחררים', 'How to fix')}
              </button>
            ) : (
              <AsyncButton className="btn small primary" onClick={push.run}>
                {tr('הפעלה', 'Turn on')}
              </AsyncButton>
            )}
          </div>
        )}
        {push.sheet}

        {/* פתיחת שולחן */}
        <div className="section-head">
          <h2>{tr('פתיחת שולחן', 'Open a table')}</h2>
        </div>
        <div className="game-tiles">
          <button className="game-tile holdem" onClick={() => openCreate('holdem')}>
            <span className="gt-felt" aria-hidden="true">
              <span className="gp-card">A</span>
              <span className="gp-card red">K</span>
            </span>
            <span className="gt-text">
              <b>{tr('טקסס הולדם', "Texas Hold'em")}</b>
              <small>{tr('2 קלפים ביד', '2 hole cards')}</small>
            </span>
          </button>
          <button className="game-tile omaha" onClick={() => openCreate('omaha')}>
            <span className="gt-felt" aria-hidden="true">
              <span className="gp-card">A</span>
              <span className="gp-card red">A</span>
              <span className="gp-card">K</span>
              <span className="gp-card red">Q</span>
            </span>
            <span className="gt-text">
              <b>{tr('אומהה', 'Omaha')}</b>
              <small>{tr('4 קלפים ביד', '4 hole cards')}</small>
            </span>
          </button>
          <button className="game-tile blackjack" onClick={() => openCreate('blackjack')}>
            <span className="gt-felt" aria-hidden="true">
              <span className="gp-21">21</span>
            </span>
            <span className="gt-text">
              <b>{tr('בלאק ג׳ק', 'Blackjack')}</b>
              <small>{tr('מול הבית או חבר', 'House or a friend')}</small>
            </span>
          </button>
        </div>
        <button
          className="join-code-btn"
          onClick={() => {
            setJoinRoom(null);
            setJoinCode('');
            setSheet('join');
          }}
        >
          <KeyRound size={17} /> {tr('הצטרפות עם קוד שולחן', 'Join with a table code')}
        </button>

        {/* שולחנות פעילים */}
        <div className="section-head">
          <h2>
            <span className="live-dot" aria-hidden="true" /> {tr('שולחנות פעילים', 'Live tables')}
          </h2>
          {rooms && rooms.length > 0 && <span className="count-pill">{rooms.length}</span>}
        </div>
        {rooms == null && (
          <div className="skeleton-list">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}
        {rooms?.length === 0 && <div className="empty">{tr('אין כרגע שולחנות פעילים. פתחו שולחן והזמינו את החבר׳ה.', 'No live tables right now. Open one and invite the crew.')}</div>}
        <div className="room-list">
          {rooms?.map((r) => {
            const humans = r.state.players.filter((p) => !p.isBot);
            const bots = r.state.players.length - humans.length;
            const seated = r.state.players.some((p) => p.id === profile.id);
            const canRemove = r.state.hostId === profile.id || profile.is_admin;
            const go = () => (seated ? openTable(r.id) : openJoinByCode(r.code));
            const lim = limitsOf(r);
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                className={`room-card ${seated ? 'seated' : ''} ${r.game_type}`}
                onClick={go}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go();
                  }
                }}
              >
                <div className={`room-badge ${r.game_type} ${isOmahaRoom(r) ? 'omaha' : ''}`} aria-hidden="true">
                  {r.game_type === 'blackjack' ? '21' : isOmahaRoom(r) ? 'PLO' : '♠'}
                </div>
                <div className="grow">
                  <div className="room-name" dir="auto">
                    <span className="rn-text">{r.name}</span>
                    {r.money_mode === 'demo' && <span className="tag">{tr('אימון', 'Practice')}</span>}
                  </div>
                  <div className="room-sub room-facts">
                    <span>{gameName(r)}</span>
                    <span>
                      {lim.l} <b dir="ltr">{lim.v}</b>
                    </span>
                    <span>
                      {tr('קנייה', 'Buy-in')} <b>{fmt(r.state.settings.buyIn)}</b>
                    </span>
                  </div>
                  <div className="avatar-stack">
                    {humans.slice(0, 5).map((p) => (
                      <Avatar key={p.id} name={p.name} size={22} className="stacked" />
                    ))}
                    <span className="players-count">
                      {count(humans.length, 'שחקן אחד', 'שחקנים', '1 player', 'players')}
                      {bots > 0 && `, ${count(bots, 'בוט אחד', 'בוטים', '1 bot', 'bots')}`}
                    </span>
                  </div>
                </div>
                <div className="room-side">
                  <span className="room-cta">{seated ? tr('חזרה', 'Back') : tr('הצטרפות', 'Join')}</span>
                  {canRemove && (
                    <button
                      className="room-del"
                      aria-label={tr('הסרת השולחן', 'Remove table')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoving(r);
                      }}
                    >
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Sheet
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={tr('הסרת השולחן', 'Remove the table')}
        footer={
          removing && (
            <div className="row-btns">
              <button className="btn ghost" onClick={() => setRemoving(null)}>
                {tr('ביטול', 'Cancel')}
              </button>
              <AsyncButton
                className="btn danger"
                onClick={async () => {
                  const r = await gameCall<{ ok: boolean; deleted?: boolean; closed?: boolean }>({ op: 'removeRoom', roomId: removing.id });
                  toast(r.deleted ? tr('השולחן נמחק', 'Table deleted') : tr('השולחן נסגר והחובות חושבו', 'Table closed and debts settled'), 'win');
                  setRemoving(null);
                  load();
                }}
              >
                {removing.money_mode === 'demo' ? tr('מחיקת השולחן', 'Delete table') : tr('סגירת השולחן', 'Close table')}
              </AsyncButton>
            </div>
          )
        }
      >
        {removing && (
          <div className="confirm-remove">
            <p dir="auto">
              <b>{removing.name}</b>
            </p>
            <p>
              {removing.money_mode === 'demo'
                ? tr('שולחן אימון. הוא יימחק לגמרי, כולל ההיסטוריה שלו.', "Practice table. It's deleted completely, including its history.")
                : tr(
                    'שולחן כסף אמיתי. הוא ייסגר, כל שחקן יוצא עם הז׳טונים שיש לו עכשיו, והחובות מחושבים אוטומטית.',
                    'Real-money table. It closes, everyone cashes out with their current chips, and debts are settled automatically.',
                  )}
            </p>
          </div>
        )}
      </Sheet>

      <CreateSheet open={sheet === 'create'} type={createType} setType={setCreateType} onClose={() => setSheet(null)} onCreated={openTable} myName={profile.name} />

      <Sheet
        open={sheet === 'join'}
        onClose={() => setSheet(null)}
        title={joinRoom ? joinRoom.name : tr('הצטרפות עם קוד', 'Join with a code')}
        footer={
          joinRoom && (
            <AsyncButton
              className="btn primary block big"
              onClick={async () => {
                const r = await gameCall({ op: 'join', code: joinRoom.code });
                setSheet(null);
                openTable(r.roomId);
              }}
            >
              {tr(`התיישבות ב-${fmt(joinRoom.state.settings.buyIn)}`, `Sit down for ${fmt(joinRoom.state.settings.buyIn)}`)}
            </AsyncButton>
          )
        }
      >
        {!joinRoom ? (
          <form
            className="code-form"
            onSubmit={(e) => {
              e.preventDefault();
              openJoinByCode(joinCode);
            }}
          >
            <p className="hint">{tr('את הקוד (4 אותיות) רואים בראש השולחן אצל מי שפתח אותו.', 'The 4-letter code is shown at the top of the table.')}</p>
            <input
              className="input code-input"
              placeholder="ABCD"
              value={joinCode}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              aria-label={tr('קוד שולחן', 'Table code')}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              autoFocus
            />
            <button className="btn primary block big" disabled={joinCode.length !== 4}>
              {tr('חיפוש שולחן', 'Find table')}
            </button>
          </form>
        ) : (
          <div className="join-box">
            <div className="facts">
              <div>
                <span>{tr('משחק', 'Game')}</span>
                <b>{gameName(joinRoom)}</b>
              </div>
              <div>
                <span>{limitsOf(joinRoom).l}</span>
                <b className="num" dir="ltr">
                  {limitsOf(joinRoom).v}
                </b>
              </div>
              <div>
                <span>{tr('שחקנים', 'Players')}</span>
                <b className="num">{joinRoom.state.players.length}</b>
              </div>
              <div>
                <span>{tr('סוג', 'Type')}</span>
                <b>{joinRoom.money_mode === 'demo' ? tr('אימון, לא נספר בחובות', 'Practice, not in debts') : tr('כסף אמיתי, נרשם בחובות', 'Real money, recorded')}</b>
              </div>
            </div>
            <div className="buyin-amount">
              <ChipStack amount={joinRoom.state.settings.buyIn} size={26} label={false} />
              <span>{fmt(joinRoom.state.settings.buyIn)}</span>
            </div>
            <div className="hint center">{tr('קנייה קבועה בשולחן הזה', 'Fixed buy-in at this table')}</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
