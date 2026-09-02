"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Trip } from "@/features/trip/domain/trip";

type Decision = { id: string; kind: string; value: Record<string, unknown>; source: string };

const csv = (value: unknown): string => (Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : "");
const list = (value: string): string[] => value.split(",").map((entry) => entry.trim()).filter(Boolean);

export function TripContextSurface({ tripId, trip, initialMemory, initialDecisions }: { tripId: string; trip: Trip | null; initialMemory?: Record<string, unknown>; initialDecisions?: Array<Record<string, unknown>> }) {
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
    ]).then(([memoryBody, decisionsBody]) => {
      setMemory(memoryBody.memory ?? {});
      setDecisions(decisionsBody.decisions ?? []);
    }).catch(() => undefined);
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
    const payload: Record<string, unknown> = { likes: list(form.likes), dislikes: list(form.dislikes), dietaryNeeds: list(form.dietaryNeeds) };
    if (form.groupType.trim()) payload.groupType = form.groupType.trim();
    if (form.pace.trim()) payload.pace = form.pace.trim();
    if (form.budget.trim()) payload.budget = Number.isNaN(Number(form.budget)) ? form.budget.trim() : Number(form.budget);
    try {
      const response = await fetch(`/api/trips/${tripId}/memory`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error("save");
      setMemory((await response.json()).memory ?? {});
      setStatus("Saved.");
    } catch {
      setStatus("Could not save — trip owner only.");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof form, label: string, placeholder: string) => (
    <label className="ctx-field">{label}
      <input value={form[key]} placeholder={placeholder} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
    </label>
  );

  return <section className="card"><h2>Trip context</h2>
    <p>{trip?.destination ?? "Destination not chosen"} · {trip?.duration_days ?? "—"} days · {trip?.travelers ?? "—"} travelers</p>
    <h3>What Muse knows about you</h3>
    <form onSubmit={save} className="ctx-form">
      {field("groupType", "Group", "friends, family, couple…")}
      {field("budget", "Budget", "per day, e.g. 120 or moderate")}
      {field("pace", "Pace", "relaxed, balanced, packed")}
      {field("likes", "Likes", "nightlife, hiking, food markets")}
      {field("dislikes", "Dislikes", "museums, long walks")}
      {field("dietaryNeeds", "Dietary", "vegetarian, halal…")}
      <div className="ctx-actions"><button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>{status && <span role="status">{status}</span>}</div>
    </form>
    <h3>Decisions</h3>
    {decisions.length
      ? <ul>{decisions.map((decision) => <li key={decision.id}><strong>{decision.kind}</strong> · {JSON.stringify(decision.value)} <small>({decision.source})</small></li>)}</ul>
      : <p>No confirmed decisions yet.</p>}
  </section>;
}
