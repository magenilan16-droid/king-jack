// הודעות קוליות בשולחן: מקליטים בטלפון (עד 15 שניות), מעלים לאחסון, וכל מי שיושב בשולחן שומע.
// הניגון עובר דרך מנוע הצלילים של השולחן (עוצמה אחת לכל הצלילים, לא קוטע מוזיקה שמתנגנת בטלפון).
// טלפון שלא מצליח לפענח את הקובץ כך - מנגן בנגן רגיל של הדפדפן.
import { useSyncExternalStore } from 'react';
import { supabase, gameCall } from './supabase';
import { voiceOut } from './sound';
import { callMicStream } from './call';
import { VOICE_MAX_S } from '../engine/room';

const BUCKET = 'game-voice';
export const voiceUrl = (path: string) => `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
export const fmtDur = (d?: number) => `0:${String(Math.min(VOICE_MAX_S, Math.max(1, Math.round(d ?? 1)))).padStart(2, '0')}`;

// ---------- מצב משותף: מה מתנגן עכשיו, והאם לנגן לבד ----------
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
};

let auto = localStorage.getItem('kj-voice-auto') !== '0';
export const voiceAuto = () => auto;
export function setVoiceAuto(v: boolean) {
  auto = v;
  localStorage.setItem('kj-voice-auto', v ? '1' : '0');
  notify();
}
export function useVoiceAuto(): [boolean, (v: boolean) => void] {
  return [useSyncExternalStore(subscribe, () => auto), setVoiceAuto];
}

let playing: string | null = null;
const setPlaying = (p: string | null) => {
  playing = p;
  notify();
};
export const useVoicePlaying = () => useSyncExternalStore(subscribe, () => playing);

// ---------- הקלטה ----------
// עדיפות ל-AAC (mp4): כל טלפון יודע לנגן אותו. אחרת Opus (webm/ogg)
const FORMATS = ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export interface Recording {
  started: number;
  stop: () => Promise<{ blob: Blob; dur: number }>;
  cancel: () => void;
}

let recordingNow = false;

export async function startRecording(): Promise<Recording> {
  stopVoice(); // שלא ייכנס למיקרופון מה שמתנגן
  // באמצע שיחה בשולחן - מקליטים מאותו מיקרופון (העתק שלו), כדי לא לסגור לשיחה את המיקרופון
  const shared = callMicStream();
  const stream = shared
    ? new MediaStream(
        shared.getAudioTracks().map((t) => {
          const c = t.clone();
          c.enabled = true;
          return c;
        }),
      )
    : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mime = FORMATS.find((m) => MediaRecorder.isTypeSupported?.(m));
  let rec: MediaRecorder;
  try {
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 48000 });
  } catch {
    rec = new MediaRecorder(stream);
  }
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const ended = new Promise<void>((res) => {
    rec.onstop = () => res();
  });
  const release = () => {
    stream.getTracks().forEach((t) => t.stop());
    recordingNow = false;
  };
  rec.start();
  recordingNow = true;
  const started = performance.now();
  return {
    started,
    async stop() {
      const dur = Math.min(VOICE_MAX_S, (performance.now() - started) / 1000);
      if (rec.state !== 'inactive') rec.stop();
      await ended;
      release();
      const type = (rec.mimeType || mime || 'audio/mp4').split(';')[0];
      return { blob: new Blob(chunks, { type }), dur };
    },
    cancel() {
      chunks.length = 0;
      if (rec.state !== 'inactive') rec.stop();
      release();
    },
  };
}

// מעלה לתיקייה של השולח ושולח לשולחן
export async function sendVoice(userId: string, roomId: string, r: { blob: Blob; dur: number }) {
  const type = r.blob.type || 'audio/mp4';
  const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : 'm4a';
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => (b % 36).toString(36)).join('');
  const path = `${userId}/${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, r.blob, { contentType: type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  cache.set(path, r.blob.arrayBuffer());
  await gameCall({ op: 'act', roomId, move: { type: 'voice', path, dur: r.dur } });
}

// ---------- ניגון ----------
const cache = new Map<string, Promise<ArrayBuffer>>();
export function prefetchVoice(path: string): Promise<ArrayBuffer> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(voiceUrl(path)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))));
    p.catch(() => cache.delete(path));
    cache.set(path, p);
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
  }
  return p;
}

const queue: string[] = [];
let src: AudioBufferSourceNode | null = null;
let el: HTMLAudioElement | null = null;
let guard: number | undefined;

function halt() {
  window.clearTimeout(guard);
  if (src) {
    src.onended = null;
    try {
      src.stop();
    } catch {
      /* כבר נגמר */
    }
    src = null;
  }
  if (el) {
    el.onended = el.onerror = null;
    el.pause();
    el = null;
  }
}

function done(path: string) {
  if (playing !== path) return;
  halt();
  const next = queue.shift();
  if (next) void start(next, false);
  else setPlaying(null);
}

// נגן רגיל של הדפדפן: כשהצלילים כבויים (ואז רק בלחיצה), או כשהמנוע לא מצליח לפענח את הקובץ
function viaElement(path: string) {
  const a = new Audio(voiceUrl(path));
  el = a;
  a.onended = a.onerror = () => done(path);
  a.play().catch(() => done(path));
}

async function start(path: string, tap: boolean) {
  halt();
  setPlaying(path);
  const o = voiceOut();
  if (!o) {
    if (tap) viaElement(path);
    else done(path);
    return;
  }
  try {
    const ab = await prefetchVoice(path);
    if (playing !== path) return;
    const buf = await new Promise<AudioBuffer>((res, rej) => o.ctx.decodeAudioData(ab.slice(0), res, rej));
    if (playing !== path) return;
    if (o.ctx.state !== 'running') throw new Error('suspended');
    const s = o.ctx.createBufferSource();
    s.buffer = buf;
    const g = o.ctx.createGain();
    g.gain.value = 1.3;
    s.connect(g).connect(o.dest);
    s.onended = () => done(path);
    src = s;
    s.start();
    // ליתר ביטחון - אם הדפדפן "נרדם" באמצע, לא נשארים תקועים במצב מנגן
    guard = window.setTimeout(() => done(path), (buf.duration + 1.5) * 1000);
  } catch {
    if (playing === path) viaElement(path);
  }
}

// לחיצה על הודעה: מנגן אותה (לחיצה נוספת עוצרת)
export function playVoice(path: string) {
  if (playing === path) return stopVoice();
  queue.length = 0;
  void start(path, true);
}

// הודעה שהגיעה עכשיו: מתנגנת לבד, בתור אחרי מה שכבר מתנגן
export function queueVoice(path: string) {
  if (recordingNow) return;
  if (playing) {
    if (playing !== path && !queue.includes(path)) queue.push(path);
  } else void start(path, false);
}

export function stopVoice() {
  queue.length = 0;
  halt();
  if (playing) setPlaying(null);
}
