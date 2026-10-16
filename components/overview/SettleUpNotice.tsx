"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import type { LocalBalance } from "@/packages/contracts/expense";

/**
 * A quiet, informational flag on Overview when shared expenses (kept in this app, not Splitwise)
 * are still open — count only, no names: the balances themselves (and who to remind) live one tap
 * away on Bookings, so this card is a pointer, not a public ledger. Renders nothing once settled,
 * and nothing at all for a trip with no local expenses yet.
 */
export function SettleUpNotice({ tripId }: { tripId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      fetch(`/api/trips/${tripId}/expenses`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((body: { localBalances?: LocalBalance[] } | null) => setCount(body?.localBalances?.length ?? 0))
        .catch(() => undefined);
    void load();
    const unsubscribe = subscribeWorkspaceChanges((changes) => { if (changes.includes("decision")) void load(); });
    return () => {
      unsubscribe();
      controller.abort();
    };
  }, [tripId]);

  if (!count) return null;
  return (
    <Link
      href={`/trips/${tripId}/bookings`}
      className="group flex items-center gap-3 rounded-2xl border border-lagoon/30 bg-lagoon-soft/40 px-4 py-3 text-sm shadow-hairline transition-[background-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] hover:bg-lagoon-soft/60 hover:shadow-soft active:scale-[0.99]"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-card text-lagoon shadow-hairline">
        <Wallet className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        {count} open {count === 1 ? "balance" : "balances"} from shared expenses.
      </span>
      <span className="shrink-0 font-medium text-lagoon underline-offset-2 group-hover:underline">Settle up</span>
    </Link>
  );
}
