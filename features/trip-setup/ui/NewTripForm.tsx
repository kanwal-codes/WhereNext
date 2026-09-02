"use client";

import { FormEvent, useState } from "react";

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    const response = await fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, destination, origin, durationDays, travelerCount, preferences: { vibe, budget, pace, transportPreference, dietaryNeeds, interests: [] } }) });
    if (!response.ok) { setError("We could not create that trip."); return; }
    const body = await response.json(); window.location.assign(`/trips/${body.trip.id}`);
  }

  return <form className="card" onSubmit={submit}><label>Trip name<input required value={name} onChange={(e) => setName(e.target.value)} /></label><label>Destination<input required value={destination} onChange={(e) => setDestination(e.target.value)} /></label><label>Starting from<input value={origin} onChange={(e) => setOrigin(e.target.value)} /></label><label>Days<input type="number" min="1" value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} /></label><label>Travelers<input type="number" min="1" value={travelerCount} onChange={(e) => setTravelerCount(Number(e.target.value))} /></label><label>Vibe<input value={vibe} onChange={(e) => setVibe(e.target.value)} placeholder="Relaxed, food-focused..." /></label><label>Budget<input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Moderate" /></label><label>Pace<input value={pace} onChange={(e) => setPace(e.target.value)} placeholder="Balanced" /></label><label>Transport preference<input value={transportPreference} onChange={(e) => setTransportPreference(e.target.value)} placeholder="Public transit" /></label><label>Dietary needs<input value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value)} /></label><button type="submit">Create trip</button>{error && <p role="alert">{error}</p>}</form>;
}
