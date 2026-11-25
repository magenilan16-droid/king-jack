// עיגול שחקן: צבע קבוע לפי השם + אות ראשונה, והאימוג׳י שבחר כתג קטן - או תמונת פרופיל אמיתית
import { useState } from 'react';
import { isPhoto, photoUrl } from '../lib/photo';

const PALETTE = [
  ['#5b8cff', '#2b4bb8'],
  ['#ff7a59', '#c0391b'],
  ['#2ec4a6', '#13806b'],
  ['#c77dff', '#7b2cbf'],
  ['#ffb627', '#c07a00'],
  ['#ef476f', '#a4133c'],
  ['#4cc9f0', '#1b78a8'],
  ['#8ac926', '#4f7d0f'],
  ['#f15bb5', '#a1176d'],
  ['#9b8cff', '#5240c9'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({
  name,
  emoji,
  size = 44,
  bot = false,
  className = '',
}: {
  name: string;
  emoji?: string;
  size?: number;
  bot?: boolean;
  className?: string;
}) {
  const [c1, c2] = PALETTE[hash(name) % PALETTE.length];
  const [broken, setBroken] = useState<string | null>(null);
  const url = !bot && emoji && broken !== emoji ? photoUrl(emoji) : null;
  if (url)
    return (
      <span className={`av-circle av-photo ${className}`} style={{ width: size, height: size }} aria-hidden="true">
        <img src={url} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} onError={() => setBroken(emoji!)} />
      </span>
    );
  return (
    <span
      className={`av-circle ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(145deg, ${c1}, ${c2})` }}
      aria-hidden="true"
    >
      <span className="av-initials">{bot ? '🤖' : initials(name)}</span>
      {emoji && !bot && !isPhoto(emoji) && (
        <span className="av-badge" style={{ fontSize: Math.max(11, size * 0.3) }}>
          {emoji}
        </span>
      )}
    </span>
  );
}
