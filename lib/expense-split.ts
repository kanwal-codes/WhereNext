/**
 * Splitting shared expenses without Splitwise. Each expense is shared equally among the people it names (everyone
 * on the trip when it names nobody) and paid by one person. For each currency the group is settled with the fewest
 * payments: whoever is owed money is paid by whoever owes it. Amounts are in whole cents throughout so nothing drifts.
 */
export type LocalExpense = { amount: number; currency: string; paidBy: string | null; among: string[] | null };
export type Debt = { fromUserId: string; toUserId: string; amount: number; currency: string };

const cents = (amount: number): number => Math.round((amount + Number.EPSILON) * 100);

export function localDebts(expenses: LocalExpense[], memberIds: string[]): Debt[] {
  const members = new Set(memberIds);
  const net = new Map<string, Map<string, number>>(); // currency -> user -> cents (positive = is owed)
  const add = (currency: string, user: string, delta: number) => {
    const byUser = net.get(currency) ?? new Map<string, number>();
    byUser.set(user, (byUser.get(user) ?? 0) + delta);
    net.set(currency, byUser);
  };

  for (const e of expenses) {
    if (!e.paidBy || !members.has(e.paidBy)) continue;
    const sharers = (e.among?.length ? e.among.filter((id) => members.has(id)) : [...members]);
    if (sharers.length === 0) continue;
    const total = cents(e.amount);
    // Equal shares in cents; the leftover cents go one each to the first sharers so the shares add up exactly.
    const base = Math.floor(total / sharers.length);
    const extra = total - base * sharers.length;
    sharers.forEach((id, i) => add(e.currency, id, -(base + (i < extra ? 1 : 0))));
    add(e.currency, e.paidBy, total);
  }

  const debts: Debt[] = [];
  for (const [currency, byUser] of net) {
    const owed = [...byUser].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
    const owing = [...byUser].filter(([, c]) => c < 0).map(([id, c]) => [id, -c] as [string, number]).sort((a, b) => b[1] - a[1]);
    let i = 0;
    let j = 0;
    while (i < owed.length && j < owing.length) {
      const pay = Math.min(owed[i]![1], owing[j]![1]);
      if (pay > 0) debts.push({ fromUserId: owing[j]![0], toUserId: owed[i]![0], amount: pay / 100, currency });
      owed[i]![1] -= pay;
      owing[j]![1] -= pay;
      if (owed[i]![1] === 0) i += 1;
      if (owing[j]![1] === 0) j += 1;
    }
  }
  return debts;
}

/** What has been spent, per currency (every expense, whoever it is split with). */
export function totalsByCurrency(expenses: Array<{ amount: number; currency: string }>): Array<{ currency: string; total: number }> {
  const totals = new Map<string, number>();
  for (const e of expenses) totals.set(e.currency, (totals.get(e.currency) ?? 0) + cents(e.amount));
  return [...totals].map(([currency, c]) => ({ currency, total: c / 100 }));
}
