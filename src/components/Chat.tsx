// צ׳אט השולחן + תגובות מהירות לפי ערכת הנושא
import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../engine/room';
import type { Theme } from '../lib/themes';
import { gameCall } from '../lib/supabase';
import { Sheet, toast } from './ui';
import { useI18n } from '../lib/i18n';
import { chatName, chatText } from '../lib/display';

// onFx: הודעה של בוט שמגיעה עם אימוג׳י / זריקה
export function useChatNotifier(chat: ChatMsg[] | undefined, myId: string, open: boolean, onFx?: (m: ChatMsg) => void) {
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState<ChatMsg | null>(null);
  // null = עוד לא נטען השולחן. בטעינה הראשונה מדלגים על ההיסטוריה (גם כשהיא ריקה)
  const last = useRef<number | null>(null);
  const hideT = useRef<number | undefined>(undefined);
  const showT = useRef<number | undefined>(undefined);
  const onFxRef = useRef(onFx);
  useEffect(() => {
    onFxRef.current = onFx;
  });
  useEffect(() => {
    if (!chat) return;
    const newestAt = chat.length ? chat[chat.length - 1].at : 0;
    if (last.current === null) {
      last.current = newestAt;
      return;
    }
    const from = last.current;
    const fresh = chat.filter((m) => m.at > from);
    if (!fresh.length) return;
    last.current = newestAt;
    // מונה הודעות שלא נקראו - רק של אחרים. הבועה בשולחן - לכולם, גם להודעה שלי
    const others = fresh.filter((m) => m.id !== myId).length;
    if (!open && others) setUnread((u) => u + others);
    // הודעה של בוט יכולה לחכות (למשל עד שהלוח של אול-אין נחשף) - הבועה והאפקט מגיעים בזמן שלה
    const m = fresh[fresh.length - 1];
    const wait = Math.min(12000, Math.max(0, m.delay ?? 0));
    window.clearTimeout(showT.current);
    showT.current = window.setTimeout(() => {
      setBubble(m);
      if (m.fx) onFxRef.current?.(m);
      window.clearTimeout(hideT.current);
      hideT.current = window.setTimeout(() => setBubble(null), 4000);
    }, wait);
  }, [chat, myId, open]);
  useEffect(
    () => () => {
      window.clearTimeout(hideT.current);
      window.clearTimeout(showT.current);
    },
    [],
  );
  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);
  return { unread, bubble };
}

export function ChatSheet({
  open,
  onClose,
  chat,
  roomId,
  theme,
  myId,
}: {
  open: boolean;
  onClose: () => void;
  chat: ChatMsg[];
  roomId: string;
  theme: Theme;
  myId: string;
}) {
  const { tr, lang } = useI18n();
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: 1e6 });
  }, [chat, open]);
  const send = async (t: string) => {
    if (!t.trim()) return;
    try {
      await gameCall({ op: 'act', roomId, move: { type: 'chat', text: t } });
      setText('');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={tr('צ׳אט השולחן', 'Table chat')}>
      <div className="chat-list" ref={listRef}>
        {chat.length === 0 && <div className="empty">{tr('עוד אין הודעות. אפשר להתחיל לעקוץ.', 'No messages yet. Start the trash talk.')}</div>}
        {chat.map((m, i) => (
          <div key={i} className={`chat-msg ${m.id === myId ? 'mine' : ''}`}>
            {m.id !== myId && <b dir="auto">{chatName(m, lang)}</b>}
            <span dir="auto">{chatText(m, lang)}</span>
          </div>
        ))}
      </div>
      <div className="quick-chat">
        {theme.quickChat.map((q) => (
          <button
            key={q}
            className="chip-btn"
            onClick={() => {
              // הודעה מהירה: שולחים וסוגרים, כדי לראות את הבועה בשולחן
              send(q);
              onClose();
            }}
          >
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('הודעה לשולחן', 'Message the table')} aria-label={tr('הודעה', 'Message')} maxLength={120} />
        <button className="btn primary" type="submit">
          {tr('שלח', 'Send')}
        </button>
      </form>
    </Sheet>
  );
}
