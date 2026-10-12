"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Receipt, X } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange, subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { formatMoney as formatWhole } from "@/lib/currency";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import type { TripExpense, SplitwiseBalance, LocalBalance, ExpenseMember } from "@/packages/contracts/expense";

// Money that is owed or was paid out shows its cents.
const formatMoney = (amount: number, currency: string) => formatWhole(amount, currency, { exact: true });

type ExpensesResponse = {
  expenses: TripExpense[];
  connected: boolean;
  groupId: number | null;
  balances: SplitwiseBalance[] | null;
  members: ExpenseMember[];
  localBalances: LocalBalance[];
  totals: Array<{ currency: string; total: number }>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

const field = "rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/25";

/**
 * Shared expenses for the group. Anyone can log what they paid and who shares it; the panel works out who owes
 * whom, with no account needed. Splitwise is optional: someone who has connected it can also send an expense there.
 */
export function ExpensesPanel({ tripId, defaultCurrency }: { tripId: string; defaultCurrency: string }) {
  const [state, setState] = useState<ExpensesResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paidBy, setPaidBy] = useState("");
  // null = everyone; otherwise exactly the people ticked.
  const [sharedWith, setSharedWith] = useState<string[] | null>(null);
  const [alsoSplitwise, setAlsoSplitwise] = useState(true);
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

  const members = useMemo(() => [...(state?.members ?? [])].sort((a, b) => Number(b.isYou) - Number(a.isYou)), [state]);
  const me = members.find((m) => m.isYou);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const payer = paidBy || me?.id || "";

  async function addExpense() {
    const value = Number(amount);
    if (!description.trim() || !Number.isFinite(value) || value <= 0) {
      notifyToast("Add a description and an amount.", "error");
      return;
    }
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) {
      notifyToast("Use a 3-letter currency, like EUR.", "error");
      return;
    }
    if (sharedWith && sharedWith.length === 0) {
      notifyToast("Pick at least one person to split it with.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const splitwise = state?.connected ? alsoSplitwise : false;
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          amount: value,
          currency: currency.trim().toUpperCase(),
          idempotencyKey: crypto.randomUUID(),
          splitwise,
          // Splitwise splits equally among its own group; who-paid and who-shares only apply to the ones kept here.
          ...(splitwise ? {} : { paidBy: payer || undefined, splitAmong: sharedWith ?? undefined }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "That didn’t save.");
      setDescription("");
      setAmount("");
      setSharedWith(null);
      notifyToast("Expense logged.", "success");
      announceWorkspaceChange("decision");
      void refresh();
    } catch (error) {
      notifyToast(error instanceof Error ? error.message : "That didn’t save.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeExpense(expense: TripExpense) {
    const response = await fetch(`/api/trips/${tripId}/expenses/${expense.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return notifyToast(body.error ?? "That couldn’t be removed.", "error");
    notifyToast(`${expense.description} removed.`, "success");
    void refresh();
  }

  function toggleShared(id: string) {
    setSharedWith((current) => {
      const base = current ?? members.map((m) => m.id);
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      return next.length === members.length ? null : next;
    });
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

  const splitwiseBalances = state.balances ?? [];
  const everyone = sharedWith === null;

  return (
    <div className="space-y-3">
      {state.totals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Spent together: <span className="font-medium tabular-nums text-foreground">{state.totals.map((t) => formatMoney(t.total, t.currency)).join(" · ")}</span>
        </p>
      )}

      {(state.localBalances.length > 0 || splitwiseBalances.length > 0) && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Who owes what</p>
          <ul className="mt-2 space-y-1 text-sm">
            {state.localBalances.map((b, i) => (
              <li key={`l${i}`}>
                <span className="font-medium text-foreground">{b.fromName}</span> {b.fromName === "You" ? "owe" : "owes"} <span className="font-medium text-foreground">{b.toName}</span>{" "}
                <span className="tabular-nums">{formatMoney(b.amount, b.currency)}</span>
              </li>
            ))}
            {splitwiseBalances.map((b, i) => (
              <li key={`s${i}`}>
                <span className="font-medium text-foreground">{b.fromName}</span> owes <span className="font-medium text-foreground">{b.toName}</span>{" "}
                <span className="tabular-nums">{formatMoney(Number(b.amount), b.currency)}</span> <span className="text-xs text-muted-foreground">on Splitwise</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" aria-label="Expense description" className={cn(field, "min-w-0 flex-1")} />
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="Expense amount" className={cn(field, "w-24 tabular-nums")} />
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} aria-label="Currency" className={cn(field, "w-16 uppercase")} />
          <button type="button" onClick={() => void addExpense()} disabled={submitting} className="btn-primary-sm min-h-10 shrink-0">
            {submitting ? "Saving…" : "Add"}
          </button>
        </div>

        {members.length > 1 && !(state.connected && alsoSplitwise) && (
          <details className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <summary className="cursor-pointer select-none py-1.5 text-muted-foreground">
              Paid by {payer === me?.id ? "you" : nameOf.get(payer) ?? "someone"}, split {everyone ? "equally between everyone" : `between ${sharedWith!.length} ${sharedWith!.length === 1 ? "person" : "people"}`}
            </summary>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Paid by
                <select value={payer} onChange={(e) => setPaidBy(e.target.value)} className={cn(field, "py-2")}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.isYou ? "You" : m.name}</option>)}
                </select>
              </label>
              <div role="group" aria-label="Split with" className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = everyone || sharedWith!.includes(m.id);
                  return (
                    <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleShared(m.id)} className={cn("btn-chip", on && "bg-foreground text-background")}>
                      {m.isYou ? "You" : m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        )}

        {state.connected ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={alsoSplitwise} onChange={(e) => setAlsoSplitwise(e.target.checked)} /> Add it to Splitwise instead (split equally there)
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Kept here: no account needed. Prefer Splitwise?{" "}
            <a href={`/api/splitwise/connect?tripId=${tripId}`} className="underline underline-offset-2 hover:text-foreground">Connect it</a>.
          </p>
        )}
      </div>

      {state.expenses.length === 0 ? (
        <EmptyState icon={Receipt}>No expenses logged yet. Add what you pay for and who shares it.</EmptyState>
      ) : (
        <ul className="space-y-1.5">
          {state.expenses.map((e) => {
            const payerName = e.paidBy ? (nameOf.get(e.paidBy) ?? "Someone") : null;
            const sharers = e.splitAmong ? e.splitAmong.length : members.length;
            return (
              <li key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{e.description}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {e.source === "splitwise" ? "On Splitwise" : `${payerName ? `${payerName === "You" ? "You paid" : `${payerName} paid`}` : "Paid"}${sharers > 1 ? ` · split ${sharers} ways` : ""}`}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{formatMoney(e.amount, e.currency)}</span>
                  {e.source === "local" && (
                    <button type="button" onClick={() => void removeExpense(e)} aria-label={`Remove ${e.description}`} className="grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
