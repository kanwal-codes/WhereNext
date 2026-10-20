"use client";

import { useId, useRef, type ReactNode } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { inputClass } from "@/components/AuthShell";
import { GUEST_TURN_LIMIT } from "@/lib/guest-limits";
import { GoogleIcon } from "@/features/identity/ui/GoogleAuthButton";
import type { SaveStep } from "@/features/identity/application/useGuestSave";
import { cn } from "@/lib/utils";

export function stepCopy(step: SaveStep, c: { email: string; exhausted: boolean; heading?: string; body?: string; pending: "email_change" | "signup" }): { heading: string; body: ReactNode } {
  const who = <strong className="font-medium text-foreground">{c.email}</strong>;
  switch (step) {
    case "create":
      return { heading: "Choose a password.", body: <>For {who}. You’ll use it to sign in next time.</> };
    case "signin":
      return { heading: "Welcome back.", body: "Sign in and this trip, plus everything you’ve told Roam, comes with you." };
    case "confirm":
      return {
        heading: "Check your email.",
        body: c.pending === "signup"
          ? <>That account still needs confirming. We sent a fresh link to {who}. Open it on this device and we’ll bring this trip over.</>
          : <>We sent a link to {who}. Open it on this device and your trip is saved to your new account.</>,
      };
    case "reset":
      return { heading: "Check your email.", body: <>We sent a reset link to {who}. Open it on this device, choose a new password, and this trip comes with you.</> };
    case "done":
      return { heading: "You’re in.", body: "Your trip is saved. Taking you back to it…" };
    case "ended":
      return { heading: "This guest chat has ended.", body: "Guest chats only last a visit, so there’s nothing left to save. Start a new trip and begin again." };
    default:
      return {
        heading: c.heading ?? (c.exhausted ? "Keep planning with Roam." : "Keep this trip."),
        body: c.body ?? (c.exhausted ? `You’ve used your ${GUEST_TURN_LIMIT} free messages. A free account keeps this trip and everything you’ve told Roam.` : "A free account keeps this trip and everything you’ve told Roam, so you can pick it up anywhere."),
      };
  }
}

export function GoogleButton({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-secondary w-full py-3!">
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <GoogleIcon className="size-4" />} Continue with Google
    </button>
  );
}

export function Or() {
  return (
    <div className="my-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3" aria-hidden>
      <span className="h-px bg-border" />
      <span className="text-2xs tracking-[0.14em] text-muted-foreground uppercase">or</span>
      <span className="h-px bg-border" />
    </div>
  );
}

export function ResendLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="link-underline text-sm font-medium text-foreground">
      Send me a new confirmation email
    </button>
  );
}

/** A password field with a show/hide toggle. The label sits outside the toggle so the input's name stays "Password". */
export function PasswordField({ label, hint, value, onChange, reveal, onReveal, autoComplete, placeholder, minLength, autoFocus = true }: {
  label: string;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  onReveal: (v: boolean) => void;
  autoComplete: string;
  placeholder: string;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium tracking-[0.1em] text-ink-soft uppercase">{label}</label>
        {hint}
      </div>
      <div className="relative mt-2">
        <input
          id={id}
          ref={ref}
          type={reveal ? "text" : "password"}
          required
          autoFocus={autoFocus}
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(inputClass, "pr-12")}
        />
        <button
          type="button"
          aria-label={reveal ? "Hide password" : "Show password"}
          aria-pressed={reveal}
          onClick={() => {
            onReveal(!reveal);
            ref.current?.focus();
          }}
          className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
        >
          {reveal ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
