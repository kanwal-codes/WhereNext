import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Compass, MapPinned } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ProfilePanel } from "@/features/profile/ui/ProfilePanel";
import { AccountActions } from "@/features/identity/ui/AccountActions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Reveal, Stagger, StaggerItem } from "@/components/motion-primitives";

// Same idea as PresenceStrip's peer avatars — a stable colour per person, no image required.
const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
  const displayName = meta.name || meta.full_name || user.email?.split("@")[0] || "Traveller";
  const memberSince = new Date(user.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // Stats are a nice-to-have on this page, not its purpose — a query hiccup should
  // zero them out, never take down the whole profile page.
  let trips: Array<{ destination: string | null }> = [];
  try {
    const result = await supabase.from("trips").select("destination");
    trips = result.data ?? [];
  } catch { /* stats fall back to zero */ }
  const tripCount = trips.length;
  const destinationCount = new Set(trips.map((t) => t.destination?.split(",")[0]?.trim()).filter(Boolean)).size;

  return (
    <div className="mx-auto max-w-lg px-5 py-14">
      <div className="flex items-center justify-between gap-3">
        <Link href="/trips" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Trips
        </Link>
        <ThemeToggle />
      </div>

      <Reveal>
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <span
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-border bg-primary font-display text-lg font-semibold text-primary-foreground"
          >
            {initials(displayName)}
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Account</p>
            <h1 className="mt-0.5 truncate font-display text-2xl leading-tight">{displayName}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{user.email}</p>
          </div>
        </div>
      </Reveal>

      <Stagger className="mt-4 grid grid-cols-3 gap-3" delay={0.08}>
        <StaggerItem className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-soft">
          <Compass className="mx-auto h-4 w-4 text-coral" />
          <p className="mt-1.5 font-display text-lg tabular-nums">{tripCount}</p>
          <p className="text-[11px] text-muted-foreground">{tripCount === 1 ? "Trip" : "Trips"}</p>
        </StaggerItem>
        <StaggerItem className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-soft">
          <MapPinned className="mx-auto h-4 w-4 text-coral" />
          <p className="mt-1.5 font-display text-lg tabular-nums">{destinationCount}</p>
          <p className="text-[11px] text-muted-foreground">{destinationCount === 1 ? "Place" : "Places"}</p>
        </StaggerItem>
        <StaggerItem className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-soft">
          <CalendarDays className="mx-auto h-4 w-4 text-coral" />
          <p className="mt-1.5 font-display text-sm leading-tight">{memberSince}</p>
          <p className="text-[11px] text-muted-foreground">Member since</p>
        </StaggerItem>
      </Stagger>

      <Reveal delay={0.14}>
        <ProfilePanel />
      </Reveal>

      <Reveal delay={0.2} className="mt-8">
        <AccountActions />
      </Reveal>
    </div>
  );
}
