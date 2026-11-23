// צ׳אט השולחן + תגובות מהירות לפי ערכת הנושא
import { useEffect, useRef, useState } from 'react';
import type { ChatMsg } from '../engine/room';
import type { Theme } from '../lib/themes';
import { gameCall } from '../lib/supabase';
import { Sheet, toast } from './ui';
import { useI18n } from '../lib/i18n';

export function useChatNotifier(chat: ChatMsg[] | undefined, myId: string, open: boolean) {
  const [unread, setUnread] = useState(0);
  const [bubble, setBubble] = useState<ChatMsg | null>(null);
  const last = useRef<number>(0);
  useEffect(() => {
    if (!chat?.length) return;
    const newest = chat[chat.length - 1];
    if (last.current === 0) {
      last.current = newest.at;
      return;
    }
    const fresh = chat.filter((m) => m.at > last.current && m.id !== myId);
    last.current = newest.at;
    if (!fresh.length) return;
    if (!open) setUnread((u) => u + fresh.length);
    setBubble(fresh[fresh.length - 1]);
    const t = setTimeout(() => setBubble(null), 3500);
    return () => clearTimeout(t);
  }, [chat, myId, open]);
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
  const { tr } = useI18n();
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
            {m.id !== myId && <b>{m.name}</b>}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
      <div className="quick-chat">
        {theme.quickChat.map((q) => (
          <button key={q} className="chip-btn" onClick={() => send(q)}>
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
