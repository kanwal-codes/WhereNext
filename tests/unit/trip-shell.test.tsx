// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the trip's frame: the desktop sidebar (trip identity, nav, collapsing, "Continue planning"), the guest's closed
 * rows, the older mobile top bar with its menu sheet and tab bar, and the phone redesign's header and drawer. Panels, covers and routing are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let pathname = `/trips/${TRIP}/itinerary`;
let guest = false;
let wide = true;
let panelOpen = false;
let live: Any | null;
let unread = 0;
const openGate = vi.fn();
const prefetch = vi.fn();
let cover: Any | null = null;

vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ prefetch }) }));
vi.mock("next/link", () => ({ __esModule: true, default: ({ href, children, prefetch: _p, ...rest }: Any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => wide }));
vi.mock("@/components/TripPanelProvider", () => ({ useTripPanelMaybe: () => (panelOpen ? { panel: { kind: "place" } } : null) }));
vi.mock("@/features/identity/ui/GuestProvider", () => ({ useGuest: () => ({ guest, openGate }) }));
vi.mock("@/components/TripDataProvider", () => ({ useTripDataMaybe: () => (live ? { data: { trip: live } } : null) }));
vi.mock("@/lib/client/use-group-unread", () => ({ useGroupUnread: (_t: string, on: boolean) => (on ? unread : 0) }));
vi.mock("@/features/roam/ui/RoamMark", () => ({ RoamMark: () => <i data-testid="roam-mark" /> }));
vi.mock("@/components/BrandMark", () => ({ BrandMark: ({ variant }: Any) => <span>{`brand ${variant}`}</span> }));
vi.mock("@/components/trips/TripCover", () => ({ TripCover: ({ trip }: Any) => { cover = trip; return <div data-testid="cover">{trip.name}</div>; } }));
vi.mock("motion/react", () => ({ useReducedMotion: () => false, motion: { span: ({ className }: Any) => <span data-motion className={className} /> } }));
vi.mock("@/components/motion-primitives", () => ({
  motionTokens: { panelSpring: {} },
  Sheet: ({ open, children, ariaLabel }: Any) => (open ? <div role="dialog" aria-label={ariaLabel}>{children}</div> : null),
}));
vi.mock("@/components/shell/PhoneHeader", () => ({
  PhoneHeaderProvider: ({ children }: Any) => <div data-testid="phone-provider">{children}</div>,
  PhoneHeader: ({ tripName, onMenu, menuDot, pathname: p }: Any) => <header data-testid="phone-header" data-dot={String(Boolean(menuDot))} data-path={p}>{tripName}<button type="button" onClick={onMenu}>open menu</button></header>,
}));
vi.mock("@/components/shell/PhoneDrawer", () => ({ PhoneDrawer: ({ open, unread: n, onClose }: Any) => (open ? <div role="dialog" aria-label="phone drawer" data-unread={n}><button type="button" onClick={onClose}>close drawer</button></div> : null) }));

import { TripShell } from "../../components/TripShell";

const SHELL_TRIP = { name: "Lisbon long weekend", destination: "Lisbon", dates: "Oct 20 – 24", travellers: "2 travellers" };
const shell = (children: React.ReactNode = <p>page body</p>) => render(<TripShell tripId={TRIP} trip={SHELL_TRIP}>{children}</TripShell>);
const aside = () => document.querySelector("aside") as HTMLElement;
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const u = () => userEvent.setup({ pointerEventsCheck: 0 });

beforeEach(() => {
  pathname = `/trips/${TRIP}/itinerary`;
  guest = false; wide = true; panelOpen = false; unread = 0; cover = null;
  live = { name: "Lisbon long weekend", destination: "Lisbon", origin: null, duration_days: 4, start_date: null, end_date: null, travelers: 2, hero_photo_name: "places/x/photos/1" };
  openGate.mockClear(); prefetch.mockClear();
});
afterEach(cleanup);

describe("TripShell: the sidebar", () => {
  it("names the trip, where it is and when", () => {
    shell();
    const side = within(aside());
    expect(side.getByRole("heading", { name: "Lisbon long weekend" })).toBeTruthy();
    expect(side.getByText("Lisbon · Oct 20 – 24")).toBeTruthy();
  });

  it("lists the nine places in order, linking each under the trip", () => {
    shell();
    const nav = within(aside()).getByRole("navigation");
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Overview", "Roam", "Group chat", "Discover", "Getting around", "Stay", "Plan", "What Roam remembers", "Bookings"]);
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      `/trips/${TRIP}`, `/trips/${TRIP}/chat`, `/trips/${TRIP}/group`, `/trips/${TRIP}/discover`, `/trips/${TRIP}/map`, `/trips/${TRIP}/stay`, `/trips/${TRIP}/itinerary`, `/trips/${TRIP}/knowledge`, `/trips/${TRIP}/bookings`,
    ]);
  });

  it("marks the page you are on, and a page inside it", () => {
    shell();
    const current = (label: string) => within(aside()).getByRole("link", { name: label }).getAttribute("aria-current");
    expect(current("Plan")).toBe("page");
    expect(current("Overview")).toBeNull();
    cleanup();
    pathname = `/trips/${TRIP}/stay/hotel-1`;
    shell();
    expect(within(aside()).getByRole("link", { name: "Stay" }).getAttribute("aria-current")).toBe("page");
  });

  it("marks Overview only on the trip's own page, not every page under it", () => {
    pathname = `/trips/${TRIP}`;
    shell();
    expect(within(aside()).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    cleanup();
    pathname = `/trips/${TRIP}/discover`;
    shell();
    expect(within(aside()).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });

  it("warms the page on hover", async () => {
    const user = u();
    shell();
    await user.hover(within(aside()).getByRole("link", { name: "Discover" }));
    expect(prefetch).toHaveBeenCalledWith(`/trips/${TRIP}/discover`);
  });

  it("counts down to the trip", () => {
    live = { ...live, start_date: day(12) };
    shell();
    expect(within(aside()).getByText("12 days to go")).toBeTruthy();
    cleanup();
    live = { ...live, start_date: day(2) };
    shell();
    expect(within(aside()).getByText("2 days to go")).toBeTruthy();
    cleanup();
    live = { ...live, start_date: day(1) };
    shell();
    expect(within(aside()).getByText("Tomorrow")).toBeTruthy();
    cleanup();
    live = { ...live, start_date: day(0) };
    shell();
    expect(within(aside()).getByText("Starts today")).toBeTruthy();
    cleanup();
    live = { ...live, start_date: day(-3) };
    shell();
    expect(within(aside()).queryByText(/to go|Tomorrow|Starts today/)).toBeNull();
    cleanup();
    live = { ...live, start_date: null };
    shell();
    expect(within(aside()).queryByText(/to go/)).toBeNull();
  });

  it("leaves out the separator when the trip has no destination or no dates", () => {
    const { rerender } = render(<TripShell tripId={TRIP} trip={{ ...SHELL_TRIP, destination: "" }}><p>x</p></TripShell>);
    expect(within(aside()).getByText("Oct 20 – 24")).toBeTruthy();
    rerender(<TripShell tripId={TRIP} trip={{ ...SHELL_TRIP, dates: "" }}><p>x</p></TripShell>);
    expect(within(aside()).getByText("Lisbon")).toBeTruthy();
    rerender(<TripShell tripId={TRIP} trip={{ ...SHELL_TRIP, dates: "", destination: "" }}><p>x</p></TripShell>);
    expect(within(aside()).queryByText(/·/)).toBeNull();
  });

  it("shows the cover photo only where the sidebar is on show", () => {
    shell();
    expect(screen.getAllByTestId("cover").length).toBeGreaterThan(0);
    expect(cover).toMatchObject({ id: TRIP, name: "Lisbon long weekend", hero_photo_name: "places/x/photos/1", saved_photo_name: null });
    cleanup();
    wide = false;
    shell();
    expect(within(aside()).queryByTestId("cover")).toBeNull();
  });

  it("has no cover before the trip's data is there", () => {
    live = null;
    shell();
    expect(within(aside()).queryByTestId("cover")).toBeNull();
    expect(within(aside()).getByRole("heading", { name: "Lisbon long weekend" })).toBeTruthy();
  });
});

describe("TripShell: collapsing the sidebar", () => {
  it("narrows the column and brings it back", async () => {
    const user = u();
    shell();
    const frame = aside().parentElement as HTMLElement;
    expect(frame.style.gridTemplateColumns).toBe("264px minmax(0,1fr)");
    await user.click(within(aside()).getByRole("button", { name: "Collapse sidebar" }));
    expect(frame.style.gridTemplateColumns).toBe("76px minmax(0,1fr)");
    await user.click(within(aside()).getByRole("button", { name: "Expand sidebar" }));
    expect(frame.style.gridTemplateColumns).toBe("264px minmax(0,1fr)");
  });

  it("keeps the hidden header out of reach while the other shows", async () => {
    const user = u();
    shell();
    const blocks = () => Array.from(aside().querySelectorAll("[inert]"));
    expect(blocks()).toHaveLength(1);
    expect(blocks()[0].textContent).toContain("brand compact");
    await user.click(within(aside()).getByRole("button", { name: "Collapse sidebar" }));
    expect(blocks()).toHaveLength(1);
    expect(blocks()[0].textContent).toContain("Lisbon long weekend");
  });

  it("slides the sidebar on its own width when a side panel is open", async () => {
    panelOpen = true;
    const user = u();
    shell();
    expect(aside().style.width).toBe("264px");
    await user.click(within(aside()).getByRole("button", { name: "Collapse sidebar" }));
    expect(aside().style.width).toBe("76px");
    cleanup();
    panelOpen = false;
    shell();
    expect(aside().style.width).toBe("");
  });

  it("links the brand mark to all trips", () => {
    shell();
    expect(within(aside()).getByRole("link", { name: "Where next? — all trips" }).getAttribute("href")).toBe("/trips");
  });
});

describe("TripShell: tools under the nav", () => {
  it("offers all trips and Continue planning", () => {
    shell();
    const tools = within(aside()).getByRole("group", { name: "Trip tools" });
    expect(within(tools).getByRole("link", { name: "All trips" }).getAttribute("href")).toBe("/trips");
    expect(within(tools).getByRole("link", { name: /Continue planning/ }).getAttribute("href")).toBe(`/trips/${TRIP}/chat`);
  });

  it("does not offer it where it would repeat or point at itself", () => {
    for (const p of [`/trips/${TRIP}/chat`, `/trips/${TRIP}`, `/trips/${TRIP}/`]) {
      cleanup();
      pathname = p;
      shell();
      expect(within(aside()).queryByRole("link", { name: /Continue planning/ })).toBeNull();
    }
  });

  it("is not there at all for a guest", () => {
    guest = true;
    shell();
    expect(within(aside()).queryByRole("group", { name: "Trip tools" })).toBeNull();
  });
});

describe("TripShell: a guest", () => {
  it("can open Roam, and every other row asks for an account", async () => {
    guest = true;
    const user = u();
    shell();
    const nav = within(aside()).getByRole("navigation");
    expect(within(nav).getByRole("link", { name: "Roam" }).getAttribute("href")).toBe(`/trips/${TRIP}/chat`);
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
    await user.click(within(nav).getByRole("button", { name: "Stay, needs an account" }));
    expect(openGate).toHaveBeenCalledWith("open stay");
    await user.click(within(nav).getByRole("button", { name: "What Roam remembers, needs an account" }));
    expect(openGate).toHaveBeenLastCalledWith("open what roam remembers");
  });

  it("takes the brand mark to the landing page", () => {
    guest = true;
    shell();
    expect(within(aside()).getByRole("link", { name: "Where next? — all trips" }).getAttribute("href")).toBe("/");
  });
});

describe("TripShell: the page area", () => {
  it("shows the page", () => {
    shell(<p>page body</p>);
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("leaves room for the tab bar, except in the conversations", () => {
    shell();
    expect(document.querySelector("main")?.className).toContain("max-lg:pb-[var(--tabbar)]");
    for (const p of [`/trips/${TRIP}/chat`, `/trips/${TRIP}/group`]) {
      cleanup();
      pathname = p;
      shell();
      expect(document.querySelector("main")?.className).not.toContain("pb-[var(--tabbar)]");
    }
    cleanup();
    pathname = `/trips/${TRIP}/group/details`;
    shell();
    expect(document.querySelector("main")?.className).toContain("max-lg:pb-[var(--tabbar)]");
  });

  it("marks the frame for the phone styles, inside the header provider", () => {
    shell();
    expect(aside().parentElement?.hasAttribute("data-phone-v2")).toBe(true);
    expect(screen.getByTestId("phone-provider")).toBeTruthy();
  });
});

describe("TripShell: the phone redesign", () => {
  beforeEach(() => { });

  it("has the phone header and drawer, and no older top bar or tab bar", async () => {
    const user = u();
    shell();
    expect(document.querySelector("[data-trip-topbar]")).toBeNull();
    expect(document.querySelector("[data-trip-tabbar]")).toBeNull();
    expect(screen.getByTestId("phone-header").textContent).toContain("Lisbon long weekend");
    expect(screen.getByTestId("phone-header").dataset.path).toBe(`/trips/${TRIP}/itinerary`);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "open menu" }));
    expect(screen.getByRole("dialog", { name: "phone drawer" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "close drawer" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("puts unread group messages on the menu, except while reading them", () => {
    unread = 3;
    shell();
    expect(screen.getByTestId("phone-header").dataset.dot).toBe("true");
    cleanup();
    pathname = `/trips/${TRIP}/group`;
    shell();
    expect(screen.getByTestId("phone-header").dataset.dot).toBe("false");
    cleanup();
    unread = 0;
    pathname = `/trips/${TRIP}/itinerary`;
    shell();
    expect(screen.getByTestId("phone-header").dataset.dot).toBe("false");
  });

  it("gives the drawer the count, and counts nothing for a guest", async () => {
    unread = 4;
    const user = u();
    shell();
    await user.click(screen.getByRole("button", { name: "open menu" }));
    expect(screen.getByRole("dialog", { name: "phone drawer" }).dataset.unread).toBe("4");
    cleanup();
    guest = true;
    shell();
    await user.click(screen.getByRole("button", { name: "open menu" }));
    expect(screen.getByRole("dialog", { name: "phone drawer" }).dataset.unread).toBe("0");
  });
});
