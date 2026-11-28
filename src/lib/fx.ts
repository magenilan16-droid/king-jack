// אינטראקציות בין חברים בזמן אמת: זריקת חפצים, אימוג׳י מעל הראש וזירוז
// עובר בערוץ שידור מהיר (לא נשמר בשרת המשחק)
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { sfx, seatPan } from './sound';
import { vibrate } from './prefs';
import { clipPathOk, playClip } from './sounds';

export type FxEvent =
  | { kind: 'throw'; id: string; from: string; to: string; item: string }
  | { kind: 'emote'; id: string; from: string; emoji: string }
  | { kind: 'nudge'; id: string; from: string; to: string }
  | { kind: 'showme'; id: string; from: string; to: string; hand: number }
  | { kind: 'sound'; id: string; from: string; path: string; label: string };

type FxInput =
  | { kind: 'throw'; to: string; item: string }
  | { kind: 'emote'; emoji: string }
  | { kind: 'nudge'; to: string }
  | { kind: 'showme'; to: string; hand: number }
  | { kind: 'sound'; path: string; label: string };

export const THROWABLES = ['🍅', '🍺', '🌹', '💩', '🥚', '🔥', '💋', '🎂', '💸', '🧻'];
export const EMOTES = ['😂', '😎', '🤯', '😭', '🤑', '🙏', '👏', '🔥', '🤡', '😴', '🫡', '🥶'];

export function useRoomFx(roomId: string, myId: string) {
  const [events, setEvents] = useState<FxEvent[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);

  const lastSound = useRef(new Map<string, number>());
  const add = useCallback(
    (e: FxEvent) => {
      // צליל מהלוח: רק קבצים מהדלי שלנו, ולא יותר מאחד בשנייה מכל חבר
      if (e.kind === 'sound') {
        const now = Date.now();
        if (!clipPathOk(e.path) || now - (lastSound.current.get(e.from) ?? 0) < 900) return;
        lastSound.current.set(e.from, now);
        e = { ...e, label: String(e.label ?? '').slice(0, 24) };
        void playClip(e.path);
      }
      setEvents((old) => [...old.slice(-15), e]);
      setTimeout(() => setEvents((old) => old.filter((x) => x.id !== e.id)), 2800);
      if (e.kind === 'throw') {
        sfx.whoosh(seatPan(e.from), seatPan(e.to));
        setTimeout(() => sfx.splat(e.item, seatPan(e.to)), 650);
        if (e.to === myId) setTimeout(() => vibrate(60), 650);
      } else if (e.kind === 'emote') sfx.pop(seatPan(e.from));
      else if (e.kind === 'nudge' && e.to === myId) {
        sfx.nudge();
        vibrate([80, 60, 80, 60, 80]);
      } else if (e.kind === 'showme') {
        sfx.pop(seatPan(e.from));
        if (e.to === myId) vibrate([40, 30, 40]);
      }
    },
    [myId],
  );

  useEffect(() => {
    const ch = supabase.channel('fx-' + roomId, { config: { broadcast: { self: true } } });
    ch.on('broadcast', { event: 'fx' }, ({ payload }) => add(payload as FxEvent)).subscribe();
    chRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, add]);

  const send = useCallback(
    (e: FxInput) => {
      const payload = { ...e, from: myId, id: Math.random().toString(36).slice(2) } as FxEvent;
      void chRef.current?.send({ type: 'broadcast', event: 'fx', payload });
    },
    [myId],
  );

  // אפקט מקומי בלבד (לא נשלח לאחרים) - למשל אימוג׳י של בוט שהגיע עם הודעה, שכל טלפון מציג בעצמו
  const inject = useCallback((e: { kind: 'emote'; from: string; emoji: string } | { kind: 'throw'; from: string; to: string; item: string }) => {
    add({ ...e, id: Math.random().toString(36).slice(2) } as FxEvent);
  }, [add]);

  return { events, send, inject };
}
