// לוח הצלילים בשולחן (בתוך "תגובה מהירה"): לחיצה על צליל = כל השולחן שומע.
// "צליל חדש": מקליטים עד 5 שניות, נותנים שם, שומרים - וכל החבורה רואה אותו בלוח
import { useEffect, useRef, useState } from 'react';
import { Mic, Play, Plus, Square, X } from 'lucide-react';
import { Sheet, AsyncButton, toast } from './ui';
import { useI18n } from '../lib/i18n';
import { CLIP_MAX_S, CLIPS_PER_USER, deleteClip, loadClips, saveClip, useClips, type Clip } from '../lib/sounds';
import { canRecord, startRecording, type Recording } from '../lib/voice';

export function SoundBoard({ myId, onPlay, onAdd }: { myId: string; onPlay: (c: Clip) => void; onAdd: () => void }) {
  const { tr } = useI18n();
  const clips = useClips();
  useEffect(() => {
    void loadClips();
  }, []);
  const mine = (clips ?? []).filter((c) => c.owner === myId).length;
  return (
    <div className="sb">
      <div className="sb-head">
        <span className="label">{tr('לוח הצלילים של החבורה', "The gang's sound board")}</span>
        {canRecord() && mine < CLIPS_PER_USER && (
          <button type="button" className="sb-add" onClick={onAdd}>
            <Plus size={16} strokeWidth={2.4} /> {tr('צליל חדש', 'New sound')}
          </button>
        )}
      </div>
      {clips == null ? (
        <div className="sb-empty">
          <span className="spinner" />
        </div>
      ) : clips.length === 0 ? (
        <div className="sb-empty">{tr('עוד אין צלילים. הקליטו את הבדיחה הפנימית הראשונה של החבורה', 'No sounds yet. Record the first inside joke of the gang')}</div>
      ) : (
        <div className="sb-grid">
          {clips.map((c) => (
            <span key={c.id} className="sb-item">
              <button type="button" className="sb-clip" onClick={() => onPlay(c)} dir="auto">
                {c.label}
              </button>
              {c.owner === myId && (
                <button
                  type="button"
                  className="sb-del"
                  aria-label={tr(`מחיקת ${c.label}`, `Delete ${c.label}`)}
                  onClick={async () => {
                    if (!confirm(tr(`למחוק את "${c.label}"?`, `Delete "${c.label}"?`))) return;
                    try {
                      await deleteClip(c.id);
                    } catch (e) {
                      toast((e as Error).message, 'error');
                    }
                  }}
                >
                  <X size={12} strokeWidth={3} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type Take = { blob: Blob; dur: number; url: string };

export function NewSoundSheet({ open, onClose, myId }: { open: boolean; onClose: () => void; myId: string }) {
  const { tr } = useI18n();
  const [label, setLabel] = useState('');
  const [phase, setPhase] = useState<'idle' | 'starting' | 'rec'>('idle');
  const [secs, setSecs] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const rec = useRef<Recording | null>(null);

  const reset = () => {
    rec.current?.cancel();
    rec.current = null;
    setPhase('idle');
    setSecs(0);
    setTake((t) => {
      if (t) URL.revokeObjectURL(t.url);
      return null;
    });
  };
  // סגירה = מתחילים מחדש בפעם הבאה
  useEffect(() => {
    if (!open) {
      reset();
      setLabel('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stop = async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    setPhase('idle');
    const out = await r.stop();
    if (out.dur < 0.4 || out.blob.size < 400) return toast(tr('קצר מדי. לוחצים, אומרים את המשפט, ולוחצים שוב', 'Too short. Tap, say it, tap again'), 'error');
    setTake({ ...out, url: URL.createObjectURL(out.blob) });
  };

  const start = async () => {
    reset();
    setPhase('starting');
    try {
      rec.current = await startRecording();
      setPhase('rec');
      navigator.vibrate?.(12);
    } catch (e) {
      setPhase('idle');
      const denied = (e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError';
      toast(denied ? tr('צריך לאשר מיקרופון לאתר בהגדרות הדפדפן', 'Allow the microphone for this site in your browser settings') : tr('לא הצלחתי להפעיל את המיקרופון', 'Could not start the microphone'), 'error');
    }
  };

  // שעון + עצירה אוטומטית אחרי 5 שניות
  useEffect(() => {
    if (phase !== 'rec') return;
    const t = window.setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const s = (performance.now() - r.started) / 1000;
      setSecs(s);
      if (s >= CLIP_MAX_S) void stop();
    }, 100);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const [playing, setPlaying] = useState(false);
  const preview = () => {
    if (!take) return;
    const a = new Audio(take.url);
    setPlaying(true);
    a.onended = a.onerror = () => setPlaying(false);
    a.play().catch(() => setPlaying(false));
  };

  const recording = phase === 'rec';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('צליל חדש ללוח', 'New sound for the board')}
      footer={
        <AsyncButton
          className="btn primary block big"
          disabled={!take || !label.trim() || recording}
          onClick={async () => {
            await saveClip(myId, label, take!);
            toast(tr(`"${label.trim()}" נוסף ללוח`, `"${label.trim()}" was added to the board`), 'win');
            onClose();
          }}
        >
          {tr('שמירה בלוח', 'Save to the board')}
        </AsyncButton>
      }
    >
      <label className="sb-name">
        {tr('איך קוראים לצליל', 'Name of the sound')}
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={24} placeholder={tr('למשל: סבתא של תמיר!', 'e.g. Grandma!')} dir="auto" />
      </label>
      <div className="sb-rec">
        <button
          type="button"
          className={`sb-recbtn ${recording ? 'on' : ''}`}
          onClick={() => (recording ? void stop() : void start())}
          disabled={phase === 'starting'}
          aria-label={recording ? tr('עצירת ההקלטה', 'Stop recording') : tr('הקלטה', 'Record')}
          style={{ '--p': `${Math.min(100, (secs / CLIP_MAX_S) * 100)}%` } as React.CSSProperties}
        >
          {phase === 'starting' ? <span className="spinner" /> : recording ? <Square size={26} fill="currentColor" /> : <Mic size={30} />}
        </button>
        <div className="sb-rec-txt">
          {recording ? (
            <span className="num" dir="ltr">
              {secs.toFixed(1)} / {CLIP_MAX_S}
            </span>
          ) : take ? (
            <button type="button" className="sb-preview" onClick={preview} disabled={playing}>
              <Play size={16} fill="currentColor" /> {tr('להשמיע שוב', 'Play it back')} <span className="num">{take.dur.toFixed(1)}</span>
            </button>
          ) : (
            <span>{tr(`לוחצים, אומרים את המשפט (עד ${CLIP_MAX_S} שניות), ולוחצים שוב`, `Tap, say it (up to ${CLIP_MAX_S} seconds), tap again`)}</span>
          )}
        </div>
      </div>
    </Sheet>
  );
}
