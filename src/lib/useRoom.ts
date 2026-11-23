// מאזין לשולחן בזמן אמת: מצב ציבורי, הקלפים הפרטיים שלי ויומן הכספים
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import type { BJState } from '../engine/blackjack';
import type { HState } from '../engine/holdem';
import type { ChatMsg } from '../engine/room';
import type { Card } from '../engine/cards';

export type RoomState = (BJState | HState) & { chat?: ChatMsg[] };

export interface RoomRow {
  id: string;
  code: string;
  name: string;
  game_type: 'blackjack' | 'holdem';
  status: 'open' | 'closed';
  money_mode: 'real' | 'demo';
  state: RoomState;
  version: number;
}

export interface LedgerRow {
  id: number;
  user_id: string | null;
  bot_name: string | null;
  kind: 'buyin' | 'cashout';
  amount: number;
}

export function useRoom(roomId: string, myId: string) {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [hole, setHole] = useState<Card[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [connected, setConnected] = useState(true);

  const refresh = useCallback(async () => {
    const [r, p, l] = await Promise.all([
      supabase.from('game_rooms').select('id, code, name, game_type, status, money_mode, state, version').eq('id', roomId).single(),
      supabase.from('game_private').select('data').eq('room_id', roomId).eq('user_id', myId).maybeSingle(),
      supabase.from('game_ledger').select('id, user_id, bot_name, kind, amount').eq('room_id', roomId).order('id'),
    ]);
    if (r.data) setRoom((old) => (old && old.version > r.data.version ? old : (r.data as RoomRow)));
    setHole(((p.data?.data as { hole?: Card[] })?.hole) ?? []);
    if (l.data) setLedger(l.data as LedgerRow[]);
  }, [roomId, myId]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel('room-' + roomId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (pl) => {
        const row = pl.new as RoomRow;
        setRoom((old) => (old && old.version >= row.version ? old : row));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_private', filter: `room_id=eq.${roomId}` }, (pl) => {
        const row = pl.new as { user_id: string; data: { hole?: Card[] } };
        if (row.user_id === myId) setHole(row.data?.hole ?? []);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_ledger', filter: `room_id=eq.${roomId}` }, (pl) => {
        setLedger((old) => (old.some((x) => x.id === (pl.new as LedgerRow).id) ? old : [...old, pl.new as LedgerRow]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnected(false);
      });
    const onOnline = () => {
      setConnected(true);
      refresh();
    };
    const onOffline = () => setConnected(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // נוכחות: מודיעים לשרת שאני מסתכל על השולחן (כדי לא לקבל התראת "התור שלך" סתם)
    const beat = () => {
      if (document.visibilityState === 'visible') supabase.rpc('game_heartbeat', { p_room: roomId }).then(() => {});
    };
    beat();
    const hb = setInterval(beat, 15000);
    // גיבוי - רענון כל 8 שניות למקרה שהחיבור נפל
    const t = setInterval(refresh, 8000);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        refresh();
        beat();
      } else supabase.rpc('game_heartbeat', { p_room: null }).then(() => {});
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      clearInterval(hb);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      supabase.rpc('game_heartbeat', { p_room: null }).then(() => {});
      document.removeEventListener('visibilitychange', onVis);
      supabase.removeChannel(ch);
    };
  }, [roomId, myId, refresh]);

  return { room, hole, ledger, refresh, connected };
}
