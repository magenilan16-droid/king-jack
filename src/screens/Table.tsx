import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  Scale,
  Menu,
  History,
  Smile,
  UserPlus,
  Coins,
  LogOut,
  Flag,
  Bot,
  Volume2,
  Lightbulb,
  Coffee,
  Play,
  Timer as TimerIcon,
  Crown,
} from 'lucide-react';
import { useRoom } from '../lib/useRoom';
import { gameCall, type Profile } from '../lib/supabase';
import type { Theme, ThemeId } from '../lib/themes';
import { allThemes, pick } from '../lib/themes';
import { vibrate } from '../lib/prefs';
import { fmt } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { displayName } from '../lib/display';
import { sfx, useMuted } from '../lib/sound';
import { useRoomFx, THROWABLES, EMOTES } from '../lib/fx';
import { canRebuyNow, rebuysLeft } from '../engine/room';
import { Sheet, AsyncButton, toast } from '../components/ui';
import { Settle } from '../components/Settle';
import { ChatSheet, useChatNotifier } from '../components/Chat';
import { InviteSheet } from '../components/InviteSheet';
import { HandHistory } from '../components/HandHistory';
import { FxLayer } from '../components/FxLayer';
import { BlackjackView } from './BlackjackView';
import { HoldemView } from './HoldemView';
import type { BJState } from '../engine/blackjack';
import type { HState } from '../engine/holdem';

export function Table({
  roomId,
  profile,
  theme,
  setTheme,
  tipsOn,
  setTipsOn,
  onExit,
}: {
  roomId: string;
  profile: Profile;
  theme: Theme;
  setTheme: (t: ThemeId) => void;
  tipsOn: boolean;
  setTipsOn: (v: boolean) => void;
  onExit: () => void;
}) {
  const { tr, lang, setLang } = useI18n();
  const myId = profile.id;
  const { room, hole, ledger, refresh, connected } = useRoom(roomId, myId);
  const { events, send } = useRoomFx(roomId, myId);
  const [muted, setMuted] = useMuted();
  const [sheet, setSheet] = useState<null | 'menu' | 'settle' | 'chat' | 'invite' | 'rebuy' | 'join' | 'history' | 'emote'>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [quip, setQuip] = useState(() => pick(theme.quips));
  const [closedTab, setClosedTab] = useState<'settle' | 'hands'>('settle');
  const s = room?.state;
  const chat = s?.chat ?? [];
  const { unread, bubble } = useChatNotifier(chat, myId, sheet === 'chat');
  const BackIcon = lang === 'he' ? ArrowRight : ArrowLeft;

  // בדיחה מתחלפת כל 25 שניות
  useEffect(() => {
    setQuip(pick(theme.quips));
    const t = setInterval(() => setQuip(pick(theme.quips)), 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.id, lang]);

  // רטט וצליל כשמגיע התור שלי
  const myTurnNow =
    !!s &&
    (s.kind === 'holdem'
      ? (s as HState).turnId === myId
      : (s as BJState).turn != null && (s as BJState).players[(s as BJState).turn!.p]?.id === myId);
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurnNow && !prevTurn.current) {
      vibrate([80, 40, 80]);
      sfx.turn();
    }
    prevTurn.current = myTurnNow;
  }, [myTurnNow]);

  if (!room || !s) {
    return (
      <div className="screen center">
        <span className="spinner big" />
      </div>
    );
  }

  const moneyMode = room.money_mode ?? 'real';
  const me = s.players.find((p) => p.id === myId);
  const isHost = s.hostId === myId;
  const buyIn = s.settings.buyIn;
  const left = rebuysLeft(s, myId);
  const canRebuy = !!me && canRebuyNow(s, myId) && left !== 0;
  const handKey = s.kind === 'holdem' ? (s as HState).lastHand?.no : (s as BJState).lastHand?.no;
  const act = async (move: Record<string, unknown>) => {
    await gameCall({ op: 'act', roomId, move });
    await refresh();
  };
  const actSafe = async (move: Record<string, unknown>) => {
    try {
      await act(move);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  // השולחן נסגר - מציגים סיכום + היסטוריה
  if (room.status === 'closed') {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={onExit} aria-label={tr('חזרה', 'Back')}>
            <BackIcon size={22} />
          </button>
          <h1 dir="auto">{room.name}</h1>
          <span />
        </header>
        <div className="content">
          <div className="closed-banner">
            <Flag size={18} /> {tr('השולחן נסגר - הנה הסיכום', 'The table is closed - here is the summary')}
          </div>
          <div className="seg">
            <button className={closedTab === 'settle' ? 'active' : ''} onClick={() => setClosedTab('settle')}>
              {tr('מאזן וחובות', 'Balance & debts')}
            </button>
            <button className={closedTab === 'hands' ? 'active' : ''} onClick={() => setClosedTab('hands')}>
              {tr('היסטוריית ידיים', 'Hand history')}
            </button>
          </div>
          {closedTab === 'settle' ? <Settle room={room} ledger={ledger} moneyMode={moneyMode} /> : <HandHistory roomId={roomId} myId={myId} />}
          <button className="btn primary block" onClick={onExit}>
            {tr('חזרה ללובי', 'Back to lobby')}
          </button>
        </div>
      </div>
    );
  }

  const bots = s.players.filter((p) => p.isBot);
  const bj = s.kind === 'blackjack' ? (s as BJState) : null;
  const hd = s.kind === 'holdem' ? (s as HState) : null;
  const themes = allThemes(lang);
  const targetP = target ? s.players.find((p) => p.id === target) : null;
  const turnId = hd ? hd.turnId : bj && bj.phase === 'playing' && bj.turn ? bj.players[bj.turn.p]?.id : null;
  const onSeatTap = (id: string) => {
    if (id === myId) return;
    if (!me) return toast(tr('צריך לשבת בשולחן כדי להתגרות 😉', 'Sit down to start the banter 😉'));
    setTarget(id);
  };

  return (
    <div className={`screen table-screen theme-${theme.id}`}>
      <header className="topbar table-top">
        <button className="icon-btn" onClick={onExit} aria-label={tr('ללובי', 'Lobby')}>
          <BackIcon size={22} />
        </button>
        <div className="title-block" onClick={() => setSheet('invite')}>
          <h1 dir="auto">{room.name}</h1>
          <span className="code-chip">
            <span className={`mode-dot ${moneyMode}`} />
            <span>{moneyMode === 'demo' ? tr('אימון', 'Practice') : tr('כסף אמיתי', 'Real money')}</span>
            <span className="tt-code">{room.code}</span>
            <span>
              {tr('קנייה', 'Buy-in')} <b className="tt-num">{fmt(buyIn)}</b>
            </span>
          </span>
        </div>
        <div className="top-actions">
          {me && (
            <button className="icon-btn" onClick={() => setSheet('emote')} aria-label={tr('תגובה', 'React')}>
              <Smile size={21} />
            </button>
          )}
          <button className="icon-btn" onClick={() => setSheet('chat')} aria-label={tr('צ׳אט', 'Chat')}>
            <MessageCircle size={21} />
            {unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <button className="icon-btn" onClick={() => setSheet('history')} aria-label={tr('היסטוריה', 'History')}>
            <History size={21} />
          </button>
          <button className="icon-btn" onClick={() => setSheet('menu')} aria-label={tr('תפריט', 'Menu')}>
            <Menu size={22} />
          </button>
        </div>
      </header>

      {!connected && <div className="offline-banner">{tr('🔄 החיבור נפל - מתחבר מחדש...', '🔄 Connection lost - reconnecting...')}</div>}
      <div className="quip-ribbon" key={quip}>
        {quip}
      </div>

      <main className="felt">
        {bj ? (
          <BlackjackView
            s={bj}
            roomId={roomId}
            myId={myId}
            theme={theme}
            tipsOn={tipsOn}
            premium={profile.is_premium}
            act={act}
            onRebuy={() => setSheet('rebuy')}
            onSeatTap={onSeatTap}
          />
        ) : hd ? (
          <HoldemView
            s={hd}
            roomId={roomId}
            myId={myId}
            hole={hole}
            theme={theme}
            tipsOn={tipsOn}
            premium={profile.is_premium}
            act={act}
            onRebuy={() => setSheet('rebuy')}
            onSeatTap={onSeatTap}
          />
        ) : null}
      </main>
      {!me && (
        <div className="spectator-bar">
          <span>{tr('👀 אתם צופים בשולחן', "👀 You're watching")}</span>
          <button className="btn primary" onClick={() => setSheet('join')}>
            {tr(`הצטרפות ב-${fmt(buyIn)}`, `Join for ${fmt(buyIn)}`)}
          </button>
        </div>
      )}

      <FxLayer events={events} chatBubble={bubble} />

      {/* תפריט שחקן: זריקה וזירוז */}
      <Sheet open={!!targetP} onClose={() => setTarget(null)} title={targetP ? `${targetP.avatar} ${displayName(targetP, lang)}` : ''}>
        {targetP && (
          <div className="player-menu">
            <div className="pm-chips">
              <Coins size={16} /> {fmt(targetP.chips)}
            </div>
            <div className="label">{tr('זרקו משהו 😈', 'Throw something 😈')}</div>
            <div className="throw-grid">
              {THROWABLES.map((it) => (
                <button
                  key={it}
                  className="throw-btn"
                  onClick={() => {
                    send({ kind: 'throw', to: targetP.id, item: it });
                    setTarget(null);
                  }}
                >
                  {it}
                </button>
              ))}
            </div>
            {turnId === targetP.id && !targetP.isBot && (
              <AsyncButton
                className="btn primary block"
                onClick={async () => {
                  await gameCall({ op: 'nudge', roomId, userId: targetP.id });
                  send({ kind: 'nudge', to: targetP.id });
                  toast(tr(`זירזת את ${targetP.name} ⏰`, `You nudged ${targetP.name} ⏰`), 'win');
                  setTarget(null);
                }}
              >
                <TimerIcon size={18} /> {tr('זרז אותו/ה! (נשלחת התראה)', 'Nudge! (sends a notification)')}
              </AsyncButton>
            )}
          </div>
        )}
      </Sheet>

      {/* תגובות מהירות מעל הראש */}
      <Sheet open={sheet === 'emote'} onClose={() => setSheet(null)} title={tr('תגובה מהירה', 'Quick reaction')}>
        <div className="throw-grid">
          {EMOTES.map((e) => (
            <button
              key={e}
              className="throw-btn"
              onClick={() => {
                send({ kind: 'emote', emoji: e });
                setSheet(null);
              }}
            >
              {e}
            </button>
          ))}
        </div>
        <p className="hint center">{tr('טיפ: לחיצה על חבר בשולחן = לזרוק עליו משהו 🍅', 'Tip: tap a friend at the table to throw something 🍅')}</p>
      </Sheet>

      {/* תפריט */}
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={tr('תפריט שולחן', 'Table menu')}>
        <div className="menu-list">
          {me && (
            <button className="menu-item" onClick={() => setSheet('rebuy')}>
              <span className="mi">
                <Coins size={19} /> {tr(`קנייה חוזרת (${fmt(buyIn)})`, `Rebuy (${fmt(buyIn)})`)}
              </span>
              <span className="sub">{left == null ? tr('ללא הגבלה', 'unlimited') : tr(`נשארו ${left}`, `${left} left`)}</span>
            </button>
          )}
          <button className="menu-item" onClick={() => setSheet('invite')}>
            <span className="mi">
              <UserPlus size={19} /> {tr('הזמנת חברים', 'Invite friends')}
            </span>
          </button>
          <button className="menu-item" onClick={() => setSheet('settle')}>
            <span className="mi">
              <Scale size={19} /> {tr('מאזן וחובות', 'Balance & debts')}
            </span>
          </button>
          {hd && me && (
            <button className="menu-item" onClick={() => actSafe({ type: 'sitOut', value: !(me as HState['players'][number]).sitOut })}>
              <span className="mi">
                {(me as HState['players'][number]).sitOut ? <Play size={19} /> : <Coffee size={19} />}
                {(me as HState['players'][number]).sitOut ? tr('חזרה למשחק', 'Back in the game') : tr('הפסקה (לדלג על ידיים)', 'Take a break (skip hands)')}
              </span>
            </button>
          )}
          <label className="menu-item toggle">
            <span className="mi">
              <Lightbulb size={19} /> {tr('טיפים חכמים', 'Smart tips')}
            </span>
            <input type="checkbox" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <label className="menu-item toggle">
            <span className="mi">
              <Volume2 size={19} /> {tr('צלילים', 'Sounds')}
            </span>
            <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
          </label>
          <div className="seg">
            <button className={lang === 'he' ? 'active' : ''} onClick={() => setLang('he')}>
              עברית
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
          <div className="theme-picker">
            {themes.map((t) => (
              <button key={t.id} className={`theme-opt ${t.id === theme.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>
                <span>{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
          {isHost && (
            <>
              <h3 className="section-title">
                <Crown size={16} /> {tr('ניהול (מארח)', 'Host controls')}
              </h3>
              <AsyncButton className="menu-item" onClick={() => act({ type: 'addBot' })}>
                <span className="mi">
                  <Bot size={19} /> {tr('הוספת בוט', 'Add a bot')}
                </span>
              </AsyncButton>
              {bots.map((b) => (
                <AsyncButton key={b.id} className="menu-item" onClick={() => act({ type: 'removeBot', botId: b.id })}>
                  <span className="mi">
                    ✕ {tr('הסרת', 'Remove')} {b.avatar} {displayName(b, lang)}
                  </span>
                </AsyncButton>
              ))}
              {bj && bj.settings.dealerMode === 'player' && (
                <div className="banker-pick">
                  <span>{tr('🏦 מי הבנק?', '🏦 Who is the bank?')}</span>
                  <select value={bj.bankerId ?? ''} onChange={(e) => actSafe({ type: 'setBanker', playerId: e.target.value || null })} disabled={bj.phase === 'playing'}>
                    <option value="">{tr('המחשב (הבית)', 'The computer (house)')}</option>
                    {bj.players
                      .filter((p) => !p.isBot)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.avatar} {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              <AsyncButton
                className="menu-item danger"
                onClick={async () => {
                  if (!confirm(tr('לסגור את השולחן? כולם יוצאים עם מה שיש להם, ומקבלים סיכום חובות.', 'Close the table? Everyone cashes out with what they have and gets a debt summary.')))
                    return;
                  await act({ type: 'close' });
                  setSheet(null);
                }}
              >
                <span className="mi">
                  <Flag size={19} /> {tr('סיום ערב וסגירת השולחן', 'End the night & close the table')}
                </span>
              </AsyncButton>
            </>
          )}
          {me && (
            <AsyncButton
              className="menu-item danger"
              onClick={async () => {
                const live =
                  hd && hd.phase !== 'waiting' && hd.phase !== 'showdown'
                    ? hd.players.find((p) => p.id === myId)
                    : bj && bj.phase === 'playing'
                      ? bj.players.find((p) => p.id === myId && p.hands.length)
                      : null;
                const allIn = !!live && 'allIn' in live && live.allIn && !live.folded;
                const msg = !live
                  ? tr(`לקום מהשולחן עם ${fmt(me.chips)}?`, `Leave the table with ${fmt(me.chips)}?`)
                  : allIn
                    ? tr('אתם באול-אין: היד תסתיים כרגיל, ומה שתזכו בו יירשם לכם כשתקומו.', "You're all-in: the hand plays out and anything you win is cashed out when you leave.")
                    : hd
                      ? tr('יש יד פעילה - הקלפים שלכם יתקפלו ותקומו בסוף היד. להמשיך?', 'A hand is running - your cards are folded and you leave when it ends. Continue?')
                      : tr('הסיבוב באמצע - ההימור נשאר ותקומו בסוף הסיבוב. להמשיך?', 'The round is running - your bet stays and you leave when it ends. Continue?');
                if (!confirm(msg)) return;
                await act({ type: 'leave' });
                onExit();
              }}
            >
              <span className="mi">
                <LogOut size={19} /> {tr('לקום מהשולחן', 'Leave the table')}
              </span>
            </AsyncButton>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'settle'} onClose={() => setSheet(null)} title={tr('מאזן וחובות', 'Balance & debts')}>
        <Settle room={room} ledger={ledger} moneyMode={moneyMode} />
      </Sheet>

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title={tr('היסטוריית ידיים', 'Hand history')}>
        <HandHistory roomId={roomId} myId={myId} refreshKey={handKey} />
      </Sheet>

      <ChatSheet open={sheet === 'chat'} onClose={() => setSheet(null)} chat={chat} roomId={roomId} theme={theme} myId={myId} />

      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} roomId={roomId} code={room.code} roomName={room.name} seatedIds={s.players.map((p) => p.id)} myId={myId} />

      {/* קנייה: תמיד בסכום הקבוע של השולחן */}
      <Sheet open={sheet === 'rebuy' || sheet === 'join'} onClose={() => setSheet(null)} title={sheet === 'join' ? tr('הצטרפות לשולחן', 'Join the table') : tr('קנייה חוזרת', 'Rebuy')}>
        <div className="buyin-box">
          <div className="buyin-amount">
            <span className="chip-stack big" />
            {fmt(buyIn)}
          </div>
          <div className="hint center">
            {tr('בשולחן הזה הקנייה קבועה', 'This table has a fixed buy-in')}
            {moneyMode === 'demo' ? tr(' · אימון - לא כסף אמיתי 🎓', ' · practice - not real money 🎓') : tr(' · נרשם ביומן החובות 💰', ' · recorded in the debt ledger 💰')}
          </div>
          {sheet === 'rebuy' && (
            <div className="hint center">
              {left == null ? tr('קניות חוזרות: ללא הגבלה', 'Rebuys: unlimited') : tr(`קניות חוזרות שנשארו: ${left}`, `Rebuys left: ${left}`)}
            </div>
          )}
        </div>
        {sheet === 'rebuy' && !canRebuy && (
          <div className="warn">
            {left === 0 ? tr('נגמרו הקניות החוזרות בשולחן הזה', 'No rebuys left at this table') : tr('אפשר לקנות שוב רק כשנגמרים הז׳טונים', 'You can rebuy only when you run out of chips')}
          </div>
        )}
        <AsyncButton
          className="btn primary block big"
          disabled={sheet === 'rebuy' && !canRebuy}
          onClick={async () => {
            if (sheet === 'join') await gameCall({ op: 'join', code: room.code });
            else await gameCall({ op: 'act', roomId, move: { type: 'rebuy' } });
            await refresh();
            setSheet(null);
            sfx.chipStack();
            toast(tr(`נוספו ${fmt(buyIn)} 💰`, `Added ${fmt(buyIn)} 💰`), 'win');
          }}
        >
          {sheet === 'join' ? tr(`התיישבות ב-${fmt(buyIn)}`, `Sit down for ${fmt(buyIn)}`) : tr(`קנייה ב-${fmt(buyIn)}`, `Buy ${fmt(buyIn)}`)}
        </AsyncButton>
      </Sheet>
    </div>
  );
}
