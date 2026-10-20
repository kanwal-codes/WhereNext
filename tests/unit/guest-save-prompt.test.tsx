// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Characterization tests for the card that turns a guest into an account and keeps their trip: the four roads
 * (new email, existing account, Google, reset), what each failure says, and where the person ends up.
 * The auth provider, the network and the page location are faked.
 */
const TRIP = "11111111-1111-4111-8111-111111111111";
type Any = Record<string, any>;
let updateUser: ReturnType<typeof vi.fn>;
let resendEmail: ReturnType<typeof vi.fn>;
let signIn: ReturnType<typeof vi.fn>;
let resetPassword: ReturnType<typeof vi.fn>;
let signInWithGoogle: ReturnType<typeof vi.fn>;
let calls: string[];
let ticketOk = true;
let claim: { ok: boolean; body: Any };
const location = { origin: "https://app.test", reload: vi.fn(), assign: vi.fn() };

vi.mock("motion/react", () => {
  const Div = React.forwardRef<HTMLDivElement, Any>(function Div({ children, layout, initial, animate, exit, transition, ...rest }, ref) { void layout; void initial; void animate; void exit; void transition; return <div ref={ref} {...rest}>{children}</div>; });
  return { motion: { div: Div }, AnimatePresence: ({ children }: Any) => <>{children}</>, useReducedMotion: () => true };
});
vi.mock("next/link", () => ({ default: ({ href, children, className }: Any) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({ auth: { updateUser: (...a: unknown[]) => updateUser(...a), resend: (...a: unknown[]) => resendEmail(...a) } }) }));
vi.mock("@/features/identity/application/authClient", () => ({
  signIn: (...a: unknown[]) => signIn(...a), resetPassword: (...a: unknown[]) => resetPassword(...a), signInWithGoogle: (...a: unknown[]) => signInWithGoogle(...a),
}));

import { GuestSavePrompt } from "../../features/identity/ui/GuestSavePrompt";

const u = () => userEvent.setup({ pointerEventsCheck: 0 });
const view = (props: Any = {}) => render(<GuestSavePrompt tripId={TRIP} exhausted={false} {...props} />);
const typeEmail = (value = "ana@example.com") => fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
const goCreate = async (user: ReturnType<typeof u>, email = "ana@example.com") => { typeEmail(email); await user.click(screen.getByRole("button", { name: /Continue$/ })); };
const typePassword = (value = "correct horse") => fireEvent.change(screen.getByLabelText("Password"), { target: { value } });
const authError = (code: string, message = "") => ({ code, message, status: 400 });

beforeEach(() => {
  updateUser = vi.fn(async () => ({ data: { user: { is_anonymous: true } }, error: null }));
  resendEmail = vi.fn(async () => ({ error: null }));
  signIn = vi.fn(async () => ({ error: null }));
  resetPassword = vi.fn(async () => ({ error: null }));
  signInWithGoogle = vi.fn(async () => ({ error: null }));
  calls = []; ticketOk = true; claim = { ok: true, body: { tripIds: [TRIP] } };
  location.reload.mockClear(); location.assign.mockClear();
  vi.stubGlobal("location", location);
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    calls.push(String(input));
    if (String(input).endsWith("/claim-ticket")) return new Response("{}", { status: ticketOk ? 200 : 500 });
    if (String(input).endsWith("/claim")) return new Response(JSON.stringify(claim.body), { status: claim.ok ? 200 : 500 });
    return new Response("{}", { status: 200 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("GuestSavePrompt: the first card", () => {
  it("offers a free account that keeps the trip", () => {
    view();
    expect(screen.getByRole("region", { name: "Save your trip" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Keep this trip." })).toBeTruthy();
    expect(screen.getByText(/A free account keeps this trip/)).toBeTruthy();
    for (const t of ["Free", "No card", "Your trip comes with you"]) expect(screen.getByText(t)).toBeTruthy();
  });

  it("says how many free messages were used once they run out", () => {
    view({ exhausted: true });
    expect(screen.getByRole("heading", { name: "Keep planning with Roam." })).toBeTruthy();
    expect(screen.getByText(/You’ve used your 10 free messages/)).toBeTruthy();
  });

  it("uses a heading and body the page gives it", () => {
    view({ heading: "Save it now", body: "Before you go." });
    expect(screen.getByRole("heading", { name: "Save it now" })).toBeTruthy();
    expect(screen.getByText("Before you go.")).toBeTruthy();
  });

  it("goes on to a password with the email kept, and back again", async () => {
    const user = u();
    view();
    await goCreate(user);
    expect(screen.getByRole("heading", { name: "Choose a password." })).toBeTruthy();
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Back/ }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("shows when the password is long enough, and can show or hide it", async () => {
    const user = u();
    view();
    await goCreate(user);
    const hint = screen.getByText(/At least 8 characters/);
    expect(hint.className).toContain("text-muted-foreground");
    typePassword("1234567");
    expect(hint.className).toContain("text-muted-foreground");
    typePassword("12345678");
    expect(hint.className).toContain("text-positive");
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("GuestSavePrompt: a new email", () => {
  it("upgrades the guest in place and, when no confirmation is needed, says so and reloads", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    updateUser.mockResolvedValue({ data: { user: { is_anonymous: false } }, error: null });
    const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account and save trip/ }));
    expect(await screen.findByRole("heading", { name: "You’re in." })).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ email: "ana@example.com", password: "correct horse" }, { emailRedirectTo: `https://app.test/auth-callback?next=${encodeURIComponent(`/trips/${TRIP}/chat`)}` });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(location.reload).toHaveBeenCalled();
  });

  it("trims the email it sends", async () => {
    const user = u();
    view();
    await goCreate(user, "  ana@example.com ");
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    await screen.findByRole("heading", { name: "Check your email." });
    expect(updateUser.mock.calls[0][0].email).toBe("ana@example.com");
  });

  it("asks them to check their email when the address needs confirming, with a wait before resending", async () => {
    const user = u();
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("heading", { name: "Check your email." })).toBeTruthy();
    expect(screen.getByText(/We sent a link to/)).toBeTruthy();
    const resend = screen.getByRole("button", { name: "Resend email in 30s" });
    expect(resend.hasAttribute("disabled")).toBe(true);
  });

  it("lets them resend once the wait is over, and start again with another address", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    await screen.findByRole("heading", { name: "Check your email." });
    for (let i = 0; i < 31; i += 1) await act(async () => { vi.advanceTimersByTime(1000); });
    await user.click(screen.getByRole("button", { name: "Resend email" }));
    await waitFor(() => expect(resendEmail).toHaveBeenCalledWith({ type: "email_change", email: "ana@example.com", options: { emailRedirectTo: expect.stringContaining("/auth-callback") } }));
    expect(screen.getByRole("button", { name: /Resend email in/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("");
  });

  it("sends an email that already has an account to sign in, with the email kept and a note", async () => {
    updateUser.mockResolvedValue({ data: {}, error: authError("email_exists") });
    const user = u();
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("heading", { name: "Welcome back." })).toBeTruthy();
    expect(screen.getByText("That email already has an account.")).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("ana@example.com");
  });

  it("says the guest chat has ended when the session is gone", async () => {
    updateUser.mockResolvedValue({ data: {}, error: authError("session_not_found") });
    const user = u();
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect(await screen.findByRole("heading", { name: "This guest chat has ended." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start a new trip" }).getAttribute("href")).toBe("/");
  });

  it("explains other failures in plain words and lets them try again", async () => {
    updateUser.mockResolvedValue({ data: {}, error: authError("weak_password") });
    const user = u();
    view();
    await goCreate(user);
    typePassword();
    await user.click(screen.getByRole("button", { name: /Create account/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Choose a stronger password");
    expect(screen.getByRole("button", { name: /Create account/ }).hasAttribute("disabled")).toBe(false);
  });
});

describe("GuestSavePrompt: an account that exists", () => {
  const openSignIn = async (user: ReturnType<typeof u>) => { typeEmail(); await user.click(screen.getByRole("button", { name: "Sign in" })); };

  it("signs in, brings the trip over and goes to it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
    view();
    await openSignIn(user);
    typePassword("hunter22");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    expect(await screen.findByRole("heading", { name: "You’re in." })).toBeTruthy();
    expect(calls).toEqual(["/api/guest/claim-ticket", "/api/guest/claim"]);
    expect(signIn).toHaveBeenCalledWith("ana@example.com", "hunter22");
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(location.assign).toHaveBeenCalledWith(`/trips/${TRIP}/chat`);
  });

  it("falls back to the trip list when the claim returns no trip, or fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    claim = { ok: false, body: {} };
    const user = userEvent.setup({ pointerEventsCheck: 0, advanceTimers: vi.advanceTimersByTime });
    view();
    await openSignIn(user);
    typePassword("hunter22");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    await screen.findByRole("heading", { name: "You’re in." });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(location.assign).toHaveBeenCalledWith("/trips");
  });

  it("does not sign in when the trip cannot be made ready to move", async () => {
    ticketOk = false;
    const user = u();
    view();
    await openSignIn(user);
    typePassword("hunter22");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t get your trip ready to move");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("says when the password is wrong", async () => {
    signIn.mockResolvedValue({ error: authError("invalid_credentials") });
    const user = u();
    view();
    await openSignIn(user);
    typePassword("nope");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("That password doesn’t match");
    expect(calls).not.toContain("/api/guest/claim");
  });

  it("offers a new confirmation email for an account that was never confirmed", async () => {
    signIn.mockResolvedValue({ error: authError("email_not_confirmed") });
    const user = u();
    view();
    await openSignIn(user);
    typePassword("hunter22");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    await user.click(await screen.findByRole("button", { name: "Send me a new confirmation email" }));
    expect(resendEmail).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "ana@example.com" }));
    expect(await screen.findByRole("heading", { name: "Check your email." })).toBeTruthy();
    expect(screen.getByText(/That account still needs confirming/)).toBeTruthy();
  });

  it("stays on sign-in when the new confirmation email cannot be sent", async () => {
    signIn.mockResolvedValue({ error: authError("email_not_confirmed") });
    resendEmail.mockResolvedValue({ error: authError("over_email_send_rate_limit") });
    const user = u();
    view();
    await openSignIn(user);
    typePassword("hunter22");
    await user.click(screen.getByRole("button", { name: /Sign in and bring my trip/ }));
    await user.click(await screen.findByRole("button", { name: "Send me a new confirmation email" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Too many tries"));
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeTruthy();
  });

  it("goes back to creating an account from the sign-in card", async () => {
    const user = u();
    view();
    await openSignIn(user);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    expect(screen.getByRole("heading", { name: "Keep this trip." })).toBeTruthy();
  });
});

describe("GuestSavePrompt: forgot password", () => {
  const openSignIn = async (user: ReturnType<typeof u>, email = "ana@example.com") => { typeEmail(email); await user.click(screen.getByRole("button", { name: "Sign in" })); };

  it("sends a reset link that returns to the update page, then offers the way back", async () => {
    const user = u();
    view();
    await openSignIn(user);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByText(/We sent a reset link to/)).toBeTruthy();
    expect(resetPassword).toHaveBeenCalledWith("ana@example.com", "https://app.test/auth-callback?next=/reset-password/update");
    expect(calls).toContain("/api/guest/claim-ticket");
    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeTruthy();
  });

  it("still sends the link when the trip could not be marked to follow", async () => {
    ticketOk = false;
    const user = u();
    view();
    await openSignIn(user);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(await screen.findByText(/We sent a reset link to/)).toBeTruthy();
  });

  it("asks for the email first", async () => {
    const user = u();
    view();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect((await screen.findByRole("alert")).textContent?.trim()).toBe("Enter your email first, and we’ll send the link there.");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("says why a reset could not be sent", async () => {
    resetPassword.mockResolvedValue({ error: authError("over_email_send_rate_limit") });
    const user = u();
    view();
    await openSignIn(user);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Too many tries");
  });

  it("goes back from the reset notice to sign-in, and from sign-in to the first card", async () => {
    const user = u();
    view();
    await openSignIn(user);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await screen.findByText(/We sent a reset link to/);
    await user.click(screen.getByRole("button", { name: /Back$/ }));
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Back$/ }));
    expect(screen.getByRole("heading", { name: "Keep this trip." })).toBeTruthy();
  });
});

describe("GuestSavePrompt: Google", () => {
  it("marks the trip to follow, then hands over to Google", async () => {
    const user = u();
    view();
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith(`https://app.test/auth-callback?next=${encodeURIComponent(`/trips/${TRIP}/chat`)}`));
    expect(calls).toEqual(["/api/guest/claim-ticket"]);
  });

  it("does not go to Google if the trip cannot be made ready", async () => {
    ticketOk = false;
    const user = u();
    view();
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Couldn’t get your trip ready to move");
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it("points to email when Google is not available", async () => {
    signInWithGoogle.mockResolvedValue({ error: new Error("off") });
    const user = u();
    view();
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect((await screen.findByRole("alert")).textContent?.trim()).toBe("Google sign-in isn’t available right now. Use your email instead.");
    expect(screen.getByRole("button", { name: /Continue with Google/ }).hasAttribute("disabled")).toBe(false);
  });

  it("is offered on the sign-in card too", async () => {
    const user = u();
    view();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeTruthy();
  });
});
