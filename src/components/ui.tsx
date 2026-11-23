import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { tr } from '../lib/i18n';

// חלון שנפתח מלמטה (כמו באפליקציות)
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  className = '',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  // Escape סוגר את החלון
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${footer ? 'has-foot' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {title && (
          <div className="sheet-title">
            <h2 dir="auto">{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={tr('סגירה', 'Close')}>
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
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
  label,
}: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      aria-label={label}
      aria-busy={busy || undefined}
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
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max?: number;
  label?: string;
}) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <div className="stepper">
      <button type="button" className="step-btn" onClick={() => onChange(clamp(value - step))} aria-label={tr('פחות', 'Less')} disabled={value <= min}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={() => onChange(clamp(value))}
      />
      <button type="button" className="step-btn" onClick={() => onChange(clamp(value + step))} aria-label={tr('יותר', 'More')} disabled={max != null && value >= max}>
        +
      </button>
    </div>
  );
}
