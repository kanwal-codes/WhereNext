// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the account page: what Save sends, how the home airport, city and country relate, the password,
 * Google, travel-style, dream-destination, sharing, avatar and delete flows. Auth, network and heavy children are faked.
 */
const toast = vi.fn();
const refresh = vi.fn();
const auth = {
  updateName: vi.fn(), updateEmail: vi.fn(), updatePassword: vi.fn(), disconnectGoogle: vi.fn(), signInWithGoogle: vi.fn(), signOut: vi.fn(), uploadAvatar: vi.fn(),
};
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/features/identity/application/authClient", () => ({
  updateName: (...a: unknown[]) => auth.updateName(...a), updateEmail: (...a: unknown[]) => auth.updateEmail(...a), updatePassword: (...a: unknown[]) => auth.updatePassword(...a),
  disconnectGoogle: (...a: unknown[]) => auth.disconnectGoogle(...a), signInWithGoogle: (...a: unknown[]) => auth.signInWithGoogle(...a), signOut: (...a: unknown[]) => auth.signOut(...a),
  uploadAvatar: (...a: unknown[]) => auth.uploadAvatar(...a),
}));
// The style card swaps its read and edit views with AnimatePresence mode="wait", which waits for an exit animation jsdom never finishes.
vi.mock("motion/react", async (importOriginal) => ({ ...(await importOriginal<typeof import("motion/react")>()), AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/StandaloneTopBar", () => ({ StandaloneTopBar: () => null }));
vi.mock("@/lib/use-dark-mode", () => ({ useIsDarkMode: () => false }));
vi.mock("@/components/DestinationCombobox", () => ({
  DestinationCombobox: ({ endpoint, value, onChange, onSelect, onPick, ariaLabel, disabled }: { endpoint: string; value: string; onChange: (v: string) => void; onSelect?: (v: string) => void; onPick?: (s: { placeId: string; text: string }) => void; ariaLabel?: string; disabled?: boolean }) => (
    <div>
      <input aria-label={ariaLabel ?? endpoint} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      <button type="button" onClick={() => (onPick ? onPick({ placeId: "YYZ", text: "Toronto Pearson International Airport" }) : onSelect?.(value))}>{`pick ${ariaLabel ?? endpoint}`}</button>
    </div>
  ),
}));

import { AccountView } from "../../features/profile/ui/AccountView";

type Call = { method: string; url: string; body?: Record<string, unknown> };
let calls: Call[];
let handlers: Array<(c: Call) => { status?: number; json?: unknown } | undefined>;
const assign = vi.fn();

const profile = (over: Record<string, unknown> = {}) => ({ homeAirport: "YYZ", homeCity: "Toronto, Canada", country: "CA", language: "en", bio: "", interests: ["Hiking"], dietaryNeeds: [], pace: "Balanced", budget: "Considered", stayType: "Hotel", groupType: "Friends", ...over }) as never;
const show = (over: Partial<React.ComponentProps<typeof AccountView>> = {}) =>
  render(<AccountView userId="u1" initialName="Sam Rivera" avatarUrl={null} email="sam@example.com" emailVerified tripCount={4} destinationCount={9} providers={["email"]} profile={profile()} sharedTrips={[]} {...over} />);
const profilePuts = () => calls.filter((c) => c.method === "PUT" && c.url === "/api/profile");
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const input = (label: string) => {
  // The page's Field labels are not linked to their inputs (see the accessibility test below), so plain fields are found by what they hold.
  const byValue: Record<string, () => HTMLElement> = { "Full name": () => screen.getByDisplayValue("Sam Rivera"), Email: () => screen.getByDisplayValue(/@example\.com$/) };
  return (byValue[label]?.() ?? screen.getByLabelText(label)) as HTMLInputElement;
};
const selects = () => screen.getAllByRole("combobox") as HTMLSelectElement[];

beforeEach(() => {
  toast.mockClear();
  refresh.mockClear();
  assign.mockClear();
  Object.values(auth).forEach((f) => f.mockReset());
  auth.updateName.mockResolvedValue({ error: null });
  auth.updateEmail.mockResolvedValue({ error: null });
  auth.updatePassword.mockResolvedValue({ error: null });
  auth.disconnectGoogle.mockResolvedValue({ error: null });
  auth.signInWithGoogle.mockResolvedValue({});
  auth.signOut.mockResolvedValue(undefined);
  auth.uploadAvatar.mockResolvedValue({ error: null, url: "https://img/avatar.png" });
  handlers = [];
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const call: Call = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    for (const h of handlers) {
      const out = h(call);
      if (out) return new Response(JSON.stringify(out.json ?? {}), { status: out.status ?? 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }));
  vi.stubGlobal("location", { href: "http://app.test/account", origin: "http://app.test", assign });
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountView: the page", () => {
  it("shows the name and the counts of trips and places", () => {
    show();
    expect(document.body.textContent).toContain("Sam");
    expect(screen.getByText("Trips planned").parentElement!.textContent).toContain("4");
    expect(screen.getByText("Places").parentElement!.textContent).toContain("9");
  });

  it("shows the email, as verified when it is", () => {
    show();
    expect(input("Email").value).toBe("sam@example.com");
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    cleanup();
    show({ emailVerified: false });
    expect(screen.queryAllByText("Verified")).toHaveLength(0);
  });

  // Regression: Field's <label> was neither wrapping nor linked to its input, so these fields had no accessible name.
  it("names each field by its label for screen readers", () => {
    show();
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Preferred language")).toBeTruthy();
    expect(screen.getByLabelText("Home country")).toBeTruthy();
  });

  it("offers Save only once something changed", async () => {
    const user = u();
    show();
    expect(screen.queryByText("You have unsaved changes.")).toBeNull();
    await user.type(input("Full name"), "!");
    expect(await screen.findByText("You have unsaved changes.")).toBeTruthy();
  });
});

describe("AccountView: saving", () => {
  it("saves a changed name and profile together, then refreshes", async () => {
    const user = u();
    show();
    const nameField = input("Full name");
    await user.clear(nameField);
    await user.type(nameField, "Sam R");
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(auth.updateName).toHaveBeenCalledWith("Sam R");
    expect(auth.updateEmail).not.toHaveBeenCalled();
    expect(profilePuts()[0].body).toMatchObject({ homeAirport: "YYZ", homeCity: "Toronto, Canada", language: "en", country: "CA", notifications: { trips: true, prices: true, collab: true, weekly: false, product: false } });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("You have unsaved changes.")).toBeNull());
  });

  it("asks for the new email to be confirmed from the inbox", async () => {
    const user = u();
    show();
    const emailField = input("Email");
    await user.clear(emailField);
    await user.type(emailField, "new@example.com");
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(auth.updateEmail).toHaveBeenCalledWith("new@example.com"));
    expect(toast).toHaveBeenCalledWith("Check your inbox to confirm the new email.", "success");
  });

  it("says some changes did not save, and keeps the bar, when the name or profile is refused", async () => {
    auth.updateName.mockResolvedValue({ error: new Error("no") });
    const user = u();
    show();
    await user.type(input("Full name"), "!");
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Some changes couldn’t be saved. Try again.", "error"));
    expect(screen.getByText("You have unsaved changes.")).toBeTruthy();
    expect(profilePuts()).toHaveLength(0);

    toast.mockClear();
    auth.updateName.mockResolvedValue({ error: null });
    handlers.push((c) => (c.method === "PUT" && c.url === "/api/profile" ? { status: 500 } : undefined));
    await user.click(screen.getByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Some changes couldn’t be saved. Try again.", "error"));
  });

  it("discards by re-reading the page", async () => {
    const user = u();
    show();
    await user.type(input("Full name"), "!");
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("saves the notification switches with the profile", async () => {
    const user = u();
    show();
    await user.click(screen.getByRole("switch", { name: /Weekly ideas/ }));
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(profilePuts()[0].body!.notifications).toMatchObject({ weekly: true });
  });
});

describe("AccountView: home airport, city and country", () => {
  it("reads a typed three-letter airport code in capitals and saves it", async () => {
    const user = u();
    show({ profile: profile({ homeAirport: "" }) });
    await user.type(input("Home airport"), "lhr");
    expect(input("Home airport").value).toBe("LHR");
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(profilePuts()[0]?.body).toMatchObject({ homeAirport: "LHR" }));
  });

  it("takes the code from a picked suggestion and shows it in brackets", async () => {
    const user = u();
    show({ profile: profile({ homeAirport: "" }) });
    await user.click(screen.getByRole("button", { name: "pick Home airport" }));
    expect(input("Home airport").value).toBe("Toronto Pearson International Airport (YYZ)");
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(profilePuts()[0]?.body).toMatchObject({ homeAirport: "YYZ" }));
  });

  it("clears the saved airport when the text is emptied", async () => {
    const user = u();
    show();
    await user.clear(input("Home airport"));
    await user.click(await screen.findByRole("button", { name: /^Save/ }));
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(profilePuts()[0].body).not.toHaveProperty("homeAirport");
  });

  it("sets the home country from a city that names one, until the traveller chooses a country by hand", async () => {
    const user = u();
    show({ profile: profile({ homeCity: "", country: "" }) });
    const country = selects()[1];
    expect(country.value).toBe("");
    fireEvent.change(input("Home city"), { target: { value: "Paris, France" } });
    expect(country.value).toBe("FR");
    fireEvent.change(country, { target: { value: "CA" } });
    fireEvent.change(input("Home city"), { target: { value: "Lyon, France" } });
    expect(country.value).toBe("CA");
    void user;
  });

  it("fills in and saves the country when a saved home city already names it but none was set", async () => {
    show({ profile: profile({ country: "", homeCity: "Toronto, Canada" }) });
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(profilePuts()[0].body).toEqual({ country: "CA" });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Home country set to Canada, from your home city.", "success"));
  });
});

describe("AccountView: password and Google", () => {
  const openPassword = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /Change password/ }));
    return { next: await screen.findByPlaceholderText("At least 8 characters"), again: screen.getByPlaceholderText("Repeat it") };
  };

  it("keeps the button off until the new password is 8+ characters and repeated, and says when they differ", async () => {
    const user = u();
    show();
    const { next, again } = await openPassword(user);
    const change = () => screen.getAllByRole("button", { name: /Change password|Update password|Save password/ }).at(-1) as HTMLButtonElement;
    await user.type(next, "short");
    await user.type(again, "short");
    expect(change().disabled).toBe(true);
    await user.clear(next); await user.clear(again);
    await user.type(next, "longenough1");
    await user.type(again, "different1");
    expect(screen.getByText("Doesn’t match yet.")).toBeTruthy();
    expect(change().disabled).toBe(true);
    await user.clear(again);
    await user.type(again, "longenough1");
    expect(change().disabled).toBe(false);
  });

  it("changes the password, says so, and closes and clears the form", async () => {
    const user = u();
    show();
    const { next, again } = await openPassword(user);
    await user.type(next, "longenough1");
    await user.type(again, "longenough1");
    await user.click(screen.getAllByRole("button", { name: /Change password|Update password|Save password/ }).at(-1)!);
    await waitFor(() => expect(auth.updatePassword).toHaveBeenCalledWith("longenough1"));
    expect(toast).toHaveBeenCalledWith("Password changed", "success");
    await waitFor(() => expect(screen.queryByPlaceholderText("Repeat it")).toBeNull());
  });

  it("says when the password could not be changed", async () => {
    auth.updatePassword.mockResolvedValue({ error: new Error("weak") });
    const user = u();
    show();
    const { next, again } = await openPassword(user);
    await user.type(next, "longenough1");
    await user.type(again, "longenough1");
    await user.click(screen.getAllByRole("button", { name: /Change password|Update password|Save password/ }).at(-1)!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Your password couldn’t be changed.", "error"));
  });

  it("disconnects Google when connected, and tells you if that fails", async () => {
    const user = u();
    show({ providers: ["email", "google"] });
    await user.click(screen.getByRole("button", { name: /Disconnect/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Google disconnected", "success"));
    expect(screen.getByRole("button", { name: /Connect/ })).toBeTruthy();
    cleanup();
    toast.mockClear();
    auth.disconnectGoogle.mockResolvedValue({ error: new Error("x") });
    show({ providers: ["email", "google"] });
    await user.click(screen.getByRole("button", { name: /Disconnect/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t disconnect Google.", "error"));
  });

  it("starts the Google connection when not connected", async () => {
    const user = u();
    show({ providers: ["email"] });
    await user.click(screen.getByRole("button", { name: /Connect/ }));
    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalledWith("http://app.test/account"));
  });
});

describe("AccountView: travel style", () => {
  it("describes the chosen style in a sentence", () => {
    show();
    expect(screen.getByText("New trips will lean towards hiking, at a balanced pace, on a considered budget, usually travelling with friends.")).toBeTruthy();
  });

  it("only mentions what was actually chosen", () => {
    show({ profile: profile({ interests: [], pace: null, budget: null, groupType: null }) });
    expect(screen.getByText("New trips will lean towards whatever looks good.")).toBeTruthy();
  });

  it("edits the style and saves it as one profile update", async () => {
    const user = u();
    show();
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Edit" }));
    const section = () => document.getElementById("style")!;
    await user.click(within(section()).getByRole("button", { name: "Museums" }));
    await user.click(within(section()).getByRole("button", { name: "Vegetarian" }));
    await user.click(within(section()).getByRole("button", { name: "Packed" }));
    await user.click(within(section()).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(profilePuts()[0].body).toMatchObject({ interests: ["Hiking", "Museums"], dietaryNeeds: ["Vegetarian"], pace: "Packed", budget: "Considered", stayType: "Hotel", groupType: "Friends" });
    await screen.findByText("Travel style saved");
  });

  it("puts everything back on Cancel, writing nothing", async () => {
    const user = u();
    show();
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Edit" }));
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Museums" }));
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Cancel" }));
    expect(profilePuts()).toHaveLength(0);
    expect(screen.getByText("New trips will lean towards hiking, at a balanced pace, on a considered budget, usually travelling with friends.")).toBeTruthy();
  });

  it("stays in edit mode and says so when the style cannot be saved", async () => {
    handlers.push((c) => (c.method === "PUT" ? { status: 500 } : undefined));
    const user = u();
    show();
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Edit" }));
    await user.click(within(document.getElementById("style")!).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That couldn’t be saved. Try again.", "error"));
    expect(within(document.getElementById("style")!).getByRole("button", { name: "Done" })).toBeTruthy();
  });
});

describe("AccountView: dream destination", () => {
  const openDream = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click((screen.queryAllByRole("button", { name: /Add your dream destination/ })[0] ?? screen.getAllByTitle("Change your dream destination")[0]) as HTMLElement);
    return screen.findByLabelText("/api/account/places/autocomplete", undefined, { timeout: 2000 }).catch(() => screen.getByPlaceholderText("Kyoto, Japan"));
  };

  it("looks up a photo for the picked place, saves both, and makes it the backdrop", async () => {
    handlers.push((c) => (c.url.includes("/destination-photo") ? { json: { photoName: "places/abc/photos/xyz" } } : undefined));
    const user = u();
    show({ profile: profile({ dreamDestination: null, dreamPhotoName: null }) });
    const field = await openDream(user);
    fireEvent.change(field, { target: { value: "Kyoto, Japan" } });
    await user.click(screen.getAllByRole("button", { name: /^pick /i }).find((b) => b.textContent === "pick /api/account/places/autocomplete")!);
    await waitFor(() => expect(profilePuts().some((p) => p.body?.dreamDestination === "Kyoto, Japan")).toBe(true));
    expect(profilePuts().find((p) => p.body?.dreamDestination)!.body).toEqual({ dreamDestination: "Kyoto, Japan", dreamPhotoName: "places/abc/photos/xyz" });
    expect(toast).toHaveBeenCalledWith("Your dream destination is your backdrop now.", "success");
  });

  it("still saves a place with no photo, and says so", async () => {
    handlers.push((c) => (c.url.includes("/destination-photo") ? { json: { photoName: null } } : undefined));
    const user = u();
    show({ profile: profile({ dreamDestination: null, dreamPhotoName: null }) });
    const field = await openDream(user);
    fireEvent.change(field, { target: { value: "Tiny Island" } });
    await user.click(screen.getAllByRole("button").find((b) => b.textContent === "pick /api/account/places/autocomplete")!);
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Saved. We couldn’t find a photo for it, though.", "info"));
  });

  it("removes the dream destination", async () => {
    const user = u();
    show({ profile: profile({ dreamDestination: "Kyoto, Japan", dreamPhotoName: "places/abc/photos/xyz" }) });
    await openDream(user);
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(profilePuts()).toHaveLength(1));
    expect(profilePuts()[0].body).toEqual({ dreamDestination: null, dreamPhotoName: null });
  });
});

describe("AccountView: shared links, avatar and deleting", () => {
  const shared = [{ id: "trip-1", name: "Lisbon", slug: "abc123" }];

  it("lists shared trips, copies a link, and revokes one", async () => {
    const user = u();
    show({ sharedTrips: shared });
    expect(screen.getByText("Lisbon")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe("http://app.test/s/abc123"));
    expect(toast).toHaveBeenCalledWith("Link copied", "success");
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/trips/trip-1/share")).toBe(true));
    expect(toast).toHaveBeenCalledWith("Link revoked", "success");
    expect(refresh).toHaveBeenCalled();
  });

  it("says when a link could not be revoked, and when there is nothing shared", async () => {
    handlers.push((c) => (c.method === "DELETE" ? { status: 500 } : undefined));
    const user = u();
    show({ sharedTrips: shared });
    await user.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn’t revoke that link.", "error"));
    cleanup();
    show();
    expect(screen.getByText("No trips are shared publicly right now.")).toBeTruthy();
  });

  it("checks a chosen photo before uploading it", async () => {
    show();
    const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });
    const chooser = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(chooser, { target: { files: [file("a.pdf", "application/pdf")] } });
    expect(toast).toHaveBeenCalledWith("Choose a JPEG, PNG, WebP, GIF or HEIC photo.", "error");
    fireEvent.change(chooser, { target: { files: [file("big.png", "image/png", 5 * 1024 * 1024 + 1)] } });
    expect(toast).toHaveBeenCalledWith("Keep it under 5MB.", "error");
    expect(auth.uploadAvatar).not.toHaveBeenCalled();
    fireEvent.change(chooser, { target: { files: [file("ok.png", "image/png")] } });
    await waitFor(() => expect(auth.uploadAvatar).toHaveBeenCalledWith("u1", expect.any(File)));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Photo updated", "success"));
  });

  it("says when a photo could not be uploaded", async () => {
    auth.uploadAvatar.mockResolvedValue({ error: new Error("x"), url: null });
    show();
    const chooser = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(chooser, { target: { files: [new File([new Uint8Array(10)], "ok.png", { type: "image/png" })] } });
    await waitFor(() => expect(toast).toHaveBeenCalledWith("That photo couldn’t be uploaded.", "error"));
  });

  it("deletes the account only once DELETE is typed, then goes to sign-in", async () => {
    const user = u();
    show();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    // A change event, not keystrokes: the sheet takes focus a beat after it opens, which would cut a fast synthetic typing run short.
    const confirm = await screen.findByPlaceholderText("DELETE");
    const go = () => screen.getByRole("button", { name: "Delete my account" }) as HTMLButtonElement;
    expect(go().disabled).toBe(true);
    fireEvent.change(confirm, { target: { value: "delete" } });
    expect(go().disabled).toBe(true);
    fireEvent.change(confirm, { target: { value: "DELETE" } });
    expect(go().disabled).toBe(false);
    await user.click(go());
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/account")).toBe(true));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/sign-in"));
  });

  it("says the account could not be deleted, and stays", async () => {
    handlers.push((c) => (c.method === "DELETE" && c.url === "/api/account" ? { status: 500 } : undefined));
    const user = u();
    show();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.change(await screen.findByPlaceholderText("DELETE"), { target: { value: "DELETE" } });
    await user.click(screen.getByRole("button", { name: "Delete my account" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Account could not be deleted.", "error"));
    expect(assign).not.toHaveBeenCalled();
  });

  it("signs out and goes to sign-in", async () => {
    const user = u();
    show();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/sign-in"));
    expect(auth.signOut).toHaveBeenCalled();
  });
});
