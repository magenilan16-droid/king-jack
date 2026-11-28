// לוח הצלילים של החבורה: כל חבר מקליט קטעים קצרים (עד 5 שניות) עם שם - "סבתא של תמיר!" וכאלה.
// לחיצה בשולחן משמיעה את הקטע לכל מי שיושב (דרך ערוץ האפקטים), עם בועה מעל מי שלחץ.
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { voiceOut, isMuted } from './sound';
import { voiceUrl, prefetchVoice } from './voice';

export const CLIP_MAX_S = 5;
export const CLIPS_PER_USER = 12;
export type Clip = { id: string; owner: string; label: string; path: string; dur: number };

// רק קבצים מהתיקייה של מישהו בדלי ההקלטות (הערוץ פתוח - לא מנגנים כתובות אחרות)
export const clipPathOk = (path: unknown): path is string =>
  typeof path === 'string' && /^[0-9a-f-]{36}\/\d{10,14}-[a-z0-9]{6,12}\.(?:webm|m4a|ogg)$/.test(path);

// ---------- הרשימה ----------
let clips: Clip[] | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

export function loadClips(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    const { data } = await supabase.from('game_sounds').select('id, owner, label, path, dur').order('created_at', { ascending: true }).limit(200);
    clips = (data as Clip[] | null) ?? [];
    notify();
    // מורידים מראש כדי שהלחיצה תישמע מיד
    for (const c of clips.slice(-40)) void prefetchVoice(c.path).catch(() => {});
  })().catch(() => {
    loading = null;
  });
  return loading;
}
export const useClips = () => useSyncExternalStore(subscribe, () => clips);

export async function saveClip(userId: string, label: string, r: { blob: Blob; dur: number }) {
  const type = r.blob.type || 'audio/mp4';
  const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : 'm4a';
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');
  const path = `${userId}/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from('game-voice').upload(path, r.blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  const dur = Math.round(Math.min(CLIP_MAX_S, Math.max(0.3, r.dur)) * 10) / 10;
  const { data, error: e2 } = await supabase.from('game_sounds').insert({ owner: userId, label: label.trim().slice(0, 24), path, dur }).select('id, owner, label, path, dur').single();
  if (e2) throw new Error(e2.message.includes('12') ? 'עד 12 צלילים לכל אחד' : e2.message);
  buffers.set(path, r.blob.arrayBuffer());
  clips = [...(clips ?? []).filter((c) => c.id !== (data as Clip).id), data as Clip];
  notify();
}

export async function deleteClip(id: string) {
  const { error } = await supabase.from('game_sounds').delete().eq('id', id);
  if (error) throw error;
  clips = (clips ?? []).filter((c) => c.id !== id);
  notify();
}

// ---------- ניגון ----------
// מנגנים מיד (בלי תור), דרך שרשרת הצלילים של השולחן. עד 3 קטעים בבת אחת
const buffers = new Map<string, Promise<ArrayBuffer>>();
const decoded = new Map<string, AudioBuffer>();
let live = 0;

export async function playClip(path: string) {
  if (!clipPathOk(path) || isMuted() || live >= 3) return;
  const o = voiceOut();
  live++;
  try {
    if (!o || o.ctx.state !== 'running') throw new Error('no ctx');
    let buf = decoded.get(path);
    if (!buf) {
      const ab = await (buffers.get(path) ?? prefetchVoice(path));
      buf = await new Promise<AudioBuffer>((res, rej) => o.ctx.decodeAudioData(ab.slice(0), res, rej));
      decoded.set(path, buf);
      if (decoded.size > 60) decoded.delete(decoded.keys().next().value!);
    }
    const s = o.ctx.createBufferSource();
    s.buffer = buf;
    const g = o.ctx.createGain();
    g.gain.value = 1.25;
    s.connect(g).connect(o.dest);
    await new Promise<void>((res) => {
      s.onended = () => res();
      s.start();
      window.setTimeout(res, (buf!.duration + 1) * 1000);
    });
  } catch {
    // טלפון שלא מצליח לפענח - נגן רגיל
    await new Promise<void>((res) => {
      const a = new Audio(voiceUrl(path));
      a.onended = a.onerror = () => res();
      a.play().catch(() => res());
      window.setTimeout(res, (CLIP_MAX_S + 1) * 1000);
    });
  } finally {
    live--;
  }
}
