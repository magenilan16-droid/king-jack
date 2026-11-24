// גיבוי לבוטים: השרת מפעיל אותם בעצמו אחרי זמן המחשבה. אם משהו נתקע בדרך (רשת, שרת שנפל באמצע) -
// הטלפון של מי שיושב בשולחן מבקש מהשרת להמשיך. השרת בודק שהבוט סיים "לחשוב", אז זה לא מזרז אותו
import { useEffect } from 'react';
import { gameCall } from './supabase';

export function useBotKick(roomId: string, botTurnKey: string | null, seated: boolean, isHost: boolean) {
  useEffect(() => {
    if (!botTurnKey || !seated) return;
    let iv: ReturnType<typeof setInterval> | undefined;
    const kick = () => gameCall({ op: 'act', roomId, move: { type: 'bot' } }).catch(() => {});
    const t = setTimeout(
      () => {
        kick();
        iv = setInterval(kick, 4000);
      },
      isHost ? 10000 : 13000 + Math.random() * 2000,
    );
    return () => {
      clearTimeout(t);
      if (iv) clearInterval(iv);
    };
  }, [roomId, botTurnKey, seated, isHost]);
}
