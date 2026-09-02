"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

const fieldClass = "input-field";

export function NewTripForm() {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [durationDays, setDurationDays] = useState(4);
  const [travelerCount, setTravelerCount] = useState(2);
  const [vibe, setVibe] = useState("");
  const [budget, setBudget] = useState("");
  const [pace, setPace] = useState("");
  const [transportPreference, setTransportPreference] = useState("");
  const [dietaryNeeds, setDietaryNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        destination,
        origin,
        durationDays,
        travelerCount,
        preferences: { vibe, budget, pace, transportPreference, dietaryNeeds, interests: [] },
      }),
    });
    if (!response.ok) {
      setError("We could not create that trip. Nothing was lost — try again.");
      setSaving(false);
      return;
    }
    const body = await response.json();
    window.location.assign(`/trips/${body.trip.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium sm:col-span-2">
          Trip name
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Montréal, slowly" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Destination
          <input required value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="City, region, or “somewhere warm”" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Starting from
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Toronto" className={fieldClass} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">
            Days
            <input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} className={fieldClass} />
          </label>
          <label className="block text-sm font-medium">
            Travelers
            <input type="number" min="1" value={travelerCount} onChange={(e) => setTravelerCount(Number(e.target.value))} className={fieldClass} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Vibe
          <input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="Relaxed, food-focused…" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Budget
          <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Moderate" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Pace
          <input value={pace} onChange={(e) => setPace(e.target.value)} placeholder="Balanced" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium">
          Transport preference
          <input value={transportPreference} onChange={(e) => setTransportPreference(e.target.value)} placeholder="Public transit" className={fieldClass} />
        </label>
        <label className="block text-sm font-medium sm:col-span-2">
          Dietary needs
          <input value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value)} className={fieldClass} />
        </label>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-70"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Setting up your trip…
          </>
        ) : (
          <>
            Create trip <ArrowRight className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
