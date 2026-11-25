// תמונת פרופיל: מקטינים בטלפון לריבוע קטן (כמה עשרות KB), מעלים לאחסון, ושומרים בשדה הדמות כ-"img:<מזהה>/<זמן>.jpg"
import { supabase } from './supabase';

const PHOTO = /^img:([0-9a-f-]{36}\/\d+\.(?:jpg|webp))$/;
export const isPhoto = (a?: string | null) => !!a && PHOTO.test(a);

export function photoUrl(a: string): string | null {
  const m = a.match(PHOTO);
  return m ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/game-avatars/${m[1]}` : null;
}

const SIZE = 320;

// חותכים ריבוע מהמרכז (קצת למעלה - שם בדרך כלל הפנים) ומקטינים
async function squareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(file));
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = bmp.height > bmp.width ? Math.max(0, (bmp.height - side) * 0.35) : 0;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bmp.close?.();
  return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/jpeg', 0.84));
}

// מעלה ומחזיר את הערך לשדה הדמות
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image');
  const blob = await squareJpeg(file);
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('game-avatars').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return `img:${path}`;
}
