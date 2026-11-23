// כפתור המאמן האישי (פרימיום): שולח את המצב לשרת ומציג המלצה קצרה
import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { coachCall } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { toast } from './ui';

// הופך **טקסט** להדגשה
function withBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>,
  );
}

export function Coach({
  roomId,
  premium,
  contextKey,
  compact = false,
}: {
  roomId: string;
  premium: boolean;
  contextKey: string;
  compact?: boolean;
}) {
  const { tr } = useI18n();
  const [tip, setTip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // מצב חדש בשולחן - ההמלצה הקודמת כבר לא רלוונטית
  useEffect(() => {
    setTip(null);
  }, [contextKey]);

  const ask = async () => {
    if (!premium) {
      toast(tr('⭐ המאמן האישי זמין למנויי פרימיום - בקשו מהמנהל לאשר לכם', '⭐ The personal coach is for premium members - ask the admin'));
      return;
    }
    setBusy(true);
    try {
      const r = await coachCall({ roomId });
      setTip(r.tip);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? 'coach compact' : 'coach'}>
      {tip && (
        <div className="coach-bubble">
          {!compact && <span className="coach-avatar">🤖</span>}
          <div className="grow" dir="auto">
            {withBold(tip)}
          </div>
          <button className="icon-btn small" onClick={() => setTip(null)} aria-label={tr('סגור', 'Close')}>
            ✕
          </button>
        </div>
      )}
      {!tip && (
        <button className={`coach-btn ${premium ? '' : 'locked'}`} onClick={ask} disabled={busy}>
          {busy ? (
            <>
              <span className="spinner" /> {tr('המאמן חושב…', 'The coach is thinking…')}
            </>
          ) : (
            <>
              {compact ? (
                <>
                  {!premium && <Lock size={12} />} {tr('מאמן', 'Coach')}
                </>
              ) : (
                <>
                  🤖 {tr('מה המאמן אומר?', 'Ask the coach')} {!premium && <span className="tag gold">⭐</span>}
                </>
              )}
            </>
          )}
        </button>
      )}
    </div>
  );
}
