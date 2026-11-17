import { useState } from 'react';
import { login, register } from '../lib/supabase';
import { AVATARS } from '../lib/themes';
import { useI18n } from '../lib/i18n';
import { toast } from '../components/ui';

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="lang-toggle">
      <button className={lang === 'he' ? 'active' : ''} onClick={() => setLang('he')}>
        עברית
      </button>
      <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>
        English
      </button>
    </div>
  );
}

export function Login({ onInstall }: { onInstall: () => void }) {
  const { tr } = useI18n();
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [avatar, setAvatar] = useState('😎');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast(tr('שם של 2 תווים לפחות', 'Name must be at least 2 characters'), 'error');
    if (pw.length < 4) return toast(tr('סיסמה של 4 תווים לפחות', 'Password must be at least 4 characters'), 'error');
    setBusy(true);
    try {
      if (mode === 'login') await login(name, pw);
      else await register(name, pw, avatar);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen login-screen">
      <LangToggle />
      <div className="login-hero">
        <img src="icons/icon-192.png" alt="" className="logo" />
        <h1>King Jack</h1>
        <p>{tr('טקסס הולדם · בלאק ג׳ק · חובות וקיזוז', "Texas Hold'em · Blackjack · Debts & settle-up")}</p>
      </div>
      <div className="tabs">
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          {tr('פעם ראשונה? הרשמה', 'First time? Sign up')}
        </button>
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          {tr('כבר רשום? כניסה', 'Have an account? Log in')}
        </button>
      </div>
      <form className="card-form" onSubmit={submit}>
        <label>
          {tr('השם שלך (כמו שהחברים מכירים)', 'Your name (as your friends know you)')}
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoComplete="username"
            placeholder={tr('למשל: אילן', 'e.g. Danny')}
          />
        </label>
        <label>
          {tr('סיסמה (4 תווים לפחות)', 'Password (at least 4 characters)')}
          <div className="pw-row">
            <input
              className="input"
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
            <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={tr('הצג סיסמה', 'Show password')}>
              {show ? '🙈' : '👁️'}
            </button>
          </div>
        </label>
        {mode === 'register' && (
          <div>
            <div className="label">{tr('בחרו דמות', 'Pick an avatar')}</div>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button type="button" key={a} className={`avatar-opt ${a === avatar ? 'active' : ''}`} onClick={() => setAvatar(a)}>
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="btn primary block big" disabled={busy}>
          {busy ? <span className="spinner" /> : mode === 'login' ? tr('כניסה 🃏', 'Log in 🃏') : tr('יאללה, נרשמים 🚀', "Let's go 🚀")}
        </button>
        <p className="hint">
          {tr(
            'השם והסיסמה מאפשרים להיכנס מכל טלפון ולשמור על הסטטיסטיקה האישית שלכם.',
            'Your name and password let you log in from any phone and keep your personal stats.',
          )}
        </p>
      </form>
      <button className="link-btn" onClick={onInstall}>
        {tr('📲 איך מתקינים את האפליקציה בטלפון?', '📲 How do I install the app on my phone?')}
      </button>
    </div>
  );
}
