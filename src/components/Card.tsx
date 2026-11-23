import { SUIT_SYMBOL, rankLabel, type Card as C } from '../engine/cards';

type Size = 'xs' | 'sm' | 'md' | 'lg';

// קלף משחק: פינות כמו בחפיסה אמיתית, סמל במרכז, וגב עם כתר
export function Card({ card, size = 'md', dim = false, delay = 0 }: { card: C | null; size?: Size; dim?: boolean; delay?: number }) {
  const style = delay ? { animationDelay: `${delay}ms` } : undefined;
  if (!card)
    return (
      <div className={`card back ${size}`} style={style}>
        <span className="back-logo">♛</span>
      </div>
    );
  const red = card[1] === 'h' || card[1] === 'd';
  const suit = SUIT_SYMBOL[card[1]];
  const rank = rankLabel(card);
  const face = 'JQK'.includes(card[0]);
  return (
    <div className={`card face-up ${size} ${red ? 'red' : ''} ${dim ? 'dim' : ''}`} style={style}>
      <span className="idx tl">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
      <span className={`pip ${face ? 'face' : ''}`}>{face ? rank : suit}</span>
      <span className="idx br">
        <b>{rank}</b>
        <i>{suit}</i>
      </span>
    </div>
  );
}

export function Hand({ cards, size, hiddenCount = 0, stagger = false }: { cards: C[]; size?: Size; hiddenCount?: number; stagger?: boolean }) {
  return (
    <div className={`hand hand-${size ?? 'md'}`}>
      {cards.map((c, i) => (
        <Card key={i + c} card={c} size={size} delay={stagger ? i * 90 : 0} />
      ))}
      {Array.from({ length: hiddenCount }).map((_, i) => (
        <Card key={'h' + i} card={null} size={size} />
      ))}
    </div>
  );
}
