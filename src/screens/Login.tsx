import { useState } from 'react';
import { Eye, EyeOff, Download } from 'lucide-react';
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
        <img src="icons/kj-192.png" alt="" className="logo" />
        <h1>King Jack</h1>
        <p>{tr('פוקר ובלאק ג׳ק עם החבר׳ה, כולל ספירת חובות', 'Poker and blackjack with friends, debts included')}</p>
      </div>
      <div className="tabs" role="tablist">
        <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
          {tr('הרשמה', 'Sign up')}
        </button>
        <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
          {tr('כניסה', 'Log in')}
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
            <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? tr('הסתרת הסיסמה', 'Hide password') : tr('הצגת הסיסמה', 'Show password')}>
              {show ? <EyeOff size={19} /> : <Eye size={19} />}
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
          {busy ? <span className="spinner" /> : mode === 'login' ? tr('כניסה', 'Log in') : tr('הרשמה', 'Sign up')}
        </button>
        <p className="hint">
          {tr(
            'השם והסיסמה מאפשרים להיכנס מכל טלפון ולשמור על הסטטיסטיקה האישית שלכם.',
            'Your name and password let you log in from any phone and keep your personal stats.',
          )}
        </p>
      </form>
      <button className="link-btn" onClick={onInstall}>
        <Download size={17} /> {tr('איך מתקינים את האפליקציה בטלפון', 'How to install the app on your phone')}
      </button>
    </div>
  );
}
