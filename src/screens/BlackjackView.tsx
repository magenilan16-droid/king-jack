// שולחן בלאק ג׳ק - חצי עיגול: הדילר על הצד הישר למעלה, השחקנים על הקשת ואני למטה במרכז
import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { type BJState, type BJPlayer, type BJHand, handValue, canDouble, canSplit, isNatural, betWindowMs } from '../engine/blackjack';
import type { Card as C } from '../engine/cards';
import { Card } from '../components/Card';
import { Avatar } from '../components/Avatar';
import { ChipStack } from '../components/Chips';
import { TurnBar, TurnRing } from '../components/TurnBar';
import { BlackjackTip } from '../components/Tips';
import { Coach } from '../components/Coach';
import { AsyncButton } from '../components/ui';
import type { Theme } from '../lib/themes';
import { pick } from '../lib/themes';
import { fmt, signed } from '../lib/balances';
import { useI18n, type Lang } from '../lib/i18n';
import { displayName } from '../lib/display';
import { sfx, seatPan } from '../lib/sound';
import { vibrate } from '../lib/prefs';
import { useTween, flyChips, chipBurst } from '../lib/motion';
import { Crown } from 'lucide-react';
import { MAX_STRIKES, turnMs } from '../engine/common';

type Act = (move: Record<string, unknown>) => Promise<void>;
type Size = 'xs' | 'sm' | 'md' | 'lg';

function resultLabel(r: string, lang: Lang): string {
  const he: Record<string, string> = { blackjack: 'בלאק ג׳ק', win: 'ניצחון', push: 'תיקו', lose: 'הפסד', bust: 'נשרף' };
  const en: Record<string, string> = { blackjack: 'Blackjack', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };
  return (lang === 'he' ? he : en)[r] ?? r;
}

function handTotal(cards: C[]) {
  const v = handValue(cards);
  return v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total);
}

// מיקומי מושבים על הקשת: צד שמאל (-1) או ימין (1). j=0 הכי קרוב אליי
function arcSpots(count: number, side: 1 | -1) {
  return Array.from({ length: count }, (_, j) => {
    const t = count === 1 ? 0.45 : j / (count - 1);
    const rad = ((46 + 38 * t) * Math.PI) / 180;
    return { x: 50 + side * 39 * Math.sin(rad), y: 25 + 44 * Math.cos(rad) };
  });
}

// עד 3 שחקנים בכל צד: עמודה לאורך הדופן, הקלפים מעל השחקן - כדי שלא ייכנסו למרכז
function columnSpots(count: number, side: 1 | -1) {
  return Array.from({ length: count }, (_, j) => {
    const t = count === 1 ? 0.5 : j / (count - 1);
    return { x: 50 + side * 37, y: 76 - 52 * t };
  });
}

// ערכי הז׳טונים במגש לפי ההימור המינימלי
function trayValues(min: number, max: number) {
  const out: number[] = [];
  for (const m of [1, 5, 10, 25, 100]) {
    const v = min * m;
    if (v <= max && !out.includes(v)) out.push(v);
  }
  return out.length ? out : [min];
}
const short = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : String(v));

export function BlackjackView({
  s,
  roomId,
  myId,
  theme,
  tipsOn,
  premium,
  act,
  onRebuy,
  onSeatTap,
  kingId,
}: {
  s: BJState;
  roomId: string;
  myId: string;
  theme: Theme;
  tipsOn: boolean;
  premium: boolean;
  act: Act;
  onRebuy: () => void;
  onSeatTap: (id: string) => void;
  kingId?: string | null;
}) {
  const { tr, lang } = useI18n();
  const me = s.players.find((p) => p.id === myId);
  const myChips = useTween(me?.chips ?? 0);
  const isHost = s.hostId === myId;
  const banker = s.players.find((p) => p.id === s.bankerId);
  const amBanker = s.bankerId === myId;
  const turnPlayer = s.phase === 'playing' && s.turn ? s.players[s.turn.p] : null;
  const myTurn = !!turnPlayer && turnPlayer.id === myId;
  const total = turnMs(s.settings);
  const [bet, setBet] = useState(me?.bet ?? s.settings.minBet);
  const [resultQuip, setResultQuip] = useState('');

  useEffect(() => {
    if (me && s.phase === 'betting' && !me.ready) setBet(Math.min(me.bet, Math.max(s.settings.minBet, Math.floor(me.chips))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  // סיכום הסיבוב שלי + בדיחה
  const myNet = me ? me.hands.reduce((a, h) => a + (h.payout ?? 0) - h.bet, 0) : 0;
  useEffect(() => {
    if (s.phase !== 'results' || !me?.hands.length) return;
    setResultQuip(myNet > 0 ? pick(theme.win) : myNet < 0 ? pick(theme.lose) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round, lang]);

  // צלילים לפי מה שהשתנה בשולחן
  const prev = useRef<BJState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (!p) return;
    const count = (x: BJState) => x.dealer.cards.length + x.players.reduce((a, pl) => a + pl.hands.reduce((b, h) => b + h.cards.length, 0), 0);
    if (s.round !== p.round && s.phase === 'playing') {
      sfx.shuffle();
      const n = Math.min(14, count(s));
      for (let k = 0; k < n; k++) setTimeout(() => sfx.card(), 380 + k * 110);
    } else if (count(s) > count(p)) sfx.card();
    if (s.phase === 'betting') {
      let k = 0;
      for (const pl of s.players) {
        const was = p.players.find((x) => x.id === pl.id);
        if (!pl.ready || was?.ready || pl.id === myId) continue;
        const id = pl.id;
        const amt = pl.bet;
        setTimeout(() => sfx.bet(amt, s.settings.minBet, seatPan(id)), k++ * 180);
      }
    }
    if (s.phase === 'results' && p.phase !== 'results') {
      // הדילר משלם למנצחים ואוסף מהמפסידים
      const rack = document.querySelector('.bk-rack');
      for (const pl of s.players) {
        if (!pl.hands.length || pl.id === s.bankerId) continue;
        const net = pl.hands.reduce((a, h) => a + (h.payout ?? 0) - h.bet, 0);
        const spot = pl.id === myId ? document.querySelector('.bk-me .bk-circle') : document.querySelector(`.bk-seat[data-pid="${CSS.escape(pl.id)}"] .bk-spot`);
        if (net > 0) flyChips(rack, spot, { count: pl.id === myId ? 7 : 3, delay: 700, color: '#c9a24a' });
        else if (net < 0) flyChips(spot, rack, { count: pl.id === myId ? 5 : 2, delay: 700, color: '#b3452f' });
      }
      const mine = s.players.find((x) => x.id === myId);
      if (mine?.hands.length) {
        const net = mine.hands.reduce((a, h) => a + (h.payout ?? 0) - h.bet, 0);
        if (net > 0) {
          sfx.win();
          vibrate([60, 40, 60, 40, 160]);
          setTimeout(() => chipBurst(document.querySelector('.bk-me .bk-circle'), { count: 14 }), 1250);
        } else if (net < 0) sfx.lose();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // המארח מעביר אוטומטית לסיבוב הבא
  useEffect(() => {
    if (!me || s.phase !== 'results') return;
    const t = setTimeout(() => act({ type: 'next' }).catch(() => {}), isHost ? 7000 : 10000 + Math.random() * 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, !!me, s.phase, s.round]);

  const min = s.settings.minBet;
  const maxBet = Math.min(s.settings.maxBet, Math.floor(me?.chips ?? 0));
  const readyCount = s.players.filter((p) => p.id !== s.bankerId && !p.isBot && p.ready).length;
  const humanBettors = s.players.filter((p) => p.id !== s.bankerId && !p.isBot).length;
  const curHand = me && s.turn && myTurn ? me.hands[s.turn.h] : null;

  // סידור המושבים: מי שאחריי בתור הולך שמאלה, מי שלפניי - ימינה (כמו בשולחן אמיתי)
  const myIdx = s.players.findIndex((p) => p.id === myId);
  const circle = myIdx >= 0 ? s.players.slice(myIdx + 1).concat(s.players.slice(0, myIdx)) : s.players;
  const leftN = Math.ceil(circle.length / 2);
  const dense = circle.length > 6;
  const spotsFor = dense ? arcSpots : columnSpots;
  const leftSpots = spotsFor(leftN, -1);
  const rightSpots = spotsFor(circle.length - leftN, 1);
  const seats = circle.map((p, i) =>
    i < leftN
      ? { p, pos: leftSpots[i], side: 'l' as const }
      : { p, pos: rightSpots[circle.length - 1 - i], side: 'r' as const },
  );

  const inRound = s.players.filter((p) => p.hands.length > 0);
  const dealtBefore = inRound.length;
  const myDealIdx = Math.max(0, inRound.findIndex((p) => p.id === myId));
  const dealerUp = s.dealer.cards;
  const dealerTotal = !s.dealer.hidden && dealerUp.length ? handValue(dealerUp).total : null;
  const myHands = me?.hands ?? [];
  const mySize: Size = myHands.length > 2 ? 'sm' : myHands.length > 1 ? 'md' : 'lg';
  const spotAmount =
    s.phase === 'betting' ? (me?.ready && bet === me.bet ? me.bet : bet) : myHands.reduce((a, h) => a + h.bet, 0);
  const tray = trayValues(min, Math.max(min, s.settings.maxBet));

  return (
    <div className="pk bk">
      <div className="pk-stage bk-stage">
        <div className="bk-table">
          <div className="bk-felt">
            <svg className="bk-print" viewBox="0 0 300 70" aria-hidden="true">
              <path id="bk-arc" d="M 22 18 Q 150 78 278 18" fill="none" />
              <text className="bk-print-main">
                <textPath href="#bk-arc" startOffset="50%" textAnchor="middle">
                  BLACKJACK PAYS 3 TO 2
                </textPath>
              </text>
              <text x="150" y="66" textAnchor="middle" className="bk-print-sub">
                DEALER MUST STAND ON 17
              </text>
            </svg>
          </div>
        </div>
        <div className="bk-rack" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className={`bk-tube t${i % 4}`} />
          ))}
        </div>

        {/* הדילר */}
        <div className="bk-dealer">
          <div className="bk-dealer-id">
            {banker && <Avatar name={banker.name} emoji={banker.avatar} bot={banker.isBot} size={26} />}
            <span dir="auto">{banker ? `${tr('הבנק', 'Bank')}: ${displayName(banker, lang)}` : theme.labels.dealer}</span>
            {banker && <b>{fmt(banker.chips)}</b>}
          </div>
          <div className="bk-dealer-hand">
            {dealerUp.length > 0 ? (
              <div className="bk-cards">
                {dealerUp.map((c, i) => (
                  <Card key={i + c} card={c} size="md" deal={i !== 1} flip delay={i === 0 ? 380 + dealtBefore * 110 : i === 1 ? 0 : (i - 2) * 420} />
                ))}
                {s.dealer.hidden && <Card card={null} size="md" deal delay={380 + (dealtBefore * 2 + 1) * 110} />}
              </div>
            ) : (
              <div className="bk-cards">
                <span className="pk-slot" />
                <span className="pk-slot" />
              </div>
            )}
            {dealerTotal != null && <span className={`bk-total ${dealerTotal > 21 ? 'bust' : ''}`}>{dealerTotal}</span>}
          </div>
        </div>

        {/* שאר השחקנים */}
        {seats.map(({ p, pos, side }) => (
          <Seat
            key={p.id}
            p={p}
            s={s}
            pos={pos}
            side={side}
            dense={dense}
            isTurn={turnPlayer?.id === p.id}
            total={total}
            lang={lang}
            onTap={() => onSeatTap(p.id)}
            isKing={kingId === p.id}
            dealIdx={Math.max(0, inRound.findIndex((x) => x.id === p.id))}
            nDealt={dealtBefore}
          />
        ))}

        {/* תוצאת הסיבוב שלי */}
        {s.phase === 'results' && myHands.length > 0 && (
          <div className={`bk-net ${myNet > 0 ? 'pos' : myNet < 0 ? 'neg' : 'even'}`} key={s.round}>
            <b>
              {myNet > 0 ? '+' : myNet < 0 ? '−' : ''}
              {fmt(Math.abs(myNet))}
            </b>
            {resultQuip && <span>{resultQuip}</span>}
          </div>
        )}

        {/* אני */}
        {me && (
          <div className={`bk-me ${myTurn ? 'turn' : ''}`} data-pid={myId}>
            {myHands.length > 0 && (
              <div className="bk-myhands">
                {myHands.map((h, i) => (
                  <HandView key={i} h={h} size={mySize} active={myTurn && s.turn?.h === i && myHands.length > 1} lang={lang} dealAt={[380 + myDealIdx * 110, 380 + (dealtBefore + 1 + myDealIdx) * 110]} />
                ))}
              </div>
            )}
            {!amBanker && (
              <div className={`bk-circle ${spotAmount > 0 ? 'has' : ''} ${s.phase === 'betting' && !me.ready ? 'pending' : ''}`}>
                {spotAmount > 0 ? (
                  <>
                    <ChipStack amount={spotAmount} unit={min} size={22} label={false} />
                    <b>{fmt(spotAmount)}</b>
                  </>
                ) : (
                  <span>{tr('הימור', 'Bet')}</span>
                )}
              </div>
            )}
            <div className="bk-meplate">
              <span className="pk-av">
                {myTurn && s.turnDeadline && <TurnRing deadline={s.turnDeadline} total={total} />}
                <Avatar name={me.name} emoji={me.avatar} size={34} />
                {kingId === myId && (
                  <span className="kj-crown" title={tr('מלך הערב', 'King of the night')}>
                    <Crown size={13} strokeWidth={2.4} />
                  </span>
                )}
              </span>
              <span className="bk-meplate-txt">
                <span>{amBanker ? tr('אתם הבנק', "You're the bank") : tr('אני', 'Me')}</span>
                <b>{fmt(myChips)}</b>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* אזור הפעולה */}
      <div className="pk-actions">
        {s.phase === 'betting' && me && !amBanker && (
          <>
            {(me.strikes ?? 0) >= MAX_STRIKES && (
              <div className="pk-note warn">{tr('פספסת כמה תורות - שימו הימור כדי לחזור למשחק', 'You missed some turns - place a bet to get back in')}</div>
            )}
            {me.chips < min ? (
              <button className="pk-btn gold block" onClick={onRebuy}>
                {tr('קנייה חוזרת', 'Rebuy')} <small>{fmt(s.settings.buyIn)}</small>
              </button>
            ) : (
              <>
                <div className="bk-tray" role="group" aria-label={tr('ז׳טונים', 'Chips')}>
                  {tray.map((v, i) => (
                    <button
                      key={v}
                      className={`bk-chip c${i}`}
                      onClick={(e) => {
                        setBet((b) => Math.min(maxBet, b + v));
                        sfx.chips(1);
                        flyChips(e.currentTarget, document.querySelector('.bk-me .bk-circle'), { clone: e.currentTarget, ms: 380 });
                      }}
                      disabled={bet + v > maxBet}
                      aria-label={`+${fmt(v)}`}
                    >
                      <span>{short(v)}</span>
                    </button>
                  ))}
                </div>
                <div className="pk-btnrow bk-betrow">
                  <button className="pk-btn ghost sq" onClick={() => setBet(0)} aria-label={tr('ניקוי', 'Clear')}>
                    <RotateCcw size={20} />
                  </button>
                  <button className="pk-btn ghost sq" onClick={() => setBet((b) => Math.min(maxBet, Math.max(min, b * 2)))}>
                    ×2
                  </button>
                  {me.ready && bet === me.bet ? (
                    <button className="pk-btn call" disabled>
                      <span className="bk-placed">
                        <Check size={18} /> {tr('ההימור נקלט', 'Bet placed')}
                      </span>
                    </button>
                  ) : (
                    <AsyncButton className="pk-btn gold" onClick={() => {
                      // הז׳טונים שלי נשמעים מיד בלחיצה
                      sfx.bet(bet, min);
                      return act({ type: 'bet', amount: bet });
                    }} disabled={bet < min || bet > maxBet}>
                      {bet < min ? (
                        tr(`מינימום ${fmt(min)}`, `Minimum ${fmt(min)}`)
                      ) : (
                        <>
                          <span>{me.ready ? tr('עדכון הימור', 'Update bet') : tr('הימור', 'Bet')}</span>
                          <small>{fmt(bet)}</small>
                        </>
                      )}
                    </AsyncButton>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {s.phase === 'betting' && amBanker && <div className="pk-note">{tr('אתם הבנק - כל ההימורים מולכם', "You're the bank - every bet is against you")}</div>}
        {s.phase === 'betting' && (me?.ready || amBanker || !me) && (
          <div className="pk-note">
            {tr('מוכנים', 'Ready')} {readyCount}/{humanBettors}
          </div>
        )}
        {s.phase === 'betting' && s.betDeadline && (
          <div className="pk-waitrow">
            <span>{tr('מחלקים בעוד', 'Dealing in')}</span>
            <TurnBar deadline={s.betDeadline} total={betWindowMs(s)} roomId={roomId} expireMove="deal" />
          </div>
        )}
        {s.phase === 'betting' && isHost && (
          <AsyncButton className="pk-btn ghost block" onClick={() => act({ type: 'deal' })}>
            {tr('לחלק עכשיו', 'Deal now')}
          </AsyncButton>
        )}

        {s.phase === 'playing' && !myTurn && turnPlayer && (
          <div className="pk-waitrow">
            <span>
              {tr('תור של', 'Waiting for')} <b dir="auto">{displayName(turnPlayer, lang)}</b>
            </span>
            <TurnBar deadline={s.turnDeadline} total={total} roomId={roomId} />
          </div>
        )}
        {myTurn && me && curHand && (
          <>
            <TurnBar deadline={s.turnDeadline} total={total} roomId={roomId} mine />
            <div className="pk-hintrow">
              {tipsOn && s.dealer.cards[0] ? (
                <BlackjackTip
                  cards={curHand.cards}
                  dealerUp={s.dealer.cards[0]}
                  canDouble={canDouble(me, curHand)}
                  canSplit={canSplit(me, curHand)}
                  theme={theme}
                  compact
                />
              ) : (
                <span />
              )}
              <Coach roomId={roomId} premium={premium} contextKey={`${s.round}-${s.turn?.h}-${curHand.cards.length}`} compact />
            </div>
            <ActionButtons me={me} hand={curHand} theme={theme} act={act} />
          </>
        )}

        {s.phase === 'results' && me && (
          <AsyncButton className="pk-btn gold block" onClick={() => act({ type: 'next' })}>
            {tr('סיבוב הבא', 'Next round')}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}

function ActionButtons({ me, hand, theme, act }: { me: BJPlayer; hand: BJHand; theme: Theme; act: Act }) {
  const dbl = canDouble(me, hand);
  const spl = canSplit(me, hand);
  const cols = 2 + (dbl ? 1 : 0) + (spl ? 1 : 0);
  return (
    <div className="pk-btnrow" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      <AsyncButton className="pk-btn call" onClick={() => act({ type: 'hit' })}>
        {theme.labels.hit}
      </AsyncButton>
      <AsyncButton className="pk-btn fold" onClick={() => act({ type: 'stand' })}>
        {theme.labels.stand}
      </AsyncButton>
      {dbl && (
        <AsyncButton className="pk-btn gold" onClick={() => act({ type: 'double' })}>
          <span>{theme.labels.double}</span>
          <small>{signed(hand.bet)}</small>
        </AsyncButton>
      )}
      {spl && (
        <AsyncButton className="pk-btn ghost" onClick={() => act({ type: 'split' })}>
          <span>{theme.labels.split}</span>
          <small>{signed(hand.bet)}</small>
        </AsyncButton>
      )}
    </div>
  );
}

// יד אחת: קלפים, סכום ותוצאה
function HandView({ h, size, active, lang, dealAt = [0, 110] }: { h: BJHand; size: Size; active: boolean; lang: Lang; dealAt?: number[] }) {
  const v = handValue(h.cards);
  const natural = isNatural(h);
  return (
    <div className={`bk-hand ${active ? 'active' : ''} ${h.result ? 'r-' + h.result : ''}`}>
      <div className={`bk-cards ${size}`}>
        {h.cards.map((c, i) => (
          <Card key={i + c} card={c} size={size} deal flip delay={i < 2 ? dealAt[i] : 0} />
        ))}
      </div>
      <div className="bk-hmeta">
        <span className={`bk-total ${v.total > 21 ? 'bust' : natural ? 'bj' : ''}`}>{natural ? '21' : handTotal(h.cards)}</span>
        {h.result && <span className={`bk-res ${h.result}`}>{resultLabel(h.result, lang)}</span>}
      </div>
    </div>
  );
}

// מושב של שחקן אחר על הקשת
function Seat({
  p,
  s,
  pos,
  side,
  dense,
  isTurn,
  total,
  lang,
  onTap,
  isKing,
  dealIdx,
  nDealt,
}: {
  p: BJPlayer;
  s: BJState;
  pos: { x: number; y: number };
  side: 'l' | 'r';
  dense: boolean;
  isTurn: boolean;
  total: number;
  lang: Lang;
  onTap: () => void;
  isKing: boolean;
  dealIdx: number;
  nDealt: number;
}) {
  const isBanker = s.bankerId === p.id;
  const chips = useTween(p.chips);
  const out = p.leaving || (s.phase !== 'betting' && !p.hands.length && !isBanker);
  return (
    <div
      className={`bk-seat ${side} ${dense ? 'dense' : 'col'} ${isTurn ? 'turn' : ''} ${out ? 'out' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      data-pid={p.id}
      onClick={onTap}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onTap()}
      role="button"
      tabIndex={0}
      aria-label={displayName(p, lang)}
    >
      <span className="bk-who">
        <span className="pk-av">
          {isTurn && s.turnDeadline && <TurnRing deadline={s.turnDeadline} total={total} />}
          <Avatar name={p.name} emoji={p.avatar} bot={p.isBot} size={dense ? 32 : 38} />
          {isKing && (
            <span className="kj-crown" title={lang === 'he' ? 'מלך הערב' : 'King of the night'}>
              <Crown size={12} strokeWidth={2.4} />
            </span>
          )}
        </span>
        <span className="pk-plate">
          <span className="pk-name" dir="auto">
            {displayName(p, lang)}
          </span>
          <span className="pk-stack">{isBanker ? (lang === 'he' ? 'בנק' : 'Bank') : fmt(chips)}</span>
        </span>
      </span>
      <span className="bk-spot">
        {p.hands.length > 0
          ? p.hands.map((h, i) => (
              <span key={i} className={`bk-mini ${h.result ? 'r-' + h.result : ''}`}>
                <span className="bk-cards sm">
                  {h.cards.map((c, k) => (
                    <Card key={k + c} card={c} size={dense ? 'xs' : 'sm'} deal flip delay={k < 2 ? 380 + (k * (nDealt + 1) + dealIdx) * 110 : 0} />
                  ))}
                </span>
                <span className="bk-hmeta">
                  <span className={`bk-total ${handValue(h.cards).total > 21 ? 'bust' : ''}`}>{handTotal(h.cards)}</span>
                  {h.result ? (
                    <span className={`bk-res ${h.result}`}>{resultLabel(h.result, lang)}</span>
                  ) : (
                    <ChipStack amount={h.bet} unit={s.settings.minBet} size={12} />
                  )}
                </span>
              </span>
            ))
          : s.phase === 'betting' && !isBanker
            ? p.ready
              ? <ChipStack amount={p.bet} unit={s.settings.minBet} size={14} />
              : !p.isBot && <span className="bk-wait">{lang === 'he' ? 'בוחר הימור' : 'Choosing'}</span>
            : null}
      </span>
    </div>
  );
}
