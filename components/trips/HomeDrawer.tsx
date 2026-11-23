"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AlignLeft, Bell, BedDouble, Compass, Loader2, LogOut, Plane, Plus, UserRound, Utensils, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { memberInitials } from "@/lib/member-initials";
import { useOpenNewTrip } from "@/components/trips/useOpenNewTrip";

const ROW = "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-body font-medium text-foreground transition-colors duration-150 hover:bg-muted active:bg-muted/80 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring";

/** Loaded when someone actually signs out: the auth client pulls in the whole Supabase browser library, which the home does not otherwise need. */
async function signOutAndLeave() {
  const { signOut } = await import("@/features/identity/application/authClient");
  await signOut();
  window.location.assign("/sign-in");
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-1">
      <p className="eyebrow px-3 pt-3 pb-1.5">{title}</p>
      {children}
    </div>
  );
}

/**
 * The phone's menu on the trips home, the same left sheet the trip's own menu is: a new trip first, then the things to do without a trip (Flights, Stays, Eat) and the account.
 * On a desktop the account avatar and the tiles are on the page, so this is for phones only.
 */
export function HomeDrawer({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const { open: newTrip, opening } = useOpenNewTrip();
  const close = () => setOpen(false);
  const link = (href: string, label: string, Icon: typeof Plane) => (
    <Link href={href} prefetch={false} onClick={close} className={ROW}>
      <Icon className="size-5 shrink-0 text-ink-soft" aria-hidden />{label}
    </Link>
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="grid size-11 shrink-0 place-items-center rounded-full border border-border/60 bg-background/92 text-foreground transition-[opacity,transform] hover:opacity-70 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      >
        <AlignLeft className="size-[1.2rem]" aria-hidden />
      </button>
      <Sheet open={open} onClose={close} side="left" ariaLabel="Menu" className="icons-fine max-w-[19.5rem] rounded-r-4xl bg-background px-3.5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 pl-1.5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-coral-soft text-xs font-semibold text-coral-ink">{memberInitials(displayName)}</span>
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-medium tracking-[-0.025em]">{displayName}</h2>
          <button type="button" onClick={close} aria-label="Close menu" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform duration-150 active:scale-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {/* The one thing most people open this for comes first, as a button: a new trip, made and opened from here. */}
        <button type="button" onClick={() => { void newTrip(); }} disabled={opening} aria-busy={opening} className="btn-primary mt-4 h-12 w-full justify-center">
          {opening ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}New trip
        </button>
        <nav aria-label="Menu" className="mt-1 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
          <Group title="Without a trip">
            {link("/flights", "Flights", Plane)}
            {link("/stay", "Stays", BedDouble)}
            {link("/eat", "Eat", Utensils)}
          </Group>
          <Group title="Account">
            {link("/account#profile", "Profile", UserRound)}
            {link("/account#style", "Travel style", Compass)}
            {link("/account#notifications", "Notifications and sharing", Bell)}
          </Group>
        </nav>
        <div className="mt-2 pt-1">
          <button type="button" onClick={() => void signOutAndLeave()} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-muted px-4 text-body font-medium text-foreground transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <LogOut className="size-5 text-ink-soft" aria-hidden />Sign out
          </button>
        </div>
      </Sheet>
    </>
  );
}
