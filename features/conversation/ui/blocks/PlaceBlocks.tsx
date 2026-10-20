"use client";

import { SaveHeart } from "@/features/trip/ui/SaveHeart";
import { useState } from "react";
import { MapPin } from "lucide-react";
import type { AssistantBlock, PlaceCard, TrustLabel } from "@/packages/contracts/assistant";
import type { Place } from "@/packages/contracts/place";
import { AddToTripControl } from "@/features/trip/ui/AddToTripControl";
import { cn } from "@/lib/utils";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { categoryLabel, photoProxyUrl } from "@/lib/places-ui";
import { CineAddress, CineCard, CinePill, CineRating, PlaceFloatingPills } from "./CineCard";
import { portableProxyPhotoUrl } from "../portable-photo-url";
import { warmPlace } from "@/features/places/application/placeDetailsCache";
import { SkeletonPhotoCard } from "@/components/Skeleton";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { placeGlyph } from "./glyphs";
import { compactCount, controlSecondary, grid } from "./ui";
import { BlockHandlers } from "./blockShared";

export const cleanSectionTitle = (value?: string) => value
  ? value.trim().replace(/^./, (letter) => letter.toUpperCase())
  : undefined;

/** Drop the card-only fields so what's left is a plain provider Place. */
export const toPlace = ({ photoUrl: _photo, trust: _trust, distanceToLocked: _distance, ...place }: PlaceCard): Place => place;

const TRUST_LABEL: Record<TrustLabel, string> = {
  verified: "Verified",
  sourced: "From the web",
  estimated: "Estimated",
  assumption: "Assumption",
  unavailable: "Unavailable",
};

export function PlaceCardView({
  place,
  tripId,
  onOpenPlace,
}: { place: PlaceCard; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const category = place.category ? categoryLabel(place.category) : undefined;
  return (
    <CineCard
      label={`Open ${place.name}`}
      onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
      warm={onOpenPlace ? () => warmPlace(tripId, place.providerId, { title: place.name, subtitle: category, photo: portableProxyPhotoUrl(place.photoUrl), rating: place.rating }) : undefined}
      src={portableProxyPhotoUrl(place.photoUrl)}
      alt={place.name}
      glyph={placeGlyph(place.category, place.name).icon}
      topLeft={typeof place.rating === "number" ? <CineRating rating={place.rating} count={place.userRatingCount ? compactCount(place.userRatingCount) : undefined} /> : category ? <CinePill>{category}</CinePill> : undefined}
      // "From the web" is the default for every card: only a non-default trust label carries information.
      topRight={<PlaceFloatingPills place={place} extra={place.trust !== "sourced" ? <CinePill>{TRUST_LABEL[place.trust] ?? place.trust}</CinePill> : undefined} />}
      eyebrow={category}
      title={place.name}
      pills={place.distanceToLocked ? <CinePill icon={MapPin}>{place.distanceToLocked}</CinePill> : undefined}
      why={place.reviewSummary}
      foot={place.address ? <CineAddress address={place.address} /> : undefined}
      save={<SaveHeart tripId={tripId} place={toPlace(place)} />}
      // One control: shortlist (still deciding) → a day (going in the plan) → remove.
      action={<AddToTripControl tripId={tripId} place={toPlace(place)} variant="orb" />}
    />
  );
}

const MORE_STEP = 6;

/**
 * "Show more" under a list of places in the side panel: asks the same place search Discover uses for more of the same
 * kind near the trip (up to 60 come back at once), drops what is already shown, and reveals them six at a time.
 */
export function MorePlaces({ block, tripId, onOpenPlace }: { block: Extract<AssistantBlock, { type: "place_list" }>; tripId: string } & Pick<BlockHandlers, "onOpenPlace">) {
  const { guest, openGate } = useGuest();
  const destination = useTripDataMaybe()?.data?.trip?.destination ?? "";
  const [found, setFound] = useState<PlaceCard[] | null>(null);
  const [shown, setShown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const here = new Set(block.places.map((place) => place.providerId));
  const fresh = (found ?? []).filter((place) => !here.has(place.providerId));
  const label = cleanSectionTitle(block.title) ?? `${categoryLabel(block.places[0]?.category)}s`;
  const city = destination.split(",")[0]?.trim() ?? "";
  const query = !city || label.toLowerCase().includes(city.toLowerCase()) ? label : `${label} in ${city}`;

  async function more() {
    if (guest) return openGate("see more places");
    if (found) return setShown((count) => count + MORE_STEP);
    setBusy(true);
    setFailed(false);
    try {
      const lat = block.places.reduce((sum, place) => sum + place.latitude, 0) / Math.max(1, block.places.length);
      const lng = block.places.reduce((sum, place) => sum + place.longitude, 0) / Math.max(1, block.places.length);
      const response = await fetch(`/api/trips/${tripId}/places?query=${encodeURIComponent(query)}&lat=${lat}&lng=${lng}`);
      if (!response.ok) throw new Error("search");
      const body = (await response.json()) as { places?: Place[] };
      setFound((body.places ?? []).map((place) => ({ ...place, trust: "sourced" as const, photoUrl: photoProxyUrl(tripId, place.photoNames?.[0], 640) })));
      setShown(MORE_STEP);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const visible = fresh.slice(0, shown);
  const left = fresh.length - visible.length;
  return (
    <>
      {visible.length > 0 && (
        <div className={grid}>
          {visible.map((place) => (
            <div key={place.providerId}>
              <PlaceCardView place={place} tripId={tripId} onOpenPlace={onOpenPlace} />
            </div>
          ))}
        </div>
      )}
      {busy && (
        <div className={grid}>
          {Array.from({ length: MORE_STEP }).map((_, i) => (
            <SkeletonPhotoCard key={i} className="aspect-[3/4]" />
          ))}
        </div>
      )}
      {!busy && (!found || left > 0) && (
        <div className="flex justify-center pt-1">
          <button type="button" onClick={() => void more()} disabled={busy} className={cn(controlSecondary, "h-11 px-6")}>
            {found ? `Show ${Math.min(MORE_STEP, left)} more` : "Show more places"}
          </button>
        </div>
      )}
      {failed && <p className="text-center text-sm text-muted-foreground">Couldn’t find more just now. Try again in a moment.</p>}
      {found && fresh.length === 0 && <p className="text-center text-sm text-muted-foreground">That’s everything Roam found near here.</p>}
    </>
  );
}
