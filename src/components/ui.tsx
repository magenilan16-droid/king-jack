import { useEffect, useState, type ReactNode } from 'react';
import { tr } from '../lib/i18n';

// חלון שנפתח מלמטה (כמו באפליקציות)
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-title">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={tr('סגור', 'Close')}>
              ✕
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// הודעות קופצות קצרות
type ToastItem = { id: number; text: string; kind: 'info' | 'error' | 'win' };
let pushToast: ((t: Omit<ToastItem, 'id'>) => void) | null = null;

export function toast(text: string, kind: ToastItem['kind'] = 'info') {
  pushToast?.({ text, kind });
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    pushToast = (t) => {
      const id = Date.now() + Math.random();
      setItems((old) => [...old.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((old) => old.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      pushToast = null;
    };
  }, []);
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// כפתור שמראה "טוען" בזמן פעולה ומציג שגיאה אם נכשל
export function AsyncButton({
  onClick,
  children,
  className = 'btn',
  disabled,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onClick();
        } catch (e) {
          toast((e as Error).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="spinner" /> : children}
    </button>
  );
}

export function NumberStepper({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <div className="stepper">
      <button className="step-btn" onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={() => onChange(clamp(value))}
      />
      <button className="step-btn" onClick={() => onChange(clamp(value + step))}>
        +
      </button>
    </div>
  );
}
