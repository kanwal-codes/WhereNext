"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, CircleHelp, DollarSign, ShieldCheck, type LucideIcon } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { PHONE_V2 } from "@/lib/phone-v2";
import { useMediaQuery } from "@/lib/use-media-query";
import { formatMoney } from "@/lib/currency";
import { useTripData } from "@/components/TripDataProvider";
import { Reveal } from "@/components/motion-primitives";
import { ChapterHero } from "@/components/overview/ChapterHero";
import { ConstraintsPanel, SavedPlacesList, UndecidedPanel } from "@/components/overview/KnowledgePanels";
import { BudgetSurface } from "@/features/budget/ui/BudgetSurface";
import type { Trip } from "@/features/trip/domain/trip";
import { resolveCurrency } from "@/lib/currency";
import { placePhotoName, tastePicture } from "@/lib/trip-overview";

/** Phone redesign: a fact Roam holds as one plain row that opens its editor in a sheet. */
function MemoryRow({ icon: Icon, tone, title, detail, last, bare, children }: { icon: LucideIcon; tone: string; title: string; detail: string; last?: boolean; /** The editor names itself, so the sheet adds no title of its own. */ bare?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={`flex min-h-[4.25rem] w-full items-center gap-3.5 py-2 text-left ${last ? "" : "border-b border-hairline"}`}>
        <span aria-hidden className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone}`}><Icon className="size-[1.375rem]" /></span>
        <span className="min-w-0 flex-1">
          <b className="block font-display text-base leading-tight font-medium tracking-[-0.01em]">{title}</b>
          <span className="text-sm text-ink-soft">{detail}</span>
        </span>
        <ChevronRight className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" ariaLabel={title} className="rounded-t-4xl bg-background px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {!bare && <p className="pb-3 font-display text-xl font-medium tracking-[-0.02em]">{title}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto [&_h2:first-of-type]:sr-only">{children}</div>
      </Sheet>
    </>
  );
}

type SavedPlace = { places?: { id: string; name: string; category?: string | null; metadata?: unknown } };

export default function KnowledgePage() {
  const { tripId, data } = useTripData();
  const trip = (data?.trip as Trip) ?? null;
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const saved = ((data?.savedPlaces ?? []) as SavedPlace[])
    .map((s) => s.places)
    .filter(Boolean)
    .map((p) => ({ id: p!.id, name: p!.name, category: p!.category, photoName: placePhotoName(p) }));

  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const taste = tastePicture(prefs);
  const undecided = [
    trip?.duration_days ? null : "Trip length",
    prefs.budget === undefined ? "Daily budget" : null,
    str(prefs.pace) ? null : "Daily pace",
    str(prefs.groupType) ? null : "Kind of group",
    saved.length === 0 ? "Any saved places" : null,
  ].filter(Boolean) as string[];
  const constraintCount = taste.avoids.length + taste.dietary.length;
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = PHONE_V2 && narrow;
  const budget = typeof prefs.budget === "number" ? prefs.budget : null;
  const currency = resolveCurrency(prefs);

  return (
    <div className="min-h-full pb-16">
      <ChapterHero
        eyebrow="What Roam remembers"
        title="What Roam remembers"
        description="All of it is editable. If something here is wrong, the plan built on top of it is wrong too."
        phoneQuiet
        phoneLine=""
        stats={[
          { label: "Saved", value: String(saved.length), desc: saved.length === 1 ? "place" : "places" },
          { label: "Constraints", value: String(constraintCount), desc: "to respect" },
          { label: "Undecided", value: String(undecided.length), desc: "still open" },
        ]}
      />

      {/* "What we know" (locked in, still to decide) lives beside the conversation, where it is edited as you talk; repeating it here only meant two copies to keep in step. */}
      {phone ? (
        <div className="mx-auto max-w-6xl px-5 pt-3">
          <MemoryRow icon={DollarSign} tone="bg-coral-soft text-coral-ink" title="Budget" bare detail={budget !== null ? `${formatMoney(budget, currency)} a day, per person` : "Not set yet"}>
            <BudgetSurface tripId={tripId} durationDays={trip?.duration_days} travelers={trip?.travelers} initialBudget={prefs.budget} currency={currency} />
          </MemoryRow>
          <MemoryRow icon={ShieldCheck} tone="bg-lagoon-soft text-lagoon" title="Must-haves" detail={constraintCount > 0 ? `${constraintCount} to respect` : "None yet"}>
            <ConstraintsPanel taste={taste} />
          </MemoryRow>
          <MemoryRow icon={CircleHelp} tone="bg-muted text-ink-soft" title="Still undecided" last detail={undecided.length > 0 ? `${undecided.length} still open` : "All settled"}>
            <UndecidedPanel items={undecided} tripId={tripId} />
          </MemoryRow>
          <div className="mt-8"><SavedPlacesList tripId={tripId} places={saved} /></div>
        </div>
      ) : (
      <div className="mx-auto grid max-w-6xl items-start gap-6 px-5 pt-8 sm:px-8 max-lg:gap-8 lg:grid-cols-2">
        <div className="min-w-0 space-y-6 max-lg:space-y-8">
          <Reveal>
            <BudgetSurface
              tripId={tripId}
              durationDays={trip?.duration_days}
              travelers={trip?.travelers}
              initialBudget={(data?.preferences as Record<string, unknown> | undefined)?.budget}
              currency={resolveCurrency(prefs)}
            />
          </Reveal>
          <Reveal delay={0.06}>
            <SavedPlacesList tripId={tripId} places={saved} />
          </Reveal>
        </div>
        <div className="min-w-0 space-y-6 max-lg:space-y-8">
          <Reveal delay={0.1}>
            <ConstraintsPanel taste={taste} />
          </Reveal>
          <Reveal delay={0.14}>
            <UndecidedPanel items={undecided} tripId={tripId} />
          </Reveal>
        </div>
      </div>
      )}
    </div>
  );
}
