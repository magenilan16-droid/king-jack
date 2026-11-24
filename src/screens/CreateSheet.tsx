// פתיחת שולחן חדש: מסך אחד בלי גלילה - הבחירות החשובות למעלה, כפתור הפתיחה תמיד גלוי למטה
import { useState, type ReactNode } from 'react';
import { gameCall } from '../lib/supabase';
import { fmt } from '../lib/balances';
import { useI18n } from '../lib/i18n';
import { Sheet, AsyncButton, NumberStepper, toast } from '../components/ui';

// שורת בחירה קטנה (כמה אפשרויות קבועות) בתוך טופס
export function Pick<T extends string | number | null>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { v: T; t: string; aria?: string }[];
  label: string;
}) {
  return (
    <div className="seg mini" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          className={value === o.v ? 'active' : ''}
          aria-pressed={value === o.v}
          aria-label={o.aria}
          onClick={() => onChange(o.v)}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}

// המשחקים שאפשר לפתוח. אומהה = שולחן פוקר עם 4 קלפים ביד
export type GamePick = 'holdem' | 'omaha' | 'blackjack';

export function FormRow({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="fl-row">
      <div className="fl-label">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  );
}

export function CreateSheet({
  open,
  type,
  setType,
  onClose,
  onCreated,
  myName,
}: {
  open: boolean;
  type: GamePick;
  setType: (t: GamePick) => void;
  onClose: () => void;
  onCreated: (id: string) => void;
  myName: string;
}) {
  const { tr } = useI18n();
  const [money, setMoney] = useState<'real' | 'demo'>('real');
  const [name, setName] = useState('');
  const [buyIn, setBuyIn] = useState(200);
  const [bb, setBb] = useState(2);
  const [blindUp, setBlindUp] = useState(0);
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(200);
  const [dealerMode, setDealerMode] = useState<'house' | 'player'>('house');
  const [bots, setBots] = useState(0);
  const [turnSeconds, setTurnSeconds] = useState(45);
  const [maxRebuys, setMaxRebuys] = useState<number | null>(null);
  const defaultName = tr(`השולחן של ${myName}`, `${myName}'s table`);

  const poker = type !== 'blackjack';
  const create = async () => {
    const settings = poker
      ? { bb, buyIn, turnSeconds, blindUpMinutes: blindUp, maxRebuys, ...(type === 'omaha' ? { variant: 'omaha' } : {}) }
      : { minBet, maxBet: Math.max(maxBet, minBet), buyIn, dealerMode, turnSeconds, maxRebuys };
    const r = await gameCall<{ roomId: string; code: string }>({
      op: 'create',
      gameType: poker ? 'holdem' : 'blackjack',
      name: name.trim() || defaultName,
      moneyMode: money,
      settings,
    });
    for (let i = 0; i < bots; i++) await gameCall({ op: 'act', roomId: r.roomId, move: { type: 'addBot' } });
    onClose();
    onCreated(r.roomId);
    toast(tr(`השולחן נפתח. הקוד: ${r.code}`, `Table opened. Code: ${r.code}`), 'win');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tr('שולחן חדש', 'New table')}
      className="create-sheet"
      footer={
        <AsyncButton className="btn primary block big" onClick={create}>
          {tr('פתיחת שולחן', 'Open table')}
        </AsyncButton>
      }
    >
      <div className="game-pick" role="group" aria-label={tr('משחק', 'Game')}>
        <button type="button" className={`gp holdem ${type === 'holdem' ? 'active' : ''}`} aria-pressed={type === 'holdem'} onClick={() => setType('holdem')}>
          <span className="gp-felt" aria-hidden="true">
            <span className="gp-card">A</span>
            <span className="gp-card red">K</span>
          </span>
          <b>{tr('טקסס הולדם', "Texas Hold'em")}</b>
        </button>
        <button type="button" className={`gp omaha ${type === 'omaha' ? 'active' : ''}`} aria-pressed={type === 'omaha'} onClick={() => setType('omaha')}>
          <span className="gp-felt" aria-hidden="true">
            <span className="gp-card">A</span>
            <span className="gp-card red">A</span>
            <span className="gp-card">K</span>
            <span className="gp-card red">Q</span>
          </span>
          <b>{tr('אומהה', 'Omaha')}</b>
        </button>
        <button
          type="button"
          className={`gp blackjack ${type === 'blackjack' ? 'active' : ''}`}
          aria-pressed={type === 'blackjack'}
          onClick={() => setType('blackjack')}
        >
          <span className="gp-felt" aria-hidden="true">
            <span className="gp-21">21</span>
          </span>
          <b>{tr('בלאק ג׳ק', 'Blackjack')}</b>
        </button>
      </div>

      <div>
        <div className="seg" role="group" aria-label={tr('סוג שולחן', 'Table type')}>
          <button type="button" className={money === 'real' ? 'active' : ''} aria-pressed={money === 'real'} onClick={() => setMoney('real')}>
            {tr('כסף אמיתי', 'Real money')}
          </button>
          <button type="button" className={money === 'demo' ? 'active' : ''} aria-pressed={money === 'demo'} onClick={() => setMoney('demo')}>
            {tr('אימון', 'Practice')}
          </button>
        </div>
        <p className="hint fl-hint">
          {money === 'real'
            ? tr('כל קנייה נרשמת, ובסוף הערב מקבלים קיזוז חובות.', 'Every buy-in is recorded and you get a settle-up at the end.')
            : tr('כסף משחק. לא נספר בחובות ובדירוג.', 'Play money. Not counted in debts or rankings.')}
        </p>
      </div>

      <div className="form-list">
        <label className="fl-row">
          <span className="fl-label">
            <span>{tr('שם', 'Name')}</span>
          </span>
          <input className="fl-input" value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} maxLength={30} dir="auto" />
        </label>
        <FormRow label={tr('קנייה', 'Buy-in')} sub={tr('זהה לכולם', 'Same for everyone')}>
          <NumberStepper value={buyIn} onChange={setBuyIn} step={50} min={10} label={tr('קנייה', 'Buy-in')} />
        </FormRow>
        {poker ? (
          <>
            <FormRow label={tr('ביג בליינד', 'Big blind')} sub={tr(`סמול ${fmt(bb / 2)}`, `Small ${fmt(bb / 2)}`)}>
              <NumberStepper value={bb} onChange={setBb} step={2} min={2} label={tr('ביג בליינד', 'Big blind')} />
            </FormRow>
            <FormRow label={tr('בליינדים עולים', 'Rising blinds')} sub={tr('כל כמה דקות', 'Every N minutes')}>
              <Pick
                label={tr('בליינדים עולים', 'Rising blinds')}
                value={blindUp}
                onChange={setBlindUp}
                options={[
                  { v: 0, t: tr('לא', 'Off') },
                  { v: 10, t: '10' },
                  { v: 15, t: '15' },
                  { v: 20, t: '20' },
                  { v: 30, t: '30' },
                ]}
              />
            </FormRow>
          </>
        ) : (
          <>
            <FormRow label={tr('הימור מינימום', 'Minimum bet')}>
              <NumberStepper value={minBet} onChange={setMinBet} step={5} min={1} label={tr('הימור מינימום', 'Minimum bet')} />
            </FormRow>
            <FormRow label={tr('הימור מקסימום', 'Maximum bet')}>
              <NumberStepper value={maxBet} onChange={setMaxBet} step={50} min={minBet} label={tr('הימור מקסימום', 'Maximum bet')} />
            </FormRow>
            <FormRow label={tr('דילר', 'Dealer')}>
              <Pick
                label={tr('דילר', 'Dealer')}
                value={dealerMode}
                onChange={setDealerMode}
                options={[
                  { v: 'house', t: tr('המחשב', 'Computer') },
                  { v: 'player', t: tr('חבר כבנק', 'A friend') },
                ]}
              />
            </FormRow>
          </>
        )}
        <FormRow label={tr('קניות חוזרות', 'Rebuys')} sub={tr('לכל שחקן', 'Per player')}>
          <Pick
            label={tr('קניות חוזרות', 'Rebuys')}
            value={maxRebuys}
            onChange={setMaxRebuys}
            options={[
              { v: 0, t: tr('בלי', 'None') },
              { v: 1, t: '1' },
              { v: 2, t: '2' },
              { v: 3, t: '3' },
              { v: null, t: '∞', aria: tr('ללא הגבלה', 'Unlimited') },
            ]}
          />
        </FormRow>
        <FormRow label={tr('זמן לתור', 'Turn time')} sub={tr('בשניות', 'Seconds')}>
          <Pick label={tr('זמן לתור', 'Turn time')} value={turnSeconds} onChange={setTurnSeconds} options={[30, 45, 60, 90].map((n) => ({ v: n, t: String(n) }))} />
        </FormRow>
        <FormRow label={tr('בוטים', 'Bots')} sub={tr('שחקני מחשב', 'Computer players')}>
          <Pick label={tr('בוטים', 'Bots')} value={bots} onChange={setBots} options={[0, 1, 2, 3].map((n) => ({ v: n, t: String(n) }))} />
        </FormRow>
      </div>
    </Sheet>
  );
}
