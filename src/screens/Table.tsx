import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../lib/useRoom';
import { gameCall, type Profile } from '../lib/supabase';
import type { Theme, ThemeId } from '../lib/themes';
import { allThemes, pick } from '../lib/themes';
import { vibrate } from '../lib/prefs';
import { fmt } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { displayName } from '../lib/display';
import { Sheet, AsyncButton, NumberStepper, toast } from '../components/ui';
import { Settle } from '../components/Settle';
import { ChatSheet, useChatNotifier } from '../components/Chat';
import { InviteSheet } from '../components/InviteSheet';
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
  const { room, hole, ledger, refresh } = useRoom(roomId, myId);
  const [sheet, setSheet] = useState<null | 'menu' | 'settle' | 'chat' | 'invite' | 'rebuy' | 'join'>(null);
  const [rebuyAmt, setRebuyAmt] = useState(0);
  const [quip, setQuip] = useState(() => pick(theme.quips));
  const s = room?.state;
  const chat = s?.chat ?? [];
  const { unread, bubble } = useChatNotifier(chat, myId, sheet === 'chat');
  const back = lang === 'he' ? '➜' : '⬅';

  // בדיחה מתחלפת כל 25 שניות
  useEffect(() => {
    setQuip(pick(theme.quips));
    const t = setInterval(() => setQuip(pick(theme.quips)), 25000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.id, lang]);

  // רטט כשמגיע התור שלי
  const myTurnNow =
    !!s &&
    (s.kind === 'holdem'
      ? (s as HState).turnId === myId
      : (s as BJState).turn != null && (s as BJState).players[(s as BJState).turn!.p]?.id === myId);
  const prevTurn = useRef(false);
  useEffect(() => {
    if (myTurnNow && !prevTurn.current) vibrate([80, 40, 80]);
    prevTurn.current = myTurnNow;
  }, [myTurnNow]);

  useEffect(() => {
    if (s && rebuyAmt === 0) setRebuyAmt(s.settings.buyIn);
  }, [s, rebuyAmt]);

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

  // השולחן נסגר - מציגים סיכום
  if (room.status === 'closed') {
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={onExit}>
            {back}
          </button>
          <h1>
            {tr('סיכום:', 'Summary:')} {room.name}
          </h1>
          <span />
        </header>
        <div className="content">
          <div className="closed-banner">{tr('🏁 השולחן נסגר. הנה הסיכום:', '🏁 The table is closed. Here is the summary:')}</div>
          <Settle room={room} ledger={ledger} moneyMode={moneyMode} />
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

  return (
    <div className={`screen table-screen theme-${theme.id}`}>
      <header className="topbar">
        <button className="icon-btn" onClick={onExit} aria-label={tr('ללובי', 'Lobby')}>
          {back}
        </button>
        <div className="title-block" onClick={() => setSheet('invite')}>
          <h1>
            {s.kind === 'blackjack' ? '🂡' : '♠️'} {room.name}
          </h1>
          <span className="code-chip">
            {moneyMode === 'demo' ? tr('🎓 אימון', '🎓 Practice') : tr('💰 אמיתי', '💰 Real')} · {tr('קוד', 'Code')} {room.code} ·{' '}
            {tr('➕ הזמנה', '➕ Invite')}
          </span>
        </div>
        <div className="top-actions">
          <button className="icon-btn" onClick={() => setSheet('chat')} aria-label={tr('צ׳אט', 'Chat')}>
            💬{unread > 0 && <span className="badge">{unread}</span>}
          </button>
          <button className="icon-btn" onClick={() => setSheet('settle')} aria-label={tr('מאזן', 'Balance')}>
            📊
          </button>
          <button className="icon-btn" onClick={() => setSheet('menu')} aria-label={tr('תפריט', 'Menu')}>
            ☰
          </button>
        </div>
      </header>

      <div className="quip-ribbon" key={quip}>
        {quip}
      </div>
      {bubble && (
        <div className="chat-bubble" onClick={() => setSheet('chat')}>
          <b>{bubble.name}:</b> {bubble.text}
        </div>
      )}

      <main className="felt">
        {!me ? (
          <div className="not-seated">
            <p>{tr('אתם לא יושבים בשולחן הזה', "You're not seated at this table")}</p>
            <button className="btn primary" onClick={() => setSheet('join')}>
              {tr('הצטרפות לשולחן 🪑', 'Join the table 🪑')}
            </button>
          </div>
        ) : bj ? (
          <BlackjackView s={bj} roomId={roomId} myId={myId} theme={theme} tipsOn={tipsOn} act={act} onRebuy={() => setSheet('rebuy')} />
        ) : hd ? (
          <HoldemView s={hd} roomId={roomId} myId={myId} hole={hole} theme={theme} tipsOn={tipsOn} act={act} onRebuy={() => setSheet('rebuy')} />
        ) : null}
      </main>

      {/* תפריט */}
      <Sheet open={sheet === 'menu'} onClose={() => setSheet(null)} title={tr('☰ תפריט שולחן', '☰ Table menu')}>
        <div className="menu-list">
          <button className="menu-item" onClick={() => setSheet('rebuy')}>
            {tr('💰 קנייה נוספת', '💰 Buy more chips')}
          </button>
          <button className="menu-item" onClick={() => setSheet('invite')}>
            {tr('📣 הזמנת חברים', '📣 Invite friends')}
          </button>
          {hd && me && (
            <button className="menu-item" onClick={() => actSafe({ type: 'sitOut', value: !(me as HState['players'][number]).sitOut })}>
              {(me as HState['players'][number]).sitOut
                ? tr('▶ חזרה למשחק', '▶ Back in the game')
                : tr('💤 לשבת בצד (לדלג על ידיים)', '💤 Sit out (skip hands)')}
            </button>
          )}
          <label className="menu-item toggle">
            <span>{tr('💡 טיפים חכמים', '💡 Smart tips')}</span>
            <input type="checkbox" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <div className="menu-item disabled">{tr('🤖 עוזר AI אישי (פרימיום) - בקרוב', '🤖 Personal AI coach (premium) - coming soon')}</div>
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
              <h3 className="section-title">{tr('👑 ניהול (מארח)', '👑 Host controls')}</h3>
              <AsyncButton className="menu-item" onClick={() => act({ type: 'addBot' })}>
                {tr('🤖 הוספת בוט', '🤖 Add a bot')}
              </AsyncButton>
              {bots.map((b) => (
                <AsyncButton key={b.id} className="menu-item" onClick={() => act({ type: 'removeBot', botId: b.id })}>
                  ✕ {tr('הסרת', 'Remove')} {b.avatar} {displayName(b, lang)}
                </AsyncButton>
              ))}
              {bj && bj.settings.dealerMode === 'player' && (
                <div className="banker-pick">
                  <span>{tr('🏦 מי הבנק?', '🏦 Who is the bank?')}</span>
                  <select
                    value={bj.bankerId ?? ''}
                    onChange={(e) => actSafe({ type: 'setBanker', playerId: e.target.value || null })}
                    disabled={bj.phase === 'playing'}
                  >
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
                  if (
                    !confirm(
                      tr(
                        'לסגור את השולחן? כולם יוצאים עם מה שיש להם, ומקבלים סיכום חובות.',
                        'Close the table? Everyone cashes out with what they have and gets a debt summary.',
                      ),
                    )
                  )
                    return;
                  await act({ type: 'close' });
                  setSheet(null);
                }}
              >
                {tr('🏁 סיום ערב וסגירת השולחן', '🏁 End the night & close the table')}
              </AsyncButton>
            </>
          )}
          {me && (
            <AsyncButton
              className="menu-item danger"
              onClick={async () => {
                if (!confirm(tr(`לקום מהשולחן עם ${fmt(me.chips)}?`, `Leave the table with ${fmt(me.chips)}?`))) return;
                await act({ type: 'leave' });
                onExit();
              }}
            >
              {tr('🚪 לקום מהשולחן', '🚪 Leave the table')}
            </AsyncButton>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'settle'} onClose={() => setSheet(null)} title={tr('📊 מאזן וחובות', '📊 Balance & debts')}>
        <Settle room={room} ledger={ledger} moneyMode={moneyMode} />
      </Sheet>

      <ChatSheet open={sheet === 'chat'} onClose={() => setSheet(null)} chat={chat} roomId={roomId} theme={theme} myId={myId} />

      <InviteSheet
        open={sheet === 'invite'}
        onClose={() => setSheet(null)}
        roomId={roomId}
        code={room.code}
        roomName={room.name}
        seatedIds={s.players.map((p) => p.id)}
        myId={myId}
      />

      <Sheet
        open={sheet === 'rebuy' || sheet === 'join'}
        onClose={() => setSheet(null)}
        title={sheet === 'join' ? tr('🪑 הצטרפות לשולחן', '🪑 Join the table') : tr('💰 קנייה נוספת', '💰 Buy more chips')}
      >
        <p className="hint">
          {moneyMode === 'demo'
            ? tr('שולחן אימון - הכסף לא אמיתי 🎓', 'Practice table - not real money 🎓')
            : tr('הסכום נרשם ביומן החובות של הערב', "The amount is recorded in tonight's debt ledger")}
        </p>
        <NumberStepper value={rebuyAmt} onChange={setRebuyAmt} step={Math.max(1, Math.round(s.settings.buyIn / 4))} min={1} />
        <AsyncButton
          className="btn primary block big"
          onClick={async () => {
            if (sheet === 'join') await gameCall({ op: 'join', code: room.code, buyIn: rebuyAmt });
            else await gameCall({ op: 'act', roomId, move: { type: 'rebuy', amount: rebuyAmt } });
            refresh();
            setSheet(null);
            toast(tr(`נוספו ${fmt(rebuyAmt)} 💰`, `Added ${fmt(rebuyAmt)} 💰`), 'win');
          }}
        >
          {sheet === 'join' ? tr(`התיישבות עם ${fmt(rebuyAmt)}`, `Sit down with ${fmt(rebuyAmt)}`) : tr(`קנייה ב-${fmt(rebuyAmt)}`, `Buy ${fmt(rebuyAmt)}`)}
        </AsyncButton>
      </Sheet>
    </div>
  );
}
