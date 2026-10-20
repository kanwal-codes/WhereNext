// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the reservation sheet: adding and editing a booking by hand, reading a pasted confirmation into the form,
 * a round trip's second leg, and the tickets attached to it. The network, storage and the date pickers are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let calls: Array<{ method: string; url: string; body?: Any }>;
let reply: (c: { method: string; url: string; body?: Any }) => { status: number; body: Any };
let desktop = true;
let uploadResult: { error: Error | null };
const uploads: Array<{ path: string; token: string; name: string }> = [];
const toast = vi.fn();
const announce = vi.fn();

vi.mock("@/lib/use-media-query", () => ({ useMediaQuery: () => desktop }));
vi.mock("@/lib/application/toast", () => ({ notifyToast: (...a: unknown[]) => toast(...a) }));
vi.mock("@/lib/application/workspace-events", () => ({ announceWorkspaceChange: (...a: unknown[]) => announce(...a) }));
vi.mock("@/lib/supabase/browser", () => ({
  createSupabaseBrowserClient: () => ({ storage: { from: (bucket: string) => ({ uploadToSignedUrl: async (path: string, token: string, file: File) => { uploads.push({ path, token, name: `${bucket}:${file.name}` }); return uploadResult; } }) } }),
}));
vi.mock("@/components/motion-primitives", () => ({
  Sheet: ({ open, children, ariaLabel, side }: Any) => (open ? <div role="dialog" aria-label={ariaLabel} data-side={side}>{children}</div> : null),
}));
vi.mock("@/components/DateTimeField", () => ({
  DateField: ({ value, onChange, min }: Any) => <input type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} />,
  TimeField: ({ value, onChange }: Any) => <input type="time" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock("@/components/DestinationCombobox", () => ({
  DestinationCombobox: ({ value, onChange, ariaLabel }: Any) => <input aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />,
}));

import { ReservationSheet } from "../../components/overview/ReservationSheet";

const saved = (over: Any = {}) => ({ id: "r1", kind: "activity", title: "Tour", startsOn: "2026-12-02", endsOn: null, startTime: null, endTime: null, place: null, toPlace: null, confirmationCode: null, amount: null, currency: "EUR", amountBasis: "total", travellers: null, status: "confirmed", notes: null, attachments: [], createdAt: "x", ...over });
const onClose = vi.fn(); const onSaved = vi.fn(); const onDeleted = vi.fn();
const sheet = (props: Any = {}) => render(<ReservationSheet tripId={TRIP} open editing={null} defaultCurrency="EUR" defaultDate="2026-12-02" onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} {...props} />);
const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const posts = () => calls.filter((c) => c.method === "POST" && /reservations$/.test(c.url));
const file = (name: string, type = "application/pdf", size = 2048) => new File([new Uint8Array(size)], name, { type });
const nameInput = () => screen.getByPlaceholderText("Sintra palaces tour") as HTMLInputElement;

beforeEach(() => {
  calls = []; desktop = true; uploads.length = 0; uploadResult = { error: null };
  [onClose, onSaved, onDeleted, toast, announce].forEach((m) => m.mockClear());
  reply = (c) => {
    if (c.method === "POST" && /reservations$/.test(c.url)) return { status: 200, body: { reservation: saved({ title: c.body?.title }) } };
    if (c.method === "PATCH") return { status: 200, body: { reservation: saved({ id: "r1", title: c.body?.title }) } };
    if (c.method === "DELETE" && /reservations\/r1$/.test(c.url)) return { status: 200, body: {} };
    if (c.url.endsWith("/parse")) return { status: 200, body: { draft: { kind: "flight", title: "TAP 1350", startsOn: "2026-12-05", endsOn: "", startTime: "08:30", endTime: "", place: "", toPlace: "", confirmationCode: "ABC123", amount: "500", currency: "", amountBasis: "total", travellers: "", status: "confirmed", notes: "" } } };
    if (c.method === "POST" && c.url.endsWith("/files")) return { status: 200, body: { path: `${TRIP}/r1/${c.body?.name}`, token: "tok" } };
    if (c.method === "PUT" && c.url.endsWith("/files")) return { status: 200, body: { reservation: saved({ attachments: [{ path: c.body?.path, name: c.body?.name, size: c.body?.size, type: c.body?.type }] }) } };
    if (c.method === "DELETE" && c.url.endsWith("/files")) return { status: 200, body: { reservation: saved({ attachments: [] }) } };
    return { status: 404, body: {} };
  };
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: String(input), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const r = reply(c);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ReservationSheet: adding", () => {
  it("opens as a side sheet on a wide screen and a bottom sheet on a narrow one", () => {
    sheet();
    expect(screen.getByRole("dialog", { name: "Add a reservation" }).getAttribute("data-side")).toBe("right");
    cleanup();
    desktop = false;
    sheet();
    expect(screen.getByRole("dialog").getAttribute("data-side")).toBe("bottom");
  });

  it("renders nothing while closed", () => {
    sheet({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cannot be added without a name", async () => {
    sheet();
    const add = screen.getByRole("button", { name: "Add it" });
    expect(add.hasAttribute("disabled")).toBe(true);
    fireEvent.change(nameInput(), { target: { value: "  " } });
    expect(add.hasAttribute("disabled")).toBe(true);
    fireEvent.change(nameInput(), { target: { value: "Sintra tour" } });
    expect(add.hasAttribute("disabled")).toBe(false);
  });

  it("saves the booking with the date it opened on, numbers as numbers, and closes", async () => {
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Sintra tour" } });
    await user.click(screen.getByRole("button", { name: /More details/ }));
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "120.5" } });
    fireEvent.change(screen.getByPlaceholderText("All"), { target: { value: "3" } });
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toMatchObject({ kind: "activity", title: "Sintra tour", startsOn: "2026-12-02", currency: "EUR", amount: 120.5, travellers: 3, amountBasis: "total", status: "confirmed" });
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", title: "Sintra tour" }));
    expect(announce).toHaveBeenCalledWith("decision");
  });

  it("sends no amount or people when they are left empty", async () => {
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Dinner" } });
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()[0].body).toMatchObject({ amount: null, travellers: null });
  });

  it("says why it didn't save, and stays open", async () => {
    reply = () => ({ status: 400, body: { error: "Title is too long." } });
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Dinner" } });
    await user.click(screen.getByRole("button", { name: "Add it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Title is too long.");
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add it" }).hasAttribute("disabled")).toBe(false);
  });

  it("falls back to a plain message when the failure has none", async () => {
    reply = () => ({ status: 500, body: {} });
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Dinner" } });
    await user.click(screen.getByRole("button", { name: "Add it" }));
    expect((await screen.findByRole("alert")).textContent).toBe("That didn't save. Try again.");
  });

  it("closes without saving", async () => {
    const user = u();
    sheet();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });
});

describe("ReservationSheet: kinds", () => {
  it("hints at a name for each kind", async () => {
    const user = u();
    sheet();
    expect(screen.getByPlaceholderText("Sintra palaces tour")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Stay" }));
    expect(screen.getByPlaceholderText("Hotel or apartment name")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Dining" }));
    expect(screen.getByPlaceholderText("Dinner at Ramiro")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dining" }).getAttribute("aria-checked")).toBe("true");
  });

  it("asks a stay for check-in and check-out, with their times", async () => {
    const user = u();
    sheet();
    await user.click(screen.getByRole("radio", { name: "Stay" }));
    for (const label of ["Check-in", "Check-out", "Check-in time", "Check-out time"]) expect(screen.getByText(label)).toBeTruthy();
  });

  it("asks a flight or train where from and to, and when it leaves and arrives", async () => {
    const user = u();
    sheet();
    await user.click(screen.getByRole("radio", { name: "Flight" }));
    for (const label of ["Departs", "Arrives", "Arrives on (if another day)"]) expect(screen.getByText(label)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /More details/ }));
    expect(screen.getByLabelText("From")).toBeTruthy();
    expect(screen.getByLabelText("To")).toBeTruthy();
  });

  it("asks an activity where, not from and to", async () => {
    const user = u();
    sheet();
    await user.click(screen.getByRole("button", { name: /More details/ }));
    expect(screen.getByLabelText("Where")).toBeTruthy();
    expect(screen.queryByLabelText("To")).toBeNull();
  });

  it("writes the currency in capitals", async () => {
    const user = u();
    sheet();
    await user.click(screen.getByRole("button", { name: /More details/ }));
    fireEvent.change(screen.getByDisplayValue("EUR"), { target: { value: "cad" } });
    expect(screen.getByDisplayValue("CAD")).toBeTruthy();
  });

  it("will not take a check-out before the check-in", () => {
    sheet({ defaultDate: "2026-12-02" });
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dates[0].min).toBe("");
    expect(dates[1].min).toBe("2026-12-02");
  });

  it("sends the booking once however many times it is submitted", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => { await gate; return original(input, init); }));
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Dinner" } });
    const form = document.querySelector("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
  });

  it("keeps the extras folded away until asked for", async () => {
    const user = u();
    sheet();
    const more = screen.getByRole("button", { name: /More details/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await user.click(more);
    expect(screen.getByRole("button", { name: /Fewer details/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("marks a booking cancelled", async () => {
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Dinner" } });
    await user.click(screen.getByRole("button", { name: /More details/ }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()[0].body?.status).toBe("cancelled");
  });
});

describe("ReservationSheet: editing", () => {
  const existing = () => saved({ id: "r1", kind: "stay", title: "Hotel Lutetia", startsOn: "2026-12-01", endsOn: "2026-12-05", startTime: "15:00", endTime: "11:00", place: "Paris", confirmationCode: "XYZ", amount: 800, currency: "EUR", amountBasis: "per_person", travellers: 2, notes: "Late arrival", attachments: [{ path: `${TRIP}/r1/a.pdf`, name: "a.pdf", size: 2048, type: "application/pdf" }] });

  it("fills the form from the booking and opens the details", () => {
    sheet({ editing: existing() });
    expect(screen.getByRole("dialog", { name: "Edit reservation" })).toBeTruthy();
    expect((screen.getByPlaceholderText("Hotel or apartment name") as HTMLInputElement).value).toBe("Hotel Lutetia");
    expect(screen.getByRole("radio", { name: "Stay" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Where") as HTMLInputElement).value).toBe("Paris");
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("800");
    expect((screen.getByPlaceholderText("All") as HTMLInputElement).value).toBe("2");
    expect(screen.getByDisplayValue("Late arrival")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
    expect(screen.queryByText(/Paste a confirmation/)).toBeNull();
  });

  it("saves changes to the same booking", async () => {
    const user = u();
    sheet({ editing: existing() });
    fireEvent.change(screen.getByPlaceholderText("Hotel or apartment name"), { target: { value: "Hotel Lutetia Paris" } });
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe(`/api/trips/${TRIP}/reservations/r1`);
    expect(patch.body).toMatchObject({ title: "Hotel Lutetia Paris", amount: 800, travellers: 2, amountBasis: "per_person" });
  });

  it("removes the booking", async () => {
    const user = u();
    sheet({ editing: existing() });
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("r1"));
    expect(onClose).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith("decision");
  });

  it("says when it could not be removed", async () => {
    reply = () => ({ status: 500, body: {} });
    const user = u();
    sheet({ editing: existing() });
    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Couldn't remove that. Try again.", "error"));
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("opens the details when a booking is picked while the sheet is already mounted", () => {
    const view = sheet();
    expect(screen.getByRole("button", { name: /More details/ }).getAttribute("aria-expanded")).toBe("false");
    view.rerender(<ReservationSheet tripId={TRIP} open editing={existing() as never} defaultCurrency="EUR" defaultDate="2026-12-02" onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />);
    expect(screen.getByRole("button", { name: /Fewer details/ }).getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the trip's currency for a booking that has none, and the booking's own otherwise", () => {
    sheet({ editing: saved({ id: "r1", title: "Opera", currency: null }), defaultCurrency: "CAD" });
    expect(screen.getByDisplayValue("CAD")).toBeTruthy();
    cleanup();
    sheet({ editing: saved({ id: "r1", title: "Opera", currency: "USD" }), defaultCurrency: "CAD" });
    expect(screen.getByDisplayValue("USD")).toBeTruthy();
  });

  it("starts from a blank form again when reopened for a new booking", () => {
    const view = sheet({ editing: existing() });
    view.rerender(<ReservationSheet tripId={TRIP} open editing={null} defaultCurrency="CAD" defaultDate="2026-12-09" onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />);
    expect(nameInput().value).toBe("");
    expect(screen.getByRole("radio", { name: "Activity" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("ReservationSheet: reading a pasted confirmation", () => {
  const open = async (user: ReturnType<typeof u>) => { await user.click(screen.getByRole("button", { name: /Paste a confirmation/ })); };

  it("only offers to read text that is long enough", async () => {
    const user = u();
    sheet();
    await open(user);
    const go = screen.getByRole("button", { name: "Fill it in" });
    expect(go.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "short" } });
    expect(go.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "Your flight TAP 1350 is confirmed." } });
    expect(go.hasAttribute("disabled")).toBe(false);
  });

  it("fills in only what the confirmation said, keeping the rest, and tells the traveller to check it", async () => {
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "My own name" } });
    await open(user);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "Your flight TAP 1350 is confirmed." } });
    await user.click(screen.getByRole("button", { name: "Fill it in" }));
    expect(await screen.findByText("Filled in from your confirmation. Check each field before you add it.")).toBeTruthy();
    expect(calls.find((c) => c.url.endsWith("/parse"))!.body).toEqual({ text: "Your flight TAP 1350 is confirmed." });
    expect(screen.getByRole("radio", { name: "Flight" }).getAttribute("aria-checked")).toBe("true");
    expect((screen.getByPlaceholderText("Toronto to Lisbon, TAP 1350") as HTMLInputElement).value).toBe("TAP 1350");
    expect((screen.getByPlaceholderText("0") as HTMLInputElement).value).toBe("500");
    expect(screen.getByDisplayValue("ABC123")).toBeTruthy();
    // The currency came back empty, so the one already there stays.
    expect((screen.getByDisplayValue("EUR") as HTMLInputElement)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Paste the confirmation/)).toBeNull();
  });

  it("says so when the text was not a booking, and fills nothing", async () => {
    reply = (c) => (c.url.endsWith("/parse") ? { status: 200, body: { draft: { kind: "other", title: "", startsOn: "", endsOn: "", startTime: "", endTime: "", place: "", toPlace: "", confirmationCode: "", amount: "", currency: "", amountBasis: "total", travellers: "", status: "confirmed", notes: "" } } } : { status: 404, body: {} });
    const user = u();
    sheet();
    await open(user);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "Hello, how are you today?" } });
    await user.click(screen.getByRole("button", { name: "Fill it in" }));
    expect(await screen.findByText(/doesn’t look like a booking confirmation/)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Paste the confirmation/)).toBeTruthy();
  });

  it("shows why it could not read it", async () => {
    reply = () => ({ status: 429, body: { error: "Too many reads." } });
    const user = u();
    sheet();
    await open(user);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "Your flight TAP 1350 is confirmed." } });
    await user.click(screen.getByRole("button", { name: "Fill it in" }));
    expect(await screen.findByText("Too many reads.")).toBeTruthy();
  });

  it("offers the return leg of a round trip as a second booking after the first is saved", async () => {
    const leg = (over: Any) => ({ kind: "flight", title: "TAP 1350", startsOn: "2026-12-05", endsOn: "", startTime: "08:30", endTime: "", place: "YYZ", toPlace: "LIS", confirmationCode: "ABC123", amount: "", currency: "", amountBasis: "total", travellers: "", status: "confirmed", notes: "", ...over });
    const baseReply = reply;
    reply = (c) => (c.url.endsWith("/parse") ? { status: 200, body: { draft: leg({}), returnDraft: leg({ startsOn: "2026-12-12", place: "LIS", toPlace: "YYZ" }) } } : baseReply(c));
    const user = u();
    sheet();
    await open(user);
    fireEvent.change(screen.getByPlaceholderText(/Paste the confirmation/), { target: { value: "Your round trip is confirmed." } });
    await user.click(screen.getByRole("button", { name: "Fill it in" }));
    expect(await screen.findByText(/It has a return leg too, which opens next/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add it" }));
    expect(await screen.findByText("Saved the outbound leg. Here is the return leg: check it and add it too.")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("LIS");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("YYZ");
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(posts()).toHaveLength(2);
    expect(posts()[1].body).toMatchObject({ startsOn: "2026-12-12", place: "LIS", toPlace: "YYZ" });
  });
});

describe("ReservationSheet: tickets", () => {
  const more = async (user: ReturnType<typeof u>) => { await user.click(screen.getByRole("button", { name: /More details/ })); };
  const chooser = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

  it("holds files for a new booking and sends them once it exists", async () => {
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Opera" } });
    await more(user);
    await user.upload(chooser(), file("ticket.pdf"));
    expect(screen.getByText("ticket.pdf")).toBeTruthy();
    expect(screen.getByText("Uploads when you add it")).toBeTruthy();
    expect(calls.filter((c) => c.url.endsWith("/files"))).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.filter((c) => c.url.endsWith("/files")).map((c) => c.method)).toEqual(["POST", "PUT"]);
    expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/files"))!.body).toEqual({ name: "ticket.pdf", size: 2048, type: "application/pdf" });
    expect(uploads).toEqual([{ path: `${TRIP}/r1/ticket.pdf`, token: "tok", name: "reservation-files:ticket.pdf" }]);
    expect(onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ attachments: [expect.objectContaining({ name: "ticket.pdf" })] }));
  });

  it("lets a held file be taken out again", async () => {
    const user = u();
    sheet();
    await more(user);
    await user.upload(chooser(), file("ticket.pdf"));
    await user.click(screen.getByRole("button", { name: "Remove ticket.pdf" }));
    expect(screen.queryByText("ticket.pdf")).toBeNull();
  });

  it("saves the booking even if a file does not go up, and says so", async () => {
    uploadResult = { error: new Error("nope") };
    const user = u();
    sheet();
    fireEvent.change(nameInput(), { target: { value: "Opera" } });
    await more(user);
    await user.upload(chooser(), [file("a.pdf"), file("b.pdf")]);
    await user.click(screen.getByRole("button", { name: "Add it" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith("Saved, but 2 files didn't upload. Open it to try again.", "error");
  });

  it("refuses a file that is not a PDF or photo, and names it", async () => {
    const user = u();
    sheet();
    await more(user);
    fireEvent.change(chooser(), { target: { files: [file("notes.txt", "text/plain")] } });
    expect((await screen.findByRole("alert")).textContent).toBe("notes.txt: Attach a PDF or a photo (JPG, PNG, WebP, HEIC).");
    expect(screen.queryByText("Uploads when you add it")).toBeNull();
  });

  it("refuses a file that is too big, and keeps the good ones", async () => {
    const user = u();
    sheet();
    await more(user);
    fireEvent.change(chooser(), { target: { files: [file("big.pdf", "application/pdf", 11 * 1024 * 1024), file("ok.pdf")] } });
    expect((await screen.findByRole("alert")).textContent).toBe("big.pdf: That file is over 10 MB.");
    expect(screen.getByText("ok.pdf")).toBeTruthy();
  });

  it("stops at ten files", async () => {
    const user = u();
    sheet();
    await more(user);
    fireEvent.change(chooser(), { target: { files: Array.from({ length: 11 }, (_, i) => file(`f${i}.pdf`)) } });
    expect((await screen.findByRole("alert")).textContent).toBe("f10.pdf: You can attach up to 10 files.");
    expect(screen.getAllByText(/^f\d+\.pdf$/)).toHaveLength(10);
  });

  it("counts the files a booking already has toward the limit of ten", async () => {
    const user = u();
    const attachments = Array.from({ length: 10 }, (_, i) => ({ path: `${TRIP}/r1/f${i}.pdf`, name: `f${i}.pdf`, size: 1024, type: "application/pdf" }));
    sheet({ editing: saved({ id: "r1", title: "Opera", attachments }) });
    await user.upload(chooser(), file("eleventh.pdf"));
    expect((await screen.findByRole("alert")).textContent).toBe("eleventh.pdf: You can attach up to 10 files.");
    expect(calls.filter((c) => c.url.endsWith("/files"))).toHaveLength(0);
  });

  it("uploads at once to a booking being edited, and shows the file with a link and its size", async () => {
    const user = u();
    sheet({ editing: saved({ id: "r1", title: "Opera" }) });
    await user.upload(chooser(), file("ticket.pdf", "application/pdf", 2048));
    const link = await screen.findByRole("link", { name: "ticket.pdf" });
    expect(link.getAttribute("href")).toBe(`/api/trips/${TRIP}/reservations/r1/files?path=${encodeURIComponent(`${TRIP}/r1/ticket.pdf`)}`);
    expect(screen.getByText("2 KB")).toBeTruthy();
    expect(onSaved).toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });

  it("says when an upload to an edited booking fails", async () => {
    uploadResult = { error: new Error("nope") };
    const user = u();
    sheet({ editing: saved({ id: "r1", title: "Opera" }) });
    await user.upload(chooser(), file("ticket.pdf"));
    expect((await screen.findByRole("alert")).textContent).toBe("That file couldn't be uploaded.");
  });

  it("removes a file from a booking being edited", async () => {
    const user = u();
    sheet({ editing: saved({ id: "r1", title: "Opera", attachments: [{ path: `${TRIP}/r1/a.pdf`, name: "a.pdf", size: 2048, type: "application/pdf" }] }) });
    await user.click(screen.getByRole("button", { name: "Remove a.pdf" }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "a.pdf" })).toBeNull());
    expect(calls.find((c) => c.method === "DELETE" && c.url.endsWith("/files"))!.body).toEqual({ path: `${TRIP}/r1/a.pdf` });
    expect(onSaved).toHaveBeenCalled();
  });

  it("says when a file could not be removed", async () => {
    reply = (c) => (c.method === "DELETE" && c.url.endsWith("/files") ? { status: 500, body: { error: "Storage is down." } } : { status: 404, body: {} });
    const user = u();
    sheet({ editing: saved({ id: "r1", title: "Opera", attachments: [{ path: `${TRIP}/r1/a.pdf`, name: "a.pdf", size: 2048, type: "application/pdf" }] }) });
    await user.click(screen.getByRole("button", { name: "Remove a.pdf" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Storage is down.");
    expect(screen.getByRole("link", { name: "a.pdf" })).toBeTruthy();
  });
});

