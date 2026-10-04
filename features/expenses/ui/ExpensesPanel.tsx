"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Receipt, Link2 } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";
import { subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { formatMoney } from "@/lib/currency";
import { EmptyState } from "@/components/EmptyState";
import type { TripExpense, SplitwiseBalance } from "@/packages/contracts/expense";

type ExpensesResponse = { expenses: TripExpense[]; connected: boolean; groupId: number | null; balances: SplitwiseBalance[] | null };

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

/** Splitwise-backed expense log. Each member connects their own account (never "add by email" —
 *  see migration 0024) before they can log or be added to an expense. */
export function ExpensesPanel({ tripId, defaultCurrency }: { tripId: string; defaultCurrency: string }) {
  const [state, setState] = useState<ExpensesResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const refresh = useCallback(() => {
    return fetchJson<ExpensesResponse>(`/api/trips/${tripId}/expenses`)
      .then((body) => {
        setState(body);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [tripId]);

  useEffect(() => {
    void refresh();
    return subscribeWorkspaceChanges((changes) => {
      if (changes.includes("decision")) void refresh();
    });
  }, [refresh]);

  // The OAuth callback redirects back here with a query flag instead of a fetch response —
  // surface it once, then strip it so a refresh doesn't re-show the same toast.
  useEffect(() => {
    const error = searchParams.get("splitwiseError");
    const connected = searchParams.get("splitwiseConnected");
    if (!error && !connected) return;
    if (error) notifyToast(error, "error");
    if (connected) {
      notifyToast("Splitwise connected.", "success");
      void refresh();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("splitwiseError");
    url.searchParams.delete("splitwiseConnected");
    router.replace(`${pathname}${url.search}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per redirect, not on every router/pathname identity change
  }, [searchParams]);

  async function addExpense() {
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      notifyToast("Add a description and an amount.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: description.trim(), amount: value, currency: defaultCurrency, idempotencyKey: crypto.randomUUID() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "That didn’t save.");
      setDescription("");
      setAmount("");
      notifyToast("Expense logged.", "success");
      void refresh();
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "That didn’t save.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <EmptyState action={<button type="button" onClick={() => void refresh()} className="btn-secondary">Retry</button>}>
        Couldn’t load shared expenses.
      </EmptyState>
    );
  }

  if (!state) {
    return <div className="h-24 skeleton rounded-2xl border border-border" />;
  }

  if (!state.connected) {
    return (
      <EmptyState
        icon={Link2}
        action={
          <a href={`/api/splitwise/connect?tripId=${tripId}`} className="btn-primary-sm">
            Connect Splitwise
          </a>
        }
      >
        Connect your Splitwise account to log and split expenses with the group.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      {state.balances && state.balances.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Who owes what</p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.balances.map((b, i) => (
              <li key={i}>
                <span className="font-medium text-foreground">{b.fromName}</span> owes{" "}
                <span className="font-medium text-foreground">{b.toName}</span>{" "}
                <span className="tabular-nums">{formatMoney(Number(b.amount), b.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What was it for?"
          aria-label="Expense description"
          className="min-w-0 flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25"
        />
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={defaultCurrency}
          aria-label="Expense amount"
          className="w-24 rounded-xl border border-input bg-background px-3 py-2 text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring/25"
        />
        <button type="button" onClick={() => void addExpense()} disabled={submitting} className="btn-primary-sm shrink-0">
          {submitting ? "Saving…" : "Add"}
        </button>
      </div>

      {state.expenses.length === 0 ? (
        <EmptyState icon={Receipt}>No expenses logged yet.</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {state.expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <span className="truncate">{e.description}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(e.amount, e.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
