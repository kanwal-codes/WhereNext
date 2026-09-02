"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Trip } from "@/features/trip/domain/trip";
import { cn } from "@/lib/utils";

type Decision = { id: string; kind: string; value: Record<string, unknown>; source: string };

const csv = (value: unknown): string => (Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "");
const list = (value: string): string[] => value.split(",").map((entry) => entry.trim()).filter(Boolean);

const FIELDS: Array<{ key: "groupType" | "budget" | "pace" | "likes" | "dislikes" | "dietaryNeeds"; label: string; placeholder: string }> = [
  { key: "groupType", label: "Group", placeholder: "friends, family, couple…" },
  { key: "budget", label: "Budget", placeholder: "per day, e.g. 120 or moderate" },
  { key: "pace", label: "Pace", placeholder: "relaxed, balanced, packed" },
  { key: "likes", label: "Likes", placeholder: "nightlife, hiking, food markets" },
  { key: "dislikes", label: "Dislikes", placeholder: "museums, long walks" },
  { key: "dietaryNeeds", label: "Dietary", placeholder: "vegetarian, halal…" },
];

export function TripContextSurface({
  tripId,
  trip,
  initialMemory,
  initialDecisions,
}: {
  tripId: string;
  trip: Trip | null;
  initialMemory?: Record<string, unknown>;
  initialDecisions?: Array<Record<string, unknown>>;
}) {
  const [memory, setMemory] = useState<Record<string, unknown>>(initialMemory ?? {});
  const [decisions, setDecisions] = useState<Decision[]>((initialDecisions ?? []) as Decision[]);
  const [form, setForm] = useState({ groupType: "", budget: "", pace: "", likes: "", dislikes: "", dietaryNeeds: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (initialMemory || initialDecisions) return;
    void Promise.all([
      fetch(`/api/trips/${tripId}/memory`).then((response) => response.json()),
      fetch(`/api/trips/${tripId}/decisions`).then((response) => response.json()),
    ])
      .then(([memoryBody, decisionsBody]) => {
        setMemory(memoryBody.memory ?? {});
        setDecisions(decisionsBody.decisions ?? []);
      })
      .catch(() => undefined);
  }, [tripId, initialMemory, initialDecisions]);

  useEffect(() => {
    setForm({
      groupType: typeof memory.groupType === "string" ? memory.groupType : "",
      budget: memory.budget === undefined ? "" : String(memory.budget),
      pace: typeof memory.pace === "string" ? memory.pace : "",
      likes: Array.from(new Set([...list(csv(memory.interests)), ...list(csv(memory.likes))])).join(", "),
      dislikes: csv(memory.dislikes),
      dietaryNeeds: csv(memory.dietaryNeeds),
    });
  }, [memory]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    const payload: Record<string, unknown> = {
      likes: list(form.likes),
      dislikes: list(form.dislikes),
      dietaryNeeds: list(form.dietaryNeeds),
    };
    if (form.groupType.trim()) payload.groupType = form.groupType.trim();
    if (form.pace.trim()) payload.pace = form.pace.trim();
    if (form.budget.trim()) payload.budget = Number.isNaN(Number(form.budget)) ? form.budget.trim() : Number(form.budget);
    try {
      const response = await fetch(`/api/trips/${tripId}/memory`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("save");
      setMemory((await response.json()).memory ?? {});
      setStatus("Saved.");
    } catch {
      setStatus("Could not save — trip owner only.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Trip context</p>
        <h3 className="mt-1 font-display text-base">What we know</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {trip?.destination ?? "Destination not chosen"} · {trip?.duration_days ?? "—"} days ·{" "}
          {trip?.travelers ?? "—"} travellers
        </p>
      </div>

      <form onSubmit={save} className="space-y-2.5">
        {FIELDS.map((f) => (
          <label key={f.key} className="block rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="text-[11px] tracking-[0.1em] text-muted-foreground uppercase">{f.label}</span>
            <input
              value={form[f.key]}
              placeholder={f.placeholder}
              onChange={(event) => setForm((current) => ({ ...current, [f.key]: event.target.value }))}
              className="mt-1 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
          </label>
        ))}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {status && (
            <span role="status" className="inline-flex items-center gap-1 text-xs text-leaf">
              <Check className="h-3 w-3" /> {status}
            </span>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-dashed border-border px-3 py-3">
        <p className="eyebrow">Decisions</p>
        {decisions.length ? (
          <ul className="mt-2 space-y-2">
            {decisions.map((decision) => (
              <li key={decision.id} className="text-sm leading-relaxed text-ink-soft">
                <span className={cn("mr-1.5 rounded bg-leaf-soft px-1.5 py-0.5 text-[10px] font-medium tracking-[0.06em] text-leaf uppercase")}>
                  {decision.kind}
                </span>
                <span className="text-muted-foreground">{JSON.stringify(decision.value)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No confirmed decisions yet.</p>
        )}
      </div>
    </div>
  );
}
