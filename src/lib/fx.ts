// אינטראקציות בין חברים בזמן אמת: זריקת חפצים, אימוג׳י מעל הראש וזירוז
// עובר בערוץ שידור מהיר (לא נשמר בשרת המשחק)
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { sfx } from './sound';
import { vibrate } from './prefs';

export type FxEvent =
  | { kind: 'throw'; id: string; from: string; to: string; item: string }
  | { kind: 'emote'; id: string; from: string; emoji: string }
  | { kind: 'nudge'; id: string; from: string; to: string };

type FxInput = { kind: 'throw'; to: string; item: string } | { kind: 'emote'; emoji: string } | { kind: 'nudge'; to: string };

export const THROWABLES = ['🍅', '🍺', '🌹', '💩', '🥚', '🔥', '💋', '🎂', '💸', '🧻'];
export const EMOTES = ['😂', '😎', '🤯', '😭', '🤑', '🙏', '👏', '🔥', '🤡', '😴', '🫡', '🥶'];

export function useRoomFx(roomId: string, myId: string) {
  const [events, setEvents] = useState<FxEvent[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);

  const add = useCallback(
    (e: FxEvent) => {
      setEvents((old) => [...old.slice(-15), e]);
      setTimeout(() => setEvents((old) => old.filter((x) => x.id !== e.id)), 2800);
      if (e.kind === 'throw') {
        sfx.whoosh();
        setTimeout(() => sfx.splat(), 650);
        if (e.to === myId) setTimeout(() => vibrate(60), 650);
      } else if (e.kind === 'emote') sfx.pop();
      else if (e.kind === 'nudge' && e.to === myId) {
        sfx.nudge();
        vibrate([80, 60, 80, 60, 80]);
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

  return { events, send };
}
