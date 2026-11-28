// דצמבר - החודש של הועד: זמן להתראות עם החבר'ה.
// ח״י בדצמבר (18.12) - היום שבו נפל רותם לוי, ג׳ינג׳י, ב-2023. החבורה הפכה את התאריך לחי בדצמבר.
// באותו ערב פותחים את "השולחן של ג׳ינג׳י", ומי שמסיים הכי גבוה לוקח את גביע ח״י בדצמבר עד השנה הבאה.
import { supabase } from './supabase';

export const GINGER_TABLE = 'השולחן של ג׳ינג׳י';
export const isDecember = (d = new Date()) => d.getMonth() === 11;
// הערב של ה-18 נמשך עד הצהריים של ה-19
export const isHaiNight = (d = new Date()) => d.getMonth() === 11 && (d.getDate() === 18 || (d.getDate() === 19 && d.getHours() < 12));
export const isGingerTable = (name?: string | null) => !!name && /ג['׳’]ינג['׳’]י/.test(name);

// לאיזה "ח״י בדצמבר" שייך שולחן שנסגר בזמן הזה (או null אם לא באותו ערב)
function haiYear(closedAt: string): number | null {
  const d = new Date(closedAt);
  return isHaiNight(d) ? d.getFullYear() : null;
}

export type HaiCup = { year: number; userId: string; name: string; avatar: string; net: number };

// מחזיק הגביע הנוכחי: מי שסיים בפלוס הכי גדול בשולחנות של ג׳ינג׳י בח״י בדצמבר האחרון. נשאר שלו עד ח״י בדצמבר הבא
let cache: { at: number; cup: HaiCup | null } | null = null;
export async function currentHaiCup(): Promise<HaiCup | null> {
  if (cache && Date.now() - cache.at < 5 * 60000) return cache.cup;
  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const { data } = await supabase
    .from('game_results')
    .select('room_name, closed_at, user_id, name, avatar, net')
    .gte('closed_at', since)
    .ilike('room_name', '%ינג%');
  const byYear = new Map<number, Map<string, HaiCup>>();
  for (const r of (data ?? []) as { room_name: string; closed_at: string; user_id: string; name: string; avatar: string; net: number }[]) {
    if (!isGingerTable(r.room_name) || !r.user_id) continue;
    const y = haiYear(r.closed_at);
    if (y == null) continue;
    const m = byYear.get(y) ?? new Map<string, HaiCup>();
    const e = m.get(r.user_id) ?? { year: y, userId: r.user_id, name: r.name, avatar: r.avatar, net: 0 };
    e.net += Number(r.net);
    m.set(r.user_id, e);
    byYear.set(y, m);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  let cup: HaiCup | null = null;
  for (const y of years) {
    const best = [...byYear.get(y)!.values()].sort((a, b) => b.net - a.net)[0];
    if (best && best.net > 0) {
      cup = best;
      break;
    }
  }
  // הגביע נשאר אצל הזוכה האחרון עד שיש זוכה חדש בח״י בדצמבר הבא
  cache = { at: Date.now(), cup };
  return cup;
}
