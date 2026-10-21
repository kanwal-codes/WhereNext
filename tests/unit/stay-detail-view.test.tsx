// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the hotel detail (page and side panel): its states, the rooms and rates, facilities, reviews, the
 * quick actions and the ways to ask Roam. The data hook and the heavy neighbours are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let s: Any;
let panelCtx: Any | null;
const lockRoom = vi.fn();
const retry = vi.fn();
let hero: Any = {};
let lightbox: Any = {};

vi.mock("@/features/stays/application/useStayDetails", () => ({ useStayDetails: () => s }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => panelCtx }));
vi.mock("@/lib/use-document-title", () => ({ useDocumentTitle: (t: string | null) => (t ? <title data-testid="doc-title">{t}</title> : null) }));
vi.mock("@/components/Hero", () => ({ Hero: (p: Any) => { hero = p; return <div data-testid="hero">{p.ratingBadge}{p.children}<button type="button" onClick={() => p.onCoverError?.(p.coverImages[0])}>photo a failed</button></div>; } }));
vi.mock("@/components/BackLink", () => ({ BackLink: ({ fallback }: Any) => <a href={fallback}>Back</a> }));
vi.mock("@/components/NearbyEvents", () => ({ NearbyEvents: ({ location }: Any) => <div data-testid="events">{location}</div> }));
vi.mock("@/features/stays/ui/NearbyStays", () => ({ NearbyStays: ({ location }: Any) => <div data-testid="nearby-stays">{location}</div> }));
vi.mock("@/components/NearbyRecommendations", () => ({ NearbyRecommendations: () => <div data-testid="recs" /> }));
vi.mock("@/components/PanelStates", () => ({
  PANEL_PAD: "pad", PANEL_HERO: "hero",
  PanelLoading: ({ what, panel }: Any) => <div>loading {what} {String(panel)}</div>,
  PanelError: ({ what, onRetry }: Any) => <button type="button" onClick={onRetry}>retry {what}</button>,
}));
vi.mock("@/components/motion-primitives", () => ({ Reveal: ({ children }: Any) => <div>{children}</div>, WordReveal: ({ text }: Any) => <h1>{text}</h1> }));
vi.mock("@/components/PhotoLightbox", () => ({
  usePhotoLightbox: () => lightbox,
  PhotoLightbox: ({ photos, index }: Any) => <div data-testid="lightbox" data-count={photos.length} data-index={String(index)} />,
}));
vi.mock("@/features/stays/ui/GoogleStayParts", () => ({
  StayNearby: ({ nearby }: Any) => <div data-testid="stay-nearby">{nearby.length}</div>,
  StayThemes: ({ themes }: Any) => <div data-testid="themes">{themes.length}</div>,
  WhereToBook: () => <div data-testid="where-to-book" />,
}));

import { StayDetailView } from "../../features/stays/ui/StayDetailView";

const hotel = (over: Any = {}) => ({ hotelId: "h1", name: "Hotel Lutetia", description: "A grand hotel.", images: ["a", "b", "c"], facilities: [], address: "45 Bd Raspail", city: "Paris", country: "fr", latitude: 48.85, longitude: 2.32, stars: 5, rating: 9.1, checkinFrom: "15:00", checkout: "11:00", ...over });
const room = (over: Any = {}) => ({ name: "Deluxe", rateId: "r1", offerId: "o1", boardName: "Breakfast", refundable: true, cancelBefore: "2026-11-28T12:00:00Z", maxOccupancy: 2, nightlyAmount: 300, totalAmount: 1200, currency: "EUR", taxesAndFees: 80, ...over });
const review = (over: Any = {}) => ({ rating: 9, headline: "Lovely", positives: "Staff", negatives: null, text: null, date: null, travellerType: "family_with_children", country: "se", name: "Ann", ...over });
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  s = {
    state: "ready", hotel: hotel(), rooms: [room()], reviews: [], sentiment: null, roomsUnavailable: false, nights: 4, checkin: "2026-12-01", checkout: "2026-12-05", currency: "EUR",
    assumedDates: false, retry, lockedStay: null, busy: false, lockRoom, google: false, sources: [], priceRead: null, themes: [], ratingCounts: [], nearby: [], phone: null, website: null,
  };
  panelCtx = null; hero = {}; lightbox = { index: null, open: vi.fn(), close: vi.fn() };
  lockRoom.mockClear(); retry.mockClear();
});
afterEach(cleanup);

const page = (props: Any = {}) => render(<StayDetailView tripId={TRIP} hotelId="h1" {...props} />);
const panel = (props: Any = {}) => render(<StayDetailView tripId={TRIP} hotelId="h1" variant="panel" {...props} />);

describe("StayDetailView: states", () => {
  it("shows a loading state", () => {
    s.state = "loading";
    page();
    expect(screen.getByText("loading this hotel false")).toBeTruthy();
    cleanup();
    panel();
    expect(screen.getByText("loading this hotel true")).toBeTruthy();
  });

  it("offers a retry and, on the page, a way back", async () => {
    s.state = "error";
    const user = u();
    page();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(`/trips/${TRIP}/stay`);
    await user.click(screen.getByRole("button", { name: "retry this hotel" }));
    expect(retry).toHaveBeenCalled();
    cleanup();
    panel();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
  });
});

describe("StayDetailView: the top", () => {
  it("names the hotel, its stars and address, and titles the page", () => {
    page();
    expect(screen.getByRole("heading", { name: "Hotel Lutetia" })).toBeTruthy();
    expect(screen.getByText("Hotel · 5-star")).toBeTruthy();
    expect(screen.getByText("45 Bd Raspail, Paris, fr")).toBeTruthy();
    expect(document.title).toBe("Hotel Lutetia");
    expect(screen.getByTestId("hero").textContent).toContain("9.1");
    cleanup();
    panel();
  });

  it("falls back to the name the card showed, then to 'Hotel'", () => {
    s.hotel = null;
    page({ seedName: "Seed Name" });
    expect(screen.getByRole("heading", { name: "Seed Name" })).toBeTruthy();
    cleanup();
    page();
    expect(screen.getByRole("heading", { name: "Hotel" })).toBeTruthy();
    expect(screen.getByText("Hotel", { selector: "p" })).toBeTruthy();
  });

  it("shows when you can arrive and leave", () => {
    page();
    expect(screen.getByText("Check-in")).toBeTruthy();
    expect(screen.getByText("Check-out")).toBeTruthy();
    expect(screen.getByText("3:00 PM")).toBeTruthy();
    expect(screen.getByText("11:00 AM")).toBeTruthy();
    cleanup();
    s.hotel = hotel({ checkinFrom: null, checkout: null });
    page();
    expect(screen.queryByText("Check-in")).toBeNull();
  });

  it("links to directions by coordinates, else by name and address, and to the phone and site when known", () => {
    s.phone = "+33 1 49 54 46 46";
    s.website = "https://lutetia.example";
    page();
    expect(screen.getByRole("link", { name: /Directions/ }).getAttribute("href")).toBe("https://www.google.com/maps/dir/?api=1&destination=48.85,2.32");
    expect(screen.getByRole("link", { name: /Call/ }).getAttribute("href")).toBe("tel:+33149544646");
    expect(screen.getByRole("link", { name: /Website/ }).getAttribute("href")).toBe("https://lutetia.example");
    cleanup();
    s.hotel = hotel({ latitude: null, longitude: null });
    s.phone = null; s.website = "javascript:alert(1)";
    page();
    expect(screen.getByRole("link", { name: /Directions/ }).getAttribute("href")).toBe(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Hotel Lutetia, 45 Bd Raspail, Paris")}`);
    expect(screen.queryByRole("link", { name: /Call/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Website/ })).toBeNull();
  });

  it("describes the stay, or says there is no description", () => {
    page();
    expect(screen.getByText("A grand hotel.")).toBeTruthy();
    cleanup();
    s.hotel = hotel({ description: null });
    page();
    expect(screen.getByText("No description available for this hotel yet.")).toBeTruthy();
  });
});

describe("StayDetailView: rooms and rates", () => {
  it("lists rooms with their terms and price, for the dates", () => {
    page();
    const rooms = screen.getByRole("region", { name: /Rooms/ });
    expect(within(rooms).getByText("Dec 1 – Dec 5 · 4 nights")).toBeTruthy();
    expect(within(rooms).getByText("Deluxe")).toBeTruthy();
    expect(within(rooms).getByText("Breakfast")).toBeTruthy();
    expect(within(rooms).getByText("Free cancellation until Nov 28")).toBeTruthy();
    expect(within(rooms).getByText("2 guests")).toBeTruthy();
    expect(within(rooms).getByText(/€300/)).toBeTruthy();
    expect(within(rooms).getByText(/€1,200 total · incl\. €80 taxes/)).toBeTruthy();
  });

  it("words the other cancellation terms", () => {
    s.rooms = [room({ cancelBefore: null }), room({ rateId: "r2", refundable: false, maxOccupancy: 1 })];
    page();
    expect(screen.getByText("Refundable")).toBeTruthy();
    expect(screen.getByText("Non-refundable")).toBeTruthy();
    expect(screen.getByText("1 guest")).toBeTruthy();
  });

  it("chooses a room", async () => {
    const user = u();
    page();
    await user.click(screen.getByRole("button", { name: "Choose this room" }));
    expect(lockRoom).toHaveBeenCalledWith(s.rooms[0]);
  });

  it("shows saving while it is saved, and marks the room already chosen", () => {
    s.busy = true;
    page();
    expect(screen.getByRole("button", { name: "Saving…" }).hasAttribute("disabled")).toBe(true);
    cleanup();
    s.busy = false;
    s.lockedStay = { hotelId: "h1", rateId: "r1", roomName: "Deluxe" };
    s.rooms = [room(), room({ rateId: "r2", name: "Suite" })];
    page();
    expect(screen.getByText("Your stay")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Choose this room" })).toHaveLength(1);
  });

  it("matches the chosen room by its rate, not by a name two rooms share", () => {
    s.lockedStay = { hotelId: "h1", rateId: "r2", roomName: "Deluxe" };
    s.rooms = [room({ rateId: "r1", name: "Deluxe" }), room({ rateId: "r2", name: "Deluxe" })];
    page();
    expect(screen.getAllByText("Your stay")).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Choose this room" })).toHaveLength(1);
  });

  it("matches the chosen room by name when the rate has no id, and ignores another hotel's choice", () => {
    s.lockedStay = { hotelId: "h1", rateId: null, roomName: "Deluxe" };
    page();
    expect(screen.getByText("Your stay")).toBeTruthy();
    cleanup();
    s.lockedStay = { hotelId: "other", rateId: "r1", roomName: "Deluxe" };
    page();
    expect(screen.queryByText("Your stay")).toBeNull();
  });

  it("shows three rooms, and the rest on request", async () => {
    s.rooms = Array.from({ length: 5 }, (_, i) => room({ rateId: `r${i}`, name: `Room ${i}` }));
    const user = u();
    page();
    expect(screen.getAllByRole("button", { name: "Choose this room" })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Show all 5 rooms" }));
    expect(screen.getAllByRole("button", { name: "Choose this room" })).toHaveLength(5);
    await user.click(screen.getByRole("button", { name: "Show fewer rooms" }));
    expect(screen.getAllByRole("button", { name: "Choose this room" })).toHaveLength(3);
  });

  it("explains missing rates and example dates", () => {
    s.rooms = null; s.roomsUnavailable = true;
    page();
    expect(screen.getByText(/No rates came back for these dates/)).toBeTruthy();
    cleanup();
    s.rooms = []; s.roomsUnavailable = false; s.assumedDates = true;
    page();
    expect(screen.getByText(/No rates came back/)).toBeTruthy();
    expect(screen.getByText(/These are example dates/)).toBeTruthy();
  });

  it("shows where to book instead of rooms for a Google Hotels result", () => {
    s.google = true;
    page();
    expect(screen.getByTestId("where-to-book")).toBeTruthy();
    expect(screen.queryByRole("region", { name: /Rooms/ })).toBeNull();
  });
});

describe("StayDetailView: facilities", () => {
  it("shows the facilities that matter as badges, the rest in groups that open", async () => {
    s.hotel = hotel({ facilities: ["Free WiFi", "WiFi available", "Restaurant", "Spa", "Garden", "Lift", "Concierge", "Luggage storage"] });
    const user = u();
    page();
    const section = screen.getByRole("heading", { name: /What.s included/ }).closest("section")!;
    expect(within(section).getByText("Free WiFi")).toBeTruthy();
    expect(within(section).queryByText("WiFi available")).toBeNull(); // the same fact, said twice
    expect(within(section).getByText("Restaurant")).toBeTruthy();
    expect(within(section).queryByText("Spa")).toBeNull();
    const services = within(section).getByRole("button", { name: /Services/ });
    expect(services.getAttribute("aria-expanded")).toBe("false");
    await user.click(services);
    expect(within(section).getByText("Concierge")).toBeTruthy();
    expect(within(section).getByText("Luggage storage")).toBeTruthy();
    await user.click(within(section).getByRole("button", { name: /On site/ }));
    expect(within(section).getByText("Spa")).toBeTruthy();
    expect(within(section).queryByText("Concierge")).toBeNull();
  });

  it("groups food and drink, comfort and services by what they are", async () => {
    s.hotel = hotel({ facilities: ["Coffee shop", "Wheelchair access", "Laundry service", "Terrace"] });
    page();
    const section = screen.getByRole("heading", { name: /What.s included/ }).closest("section")!;
    expect(within(section).getAllByRole("button").map((b) => b.textContent?.replace(/\d/g, "").trim())).toEqual(["Food & drink", "Comfort", "Services", "On site"]);
  });

  it("says when none of the facilities are the headline ones, and is absent with none at all", () => {
    s.hotel = hotel({ facilities: ["Spa"] });
    page();
    expect(screen.getByText("Amenities will appear here when the hotel provides them.")).toBeTruthy();
    cleanup();
    s.hotel = hotel({ facilities: [] });
    page();
    expect(screen.queryByRole("heading", { name: /What.s included/ })).toBeNull();
  });
});

describe("StayDetailView: facilities, edges", () => {
  it("leaves the headline facilities out of the group counts, and closes a group on a second press", async () => {
    s.hotel = hotel({ facilities: ["Free WiFi", "Lift"] });
    const user = u();
    page();
    const section = screen.getByRole("heading", { name: /What.s included/ }).closest("section")!;
    const comfort = within(section).getByRole("button", { name: /Comfort/ });
    expect(comfort.textContent).toContain("1");
    await user.click(comfort);
    expect(within(section).getAllByText("Lift").length).toBe(1);
    expect(within(section).getAllByText("Free WiFi").length).toBe(1); // the badge above, not repeated in the group
    await user.click(comfort);
    expect(within(section).queryByText("Lift")).toBeNull();
  });

  it("offers no group whose facilities are all headline ones, and one headline fact is enough for the badges", () => {
    s.hotel = hotel({ facilities: ["Free WiFi"] });
    page();
    const section = screen.getByRole("heading", { name: /What.s included/ }).closest("section")!;
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).getByText("Free WiFi")).toBeTruthy();
    expect(screen.queryByText("Amenities will appear here when the hotel provides them.")).toBeNull();
  });
});


describe("StayDetailView: photos", () => {
  it("shows a strip of the photos after the cover, and opens one", async () => {
    const user = u();
    page();
    const buttons = screen.getAllByRole("button", { name: /Expand photo/ });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1]);
    expect(lightbox.open).toHaveBeenCalledWith(1);
    expect(screen.getByTestId("lightbox").dataset.count).toBe("2");
  });

  it("has no strip for a single photo", () => {
    s.hotel = hotel({ images: ["a"] });
    page();
    expect(screen.queryByRole("heading", { name: "Photos" })).toBeNull();
  });

  it("drops a photo that fails to load", async () => {
    const user = u();
    page();
    expect(hero.coverImages).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "photo a failed" }));
    expect(hero.coverImages).toHaveLength(2);
  });
});

describe("StayDetailView: photos, edges", () => {
  it("has a strip for two photos (the cover and one more)", () => {
    s.hotel = hotel({ images: ["a", "b"] });
    page();
    expect(screen.getAllByRole("button", { name: /Expand photo/ })).toHaveLength(1);
  });

  it("drops a strip photo that fails to load, from the strip and the cover alike", () => {
    page();
    const imgs = document.querySelectorAll("section img");
    expect(imgs).toHaveLength(2);
    fireEvent.error(imgs[0]);
    expect(screen.getAllByRole("button", { name: /Expand photo/ })).toHaveLength(1);
    expect(hero.coverImages).toHaveLength(2);
  });
});

/** The stacked list a wide screen shows (the phone gets a row of swipeable cards instead; both are in the page). */
const wideReviews = () => within(document.querySelector(".divide-y.max-lg\\:hidden") as HTMLElement);

describe("StayDetailView: what guests say", () => {
  it("averages the ratings and shows the first three written reviews", () => {
    s.reviews = [review({ rating: 10 }), review({ rating: 8, headline: "Fine", positives: null, negatives: "Noisy" }), review({ rating: null, headline: "No score", positives: null, text: "Plain text" }), review({ headline: "Fourth" })];
    s.sentiment = "Guests love the staff.";
    page();
    expect(document.querySelector(".font-display.text-4xl")?.textContent).toBe("9.0");
    expect(screen.getByText(/from 3 recent reviews/)).toBeTruthy();
    expect(screen.getByText("Guests love the staff.")).toBeTruthy();
    expect(wideReviews().getByText("Lovely", { exact: false })).toBeTruthy();
    expect(wideReviews().queryByText("Fourth")).toBeNull();
    expect(wideReviews().getByText("Guest note")).toBeTruthy();
    expect(screen.getAllByText("Family with children · Sweden").length).toBeGreaterThan(0);
  });

  it("shows the rest of the reviews on request", async () => {
    s.reviews = Array.from({ length: 5 }, (_, i) => review({ headline: `Review ${i}` }));
    const user = u();
    page();
    expect(wideReviews().queryByText("Review 4")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 5 reviews" }));
    expect(wideReviews().getByText("Review 4")).toBeTruthy();
  });

  it("leaves out reviews with nothing written, and the whole block when there is nothing to say", () => {
    s.reviews = [review({ rating: 7, headline: null, positives: null, negatives: null, text: null })];
    page();
    expect(screen.getByText(/from 1 recent review$/)).toBeTruthy();
    expect(screen.queryByText("7.0/10")).toBeNull();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
    cleanup();
    s.reviews = [];
    page();
    expect(screen.queryByRole("heading", { name: "What guests say" })).toBeNull();
  });

  it("names the reviewer only for Google Hotels", () => {
    s.reviews = [review()];
    page();
    expect(screen.queryByText(/Ann/)).toBeNull();
    cleanup();
    s.google = true;
    page();
    expect(wideReviews().getByText(/Ann/)).toBeTruthy();
  });

  it("shows the themes guests mention, and the nearby places", () => {
    s.themes = [{ name: "Staff" }]; s.nearby = [{ name: "Louvre" }];
    page();
    expect(screen.getByTestId("themes").textContent).toBe("1");
    expect(screen.getByTestId("stay-nearby").textContent).toBe("1");
  });

  it("lets the phone swipe through the reviews as cards", () => {
    
    s.reviews = [review({ headline: "Swipe me" })];
    page();
    expect(screen.getAllByText("Swipe me").length).toBeGreaterThan(1);
    expect(screen.queryByText(/Ann/)).toBeNull();
    cleanup();
    s.google = true;
    page();
    expect(screen.getAllByText(/Ann/).length).toBeGreaterThan(1);
  });
});

describe("StayDetailView: what guests say, edges", () => {
  it("offers the rest as soon as there are more than three", () => {
    s.reviews = Array.from({ length: 4 }, (_, i) => review({ headline: `Review ${i}` }));
    page();
    expect(screen.getByRole("button", { name: "Show all 4 reviews" })).toBeTruthy();
    cleanup();
    s.reviews = Array.from({ length: 3 }, (_, i) => review({ headline: `Review ${i}` }));
    page();
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("names a Google reviewer even when nothing else is known about them", () => {
    s.reviews = [review({ travellerType: null, country: null })];
    page();
    expect(screen.queryByText("Ann")).toBeNull();
    expect(document.querySelector("figcaption")).toBeNull();
    cleanup();
    s.google = true;
    page();
    expect(wideReviews().getByText("Ann")).toBeTruthy();
  });

  it("swipes through at most eight cards on a phone", () => {
    
    s.reviews = Array.from({ length: 10 }, (_, i) => review({ headline: `Review ${i}` }));
    page();
    const row = document.querySelector(".snap-x.lg\\:hidden") as HTMLElement;
    expect(row.querySelectorAll("figure")).toHaveLength(8);
  });

  it("gives a phone card without a headline more room for its text", () => {
    
    s.reviews = [review({ headline: null, positives: "Very quiet at night" })];
    page();
    const row = document.querySelector(".snap-x.lg\\:hidden") as HTMLElement;
    expect(within(row).getByText("Very quiet at night").className).toContain("line-clamp-3");
    cleanup();
    s.reviews = [review({ positives: "Very quiet at night" })];
    page();
    const row2 = document.querySelector(".snap-x.lg\\:hidden") as HTMLElement;
    expect(within(row2).getByText("Very quiet at night").className).toContain("line-clamp-2");
  });

  it("only draws the rule beside the verdict when there is a score", () => {
    s.sentiment = "Guests love it.";
    page();
    expect(screen.getByText("Guests love it.").className).not.toContain("sm:border-l");
    cleanup();
    s.reviews = [review()];
    page();
    expect(screen.getByText("Guests love it.").className).toContain("sm:border-l");
  });
});

describe("StayDetailView: asking Roam", () => {
  it("links the page to a ready-written question", () => {
    page();
    const link = screen.getByRole("link", { name: /Does Hotel Lutetia fit your trip/ });
    expect(link.getAttribute("href")).toContain(`/trips/${TRIP}/chat`);
    expect(decodeURIComponent(link.getAttribute("href")!)).toContain("Hotel Lutetia");
  });

  it("hands the question to the chat beside the panel and closes the panel", async () => {
    const onAsk = vi.fn();
    panelCtx = { closePanel: vi.fn() };
    const user = u();
    panel({ onAsk });
    await user.click(screen.getByRole("button", { name: /Does Hotel Lutetia fit your trip/ }));
    expect(onAsk).toHaveBeenCalledWith("Does Hotel Lutetia fit my trip — my budget, pace, and what I've saved so far?\nHotel Lutetia — 45 Bd Raspail");
    expect(panelCtx.closePanel).toHaveBeenCalled();
  });

  it("has no ask button in a panel without a chat to ask", () => {
    panel();
    expect(screen.queryByRole("button", { name: /fit your trip/ })).toBeNull();
  });
});

describe("StayDetailView: around it", () => {
  it("shows other stays, recommendations and events near the hotel", () => {
    page();
    expect(screen.getByTestId("nearby-stays").textContent).toBe("Paris");
    expect(screen.getByTestId("recs")).toBeTruthy();
    expect(screen.getByTestId("events").textContent).toBe("Paris");
  });

  it("has no events without a place to look near", () => {
    s.hotel = hotel({ city: null, address: null });
    page();
    expect(screen.queryByTestId("events")).toBeNull();
  });

  it("keeps the page's back link and a larger hero off the panel", () => {
    page();
    expect(screen.getByRole("link", { name: "Back" })).toBeTruthy();
    expect(hero.kenBurns).toBe(true);
    cleanup();
    panel();
    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    expect(hero.kenBurns).toBe(false);
    expect(hero.surface).toBe(true);
  });
});

