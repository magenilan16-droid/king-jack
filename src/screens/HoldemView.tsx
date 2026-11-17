import { useEffect, useState } from 'react';
import { type HState, type HPlayer, potSize } from '../engine/holdem';
import type { Card as C } from '../engine/cards';
import { Card, Hand } from '../components/Card';
import { Timer } from '../components/Timer';
import { HoldemTip } from '../components/Tips';
import { AsyncButton } from '../components/ui';
import type { Theme } from '../lib/themes';
import { pick } from '../lib/themes';
import { fmt } from '../lib/balances';
import { bestHand } from '../engine/handEval';
import { useI18n, type Lang } from '../lib/i18n';
import { actionLabel, displayName, handName } from '../lib/display';

type Act = (move: Record<string, unknown>) => Promise<void>;

function phaseLabel(ph: string, lang: Lang) {
  const he: Record<string, string> = { waiting: 'ממתינים', preflop: 'לפני הפלופ', flop: 'פלופ', turn: 'טרן', river: 'ריבר', showdown: 'סיום יד' };
  const en: Record<string, string> = { waiting: 'Waiting', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
  return (lang === 'he' ? he : en)[ph] ?? ph;
}

export function HoldemView({
  s,
  roomId,
  myId,
  hole,
  theme,
  tipsOn,
  act,
  onRebuy,
}: {
  s: HState;
  roomId: string;
  myId: string;
  hole: C[];
  theme: Theme;
  tipsOn: boolean;
  act: Act;
  onRebuy: () => void;
}) {
  const { tr, lang } = useI18n();
  const me = s.players.find((p) => p.id === myId);
  const isHost = s.hostId === myId;
  const myTurn = !!me && s.turnId === myId;
  const turnPlayer = s.players.find((p) => p.id === s.turnId);
  const pot = potSize(s);
  const toCall = me ? Math.max(0, s.currentBet - me.bet) : 0;
  const maxTo = me ? me.bet + me.chips : 0;
  const minTo = Math.min(maxTo, s.currentBet + s.minRaise);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(minTo);
  const [quip, setQuip] = useState('');

  // המושבים מסודרים לפי הסדר אחריי
  const myIdx = s.players.findIndex((p) => p.id === myId);
  const others = s.players
    .slice(myIdx + 1)
    .concat(s.players.slice(0, Math.max(0, myIdx)))
    .filter((p) => p.id !== myId);
  const opponents = s.players.filter((p) => p.id !== myId && p.inHand && !p.folded).length;
  const winnerIds = new Set(s.winners.map((w) => w.id));

  useEffect(() => {
    setRaiseOpen(false);
    setRaiseTo(minTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turnId, s.currentBet, s.phase]);

  useEffect(() => {
    if (s.phase !== 'showdown' || !s.winners.length) return;
    setQuip(winnerIds.has(myId) ? pick(theme.win) : me?.inHand ? pick(theme.lose) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.handNo]);

  // המארח מתחיל את היד הבאה אוטומטית
  useEffect(() => {
    if (!isHost || s.phase !== 'showdown') return;
    const t = setTimeout(() => act({ type: 'next' }).catch(() => {}), 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, s.phase, s.handNo]);

  const readyPlayers = s.players.filter((p) => p.chips > 0 && !p.sitOut).length;
  const myMade = hole.length === 2 && s.board.length >= 3 ? handName(bestHand(hole.concat(s.board)).cat, lang) : null;

  return (
    <div className="hd">
      <div className={`seats hd-seats n${Math.min(others.length, 9)}`}>
        {others.map((p) => (
          <HSeat key={p.id} p={p} s={s} isTurn={s.turnId === p.id} isWinner={winnerIds.has(p.id)} lang={lang} />
        ))}
      </div>

      <div className="board-area">
        <div className="pot">
          💰 {tr('פוט', 'Pot')}: <b>{fmt(pot)}</b>
          <span className="phase-tag">{phaseLabel(s.phase, lang)}</span>
        </div>
        <div className="board">
          {Array.from({ length: 5 }).map((_, i) =>
            s.board[i] ? <Card key={i + s.board[i]} card={s.board[i]} size="md" /> : <div key={i} className="card slot md" />,
          )}
        </div>
        {s.phase === 'showdown' && s.winners.length > 0 && (
          <div className="winners">
            {s.winners.map((w) => {
              const wp = s.players.find((p) => p.id === w.id);
              return (
                <div key={w.id}>
                  🏆 {wp ? displayName(wp, lang) : w.name} +{fmt(w.amount)} {w.cat >= 0 && `· ${handName(w.cat, lang)}`}
                </div>
              );
            })}
            {quip && <div className="quip-inline">{quip}</div>}
          </div>
        )}
      </div>

      {me && (
        <div className={`me-area ${myTurn ? 'my-turn' : ''} ${me.folded ? 'dim' : ''} ${winnerIds.has(myId) ? 'winner' : ''}`}>
          <div className="me-row">
            <div className="me-cards">
              {hole.length === 2 ? (
                <Hand cards={hole} size="lg" />
              ) : (
                <div className="me-idle">{me.sitOut ? tr('ישבת בצד 💤', 'Sitting out 💤') : tr('מחכה ליד הבאה', 'Waiting for the next hand')}</div>
              )}
            </div>
            <div className="me-info">
              <div className="my-chips">
                {me.avatar} <b>{fmt(me.chips)}</b>
                {s.players[s.dealerIdx]?.id === myId && <span className="dealer-btn">D</span>}
              </div>
              {me.bet > 0 && <div className="bet-badge">🪙 {fmt(me.bet)}</div>}
              {me.lastAction && <div className="last-action">{actionLabel(me.lastAction, lang)}</div>}
              {myMade && <div className="made">{myMade}</div>}
            </div>
          </div>
        </div>
      )}

      {myTurn && tipsOn && hole.length === 2 && <HoldemTip hole={hole} board={s.board} opponents={opponents} toCall={toCall} pot={pot} />}

      <div className="action-bar">
        {s.phase === 'waiting' &&
          (isHost ? (
            <AsyncButton className="btn primary block big" onClick={() => act({ type: 'start' })} disabled={readyPlayers < 2}>
              {readyPlayers < 2 ? tr('צריך לפחות 2 שחקנים (אפשר להוסיף בוט ☰)', 'Need at least 2 players (add a bot in ☰)') : tr('▶ התחל יד', '▶ Start hand')}
            </AsyncButton>
          ) : (
            <div className="waiting">{tr('מחכים שהמארח יתחיל ⏳', 'Waiting for the host to start ⏳')}</div>
          ))}

        {me && me.chips === 0 && !me.inHand && (
          <button className="btn primary block" onClick={onRebuy}>
            {tr(`נגמרו ה${theme.labels.chips} - קנייה נוספת 💰`, `Out of ${theme.labels.chips} - buy more 💰`)}
          </button>
        )}

        {s.phase !== 'waiting' && s.phase !== 'showdown' && !myTurn && (
          <div className="turn-row">
            <span>
              {tr('תור של', 'Turn:')} {turnPlayer?.avatar} {turnPlayer && displayName(turnPlayer, lang)}
            </span>
            <Timer deadline={s.turnDeadline} roomId={roomId} />
          </div>
        )}

        {myTurn && me && (
          <>
            <div className="turn-row">
              <span>
                {tr('התור שלך!', 'Your turn!')} {toCall > 0 && tr(`(להשוות ${fmt(toCall)})`, `(${fmt(toCall)} to call)`)}
              </span>
              <Timer deadline={s.turnDeadline} roomId={roomId} />
            </div>
            {raiseOpen ? (
              <div className="raise-panel">
                <div className="raise-value">
                  {raiseTo >= maxTo
                    ? theme.labels.allin
                    : s.currentBet > 0
                      ? tr(`העלאה ל-${fmt(raiseTo)}`, `Raise to ${fmt(raiseTo)}`)
                      : tr(`הימור ${fmt(raiseTo)}`, `Bet ${fmt(raiseTo)}`)}
                </div>
                <input
                  type="range"
                  min={minTo}
                  max={maxTo}
                  step={Math.max(1, Math.floor(s.settings.bb / 2))}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
                <div className="bet-chips">
                  <button className="chip" onClick={() => setRaiseTo(minTo)}>
                    {tr('מינ׳', 'Min')}
                  </button>
                  <button className="chip" onClick={() => setRaiseTo(Math.min(maxTo, Math.max(minTo, s.currentBet + Math.round(pot / 2))))}>
                    {tr('½ פוט', '½ Pot')}
                  </button>
                  <button className="chip" onClick={() => setRaiseTo(Math.min(maxTo, Math.max(minTo, s.currentBet + pot)))}>
                    {tr('פוט', 'Pot')}
                  </button>
                  <button className="chip gold" onClick={() => setRaiseTo(maxTo)}>
                    {tr('הכל', 'Max')}
                  </button>
                </div>
                <div className="btn-grid two">
                  <button className="btn ghost" onClick={() => setRaiseOpen(false)}>
                    {tr('ביטול', 'Cancel')}
                  </button>
                  <AsyncButton className="btn act raise" onClick={() => act(raiseTo >= maxTo ? { type: 'allin' } : { type: 'raise', to: raiseTo })}>
                    {tr('אישור', 'Confirm')}
                  </AsyncButton>
                </div>
              </div>
            ) : (
              <div className="btn-grid three">
                <AsyncButton className="btn act fold" onClick={() => act({ type: 'fold' })}>
                  {theme.labels.fold}
                </AsyncButton>
                {toCall === 0 ? (
                  <AsyncButton className="btn act check" onClick={() => act({ type: 'check' })}>
                    {theme.labels.check}
                  </AsyncButton>
                ) : (
                  <AsyncButton className="btn act call" onClick={() => act(toCall >= me.chips ? { type: 'allin' } : { type: 'call' })}>
                    {toCall >= me.chips ? theme.labels.allin : `${theme.labels.call} ${fmt(toCall)}`}
                  </AsyncButton>
                )}
                {maxTo > s.currentBet && (
                  <button className="btn act raise" onClick={() => (minTo >= maxTo ? act({ type: 'allin' }) : setRaiseOpen(true))}>
                    {minTo >= maxTo ? theme.labels.allin : theme.labels.raise}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {s.phase === 'showdown' && (
          <AsyncButton className="btn primary block" onClick={() => act({ type: 'next' })}>
            {tr('יד הבאה ▶', 'Next hand ▶')}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}

function HSeat({ p, s, isTurn, isWinner, lang }: { p: HPlayer; s: HState; isTurn: boolean; isWinner: boolean; lang: Lang }) {
  const isDealer = s.players[s.dealerIdx]?.id === p.id;
  return (
    <div className={`seat ${isTurn ? 'turn' : ''} ${p.folded || !p.inHand ? 'dim' : ''} ${isWinner ? 'winner' : ''}`}>
      <div className="seat-head">
        <span className="avatar">{p.avatar}</span>
        <span className="seat-name">{displayName(p, lang)}</span>
        {isDealer && <span className="dealer-btn sm">D</span>}
      </div>
      <div className="seat-chips">{p.allIn ? (lang === 'he' ? 'אול-אין!' : 'All-in!') : fmt(p.chips)}</div>
      <div className="seat-cards">
        {p.shown ? <Hand cards={p.shown} size="sm" /> : p.inHand && !p.folded ? <Hand cards={[]} hiddenCount={2} size="sm" /> : null}
      </div>
      {(p.bet > 0 || p.lastAction) && (
        <div className="seat-action">
          {p.bet > 0 && <span className="bet-badge sm">🪙{fmt(p.bet)}</span>}
          {p.lastAction && <span className="last-action sm">{actionLabel(p.lastAction, lang)}</span>}
        </div>
      )}
      {p.sitOut && <div className="seat-status">💤</div>}
    </div>
  );
}
