import { useEffect, useRef, useState } from 'react';
import { chipBurst } from '../lib/motion';
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
  Lightbulb,
  Coffee,
  Play,
  Timer as TimerIcon,
  Crown,
  X,
  Sparkles,
  Armchair,
} from 'lucide-react';
import { useRoom } from '../lib/useRoom';
import { gameCall, type Profile } from '../lib/supabase';
import type { Theme, ThemeId } from '../lib/themes';
import { allThemes, pick } from '../lib/themes';
import { ThemePicker } from '../components/Pickers';
import { Avatar } from '../components/Avatar';
import { vibrate } from '../lib/prefs';
import { fmt, signed } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { displayName } from '../lib/display';
import { sfx, seatPan } from '../lib/sound';
import { SoundSettings } from '../components/SoundSettings';
import { useRoomFx, THROWABLES, EMOTES } from '../lib/fx';
import { canRebuyNow, rebuysLeft } from '../engine/room';
import { isGranny } from '../engine/common';
import { Sheet, AsyncButton, toast } from '../components/ui';
import { Settle } from '../components/Settle';
import { ChipStack } from '../components/Chips';
import { ChatSheet, useChatNotifier } from '../components/Chat';
import { TableMic } from '../components/VoiceRecorder';
import { TableCall } from '../components/TableCall';
import { useCall, useTableCall } from '../lib/call';
import { SoundBoard, NewSoundSheet } from '../components/SoundBoard';
import { loadClips } from '../lib/sounds';
import { InviteSheet } from '../components/InviteSheet';
import { HandHistory } from '../components/HandHistory';
import { NightSummary } from '../components/NightSummary';
import { FxLayer } from '../components/FxLayer';
import { BlackjackView } from './BlackjackView';
import { HoldemView } from './HoldemView';
import type { BJState } from '../engine/blackjack';
import { type HState, runoutMs } from '../engine/holdem';

// רווח הערב של שחקן: ז׳טונים (כולל מה שכרגע במשחק) + מה שכבר יצא - כל הקניות.
// הקניות נספרות ממצב המשחק עצמו (buyCount) - כך אין "רווח" רגעי לשחקן שהצטרף לפני שהיומן הגיע
function nightNet(
  s: { kind: string; phase: string; settings: { buyIn: number }; buyCount?: Record<string, number> },
  ledger: { user_id: string | null; kind: string; amount: number }[],
  p: { id: string; isBot: boolean; chips: number },
) {
  const bought = (s.buyCount?.[p.id] ?? 1) * s.settings.buyIn;
  const out = p.isBot ? 0 : ledger.filter((l) => l.user_id === p.id && l.kind === 'cashout').reduce((a, r) => a + Number(r.amount), 0);
  const pending = Number((p as { pending?: number }).pending ?? 0);
  const running = s.kind === 'holdem' ? s.phase !== 'waiting' && s.phase !== 'showdown' : s.phase === 'playing';
  const inPlay = !running
    ? 0
    : s.kind === 'holdem'
      ? Number((p as { total?: number }).total ?? 0)
      : ((p as { hands?: { bet: number }[] }).hands ?? []).reduce((a, h) => a + h.bet, 0);
  return { net: p.chips + pending + inPlay + out - bought, bought };
}

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
  const { events, send, inject } = useRoomFx(roomId, myId);
  const [sheet, setSheet] = useState<null | 'menu' | 'settle' | 'chat' | 'invite' | 'rebuy' | 'join' | 'history' | 'emote' | 'night' | 'newsound'>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [quip, setQuip] = useState(() => pick(theme.quips));
  const [closedTab, setClosedTab] = useState<'night' | 'settle' | 'hands'>('night');
  const s = room?.state;
  const chat = s?.chat ?? [];
  // שיחה חיה בשולחן - זמינה למי שיושב
  const seated = !!s?.players.some((p) => p.id === myId) && room?.status === 'open';
  useTableCall(roomId, myId, seated);
  const call = useCall();
  // לוח הצלילים נטען מראש - כדי שצליל של חבר יישמע מיד
  useEffect(() => {
    if (seated) void loadClips();
  }, [seated]);
  const { unread, bubble } = useChatNotifier(s ? chat : undefined, myId, sheet === 'chat', (m) => {
    if (m.fx?.kind === 'emote') inject({ kind: 'emote', from: m.id, emoji: m.fx.emoji });
    else if (m.fx?.kind === 'throw') inject({ kind: 'throw', from: m.id, to: m.fx.to, item: m.fx.item });
  });
  // מלך הערב: מי הכי ברווח בשולחן הזה (מתעדכן רק בין ידיים)
  const [king, setKing] = useState<string | null>(null);
  const [kingCast, setKingCast] = useState<{ id: string; name: string; k: number } | null>(null);
  const kingReady = useRef(false);
  // אחרי אול-אין הלוח נחשף לאט - מלך הערב מתעדכן רק בסוף ההצגה (שלא יגלה מי ניצח)
  const [kingHold, setKingHold] = useState<number | null>(null);
  const roHand = s && s.kind === 'holdem' && s.phase === 'showdown' && s.runout && s.runout.hand === s.handNo ? s.runout : null;
  useEffect(() => {
    if (!roHand) return;
    const hand = roHand.hand;
    const t = setTimeout(() => setKingHold(hand), runoutMs(roHand.from) + 300);
    return () => clearTimeout(t);
  }, [roHand?.hand, roHand?.from]);
  // בקשות "תראה!" של היד האחרונה
  const [showReq, setShowReq] = useState<{ hand: number; to: string; from: string[] } | null>(null);
  const seenFx = useRef(new Set<string>());
  useEffect(() => {
    for (const e of events) {
      if (e.kind !== 'showme' || seenFx.current.has(e.id)) continue;
      seenFx.current.add(e.id);
      setShowReq((cur) =>
        cur && cur.hand === e.hand && cur.to === e.to
          ? cur.from.includes(e.from)
            ? cur
            : { ...cur, from: [...cur.from, e.from] }
          : { hand: e.hand, to: e.to, from: [e.from] },
      );
    }
  }, [events]);
  useEffect(() => {
    if (!s) return;
    const settled = s.kind === 'holdem' ? s.phase === 'waiting' || s.phase === 'showdown' : s.phase === 'betting' || s.phase === 'results';
    if (!settled) return;
    if (roHand && kingHold !== roHand.hand) return;
    const nets = s.players.map((p) => ({ p, net: nightNet(s, ledger, p).net }));
    const best = Math.max(0, ...nets.map((n) => n.net));
    const top = nets.filter((n) => best > 0 && n.net === best);
    const next = !top.length ? null : top.some((t) => t.p.id === king) ? king : top[0].p.id;
    if (next === king) {
      kingReady.current = true;
      return;
    }
    setKing(next);
    const kp = top.find((t) => t.p.id === next)?.p;
    if (kingReady.current && kp) {
      const k = Date.now();
      setKingCast({ id: kp.id, name: displayName(kp, lang), k });
      sfx.chipStack(seatPan(kp.id));
      if (kp.id === myId) {
        vibrate([50, 40, 50, 40, 120]);
        setTimeout(() => chipBurst(document.querySelector(`[data-pid="${CSS.escape(myId)}"]`), { count: 10 }), 300);
      }
      setTimeout(() => setKingCast((c) => (c?.k === k ? null : c)), 2600);
    }
    kingReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, ledger, kingHold]);
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
    vibrate(10);
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
            <Flag size={18} /> {tr('השולחן נסגר. זה הסיכום של הערב.', 'The table is closed. Here is the night summary.')}
          </div>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={closedTab === 'night'} className={closedTab === 'night' ? 'active' : ''} onClick={() => setClosedTab('night')}>
              {tr('סיכום הערב', 'The night')}
            </button>
            <button role="tab" aria-selected={closedTab === 'settle'} className={closedTab === 'settle' ? 'active' : ''} onClick={() => setClosedTab('settle')}>
              {tr('חובות', 'Debts')}
            </button>
            <button role="tab" aria-selected={closedTab === 'hands'} className={closedTab === 'hands' ? 'active' : ''} onClick={() => setClosedTab('hands')}>
              {tr('ידיים', 'Hands')}
            </button>
          </div>
          {closedTab === 'night' ? (
            <NightSummary room={room} ledger={ledger} />
          ) : closedTab === 'settle' ? (
            <Settle room={room} ledger={ledger} moneyMode={moneyMode} />
          ) : (
            <HandHistory roomId={roomId} myId={myId} />
          )}
          <button className="btn primary block big" onClick={onExit}>
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
  const netOf = (p: { id: string; isBot: boolean; chips: number }) => nightNet(s, ledger, p);
  const turnId = hd ? hd.turnId : bj && bj.phase === 'playing' && bj.turn ? bj.players[bj.turn.p]?.id : null;
  const onSeatTap = (id: string) => {
    if (id === myId) return;
    if (!me) return toast(tr('צריך לשבת בשולחן כדי להתגרות', 'Sit down to start the banter'));
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

      {!connected && <div className="offline-banner">{tr('החיבור נפל, מתחברים מחדש…', 'Connection lost, reconnecting…')}</div>}
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
            kingId={king}
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
            kingId={king}
            showReq={showReq}
            askShow={(to) => send({ kind: 'showme', to, hand: hd.handNo })}
          />
        ) : null}
      </main>
      {!me && (
        <div className="spectator-bar">
          <span>{tr('אתם צופים בשולחן', "You're watching")}</span>
          <button className="btn primary" onClick={() => setSheet('join')}>
            {tr(`הצטרפות ב-${fmt(buyIn)}`, `Join for ${fmt(buyIn)}`)}
          </button>
        </div>
      )}

      <FxLayer events={events} chatBubble={bubble} />
      {/* כפתור המיקרופון בפינה - רק בזמן שיחה (להשתקה). הודעות קוליות נשלחות מהצ׳אט */}
      {me && call.status === 'on' && <TableMic roomId={roomId} myId={myId} />}
      {me && (
        <TableCall
          myId={myId}
          nameOf={(id) => {
            const p = s.players.find((x) => x.id === id);
            return p ? displayName(p, lang) : tr('חבר', 'a friend');
          }}
        />
      )}
      {kingCast && (
        <div className="kj-kingcast" key={kingCast.k} role="status">
          <Crown size={20} strokeWidth={2.2} />
          <b dir="auto">{kingCast.name}</b>
          <span>{tr('מלך הערב החדש', 'New king of the night')}</span>
        </div>
      )}

      {/* תפריט שחקן: זריקה וזירוז */}
      <Sheet open={!!targetP} onClose={() => setTarget(null)} title={targetP ? displayName(targetP, lang) : ''}>
        {targetP && (
          <div className="player-menu">
            <div className="pm-card">
              <span className="pm-av">
                <Avatar name={targetP.name} emoji={targetP.avatar} bot={targetP.isBot} size={58} />
                {king === targetP.id && (
                  <span className="kj-crown">
                    <Crown size={14} strokeWidth={2.4} />
                  </span>
                )}
              </span>
              <div className="pm-facts">
                <div>
                  <span>{tr('ז׳טונים', 'Chips')}</span>
                  <b className="num">{fmt(targetP.chips)}</b>
                </div>
                <div>
                  <span>{tr('הערב', 'Tonight')}</span>
                  <b className={`num ${netOf(targetP).net > 0 ? 'pos' : netOf(targetP).net < 0 ? 'neg' : ''}`}>{signed(netOf(targetP).net)}</b>
                </div>
                <div>
                  <span>{tr('קנה', 'Bought')}</span>
                  <b className="num">{fmt(netOf(targetP).bought)}</b>
                </div>
              </div>
            </div>
            {king === targetP.id && <div className="pm-king">{tr('מלך הערב, כרגע הכי ברווח בשולחן', 'King of the night, currently up the most')}</div>}
            <div className="label">{tr('לזרוק משהו', 'Throw something')}</div>
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
                  toast(tr(`זירזת את ${targetP.name}`, `You nudged ${targetP.name}`), 'win');
                  setTarget(null);
                }}
              >
                <TimerIcon size={18} /> {tr('זירוז (נשלחת התראה)', 'Nudge (sends a notification)')}
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
        <p className="hint center">{tr('לחיצה על חבר בשולחן פותחת זריקה וזירוז.', 'Tap a friend at the table to throw something or nudge.')}</p>
        <SoundBoard
          myId={myId}
          onPlay={(c) => {
            send({ kind: 'sound', path: c.path, label: c.label });
            setSheet(null);
          }}
          onAdd={() => setSheet('newsound')}
        />
      </Sheet>
      <NewSoundSheet open={sheet === 'newsound'} onClose={() => setSheet('emote')} myId={myId} />

      {/* תפריט */}
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={tr('תפריט שולחן', 'Table menu')}>
        <div className="menu-list">
          {me && (
            <button className="menu-item" onClick={() => setSheet('rebuy')}>
              <span className="mi">
                <Coins size={19} /> {tr(`קנייה חוזרת ב-${fmt(buyIn)}`, `Rebuy for ${fmt(buyIn)}`)}
              </span>
              <span className="sub">{left == null ? tr('ללא הגבלה', 'Unlimited') : tr(`נשארו ${left}`, `${left} left`)}</span>
            </button>
          )}
          <button className="menu-item" onClick={() => setSheet('invite')}>
            <span className="mi">
              <UserPlus size={19} /> {tr('הזמנת חברים', 'Invite friends')}
            </span>
            <span className="sub num" translate="no">
              {room.code}
            </span>
          </button>
          <button className="menu-item" onClick={() => setSheet('settle')}>
            <span className="mi">
              <Scale size={19} /> {tr('מאזן וחובות', 'Balance & debts')}
            </span>
          </button>
          <button className="menu-item" onClick={() => setSheet('night')}>
            <span className="mi">
              <Sparkles size={19} /> {tr('סיכום הערב עד עכשיו', 'The night so far')}
            </span>
          </button>
          {hd && me && (
            <button className="menu-item" onClick={() => actSafe({ type: 'sitOut', value: !(me as HState['players'][number]).sitOut })}>
              <span className="mi">
                {(me as HState['players'][number]).sitOut ? <Play size={19} /> : <Coffee size={19} />}
                {(me as HState['players'][number]).sitOut ? tr('חזרה למשחק', 'Back in the game') : tr('הפסקה (מדלגים על ידיים)', 'Take a break (skip hands)')}
              </span>
            </button>
          )}
        </div>

        <div className="list-label">{tr('הגדרות', 'Settings')}</div>
        <div className="menu-list">
          <label className="menu-item toggle">
            <span className="mi">
              <Lightbulb size={19} /> {tr('טיפים', 'Tips')}
            </span>
            <input type="checkbox" role="switch" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <SoundSettings />
        </div>
        <div className="seg" role="group" aria-label={tr('שפה', 'Language')}>
          <button className={lang === 'he' ? 'active' : ''} aria-pressed={lang === 'he'} onClick={() => setLang('he')}>
            עברית
          </button>
          <button className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            English
          </button>
        </div>
        <ThemePicker themes={themes} value={theme.id} onChange={setTheme} />

        {isHost && (
          <>
            <div className="list-label">
              <Crown size={14} /> {tr('ניהול השולחן', 'Host controls')}
            </div>
            <div className="menu-list">
              <AsyncButton className="menu-item" onClick={() => act({ type: 'addBot' })}>
                <span className="mi">
                  <Bot size={19} /> {tr('הוספת בוט', 'Add a bot')}
                </span>
              </AsyncButton>
              {!s.players.some((p) => isGranny(p.id)) && (
                <AsyncButton className="menu-item" onClick={() => act({ type: 'addBot', granny: true })}>
                  <span className="mi">
                    <Armchair size={19} /> {tr('להושיב את סבתא של תמיר', "Seat Tamir's Grandma")}
                  </span>
                  <span className="sub">{tr('זהירה, מדברת הרבה, ולפעמים משתגעת', 'Careful, chatty, and sometimes goes wild')}</span>
                </AsyncButton>
              )}
              {bots.map((b) => (
                <AsyncButton key={b.id} className="menu-item" onClick={() => act({ type: 'removeBot', botId: b.id })}>
                  <span className="mi">
                    <X size={19} /> {tr(`הסרת ${displayName(b, lang)}`, `Remove ${displayName(b, lang)}`)}
                  </span>
                </AsyncButton>
              ))}
              {bj && bj.settings.dealerMode === 'player' && (
                <div className="menu-item banker-pick">
                  <span>{tr('מי הבנק', 'Who is the bank')}</span>
                  <select
                    value={bj.bankerId ?? ''}
                    aria-label={tr('מי הבנק', 'Who is the bank')}
                    onChange={(e) => actSafe({ type: 'setBanker', playerId: e.target.value || null })}
                    disabled={bj.phase === 'playing'}
                  >
                    <option value="">{tr('המחשב (הבית)', 'The computer (house)')}</option>
                    {bj.players
                      .filter((p) => !p.isBot)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
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
                  <Flag size={19} /> {tr('סיום הערב וסגירת השולחן', 'End the night and close the table')}
                </span>
              </AsyncButton>
            </div>
          </>
        )}
        {me && (
          <div className="menu-list">
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
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'settle'} onClose={() => setSheet(null)} title={tr('מאזן וחובות', 'Balance & debts')}>
        <Settle room={room} ledger={ledger} moneyMode={moneyMode} />
      </Sheet>

      <Sheet open={sheet === 'night'} onClose={() => setSheet(null)} title={tr('סיכום הערב עד עכשיו', 'The night so far')}>
        <NightSummary room={room} ledger={ledger} refreshKey={handKey} />
      </Sheet>

      <Sheet open={sheet === 'history'} onClose={() => setSheet(null)} title={tr('היסטוריית ידיים', 'Hand history')}>
        <HandHistory roomId={roomId} myId={myId} refreshKey={handKey} />
      </Sheet>

      <ChatSheet open={sheet === 'chat'} onClose={() => setSheet(null)} chat={chat} roomId={roomId} theme={theme} myId={myId} />

      <InviteSheet open={sheet === 'invite'} onClose={() => setSheet(null)} roomId={roomId} code={room.code} roomName={room.name} seatedIds={s.players.map((p) => p.id)} myId={myId} />

      {/* קנייה: תמיד בסכום הקבוע של השולחן */}
      <Sheet
        open={sheet === 'rebuy' || sheet === 'join'}
        onClose={() => setSheet(null)}
        title={sheet === 'join' ? tr('הצטרפות לשולחן', 'Join the table') : tr('קנייה חוזרת', 'Rebuy')}
        footer={
          <AsyncButton
            className="btn primary block big"
            disabled={sheet === 'rebuy' && !canRebuy}
            onClick={async () => {
              if (sheet === 'join') await gameCall({ op: 'join', code: room.code });
              else await gameCall({ op: 'act', roomId, move: { type: 'rebuy' } });
              await refresh();
              setSheet(null);
              sfx.chipStack();
              toast(tr(`נוספו ${fmt(buyIn)} ז׳טונים`, `Added ${fmt(buyIn)} chips`), 'win');
            }}
          >
            {sheet === 'join' ? tr(`התיישבות ב-${fmt(buyIn)}`, `Sit down for ${fmt(buyIn)}`) : tr(`קנייה ב-${fmt(buyIn)}`, `Buy ${fmt(buyIn)}`)}
          </AsyncButton>
        }
      >
        <div className="buyin-box">
          <div className="buyin-amount">
            <ChipStack amount={buyIn} size={26} label={false} />
            <span>{fmt(buyIn)}</span>
          </div>
          <div className="hint center">{tr('בשולחן הזה הקנייה קבועה', 'This table has a fixed buy-in')}</div>
        </div>
        <div className="facts">
          <div>
            <span>{tr('סוג', 'Type')}</span>
            <b>{moneyMode === 'demo' ? tr('אימון, לא כסף אמיתי', 'Practice, not real money') : tr('כסף אמיתי, נרשם בחובות', 'Real money, recorded in debts')}</b>
          </div>
          {sheet === 'rebuy' && (
            <div>
              <span>{tr('קניות חוזרות', 'Rebuys')}</span>
              <b>{left == null ? tr('ללא הגבלה', 'Unlimited') : tr(`נשארו ${left}`, `${left} left`)}</b>
            </div>
          )}
        </div>
        {sheet === 'rebuy' && !canRebuy && (
          <div className="warn">
            {left === 0 ? tr('נגמרו הקניות החוזרות בשולחן הזה', 'No rebuys left at this table') : tr('אפשר לקנות שוב רק כשנגמרים הז׳טונים', 'You can rebuy only when you run out of chips')}
          </div>
        )}
      </Sheet>
    </div>
  );
}
