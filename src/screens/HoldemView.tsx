// שולחן טקסס הולדם / אומהה - מסך מלא, השחקנים סביב שולחן אובלי ואני למטה
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Sparkles, Crown, Eye } from 'lucide-react';
import { type HState, type HPlayer, potSize, computePots, isOmaha, potLimitTo } from '../engine/holdem';
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
import { bestFor } from '../engine/handEval';
import { useI18n, type Lang } from '../lib/i18n';
import { actionLabel, displayName, handName } from '../lib/display';
import { sfx } from '../lib/sound';
import { vibrate } from '../lib/prefs';
import { useTween, chipBurst } from '../lib/motion';

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
// הקופה יושבת קצת מעל מרכז השולחן
const POT = { x: 50, y: 37 };
// חלוקה: מתחילים אחרי הערבוב, קלף כל 75ms - קודם קלף לכל אחד, ואז השני
const DEAL_BASE = 450;
const DEAL_STEP = 75;
// מרחק במונחי השולחן (cqw/cqh = אחוז מרוחב/גובה אזור השולחן)
const cq = (dx: number, dy: number) => ({ '--dx': `calc(${dx.toFixed(1)} * 1cqw)`, '--dy': `calc(${dy.toFixed(1)} * 1cqh)` }) as CSSProperties;

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
  kingId,
  showReq,
  askShow,
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
  kingId?: string | null;
  showReq?: { hand: number; to: string; from: string[] } | null;
  askShow?: (to: string) => void;
}) {
  const { tr, lang } = useI18n();
  const me = s.players.find((p) => p.id === myId);
  const isHost = s.hostId === myId;
  const myTurn = !!me && s.turnId === myId;
  const turnPlayer = s.players.find((p) => p.id === s.turnId);
  const pot = potSize(s);
  const toCall = me ? Math.max(0, s.currentBet - me.bet) : 0;
  const omaha = isOmaha(s);
  const nHole = omaha ? 4 : 2;
  // באומהה כל אחד מקבל 4 קלפים - מחלקים קצת יותר מהר כדי שהחלוקה לא תימרח
  const step = omaha ? 55 : DEAL_STEP;
  const stackTo = me ? me.bet + me.chips : 0;
  // באומהה (פוט-לימיט) אי אפשר להעלות מעל גודל הקופה
  const maxTo = me && omaha ? Math.min(stackTo, potLimitTo(s, me)) : stackTo;
  const minTo = Math.min(maxTo, s.currentBet + s.minRaise);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseTo, setRaiseTo] = useState(minTo);
  const [quip, setQuip] = useState('');
  const [sweep, setSweep] = useState<{ id: string; x: number; y: number; amount: number; k: number }[]>([]);
  const prevBoard = useRef({ hand: s.handNo, len: s.board.length });
  const boardDelay = useRef(new Map<string, number>());
  const total = turnMs(s.settings);
  const unit = Math.max(1, s.settings.sb);

  // סדר המושבים: אני למטה, ואחריי בכיוון השעון
  const myIdx = s.players.findIndex((p) => p.id === myId);
  const ordered = myIdx >= 0 ? s.players.slice(myIdx).concat(s.players.slice(0, myIdx)) : s.players;
  const posOf = new Map(ordered.map((p, i) => [p.id, seatPos(i, Math.max(ordered.length, 2))]));
  const opponents = s.players.filter((p) => p.id !== myId && p.inHand && !p.folded).length;
  const dealOrder = ordered.filter((p) => p.inHand);
  const dealIdx = new Map(dealOrder.map((p, i) => [p.id, i]));
  const nDealt = Math.max(dealOrder.length, 1);
  // קלפים חדשים על הלוח: מאיזה אינדקס התחילו (כדי לפזר רק אותם בזמן)
  const boardFrom = prevBoard.current.hand === s.handNo ? prevBoard.current.len : 0;
  const delayFor = (i: number) => {
    const k = `${s.handNo}-${i}-${s.board[i]}`;
    const m = boardDelay.current;
    if (!m.has(k)) {
      if (m.size > 40) m.clear();
      m.set(k, Math.max(0, i - boardFrom) * 160 + (i >= 3 && boardFrom < 3 ? 250 : 0));
    }
    return m.get(k)!;
  };
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
    if (s.handNo !== p.handNo) {
      sfx.shuffle();
      const cards = Math.min(omaha ? 16 : 14, s.players.filter((x) => x.inHand).length * nHole);
      for (let k = 0; k < cards; k++) setTimeout(() => sfx.card(), DEAL_BASE + k * step);
    } else if (s.board.length > p.board.length) {
      for (let k = 0; k < s.board.length - p.board.length; k++) setTimeout(() => sfx.card('place'), k * 160);
    }
    // סוף סיבוב הימורים: הז׳טונים שלפני כל שחקן נאספים לקופה
    const streetEnded = s.handNo === p.handNo && (s.board.length > p.board.length || (s.phase === 'showdown' && p.phase !== 'showdown'));
    const oldBets = p.players.filter((x) => x.bet > 0 && posOf.has(x.id));
    if (streetEnded && oldBets.length) {
      const k = Date.now();
      setSweep(
        oldBets.map((x) => {
          const pos = posOf.get(x.id)!;
          const t = x.id === myId ? 0.42 : 0.36;
          return { id: x.id, x: lerp(pos.x, CENTER.x, t), y: lerp(pos.y, CENTER.y, t), amount: x.bet, k };
        }),
      );
      setTimeout(() => sfx.chips(Math.min(6, oldBets.length + 1)), 260);
      setTimeout(() => setSweep((cur) => (cur[0]?.k === k ? [] : cur)), 700);
    }
    const grew = potSize(s) - potSize(p);
    if (grew > 0 && s.handNo === p.handNo) sfx.chips(Math.min(6, 2 + Math.round(grew / Math.max(1, s.settings.bb * 3))));
    if ((s.blindLevel ?? 0) > (p.blindLevel ?? 0)) {
      sfx.blindsUp();
      toast(tr(`הבליינדים עלו ל-${s.settings.sb}/${s.settings.bb}`, `Blinds are now ${s.settings.sb}/${s.settings.bb}`), 'win');
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
        setTimeout(() => chipBurst(document.querySelector('.pk-seat.me .pk-av'), { count: 14 }), 1000);
      } else if (me?.inHand) sfx.lose();
      else sfx.pot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  useEffect(() => {
    prevBoard.current = { hand: s.handNo, len: s.board.length };
  });

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

  // "תראה!" - מי שלקח קופה בלי שראו לו קלפים, החברים יכולים לדרוש לראות
  const foldWinner = showdown && s.winners.length === 1 && s.winners[0].cat < 0 ? s.players.find((p) => p.id === s.winners[0].id && !p.shown) : undefined;
  const req = showReq && showReq.hand === s.handNo ? showReq : null;
  const canAskShow = !!me && !!foldWinner && foldWinner.id !== myId && !foldWinner.isBot;
  const iAsked = !!req && req.to === foldWinner?.id && req.from.includes(myId);
  const askedMe = req && req.to === myId ? req.from.length : 0;
  const readyPlayers = s.players.filter((p) => p.chips > 0 && !p.sitOut).length;
  const made = hole.length >= 2 && s.board.length >= 3 ? handName(bestFor(hole, s.board).cat, lang) : null;
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
              s.board[i] ? (
                <Card key={i + s.board[i]} card={s.board[i]} size="md" deal flip delay={delayFor(i)} />
              ) : (
                <span key={i} className="pk-slot" />
              ),
            )}
          </div>
          <div className="pk-meta">
            {omaha && <span className="pk-variant">{tr('אומהה', 'Omaha')}</span>}
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
            dealIdx={dealIdx.get(p.id) ?? 0}
            nDealt={nDealt}
            nHole={nHole}
            step={step}
            isKing={kingId === p.id}
            handNo={s.handNo}
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
              <span
                key={'b' + p.id + p.bet}
                className="pk-bet kj-bet"
                style={{ left: `${lerp(pos.x, CENTER.x, t)}%`, top: `${lerp(pos.y, CENTER.y, t)}%`, ...cq((pos.x - CENTER.x) * t, (pos.y - CENTER.y) * t) }}
              >
                <ChipStack amount={p.bet} unit={unit} size={16} />
              </span>
            );
          })}

        {/* סוף סיבוב: הז׳טונים נאספים לקופה */}
        {sweep.map((b) => (
          <span key={`sw-${b.k}-${b.id}`} className="pk-bet kj-sweep" style={{ left: `${b.x}%`, top: `${b.y}%`, ...cq(POT.x - b.x, POT.y - b.y) }}>
            <ChipStack amount={b.amount} unit={unit} size={16} label={false} />
          </span>
        ))}

        {/* הקופה עפה למנצח */}
        {showdown &&
          s.winners.map((w) => {
            const pos = posOf.get(w.id) ?? { x: 50, y: 86 };
            return Array.from({ length: 9 }).map((_, i) => (
              <span
                key={`${s.handNo}-${w.id}-${i}`}
                className="kj-potchip"
                style={{ left: `${POT.x}%`, top: `${POT.y}%`, ...cq(pos.x - POT.x, pos.y - POT.y), '--d': `${520 + i * 55}ms` } as CSSProperties}
              />
            ));
          })}

        {/* הקלפים שלי - גדולים, מעל המושב שלי */}
        {me && hole.length >= 2 && (
          <div className={`pk-hole ${hole.length === 4 ? 'four' : ''} ${me.folded ? 'folded' : ''} ${winnerIds.has(myId) ? 'won' : ''}`} style={cq(0, CENTER.y - 88)}>
            {hole.map((c, i) => (
              <Card key={c + i} card={c} size="lg" deal flip delay={DEAL_BASE + i * nDealt * step} />
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
            {tr(`קנייה חוזרת ב-${fmt(s.settings.buyIn)}`, `Rebuy for ${fmt(s.settings.buyIn)}`)}
          </button>
        )}

        {s.phase === 'waiting' &&
          (me ? (
            <AsyncButton className="pk-btn gold block" onClick={() => act({ type: 'start' })} disabled={readyPlayers < 2}>
              {readyPlayers < 2 ? tr('צריך לפחות 2 שחקנים. אפשר להוסיף בוט בתפריט.', 'Need 2+ players. Add a bot from the menu.') : tr('התחלת יד', 'Deal')}
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
              {tipsOn && hole.length >= 2 ? <HoldemTip hole={hole} board={s.board} opponents={opponents} toCall={toCall} pot={pot} compact /> : <span />}
              {hole.length === 2 && <Coach roomId={roomId} premium={premium} contextKey={`${s.handNo}-${s.board.length}-${s.currentBet}`} compact />}
            </div>
            {raiseOpen ? (
              <div className="pk-raise">
                <div className="pk-raise-top">
                  <span className="pk-raise-amt">{raiseTo >= stackTo ? tr('אול-אין', 'All-in') : fmt(raiseTo)}</span>
                  <div className="pk-presets">
                    {potPresets.map((pp) => (
                      <button key={pp.label} onClick={() => setRaiseTo(Math.min(maxTo, Math.max(minTo, pp.to)))}>
                        {pp.label}
                      </button>
                    ))}
                    {/* באומהה הכפתור "קופה" הוא כבר המקסימום */}
                    {!omaha && (
                      <button className="allin" onClick={() => setRaiseTo(maxTo)}>
                        {tr('הכל', 'All')}
                      </button>
                    )}
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
                  <AsyncButton className="pk-btn gold" onClick={() => act(raiseTo >= stackTo ? { type: 'allin' } : { type: 'raise', to: Math.min(raiseTo, maxTo) })}>
                    {raiseTo >= stackTo
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
                  minTo >= maxTo ? (
                    <AsyncButton className="pk-btn raise" onClick={() => act({ type: 'allin' })}>
                      {theme.labels.allin}
                    </AsyncButton>
                  ) : (
                    <button className="pk-btn raise" onClick={() => setRaiseOpen(true)}>
                      {theme.labels.raise}
                    </button>
                  )
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        )}

        {showdown && me && (
          <div className="pk-btnrow">
            {hole.length >= 2 && !me.shown && (
              <AsyncButton className={`pk-btn ${askedMe ? 'gold kj-asked' : 'ghost'}`} onClick={() => act({ type: 'show' })}>
                {askedMe ? tr(`להראות (${askedMe} ביקשו)`, `Show (${askedMe} asked)`) : tr('הראה קלפים', 'Show cards')}
              </AsyncButton>
            )}
            {canAskShow && (
              <button
                className="pk-btn ghost kj-showme"
                disabled={iAsked}
                onClick={() => {
                  askShow?.(foldWinner!.id);
                  vibrate(12);
                }}
              >
                <Eye size={18} /> {iAsked ? tr('ביקשת', 'Asked') : tr('תראה!', 'Show!')}
              </button>
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
  dealIdx,
  nDealt,
  nHole,
  step,
  isKing,
  handNo,
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
  dealIdx: number;
  nDealt: number;
  nHole: number;
  step: number;
  isKing: boolean;
  handNo: number;
}) {
  // מי שזכה: הערימה עולה רק כשהז׳טונים מהקופה מגיעים אליו
  const chips = useTween(p.chips, 450, winAmount ? 1100 : 0);
  const out = p.folded || (!p.inHand && !waiting) || (waiting && (p.sitOut || p.chips <= 0));
  const kind = actionKind(p.lastAction);
  return (
    <div
      className={`pk-seat ${isMe ? 'me' : ''} ${isTurn ? 'turn' : ''} ${out ? 'out' : ''} ${winAmount ? 'winner' : ''} ${pos.y < 40 ? 'top' : ''} ${pos.x < 30 ? 'side-l' : pos.x > 70 ? 'side-r' : ''} ${!isMe && pos.y >= 38 && pos.y <= 54 ? 'mid' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      data-pid={p.id}
      onClick={onTap}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap()}
      role="button"
      tabIndex={isMe ? -1 : 0}
      aria-label={displayName(p, lang)}
    >
      {!isMe && p.inHand && !p.folded && !p.shown && (
        <span className={`pk-backs ${nHole === 4 ? 'four' : ''}`} key={handNo} style={cq(CENTER.x - pos.x, CENTER.y - pos.y)}>
          {Array.from({ length: nHole }).map((_, r) => (
            <Card key={r} card={null} size="xs" deal delay={DEAL_BASE + (r * nDealt + dealIdx) * step} />
          ))}
        </span>
      )}
      {!isMe && p.shown && (
        <span className={`pk-shown ${p.shown.length === 4 ? 'four' : ''}`}>
          {p.shown.map((c, i) => (
            <Card key={c} card={c} size="sm" flip delay={i * 110} />
          ))}
        </span>
      )}
      <span className="pk-av">
        {isTurn && deadline && <TurnRing deadline={deadline} total={total} />}
        <Avatar name={p.name} emoji={p.avatar} bot={p.isBot} size={isMe ? 50 : 44} />
        {isDealer && <span className="pk-dealer">D</span>}
        {isKing && (
          <span className="kj-crown" title={lang === 'he' ? 'מלך הערב' : 'King of the night'}>
            <Crown size={isMe ? 14 : 12} strokeWidth={2.4} />
          </span>
        )}
        {p.sitOut && <span className="pk-away">{lang === 'he' ? 'הפסקה' : 'Away'}</span>}
      </span>
      <span className="pk-plate">
        <span className="pk-name" dir="auto">
          {isMe ? (lang === 'he' ? 'אני' : 'Me') : displayName(p, lang)}
        </span>
        <span className={`pk-stack ${p.allIn ? 'allin' : ''}`}>{p.allIn ? (lang === 'he' ? 'אול-אין' : 'All-in') : fmt(chips)}</span>
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
  const potShown = useTween(pot, 380);
  const nameOf = (id: string) => {
    const p = s.players.find((x) => x.id === id);
    return p ? displayName(p, lang) : '?';
  };
  if (s.phase === 'showdown' && (s.potResults?.length ?? 0) > 1) {
    return (
      <div className="pk-pots">
        {s.potResults!.map((r, i) => (
          <span key={i} className={`pk-pot ${i ? 'side' : ''}`}>
            {i === 0 ? (he ? 'ראשית' : 'Main') : he ? `צדדית ${i}` : `Side ${i}`} <b>{fmt(r.amount)}</b> {he ? '←' : '→'} {r.winners.map(nameOf).join(', ')}
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
      <span className={`pk-pot main ${s.phase === 'showdown' ? 'kj-pot-out' : ''}`}>
        <ChipStack amount={pot} unit={unit} size={16} label={false} />
        <b>{fmt(potShown)}</b>
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
