"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2, Mic } from "lucide-react";
import { useSpeechInput } from "@/lib/use-speech-input";
import { currencyForLocale } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { applyParsedTrip } from "@/features/trip-setup/lib/apply-parsed-trip";

const fieldClass = "input-field";
const linkClass = "text-xs font-medium text-primary hover:underline";

export function NewTripForm() {
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [origin, setOrigin] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [useLength, setUseLength] = useState(false);
  const [travelerCount, setTravelerCount] = useState("");
  const [vibe, setVibe] = useState("");
  const [budget, setBudget] = useState("");
  const [pace, setPace] = useState("");
  const [transportPreference, setTransportPreference] = useState("");
  const [dietaryNeeds, setDietaryNeeds] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [prompt, setPrompt] = useState("");
  const [parsing, setParsing] = useState(false);
  const [filledFromPrompt, setFilledFromPrompt] = useState(false);

  const [mode, setMode] = useState<"describe" | "link">("describe");
  const [link, setLink] = useState("");
  const [importing, setImporting] = useState(false);

  // Pre-fill the vibe fields from the traveller's saved profile — only ones they haven't touched.
  useEffect(() => {
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { profile?: Record<string, unknown> } | null) => {
        const p = body?.profile;
        if (!p) return;
        const s = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : v == null ? "" : String(v));
        setBudget((cur) => cur || s(p.budget));
        setPace((cur) => cur || s(p.pace));
        setTransportPreference((cur) => cur || s(p.transportPreference));
        setDietaryNeeds((cur) => cur || s(p.dietaryNeeds));
      })
      .catch(() => undefined);
  }, []);

  async function runImport() {
    const url = link.trim();
    if (!url || importing) return;
    setImporting(true);
    setError(null);
    try {
      const response = await fetch("/api/trips/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.tripId) throw new Error(body.error);
      window.location.assign(`/trips/${body.tripId}/chat`);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "That link couldn’t be imported. Try describing the trip instead.");
      setImporting(false);
    }
  }

  const speechBaseRef = useRef("");
  const speech = useSpeechInput({
    onStart: () => {
      speechBaseRef.current = prompt.trim() ? `${prompt.trim()} ` : "";
    },
    onResult: (text) => setPrompt(speechBaseRef.current + text),
    onError: (message) => setError(message),
  });

  async function runParse() {
    const text = prompt.trim();
    if (!text || parsing) return;
    if (speech.listening) speech.stop();
    setParsing(true);
    setError(null);
    try {
      const response = await fetch("/api/trips/parse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!response.ok) throw new Error();
      const body = (await response.json()) as { parsed?: Record<string, unknown> };
      const next = applyParsedTrip(
        { name, destination, origin, startDate, endDate, durationDays, useLength, travelerCount, vibe, budget, pace, transportPreference, dietaryNeeds },
        body.parsed ?? {},
      );
      setName(next.name); setDestination(next.destination); setOrigin(next.origin);
      setStartDate(next.startDate); setEndDate(next.endDate); setDurationDays(next.durationDays); setUseLength(next.useLength);
      setTravelerCount(next.travelerCount); setVibe(next.vibe); setBudget(next.budget); setPace(next.pace);
      setTransportPreference(next.transportPreference); setDietaryNeeds(next.dietaryNeeds);
      setFilledFromPrompt(true);
    } catch {
      setError("We couldn’t read that — fill in the form below instead.");
    } finally {
      setParsing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!useLength && startDate && endDate && endDate < startDate) {
      setError("The end date is before the start date.");
      return;
    }
    setError(null);
    setSaving(true);
    const when =
      !useLength && startDate && endDate
        ? { startDate, endDate }
        : durationDays
          ? { durationDays: Number(durationDays) }
          : {};
    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim() || destination.trim(),
        destination,
        origin,
        ...when,
        travelerCount: travelerCount === "" ? undefined : Number(travelerCount),
        preferences: {
          vibe,
          budget,
          pace,
          transportPreference,
          dietaryNeeds,
          interests: [],
          currency: currencyForLocale(typeof navigator !== "undefined" ? navigator.language : undefined),
        },
      }),
    });
    if (!response.ok) {
      setError("We couldn't create that trip. Nothing was lost — try again.");
      setSaving(false);
      return;
    }
    const body = await response.json();
    // Straight into the conversation with an empty composer — everything from the
    // describe box already went into the form.
    window.location.assign(`/trips/${body.trip.id}/chat`);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex w-fit rounded-full border border-border p-0.5 text-xs">
          {(["describe", "link"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={cn("rounded-full px-3 py-1 font-medium transition-colors", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {m === "describe" ? "Describe your trip" : "Paste a link"}
            </button>
          ))}
        </div>

        {mode === "link" ? (
          <label className="block text-sm font-medium">
            Import from a link
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring/25">
              <input
                type="url"
                inputMode="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void runImport(); } }}
                placeholder="https://…  a blog post, guide, or itinerary"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={importing || !link.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Import"}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {importing ? "Reading the page and building your trip…" : "We’ll pull the destination and the places it mentions into a new trip."}
            </p>
          </label>
        ) : (
        <label className="block text-sm font-medium">
          Describe your trip
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-ring/25">
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runParse();
                }
              }}
              placeholder={speech.listening ? "Listening…" : "“Lisbon Mar 14–20, from Toronto, 2 of us, lots of food”"}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.toggle}
                aria-label={speech.listening ? "Stop dictation" : "Dictate your trip"}
                aria-pressed={speech.listening}
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-colors",
                  speech.listening ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Mic className={cn("h-3.5 w-3.5", speech.listening && "animate-pulse")} />
              </button>
            )}
            <button
              type="button"
              onClick={() => void runParse()}
              disabled={parsing || !prompt.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-60"
            >
              {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fill in"}
            </button>
          </div>
        </label>
        )}
        {mode === "describe" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {filledFromPrompt
              ? "Filled from your description — check and edit below, then create."
              : "Optional. Type it in a sentence and we’ll fill the form for you."}
          </p>
        )}
      </div>

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
          <label className="block text-sm font-medium">
            Travelers
            <input type="number" min="1" value={travelerCount} onChange={(e) => setTravelerCount(e.target.value)} placeholder="2" className={fieldClass} />
          </label>

          <div className="sm:col-span-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{useLength ? "Trip length" : "Dates"}</span>
              <button
                type="button"
                className={linkClass}
                onClick={() => setUseLength((v) => !v)}
              >
                {useLength ? "Know the dates? Pick them" : "Not sure yet? Set length instead"}
              </button>
            </div>
            {useLength ? (
              <input
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                placeholder="Number of days"
                className={cn(fieldClass, "mt-1.5")}
              />
            ) : (
              <div className="mt-1.5 grid grid-cols-2 gap-4">
                <label className="block text-xs text-muted-foreground">
                  Start
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate && e.target.value && endDate < e.target.value) setEndDate(e.target.value);
                    }}
                    className={cn(fieldClass, "mt-1")}
                  />
                </label>
                <label className="block text-xs text-muted-foreground">
                  End
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={cn(fieldClass, "mt-1")}
                  />
                </label>
              </div>
            )}
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
    </div>
  );
}
