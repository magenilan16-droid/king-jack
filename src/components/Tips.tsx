// טיפים חכמים בזמן משחק
import { useEffect, useState } from 'react';
import type { Card } from '../engine/cards';
import { basicStrategy, strategyExplain, MOVE_HE, MOVE_EN } from '../engine/strategy';
import { equityAsync } from '../lib/equityAsync';
import { bestHand } from '../engine/handEval';
import type { Theme } from '../lib/themes';
import { useI18n } from '../lib/i18n';
import { handName } from '../lib/display';

export function BlackjackTip({
  cards,
  dealerUp,
  canDouble,
  canSplit,
  theme,
}: {
  cards: Card[];
  dealerUp: Card;
  canDouble: boolean;
  canSplit: boolean;
  theme: Theme;
}) {
  const { tr, lang } = useI18n();
  const mv = basicStrategy(cards, dealerUp, canDouble, canSplit);
  const moveTxt = lang === 'he' ? MOVE_HE[mv] : MOVE_EN[mv];
  return (
    <div className="tip">
      <span className="tip-icon">💡</span>
      <div>
        <b>
          {tr('כדאי ', 'Best move: ')}
          {moveTxt}
          {theme.id !== 'classic' ? ` (${theme.labels[mv]})` : ''}
        </b>
        <div className="tip-sub">{strategyExplain(cards, dealerUp, mv, lang)}</div>
      </div>
    </div>
  );
}

export function HoldemTip({
  hole,
  board,
  opponents,
  toCall,
  pot,
}: {
  hole: Card[];
  board: Card[];
  opponents: number;
  toCall: number;
  pot: number;
}) {
  const { tr, lang } = useI18n();
  const [eq, setEq] = useState<number | null>(null);
  const key = hole.join('') + board.join('') + opponents;
  useEffect(() => {
    setEq(null);
    if (hole.length !== 2) return;
    // חישוב בעובד רקע כדי לא לתקוע את המסך
    let alive = true;
    equityAsync(hole, board, Math.max(1, opponents), 2000).then((v) => alive && setEq(v));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (hole.length !== 2) return null;
  const made =
    board.length >= 3 ? handName(bestHand(hole.concat(board)).cat, lang) : hole[0][0] === hole[1][0] ? tr('זוג ביד', 'Pocket pair') : null;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  let advice = '';
  let tone: 'good' | 'mid' | 'bad' = 'mid';
  if (eq != null) {
    const strong = Math.min(0.8, 1.5 / (opponents + 1));
    if (toCall === 0) {
      if (eq > strong) {
        advice = tr('יד חזקה - שווה להמר/להעלות 💪', 'Strong hand - worth betting 💪');
        tone = 'good';
      } else if (board.length === 5) {
        advice = tr('יד חלשה - צ׳ק ומקווים לטוב 🤞', 'Weak hand - just check 🤞');
      } else {
        advice = tr('אפשר לעשות צ׳ק ולראות קלף בחינם', 'You can check and see a free card');
      }
    } else if (eq > Math.max(strong, potOdds + 0.15)) {
      advice = tr('יד חזקה - שקלו העלאה 💪', 'Strong hand - consider raising 💪');
      tone = 'good';
    } else if (eq >= potOdds) {
      advice = tr('הסיכוי שווה את המחיר - קול סביר ✅', 'The odds justify the price - calling is fine ✅');
      tone = 'good';
    } else if (eq >= potOdds - 0.05) {
      advice = tr('גבולי... תלוי כמה אתם מרגישים בלוף 🤔', 'Borderline... depends if you smell a bluff 🤔');
    } else {
      advice = tr('הסיכוי נמוך מהמחיר - עדיף לוותר ❌', 'Odds are below the price - better to fold ❌');
      tone = 'bad';
    }
  }
  return (
    <div className={`tip ${tone}`}>
      <span className="tip-icon">💡</span>
      <div className="grow">
        <div className="tip-stats">
          {made && (
            <span>
              {tr('יש לך:', 'You have:')} <b>{made}</b>
            </span>
          )}
          <span>
            {tr('סיכוי לנצח:', 'Win chance:')} <b>{eq == null ? '...' : Math.round(eq * 100) + '%'}</b>
          </span>
          {toCall > 0 && (
            <span>
              {tr('צריך לפחות:', 'Need at least:')} <b>{Math.round(potOdds * 100)}%</b>
            </span>
          )}
        </div>
        {advice && <div className="tip-sub">{advice}</div>}
      </div>
    </div>
  );
}
