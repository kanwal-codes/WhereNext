/**
 * The hero photo for an event the provider sent no picture for. Chosen by what the event is, from
 * its genre ("Music · Rock") and title; anything not recognised keeps the generic trip photo.
 * Add a kind by dropping a photo in public/design and adding a rule here.
 */
const RULES: { image: string; test: RegExp }[] = [
  { image: "/design/place-concert-arena.jpg", test: /\b(music|concert|live music|gig|band|dj set|orchestra|symphony|jazz|rock|pop|hip[- ]?hop|rap|folk|acoustic|choir|recital)\b/i },
  { image: "/design/place-pottery-wheel.jpg", test: /\b(workshop|class|pottery|ceramics?|craft|make your own)\b/i },
  { image: "/design/place-cafe.jpg", test: /\b(food|dinner|brunch|tasting|wine|beer|market|street food|cooking|supper|coffee|cafe)\b/i },
  { image: "/design/place-rooftop-lounge.jpg", test: /\b(club|nightclub|rooftop|cocktails?|bar crawl|pub crawl|party|afterparty|rave|karaoke|social|socials)\b/i },
];

export const DEFAULT_EVENT_IMAGE = "/design/trip-hero.jpg";

export function eventFallbackImage({ genre, title }: { genre?: string | null; title?: string | null }): string {
  const text = `${genre ?? ""} ${title ?? ""}`;
  return RULES.find((rule) => rule.test.test(text))?.image ?? DEFAULT_EVENT_IMAGE;
}
