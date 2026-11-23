// היסטוריית ידיים: מי ניצח, באיזו יד, מה היה לאחרים, אילו קופות וכל המהלכים
import { useEffect, useState } from 'react';
import { ChevronDown, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useI18n, type Lang } from '../lib/i18n';
import { actionLabel, displayName, handName } from '../lib/display';
import { fmt } from '../lib/balances';
import { Hand } from './Card';
import type { HoldemHandRecord } from '../engine/holdem';
import type { BlackjackHandRecord } from '../engine/blackjack';

type Rec = HoldemHandRecord | BlackjackHandRecord;
interface Row {
  hand_no: number;
  created_at: string;
  data: Rec;
}

export function HandHistory({ roomId, refreshKey, myId }: { roomId: string; refreshKey?: number | string; myId: string }) {
  const { tr } = useI18n();
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase
      .from('game_hands')
      .select('hand_no, created_at, data')
      .eq('room_id', roomId)
      .order('hand_no', { ascending: false })
      .limit(80)
      .then(({ data }) => setRows((data ?? []) as Row[]));
  }, [roomId, refreshKey]);

  if (!rows) return <div className="center pad"><span className="spinner" /></div>;
  if (!rows.length) return <div className="empty">{tr('עוד לא שוחקו ידיים בשולחן הזה', 'No hands played at this table yet')}</div>;
  return (
    <div className="hand-history">
      {rows.map((r) =>
        r.data.kind === 'holdem' ? (
          <HoldemCard key={r.hand_no} rec={r.data} at={r.created_at} myId={myId} />
        ) : (
          <BlackjackCard key={r.hand_no} rec={r.data} at={r.created_at} myId={myId} />
        ),
      )}
    </div>
  );
}

const timeFmt = (iso: string, lang: Lang) => new Date(iso).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
const streetName = (st: string, lang: Lang) =>
  (lang === 'he'
    ? { preflop: 'לפני הפלופ', flop: 'פלופ', turn: 'טרן', river: 'ריבר' }
    : { preflop: 'Pre-flop', flop: 'Flop', turn: 'Turn', river: 'River' })[st as 'flop'] ?? st;

function HoldemCard({ rec, at, myId }: { rec: HoldemHandRecord; at: string; myId: string }) {
  const { tr, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const byId = new Map(rec.players.map((p) => [p.id, p]));
  const name = (id: string) => {
    const p = byId.get(id);
    return p ? displayName(p, lang) : '?';
  };
  const winners = rec.winners;
  const iWon = winners.some((w) => w.id === myId);
  // ההסבר "למה": מי ניצח ועם מה, מול מה היה לאחרים
  const why =
    rec.reason === 'fold'
      ? tr(`${name(winners[0]?.id)} לקח/ה את הקופה - כל השאר קיפלו`, `${name(winners[0]?.id)} took the pot - everyone else folded`)
      : winners
          .map((w) => tr(`${name(w.id)} ניצח/ה עם ${handName(w.cat, lang)}`, `${name(w.id)} won with ${handName(w.cat, lang)}`))
          .join(' · ');
  const losers = rec.players.filter((p) => p.shown && !winners.some((w) => w.id === p.id));
  // מהלכים לפי שלבים
  const streets: Record<string, typeof rec.log> = {};
  for (const e of rec.log) (streets[e.st] ??= []).push(e);

  return (
    <div className={`hh-card ${iWon ? 'won' : ''}`}>
      <button className="hh-head" onClick={() => setOpen(!open)}>
        <span className="hh-no">#{rec.no}</span>
        <div className="grow">
          <div className="hh-win">
            <Trophy size={15} /> {winners.map((w) => `${byId.get(w.id)?.avatar ?? ''} ${name(w.id)} +${fmt(w.amount)}`).join(' · ')}
          </div>
          <div className="sub">
            {timeFmt(at, lang)} · {tr('קופה', 'Pot')} {fmt(rec.pot)} · {tr('בליינדים', 'Blinds')} {rec.blinds[0]}/{rec.blinds[1]}
          </div>
        </div>
        <ChevronDown size={18} className={`chev-i ${open ? 'up' : ''}`} />
      </button>

      {rec.board.length > 0 && (
        <div className="hh-board">
          <Hand cards={rec.board} size="sm" />
        </div>
      )}
      <div className="hh-why">{why}</div>

      {rec.reason === 'showdown' && (
        <div className="hh-shown">
          {[...rec.players.filter((p) => winners.some((w) => w.id === p.id)), ...losers].map((p) => (
            <div key={p.id} className={`hh-player ${winners.some((w) => w.id === p.id) ? 'winner' : ''}`}>
              <span className="avatar">{p.avatar}</span>
              <span className="grow" dir="auto">
                {displayName(p, lang)}
                <span className="sub"> · {handName(p.cat, lang)}</span>
              </span>
              {p.shown && <Hand cards={p.shown} size="sm" />}
              <b className={p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}>
                {p.net > 0 ? '+' : ''}
                {fmt(p.net)}
              </b>
            </div>
          ))}
        </div>
      )}
      {rec.reason === 'fold' && rec.players.some((p) => p.shown) && (
        <div className="hh-shown">
          {rec.players
            .filter((p) => p.shown)
            .map((p) => (
              <div key={p.id} className="hh-player">
                <span className="avatar">{p.avatar}</span>
                <span className="grow">{tr(`${displayName(p, lang)} הראה/תה 👀`, `${displayName(p, lang)} showed 👀`)}</span>
                <Hand cards={p.shown!} size="sm" />
              </div>
            ))}
        </div>
      )}

      {rec.pots.length > 1 && (
        <div className="hh-pots">
          {rec.pots.map((pot, i) => (
            <span key={i} className="pot-tag">
              {i === 0 ? tr('ראשית', 'Main') : tr(`צדדית ${i}`, `Side ${i}`)} {fmt(pot.amount)} → {pot.winners.map(name).join(', ')}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="hh-log">
          {Object.entries(streets).map(([st, list]) => (
            <div key={st} className="hh-street">
              <b>{streetName(st, lang)}</b>
              <span>{list.map((e) => `${name(e.id)}: ${actionLabel(e.a, lang)}`).join(' · ')}</span>
            </div>
          ))}
          {rec.players.some((p) => p.net !== 0) && (
            <div className="hh-street">
              <b>{tr('תוצאה', 'Result')}</b>
              <span>
                {rec.players
                  .filter((p) => p.net !== 0)
                  .map((p) => `${name(p.id)} ${p.net > 0 ? '+' : ''}${fmt(p.net)}`)
                  .join(' · ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BlackjackCard({ rec, at, myId }: { rec: BlackjackHandRecord; at: string; myId: string }) {
  const { tr, lang } = useI18n();
  const resultHe: Record<string, string> = { blackjack: 'בלאק ג׳ק!', win: 'ניצחון', push: 'תיקו', lose: 'הפסד', bust: 'נשרף' };
  const resultEn: Record<string, string> = { blackjack: 'Blackjack!', win: 'Win', push: 'Push', lose: 'Lose', bust: 'Bust' };
  const mine = rec.players.find((p) => p.id === myId);
  return (
    <div className={`hh-card ${mine && mine.net > 0 ? 'won' : ''}`}>
      <div className="hh-head static">
        <span className="hh-no">#{rec.no}</span>
        <div className="grow">
          <div className="hh-win">
            🎩 {tr('דילר', 'Dealer')}: {rec.dealerTotal > 21 ? tr(`נשרף (${rec.dealerTotal}) 💥`, `bust (${rec.dealerTotal}) 💥`) : rec.dealerTotal}
          </div>
          <div className="sub">{timeFmt(at, lang)}</div>
        </div>
        <Hand cards={rec.dealer} size="sm" />
      </div>
      <div className="hh-shown">
        {rec.players.map((p) => (
          <div key={p.id} className={`hh-player ${p.net > 0 ? 'winner' : ''}`}>
            <span className="avatar">{p.avatar}</span>
            <span className="grow" dir="auto">
              {displayName(p, lang)}
              <span className="sub"> · {p.hands.map((h) => (lang === 'he' ? resultHe : resultEn)[h.result ?? ''] ?? '').join(' / ')}</span>
            </span>
            {p.hands.map((h, i) => (
              <Hand key={i} cards={h.cards} size="sm" />
            ))}
            <b className={p.net > 0 ? 'pos' : p.net < 0 ? 'neg' : ''}>
              {p.net > 0 ? '+' : ''}
              {fmt(p.net)}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}
