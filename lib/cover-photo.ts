/**
 * Choosing the photograph that stands for a destination. The first Places hit for "Montreal, Canada" is the
 * city's own listing, whose photos are whatever visitors uploaded (a block of flats under cloud). A cover
 * needs a view: so this ranks scenic spots, sights and parks by how many people rated them, and from the
 * winner takes the first photograph that is wide, landscape and large enough to fill a hero.
 */
type CoverPhoto = { name: string; widthPx?: number; heightPx?: number };
export type CoverCandidate = { displayName?: { text?: string }; primaryType?: string; userRatingCount?: number; photos?: CoverPhoto[] };

const WEIGHT: Record<string, number> = {
  scenic_spot: 1,
  natural_feature: 0.95,
  tourist_attraction: 0.95,
  beach: 0.9,
  historical_landmark: 0.85,
  plaza: 0.8,
  park: 0.75,
  hiking_area: 0.75,
  national_park: 0.9,
  observation_deck: 0.9,
  cultural_landmark: 0.85,
  monument: 0.8,
};

/** A frame that survives a 3:1 hero crop: landscape (1.3 to 2.2), and big enough not to go soft at 1600px. */
const fits = (p: CoverPhoto) => {
  if (!p.widthPx || !p.heightPx) return false;
  const ratio = p.widthPx / p.heightPx;
  return ratio >= 1.3 && ratio <= 2.2 && p.widthPx >= 2000;
};

/** The same shape at a smaller size (1000px+): a little soft on a full-bleed hero, but a view; used only when no place has a frame that `fits`. A smaller city may have no 2000px photograph at all, and a slightly soft real photograph beats an empty gradient. */
const fitsLoosely = (p: CoverPhoto) => {
  if (!p.widthPx || !p.heightPx) return false;
  const ratio = p.widthPx / p.heightPx;
  return ratio >= 1.3 && ratio <= 2.2 && p.widthPx >= 1000;
};

export function pickCoverPhoto(places: CoverCandidate[]): string | null {
  const score = (c: CoverCandidate) => (WEIGHT[c.primaryType ?? ""] ?? 0) * Math.log10((c.userRatingCount ?? 0) + 10);
  const ranked = places.filter((c) => score(c) > 0).sort((a, b) => score(b) - score(a));
  // Best first: a full-size frame from the best-rated sight, then from any place; then the same two with the smaller size.
  for (const frame of [fits, fitsLoosely]) {
    for (const place of ranked) {
      const photo = (place.photos ?? []).slice(0, 4).find(frame);
      if (photo) return photo.name;
    }
    // Nothing scenic with a good frame: any place's first landscape photograph beats the city listing's.
    for (const place of places) {
      const photo = (place.photos ?? []).slice(0, 4).find(frame);
      if (photo) return photo.name;
    }
  }
  return null;
}

/**
 * What is stored on the trip row. Covers used to be saved as a bare photo name (and "" for "none found"), picked
 * by an older, worse rule. New picks carry a version prefix, so every older value reads as "never looked" and is
 * chosen again once, with no data migration and in any deploy order.
 */
const STORED_PREFIX = "v2:";
export const encodeCover = (photoName: string | undefined): string => `${STORED_PREFIX}${photoName ?? ""}`;
export function decodeCover(stored: string | null | undefined): { known: boolean; name?: string } {
  // A bare "v2:" (older builds saved "looked, found nothing") counts as never looked: that answer was often a
  // transient failure or a query Google couldn't match, and it locked the trip into the type-only cover for good.
  const name = stored?.startsWith(STORED_PREFIX) ? stored.slice(STORED_PREFIX.length) : "";
  return name ? { known: true, name } : { known: false };
}
