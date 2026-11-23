// ערימת ז׳טונים אמיתית: צבע לפי ערך, גובה לפי הסכום
const DENOMS: { v: number; c: string; e: string }[] = [
  { v: 1000, c: '#f5c542', e: '#8a6400' },
  { v: 500, c: '#8e44ad', e: '#4a1f5e' },
  { v: 100, c: '#1f1f1f', e: '#000' },
  { v: 25, c: '#1e8f4e', e: '#0b4d28' },
  { v: 5, c: '#d42a3a', e: '#7a0f19' },
  { v: 1, c: '#e9ecef', e: '#8d959c' },
];

// מפרק סכום לז׳טונים (עד 6 בערימה - רק לתצוגה)
function breakdown(amount: number, unit: number): string[] {
  const out: string[] = [];
  let left = Math.max(0, Math.round(amount / Math.max(1, unit)));
  for (const d of DENOMS) {
    while (left >= d.v && out.length < 6) {
      out.push(d.c + '|' + d.e);
      left -= d.v;
    }
  }
  if (!out.length && amount > 0) out.push(DENOMS[5].c + '|' + DENOMS[5].e);
  return out;
}

export function ChipStack({ amount, unit = 1, size = 18, label = true }: { amount: number; unit?: number; size?: number; label?: boolean }) {
  const chips = breakdown(amount, unit);
  return (
    <span className="chipstack">
      <span className="chipstack-pile" style={{ width: size, height: size + (chips.length - 1) * 3 }}>
        {chips.map((c, i) => {
          const [col, edge] = c.split('|');
          return (
            <span
              key={i}
              className="chip-disc"
              style={{
                width: size,
                height: size,
                bottom: i * 3,
                background: `radial-gradient(circle, ${col} 0 33%, rgba(255,255,255,.85) 34% 39%, ${col} 40% 58%, transparent 59%), repeating-conic-gradient(#fff 0 20deg, ${col} 20deg 60deg)`,
                boxShadow: `0 1px 0 ${edge}, 0 2px 3px rgba(0,0,0,.45)`,
              }}
            />
          );
        })}
      </span>
      {label && <span className="chipstack-amt">{amount.toLocaleString()}</span>}
    </span>
  );
}
