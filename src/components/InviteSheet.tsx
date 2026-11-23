// הזמנת חברים לשולחן: התראה באפליקציה + פוש, או קישור בוואטסאפ
import { useEffect, useState } from 'react';
import { Check, Link2, MessageCircle } from 'lucide-react';
import { Avatar } from './Avatar';
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
    `בוא/י לשחק איתנו ב-King Jack\nשולחן: "${roomName}"\nקוד: ${code}\n${joinLink(code)}`,
    `Come play with us on King Jack\nTable: "${roomName}"\nCode: ${code}\n${joinLink(code)}`,
  );

  return (
    <Sheet open={open} onClose={onClose} title={tr('הזמנת חברים', 'Invite friends')}>
      <div className="invite-code">
        {tr('קוד השולחן', 'Table code')} <b translate="no">{code}</b>
      </div>
      <div className="row gap">
        <a className="btn whatsapp grow" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} /> {tr('וואטסאפ', 'WhatsApp')}
        </a>
        <button
          className="btn ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(joinLink(code));
              toast(tr('הקישור הועתק', 'Link copied'));
            } catch {
              toast(joinLink(code));
            }
          }}
        >
          <Link2 size={18} /> {tr('העתקת קישור', 'Copy link')}
        </button>
      </div>
      <h3 className="section-title">{tr('התראה לחברים מהקבוצה', 'Notify friends from the group')}</h3>
      <input className="input" placeholder={tr('חיפוש לפי שם', 'Search by name')} aria-label={tr('חיפוש חבר', 'Search friend')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="people-list">
        {list.length === 0 && <div className="empty">{tr('אין חברים נוספים רשומים עדיין', 'No other registered friends yet')}</div>}
        {list.map((p) => (
          <button key={p.id} className={`person ${sel.has(p.id) ? 'selected' : ''}`} aria-pressed={sel.has(p.id)} onClick={() => toggle(p.id)}>
            <Avatar name={p.name} emoji={p.avatar} size={32} />
            <span className="grow" dir="auto">{p.name}</span>
            <span className="check" aria-hidden="true">
              <Check size={14} strokeWidth={3} />
            </span>
          </button>
        ))}
      </div>
      <AsyncButton
        className="btn primary block big"
        disabled={sel.size === 0}
        onClick={async () => {
          const r = await gameCall<{ ok: boolean; invited: number; pushed: number }>({
            op: 'invite',
            roomId,
            userIds: [...sel],
          });
          toast(tr(`נשלחו ${r.invited} הזמנות`, `${r.invited} invites sent`), 'win');
          onClose();
        }}
      >
        {sel.size ? tr(`שליחת הזמנה ל-${sel.size}`, `Invite ${sel.size}`) : tr('בחרו חברים להזמנה', 'Pick friends to invite')}
      </AsyncButton>
    </Sheet>
  );
}
