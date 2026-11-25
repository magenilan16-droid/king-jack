// אוסף ההישגים בפרופיל: מה כבר השגתי (וכמה פעמים), ומה עוד מחכה לי
import { useEffect, useState } from 'react';
import { Crown, Zap, Layers, Dice5, Coins, VenetianMask, Spade, type LucideIcon } from 'lucide-react';
import { ACH_INFO, ACH_ORDER, loadMyAchievements, type AchId } from '../lib/achievements';
import { useI18n, count } from '../lib/i18n';

const ICONS: Record<AchId, LucideIcon> = {
  royal: Crown,
  sflush: Zap,
  quads: Layers,
  seventwo: Dice5,
  monster: Coins,
  bluff: VenetianMask,
  blackjack: Spade,
};

export function Achievements({ userId }: { userId: string }) {
  const { tr, lang } = useI18n();
  const [data, setData] = useState<{ counts: Record<AchId, number>; wins: number } | null>(null);
  useEffect(() => {
    loadMyAchievements(userId)
      .then(setData)
      .catch(() => setData(null));
  }, [userId]);
  const got = data ? ACH_ORDER.filter((a) => data.counts[a] > 0).length : 0;
  return (
    <div className="ach">
      <div className="ach-head">
        <b className="num">
          {got}/{ACH_ORDER.length}
        </b>
        <span>{data ? count(data.wins, 'יד אחת שניצחת בפוקר', 'ידיים שניצחת בפוקר', 'poker hand won', 'poker hands won') : '…'}</span>
      </div>
      <div className="ach-grid">
        {ACH_ORDER.map((a) => {
          const Icon = ICONS[a];
          const n = data?.counts[a] ?? 0;
          const info = ACH_INFO[a];
          return (
            <div key={a} className={`ach-tile ${n > 0 ? 'on' : ''}`}>
              <span className="ach-ic" aria-hidden="true">
                <Icon size={20} strokeWidth={2} />
              </span>
              <b>{lang === 'he' ? info.he : info.en}</b>
              {n > 0 ? (
                <span className="ach-n num" dir="ltr">
                  ×{n}
                </span>
              ) : (
                <span className="ach-how">{lang === 'he' ? info.heHow : info.enHow}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">{tr('נספר מכל השולחנות. קלפים שלא הראית לא נספרים.', 'Counted across all tables. Cards you never showed are not counted.')}</p>
    </div>
  );
}
