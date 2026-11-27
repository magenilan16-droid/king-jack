// כפתור השיחה בשולחן (בפינה השמאלית התחתונה): לחיצה = מצטרפים לשיחה, לחיצה נוספת = יוצאים.
// כשחברים כבר בשיחה - הכפתור ירוק ומראה כמה בפנים. בזמן השיחה כפתור המיקרופון בצד השני הופך להשתקה
import { useEffect, useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { toast } from './ui';
import { useI18n } from '../lib/i18n';
import { callJoin, callLeave, useCall } from '../lib/call';
import { SIZE, useAnchor } from './VoiceRecorder';

export function TableCall({ myId, nameOf }: { myId: string; nameOf: (id: string) => string }) {
  const { tr } = useI18n();
  const c = useCall();
  const pos = useAnchor();
  const others = c.members.filter((m) => m.id !== myId);
  const on = c.status === 'on';

  // חבר פתח שיחה (או שנכנסתי לשולחן באמצע שיחה) - אומרים לי פעם אחת
  const prevN = useRef(0);
  useEffect(() => {
    const n = others.length;
    if (c.status === 'off' && n > 0 && prevN.current === 0) {
      const who = nameOf(others[0].id);
      toast(
        n === 1
          ? tr(`${who} בשיחה בשולחן. הטלפון למטה מצרף אתכם`, `${who} is on a call at the table. Tap the phone below to join`)
          : tr(`${n} חברים בשיחה בשולחן. הטלפון למטה מצרף אתכם`, `${n} friends are on a call at the table. Tap the phone below to join`),
      );
    }
    prevN.current = n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [others.length, c.status]);

  // חיבור שלא מצליח - אומרים עם מי, פעם אחת
  const told = useRef(new Set<string>());
  useEffect(() => {
    for (const [id, st] of Object.entries(c.links)) {
      if (st !== 'bad' || told.current.has(id)) continue;
      told.current.add(id);
      toast(tr(`לא מצליח להתחבר בשיחה ל${nameOf(id)}. נסו לצאת ולהיכנס שוב`, `Can't connect to ${nameOf(id)} on the call. Try leaving and joining again`), 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.links]);

  if (!c.ready || !pos) return null;

  const join = async () => {
    try {
      await callJoin();
      toast(tr('אתם בשיחה. כל מי שבשיחה שומע אתכם. המיקרופון בצד השני משתיק', "You're on the call. Everyone on it hears you. The mic on the other side mutes you"), 'win');
    } catch (e) {
      const denied = (e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError';
      toast(
        denied
          ? tr('אין גישה למיקרופון. צריך לאשר מיקרופון לאתר בהגדרות הדפדפן', 'No microphone access. Allow the microphone for this site in your browser settings')
          : tr('לא הצלחתי להפעיל את המיקרופון', 'Could not start the microphone'),
        'error',
      );
    }
  };

  const n = c.members.length;
  const label = on
    ? tr('יציאה מהשיחה', 'Leave the call')
    : others.length
      ? tr(`הצטרפות לשיחה בשולחן (${others.length} בפנים)`, `Join the table call (${others.length} on it)`)
      : tr('פתיחת שיחה בשולחן', 'Start a table call');
  return (
    <button
      type="button"
      className={`tbl-call ${on ? 'on' : others.length ? 'live' : ''} ${c.status === 'joining' ? 'joining' : ''}`}
      style={{ top: pos.call.top, left: pos.call.left, width: SIZE, height: SIZE }}
      aria-label={label}
      disabled={c.status === 'joining'}
      onClick={() => (on ? callLeave() : void join())}
    >
      {c.status === 'joining' ? <span className="spinner" /> : on ? <PhoneOff size={21} strokeWidth={2.1} /> : <Phone size={20} strokeWidth={2.1} />}
      {n > 0 && (
        <span className="tc-n num" aria-hidden="true">
          {n}
        </span>
      )}
    </button>
  );
}
