"use client";

import { FormEvent, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton, SkeletonLines } from "@/components/Skeleton";
import { notifyToast } from "@/lib/application/toast";
import type { TravelerProfile } from "@/packages/contracts/profile";

const csv = (value: unknown): string => (Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : value == null ? "" : String(value));
const toList = (value: string): string[] => value.split(",").map((entry) => entry.trim()).filter(Boolean);

/**
 * Cross-trip traveller profile editor. Seeds every new trip's preferences, so it
 * lives on /account, not inside a trip. One flat form — the per-trip context
 * panel keeps the richer inline-edit UI.
 */
export function ProfilePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [homeAirport, setHomeAirport] = useState("");
  const [groupType, setGroupType] = useState("");
  const [pace, setPace] = useState("");
  const [budget, setBudget] = useState("");
  const [interests, setInterests] = useState("");
  const [dietaryNeeds, setDietaryNeeds] = useState("");

  useEffect(() => {
    let live = true;
    const key = "traveler-profile";
    const apply = (body: { profile?: TravelerProfile }) => {
      const p = body.profile ?? {};
      setHomeAirport(csv(p.homeAirport)); setGroupType(csv(p.groupType)); setPace(csv(p.pace)); setBudget(csv(p.budget)); setInterests(csv(p.interests)); setDietaryNeeds(csv(p.dietaryNeeds));
    };
    try { const cached = sessionStorage.getItem(key); if (cached) { apply(JSON.parse(cached)); setLoading(false); return () => { live = false; }; } } catch { /* ignore */ }
    fetch("/api/profile")
      .then((r) => (r.ok ? r.json() : { profile: {} }))
      .then((body: { profile?: TravelerProfile }) => {
        if (!live) return;
        try { sessionStorage.setItem(key, JSON.stringify(body)); } catch { /* ignore */ }
        const p = body.profile ?? {};
        setHomeAirport(csv(p.homeAirport));
        setGroupType(csv(p.groupType));
        setPace(csv(p.pace));
        setBudget(csv(p.budget));
        setInterests(csv(p.interests));
        setDietaryNeeds(csv(p.dietaryNeeds));
      })
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const payload: TravelerProfile = {
      homeAirport: homeAirport.trim() || undefined,
      groupType: groupType.trim() || undefined,
      pace: pace.trim() || undefined,
      budget: budget.trim() || undefined,
      interests: toList(interests),
      dietaryNeeds: toList(dietaryNeeds),
    };
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      try { sessionStorage.setItem("traveler-profile", JSON.stringify({ profile: payload })); } catch { /* ignore */ }
      notifyToast("Profile saved", "success");
    } catch {
      notifyToast("Your profile couldn’t be saved.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-label="Loading travel profile" className="mt-8 space-y-5 rounded-2xl border border-border bg-card p-5">
        <Skeleton className="h-5 w-32 rounded-md" />
        <SkeletonLines lines={6} />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void save(e)} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <p className="text-sm font-medium">Travel profile</p>
        <p className="mt-0.5 text-xs text-muted-foreground">These carry into every new trip you create. You can still change them per trip.</p>
      </div>
      <label className="block text-xs font-medium text-muted-foreground">
        Home airport
        <input value={homeAirport} onChange={(e) => setHomeAirport(e.target.value)} placeholder="YYZ" maxLength={8} className="input-field mt-1 uppercase" />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Who you usually travel with
        <input value={groupType} onChange={(e) => setGroupType(e.target.value)} placeholder="Couple, family with kids, solo…" className="input-field mt-1" />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Preferred pace
        <input value={pace} onChange={(e) => setPace(e.target.value)} placeholder="Relaxed, packed, balanced…" className="input-field mt-1" />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Typical budget
        <input value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Mid-range, $200/night…" className="input-field mt-1" />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Interests
        <input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="food, museums, hiking" className="input-field mt-1" />
        <span className="mt-1 block font-normal text-muted-foreground/70">Comma separated.</span>
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Dietary needs
        <input value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value)} placeholder="vegetarian, no shellfish" className="input-field mt-1" />
      </label>
      <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
