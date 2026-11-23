import { useEffect, useRef, useState } from 'react';
import { type BJState, type BJPlayer, type BJHand, handValue, canDouble, canSplit } from '../engine/blackjack';
import { Hand } from '../components/Card';
import { Timer } from '../components/Timer';
import { BlackjackTip } from '../components/Tips';
import { Coach } from '../components/Coach';
import { AsyncButton } from '../components/ui';
import type { Theme } from '../lib/themes';
import { pick } from '../lib/themes';
import { fmt } from '../lib/balances';
import { useI18n, type Lang } from '../lib/i18n';
import { displayName } from '../lib/display';
import { sfx } from '../lib/sound';
import { vibrate } from '../lib/prefs';
import { MAX_STRIKES } from '../engine/common';

type Act = (move: Record<string, unknown>) => Promise<void>;

function resultLabel(r: string, lang: Lang): string {
  const he: Record<string, string> = { blackjack: 'בלאק ג׳ק! 🎉', win: 'ניצחון ✅', push: 'תיקו 🤝', lose: 'הפסד', bust: 'נשרף 💥' };
  const en: Record<string, string> = { blackjack: 'Blackjack! 🎉', win: 'Win ✅', push: 'Push 🤝', lose: 'Lose', bust: 'Bust 💥' };
  return (lang === 'he' ? he : en)[r] ?? r;
}

function handTotal(h: BJHand) {
  const v = handValue(h.cards);
  return v.soft && v.total < 21 ? `${v.total - 10}/${v.total}` : String(v.total);
}

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
}) {
  const { tr, lang } = useI18n();
  const me = s.players.find((p) => p.id === myId);
  const isHost = s.hostId === myId;
  const banker = s.players.find((p) => p.id === s.bankerId);
  const amBanker = s.bankerId === myId;
  const turnPlayer = s.turn ? s.players[s.turn.p] : null;
  const myTurn = s.phase === 'playing' && turnPlayer?.id === myId;
  const others = s.players.filter((p) => p.id !== myId);
  const dealerTotal = !s.dealer.hidden && s.dealer.cards.length ? handValue(s.dealer.cards).total : null;
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
  }, [s.phase, s.round]);

  // צלילים לפי מה שהשתנה בשולחן
  const prev = useRef<BJState | null>(null);
  useEffect(() => {
    const p = prev.current;
    prev.current = s;
    if (!p) return;
    const count = (x: BJState) => x.dealer.cards.length + x.players.reduce((a, pl) => a + pl.hands.reduce((b, h) => b + h.cards.length, 0), 0);
    if (count(s) > count(p)) sfx.card();
    const readyNow = s.players.filter((x) => x.ready).length;
    if (s.phase === 'betting' && readyNow > p.players.filter((x) => x.ready).length) sfx.chips();
    if (s.phase === 'results' && p.phase !== 'results') {
      const mine = s.players.find((x) => x.id === myId);
      if (mine?.hands.length) {
        const net = mine.hands.reduce((a, h) => a + (h.payout ?? 0) - h.bet, 0);
        if (net > 0) {
          sfx.win();
          vibrate([60, 40, 60, 40, 160]);
        } else if (net < 0) sfx.lose();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // המארח מעביר אוטומטית לסיבוב הבא
  useEffect(() => {
    if (!isHost || s.phase !== 'results') return;
    const t = setTimeout(() => act({ type: 'next' }).catch(() => {}), 7000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, s.phase, s.round]);

  const min = s.settings.minBet;
  const maxBet = Math.min(s.settings.maxBet, Math.floor(me?.chips ?? 0));
  const readyCount = s.players.filter((p) => p.id !== s.bankerId && !p.isBot && p.ready).length;
  const humanBettors = s.players.filter((p) => p.id !== s.bankerId && !p.isBot).length;
  const curHand = me && s.turn && myTurn ? me.hands[s.turn.h] : null;

  return (
    <div className="bj">
      <div className="dealer-area">
        <svg className="felt-print" viewBox="0 0 320 64" aria-hidden="true">
          <path id="arc" d="M 30 58 Q 160 0 290 58" fill="none" />
          <text>
            <textPath href="#arc" startOffset="50%" textAnchor="middle">
              BLACKJACK PAYS 3 TO 2
            </textPath>
          </text>
          <text x="160" y="62" textAnchor="middle" className="sub-print">
            DEALER STANDS ON 17
          </text>
        </svg>
        <div className="dealer-label">
          {banker
            ? `🏦 ${tr('הבנק', 'Bank')}: ${banker.avatar} ${banker.name} (${fmt(banker.chips)})`
            : `🎩 ${theme.labels.dealer}`}
        </div>
        {s.dealer.cards.length > 0 ? (
          <Hand cards={s.dealer.cards} hiddenCount={s.dealer.hidden ? 1 : 0} size="md" />
        ) : (
          <div className="dealer-empty">{s.phase === 'betting' ? tr('מחכים להימורים...', 'Waiting for bets...') : ''}</div>
        )}
        {dealerTotal != null && (
          <div className={`total-badge ${dealerTotal > 21 ? 'bust' : ''}`}>{dealerTotal > 21 ? `${dealerTotal} 💥` : dealerTotal}</div>
        )}
      </div>

      <div className="seats">
        {others.map((p) => (
          <Seat key={p.id} p={p} s={s} isTurn={turnPlayer?.id === p.id} lang={lang} onTap={() => onSeatTap(p.id)} />
        ))}
      </div>

      {me && (
        <div data-pid={myId} className={`me-area ${myTurn ? 'my-turn' : ''}`}>
          {me.hands.length > 0 ? (
            <div className="my-hands">
              {me.hands.map((h, i) => (
                <div key={i} className={`my-hand ${myTurn && s.turn?.h === i ? 'active' : ''}`}>
                  <Hand cards={h.cards} size="lg" stagger />
                  <div className="hand-meta">
                    <span className="total-badge">{handTotal(h)}</span>
                    <span className="bet-badge">🪙 {fmt(h.bet)}</span>
                    {h.result && <span className={`result ${h.result}`}>{resultLabel(h.result, lang)}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="me-idle">
              {amBanker
                ? tr('🏦 אתה הבנק - כל ההימורים מולך', '🏦 You are the bank - all bets are against you')
                : s.phase === 'betting'
                  ? me.ready
                    ? tr(`✔ הימרת ${fmt(me.bet)}`, `✔ You bet ${fmt(me.bet)}`)
                    : tr('שימו הימור לסיבוב', 'Place your bet')
                  : tr('מחכה לסיבוב הבא', 'Waiting for the next round')}
            </div>
          )}
          <div className="my-chips">
            {me.avatar} {me.name} · <b>{fmt(me.chips)}</b> {theme.labels.chips}
          </div>
          {s.phase === 'results' && me.hands.length > 0 && (
            <div className={`round-result ${myNet > 0 ? 'pos' : myNet < 0 ? 'neg' : ''}`}>
              {myNet > 0 ? '+' : ''}
              {fmt(myNet)} {resultQuip && `· ${resultQuip}`}
            </div>
          )}
        </div>
      )}

      {tipsOn && me && curHand && (
        <BlackjackTip
          cards={curHand.cards}
          dealerUp={s.dealer.cards[0]}
          canDouble={canDouble(me, curHand)}
          canSplit={canSplit(me, curHand)}
          theme={theme}
        />
      )}

      <div className="action-bar">
        {s.phase === 'betting' && me && !amBanker && (
          <>
            {(me.strikes ?? 0) >= MAX_STRIKES && (
              <div className="strike-warn">{tr('⚠️ פספסת כמה תורות - שימו הימור כדי לחזור למשחק', '⚠️ You missed some turns - place a bet to get back in')}</div>
            )}
            {me.chips < min ? (
              <button className="btn primary block" onClick={onRebuy}>
                {tr(`נגמרו ה${theme.labels.chips} - קנייה נוספת 💰`, `Out of ${theme.labels.chips} - buy more 💰`)}
              </button>
            ) : (
              <>
                <div className="bet-chips">
                  {[min, min * 5, min * 10].map((v) => (
                    <button key={v} className="chip" onClick={() => setBet((b) => Math.min(maxBet, b + v))}>
                      +{fmt(v)}
                    </button>
                  ))}
                  <button className="chip ghost" onClick={() => setBet(Math.min(maxBet, bet * 2))}>
                    x2
                  </button>
                  <button className="chip ghost" onClick={() => setBet(min)}>
                    ↺
                  </button>
                </div>
                <AsyncButton
                  className="btn primary block big"
                  onClick={() => act({ type: 'bet', amount: bet })}
                  disabled={bet < min || bet > maxBet}
                >
                  {me.ready ? tr(`עדכון הימור ל-${fmt(bet)}`, `Change bet to ${fmt(bet)}`) : tr(`הימור ${fmt(bet)} 🪙`, `Bet ${fmt(bet)} 🪙`)}
                </AsyncButton>
              </>
            )}
          </>
        )}
        {s.phase === 'betting' && isHost && (
          <AsyncButton className="btn ghost block" onClick={() => act({ type: 'deal' })}>
            {tr(`▶ חלק עכשיו (${readyCount}/${humanBettors} מוכנים)`, `▶ Deal now (${readyCount}/${humanBettors} ready)`)}
          </AsyncButton>
        )}
        {s.phase === 'betting' && !isHost && (me?.ready || amBanker) && (
          <div className="waiting">{tr(`מחכים לשאר השחקנים... (${readyCount}/${humanBettors})`, `Waiting for others... (${readyCount}/${humanBettors})`)}</div>
        )}

        {s.phase === 'playing' &&
          (myTurn && me && curHand ? (
            <>
              <Coach roomId={roomId} premium={premium} contextKey={`${s.round}-${s.turn?.h}-${curHand.cards.length}`} />
              <div className="turn-row">
                <span>{tr('התור שלך!', 'Your turn!')}</span>
                <Timer deadline={s.turnDeadline} roomId={roomId} mine />
              </div>
              <div className="btn-grid">
                <AsyncButton className="btn act hit" onClick={() => act({ type: 'hit' })}>
                  {theme.labels.hit}
                </AsyncButton>
                <AsyncButton className="btn act stand" onClick={() => act({ type: 'stand' })}>
                  {theme.labels.stand}
                </AsyncButton>
                {canDouble(me, curHand) && (
                  <AsyncButton className="btn act double" onClick={() => act({ type: 'double' })}>
                    {theme.labels.double}
                  </AsyncButton>
                )}
                {canSplit(me, curHand) && (
                  <AsyncButton className="btn act split" onClick={() => act({ type: 'split' })}>
                    {theme.labels.split}
                  </AsyncButton>
                )}
              </div>
            </>
          ) : (
            <div className="turn-row">
              <span>
                {tr('תור של', 'Turn:')} {turnPlayer?.avatar} {turnPlayer && displayName(turnPlayer, lang)}
              </span>
              <Timer deadline={s.turnDeadline} roomId={roomId} />
            </div>
          ))}

        {s.phase === 'results' && me && (
          <AsyncButton className="btn primary block" onClick={() => act({ type: 'next' })}>
            {tr('סיבוב הבא ▶', 'Next round ▶')}
          </AsyncButton>
        )}
      </div>
    </div>
  );
}

function Seat({ p, s, isTurn, lang, onTap }: { p: BJPlayer; s: BJState; isTurn: boolean; lang: Lang; onTap: () => void }) {
  const isBanker = s.bankerId === p.id;
  return (
    <div className={`seat ${isTurn ? 'turn' : ''} ${p.leaving ? 'dim' : ''}`} data-pid={p.id} onClick={onTap} role="button">
      <div className="seat-head">
        <span className="avatar">{p.avatar}</span>
        <span className="seat-name" dir="auto">{displayName(p, lang)}</span>
        {isBanker && <span className="tag">🏦</span>}
      </div>
      <div className="seat-chips">{fmt(p.chips)}</div>
      {p.hands.length > 0 ? (
        p.hands.map((h, i) => (
          <div key={i} className="seat-hand">
            <Hand cards={h.cards} size="sm" />
            <span className="mini-total">{handTotal(h)}</span>
            {h.result && <span className={`result mini ${h.result}`}>{resultLabel(h.result, lang)}</span>}
          </div>
        ))
      ) : s.phase === 'betting' && !isBanker ? (
        <div className="seat-status">{p.isBot ? '🤖' : p.ready ? `✔ ${fmt(p.bet)}` : lang === 'he' ? '⏳ בוחר/ת' : '⏳ choosing'}</div>
      ) : null}
    </div>
  );
}
