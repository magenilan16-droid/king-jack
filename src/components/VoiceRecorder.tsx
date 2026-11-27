// הקלטת הודעה קולית: הלוגיקה המשותפת (צ׳אט + כפתור המיקרופון בשולחן), והכפתור עצמו.
// בכפתור בשולחן: מחזיקים ומדברים, משחררים = נשלח. נגיעה קצרה = מצב הקלטה עם "שלח" ו"בטל".
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Mic, MicOff, Send, X } from 'lucide-react';
import { toast } from './ui';
import { useI18n } from '../lib/i18n';
import { VOICE_MAX_S } from '../engine/room';
import { fmtDur, sendVoice, startRecording, type Recording } from '../lib/voice';
import { callMute, useCall } from '../lib/call';

export type RecPhase = 'idle' | 'starting' | 'rec' | 'sending';

export function useVoiceRecorder(roomId: string, myId: string, onSent?: () => void) {
  const { tr } = useI18n();
  const [phase, setPhase] = useState<RecPhase>('idle');
  const [secs, setSecs] = useState(0);
  const rec = useRef<Recording | null>(null);
  const abort = useRef(false); // ביטול בזמן שהמיקרופון עוד נפתח
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  });

  const cancel = useCallback(() => {
    abort.current = true;
    rec.current?.cancel();
    rec.current = null;
    setPhase('idle');
  }, []);

  const finish = useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setPhase('sending');
    try {
      const out = await r.stop();
      if (out.dur < 0.7 || out.blob.size < 500) {
        toast(tr('ההקלטה קצרה מדי. מחזיקים את המיקרופון ומדברים', 'Too short. Hold the mic and talk'), 'error');
        setPhase('idle');
        return;
      }
      await sendVoice(myId, roomId, out);
      setPhase('idle');
      onSentRef.current?.();
    } catch (e) {
      toast((e as Error).message || tr('ההקלטה לא נשלחה', 'The voice message was not sent'), 'error');
      setPhase('idle');
    }
  }, [myId, roomId, tr]);

  const start = useCallback(async () => {
    if (rec.current) return;
    abort.current = false;
    setPhase('starting');
    setSecs(0);
    try {
      const r = await startRecording();
      if (abort.current) {
        r.cancel();
        return;
      }
      rec.current = r;
      setPhase('rec');
      navigator.vibrate?.(12);
    } catch (e) {
      const denied = (e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError';
      toast(
        denied
          ? tr('אין גישה למיקרופון. צריך לאשר מיקרופון לאתר בהגדרות הדפדפן', 'No microphone access. Allow the microphone for this site in your browser settings')
          : tr('לא הצלחתי להפעיל את המיקרופון', 'Could not start the microphone'),
        'error',
      );
      setPhase('idle');
    }
  }, [tr]);

  // שעון + שליחה אוטומטית בסוף הזמן
  useEffect(() => {
    if (phase !== 'rec') return;
    const t = window.setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const s = (performance.now() - r.started) / 1000;
      setSecs(s);
      if (s >= VOICE_MAX_S) void finish();
    }, 200);
    return () => window.clearInterval(t);
  }, [phase, finish]);

  useEffect(
    () => () => {
      abort.current = true;
      rec.current?.cancel();
    },
    [],
  );

  return { phase, secs, start, finish, cancel };
}

export const recClock = (secs: number) => `0:${String(Math.floor(secs)).padStart(2, '0')}`;

export const SIZE = 48;
const HOLD_MS = 550; // החזקה ארוכה מזה = "מחזיקים ומדברים". קצרה = מצב הקלטה עם כפתור שליחה
const AWAY_PX = 70; // גרירה רחוקה מהכפתור = ביטול

// הכפתור יושב בפינה הימנית התחתונה של השולחן, ממש מעל אזור הפעולות (בפוקר ובבלאק ג׳ק).
// call = איפה יושב כפתור השיחה: בפינה השמאלית התחתונה, ואם יש שם מושב - מעל המיקרופון או לידו
type Spot = { top: number; left: number };
const hits = (a: Spot, r: DOMRect) => !(r.right < a.left - 4 || r.left > a.left + SIZE + 4 || r.bottom < a.top - 4 || r.top > a.top + SIZE + 4);
function callSpot(mic: Spot, start: number): Spot {
  const seats = [...document.querySelectorAll('.felt [data-pid]:not(.me):not(.bk-me), .felt .bk-meplate')].map((e) => e.getBoundingClientRect());
  const opts = [
    { top: mic.top, left: start },
    { top: mic.top - SIZE - 12, left: mic.left },
    { top: mic.top, left: mic.left - SIZE - 12 },
  ];
  return opts.find((o) => !seats.some((r) => hits(o, r))) ?? opts[0];
}
export function useAnchor() {
  const [pos, setPos] = useState<{ top: number; left: number; call: Spot } | null>(null);
  useEffect(() => {
    let el: Element | null = null;
    const ro = new ResizeObserver(() => measure());
    function measure() {
      const cur = document.querySelector('.pk-actions');
      if (cur !== el) {
        ro.disconnect();
        el = cur;
        if (el) ro.observe(el);
      }
      const r = el?.getBoundingClientRect();
      const mic =
        r && r.height > 0
          ? { top: Math.round(r.top - SIZE - 6), left: Math.round(r.right - SIZE - 12) }
          : { top: Math.round(window.innerHeight - SIZE - 20), left: Math.round(Math.min(window.innerWidth, 560) - SIZE - 12) };
      const call = callSpot(mic, r && r.height > 0 ? Math.round(r.left + 12) : 12);
      setPos((p) => (p && p.top === mic.top && p.left === mic.left && p.call.top === call.top && p.call.left === call.left ? p : { ...mic, call }));
    }
    measure();
    const t = window.setInterval(measure, 700);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.clearInterval(t);
      window.removeEventListener('resize', measure);
    };
  }, []);
  return pos;
}

export function TableMic({ roomId, myId }: { roomId: string; myId: string }) {
  const { tr } = useI18n();
  const { phase, secs, start, finish, cancel } = useVoiceRecorder(roomId, myId);
  const pos = useAnchor();
  const call = useCall();
  const [mode, setMode] = useState<'hold' | 'lock'>('hold');
  const [away, setAway] = useState(false);
  const press = useRef<{ at: number; x: number; y: number } | null>(null);
  const lockTap = useRef(false);

  const busy = phase !== 'idle';
  const locked = busy && mode === 'lock';

  const onDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button > 0) return;
    if (locked && phase === 'rec') {
      lockTap.current = true;
      return;
    }
    if (phase !== 'idle') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { at: performance.now(), x: e.clientX, y: e.clientY };
    setMode('hold');
    setAway(false);
    void start();
  };
  const onMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    setAway(Math.hypot(e.clientX - p.x, e.clientY - p.y) > AWAY_PX);
  };
  const onUp = () => {
    if (lockTap.current) {
      lockTap.current = false;
      void finish();
      return;
    }
    const p = press.current;
    if (!p) return;
    press.current = null;
    if (away) {
      setAway(false);
      cancel();
      return;
    }
    // נגיעה קצרה, או שהמיקרופון עוד לא נפתח (למשל חלון ההרשאה קפץ) - עוברים למצב הקלטה עם כפתור שליחה
    if (performance.now() - p.at < HOLD_MS || phase !== 'rec') setMode('lock');
    else void finish();
  };
  const onCancelPointer = () => {
    if (!press.current) return;
    press.current = null;
    setAway(false);
    setMode('lock');
  };
  // מקלדת: Enter/רווח מתחיל, ושוב שולח
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (phase === 'idle') {
      setMode('lock');
      void start();
    } else if (phase === 'rec') void finish();
  };

  if (!pos) return null;
  // באמצע שיחה בשולחן כולם כבר שומעים אותי - הכפתור הופך להשתקה
  if (call.status === 'on' && !busy)
    return (
      <button
        type="button"
        className={`tbl-mic in-call ${call.muted ? 'muted' : ''} ${!call.muted && call.talking.includes(myId) ? 'talk' : ''}`}
        style={{ top: pos.top, left: pos.left, width: SIZE, height: SIZE }}
        aria-label={call.muted ? tr('המיקרופון מושתק. לחצו כדי לדבר', 'Mic is muted. Tap to talk') : tr('המיקרופון פתוח. לחצו להשתקה', 'Mic is on. Tap to mute')}
        aria-pressed={call.muted}
        onClick={() => callMute(!call.muted)}
      >
        {call.muted ? <MicOff size={22} strokeWidth={2.1} /> : <Mic size={22} strokeWidth={2.1} />}
      </button>
    );
  const pct = Math.min(100, (secs / VOICE_MAX_S) * 100);
  const label = !busy ? tr('הודעה קולית: החזיקו ודברו', 'Voice message: hold and talk') : locked ? tr('שלח הודעה קולית', 'Send voice message') : tr('מקליט', 'Recording');
  return (
    <>
      <button
        type="button"
        className={`tbl-mic ${busy ? 'on' : ''} ${locked ? 'locked' : ''} ${away ? 'away' : ''}`}
        style={{ top: pos.top, left: pos.left, width: SIZE, height: SIZE }}
        aria-label={label}
        disabled={phase === 'sending'}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancelPointer}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
      >
        {locked && phase === 'rec' ? <Send size={20} strokeWidth={2.2} /> : <Mic size={22} strokeWidth={2.1} />}
      </button>
      {busy && (
        <div
          className={`tbl-mic-pill ${away ? 'away' : ''}`}
          style={{ top: pos.top + SIZE / 2, right: `calc(100vw - ${pos.left}px + 8px)`, '--p': pct + '%' } as CSSProperties}
          role="status"
          aria-live="polite"
        >
          <span className={`rec-dot ${phase === 'rec' ? 'on' : ''}`} aria-hidden="true" />
          <span className="tmp-main">
            <span className="num tmp-time" dir="ltr">
              {recClock(secs)} <small>/ {fmtDur(VOICE_MAX_S)}</small>
            </span>
            <span className="tmp-hint">
              {phase === 'starting'
                ? tr('מפעיל מיקרופון...', 'Starting mic...')
                : phase === 'sending'
                  ? tr('שולח...', 'Sending...')
                  : away
                    ? tr('שחררו כדי לבטל', 'Release to cancel')
                    : locked
                      ? tr('מקליט. לחצו לשליחה', 'Recording. Tap to send')
                      : tr('שחררו לשליחה, גררו הצידה לביטול', 'Release to send, slide away to cancel')}
            </span>
          </span>
          {/* ביטול - בקצה הרחוק מכפתור השליחה, שלא ילחצו בטעות */}
          {locked && (
            <button type="button" className="tmp-x" onClick={cancel} disabled={phase === 'sending'} aria-label={tr('בטל הקלטה', 'Cancel recording')}>
              <X size={18} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
