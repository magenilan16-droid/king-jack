// רגע גדול בשולחן: רביעייה, רצף צבע, 7-2 מנצח, קופת ענק - כל השולחן רואה חגיגה על כל המסך
import { useEffect } from 'react';
import { Card } from './Card';
import type { Card as C } from '../engine/cards';
import { ACH_INFO, type AchId } from '../lib/achievements';
import { useI18n } from '../lib/i18n';
import { fmt } from '../lib/balances';
import { sfx } from '../lib/sound';
import { vibrate } from '../lib/prefs';
import { chipBurst } from '../lib/motion';

export interface Moment {
  key: string;
  ach: AchId;
  name: string;
  mine: boolean;
  cards?: C[];
  amount?: number;
}

export function BigMoment({ m, onDone }: { m: Moment; onDone: () => void }) {
  const { lang, tr } = useI18n();
  const info = ACH_INFO[m.ach];
  useEffect(() => {
    sfx.chipStack();
    setTimeout(() => sfx.win(60), 250);
    if (m.mine) vibrate([60, 40, 60, 40, 220]);
    const burst = setTimeout(() => chipBurst(document.querySelector('.km-card'), { count: m.mine ? 22 : 14 }), 350);
    const t = setTimeout(onDone, m.cards ? 3600 : 3000);
    return () => {
      clearTimeout(t);
      clearTimeout(burst);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.key]);
  return (
    <div className={`kj-moment ${m.ach}`} role="status" onClick={onDone}>
      <div className="km-card">
        <span className="km-who" dir="auto">
          {m.mine ? tr('יש לך', 'You got') : m.name}
        </span>
        <h2 className="km-title">{lang === 'he' ? info.he : info.en}</h2>
        {m.cards && m.cards.length > 0 && (
          <div className="km-cards">
            {m.cards.map((c, i) => (
              <Card key={c} card={c} size="md" flip delay={250 + i * 120} />
            ))}
          </div>
        )}
        {m.amount ? (
          <b className="km-amt" dir="ltr">
            +{fmt(m.amount)}
          </b>
        ) : null}
        <span className="km-badge">{m.mine ? tr('נכנס לאוסף ההישגים שלך בפרופיל', 'Added to your achievements in Profile') : tr('הישג חדש בשולחן', 'New achievement at the table')}</span>
      </div>
    </div>
  );
}
