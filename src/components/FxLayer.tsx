// שכבת אפקטים מעל השולחן: חפצים שעפים בין שחקנים, אימוג׳י מעל הראש ובועות צ׳אט
// המיקום נלקח מהמסך עצמו (כל מושב מסומן ב-data-pid)
import { useEffect, useState, type CSSProperties } from 'react';
import type { FxEvent } from '../lib/fx';
import type { ChatMsg } from '../engine/room';
import { chatText } from '../lib/display';
import { getLang } from '../lib/i18n';
import { Mic, Volume2 } from 'lucide-react';
import { fmtDur, useVoicePlaying } from '../lib/voice';
import { VoiceBars } from './Chat';

function centerOf(pid: string): { x: number; y: number } | null {
  const el = document.querySelector(`[data-pid="${CSS.escape(pid)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 40) };
}

const SPLAT: Record<string, string> = { '🍅': '💥', '🥚': '🍳', '🍺': '💦', '💩': '💨', '🎂': '🎉', '💸': '🤑', '🔥': '🔥', '🌹': '💕', '💋': '💗', '🧻': '😷' };

export function FxLayer({ events, chatBubble }: { events: FxEvent[]; chatBubble: ChatMsg | null }) {
  // מזיזים מושב שזירזו אותו
  useEffect(() => {
    for (const e of events) {
      if (e.kind !== 'nudge') continue;
      const el = document.querySelector(`[data-pid="${CSS.escape(e.to)}"]`);
      if (!el) continue;
      el.classList.remove('shake');
      void (el as HTMLElement).offsetWidth;
      el.classList.add('shake');
    }
  }, [events]);

  return (
    <div className="fx-layer" aria-hidden="true">
      {events.map((e) => {
        if (e.kind === 'throw') {
          const a = centerOf(e.from);
          const b = centerOf(e.to);
          if (!a || !b) return null;
          const style = { '--x0': `${a.x}px`, '--y0': `${a.y}px`, '--x1': `${b.x}px`, '--y1': `${b.y}px` } as CSSProperties;
          return (
            <span key={e.id}>
              <span className="fx-throw" style={style}>
                {e.item}
              </span>
              <span className="fx-splat" style={{ left: b.x, top: b.y }}>
                {SPLAT[e.item] ?? '💥'}
              </span>
            </span>
          );
        }
        if (e.kind === 'emote') {
          const a = centerOf(e.from);
          if (!a) return null;
          return (
            <span key={e.id} className="fx-emote" style={{ left: a.x, top: a.y }}>
              {e.emoji}
            </span>
          );
        }
        if (e.kind === 'showme') {
          const a = centerOf(e.from);
          const b = centerOf(e.to);
          return (
            <span key={e.id}>
              {a && (
                <span className="fx-chat showme" style={{ left: Math.min(Math.max(a.x, 60), window.innerWidth - 60), top: a.y - 34 }}>
                  {document.documentElement.lang === 'en' ? 'Show!' : 'תראה!'}
                </span>
              )}
              {b && (
                <span className="fx-emote" style={{ left: b.x, top: b.y }}>
                  👀
                </span>
              )}
            </span>
          );
        }
        if (e.kind === 'sound') {
          const a = centerOf(e.from);
          if (!a) return null;
          return (
            <span key={e.id} className="fx-chat fx-sound" style={{ left: Math.min(Math.max(a.x, 90), window.innerWidth - 90), top: a.y - 34 }}>
              <Volume2 size={15} strokeWidth={2.4} aria-hidden="true" />
              <span dir="auto">{e.label}</span>
            </span>
          );
        }
        if (e.kind === 'nudge') {
          const b = centerOf(e.to);
          if (!b) return null;
          return (
            <span key={e.id} className="fx-emote nudge" style={{ left: b.x, top: b.y }}>
              ⏰
            </span>
          );
        }
        return null;
      })}
      {chatBubble && <ChatBubble msg={chatBubble} />}
    </div>
  );
}

// בועת צ׳אט מעל מי שכתב
function ChatBubble({ msg }: { msg: ChatMsg }) {
  const [pos, setPos] = useState(() => centerOf(msg.id));
  useEffect(() => setPos(centerOf(msg.id)), [msg]);
  const playing = useVoicePlaying();
  if (!pos) return null;
  if (msg.voice)
    return (
      <span className={`fx-chat fx-voice ${playing === msg.voice ? 'playing' : ''}`} style={{ left: Math.min(Math.max(pos.x, 90), window.innerWidth - 90), top: pos.y - 34 }}>
        <Mic size={14} strokeWidth={2.4} aria-hidden="true" />
        <VoiceBars />
        <span className="num">{fmtDur(msg.dur)}</span>
      </span>
    );
  return (
    <span className="fx-chat" style={{ left: Math.min(Math.max(pos.x, 90), window.innerWidth - 90), top: pos.y - 34 }} dir="auto">
      {chatText(msg, getLang())}
    </span>
  );
}
