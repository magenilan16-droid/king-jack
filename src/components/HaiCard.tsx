// ח״י בדצמבר בלובי: כרטיס כתום לזכרו של רותם לוי, ג׳ינג׳י, עם השולחן שלו וגביע ח״י בדצמבר
import { useEffect, useState } from 'react';
import { Heart, Trophy } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { currentHaiCup, type HaiCup } from '../lib/december';

export function HaiCard({ gingerOpen, onOpen }: { gingerOpen: boolean; onOpen: () => void }) {
  const { tr } = useI18n();
  const [cup, setCup] = useState<HaiCup | null>(null);
  useEffect(() => {
    void currentHaiCup().then(setCup);
  }, []);
  const year = new Date().getFullYear();
  return (
    <section className="hai-card" aria-label={tr('ח״י בדצמבר', 'Chai of December')}>
      <div className="hai-head">
        <Heart size={20} className="hai-heart" fill="currentColor" aria-hidden="true" />
        <h2>{tr('ח״י בדצמבר', 'Chai of December')}</h2>
      </div>
      <p className="hai-text">{tr('לזכרו של רותם לוי ז״ל, ג׳ינג׳י, קרייזי אורנג׳, שנפל ב-18.12.23', 'In memory of Rotem Levi, Ginger, Crazy Orange, who fell on 18.12.23')}</p>
      <button type="button" className="btn block big hai-btn" onClick={onOpen}>
        {gingerOpen ? tr('הצטרפות לשולחן של ג׳ינג׳י', "Join Ginger's table") : tr('פתיחת השולחן של ג׳ינג׳י', "Open Ginger's table")}
      </button>
      <p className="hai-hint">{tr('מי שמסיים הכי גבוה בשולחן הזה הלילה לוקח את גביע ח״י בדצמבר, עד השנה הבאה.', 'Whoever finishes highest at this table tonight takes the Chai of December cup until next year.')}</p>
      {cup && cup.year < year && (
        <p className="hai-hint hai-holder">
          <Trophy size={14} aria-hidden="true" /> {tr(`הגביע אצל ${cup.name} מ-${cup.year}`, `${cup.name} holds the cup from ${cup.year}`)}
        </p>
      )}
    </section>
  );
}
