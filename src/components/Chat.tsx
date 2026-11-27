// צ׳אט השולחן + תגובות מהירות לפי ערכת הנושא
import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Play, Send, Square, X } from 'lucide-react';
import type { ChatMsg } from '../engine/room';
import type { Theme } from '../lib/themes';
import { gameCall } from '../lib/supabase';
import { Sheet, toast } from './ui';
import { useI18n } from '../lib/i18n';
import { chatName, chatText } from '../lib/display';
import { isMuted } from '../lib/sound';
import { VOICE_MAX_S } from '../engine/room';
import { canRecord, fmtDur, playVoice, prefetchVoice, queueVoice, sendVoice, startRecording, useVoicePlaying, voiceAuto, type Recording } from '../lib/voice';

// onFx: הודעה של בוט שמגיעה עם אימוג׳י / זריקה
export function useChatNotifier(chat: ChatMsg[] | undefined, myId: string, open: boolean, onFx?: (m: ChatMsg) => void) {
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState<ChatMsg | null>(null);
  // null = עוד לא נטען השולחן. בטעינה הראשונה מדלגים על ההיסטוריה (גם כשהיא ריקה)
  const last = useRef<number | null>(null);
  const hideT = useRef<number | undefined>(undefined);
  const showT = useRef<number | undefined>(undefined);
  const onFxRef = useRef(onFx);
  useEffect(() => {
    onFxRef.current = onFx;
  });
  useEffect(() => {
    if (!chat) return;
    const newestAt = chat.length ? chat[chat.length - 1].at : 0;
    if (last.current === null) {
      last.current = newestAt;
      return;
    }
    const from = last.current;
    const fresh = chat.filter((m) => m.at > from);
    if (!fresh.length) return;
    last.current = newestAt;
    // מונה הודעות שלא נקראו - רק של אחרים. הבועה בשולחן - לכולם, גם להודעה שלי
    const others = fresh.filter((m) => m.id !== myId).length;
    if (!open && others) setUnread((u) => u + others);
    // הודעה קולית של מישהו אחר: מורידים מיד, ומנגנים לבד (רק אם הצלילים פועלים והמסך פתוח, ורק הודעות טריות)
    for (const v of fresh) {
      if (!v.voice || v.id === myId || Date.now() - v.at > 60000) continue;
      void prefetchVoice(v.voice).catch(() => {});
      if (voiceAuto() && !isMuted() && document.visibilityState === 'visible') queueVoice(v.voice);
    }
    // הודעה של בוט יכולה לחכות (למשל עד שהלוח של אול-אין נחשף) - הבועה והאפקט מגיעים בזמן שלה
    const m = fresh[fresh.length - 1];
    const wait = Math.min(12000, Math.max(0, m.delay ?? 0));
    window.clearTimeout(showT.current);
    showT.current = window.setTimeout(() => {
      setBubble(m);
      if (m.fx) onFxRef.current?.(m);
      window.clearTimeout(hideT.current);
      hideT.current = window.setTimeout(() => setBubble(null), m.voice ? Math.max(4000, (m.dur ?? 3) * 1000 + 1800) : 4000);
    }, wait);
  }, [chat, myId, open]);
  useEffect(
    () => () => {
      window.clearTimeout(hideT.current);
      window.clearTimeout(showT.current);
    },
    [],
  );
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);
  return { unread, bubble };
}

export function ChatSheet({
  open,
  onClose,
  chat,
  roomId,
  theme,
  myId,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatMsg[];
  roomId: string;
  theme: Theme;
  myId: string;
}) {
  const { tr, lang } = useI18n();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 1e6 });
  }, [chat, open]);
  const send = async (t: string) => {
    if (!t.trim()) return;
    try {
      await gameCall({ op: 'act', roomId, move: { type: 'chat', text: t } });
      setText('');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={tr('צ׳אט השולחן', 'Table chat')}>
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <div className="empty">{tr('עוד אין הודעות. אפשר להתחיל לעקוץ.', 'No messages yet. Start the trash talk.')}</div>}
        {chat.map((m, i) => (
          <div key={i} className={`chat-msg ${m.id === myId ? 'mine' : ''}`}>
            {m.id !== myId && <b dir="auto">{chatName(m, lang)}</b>}
            {m.voice ? <VoiceChip path={m.voice} dur={m.dur} /> : <span dir="auto">{chatText(m, lang)}</span>}
          </div>
        ))}
      </div>
      <div className="quick-chat">
        {theme.quickChat.map((q) => (
          <button
            key={q}
            className="chip-btn"
            onClick={() => {
              // הודעה מהירה: שולחים וסוגרים, כדי לראות את הבועה בשולחן
              send(q);
              onClose();
            }}
          >
            {q}
          </button>
        ))}
      </div>
      <VoiceBar open={open} roomId={roomId} myId={myId} onSent={onClose}>
        {(startRec) => (
          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('הודעה לשולחן', 'Message the table')} aria-label={tr('הודעה', 'Message')} maxLength={120} />
            {canRecord() && !text.trim() ? (
              <button className="btn primary chat-mic" type="button" onClick={startRec} aria-label={tr('הודעה קולית', 'Voice message')}>
                <Mic size={21} strokeWidth={2.1} />
              </button>
            ) : (
              <button className="btn primary" type="submit">
                {tr('שלח', 'Send')}
              </button>
            )}
          </form>
        )}
      </VoiceBar>
    </Sheet>
  );
}

// הודעה קולית ברשימה: לחיצה מנגנת, לחיצה נוספת עוצרת
function VoiceChip({ path, dur }: { path: string; dur?: number }) {
  const { tr } = useI18n();
  const on = useVoicePlaying() === path;
  return (
    <button type="button" className={`chat-voice ${on ? 'playing' : ''}`} onClick={() => playVoice(path)} aria-label={on ? tr('עצור', 'Stop') : tr('נגן הודעה קולית', 'Play voice message')}>
      <span className="cv-ic">{on ? <Square size={13} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</span>
      <VoiceBars />
      <span className="num">{fmtDur(dur)}</span>
    </button>
  );
}

export function VoiceBars() {
  return (
    <span className="vbars" aria-hidden="true">
      {[0.45, 0.8, 1, 0.65, 0.9, 0.5, 0.75].map((h, i) => (
        <i key={i} style={{ '--h': h, '--i': i } as React.CSSProperties} />
      ))}
    </span>
  );
}

// הקלטה: לחיצה על המיקרופון מתחילה, "שלח" שולח, "בטל" זורק. אחרי 15 שניות נשלח לבד
function VoiceBar({ open, roomId, myId, onSent, children }: { open: boolean; roomId: string; myId: string; onSent: () => void; children: (start: () => void) => React.ReactNode }) {
  const { tr } = useI18n();
  const [phase, setPhase] = useState<'idle' | 'starting' | 'rec' | 'sending'>('idle');
  const [secs, setSecs] = useState(0);
  const rec = useRef<Recording | null>(null);

  const cancel = useCallback(() => {
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
        toast(tr('ההקלטה קצרה מדי. לוחצים על המיקרופון, מדברים, ואז "שלח"', 'Too short. Tap the mic, talk, then Send'), 'error');
        setPhase('idle');
        return;
      }
      await sendVoice(myId, roomId, out);
      setPhase('idle');
      onSent();
    } catch (e) {
      toast((e as Error).message || tr('ההקלטה לא נשלחה', 'The voice message was not sent'), 'error');
      setPhase('idle');
    }
  }, [myId, roomId, onSent, tr]);

  const start = async () => {
    if (phase !== 'idle') return;
    setPhase('starting');
    setSecs(0);
    try {
      rec.current = await startRecording();
      setPhase('rec');
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
  };

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

  // סגירת החלון באמצע הקלטה = ביטול. וגם ביציאה מהמסך
  useEffect(() => {
    if (!open && rec.current) cancel();
  }, [open, cancel]);
  useEffect(() => () => rec.current?.cancel(), []);

  if (phase === 'idle') return <>{children(start)}</>;
  const pct = Math.min(100, (secs / VOICE_MAX_S) * 100);
  return (
    <div className="chat-rec" role="status" aria-live="polite">
      <button className="btn ghost rec-cancel" type="button" onClick={cancel} disabled={phase === 'sending'} aria-label={tr('בטל הקלטה', 'Cancel recording')}>
        <X size={20} />
      </button>
      <div className="rec-mid">
        <div className="rec-top">
          <span className={`rec-dot ${phase === 'rec' ? 'on' : ''}`} aria-hidden="true" />
          <span>{phase === 'starting' ? tr('מפעיל מיקרופון...', 'Starting mic...') : phase === 'sending' ? tr('שולח...', 'Sending...') : tr('מקליט', 'Recording')}</span>
          <span className="num rec-time" dir="ltr">
            {`0:${String(Math.floor(secs)).padStart(2, '0')}`} <small>/ {fmtDur(VOICE_MAX_S)}</small>
          </span>
        </div>
        <div className="rec-track">
          <i style={{ width: pct + '%' }} />
        </div>
      </div>
      <button className="btn primary rec-send" type="button" onClick={() => void finish()} disabled={phase !== 'rec'}>
        <Send size={18} /> {tr('שלח', 'Send')}
      </button>
    </div>
  );
}
