// בוחרי דמות וערכת נושא - אותו עיצוב בפרופיל, בהרשמה ובתפריט השולחן
import { Check } from 'lucide-react';
import { AVATARS, type Theme, type ThemeId } from '../lib/themes';
import { useI18n } from '../lib/i18n';
import { Avatar } from './Avatar';

// פס דמויות: הדמות שנבחרה מוצגת כמו בשולחן (עיגול עם ראשי תיבות + תג), השאר בשורה נגללת
export function AvatarPicker({ name, value, onChange }: { name: string; value: string; onChange: (a: string) => void }) {
  const { tr } = useI18n();
  return (
    <div className="av-picker">
      <div className="av-preview">
        <Avatar name={name || '?'} emoji={value} size={56} />
        <div>
          <b dir="auto">{name || tr('השם שלך', 'Your name')}</b>
          <span>{tr('ככה יראו אותך בשולחן', "This is how you'll look at the table")}</span>
        </div>
      </div>
      <div className="av-strip" role="radiogroup" aria-label={tr('דמות', 'Avatar')}>
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={a === value}
            className={`av-pick ${a === value ? 'active' : ''}`}
            onClick={() => onChange(a)}
          >
            <span aria-hidden="true">{a}</span>
            {a === value && (
              <i className="av-check" aria-hidden="true">
                <Check size={11} strokeWidth={3.5} />
              </i>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ערכות נושא: חתיכת בד בצבעים של הערכה במקום אימוג׳י
export function ThemePicker({ themes, value, onChange }: { themes: Theme[]; value: ThemeId; onChange: (t: ThemeId) => void }) {
  const { tr } = useI18n();
  return (
    <div className="theme-swatches" role="radiogroup" aria-label={tr('ערכת נושא', 'Theme')}>
      {themes.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={t.id === value}
          className={`theme-sw ${t.id === value ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span
            className="sw-felt"
            aria-hidden="true"
            style={{
              background: `radial-gradient(90% 120% at 50% 0%, color-mix(in srgb, ${t.vars['--felt']} 100%, white 10%), ${t.vars['--felt']} 55%, ${t.vars['--felt2']})`,
            }}
          >
            <i style={{ background: t.vars['--accent'] }} />
          </span>
          <span className="sw-name">{t.name}</span>
        </button>
      ))}
    </div>
  );
}
