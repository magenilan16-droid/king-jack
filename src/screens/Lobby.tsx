import { useCallback, useEffect, useState } from 'react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { AVATARS, allThemes, type Theme, type ThemeId } from '../lib/themes';
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
  theme,
  setTheme,
  tipsOn,
  setTipsOn,
  openTable,
  onStats,
  onInstall,
  pendingJoin,
  clearPendingJoin,
  onProfileChange,
}: {
  profile: Profile;
  theme: Theme;
  setTheme: (t: ThemeId) => void;
  tipsOn: boolean;
  setTipsOn: (v: boolean) => void;
  openTable: (roomId: string) => void;
  onStats: () => void;
  onInstall: () => void;
  pendingJoin: string | null;
  clearPendingJoin: () => void;
  onProfileChange: () => void;
}) {
  const { tr, lang, setLang } = useI18n();
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);
  const [sheet, setSheet] = useState<null | 'create' | 'join' | 'settings'>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinRoom, setJoinRoom] = useState<LobbyRoom | null>(null);
  const [buyIn, setBuyIn] = useState(500);
  const [perm, setPerm] = useState(pushPermission());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('game_rooms')
      .select('id, code, name, game_type, money_mode, state, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(40);
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    setRooms(
      ((data ?? []) as LobbyRoom[]).filter((r) => r.state.players.some((p) => !p.isBot) || new Date(r.created_at).getTime() > dayAgo),
    );
  }, []);

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

  // הגעה מקישור הזמנה
  useEffect(() => {
    if (!pendingJoin) return;
    openJoinByCode(pendingJoin);
    clearPendingJoin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoin]);

  async function openJoinByCode(code: string) {
    const c = code.trim().toUpperCase();
    const { data } = await supabase
      .from('game_rooms')
      .select('id, code, name, game_type, money_mode, state, created_at')
      .eq('code', c)
      .eq('status', 'open')
      .maybeSingle();
    if (!data) return toast(tr(`לא נמצא שולחן פתוח עם הקוד ${c}`, `No open table with code ${c}`), 'error');
    const r = data as LobbyRoom;
    if (r.state.players.some((p) => p.id === profile.id)) return openTable(r.id);
    setJoinRoom(r);
    setBuyIn(r.state.settings.buyIn);
    setSheet('join');
  }

  const installed = isStandalone();
  const gameName = (t: string) => (t === 'blackjack' ? tr('בלאק ג׳ק', 'Blackjack') : tr('טקסס הולדם', "Texas Hold'em"));

  return (
    <div className="screen lobby">
      <header className="topbar">
        <div className="me-chip" onClick={() => setSheet('settings')}>
          <span className="avatar">{profile.avatar}</span>
          <span>{profile.name}</span>
          {profile.is_premium && <span className="tag gold">⭐</span>}
        </div>
        <div className="brand">👑 King Jack</div>
        <div className="top-actions">
          <button className="icon-btn" onClick={onStats} aria-label={tr('סטטיסטיקה', 'Stats')}>
            🏆
          </button>
          <button className="icon-btn" onClick={() => setSheet('settings')} aria-label={tr('הגדרות', 'Settings')}>
            ⚙️
          </button>
        </div>
      </header>

      <div className="content">
        {!installed && (
          <button className="banner install-banner" onClick={onInstall}>
            <span>📲</span>
            <div className="grow">
              <b>{tr('התקינו את האפליקציה למסך הבית', 'Install the app on your home screen')}</b>
              <div className="sub">
                {isIOS ? tr('אייפון: 4 צעדים קצרים, ומקבלים גם התראות', 'iPhone: 4 quick steps, plus notifications') : tr('לחיצה אחת - ואתם בפנים', "One tap and you're in")}
              </div>
            </div>
            <span className="chev">{lang === 'he' ? '‹' : '›'}</span>
          </button>
        )}
        {pushSupported() && perm === 'default' && (
          <div className="banner">
            <span>🔔</span>
            <div className="grow">
              <b>{tr('הפעילו התראות', 'Turn on notifications')}</b>
              <div className="sub">{tr('כדי לדעת מתי חבר מזמין אתכם לשחק', 'So you know when a friend invites you')}</div>
            </div>
            <AsyncButton
              className="btn small"
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

        <div className="big-actions">
          <button className="big-action create" onClick={() => setSheet('create')}>
            <span className="emoji">➕</span>
            {tr('פתיחת שולחן', 'New table')}
          </button>
          <button
            className="big-action join"
            onClick={() => {
              setJoinRoom(null);
              setJoinCode('');
              setSheet('join');
            }}
          >
            <span className="emoji">🔑</span>
            {tr('הצטרפות עם קוד', 'Join with code')}
          </button>
        </div>

        <h2 className="section-title">{tr('🟢 שולחנות פתוחים', '🟢 Open tables')}</h2>
        {rooms.length === 0 && (
          <div className="empty">{tr('אין שולחנות פתוחים כרגע. פתחו אחד והזמינו את החבר׳ה!', 'No open tables right now. Open one and invite the crew!')}</div>
        )}
        <div className="room-list">
          {rooms.map((r) => {
            const humans = r.state.players.filter((p) => !p.isBot);
            const bots = r.state.players.length - humans.length;
            const seated = r.state.players.some((p) => p.id === profile.id);
            return (
              <button key={r.id} className={`room-card ${seated ? 'seated' : ''}`} onClick={() => (seated ? openTable(r.id) : openJoinByCode(r.code))}>
                <div className="room-icon">{r.game_type === 'blackjack' ? '🂡' : '♠️'}</div>
                <div className="grow">
                  <div className="room-name">
                    {r.name} {r.money_mode === 'demo' && <span className="tag">{tr('🎓 אימון', '🎓 Practice')}</span>}
                  </div>
                  <div className="room-sub">
                    {gameName(r.game_type)} · {humans.length} {tr('שחקנים', 'players')}
                    {bots ? ` + ${bots} 🤖` : ''} · {tr('קוד', 'code')} {r.code}
                  </div>
                  <div className="room-avatars">{humans.map((p) => p.avatar).join(' ')}</div>
                </div>
                <div className="room-cta">{seated ? tr('חזרה ▶', 'Back ▶') : tr('הצטרפות', 'Join')}</div>
              </button>
            );
          })}
        </div>
      </div>

      <CreateSheet open={sheet === 'create'} onClose={() => setSheet(null)} onCreated={openTable} myName={profile.name} />

      <Sheet open={sheet === 'join'} onClose={() => setSheet(null)} title={tr('🔑 הצטרפות לשולחן', '🔑 Join a table')}>
        {!joinRoom ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              openJoinByCode(joinCode);
            }}
          >
            <input
              className="input code-input"
              placeholder={tr('קוד (4 תווים)', 'Code (4 characters)')}
              value={joinCode}
              maxLength={4}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              autoFocus
            />
            <button className="btn primary block big" disabled={joinCode.length !== 4}>
              {tr('חיפוש שולחן', 'Find table')}
            </button>
          </form>
        ) : (
          <div>
            <div className="join-room-info">
              <div className="room-icon">{joinRoom.game_type === 'blackjack' ? '🂡' : '♠️'}</div>
              <div>
                <b>{joinRoom.name}</b>
                <div className="room-sub">
                  {gameName(joinRoom.game_type)} ·{' '}
                  {'minBet' in joinRoom.state.settings
                    ? `${tr('הימור', 'Bet')} ${joinRoom.state.settings.minBet}-${joinRoom.state.settings.maxBet}`
                    : 'sb' in joinRoom.state.settings
                      ? `${tr('בליינדים', 'Blinds')} ${joinRoom.state.settings.sb}/${joinRoom.state.settings.bb}`
                      : ''}
                </div>
                <div className="room-sub">
                  {joinRoom.money_mode === 'demo'
                    ? tr('🎓 אימון - לא נספר בחובות', '🎓 Practice - not counted in debts')
                    : tr('💰 כסף אמיתי - נרשם בחובות', '💰 Real money - recorded in debts')}
                </div>
              </div>
            </div>
            <div className="label">{tr('עם כמה מתיישבים?', 'How much are you buying in for?')}</div>
            <NumberStepper value={buyIn} onChange={setBuyIn} step={Math.max(1, Math.round(joinRoom.state.settings.buyIn / 4))} min={1} />
            <AsyncButton
              className="btn primary block big"
              onClick={async () => {
                const r = await gameCall({ op: 'join', code: joinRoom.code, buyIn });
                setSheet(null);
                openTable(r.roomId);
              }}
            >
              {tr(`התיישבות עם ${fmt(buyIn)} 🪑`, `Sit down with ${fmt(buyIn)} 🪑`)}
            </AsyncButton>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'settings'} onClose={() => setSheet(null)} title={tr('⚙️ הגדרות', '⚙️ Settings')}>
        <div className="label">{tr('שפה', 'Language')}</div>
        <div className="seg">
          <button className={lang === 'he' ? 'active' : ''} onClick={() => setLang('he')}>
            עברית
          </button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
            English
          </button>
        </div>
        <div className="label">{tr('ערכת נושא (רק אצלך)', 'Theme (only on your phone)')}</div>
        <div className="theme-picker">
          {allThemes(lang).map((t) => (
            <button key={t.id} className={`theme-opt ${t.id === theme.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>
              <span>{t.emoji}</span>
              {t.name}
            </button>
          ))}
        </div>
        <div className="label">{tr('הדמות שלי', 'My avatar')}</div>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar-opt ${a === profile.avatar ? 'active' : ''}`}
              onClick={async () => {
                await supabase.rpc('game_update_profile', { p_name: profile.name, p_avatar: a });
                onProfileChange();
              }}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="menu-list">
          <label className="menu-item toggle">
            <span>{tr('💡 טיפים חכמים בזמן משחק', '💡 Smart in-game tips')}</span>
            <input type="checkbox" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          {pushSupported() ? (
            <AsyncButton
              className="menu-item"
              onClick={async () => {
                await enablePush();
                setPerm(pushPermission());
                toast(tr('התראות פעילות 🔔', 'Notifications are on 🔔'), 'win');
              }}
            >
              {tr('🔔 התראות:', '🔔 Notifications:')}{' '}
              {perm === 'granted'
                ? tr('פעילות ✔ (לחצו לרענון)', 'on ✔ (tap to refresh)')
                : perm === 'denied'
                  ? tr('חסומות - צריך לאשר בהגדרות הטלפון', 'blocked - allow them in phone settings')
                  : tr('לחצו להפעלה', 'tap to enable')}
            </AsyncButton>
          ) : (
            <div className="menu-item disabled">
              {tr('🔔 התראות:', '🔔 Notifications:')}{' '}
              {isIOS ? tr('צריך קודם להתקין למסך הבית', 'install to the home screen first') : tr('לא נתמך בדפדפן הזה', 'not supported in this browser')}
            </div>
          )}
          <button className="menu-item" onClick={onInstall}>
            {tr('📲 הוראות התקנה', '📲 Install instructions')}
          </button>
          <button
            className="menu-item danger"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            {tr('🚪 התנתקות', '🚪 Log out')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function CreateSheet({ open, onClose, onCreated, myName }: { open: boolean; onClose: () => void; onCreated: (id: string) => void; myName: string }) {
  const { tr } = useI18n();
  const [type, setType] = useState<'holdem' | 'blackjack'>('holdem');
  const [money, setMoney] = useState<'real' | 'demo'>('real');
  const [name, setName] = useState('');
  const [buyIn, setBuyIn] = useState(200);
  const [bb, setBb] = useState(2);
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(200);
  const [dealerMode, setDealerMode] = useState<'house' | 'player'>('house');
  const [bots, setBots] = useState(0);
  const defaultName = tr(`השולחן של ${myName}`, `${myName}'s table`);

  return (
    <Sheet open={open} onClose={onClose} title={tr('➕ שולחן חדש', '➕ New table')}>
      <div className="seg">
        <button className={type === 'holdem' ? 'active' : ''} onClick={() => setType('holdem')}>
          ♠️ {tr('טקסס הולדם', "Texas Hold'em")}
        </button>
        <button className={type === 'blackjack' ? 'active' : ''} onClick={() => setType('blackjack')}>
          🂡 {tr('בלאק ג׳ק', 'Blackjack')}
        </button>
      </div>
      <div className="seg">
        <button className={money === 'real' ? 'active' : ''} onClick={() => setMoney('real')}>
          {tr('💰 כסף אמיתי', '💰 Real money')}
        </button>
        <button className={money === 'demo' ? 'active' : ''} onClick={() => setMoney('demo')}>
          {tr('🎓 אימון (דמו)', '🎓 Practice (demo)')}
        </button>
      </div>
      <p className="hint">
        {money === 'real'
          ? tr('כל קנייה ויציאה נרשמות, ובסוף הערב מקבלים קיזוז חובות.', 'Every buy-in and cash-out is recorded, and at the end of the night you get a debt settle-up.')
          : tr('כסף משחק בלבד - לא נספר בחובות ובדירוג. מושלם לאימון מול בוטים.', 'Play money only - not counted in debts or rankings. Perfect for practicing against bots.')}
      </p>
      <label>
        {tr('שם השולחן', 'Table name')}
        <input className="input" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} maxLength={30} />
      </label>
      <div className="label">{tr('קנייה ראשונה (₪ / ז׳טונים)', 'Initial buy-in (₪ / chips)')}</div>
      <NumberStepper value={buyIn} onChange={setBuyIn} step={50} min={10} />
      {type === 'holdem' ? (
        <>
          <div className="label">{tr('ביג בליינד (הסמול = חצי)', 'Big blind (small = half)')}</div>
          <NumberStepper value={bb} onChange={setBb} step={2} min={2} />
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
              {tr('🏦 אחד החברים (בנק)', '🏦 A friend (bank)')}
            </button>
          </div>
          {dealerMode === 'player' && (
            <p className="hint">{tr('אחרי הפתיחה - בתפריט ☰ בוחרים מי הבנק. אפשר להחליף בין סיבובים.', 'After opening - pick the bank in the ☰ menu. You can switch between rounds.')}</p>
          )}
        </>
      )}
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
          const settings = type === 'holdem' ? { bb, buyIn } : { minBet, maxBet, buyIn, dealerMode };
          const r = await gameCall<{ roomId: string; code: string }>({
            op: 'create',
            gameType: type,
            name: name.trim() || defaultName,
            moneyMode: money,
            settings,
          });
          for (let i = 0; i < bots; i++) await gameCall({ op: 'act', roomId: r.roomId, move: { type: 'addBot' } });
          onClose();
          onCreated(r.roomId);
          toast(tr(`השולחן נפתח! קוד: ${r.code}`, `Table opened! Code: ${r.code}`), 'win');
        }}
      >
        {tr('פתיחת שולחן 🎲', 'Open table 🎲')}
      </AsyncButton>
    </Sheet>
  );
}
