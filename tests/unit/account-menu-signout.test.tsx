// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/features/identity/application/authClient", () => ({ signOut }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { AccountMenu } from "@/components/AccountMenu";

afterEach(() => {
  cleanup();
  signOut.mockClear();
});

describe("AccountMenu sign out", () => {
  it("signs out through the auth client and then leaves for the sign-in page", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    render(<AccountMenu displayName="Kanwaljot Singh" />);
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole("button", { name: /account/i }));
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/sign-in"));
    expect(signOut).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  // The auth client imports the whole Supabase browser library (54 KB gzipped). A static import here puts it in the trips home's first load for a
  // menu item most visits never click: it is loaded at the click instead (measured: the home's first-load JavaScript fell from 340 KB to 272 KB).
  it("does not import the auth client up front", () => {
    const source = readFileSync("components/AccountMenu.tsx", "utf8");
    expect(source).not.toMatch(/^import[^\n]*authClient/m);
    expect(source).toMatch(/await import\("@\/features\/identity\/application\/authClient"\)/);
  });
});
