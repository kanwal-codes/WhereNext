// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the place detail (page and side panel): its states, facts, hours and contact, About text, photos,
 * reviews and the ways to add or ask. The data hook and the heavy neighbours are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let s: Any;
let phoneV2 = false;
let hydrated = true;
let seedRead: Any | null;
let hero: Any = {};
let lightbox: Any = {};
let recs: Any | null = null;
const retry = vi.fn();

vi.mock("@/features/places/application/usePlaceDetails", () => ({ usePlaceDetails: () => s }));
vi.mock("@/lib/phone-v2", () => ({ get PHONE_V2() { return phoneV2; } }));
vi.mock("@/lib/use-media-query", () => ({ useHydrated: () => hydrated }));
vi.mock("@/features/places/application/placeDetailsCache", () => ({ readPlaceSeed: () => seedRead }));
vi.mock("@/lib/use-document-title", () => ({ useDocumentTitle: () => null }));
vi.mock("@/features/trip/ui/AddToTripControl", () => ({ AddToTripControl: ({ place, noSave }: Any) => <button type="button" data-nosave={String(Boolean(noSave))}>{`add ${place.name}`}</button> }));
vi.mock("@/features/trip/ui/SaveHeart", () => ({ SaveHeart: () => <span data-testid="heart" /> }));
vi.mock("@/components/GetYourGuideCard", () => ({ GetYourGuideCard: ({ label }: Any) => <div data-testid="gyg">{label}</div> }));
vi.mock("@/components/Hero", () => ({ Hero: (p: Any) => { hero = p; return <div data-testid="hero">{p.ratingBadge}{p.children}</div>; } }));
vi.mock("@/components/NearbyRecommendations", () => ({ NearbyRecommendations: (p: Any) => { recs = p; return <div data-testid="recs" />; } }));
vi.mock("@/components/BackLink", () => ({ BackLink: ({ fallback }: Any) => <a href={fallback}>Back</a> }));
vi.mock("@/components/SourceCard", () => ({ SourceCard: ({ provider, href }: Any) => <a href={href}>{provider}</a> }));
vi.mock("@/components/TripWeather", () => ({ TripWeather: ({ location }: Any) => <div data-testid="weather">{location}</div> }));
vi.mock("@/components/PanelStates", () => ({
  PANEL_PAD: "pad", PANEL_HERO: "hero",
  PanelLoading: ({ what, seed }: Any) => <div>loading {what}{seed ? ` seed ${seed.title}` : ""}</div>,
  PanelError: ({ what, onRetry }: Any) => <button type="button" onClick={onRetry}>retry {what}</button>,
}));
vi.mock("@/components/motion-primitives", () => ({
  Reveal: ({ children }: Any) => <div>{children}</div>, WordReveal: ({ text }: Any) => <h1>{text}</h1>,
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for the real image component
  BlurImage: ({ src, alt }: Any) => <img src={src} alt={alt} />,
}));
vi.mock("@/components/PhotoLightbox", () => ({
  usePhotoLightbox: () => lightbox,
  PhotoLightbox: ({ photos }: Any) => <div data-testid="lightbox" data-count={photos.length} />,
}));

import { PlaceDetailView } from "../../features/places/ui/PlaceDetailView";

const PHOTO = (n: number) => ({ name: `places/p1/photos/ph${n}` });
const base = (over: Any = {}) => ({
  id: "p1", displayName: { text: "Louvre Museum" }, formattedAddress: "Rue de Rivoli, 75001 Paris, France", location: { latitude: 48.86, longitude: 2.34 }, primaryType: "museum",
  types: ["museum", "tourist_attraction", "point_of_interest"], googleMapsUri: "https://maps.google.com/?cid=1", websiteUri: "https://www.louvre.fr/en", nationalPhoneNumber: "01 40 20 53 17",
  rating: 4.7, userRatingCount: 12000, priceLevel: "PRICE_LEVEL_MODERATE", editorialSummary: { text: "World-famous art museum." },
  regularOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: 9:00 AM – 6:00 PM", "Tuesday: Closed", "Wednesday: 9:00 AM – 9:45 PM", "Thursday: 9:00 AM – 6:00 PM", "Friday: 9:00 AM – 9:45 PM", "Saturday: 9:00 AM – 6:00 PM", "Sunday: 9:00 AM – 6:00 PM"] },
  photos: [PHOTO(1), PHOTO(2), PHOTO(3)], reviews: [], ...over,
});
const review = (over: Any = {}) => ({ rating: 5, text: { text: "Wonderful." }, authorAttribution: { displayName: "Ann" }, relativePublishTimeDescription: "a week ago", ...over });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const page = (props: Any = {}) => render(<PlaceDetailView tripId={TRIP} placeId="p1" {...props} />);
const panel = () => page({ variant: "panel" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-02T12:00:00")); // a Wednesday
  s = { details: base(), about: null, aboutLoading: false, state: "ready", retry };
  phoneV2 = false; hydrated = true; seedRead = null; hero = {}; recs = null; lightbox = { index: null, open: vi.fn(), close: vi.fn() };
  retry.mockClear();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("PlaceDetailView: states", () => {
  it("shows a loading state, with what the card already knew once hydrated", () => {
    s = { ...s, state: "loading", details: null };
    seedRead = { title: "Louvre" };
    page();
    expect(screen.getByText("loading this place seed Louvre")).toBeTruthy();
    cleanup();
    hydrated = false;
    page();
    expect(screen.getByText("loading this place")).toBeTruthy();
  });

  it("offers a retry, and on the page a way back, when it cannot be loaded or has no details", async () => {
    vi.useRealTimers();
    s = { ...s, state: "error", details: null };
    const user = u();
    page();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(`/trips/${TRIP}/discover`);
    await user.click(screen.getByRole("button", { name: "retry this place" }));
    expect(retry).toHaveBeenCalled();
    cleanup();
    s = { ...s, state: "ready", details: null };
    panel();
    expect(screen.getByRole("button", { name: "retry this place" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });
});

describe("PlaceDetailView: the top", () => {
  it("names the place, its kind, address and rating", () => {
    page();
    expect(screen.getByRole("heading", { name: "Louvre Museum" })).toBeTruthy();
    expect(screen.getByText("Museum", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Rue de Rivoli, 75001 Paris, France")).toBeTruthy();
    expect(screen.getByTestId("hero").textContent).toContain("4.7");
    expect(screen.getByTestId("hero").textContent).toContain("12K");
    expect(hero.image).toBe(`/api/trips/${TRIP}/places/google/photo?name=${encodeURIComponent("places/p1/photos/ph1")}`);
  });

  it("flags a place that has closed", () => {
    s.details = base({ businessStatus: "CLOSED_PERMANENTLY" });
    page();
    expect(screen.getByText("Permanently closed")).toBeTruthy();
  });

  it("shows the weather for an outdoor place only", () => {
    s.details = base({ primaryType: "park", types: ["park"] });
    page();
    expect(screen.getByTestId("weather").textContent).toBe("Paris, France");
    cleanup();
    s.details = base({ primaryType: "park", types: ["park"], formattedAddress: undefined });
    page();
    expect(screen.queryByTestId("weather")).toBeNull();
    cleanup();
    s.details = base();
    page();
    expect(screen.queryByTestId("weather")).toBeNull();
  });

  it("goes back to Discover from the page only", () => {
    page();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(hero.kenBurns).toBe(true);
    cleanup();
    panel();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    expect(hero.surface).toBe(true);
  });
});

describe("PlaceDetailView: adding it", () => {
  it("offers to add it to the trip", () => {
    page();
    expect(screen.getByRole("button", { name: "add Louvre Museum" })).toBeTruthy();
  });

  it("explains when it cannot be added for want of a location", () => {
    s.details = base({ location: undefined });
    page();
    expect(screen.getByText(/can.t be added/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^add / })).toBeNull();
  });

  it("links the page to a ready-written question, but not the panel", () => {
    page();
    const link = screen.getByRole("link", { name: /Does Louvre Museum fit your trip/ });
    expect(link.getAttribute("href")).toContain(`/trips/${TRIP}/chat?ask=`);
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("https://maps.google.com/?cid=1");
    cleanup();
    panel();
    expect(screen.queryByRole("link", { name: /fit your trip/ })).toBeNull();
  });

  it("offers tours and tickets", () => {
    page();
    expect(screen.getByTestId("gyg").textContent).toBe("Find tours and tickets for Louvre Museum");
  });
});

describe("PlaceDetailView: facts and actions", () => {
  it("shows rating, price and whether it is open now, with today's hours", () => {
    page();
    const facts = document.querySelector("dl")!;
    expect(within(facts as HTMLElement).getByText("Rating")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("Price")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("Right now")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText("Open")).toBeTruthy();
    expect(within(facts as HTMLElement).getByText(/9:00.AM.–.9:45.PM/)).toBeTruthy();
  });

  it("links to directions, the phone and the website", () => {
    page();
    expect(screen.getAllByRole("link", { name: /Directions/ })[0].getAttribute("href")).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Louvre Museum, Rue de Rivoli, 75001 Paris, France")}&destination_place_id=p1`);
    expect(screen.getAllByRole("link", { name: /Call/ })[0].getAttribute("href")).toBe("tel:0140205317");
    expect(screen.getAllByRole("link", { name: /Website/ })[0].getAttribute("href")).toBe("https://www.louvre.fr/en");
  });

  it("leaves out the actions it has nothing for", () => {
    s.details = base({ nationalPhoneNumber: undefined, websiteUri: undefined });
    page();
    expect(screen.queryByRole("link", { name: /Call/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Website/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Directions/ })).toHaveLength(1);
  });
});

describe("PlaceDetailView: hours and contact", () => {
  it("shows today's hours, and every day when opened, today in bold", async () => {
    const user = u();
    page();
    const section = screen.getByRole("region", { name: "Hours and contact" });
    expect(within(section).getByText(/Today · 9:00 AM – 9:45 PM/)).toBeTruthy();
    expect(within(section).getByText("All days")).toBeTruthy();
    const rows = Array.from(section.querySelectorAll("dl > div"));
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.querySelector("dt")!.textContent)).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
    expect(rows[2].className).toContain("font-medium");
    expect(rows[1].className).not.toContain("font-medium");
    expect(rows[1].querySelector("dd")!.textContent).toBe("Closed");
    void user;
  });

  it("lists the number and site as contact rows", () => {
    page();
    const section = screen.getByRole("region", { name: "Hours and contact" });
    expect(within(section).getByRole("link", { name: "01 40 20 53 17" }).getAttribute("href")).toBe("tel:0140205317");
    expect(within(section).getByRole("link", { name: /louvre\.fr\/en/ }).getAttribute("href")).toBe("https://www.louvre.fr/en");
  });

  it("says when it is wheelchair accessible", () => {
    s.details = base({ accessibilityOptions: { wheelchairAccessibleSeating: true } });
    page();
    expect(screen.getByText("Wheelchair accessible")).toBeTruthy();
    cleanup();
    s.details = base({ accessibilityOptions: { wheelchairAccessibleEntrance: false } });
    page();
    expect(screen.queryByText("Wheelchair accessible")).toBeNull();
  });

  it("is absent when there is nothing to say, but still credits Google Maps", () => {
    s.details = base({ regularOpeningHours: undefined, nationalPhoneNumber: undefined, websiteUri: undefined });
    page();
    expect(screen.queryByRole("region", { name: "Hours and contact" })).toBeNull();
    expect(screen.getByRole("link", { name: "Google Maps" }).getAttribute("href")).toBe("https://maps.google.com/?cid=1");
  });

  it("shows a single day of hours without an 'All days' control", () => {
    s.details = base({ regularOpeningHours: { weekdayDescriptions: ["Monday: 9:00 AM – 5:00 PM"] } });
    page();
    expect(screen.queryByText("All days")).toBeNull();
  });
});

describe("PlaceDetailView: About", () => {
  it("shows the written blurb with its source", () => {
    s.about = { content: "A palace turned museum.", source: { title: "Louvre", url: "https://www.louvre.fr/en/about" } };
    page();
    expect(screen.getByText(/A palace turned museum\./)).toBeTruthy();
    expect(screen.getByRole("link", { name: "louvre.fr" })).toBeTruthy();
  });

  it("falls back to Google's one-liner, and shows a skeleton while the blurb is written", () => {
    page();
    expect(screen.getByText("World-famous art museum.")).toBeTruthy();
    cleanup();
    s.details = base({ editorialSummary: undefined });
    s.aboutLoading = true;
    page();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows type and amenity chips", () => {
    s.details = base({ outdoorSeating: true, reservable: true });
    page();
    const about = screen.getByRole("heading", { name: "About" }).closest("section")!;
    expect(within(about).getByText("Tourist Attraction")).toBeTruthy();
    expect(within(about).getByText("Outdoor seating")).toBeTruthy();
    expect(within(about).getByText("Reservable")).toBeTruthy();
  });

  it("is absent with nothing to say", () => {
    s.details = base({ editorialSummary: undefined, types: ["museum"], primaryType: "museum" });
    page();
    expect(screen.queryByRole("heading", { name: "About" })).toBeNull();
  });
});

describe("PlaceDetailView: photos", () => {
  it("shows a strip of the photos after the first, and opens one", async () => {
    const user = u();
    vi.useRealTimers();
    page();
    const buttons = screen.getAllByRole("button", { name: /Expand photo/ });
    expect(buttons).toHaveLength(2);
    expect(screen.getByTestId("lightbox").dataset.count).toBe("2");
    await user.click(buttons[1]);
    expect(lightbox.open).toHaveBeenCalledWith(1);
  });

  it("has no strip for a single photo, and ignores a photo with an odd name", () => {
    s.details = base({ photos: [PHOTO(1), { name: "bad" }] });
    page();
    expect(screen.queryByRole("heading", { name: "Photos" })).toBeNull();
  });
});

describe("PlaceDetailView: reviews", () => {
  it("shows the first review, and the rest on request", async () => {
    vi.useRealTimers();
    s.details = base({ reviews: [review({ text: { text: "First." } }), review({ text: { text: "Second." } }), review({ text: { text: "Third." } }), review({ text: { text: "Fourth." } }), review({ text: { text: "Fifth." } })] });
    const user = u();
    page();
    expect(screen.getByText("First.")).toBeTruthy();
    expect(screen.queryByText("Second.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show 3 more reviews" }));
    expect(screen.getByText("Fourth.")).toBeTruthy();
    expect(screen.queryByText("Fifth.")).toBeNull(); // only the first four are kept
    await user.click(screen.getByRole("button", { name: "Show fewer reviews" }));
    expect(screen.queryByText("Second.")).toBeNull();
  });

  it("words a single extra review in the singular", () => {
    s.details = base({ reviews: [review(), review()] });
    page();
    expect(screen.getByRole("button", { name: "Show 1 more review" })).toBeTruthy();
  });

  it("shows the author, stars and when, and falls back to the original text", () => {
    s.details = base({ reviews: [review({ text: undefined, originalText: { text: "Original words." }, rating: 4.4 })] });
    page();
    expect(screen.getByText("Original words.")).toBeTruthy();
    expect(screen.getByText("Ann")).toBeTruthy();
    expect(screen.getByRole("img", { name: "4 out of 5 stars" })).toBeTruthy();
    cleanup();
    s.details = base({ reviews: [review({ rating: 4.6 })] });
    page();
    expect(screen.getByRole("img", { name: "5 out of 5 stars" })).toBeTruthy();
    expect(screen.getByText("a week ago")).toBeTruthy();
  });

  it("leaves out reviews with no text, and names an unknown author", () => {
    s.details = base({ reviews: [review({ text: { text: "" } }), review({ authorAttribution: undefined, text: { text: "Anon." } })] });
    page();
    expect(screen.getByText("Google user")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /more review/ })).toBeNull();
  });

  it("clamps a long review until 'Read more'", async () => {
    vi.useRealTimers();
    s.details = base({ reviews: [review({ text: { text: "x".repeat(300) } })] });
    const user = u();
    page();
    const quote = document.querySelector("blockquote")!;
    expect(quote.className).toContain("line-clamp-5");
    await user.click(screen.getByRole("button", { name: "Read more" }));
    expect(quote.className).not.toContain("line-clamp-5");
    await user.click(screen.getByRole("button", { name: "Show less" }));
    expect(quote.className).toContain("line-clamp-5");
  });

  it("offers no toggle for a review of ordinary length, and no section without reviews", () => {
    s.details = base({ reviews: [review({ text: { text: "y".repeat(200) } })] });
    page();
    expect(screen.queryByRole("button", { name: "Read more" })).toBeNull();
    cleanup();
    s.details = base({ reviews: [] });
    page();
    expect(screen.queryByRole("heading", { name: "What people say" })).toBeNull();
  });
});

describe("PlaceDetailView: around it", () => {
  it("looks for things near the place", () => {
    page();
    expect(recs).toMatchObject({ tripId: TRIP, excludeId: "p1", anchorName: "Louvre Museum", cityHint: "Paris, France", primaryType: "museum", lat: 48.86, lng: 2.34 });
  });
});

describe("PlaceDetailView: on the phone", () => {
  beforeEach(() => { phoneV2 = true; });

  it("shows the photo, a save heart and a line about the place", () => {
    page();
    expect(screen.getByTestId("heart")).toBeTruthy();
    const line = screen.getByText(/Museum · Paris, France · \$\$/);
    expect(line).toBeTruthy();
    expect(screen.getByText("(12K)")).toBeTruthy();
  });

  it("says whether it is open and until when", () => {
    page();
    expect(screen.getByText("Open until 9:45 PM")).toBeTruthy();
    cleanup();
    s.details = base({ regularOpeningHours: { openNow: false, weekdayDescriptions: ["Monday: x", "Tuesday: x", "Wednesday: Closed"] } });
    page();
    expect(screen.getByText("Closed now")).toBeTruthy();
    cleanup();
    s.details = base({ regularOpeningHours: { openNow: true, weekdayDescriptions: ["Monday: Open 24 hours", "Tuesday: x", "Wednesday: Open 24 hours"] } });
    page();
    expect(screen.getByText("Open now")).toBeTruthy();
  });

  it("puts add and directions under the name, without a second save control", () => {
    page();
    const add = screen.getAllByRole("button", { name: "add Louvre Museum" }).find((b) => b.dataset.nosave === "true");
    expect(add).toBeTruthy();
  });
});
