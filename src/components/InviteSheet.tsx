// הזמנת חברים לשולחן: התראה באפליקציה + פוש, או קישור בוואטסאפ
import { useEffect, useState } from 'react';
import { supabase, gameCall, type Profile } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { Sheet, AsyncButton, toast } from './ui';

export function joinLink(code: string) {
  return `${location.origin}${location.pathname}?join=${code}`;
}

export function InviteSheet({
  open,
  onClose,
  roomId,
  code,
  roomName,
  seatedIds,
  myId,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string;
  code: string;
  roomName: string;
  seatedIds: string[];
  myId: string;
}) {
  const { tr } = useI18n();
  const [people, setPeople] = useState<Profile[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setSel(new Set());
    supabase
      .from('game_profiles')
      .select('*')
      .order('name')
      .then(({ data }) => setPeople((data ?? []) as Profile[]));
  }, [open]);
  const list = people.filter((p) => p.id !== myId && !seatedIds.includes(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) =>
    setSel((old) => {
      const n = new Set(old);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const waText = tr(
    `בוא/י לשחק איתנו ב-King Jack 👑\nשולחן: "${roomName}"\nקוד: ${code}\n${joinLink(code)}`,
    `Come play with us on King Jack 👑\nTable: "${roomName}"\nCode: ${code}\n${joinLink(code)}`,
  );

  return (
    <Sheet open={open} onClose={onClose} title={tr('📣 הזמנת חברים', '📣 Invite friends')}>
      <div className="invite-code">
        {tr('קוד השולחן:', 'Table code:')} <b>{code}</b>
      </div>
      <div className="row gap">
        <a className="btn whatsapp grow" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer">
          {tr('שליחה בוואטסאפ 💬', 'Send on WhatsApp 💬')}
        </a>
        <button
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(joinLink(code));
              toast(tr('הקישור הועתק ✔', 'Link copied ✔'));
            } catch {
              toast(joinLink(code));
            }
          }}
        >
          {tr('העתק קישור', 'Copy link')}
        </button>
      </div>
      <h3 className="section-title">{tr('או שלחו התראה לחברים רשומים 🔔', 'Or notify registered friends 🔔')}</h3>
      <input className="input" placeholder={tr('חיפוש שם...', 'Search name...')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="people-list">
        {list.length === 0 && <div className="empty">{tr('אין חברים נוספים רשומים עדיין', 'No other registered friends yet')}</div>}
        {list.map((p) => (
          <button key={p.id} className={`person ${sel.has(p.id) ? 'selected' : ''}`} onClick={() => toggle(p.id)}>
            <span className="avatar">{p.avatar}</span>
            <span className="grow">{p.name}</span>
            <span className="check">{sel.has(p.id) ? '✔' : ''}</span>
          </button>
        ))}
      </div>
      <AsyncButton
        className="btn primary block"
        disabled={sel.size === 0}
        onClick={async () => {
          const r = await gameCall<{ ok: boolean; invited: number; pushed: number }>({
            op: 'invite',
            roomId,
            userIds: [...sel],
          });
          toast(tr(`נשלחו ${r.invited} הזמנות 🔔`, `${r.invited} invites sent 🔔`), 'win');
          onClose();
        }}
      >
        {tr(`שליחת הזמנה (${sel.size})`, `Send invite (${sel.size})`)}
      </AsyncButton>
    </Sheet>
  );
}
