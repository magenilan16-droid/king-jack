import { createClient } from '@supabase/supabase-js';

// מסד הנתונים יושב בטוקיו - מריצים את השרת לידו כדי שכל מהלך יהיה מהיר
// (דרך פרמטר בכתובת, כדי לא להוסיף כותרת שהדפדפן חוסם)
const fn = (name: string) => `${name}?forceFunctionRegion=ap-northeast-1`;
import { sha256Hex } from './sha256';
import { tr, translateError } from './i18n';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  is_admin: boolean;
  is_premium: boolean;
}

// השם הופך לכתובת מייל פנימית (אף אחד לא רואה אותה)
async function emailFor(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ').toLowerCase();
  return `u${sha256Hex(clean).slice(0, 24)}@players.vaad.game`;
}

export async function login(name: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: await emailFor(name),
    password: `vaad::${password}`,
  });
  if (error) throw new Error(tr('שם או סיסמה שגויים', 'Wrong name or password'));
}

export async function register(name: string, password: string, avatar: string) {
  const { data, error } = await supabase.functions.invoke(fn('register'), { body: { name, password, avatar } });
  if (error) throw new Error(await errorText(error));
  if (data?.error) throw new Error(translateError(data.error));
  await login(name, password);
}

async function errorText(error: unknown): Promise<string> {
  try {
    const ctx = (error as { context?: Response }).context;
    if (ctx) {
      const j = await ctx.json();
      if (j?.error) return translateError(j.error);
    }
  } catch {
    /* ignore */
  }
  return tr('בעיית תקשורת - נסו שוב', 'Connection problem - please try again');
}

// מאמן ה-AI (פרימיום)
export async function coachCall(body: Record<string, unknown>): Promise<{ tip: string }> {
  const { data, error } = await supabase.functions.invoke(fn('coach'), { body });
  if (error) throw new Error(await errorText(error));
  return data as { tip: string };
}

// שליחת פעולה לשרת המשחק
export async function gameCall<T = { ok: boolean; roomId: string; code?: string }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn('game'), { body });
  if (error) throw new Error(await errorText(error));
  return data as T;
}

export async function fetchProfile(id: string): Promise<Profile | null> {
  const { data } = await supabase.from('game_profiles').select('*').eq('id', id).maybeSingle();
  return data as Profile | null;
}
