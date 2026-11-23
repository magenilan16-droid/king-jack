// פס זמן לתור: מתרוקן, הופך לאדום בסוף, מתקתק ב-5 השניות האחרונות שלי,
// וכשהזמן נגמר מבקש מהשרת לדלג (כל מכשיר בשולחן יכול לבקש - השרת מוודא)
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { gameCall } from '../lib/supabase';
import { sfx } from '../lib/sound';

// טבעת זמן סביב השחקן שבתור
export function TurnRing({ deadline, total }: { deadline: number; total: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const frac = Math.max(0, Math.min(1, (deadline - now) / total));
  return <span className={`turn-ring ${frac < 0.25 ? 'urgent' : ''}`} style={{ '--p': frac } as CSSProperties} />;
}

export function TurnBar({
  deadline,
  total,
  roomId,
  mine = false,
  expireMove = 'timeout',
}: {
  deadline: number | null;
  total: number;
  roomId: string;
  mine?: boolean;
  expireMove?: 'timeout' | 'deal';
}) {
  const [now, setNow] = useState(Date.now());
  const lastTry = useRef(0);
  const lastTick = useRef(-1);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const secs = Math.ceil(left / 1000);
  useEffect(() => {
    if (!deadline) return;
    // הזמן נגמר: מבקשים מהשרת להתקדם. אם הבקשה נכשלה (רשת, עומס, שעון לא מסונכרן) - מנסים שוב כל 3 שניות
    if (now > deadline + 1500 && now - lastTry.current > 3000) {
      lastTry.current = now;
      gameCall({ op: 'act', roomId, move: { type: expireMove } }).catch(() => {});
    }
    if (mine && secs <= 5 && secs > 0 && lastTick.current !== secs) {
      lastTick.current = secs;
      sfx.tick();
    }
  }, [now, deadline, roomId, mine, secs, expireMove]);
  if (!deadline) return null;
  const frac = Math.max(0, Math.min(1, left / total));
  return (
    <div className={`turnbar ${frac < 0.25 ? 'low' : ''}`} aria-label={`${secs}s`}>
      <span className="turnbar-fill" style={{ transform: `scaleX(${frac})` }} />
      <span className="turnbar-secs">{secs}</span>
    </div>
  );
}
