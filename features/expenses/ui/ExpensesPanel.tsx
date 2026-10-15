"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, Loader2, Receipt, X } from "lucide-react";
import { notifyToast } from "@/lib/application/toast";
import { announceWorkspaceChange, subscribeWorkspaceChanges } from "@/lib/application/workspace-events";
import { formatMoney as formatWhole } from "@/lib/currency";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/Skeleton";
import { Stagger, StaggerItem } from "@/components/motion-primitives";
import { controlGhost, surface, CopyButton } from "@/features/conversation/ui/blocks/ui";
import { memberTint } from "@/lib/member-tint";
import { cn } from "@/lib/utils";
import type { TripExpense, LocalBalance, ExpenseMember } from "@/packages/contracts/expense";

// Money that is owed or was paid out shows its cents.
const formatMoney = (amount: number, currency: string) => formatWhole(amount, currency, { exact: true });

type ExpensesResponse = {
  expenses: TripExpense[];
  members: ExpenseMember[];
  localBalances: LocalBalance[];
  totals: Array<{ currency: string; total: number }>;
  isOwner: boolean;
};

/** A person's name, tinted with their stable identity colour (the same recipe group chat uses
 *  for avatars and names) — so who-owes-whom reads as people, not a bare ledger of strings. */
function Who({ name }: { name: string }) {
  const tint = memberTint(name);
  return <span className="font-medium" style={{ color: tint.color }}>{name}</span>;
}

/** A one-tap, one-a-day reminder for a single open balance. Flips to a check when it lands, the
 *  same acknowledgement `CopyButton` uses elsewhere — stays that way until the balance itself
 *  changes (a fresh `key` from the parent remounts it), not just for a few seconds, since unlike
 *  a copy there's a real, server-enforced reason a second click wouldn't do anything new today. */
function RemindButton({ tripId, debtorUserId, currency }: { tripId: string; debtorUserId: string; currency: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "blocked">("idle");
  if (state === "done") return <span className={cn(controlGhost, "pointer-events-none")} title="Reminder sent" aria-label="Reminder sent"><Check className="settle-in size-3.5 text-positive" aria-hidden /></span>;
  if (state === "blocked") return <span className={cn(controlGhost, "pointer-events-none opacity-50")} title="Already reminded today" aria-label="Already reminded today"><BellOff className="settle-in size-3.5" aria-hidden /></span>;
  return (
    <button
      type="button"
      title="Send a reminder"
      aria-label="Send a reminder"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const res = await fetch(`/api/trips/${tripId}/expenses/nudge`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ debtorUserId, currency }),
          });
          if (res.status === 429) { setState("blocked"); return; }
          const body = await res.json().catch(() => ({}));
          if (!res.ok) { notifyToast(typeof body.error === "string" ? body.error : "The reminder couldn’t be sent.", "error"); setState("idle"); return; }
          setState("done");
          notifyToast(body.sent ? "Reminder sent." : "Saved — they won’t get an email for this one.", "success");
        } catch {
          notifyToast("The reminder couldn’t be sent.", "error");
          setState("idle");
        }
      }}
      className={controlGhost}
    >
      {state === "busy" ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Bell className="size-3.5" aria-hidden />}
    </button>
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request failed: ${response.status}`);
  return response.json();
}

/** The app's one text/select field, without the label-offset margin `input-field` otherwise
 *  carries — these sit shoulder to shoulder in a single row. */
const field = cn("input-field", "!mt-0");

/**
 * Shared expenses for the group. Anyone can log what they paid and who shares it; the panel works out who owes
 * whom, with no account needed.
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
  const [submitting, setSubmitting] = useState(false);

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
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          amount: value,
          currency: currency.trim().toUpperCase(),
          idempotencyKey: crypto.randomUUID(),
          paidBy: payer || undefined,
          splitAmong: sharedWith ?? undefined,
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
    return (
      <div aria-hidden="true" aria-busy="true" className="space-y-4">
        <Skeleton className="h-4 w-40" />
        <div className={cn(surface, "p-4")}>
          <Skeleton className="h-2.5 w-24" />
          <div className="mt-3 space-y-2.5">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
        <Skeleton className="h-11 rounded-2xl" />
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const everyone = sharedWith === null;

  return (
    <div className="space-y-4">
      {state.totals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Spent together: <span className="font-medium tabular-nums text-foreground">{state.totals.map((t) => formatMoney(t.total, t.currency)).join(" · ")}</span>
        </p>
      )}

      {state.localBalances.length > 0 && (
        <div className={cn(surface, "p-4")}>
          <p className="eyebrow text-muted-foreground">Who owes what</p>
          <Stagger className="mt-2.5 space-y-2 text-sm">
            {state.localBalances.map((b, i) => {
              // The creditor can remind their own debtor; the owner can remind anyone's — never the
              // debtor's own row (nothing to nudge yourself to pay yourself).
              const canRemind = b.fromName !== "You" && (b.toName === "You" || state.isOwner);
              return (
                <StaggerItem key={`l${i}`} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Who name={b.fromName} /> {b.fromName === "You" ? "owe" : "owes"} <Who name={b.toName} />{" "}
                    <span className="tabular-nums text-ink-soft">{formatMoney(b.amount, b.currency)}</span>
                  </span>
                  <span className="flex shrink-0 items-center">
                    {/* The raw number, not the formatted "$24.00" — this is what gets pasted into an
                        Interac/Venmo/PayPal amount field, which wants a plain decimal, not a currency symbol. */}
                    <CopyButton text={b.amount.toFixed(2)} label="amount" />
                    {canRemind && <RemindButton key={`${b.fromUserId}:${b.toUserId}:${b.currency}`} tripId={tripId} debtorUserId={b.fromUserId} currency={b.currency} />}
                  </span>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      )}

      <div className={cn(surface, "space-y-3 p-4")}>
        <div className="flex items-center gap-2">
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was it for?" aria-label="Expense description" className={cn(field, "min-w-0 flex-1 px-3.5")} />
          <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" aria-label="Expense amount" className={cn(field, "w-24 px-3 tabular-nums")} />
          <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} aria-label="Currency" className={cn(field, "w-16 px-2.5 text-center uppercase")} />
          <button type="button" onClick={() => void addExpense()} disabled={submitting} className="btn-primary h-11 shrink-0 px-5">
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Add
          </button>
        </div>

        {members.length > 1 && (
          <details className="group rounded-xl border border-border/70 bg-surface px-3.5 py-2.5 text-sm open:pb-3">
            <summary className="cursor-pointer select-none py-0.5 text-ink-soft transition-colors group-open:text-foreground">
              Paid by {payer === me?.id ? "you" : nameOf.get(payer) ?? "someone"}, split {everyone ? "equally between everyone" : `between ${sharedWith!.length} ${sharedWith!.length === 1 ? "person" : "people"}`}
            </summary>
            <div className="mt-2.5 space-y-2.5">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Paid by
                <select value={payer} onChange={(e) => setPaidBy(e.target.value)} className={cn(field, "h-9 px-2.5 py-1.5 text-xs")}>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.isYou ? "You" : m.name}</option>)}
                </select>
              </label>
              <div role="group" aria-label="Split with" className="flex flex-wrap gap-1.5">
                {members.map((m) => {
                  const on = everyone || sharedWith!.includes(m.id);
                  return (
                    <button key={m.id} type="button" aria-pressed={on} onClick={() => toggleShared(m.id)} className="btn-chip">
                      {m.isYou ? "You" : m.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </details>
        )}
      </div>

      {state.expenses.length === 0 ? (
        <EmptyState icon={Receipt}>No expenses logged yet. Add what you pay for and who shares it.</EmptyState>
      ) : (
        <Stagger className="space-y-1.5">
          {state.expenses.map((e) => {
            const payerName = e.paidBy ? (nameOf.get(e.paidBy) ?? "Someone") : null;
            const sharers = e.splitAmong ? e.splitAmong.length : members.length;
            return (
              <StaggerItem key={e.id}>
                <div className={cn(surface, "flex items-center justify-between gap-2 px-3.5 py-3 transition-colors hover:border-foreground/15")}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{e.description}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {e.source === "splitwise" ? (
                        "On Splitwise"
                      ) : payerName ? (
                        <>{payerName === "You" ? "You" : <Who name={payerName} />} paid{sharers > 1 ? ` · split ${sharers} ways` : ""}</>
                      ) : (
                        `Paid${sharers > 1 ? ` · split ${sharers} ways` : ""}`
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="tabular-nums text-sm text-foreground">{formatMoney(e.amount, e.currency)}</span>
                    {e.source === "local" && (
                      <button type="button" onClick={() => void removeExpense(e)} aria-label={`Remove ${e.description}`} className={cn(controlGhost, "hover:text-destructive")}>
                        <X className="size-4" aria-hidden />
                      </button>
                    )}
                  </span>
                </div>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
