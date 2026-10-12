import { fxRate } from "@/lib/server/fx";
import { committedSpend } from "@/lib/budget";
import { roundMoney } from "@/lib/currency";
import type { StayDecision } from "@/packages/contracts/stay";

type Priced = Parameters<typeof committedSpend>[0][number];

/**
 * What the group has booked, in the trip's own currency where a rate exists (the bank's reference rate for the day),
 * with whatever has no rate listed as it was priced. The budget screen and Roam both read this one answer, so they never disagree.
 */
export async function committedTotals(reservations: Priced[], stay: StayDecision | null, travellers: number | null, home: string, signal?: AbortSignal) {
  const lines = committedSpend(reservations, stay, travellers);
  const rates = new Map(await Promise.all(lines.map(async (l) => [l.currency, await fxRate(l.currency, home, signal)] as const)));
  let converted = 0;
  const unconverted: Array<{ currency: string; total: number }> = [];
  for (const line of lines) {
    const rate = rates.get(line.currency);
    if (rate) converted += line.total * rate;
    else unconverted.push({ currency: line.currency, total: roundMoney(line.total) });
  }
  return {
    currency: home,
    travellers,
    lines: lines.map((l) => ({ ...l, total: roundMoney(l.total) })),
    convertedTotal: roundMoney(converted),
    perPerson: travellers ? roundMoney(converted / travellers) : null,
    unconverted,
  };
}

export type CommittedTotals = Awaited<ReturnType<typeof committedTotals>>;
