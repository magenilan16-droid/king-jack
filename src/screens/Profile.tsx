// מסך פרופיל והגדרות
import { Bell, BellRing, Download, Lightbulb, LogOut, Shield, Volume2, Languages, Palette, Smile } from 'lucide-react';
import { supabase, type Profile as P } from '../lib/supabase';
import { allThemes, AVATARS, type Theme, type ThemeId } from '../lib/themes';
import { isIOS, isStandalone } from '../lib/platform';
import { usePushSetup, sendTestPush } from '../components/PushSetup';
import { forgetPushOnThisDevice } from '../lib/push';
import { useMuted } from '../lib/sound';
import { useI18n } from '../lib/i18n';
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

  return (
    <div className="screen has-nav">
      <header className="topbar">
        <h1>{tr('פרופיל והגדרות', 'Profile & settings')}</h1>
      </header>
      <div className="content">
        <div className="profile-hero">
          <span className="big-avatar ring">{profile.avatar}</span>
          <h2 dir="auto">{profile.name}</h2>
          <div className="badges">
            {profile.is_premium && <span className="tag gold">⭐ Premium</span>}
            {profile.is_admin && <span className="tag">🛡️ {tr('מנהל', 'Admin')}</span>}
          </div>
        </div>

        <div className="card-group">
          <div className="group-title">
            <Smile size={16} /> {tr('הדמות שלי', 'My avatar')}
          </div>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button
                key={a}
                className={`avatar-opt ${a === profile.avatar ? 'active' : ''}`}
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

        <div className="card-group">
          <div className="group-title">
            <Languages size={16} /> {tr('שפה', 'Language')}
          </div>
          <div className="seg">
            <button className={lang === 'he' ? 'active' : ''} onClick={() => setLang('he')}>
              עברית
            </button>
            <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
          <div className="group-title">
            <Palette size={16} /> {tr('ערכת נושא (רק אצלך)', 'Theme (only on your phone)')}
          </div>
          <div className="theme-picker">
            {allThemes(lang).map((t) => (
              <button key={t.id} className={`theme-opt ${t.id === theme.id ? 'active' : ''}`} onClick={() => setTheme(t.id)}>
                <span>{t.emoji}</span>
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-list">
          <label className="menu-item toggle">
            <span className="mi">
              <Lightbulb size={19} /> {tr('טיפים חכמים בזמן משחק', 'Smart in-game tips')}
            </span>
            <input type="checkbox" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <label className="menu-item toggle">
            <span className="mi">
              <Volume2 size={19} /> {tr('צלילי משחק', 'Game sounds')}
            </span>
            <input type="checkbox" checked={!muted} onChange={(e) => setMuted(!e.target.checked)} />
          </label>
          <AsyncButton
            className="menu-item"
            onClick={async () => {
              if (push.perm === 'denied') push.openHelp('denied');
              else await push.run();
            }}
          >
            <span className="mi">
              <Bell size={19} /> {tr('התראות', 'Notifications')}
            </span>
            <span className={`sub ${push.perm === 'granted' ? 'pos' : ''}`}>
              {push.perm === 'granted'
                ? tr('פעילות', 'On')
                : push.perm === 'denied'
                  ? tr('חסומות - איך משחררים', 'Blocked - how to fix')
                  : isIOS && !isStandalone()
                    ? tr('צריך להתקין קודם', 'Install first')
                    : tr('לחצו להפעלה', 'Tap to turn on')}
            </span>
          </AsyncButton>
          {push.perm === 'granted' && (
            <AsyncButton className="menu-item" onClick={() => sendTestPush(tr)}>
              <span className="mi">
                <BellRing size={19} /> {tr('שליחת התראת בדיקה', 'Send a test notification')}
              </span>
            </AsyncButton>
          )}
          {push.sheet}
          <button className="menu-item" onClick={onInstall}>
            <span className="mi">
              <Download size={19} /> {tr('התקנה בטלפון', 'Install on your phone')}
            </span>
          </button>
          {profile.is_admin && (
            <button className="menu-item" onClick={onAdmin}>
              <span className="mi">
                <Shield size={19} /> {tr('ניהול (מנהל)', 'Admin panel')}
              </span>
            </button>
          )}
          <button className="menu-item danger" onClick={async () => {
              await forgetPushOnThisDevice();
              await supabase.auth.signOut();
            }}>
            <span className="mi">
              <LogOut size={19} /> {tr('התנתקות', 'Log out')}
            </span>
          </button>
        </div>
        <p className="hint center">King Jack 👑 · v2</p>
      </div>
    </div>
  );
}
