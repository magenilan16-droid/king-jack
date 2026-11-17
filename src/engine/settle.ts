// קיזוז חובות: מי מעביר כמה למי, במינימום העברות
export interface Balance {
  id: string;
  name: string;
  net: number; // חיובי = מרוויח, שלילי = חייב
}

export interface Transfer {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  amount: number;
}

export function settle(balances: Balance[]): Transfer[] {
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ ...b, left: -b.net }))
    .sort((a, b) => b.left - a.left);
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ ...b, left: b.net }))
    .sort((a, b) => b.left - a.left);
  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(d.left, c.left);
    if (amt > 0.005) {
      out.push({ from: d.id, fromName: d.name, to: c.id, toName: c.name, amount: Math.round(amt * 100) / 100 });
    }
    d.left -= amt;
    c.left -= amt;
    if (d.left < 0.005) i++;
    if (c.left < 0.005) j++;
  }
  return out;
}
