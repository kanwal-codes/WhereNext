"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { AlignLeft, Bell, BedDouble, Compass, Loader2, LogOut, Plane, Plus, UserRound, Utensils, X } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { NavRow } from "@/components/shell/NavRow";
import { useOpenNewTrip } from "@/components/trips/useOpenNewTrip";

const SOFT_ROW = "flex min-h-12 w-full items-center gap-3 rounded-2xl bg-muted px-4 text-body font-medium text-foreground transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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
  // The same rows as the trip's menu (small icon, quiet label), so the two menus read as one.
  const link = (href: string, label: string, icon: ComponentType<{ className?: string }>) => (
    <NavRow key={href} href={href} label={label} icon={icon} active={false} prefetch={false} onNavigate={close} />
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
          <h2 className="min-w-0 flex-1 truncate font-display text-xl font-medium tracking-[-0.025em]">{displayName}</h2>
          <button type="button" onClick={close} aria-label="Close menu" className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-foreground transition-transform duration-150 active:scale-[0.97]">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {/* What most people open this for, as the same soft row the trip menu ends on. */}
        <button type="button" onClick={() => { void newTrip(); }} disabled={opening} aria-busy={opening} className={`${SOFT_ROW} mt-3`}>
          {opening ? <Loader2 className="size-5 animate-spin text-ink-soft" aria-hidden /> : <Plus className="size-5 text-ink-soft" aria-hidden />}New trip
        </button>
        <nav aria-label="Menu" className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-slim">
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
          <button type="button" onClick={() => void signOutAndLeave()} className={SOFT_ROW}>
            <LogOut className="size-5 text-ink-soft" aria-hidden />Sign out
          </button>
        </div>
      </Sheet>
    </>
  );
}
