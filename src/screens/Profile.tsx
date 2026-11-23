// מסך פרופיל והגדרות
import { Bell, BellRing, Download, Lightbulb, LogOut, Shield, Volume2, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase, type Profile as P } from '../lib/supabase';
import { allThemes, AVATARS, type Theme, type ThemeId } from '../lib/themes';
import { isIOS, isStandalone } from '../lib/platform';
import { usePushSetup, sendTestPush } from '../components/PushSetup';
import { forgetPushOnThisDevice } from '../lib/push';
import { useMuted } from '../lib/sound';
import { useI18n } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { AsyncButton } from '../components/ui';

export function ProfileScreen({
  profile,
  theme,
  setTheme,
  tipsOn,
  setTipsOn,
  onInstall,
  onAdmin,
  onProfileChange,
}: {
  profile: P;
  theme: Theme;
  setTheme: (t: ThemeId) => void;
  tipsOn: boolean;
  setTipsOn: (v: boolean) => void;
  onInstall: () => void;
  onAdmin: () => void;
  onProfileChange: () => void;
}) {
  const { tr, lang, setLang } = useI18n();
  const push = usePushSetup(onInstall);
  const [muted, setMuted] = useMuted();
  const Chev = lang === 'he' ? ChevronLeft : ChevronRight;

  return (
    <div className="screen has-nav">
      <header className="topbar">
        <h1>{tr('פרופיל והגדרות', 'Profile & settings')}</h1>
      </header>
      <div className="content">
        <div className="profile-hero">
          <Avatar name={profile.name} emoji={profile.avatar} size={64} />
          <div className="grow">
            <h2 dir="auto">{profile.name}</h2>
            <div className="badges">
              {profile.is_premium && <span className="tag brass">Premium</span>}
              {profile.is_admin && <span className="tag">{tr('מנהל', 'Admin')}</span>}
              {!profile.is_premium && !profile.is_admin && <span className="sub">{tr('שחקן בקבוצה', 'Group member')}</span>}
            </div>
          </div>
        </div>

        <div className="list-label">{tr('הדמות שלי', 'My avatar')}</div>
        <div className="card-group">
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-opt ${a === profile.avatar ? 'active' : ''}`}
                aria-pressed={a === profile.avatar}
                onClick={async () => {
                  await supabase.rpc('game_update_profile', { p_name: profile.name, p_avatar: a });
                  onProfileChange();
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="list-label">{tr('שפה ומראה', 'Language & look')}</div>
        <div className="card-group">
          <div className="seg" role="group" aria-label={tr('שפה', 'Language')}>
            <button className={lang === 'he' ? 'active' : ''} aria-pressed={lang === 'he'} onClick={() => setLang('he')}>
              עברית
            </button>
            <button className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              English
            </button>
          </div>
          <div className="group-title">{tr('ערכת נושא (רק בטלפון שלך)', 'Theme (only on your phone)')}</div>
          <div className="theme-picker">
            {allThemes(lang).map((t) => (
              <button key={t.id} className={`theme-opt ${t.id === theme.id ? 'active' : ''}`} aria-pressed={t.id === theme.id} onClick={() => setTheme(t.id)}>
                <span aria-hidden="true">{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="list-label">{tr('משחק', 'Game')}</div>
        <div className="menu-list">
          <label className="menu-item toggle">
            <span className="mi">
              <Lightbulb size={19} /> {tr('טיפים בזמן משחק', 'In-game tips')}
            </span>
            <input type="checkbox" role="switch" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <label className="menu-item toggle">
            <span className="mi">
              <Volume2 size={19} /> {tr('צלילים', 'Sounds')}
            </span>
            <input type="checkbox" role="switch" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
          </label>
        </div>

        <div className="list-label">{tr('טלפון', 'Phone')}</div>
        <div className="menu-list">
          <AsyncButton
            className="menu-item"
            onClick={async () => {
              if (push.state === 'denied') push.openHelp('denied');
              else await push.run();
            }}
          >
            <span className="mi">
              <Bell size={19} /> {tr('התראות', 'Notifications')}
            </span>
            <span className={`sub ${push.on ? 'pos' : ''}`}>
              {push.state === null
                ? '…'
                : push.on
                  ? tr('פעילות בטלפון הזה', 'On for this phone')
                  : push.state === 'denied'
                    ? tr('חסומות, איך משחררים', 'Blocked, how to fix')
                    : push.state === 'install' || (isIOS && !isStandalone())
                      ? tr('צריך להתקין קודם', 'Install first')
                      : push.state === 'unsupported'
                        ? tr('לא נתמך בדפדפן הזה', 'Not supported here')
                        : tr('כבויות, להפעלה', 'Off, tap to turn on')}
            </span>
          </AsyncButton>
          {push.on && (
            <AsyncButton className="menu-item" onClick={() => sendTestPush(tr)}>
              <span className="mi">
                <BellRing size={19} /> {tr('שליחת התראת בדיקה', 'Send a test notification')}
              </span>
            </AsyncButton>
          )}
          <button className="menu-item" onClick={onInstall}>
            <span className="mi">
              <Download size={19} /> {tr('התקנה בטלפון', 'Install on your phone')}
            </span>
            <Chev size={18} className="chev-end" />
          </button>
        </div>
        {push.sheet}

        <div className="menu-list">
          {profile.is_admin && (
            <button className="menu-item" onClick={onAdmin}>
              <span className="mi">
                <Shield size={19} /> {tr('ניהול הקבוצה', 'Group admin')}
              </span>
              <Chev size={18} className="chev-end" />
            </button>
          )}
          <button
            className="menu-item danger"
            onClick={async () => {
              await forgetPushOnThisDevice();
              await supabase.auth.signOut();
            }}
          >
            <span className="mi">
              <LogOut size={19} /> {tr('התנתקות', 'Log out')}
            </span>
          </button>
        </div>
        <p className="hint center app-version" translate="no">
          King Jack v3
        </p>
      </div>
    </div>
  );
}
