/**
 * Choosing the photograph that stands for a destination. The first Places hit for "Montreal, Canada" is the
 * city's own listing, whose photos are whatever visitors uploaded (a block of flats under cloud). A cover
 * needs a view: so this ranks scenic spots, sights and parks by how many people rated them, and from the
 * winner takes the first photograph that is wide, landscape and large enough to fill a hero.
 */
export type CoverPhoto = { name: string; widthPx?: number; heightPx?: number };
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

export function pickCoverPhoto(places: CoverCandidate[]): string | null {
  const score = (c: CoverCandidate) => (WEIGHT[c.primaryType ?? ""] ?? 0) * Math.log10((c.userRatingCount ?? 0) + 10);
  const ranked = places.filter((c) => score(c) > 0).sort((a, b) => score(b) - score(a));
  for (const place of ranked) {
    const photo = (place.photos ?? []).slice(0, 4).find(fits);
    if (photo) return photo.name;
  }
  // Nothing scenic with a good frame: any place's first landscape photograph beats the city listing's.
  for (const place of places) {
    const photo = (place.photos ?? []).slice(0, 4).find(fits);
    if (photo) return photo.name;
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
  if (!stored?.startsWith(STORED_PREFIX)) return { known: false };
  const name = stored.slice(STORED_PREFIX.length);
  return { known: true, name: name || undefined };
}
