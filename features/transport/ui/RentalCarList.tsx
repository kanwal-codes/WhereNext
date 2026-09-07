"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Phone, Star } from "lucide-react";
import { ExternalLink } from "@/components/ExternalLink";
import type { NearbyBusiness } from "@/packages/providers/google-places/client";

/** Rental car locations near a point — directory only (name/address/phone/website), no pricing or booking. */
export function RentalCarList({ tripId, center }: { tripId: string; center: { lat: number; lng: number } | null }) {
  const [businesses, setBusinesses] = useState<NearbyBusiness[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/trips/${tripId}/car-rentals?lat=${center.lat}&lng=${center.lng}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
      .then((body) => !cancelled && setBusinesses(body.businesses ?? []))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tripId, center]);

  if (!center) return null;

  if (loading) {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Looking for rental cars nearby…
      </p>
    );
  }

  if (error) {
    return <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">We couldn’t load rental cars just now. Try again in a moment.</p>;
  }

  if (!businesses || businesses.length === 0) {
    return <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">No rental car locations came back for this area.</p>;
  }

  return (
    <div className="space-y-3">
      {businesses.map((b) => (
        <div key={b.providerId} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-base">{b.name}</span>
            {typeof b.rating === "number" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="h-3 w-3 fill-current text-coral" /> {b.rating.toFixed(1)}
              </span>
            )}
          </div>
          {b.address && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{b.address}</span>
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {b.phone && (
              <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <Phone className="h-3 w-3" /> {b.phone}
              </a>
            )}
            {b.websiteUri && <ExternalLink href={b.websiteUri}>Website</ExternalLink>}
          </div>
        </div>
      ))}
    </div>
  );
}
