import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Users, ChevronLeft, ChevronRight, Bell, Download, Radio, TrendingUp, Wallet } from 'lucide-react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { isStandalone, isIOS } from '../lib/platform';
import { pushSupported, pushPermission, enablePush } from '../lib/push';
import { fmt } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { Sheet, AsyncButton, NumberStepper, toast } from '../components/ui';
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
  const [createType, setCreateType] = useState<'holdem' | 'blackjack'>('holdem');
  const [joinCode, setJoinCode] = useState('');
  const [joinRoom, setJoinRoom] = useState<LobbyRoom | null>(null);
  const [perm, setPerm] = useState(pushPermission());
  const [month, setMonth] = useState<{ net: number; nights: number } | null>(null);
  const [debt, setDebt] = useState<{ owe: number; owed: number }>({ owe: 0, owed: 0 });

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
  const gameName = (t: string) => (t === 'blackjack' ? tr('בלאק ג׳ק', 'Blackjack') : tr('טקסס הולדם', "Texas Hold'em"));
  const limitsOf = (r: LobbyRoom) =>
    'sb' in r.state.settings
      ? `${tr('בליינדים', 'Blinds')} ${r.state.settings.sb}/${r.state.settings.bb}`
      : 'minBet' in r.state.settings
        ? `${tr('הימור', 'Bet')} ${r.state.settings.minBet}-${r.state.settings.maxBet}`
        : '';

  return (
    <div className="screen lobby has-nav">
      <header className="lobby-top">
        <div className="brand-row">
          <img src="icons/icon-192.png" alt="" className="brand-logo" />
          <span className="wordmark">King Jack</span>
        </div>
      </header>

      <div className="content">
        {/* כרטיס פתיחה */}
        <div className="hero-card">
          <div className="hero-top">
            <span className="hero-avatar">{profile.avatar}</span>
            <div className="grow">
              <div className="hero-greet">{greet},</div>
              <div className="hero-name" dir="auto">
                {profile.name} {profile.is_premium && <span className="tag gold">⭐ Premium</span>}
              </div>
            </div>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hs-label">
                <TrendingUp size={14} /> {tr('החודש', 'This month')}
              </div>
              <div className={`hs-value ${month && month.net > 0 ? 'pos' : month && month.net < 0 ? 'neg' : ''}`}>
                {month ? `${month.net > 0 ? '+' : ''}${fmt(month.net)}` : '…'}
              </div>
              <div className="hs-sub">
                {month?.nights ?? 0} {tr('ערבים', 'nights')}
              </div>
            </div>
            <button className="hs-debts" onClick={onDebts}>
              <div className="hs-label">
                <Wallet size={14} /> {tr('חובות פתוחים', 'Open debts')}
              </div>
              <div className="hs-value small">
                {debt.owe > 0 && <span className="neg">-₪{fmt(debt.owe)}</span>} {debt.owed > 0 && <span className="pos">+₪{fmt(debt.owed)}</span>}
                {debt.owe === 0 && debt.owed === 0 && <span>{tr('נקי ✨', 'All clear ✨')}</span>}
              </div>
            </button>
          </div>
        </div>

        {!isStandalone() && (
          <button className="banner install-banner" onClick={onInstall}>
            <Download size={22} />
            <div className="grow">
              <b>{tr('התקינו את האפליקציה למסך הבית', 'Install the app on your home screen')}</b>
              <div className="sub">{isIOS ? tr('אייפון: 4 צעדים קצרים, ומקבלים גם התראות', 'iPhone: 4 quick steps, plus notifications') : tr('לחיצה אחת - ואתם בפנים', "One tap and you're in")}</div>
            </div>
            <Chev size={20} />
          </button>
        )}
        {pushSupported() && perm === 'default' && (
          <div className="banner">
            <Bell size={22} />
            <div className="grow">
              <b>{tr('הפעילו התראות', 'Turn on notifications')}</b>
              <div className="sub">{tr('הזמנות, "התור שלך" וזירוזים מחברים', 'Invites, "your turn" and nudges from friends')}</div>
            </div>
            <AsyncButton
              className="btn small primary"
              onClick={async () => {
                await enablePush();
                setPerm(pushPermission());
                toast(tr('התראות הופעלו 🔔', 'Notifications on 🔔'), 'win');
              }}
            >
              {tr('הפעלה', 'Enable')}
            </AsyncButton>
          </div>
        )}

        {/* אריחי משחק */}
        <div className="section-head">
          <h2>{tr('פתיחת שולחן', 'Open a table')}</h2>
        </div>
        <div className="game-tiles">
          <button
            className="game-tile holdem"
            onClick={() => {
              setCreateType('holdem');
              setSheet('create');
            }}
          >
            <div className="tile-art">
              <span className="mini-card r1">A♠</span>
              <span className="mini-card r2 red">K♥</span>
            </div>
            <div className="tile-title">{tr('טקסס הולדם', "Texas Hold'em")}</div>
            <div className="tile-sub">{tr('עד 10 שחקנים', 'Up to 10 players')}</div>
          </button>
          <button
            className="game-tile blackjack"
            onClick={() => {
              setCreateType('blackjack');
              setSheet('create');
            }}
          >
            <div className="tile-art">
              <span className="tile-21">21</span>
            </div>
            <div className="tile-title">{tr('בלאק ג׳ק', 'Blackjack')}</div>
            <div className="tile-sub">{tr('מול הבית או בנק', 'House or friend bank')}</div>
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
          <KeyRound size={18} /> {tr('הצטרפות עם קוד שולחן', 'Join with a table code')}
        </button>

        {/* שולחנות פעילים */}
        <div className="section-head">
          <h2>
            <Radio size={16} className="live-icon" /> {tr('שולחנות פעילים', 'Live tables')}
          </h2>
          {rooms && rooms.length > 0 && <span className="count-pill">{rooms.length}</span>}
        </div>
        {rooms == null && (
          <div className="skeleton-list">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        )}
        {rooms?.length === 0 && <div className="empty">{tr('אין שולחנות פעילים. פתחו אחד והזמינו את החבר׳ה!', 'No live tables. Open one and invite the crew!')}</div>}
        <div className="room-list">
          {rooms?.map((r) => {
            const humans = r.state.players.filter((p) => !p.isBot);
            const bots = r.state.players.length - humans.length;
            const seated = r.state.players.some((p) => p.id === profile.id);
            return (
              <button key={r.id} className={`room-card ${seated ? 'seated' : ''} ${r.game_type}`} onClick={() => (seated ? openTable(r.id) : openJoinByCode(r.code))}>
                <div className={`room-badge ${r.game_type}`}>{r.game_type === 'blackjack' ? '21' : '♠'}</div>
                <div className="grow">
                  <div className="room-name" dir="auto">
                    {r.name}
                    {r.money_mode === 'demo' && <span className="tag">{tr('אימון', 'Practice')}</span>}
                  </div>
                  <div className="room-sub">
                    {gameName(r.game_type)} · {limitsOf(r)} · {tr('קנייה', 'Buy-in')} {fmt(r.state.settings.buyIn)}
                  </div>
                  <div className="avatar-stack">
                    {humans.slice(0, 6).map((p) => (
                      <span key={p.id} className="av">
                        {p.avatar}
                      </span>
                    ))}
                    {bots > 0 && <span className="av bot">+{bots}🤖</span>}
                    <span className="players-count">
                      <Users size={13} /> {humans.length}
                    </span>
                  </div>
                </div>
                <div className="room-cta">{seated ? tr('חזרה', 'Back') : tr('הצטרפות', 'Join')}</div>
              </button>
            );
          })}
        </div>
      </div>

      <CreateSheet open={sheet === 'create'} type={createType} setType={setCreateType} onClose={() => setSheet(null)} onCreated={openTable} myName={profile.name} />

      <Sheet open={sheet === 'join'} onClose={() => setSheet(null)} title={tr('הצטרפות לשולחן', 'Join a table')}>
        {!joinRoom ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              openJoinByCode(joinCode);
            }}
          >
            <input className="input code-input" placeholder="ABCD" value={joinCode} maxLength={4} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} autoFocus />
            <button className="btn primary block big" disabled={joinCode.length !== 4}>
              {tr('חיפוש שולחן', 'Find table')}
            </button>
          </form>
        ) : (
          <div className="join-box">
            <div className={`room-badge big ${joinRoom.game_type}`}>{joinRoom.game_type === 'blackjack' ? '21' : '♠'}</div>
            <b className="join-name" dir="auto">
              {joinRoom.name}
            </b>
            <div className="room-sub">
              {gameName(joinRoom.game_type)} · {limitsOf(joinRoom)}
            </div>
            <div className="room-sub">{joinRoom.money_mode === 'demo' ? tr('🎓 אימון - לא נספר בחובות', '🎓 Practice - not counted in debts') : tr('💰 כסף אמיתי - נרשם בחובות', '💰 Real money - recorded in debts')}</div>
            <div className="buyin-amount">
              <span className="chip-stack big" />
              {fmt(joinRoom.state.settings.buyIn)}
            </div>
            <div className="hint center">{tr('קנייה קבועה בשולחן הזה', 'Fixed buy-in at this table')}</div>
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
          </div>
        )}
      </Sheet>
    </div>
  );
}

function CreateSheet({
  open,
  type,
  setType,
  onClose,
  onCreated,
  myName,
}: {
  open: boolean;
  type: 'holdem' | 'blackjack';
  setType: (t: 'holdem' | 'blackjack') => void;
  onClose: () => void;
  onCreated: (id: string) => void;
  myName: string;
}) {
  const { tr } = useI18n();
  const [money, setMoney] = useState<'real' | 'demo'>('real');
  const [name, setName] = useState('');
  const [buyIn, setBuyIn] = useState(200);
  const [bb, setBb] = useState(2);
  const [blindUp, setBlindUp] = useState(0);
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(200);
  const [dealerMode, setDealerMode] = useState<'house' | 'player'>('house');
  const [bots, setBots] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState(45);
  const [maxRebuys, setMaxRebuys] = useState<number | null>(null);
  const defaultName = tr(`השולחן של ${myName}`, `${myName}'s table`);

  return (
    <Sheet open={open} onClose={onClose} title={tr('שולחן חדש', 'New table')}>
      <div className="seg big">
        <button className={type === 'holdem' ? 'active' : ''} onClick={() => setType('holdem')}>
          ♠ {tr('טקסס הולדם', "Texas Hold'em")}
        </button>
        <button className={type === 'blackjack' ? 'active' : ''} onClick={() => setType('blackjack')}>
          21 {tr('בלאק ג׳ק', 'Blackjack')}
        </button>
      </div>
      <div className="seg">
        <button className={money === 'real' ? 'active' : ''} onClick={() => setMoney('real')}>
          {tr('💰 כסף אמיתי', '💰 Real money')}
        </button>
        <button className={money === 'demo' ? 'active' : ''} onClick={() => setMoney('demo')}>
          {tr('🎓 אימון', '🎓 Practice')}
        </button>
      </div>
      <p className="hint">
        {money === 'real'
          ? tr('כל קנייה ויציאה נרשמות, ובסוף הערב מקבלים קיזוז חובות.', 'Every buy-in and cash-out is recorded, and at the end of the night you get a settle-up.')
          : tr('כסף משחק בלבד - לא נספר בחובות ובדירוג.', 'Play money only - not counted in debts or rankings.')}
      </p>
      <label>
        {tr('שם השולחן', 'Table name')}
        <input className="input" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      <div className="label">{tr('קנייה קבועה (כולם נכנסים באותו סכום)', 'Fixed buy-in (everyone buys in for the same amount)')}</div>
      <NumberStepper value={buyIn} onChange={setBuyIn} step={50} min={10} />
      {type === 'holdem' ? (
        <>
          <div className="label">{tr('ביג בליינד (הסמול = חצי)', 'Big blind (small = half)')}</div>
          <NumberStepper value={bb} onChange={setBb} step={2} min={2} />
          <div className="label">{tr('בליינדים עולים (כמו בטורניר)', 'Rising blinds (tournament style)')}</div>
          <div className="seg">
            {[0, 10, 15, 20, 30].map((m) => (
              <button key={m} className={blindUp === m ? 'active' : ''} onClick={() => setBlindUp(m)}>
                {m === 0 ? tr('קבועים', 'Fixed') : tr(`כל ${m} ד׳`, `${m} min`)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="label">{tr('הימור מינימום / מקסימום', 'Minimum / maximum bet')}</div>
          <div className="row gap">
            <NumberStepper value={minBet} onChange={setMinBet} step={5} min={1} />
            <NumberStepper value={maxBet} onChange={setMaxBet} step={50} min={minBet} />
          </div>
          <div className="label">{tr('מי הדילר?', 'Who is the dealer?')}</div>
          <div className="seg">
            <button className={dealerMode === 'house' ? 'active' : ''} onClick={() => setDealerMode('house')}>
              {tr('🖥️ המחשב', '🖥️ The computer')}
            </button>
            <button className={dealerMode === 'player' ? 'active' : ''} onClick={() => setDealerMode('player')}>
              {tr('🏦 חבר כבנק', '🏦 A friend (bank)')}
            </button>
          </div>
        </>
      )}
      <div className="label">{tr('קניות חוזרות לכל שחקן', 'Rebuys per player')}</div>
      <div className="seg">
        {[null, 0, 1, 2, 3].map((n) => (
          <button key={String(n)} className={maxRebuys === n ? 'active' : ''} onClick={() => setMaxRebuys(n)}>
            {n === null ? tr('ללא הגבלה', 'Unlimited') : n === 0 ? tr('בלי', 'None') : n}
          </button>
        ))}
      </div>
      <div className="label">{tr('זמן לכל תור', 'Time per turn')}</div>
      <div className="seg">
        {[30, 45, 60, 90].map((n) => (
          <button key={n} className={turnSeconds === n ? 'active' : ''} onClick={() => setTurnSeconds(n)}>
            {n}
            {tr(' שנ׳', 's')}
          </button>
        ))}
      </div>
      <div className="label">{tr('בוטים (שחקני מחשב)', 'Bots (computer players)')}</div>
      <div className="seg">
        {[0, 1, 2, 3].map((n) => (
          <button key={n} className={bots === n ? 'active' : ''} onClick={() => setBots(n)}>
            {n === 0 ? tr('בלי', 'None') : `${n} 🤖`}
          </button>
        ))}
      </div>
      <AsyncButton
        className="btn primary block big"
        onClick={async () => {
          const settings =
            type === 'holdem'
              ? { bb, buyIn, turnSeconds, blindUpMinutes: blindUp, maxRebuys }
              : { minBet, maxBet, buyIn, dealerMode, turnSeconds, maxRebuys };
          const r = await gameCall<{ roomId: string; code: string }>({ op: 'create', gameType: type, name: name.trim() || defaultName, moneyMode: money, settings });
          for (let i = 0; i < bots; i++) await gameCall({ op: 'act', roomId: r.roomId, move: { type: 'addBot' } });
          onClose();
          onCreated(r.roomId);
          toast(tr(`השולחן נפתח! קוד: ${r.code}`, `Table opened! Code: ${r.code}`), 'win');
        }}
      >
        {tr('פתיחת שולחן', 'Open table')}
      </AsyncButton>
    </Sheet>
  );
}
