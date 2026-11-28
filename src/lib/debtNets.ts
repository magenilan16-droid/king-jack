// קיזוז חובות לפי חבר: אם אני חייב לעומייסי 50+75 והוא חייב לי 99 - בשורה התחתונה אני חייב לו 26
export const KITTY = 'kitty';

export type DebtLite = { from_user: string | null; to_user: string | null; amount: number | string };
export type PersonNet<T> = { other: string; net: number; debts: T[] }; // net > 0: הוא חייב לי. net < 0: אני חייב לו

export function netsByPerson<T extends DebtLite>(me: string, debts: T[]): PersonNet<T>[] {
  const m = new Map<string, PersonNet<T>>();
  for (const d of debts) {
    if (d.from_user !== me && d.to_user !== me) continue;
    const toMe = d.to_user === me;
    const other = (toMe ? d.from_user : d.to_user) ?? KITTY;
    const e = m.get(other) ?? { other, net: 0, debts: [] };
    e.net += (toMe ? 1 : -1) * Number(d.amount);
    e.debts.push(d);
    m.set(other, e);
  }
  return [...m.values()].map((e) => ({ ...e, net: Math.round(e.net * 100) / 100 })).sort((a, b) => a.net - b.net);
}

// כמה אני חייב וכמה חייבים לי - אחרי קיזוז עם כל חבר
export function owedTotals(nets: { net: number }[]) {
  const r = (x: number) => Math.round(x * 100) / 100;
  return {
    owe: r(nets.filter((n) => n.net < 0).reduce((a, n) => a - n.net, 0)),
    owed: r(nets.filter((n) => n.net > 0).reduce((a, n) => a + n.net, 0)),
  };
}
