// שולח את החישוב לעובד הרקע (ואם אין תמיכה - מחשב כאן, בפחות סימולציות)
import { equity } from '../engine/equity';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (v: number) => void>();

export function equityAsync(hole: string[], board: string[], opp: number, it = 2000): Promise<number> {
  try {
    if (!worker) {
      worker = new Worker(new URL('./equityWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; eq: number }>) => {
        pending.get(e.data.id)?.(e.data.eq);
        pending.delete(e.data.id);
      };
    }
    const id = ++seq;
    return new Promise((res) => {
      pending.set(id, res);
      worker!.postMessage({ id, hole, board, opp, it });
    });
  } catch {
    return Promise.resolve(equity(hole, board, opp, Math.min(it, 500)));
  }
}
