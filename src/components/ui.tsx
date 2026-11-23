import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const last = useRef<{ title?: string; children: ReactNode; footer?: ReactNode; className: string }>({ title, children, footer, className });
  if (open) last.current = { title, children, footer, className };

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, 210);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape סוגר את החלון
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted && !open) return null;
  const v = last.current;
  return (
    <div className={`sheet-backdrop ${closing ? 'closing' : ''}`} onClick={onClose}>
      <div className={`sheet ${v.footer ? 'has-foot' : ''} ${v.className}`} role="dialog" aria-modal="true" aria-label={v.title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {v.title && (
          <div className="sheet-title">
            <h2 dir="auto">{v.title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label={tr('סגירה', 'Close')}>
              <X size={20} />
            </button>
          </div>
        )}
        <div className="sheet-body">{v.children}</div>
        {v.footer && <div className="sheet-foot">{v.footer}</div>}
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
      className={`${className} ${busy ? 'is-busy' : ''}`}
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
      {children}
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
