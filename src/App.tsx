import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, fetchProfile, type Profile } from './lib/supabase';
import { useThemePref, useTipsPref, vibrate } from './lib/prefs';
import { refreshPushIfGranted } from './lib/push';
import { useI18n } from './lib/i18n';
import { Toaster, Sheet, toast } from './components/ui';
import { Login } from './screens/Login';
import { Lobby } from './screens/Lobby';
import { Table } from './screens/Table';
import { Stats } from './screens/Stats';
import { Install } from './screens/Install';

type Route = { name: 'lobby' } | { name: 'table'; roomId: string } | { name: 'stats' } | { name: 'install' };

interface Invite {
  id: number;
  room_id: string;
  from_user: string;
  fromName: string;
  fromAvatar: string;
  roomName: string;
  code: string;
}

function readJoinParam(url: string): string | null {
  try {
    return new URL(url).searchParams.get('join');
  } catch {
    return null;
  }
}

export default function App() {
  const { tr } = useI18n();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'lobby' });
  const [pendingJoin, setPendingJoin] = useState<string | null>(() => readJoinParam(location.href));
  const [invite, setInvite] = useState<Invite | null>(null);
  const { theme, setTheme } = useThemePref();
  const [tipsOn, setTipsOn] = useTipsPref();

  // מנקים את ?join מהכתובת אחרי שקראנו אותו
  useEffect(() => {
    if (readJoinParam(location.href)) history.replaceState(null, '', location.pathname);
  }, []);

  // התחברות
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async () => {
    if (!session?.user) return setProfile(null);
    setProfile(await fetchProfile(session.user.id));
  }, [session?.user]);

  useEffect(() => {
    loadProfile();
    if (session?.user) refreshPushIfGranted();
  }, [session?.user, loadProfile]);

  // לחיצה על התראה כשהאפליקציה כבר פתוחה
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'open-url') {
        const code = readJoinParam(e.data.url);
        if (code) {
          setPendingJoin(code);
          setRoute({ name: 'lobby' });
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, []);

  // הזמנות בזמן אמת
  const showInvite = useCallback(async (row: { id: number; room_id: string; from_user: string }) => {
    const [r, p] = await Promise.all([
      supabase.from('game_rooms').select('name, code, status').eq('id', row.room_id).single(),
      supabase.from('game_profiles').select('name, avatar').eq('id', row.from_user).single(),
    ]);
    if (!r.data || r.data.status !== 'open') return;
    vibrate([100, 50, 100, 50, 200]);
    setInvite({
      ...row,
      roomName: r.data.name,
      code: r.data.code,
      fromName: p.data?.name ?? '?',
      fromAvatar: p.data?.avatar ?? '🙂',
    });
  }, []);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    // הזמנה אחרונה שלא נראתה (מהשעתיים האחרונות)
    supabase
      .from('game_invites')
      .select('id, room_id, from_user, created_at')
      .eq('to_user', uid)
      .eq('seen', false)
      .gte('created_at', new Date(Date.now() - 2 * 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data?.[0] && !readJoinParam(location.href)) showInvite(data[0]);
      });
    const ch = supabase
      .channel('invites-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_invites', filter: `to_user=eq.${uid}` }, (pl) =>
        showInvite(pl.new as { id: number; room_id: string; from_user: string }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [session?.user?.id, showInvite]);

  const markSeen = async (id: number) => {
    await supabase.from('game_invites').update({ seen: true }).eq('id', id);
  };

  if (session === undefined) {
    return (
      <div className="screen center">
        <span className="spinner big" />
      </div>
    );
  }

  let screen: React.ReactNode;
  if (route.name === 'install') {
    screen = <Install onBack={() => setRoute({ name: 'lobby' })} />;
  } else if (!session) {
    screen = <Login onInstall={() => setRoute({ name: 'install' })} />;
  } else if (!profile) {
    screen = (
      <div className="screen center">
        <span className="spinner big" />
      </div>
    );
  } else if (route.name === 'table') {
    screen = (
      <Table
        key={route.roomId}
        roomId={route.roomId}
        profile={profile}
        theme={theme}
        setTheme={setTheme}
        tipsOn={tipsOn}
        setTipsOn={setTipsOn}
        onExit={() => setRoute({ name: 'lobby' })}
      />
    );
  } else if (route.name === 'stats') {
    screen = <Stats profile={profile} onBack={() => setRoute({ name: 'lobby' })} />;
  } else {
    screen = (
      <Lobby
        profile={profile}
        theme={theme}
        setTheme={setTheme}
        tipsOn={tipsOn}
        setTipsOn={setTipsOn}
        openTable={(roomId) => setRoute({ name: 'table', roomId })}
        onStats={() => setRoute({ name: 'stats' })}
        onInstall={() => setRoute({ name: 'install' })}
        pendingJoin={pendingJoin}
        clearPendingJoin={() => setPendingJoin(null)}
        onProfileChange={loadProfile}
      />
    );
  }

  return (
    <>
      {screen}
      <Sheet open={!!invite} onClose={() => invite && (markSeen(invite.id), setInvite(null))} title={tr('🔔 הזמנה למשחק!', '🔔 Game invite!')}>
        {invite && (
          <div className="invite-pop">
            <div className="big-avatar">{invite.fromAvatar}</div>
            <p>
              <b>{invite.fromName}</b> {tr('מזמין/ה אותך לשבת ב:', 'invites you to join:')}
              <br />
              <b>"{invite.roomName}"</b>
            </p>
            <div className="btn-grid two">
              <button
                className="btn ghost"
                onClick={() => {
                  markSeen(invite.id);
                  setInvite(null);
                }}
              >
                {tr('לא עכשיו', 'Not now')}
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  markSeen(invite.id);
                  setInvite(null);
                  if (route.name === 'table' && route.roomId === invite.room_id) return;
                  setPendingJoin(invite.code);
                  setRoute({ name: 'lobby' });
                  toast(tr('יאללה! 🃏', "Let's go! 🃏"));
                }}
              >
                {tr('בואו נשחק! 🃏', "Let's play! 🃏")}
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <Toaster />
    </>
  );
}
