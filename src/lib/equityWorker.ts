// עובד ברקע: חישוב סיכויי ניצחון בלי לתקוע את המסך
import { equity } from '../engine/equity';

self.onmessage = (e: MessageEvent<{ id: number; hole: string[]; board: string[]; opp: number; it: number }>) => {
  const { id, hole, board, opp, it } = e.data;
  (self as unknown as { postMessage: (m: unknown) => void }).postMessage({ id, eq: equity(hole, board, opp, it) });
};
