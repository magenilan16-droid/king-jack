import { SUIT_SYMBOL, rankLabel, type Card as C } from '../engine/cards';

export function Card({ card, size = 'md', dim = false }: { card: C | null; size?: 'sm' | 'md' | 'lg'; dim?: boolean }) {
  if (!card) return <div className={`card back ${size}`} />;
  const red = card[1] === 'h' || card[1] === 'd';
  return (
    <div className={`card ${size} ${red ? 'red' : ''} ${dim ? 'dim' : ''}`}>
      <span className="rank">{rankLabel(card)}</span>
      <span className="suit">{SUIT_SYMBOL[card[1]]}</span>
    </div>
  );
}

export function Hand({ cards, size, hiddenCount = 0 }: { cards: C[]; size?: 'sm' | 'md' | 'lg'; hiddenCount?: number }) {
  return (
    <div className="hand">
      {cards.map((c, i) => (
        <Card key={i + c} card={c} size={size} />
      ))}
      {Array.from({ length: hiddenCount }).map((_, i) => (
        <Card key={'h' + i} card={null} size={size} />
      ))}
    </div>
  );
}
