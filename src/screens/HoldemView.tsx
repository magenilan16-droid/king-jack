// שולחן טקסס הולדם - מסך מלא, השחקנים סביב שולחן אובלי ואני למטה
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { type HState, type HPlayer, potSize, computePots } from '../engine/holdem';
import type { Card as C } from '../engine/cards';
import { turnMs, MAX_STRIKES } from '../engine/common';
import { canRebuyNow } from '../engine/room';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { ChipStack } from '../components/Chips';
import { TurnBar, TurnRing } from '../components/TurnBar';
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

// מיקום מושב i מתוך n סביב השולחן. מושב 0 = למטה במרכז (אני)
function seatPos(i: number, n: number) {
  const rad = ((180 + (360 * i) / n) * Math.PI) / 180;
  return { x: 50 + 38.5 * Math.sin(rad), y: 46 - 40 * Math.cos(rad) };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const CENTER = { x: 50, y: 44 };

function actionKind(code: string | null) {
  if (!code) return '';
  const k = code.split(':')[0];
  return k === 'call' || k === 'check' ? 'pos' : k === 'raise' ? 'raise' : k === 'allin' ? 'allin' : k === 'fold' || k === 'left' ? 'fold' : 'blind';
}

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
  const unit = Math.max(1, s.settings.sb);

  // סדר המושבים: אני למטה, ואחריי בכיוון השעון
  const myIdx = s.players.findIndex((p) => p.id === myId);
  const ordered = myIdx >= 0 ? s.players.slice(myIdx).concat(s.players.slice(0, myIdx)) : s.players;
  const posOf = new Map(ordered.map((p, i) => [p.id, seatPos(i, Math.max(ordered.length, 2))]));
  const opponents = s.players.filter((p) => p.id !== myId && p.inHand && !p.folded).length;
  const winnerIds = new Set(s.winners.map((w) => w.id));
  const winAmount = new Map(s.winners.map((w) => [w.id, w.amount]));
  const dealerId = s.players[s.dealerIdx]?.id;
  const showdown = s.phase === 'showdown';
  const running = s.phase !== 'waiting' && !showdown;

  useEffect(() => {
    setRaiseOpen(false);
    setRaiseTo(minTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turnId, s.currentBet, s.phase]);

  // צלילים ורטט לפי מה שהשתנה בשולחן
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
    if (!showdown || !s.winners.length) return;
    setQuip(winnerIds.has(myId) ? pick(theme.win) : me?.inHand ? pick(theme.lose) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.handNo, lang]);

  // המארח מתחיל את היד הבאה אוטומטית
  useEffect(() => {
    if (!me || !showdown) return;
    const t = setTimeout(() => act({ type: 'next' }).catch(() => {}), isHost ? 6500 : 9500 + Math.random() * 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, !!me, s.phase, s.handNo]);

  const readyPlayers = s.players.filter((p) => p.chips > 0 && !p.sitOut).length;
  const made = hole.length === 2 && s.board.length >= 3 ? handName(bestHand(hole.concat(s.board)).cat, lang) : null;
  // העלאה בגודל הקופה = הקופה אחרי שמשווים, מעל ההימור הנוכחי
  const potAfterCall = pot + toCall;
  const potPresets = [
    { label: tr('מינ׳', 'Min'), to: minTo },
    { label: '½', to: s.currentBet + Math.round(potAfterCall / 2) },
    { label: '¾', to: s.currentBet + Math.round((potAfterCall * 3) / 4) },
    { label: tr('קופה', 'Pot'), to: s.currentBet + potAfterCall },
  ];
  // אחרי אול-אין קצר, מי שכבר פעל יכול רק להשוות או לוותר
  const canRaise = !!me && !me.acted && maxTo > s.currentBet;

  return (
    <div className="pk">
      <div className="pk-stage">
        <div className="pk-table">
          <div className="pk-felt">
            <span className="pk-logo" translate="no">KING JACK</span>
          </div>
        </div>

        {/* מרכז: קופה, קלפים פתוחים, שלב ובליינדים */}
        <div className="pk-center">
          <Pots s={s} pot={pot} unit={unit} lang={lang} />
          <div className="pk-board">
            {Array.from({ length: 5 }).map((_, i) =>
              s.board[i] ? <Card key={i + s.board[i]} card={s.board[i]} size="md" /> : <span key={i} className="pk-slot" />,
            )}
          </div>
          <div className="pk-meta">
            <span>{phaseLabel(s.phase, lang)}</span>
            <BlindsClock s={s} />
          </div>
          {showdown && s.winners.length > 0 && (
            <div className="pk-result">
              {s.winners.map((w) => {
                const wp = s.players.find((p) => p.id === w.id);
                const name = wp ? displayName(wp, lang) : w.name;
                return (
                  <div key={w.id} dir="auto">
                    {w.cat >= 0 ? tr(`${name} עם ${handName(w.cat, lang)}`, `${name} with ${handName(w.cat, lang)}`) : tr(`${name} לקח/ה את הקופה`, `${name} takes the pot`)}
                  </div>
                );
              })}
              {quip && <div className="pk-quip">{quip}</div>}
            </div>
          )}
        </div>

        {/* השחקנים */}
        {ordered.map((p) => (
          <Seat
            key={p.id}
            p={p}
            pos={posOf.get(p.id)!}
            isMe={p.id === myId}
            isTurn={s.turnId === p.id}
            isDealer={dealerId === p.id && s.phase !== 'waiting'}
            waiting={s.phase === 'waiting'}
            winAmount={winAmount.get(p.id)}
            deadline={s.turnId === p.id ? s.turnDeadline : null}
            total={total}
            lang={lang}
            onTap={() => onSeatTap(p.id)}
          />
        ))}

        {/* הימורים בסיבוב הנוכחי */}
        {s.players
          .filter((p) => p.bet > 0 && posOf.has(p.id))
          .map((p) => {
            const pos = posOf.get(p.id)!;
            const t = p.id === myId ? 0.42 : 0.36;
            return (
              <span key={'b' + p.id + p.bet} className="pk-bet" style={{ left: `${lerp(pos.x, CENTER.x, t)}%`, top: `${lerp(pos.y, CENTER.y, t)}%` }}>
                <ChipStack amount={p.bet} unit={unit} size={16} />
              </span>
            );
          })}

        {/* ז׳טונים שעפים למנצח */}
        {showdown &&
          s.winners.map((w) => {
            const pos = posOf.get(w.id) ?? { x: 50, y: 86 };
            return Array.from({ length: 8 }).map((_, i) => (
              <span
                key={`${s.handNo}-${w.id}-${i}`}
                className="fly-chip"
                style={{ '--tx': `${pos.x}%`, '--ty': `${pos.y}%`, '--d': `${i * 60}ms` } as CSSProperties}
              />
            ));
          })}

        {/* הקלפים שלי - גדולים, מעל המושב שלי */}
        {me && hole.length === 2 && (
          <div className={`pk-hole ${me.folded ? 'folded' : ''} ${winnerIds.has(myId) ? 'won' : ''}`}>
            {hole.map((c, i) => (
              <Card key={c + i} card={c} size="lg" delay={i * 90} />
            ))}
            {made && !me.folded && <span className="pk-made">{made}</span>}
          </div>
        )}
      </div>

      {/* אזור הפעולה */}
      <div className="pk-actions">
        {me?.sitOut && (
          <AsyncButton className="pk-btn gold block" onClick={() => act({ type: 'sitOut', value: false })}>
            {tr('אני חוזר למשחק', "I'm back in")}
          </AsyncButton>
        )}
        {me && !me.sitOut && (me.strikes ?? 0) > 0 && (me.strikes ?? 0) < MAX_STRIKES && (
          <div className="pk-note warn">{tr('פספסת תור - עוד פעם אחת ותושב בצד', 'You missed a turn - one more and you sit out')}</div>
        )}
        {me && canRebuyNow(s, myId) && (
          <button className="pk-btn gold block" onClick={onRebuy}>
            {tr('קנייה חוזרת', 'Rebuy')} · {fmt(s.settings.buyIn)}
          </button>
        )}

        {s.phase === 'waiting' &&
          (me ? (
            <AsyncButton className="pk-btn gold block" onClick={() => act({ type: 'start' })} disabled={readyPlayers < 2}>
              {readyPlayers < 2 ? tr('צריך לפחות 2 שחקנים · אפשר להוסיף בוט בתפריט', 'Need 2+ players · add a bot from the menu') : tr('התחלת יד', 'Deal')}
            </AsyncButton>
          ) : (
            <div className="pk-note">{tr('מחכים שמישהו בשולחן יחלק', 'Waiting for someone at the table to deal')}</div>
          ))}

        {running && !myTurn && turnPlayer && (
          <div className="pk-waitrow">
            <span>
              {tr('תור של', 'Waiting for')} <b dir="auto">{displayName(turnPlayer, lang)}</b>
            </span>
            <TurnBar deadline={s.turnDeadline} total={total} roomId={roomId} />
          </div>
        )}

        {myTurn && me && (
          <>
            <TurnBar deadline={s.turnDeadline} total={total} roomId={roomId} mine />
            <div className="pk-hintrow">
              {tipsOn && hole.length === 2 ? <HoldemTip hole={hole} board={s.board} opponents={opponents} toCall={toCall} pot={pot} compact /> : <span />}
              {hole.length === 2 && <Coach roomId={roomId} premium={premium} contextKey={`${s.handNo}-${s.board.length}-${s.currentBet}`} compact />}
            </div>
            {raiseOpen ? (
              <div className="pk-raise">
                <div className="pk-raise-top">
                  <span className="pk-raise-amt">{raiseTo >= maxTo ? tr('אול-אין', 'All-in') : fmt(raiseTo)}</span>
                  <div className="pk-presets">
                    {potPresets.map((pp) => (
                      <button key={pp.label} onClick={() => setRaiseTo(Math.min(maxTo, Math.max(minTo, pp.to)))}>
                        {pp.label}
                      </button>
                    ))}
                    <button className="allin" onClick={() => setRaiseTo(maxTo)}>
                      {tr('הכל', 'All')}
                    </button>
                  </div>
                </div>
                <input
                  className="pk-slider"
                  type="range"
                  aria-label={tr('סכום ההעלאה', 'Raise amount')}
                  min={minTo}
                  max={maxTo}
                  step={Math.max(1, Math.floor(s.settings.bb / 2))}
                  value={raiseTo}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                />
                <div className="pk-btnrow">
                  <button className="pk-btn ghost" onClick={() => setRaiseOpen(false)}>
                    {tr('ביטול', 'Cancel')}
                  </button>
                  <AsyncButton className="pk-btn gold" onClick={() => act(raiseTo >= maxTo ? { type: 'allin' } : { type: 'raise', to: raiseTo })}>
                    {raiseTo >= maxTo
                      ? tr('אול-אין', 'All-in')
                      : s.currentBet > 0
                        ? tr(`העלאה ל-${fmt(raiseTo)}`, `Raise to ${fmt(raiseTo)}`)
                        : tr(`הימור ${fmt(raiseTo)}`, `Bet ${fmt(raiseTo)}`)}
                  </AsyncButton>
                </div>
              </div>
            ) : (
              <div className="pk-btnrow three">
                <AsyncButton className="pk-btn fold" onClick={() => act({ type: 'fold' })}>
                  {theme.labels.fold}
                </AsyncButton>
                {toCall === 0 ? (
                  <AsyncButton className="pk-btn call" onClick={() => act({ type: 'check' })}>
                    {theme.labels.check}
                  </AsyncButton>
                ) : (
                  <AsyncButton className="pk-btn call" onClick={() => act(toCall >= me.chips ? { type: 'allin' } : { type: 'call' })}>
                    <span>{toCall >= me.chips ? theme.labels.allin : theme.labels.call}</span>
                    <small>{fmt(Math.min(toCall, me.chips))}</small>
                  </AsyncButton>
                )}
                {canRaise ? (
                  <button className="pk-btn raise" onClick={() => (minTo >= maxTo ? act({ type: 'allin' }) : setRaiseOpen(true))}>
                    {minTo >= maxTo ? theme.labels.allin : theme.labels.raise}
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}

        {showdown && me && (
          <div className="pk-btnrow">
            {hole.length === 2 && !me.shown && (
              <AsyncButton className="pk-btn ghost" onClick={() => act({ type: 'show' })}>
                {tr('הראה קלפים', 'Show cards')}
              </AsyncButton>
            )}
            <AsyncButton className="pk-btn gold" onClick={() => act({ type: 'next' })}>
              {tr('יד הבאה', 'Next hand')}
            </AsyncButton>
          </div>
        )}
      </div>
    </div>
  );
}

// מושב שחקן
function Seat({
  p,
  pos,
  isMe,
  isTurn,
  isDealer,
  waiting,
  winAmount,
  deadline,
  total,
  lang,
  onTap,
}: {
  p: HPlayer;
  pos: { x: number; y: number };
  isMe: boolean;
  isTurn: boolean;
  isDealer: boolean;
  waiting: boolean;
  winAmount?: number;
  deadline: number | null;
  total: number;
  lang: Lang;
  onTap: () => void;
}) {
  const out = p.folded || (!p.inHand && !waiting) || (waiting && (p.sitOut || p.chips <= 0));
  const kind = actionKind(p.lastAction);
  return (
    <div
      className={`pk-seat ${isMe ? 'me' : ''} ${isTurn ? 'turn' : ''} ${out ? 'out' : ''} ${winAmount ? 'winner' : ''} ${pos.y < 40 ? 'top' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      data-pid={p.id}
      onClick={onTap}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap()}
      role="button"
      tabIndex={isMe ? -1 : 0}
      aria-label={displayName(p, lang)}
    >
      {!isMe && p.inHand && !p.folded && !p.shown && (
        <span className="pk-backs">
          <Card card={null} size="xs" />
          <Card card={null} size="xs" />
        </span>
      )}
      {!isMe && p.shown && (
        <span className="pk-shown">
          <Card card={p.shown[0]} size="sm" />
          <Card card={p.shown[1]} size="sm" />
        </span>
      )}
      <span className="pk-av">
        {isTurn && deadline && <TurnRing deadline={deadline} total={total} />}
        <Avatar name={p.name} emoji={p.avatar} bot={p.isBot} size={isMe ? 50 : 44} />
        {isDealer && <span className="pk-dealer">D</span>}
        {p.sitOut && <span className="pk-away">💤</span>}
      </span>
      <span className="pk-plate">
        <span className="pk-name" dir="auto">
          {isMe ? (lang === 'he' ? 'אני' : 'Me') : displayName(p, lang)}
        </span>
        <span className={`pk-stack ${p.allIn ? 'allin' : ''}`}>{p.allIn ? (lang === 'he' ? 'אול-אין' : 'All-in') : fmt(p.chips)}</span>
      </span>
      {p.lastAction && !p.shown && !winAmount && <span className={`pk-act ${kind}`}>{actionLabel(p.lastAction, lang)}</span>}
      {winAmount ? (
        <span className="pk-win" dir="ltr">
          +{fmt(winAmount)}
        </span>
      ) : null}
    </div>
  );
}

// קופה ראשית + קופות צדדיות, ובסוף היד - מי לקח כל קופה
function Pots({ s, pot, unit, lang }: { s: HState; pot: number; unit: number; lang: Lang }) {
  const he = lang === 'he';
  const nameOf = (id: string) => {
    const p = s.players.find((x) => x.id === id);
    return p ? displayName(p, lang) : '?';
  };
  if (s.phase === 'showdown' && (s.potResults?.length ?? 0) > 1) {
    return (
      <div className="pk-pots">
        {s.potResults!.map((r, i) => (
          <span key={i} className={`pk-pot ${i ? 'side' : ''}`}>
            {i === 0 ? (he ? 'ראשית' : 'Main') : he ? `צדדית ${i}` : `Side ${i}`} <b>{fmt(r.amount)}</b> → {r.winners.map(nameOf).join(', ')}
          </span>
        ))}
      </div>
    );
  }
  const running = s.phase !== 'waiting' && s.phase !== 'showdown';
  const anyAllIn = s.players.some((p) => p.inHand && !p.folded && p.allIn);
  const pots = running && anyAllIn ? computePots(s).filter((p) => p.eligible.length > 1) : [];
  if (pots.length > 1) {
    return (
      <div className="pk-pots">
        {pots.map((p, i) => (
          <span key={i} className={`pk-pot ${i ? 'side' : ''}`}>
            <ChipStack amount={p.amount} unit={unit} size={14} label={false} />
            {i === 0 ? (he ? 'קופה ראשית' : 'Main pot') : he ? `צדדית ${i}` : `Side ${i}`} <b>{fmt(p.amount)}</b>
            <small>
              {p.eligible.length} {he ? 'שחקנים' : 'players'}
            </small>
          </span>
        ))}
      </div>
    );
  }
  if (pot <= 0) return <div className="pk-pots empty" />;
  return (
    <div className="pk-pots">
      <span className="pk-pot main" key={pot}>
        <ChipStack amount={pot} unit={unit} size={16} label={false} />
        <b>{fmt(pot)}</b>
      </span>
    </div>
  );
}

// בליינדים + שעון לעלייה הבאה
function BlindsClock({ s }: { s: HState }) {
  const [now, setNow] = useState(Date.now());
  const mins = s.settings.blindUpMinutes ?? 0;
  useEffect(() => {
    if (!mins) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [mins]);
  const label = `${s.settings.sb}/${s.settings.bb}`;
  if (!mins || s.levelStartedAt == null) return <span className="pk-blinds">{label}</span>;
  const left = Math.max(0, s.levelStartedAt + mins * 60000 - now);
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <span className={`pk-blinds up ${left < 60000 ? 'soon' : ''}`}>
      {label} <Sparkles size={11} /> {mm}:{String(ss).padStart(2, '0')}
    </span>
  );
}
