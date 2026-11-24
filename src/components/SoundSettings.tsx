// הגדרות צליל: הפעלה/כיבוי ועוצמה (בתפריט השולחן ובפרופיל). בסוף הזזה מתנגן צליל ז׳טונים כדי לשמוע את העוצמה
import type { CSSProperties } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useMuted, useVolume, sfx } from '../lib/sound';
import { useI18n } from '../lib/i18n';

export function SoundSettings() {
  const { tr } = useI18n();
  const [muted, setMuted] = useMuted();
  const [vol, setVol] = useVolume();
  const pct = Math.round(vol * 100);
  const preview = () => sfx.chipStack();
  return (
    <>
      <label className="menu-item toggle">
        <span className="mi">
          {muted ? <VolumeX size={19} /> : <Volume2 size={19} />} {tr('צלילים', 'Sounds')}
        </span>
        <input type="checkbox" role="switch" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
      </label>
      {!muted && (
        <div className="menu-item vol-row">
          <span className="mi">
            <Volume1 size={19} /> {tr('עוצמה', 'Volume')}
          </span>
          <input
            type="range"
            className="pk-slider vol-slider"
            min={5}
            max={100}
            step={5}
            value={pct}
            style={{ '--fill': `${((pct - 5) / 95) * 100}%` } as CSSProperties}
            aria-label={tr('עוצמת הצלילים', 'Sound volume')}
            aria-valuetext={`${pct}%`}
            onChange={(e) => setVol(Number(e.target.value) / 100)}
            onPointerUp={preview}
            onKeyUp={preview}
          />
        </div>
      )}
    </>
  );
}
