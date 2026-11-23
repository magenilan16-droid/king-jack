import { useEffect, useRef, useState } from 'react';
import { gameCall } from '../lib/supabase';
import { sfx } from '../lib/sound';

// מציג כמה זמן נשאר לתור, וכשהזמן נגמר מבקש מהשרת לדלג
export function Timer({ deadline, roomId, mine = false }: { deadline: number | null; roomId: string; mine?: boolean }) {
  const [now, setNow] = useState(Date.now());
  const sent = useRef<number | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!deadline) return;
    if (now > deadline + 1500 && sent.current !== deadline) {
      sent.current = deadline;
      gameCall({ op: 'act', roomId, move: { type: 'timeout' } }).catch(() => {});
    }
  }, [now, deadline, roomId]);
  const leftNow = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 99;
  const lastTick = useRef(-1);
  useEffect(() => {
    if (mine && leftNow <= 5 && leftNow > 0 && lastTick.current !== leftNow) {
      lastTick.current = leftNow;
      sfx.tick();
    }
  }, [mine, leftNow]);
  if (!deadline) return null;
  const left = leftNow;
  return <span className={`timer ${left <= 10 ? 'urgent' : ''}`}>⏱ {left}</span>;
}
