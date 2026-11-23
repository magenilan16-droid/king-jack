import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { type HState, type HPlayer, potSize, computePots } from '../engine/holdem';
import type { Card as C } from '../engine/cards';
import { turnMs, MAX_STRIKES } from '../engine/common';
import { Card, Hand } from '../components/Card';
import { Timer } from '../components/Timer';
import { HoldemTip } from '../components/Tips';
import { Coach } from '../components/Coach';
import { AsyncButton, toast } from '../components/ui';
import type { Theme } from '../lib/themes';
import { pick } from '../lib/themes';
import { fmt } from '../lib/balances';
import { bestHand } from '../engine/handEval';
import { useI18n, type Lang } from '../lib/i18n';
import { actionLabel, displayName, handName } from '../lib/display';
import { sfx } from '../lib/sound';
import { vibrate } from '../lib/prefs';

type Act = (move: Record<string, unknown>) => Promise<void>;

function phaseLabel(ph: string, lang: Lang) {
  const he: Record<string, string> = { waiting: 'ממתינים', preflop: 'לפני הפלופ', flop: 'פלופ', turn: 'טרן', river: 'ריבר', showdown: 'סיום יד' };
  const en: Record<string, string> = { waiting: 'Waiting', preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };
  return (lang === 'he' ? he : en)[ph] ?? ph;
}

// מיקום המושבים סביב השולחן האובלי (אני תמיד למטה, מחוץ לשולחן)
function seatPos(i: number, n: number) {
  const deg = 180 + (360 * (i + 1)) / (n + 1);
  const rad = (deg * Math.PI) / 180;
  return { x: 50 + 41 * Math.sin(rad), y: 52 - 39 * Math.cos(rad) };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ME_POS = { x: 50, y: 97 };

export function HoldemView({
  s,
  roomId,
  myId,
  hole,
  theme,
  tipsOn,
  premium,
  act,
  onRebuy,
  onSeatTap,
}: {
  s: HState;
  roomId: string;
  myId: string;
  hole: C[];
  theme: Theme;
  tipsOn: boolean;
  premium: boolean;
  act: Act;
  onRebuy: () => void;
  onSeatTap: (id: string) => void;
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
  const total = turnMs(s.settings);

  // המושבים לפי הסדר אחריי (בכיוון השעון)
  const myIdx = s.players.findIndex((p) => p.id === myId);
  const others = myIdx >= 0 ? s.players.slice(myIdx + 1).concat(s.players.slice(0, myIdx)) : s.players;
  const posOf = new Map(others.map((p, i) => [p.id, seatPos(i, others.length)]));
  if (me) posOf.set(me.id, ME_POS);
  const opponents = s.players.filter((p) => p.id !== myId && p.inHand && !p.folded).length;
  const winnerIds = new Set(s.winners.map((w) => w.id));
  const dealerId = s.players[s.dealerIdx]?.id;

  useEffect(() => {
    setRaiseOpen(false);
    setRaiseTo(minTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turnId, s.currentBet, s.phase]);

  // צלילים לפי מה שהשתנה בשולחן
  const prev = useRef<HState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (!p) return;
    if (s.handNo !== p.handNo) sfx.shuffle();
    else if (s.board.length > p.board.length) sfx.card();
    const grew = potSize(s) - potSize(p);
    if (grew > 0 && s.handNo === p.handNo) sfx.chips(Math.min(6, 2 + Math.round(grew / Math.max(1, s.settings.bb * 3))));
    if ((s.blindLevel ?? 0) > (p.blindLevel ?? 0)) {
      sfx.blindsUp();
      toast(tr(`⬆ הבליינדים עלו ל-${s.settings.sb}/${s.settings.bb}`, `⬆ Blinds are now ${s.settings.sb}/${s.settings.bb}`), 'win');
    }
    for (const pl of s.players) {
      const old = p.players.find((x) => x.id === pl.id);
      if (!old || old.lastAction === pl.lastAction) continue;
      if (pl.lastAction === 'check') sfx.check();
      else if (pl.lastAction === 'fold') sfx.fold();
      else if (pl.lastAction === 'allin') sfx.allIn();
    }
    if (s.phase === 'showdown' && p.phase !== 'showdown' && s.winners.length) {
      if (s.winners.some((w) => w.id === myId)) {
        sfx.win();
        vibrate([60, 40, 60, 40, 160]);
      } else if (me?.inHand) sfx.lose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  useEffect(() => {
    if (s.phase !== 'showdown' || !s.winners.length) return;
    setQuip(winnerIds.has(myId) ? pick(theme.win) : me?.inHand ? pick(theme.lose) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.handNo, lang]);

  // המארח מתחיל את היד הבאה אוטומטית
  useEffect(() => {
    if (!isHost || s.phase !== 'showdown') return;
    const t = setTimeout(() => act({ type: 'next' }).catch(() => {}), 6500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, s.phase, s.handNo]);

  const readyPlayers = s.players.filter((p) => p.chips > 0 && !p.sitOut).length;
  const myMade = hole.length === 2 && s.board.length >= 3 ? handName(bestHand(hole.concat(s.board)).cat, lang) : null;
  const showdown = s.phase === 'showdown';

  return (
    <div className="hd">
      <div className="poker-wrap">
        <div className="poker-table">
          <div className="table-brand">KING JACK</div>
        </div>

        {/* מרכז השולחן: קופה וקלפים פתוחים */}
        <div className="table-center">
          <PotsDisplay s={s} pot={pot} lang={lang} />
          <div className="center-meta">
            <span className="phase-tag">{phaseLabel(s.phase, lang)}</span>
            <BlindsClock s={s} lang={lang} />
          </div>
          <div className="board">
            {Array.from({ length: 5 }).map((_, i) =>
              s.board[i] ? <Card key={i + s.board[i]} card={s.board[i]} size="md" /> : <div key={i} className="card slot md" />,
            )}
          </div>
          {showdown && s.winners.length > 0 && (
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

        {/* השחקנים סביב השולחן */}
        {others.map((p) => {
          const pos = posOf.get(p.id)!;
          return (
            <Seat
              key={p.id}
              p={p}
              pos={pos}
              isTurn={s.turnId === p.id}
              isWinner={winnerIds.has(p.id)}
              isDealer={dealerId === p.id}
              deadline={s.turnId === p.id ? s.turnDeadline : null}
              total={total}
              lang={lang}
              onTap={() => onSeatTap(p.id)}
            />
          );
        })}

        {/* ז׳טונים שהומרו בסיבוב הנוכחי */}
        {s.players
          .filter((p) => p.bet > 0 && posOf.has(p.id))
          .map((p) => {
            const pos = posOf.get(p.id)!;
            const t = p.id === myId ? 0.22 : 0.42;
            return (
              <div key={'b' + p.id + p.bet} className="bet-chip" style={{ left: `${lerp(pos.x, 50, t)}%`, top: `${lerp(pos.y, 50, t)}%` }}>
                <span className="chip-icon" />
                {fmt(p.bet)}
              </div>
            );
          })}

        {/* כפתור הדילר */}
        {dealerId &&
          s.phase !== 'waiting' &&
          posOf.has(dealerId) &&
          (() => {
            const pos = posOf.get(dealerId)!;
            const x = dealerId === myId ? 63 : lerp(pos.x, 50, 0.16) + (pos.x < 50 ? 9 : -9);
            const y = dealerId === myId ? 86 : lerp(pos.y, 50, 0.16) + (pos.y < 50 ? 6 : -6);
            return (
              <div className="dealer-btn floating" style={{ left: `${x}%`, top: `${y}%` }}>
                D
              </div>
            );
          })()}

        {/* ז׳טונים שעפים למנצח */}
        {showdown &&
          s.winners.map((w) => {
            const pos = posOf.get(w.id) ?? ME_POS;
            return Array.from({ length: 7 }).map((_, i) => (
              <span
                key={`${s.handNo}-${w.id}-${i}`}
                className="fly-chip"
                style={{ '--tx': `${pos.x}%`, '--ty': `${pos.y}%`, '--d': `${i * 70}ms` } as CSSProperties}
              />
            ));
          })}
      </div>

      {me && (
        <div data-pid={myId} className={`me-area ${myTurn ? 'my-turn' : ''} ${me.folded ? 'dim' : ''} ${winnerIds.has(myId) ? 'winner' : ''}`}>
          <div className="me-row">
            <div className="me-cards">
              {hole.length === 2 ? (
                <Hand cards={hole} size="lg" stagger />
              ) : (
                <div className="me-idle">{me.sitOut ? tr('ישבת בצד 💤', 'Sitting out 💤') : tr('מחכה ליד הבאה', 'Waiting for the next hand')}</div>
              )}
            </div>
            <div className="me-info">
              <div className="my-chips">
                {me.avatar} <b>{fmt(me.chips)}</b>
              </div>
              {me.lastAction && <div className="last-action">{actionLabel(me.lastAction, lang)}</div>}
              {myMade && <div className="made">{myMade}</div>}
            </div>
          </div>
          {me.sitOut && (
            <AsyncButton className="btn primary block" onClick={() => act({ type: 'sitOut', value: false })}>
              {tr('▶ אני חוזר למשחק!', "▶ I'm back in!")}
            </AsyncButton>
          )}
          {!me.sitOut && (me.strikes ?? 0) > 0 && (me.strikes ?? 0) < MAX_STRIKES && (
            <div className="strike-warn">{tr('⚠️ פספסת תור - עוד פעם אחת ותושב בצד', '⚠️ You missed a turn - one more and you sit out')}</div>
          )}
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
            me && <div className="waiting">{tr('מחכים שהמארח יתחיל ⏳', 'Waiting for the host to start ⏳')}</div>
          ))}

        {me && me.chips === 0 && !me.inHand && (
          <button className="btn primary block" onClick={onRebuy}>
            {tr(`נגמרו ה${theme.labels.chips} - קנייה נוספת 💰`, `Out of ${theme.labels.chips} - buy more 💰`)}
          </button>
        )}

        {s.phase !== 'waiting' && !showdown && !myTurn && me && (
          <div className="turn-row">
            <span>
              {tr('תור של', 'Turn:')} {turnPlayer?.avatar} {turnPlayer && displayName(turnPlayer, lang)}
            </span>
            <Timer deadline={s.turnDeadline} roomId={roomId} />
          </div>
        )}

        {myTurn && me && (
          <>
            {hole.length === 2 && <Coach roomId={roomId} premium={premium} contextKey={`${s.handNo}-${s.board.length}-${s.currentBet}`} />}
            <div className="turn-row">
              <span>
                {tr('התור שלך!', 'Your turn!')} {toCall > 0 && tr(`(להשוות ${fmt(toCall)})`, `(${fmt(toCall)} to call)`)}
              </span>
              <Timer deadline={s.turnDeadline} roomId={roomId} mine />
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

        {showdown && me && hole.length === 2 && !me.shown && (
          <AsyncButton className="btn ghost block" onClick={() => act({ type: 'show' })}>
            {tr('👀 הראה את הקלפים שלי', '👀 Show my cards')}
          </AsyncButton>
        )}
        {showdown && me && (
          <AsyncButton className="btn primary block" onClick={() => act({ type: 'next' })}>
            {tr('יד הבאה ▶', 'Next hand ▶')}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}

// טבעת זמן סביב השחקן שבתור
function TurnRing({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const frac = Math.max(0, Math.min(1, (deadline - now) / total));
  return <div className={`turn-ring ${frac < 0.25 ? 'urgent' : ''}`} style={{ '--p': frac } as CSSProperties} />;
}

function Seat({
  p,
  pos,
  isTurn,
  isWinner,
  isDealer,
  deadline,
  total,
  lang,
  onTap,
}: {
  p: HPlayer;
  pos: { x: number; y: number };
  isTurn: boolean;
  isWinner: boolean;
  isDealer: boolean;
  deadline: number | null;
  total: number;
  lang: Lang;
  onTap: () => void;
}) {
  const out = p.folded || !p.inHand;
  return (
    <div
      className={`pseat ${isDealer ? 'is-dealer' : ''} ${isTurn ? 'turn' : ''} ${out ? 'out' : ''} ${isWinner ? 'winner' : ''} ${pos.y < 50 ? 'top' : 'bottom'}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      data-pid={p.id}
      onClick={onTap}
      role="button"
      aria-label={displayName(p, lang)}
    >
      <div className={`pseat-cards ${p.shown ? 'shown' : ''}`}>
        {p.shown ? <Hand cards={p.shown} size="sm" /> : p.inHand && !p.folded ? <Hand cards={[]} hiddenCount={2} size="xs" /> : null}
      </div>
      <div className="pseat-avatar">
        {isTurn && deadline && <TurnRing deadline={deadline} total={total} />}
        <span>{p.avatar}</span>
        {p.sitOut && <span className="sit-out-badge">💤</span>}
      </div>
      <div className="pseat-plate">
        <div className="pseat-name" dir="auto">
          {displayName(p, lang)}
        </div>
        <div className="pseat-chips">{p.allIn ? (lang === 'he' ? 'אול-אין' : 'ALL-IN') : fmt(p.chips)}</div>
      </div>
      {p.lastAction && !p.allIn && !p.shown && <div className="pseat-action">{actionLabel(p.lastAction, lang)}</div>}
    </div>
  );
}

// קופות ברורות: קופה ראשית + צדדיות, ובסוף היד - מי לקח כל קופה
function PotsDisplay({ s, pot, lang }: { s: HState; pot: number; lang: Lang }) {
  const he = lang === 'he';
  const nameOf = (id: string) => {
    const p = s.players.find((x) => x.id === id);
    return p ? `${p.avatar} ${displayName(p, lang)}` : '?';
  };
  if (s.phase === 'showdown' && (s.potResults?.length ?? 0) > 1) {
    return (
      <div className="pots">
        {s.potResults!.map((r, i) => (
          <div key={i} className={`pot-chip ${i === 0 ? 'main' : 'side'}`}>
            <span className="chip-stack" />
            <span>
              {i === 0 ? (he ? 'ראשית' : 'Main') : he ? `צדדית ${i}` : `Side ${i}`} <b>{fmt(r.amount)}</b>
            </span>
            <span className="pot-winner">→ {r.winners.map(nameOf).join(', ')}</span>
          </div>
        ))}
      </div>
    );
  }
  const running = s.phase !== 'waiting' && s.phase !== 'showdown';
  const someoneAllIn = s.players.some((p) => p.inHand && !p.folded && p.allIn);
  const pots = running && someoneAllIn ? computePots(s).filter((p) => p.eligible.length > 1) : [];
  if (pots.length > 1) {
    return (
      <div className="pots">
        {pots.map((p, i) => (
          <div key={i} className={`pot-chip ${i === 0 ? 'main' : 'side'}`}>
            <span className="chip-stack" />
            <span>
              {i === 0 ? (he ? 'קופה ראשית' : 'Main pot') : he ? `צדדית ${i}` : `Side ${i}`} <b>{fmt(p.amount)}</b>
            </span>
            <span className="pot-elig">
              {p.eligible.length} {he ? 'שחקנים' : 'players'}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="pot-pill" key={pot}>
      <span className="chip-stack" />
      {he ? 'קופה' : 'Pot'} <b>{fmt(pot)}</b>
    </div>
  );
}

// בליינדים נוכחיים + כמה זמן עד שהם עולים
function BlindsClock({ s, lang }: { s: HState; lang: Lang }) {
  const [now, setNow] = useState(Date.now());
  const mins = s.settings.blindUpMinutes ?? 0;
  useEffect(() => {
    if (!mins) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [mins]);
  const label = `${s.settings.sb}/${s.settings.bb}`;
  if (!mins || s.levelStartedAt == null) return <span className="blinds-tag">{label}</span>;
  const left = Math.max(0, s.levelStartedAt + mins * 60000 - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <span className={`blinds-tag up ${left < 60000 ? 'soon' : ''}`} title={lang === 'he' ? 'בליינדים עולים בעוד' : 'Blinds up in'}>
      {label} · ⬆ {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}
