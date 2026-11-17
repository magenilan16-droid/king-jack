import { useEffect, useRef, useState } from 'react';
import { gameCall } from '../lib/supabase';

// מציג כמה זמן נשאר לתור, וכשהזמן נגמר מבקש מהשרת לדלג
export function Timer({ deadline, roomId }: { deadline: number | null; roomId: string }) {
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
  if (!deadline) return null;
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className={`timer ${left <= 10 ? 'urgent' : ''}`}>⏱ {left}</span>;
}
