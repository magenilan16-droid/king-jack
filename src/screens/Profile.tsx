// מסך פרופיל והגדרות
import { useRef, useState } from 'react';
import { Bell, BellRing, Download, Lightbulb, LogOut, Shield, ChevronLeft, ChevronRight, Camera, X } from 'lucide-react';
import { supabase, type Profile as P } from '../lib/supabase';
import { allThemes, type Theme, type ThemeId } from '../lib/themes';
import { AvatarPicker, ThemePicker } from '../components/Pickers';
import { isIOS, isStandalone } from '../lib/platform';
import { usePushSetup, sendTestPush } from '../components/PushSetup';
import { forgetPushOnThisDevice } from '../lib/push';
import { SoundSettings } from '../components/SoundSettings';
import { useI18n } from '../lib/i18n';
import { Avatar } from '../components/Avatar';
import { AsyncButton, toast } from '../components/ui';
import { Achievements } from '../components/Achievements';
import { isPhoto, uploadPhoto } from '../lib/photo';
import { AVATARS } from '../lib/themes';

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
  const Chev = lang === 'he' ? ChevronLeft : ChevronRight;
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const hasPhoto = isPhoto(profile.avatar);
  const setAvatar = async (a: string) => {
    await supabase.rpc('game_update_profile', { p_name: profile.name, p_avatar: a });
    onProfileChange();
  };
  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await setAvatar(await uploadPhoto(profile.id, file));
      toast(tr('התמונה עודכנה. החברים יראו אותה בשולחן.', 'Photo updated. Friends will see it at the table.'), 'win');
    } catch {
      toast(tr('לא הצלחנו להעלות את התמונה. נסו תמונה אחרת.', "Couldn't upload the photo. Try a different one."), 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
          <AvatarPicker name={profile.name} value={profile.avatar} onChange={setAvatar} />
          <div className="photo-row">
            <button className="btn primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <span className="spinner" /> : <Camera size={18} />}
              {hasPhoto ? tr('החלפת התמונה', 'Change photo') : tr('תמונה שלי', 'Use my photo')}
            </button>
            {hasPhoto && (
              <button className="btn ghost" disabled={uploading} onClick={() => setAvatar(AVATARS[0])}>
                <X size={17} /> {tr('הסרה', 'Remove')}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
          </div>
          <p className="hint photo-hint">{tr('צילום או תמונה מהגלריה. החברים יראו אותה במקום הדמות.', 'Take a picture or pick one from the gallery. Friends see it instead of the emoji.')}</p>
        </div>

        <div className="list-label">{tr('ההישגים שלי', 'My achievements')}</div>
        <div className="card-group">
          <Achievements userId={profile.id} />
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
          <ThemePicker themes={allThemes(lang)} value={theme.id} onChange={setTheme} />
        </div>

        <div className="list-label">{tr('משחק', 'Game')}</div>
        <div className="menu-list">
          <label className="menu-item toggle">
            <span className="mi">
              <Lightbulb size={19} /> {tr('טיפים בזמן משחק', 'In-game tips')}
            </span>
            <input type="checkbox" role="switch" checked={tipsOn} onChange={(e) => setTipsOn(e.target.checked)} />
          </label>
          <SoundSettings />
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
