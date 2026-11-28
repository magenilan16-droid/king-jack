// "יש דיבור?" בלובי: שואלים את כל החבורה אם יש ישיבה הערב (כולם מקבלים התראה),
// וכל אחד עונה בפנים / אולי / לא הפעם. השאלה האחרונה מוצגת עד 12 שעות אחרי ששאלו
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MessagesSquare } from 'lucide-react';
import { supabase, gameCall } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { Sheet, AsyncButton, toast } from './ui';

type Answer = 'in' | 'maybe' | 'no';
type Talk = { id: number; from_user: string; note: string | null; created_at: string };
type Row = { user_id: string; answer: Answer };
const FRESH_MS = 12 * 3600 * 1000;
const ANSWERS: Answer[] = ['in', 'maybe', 'no'];

export function TalkCard({ myId }: { myId: string }) {
  const { tr, lang } = useI18n();
  const [talk, setTalk] = useState<Talk | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Row[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('game_talks').select('id, from_user, note, created_at').order('created_at', { ascending: false }).limit(1).maybeSingle();
    const t = data && Date.now() - new Date(data.created_at).getTime() < FRESH_MS ? (data as Talk) : null;
    if (!t) {
      setTalk(null);
      setAnswers([]);
      return;
    }
    const { data: a } = await supabase.from('game_talk_answers').select('user_id, answer').eq('talk_id', t.id).order('at');
    const rows = (a ?? []) as Row[];
    const ids = [...new Set([t.from_user, ...rows.map((r) => r.user_id)])];
    const { data: p } = await supabase.from('game_profiles').select('id, name').in('id', ids);
    setNames(Object.fromEntries(((p ?? []) as { id: string; name: string }[]).map((x) => [x.id, x.name])));
    setAnswers(rows);
    setTalk(t);
  }, []);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel('talks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_talks' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_talk_answers' }, () => void load())
      .subscribe();
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  const answer = async (a: Answer) => {
    if (!talk) return;
    const prev = answers;
    setAnswers([...answers.filter((r) => r.user_id !== myId), { user_id: myId, answer: a }]);
    navigator.vibrate?.(10);
    const { error } = await supabase
      .from('game_talk_answers')
      .upsert({ talk_id: talk.id, user_id: myId, answer: a, at: new Date().toISOString() }, { onConflict: 'talk_id,user_id' });
    if (error) {
      setAnswers(prev);
      toast(tr('לא הצלחתי לשמור את התשובה', 'Could not save your answer'), 'error');
    }
  };

  const label = (a: Answer) => (a === 'in' ? tr('בפנים', "I'm in") : a === 'maybe' ? tr('אולי', 'Maybe') : tr('לא הפעם', 'Not this time'));
  const Chev = lang === 'he' ? ChevronLeft : ChevronRight;

  const askSheet = (
    <Sheet
      open={asking}
      onClose={() => setAsking(false)}
      title={tr('יש דיבור?', 'Anything on?')}
      footer={
        <AsyncButton
          className="btn primary block big"
          onClick={async () => {
            await gameCall({ op: 'talk', note });
            toast(tr('נשלח לכל החבורה', 'Sent to the whole gang'), 'win');
            setAsking(false);
            setNote('');
            void load();
          }}
        >
          {tr('לשאול את כל החבורה', 'Ask the whole gang')}
        </AsyncButton>
      }
    >
      <p className="tk-explain">{tr('כל החבורה תקבל התראה: "יש דיבור על ישיבה הערב?", וכל אחד יענה כאן בלובי.', 'Everyone gets a notification: "Anything on tonight?", and each answers here in the lobby.')}</p>
      <label className="tk-note">
        {tr('פרטים (לא חובה)', 'Details (optional)')}
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder={tr('למשל: אצלי ב-22:00', 'e.g. at mine, 10pm')} dir="auto" />
      </label>
    </Sheet>
  );

  if (talk === undefined) return null;

  if (!talk)
    return (
      <>
        <button type="button" className="banner talk-ask" onClick={() => setAsking(true)}>
          <span className="banner-ic">
            <MessagesSquare size={19} />
          </span>
          <div className="grow">
            <b>{tr('יש דיבור?', 'Anything on?')}</b>
            <div className="sub">{tr('שואלים את כל החבורה אם יש ישיבה הערב', 'Ask the whole gang if there is a hangout tonight')}</div>
          </div>
          <Chev size={18} className="banner-chev" />
        </button>
        {askSheet}
      </>
    );

  const mine = answers.find((r) => r.user_id === myId)?.answer;
  const askerName = names[talk.from_user] ?? '?';
  const title =
    talk.from_user === myId
      ? tr('שאלת את כולם: יש דיבור על ישיבה הערב?', 'You asked everyone: anything on tonight?')
      : tr(`${askerName}: יש דיבור על ישיבה הערב?`, `${askerName}: anything on tonight?`);
  const time = new Date(talk.created_at).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit' });
  return (
    <section className="talk-card" aria-label={tr('יש דיבור?', 'Anything on?')}>
      <div className="tk-head">
        <span className="banner-ic">
          <MessagesSquare size={19} />
        </span>
        <div className="grow">
          <b dir="auto">{title}</b>
          {talk.note && (
            <div className="sub" dir="auto">
              {talk.note}
            </div>
          )}
        </div>
        <span className="tk-time num">{time}</span>
      </div>
      <div className="tk-answers" role="group" aria-label={tr('התשובה שלך', 'Your answer')}>
        {ANSWERS.map((a) => {
          const n = answers.filter((r) => r.answer === a).length;
          return (
            <button key={a} type="button" className={`tk-btn ${a} ${mine === a ? 'on' : ''}`} aria-pressed={mine === a} onClick={() => void answer(a)}>
              {label(a)}
              {n > 0 && <span className="tk-n num">{n}</span>}
            </button>
          );
        })}
      </div>
      {ANSWERS.map((a) => {
        const who = answers.filter((r) => r.answer === a).map((r) => (r.user_id === myId ? tr('אני', 'me') : (names[r.user_id] ?? '?')));
        if (!who.length) return null;
        return (
          <div key={a} className={`tk-who ${a}`}>
            <span className="tk-who-l">{label(a)}:</span> <span dir="auto">{who.join(', ')}</span>
          </div>
        );
      })}
    </section>
  );
}
