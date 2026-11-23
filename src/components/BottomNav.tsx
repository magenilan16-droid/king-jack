// סרגל ניווט תחתון - כמו באפליקציה
import { Home, Trophy, Wallet, User } from 'lucide-react';
import { useI18n } from '../lib/i18n';

export type Tab = 'lobby' | 'stats' | 'debts' | 'profile';

export function BottomNav({ tab, onTab, debtBadge }: { tab: Tab; onTab: (t: Tab) => void; debtBadge: number }) {
  const { tr } = useI18n();
  const items: { id: Tab; icon: typeof Home; label: string; badge?: number }[] = [
    { id: 'lobby', icon: Home, label: tr('בית', 'Home') },
    { id: 'stats', icon: Trophy, label: tr('דירוג', 'Ranking') },
    { id: 'debts', icon: Wallet, label: tr('חובות', 'Debts'), badge: debtBadge },
    { id: 'profile', icon: User, label: tr('פרופיל', 'Profile') },
  ];
  return (
    <nav className="bottom-nav">
      {items.map(({ id, icon: Icon, label, badge }) => (
        <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => onTab(id)}>
          <span className="nav-icon">
            <Icon size={22} strokeWidth={tab === id ? 2.4 : 1.8} />
            {!!badge && <span className="badge">{badge}</span>}
          </span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
