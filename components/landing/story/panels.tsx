import { ArrowRight, BedDouble, Check, Compass, Heart, Route, TicketCheck, Utensils, type LucideIcon } from "lucide-react";
import { RoamMark } from "@/features/roam/ui/RoamMark";
import { AppFrame } from "@/components/landing/story/AppFrame";

/** Three product moments for the showcase. Each is a still, composed the way the app composes it. */

const PLACES = [
  { category: "Outdoors", title: "Mount Royal at golden hour", photo: "/design/discover-mount-royal.jpg", focus: "center 62%", fit: "Free, dry and 18°C", hearts: ["M"] },
  { category: "Live music", title: "A late set at MTELUS", photo: "/design/discover-live-music.jpg", focus: "center 55%", fit: "4 tickets, inside $900 each", hearts: ["K", "A"] },
  { category: "Nightlife", title: "Rooftop at Le Bain Public", photo: "/design/discover-rooftop.jpg", focus: "center 45%", fit: "Vegetarian menu, open late", hearts: ["A", "M"] },
  { category: "Activity", title: "Pottery Workshop", photo: "/design/discover-pottery.jpg", focus: "center 45%", fit: "Fits the 2 PM gap, $42 each", hearts: ["K", "A", "M", "J"], picked: true },
];

export function DiscoverPanel() {
  return (
    <AppFrame title="Montreal" meta="Saturday · Oct 17">
      <div className="p-4 sm:p-5">
        <p className="font-display text-xl font-medium tracking-[-0.02em] sm:text-2xl">What are we doing Saturday?</p>
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {PLACES.map((p) => (
            <li key={p.title} className={`relative overflow-hidden rounded-2xl border bg-white ${p.picked ? "border-coral/50 shadow-soft ring-2 ring-coral/20" : "border-border"}`}>
              <div className="h-24 bg-cover tall-lg:h-20" style={{ backgroundImage: `url(${p.photo})`, backgroundPosition: p.focus }} />
              {p.picked && (
                <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-coral-fill px-2 py-1 text-[11px] font-semibold text-coral-fill-foreground">
                  <Check className="size-3" strokeWidth={2.5} /> Added to trip
                </span>
              )}
              <div className="space-y-1 p-3">
                <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{p.category}</p>
                <p className="font-display text-[15px] leading-tight font-medium">{p.title}</p>
                <p className="flex items-start gap-1.5 text-xs text-ink-soft">
                  <Check className="mt-px size-3.5 shrink-0 text-leaf" strokeWidth={2.2} />
                  {p.fit}
                </p>
                <div className="flex items-center gap-1 pt-1">
                  <Heart className="size-3.5 fill-coral text-coral" />
                  <span className="text-xs font-medium tabular-nums">{p.hearts.length}</span>
                  <span className="ml-1 flex -space-x-1">
                    {p.hearts.map((h) => (
                      <span key={h} className="grid shrink-0 place-items-center rounded-full border border-white bg-primary font-semibold text-primary-foreground" style={{ width: 22, height: 22, fontSize: 11 }}>
                        {h}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </AppFrame>
  );
}

export function PlansChangePanel() {
  return (
    <AppFrame title="Montreal" meta="Group chat">
      <div className="space-y-3 p-4 sm:p-5">
        <div className="flex max-w-[85%] items-end gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">M</span>
          <p className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-2.5 text-sm">Pottery place says they’re sold out for 2pm 😭</p>
        </div>
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <span className="text-[#ff9f80]">@Roam</span> find another timing
        </p>
        <div className="flex max-w-[92%] items-end gap-2">
          <RoamMark state="settled" size={30} animated={false} className="mb-1.5 shrink-0 text-[#0b6571]" />
          <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 text-sm">
            <p className="leading-relaxed">
              I found another workshop 8 minutes away. Same price, starts at 2:30.
            </p>
            <span className="btn-primary-sm mt-3 inline-flex">Fix Saturday</span>
          </div>
        </div>

        <div className="mt-2 space-y-2 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">Saturday, updated</p>
          <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border border-coral/30 bg-coral-soft px-4 py-3">
            <span className="text-xs tabular-nums text-coral-ink">2:30</span>
            <span className="font-display text-[15px] font-medium">Pottery Workshop</span>
            <span className="text-xs text-coral-ink">8 min away</span>
          </div>
          <div className="grid grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="text-xs tabular-nums text-muted-foreground">7:30</span>
            <span className="font-display text-[15px] font-medium">Dinner</span>
            <span className="text-xs text-muted-foreground">moved from 7:00</span>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}

const DOCS: { label: string; sub: string; icon: LucideIcon; tone: "ink" | "coral" | "plain" }[] = [
  { label: "VIA Rail · YTO→YUL", sub: "Fri · 8:32 AM", icon: Route, tone: "ink" },
  { label: "Bad Bunny · Bell Centre", sub: "Oct 16 · 8 PM", icon: TicketCheck, tone: "coral" },
  { label: "Hôtel Place d’Armes", sub: "Check-in · Fri", icon: BedDouble, tone: "plain" },
  { label: "Bistro Saint-Paul", sub: "Table for 4 · Fri 10:30 PM", icon: Utensils, tone: "plain" },
];

const SATURDAY = [
  ["10:30", "Brunch", "Olive et Gourmando"],
  ["12:00", "Old Montreal", "Explore"],
  ["2:30", "Pottery Workshop", "$42 each"],
  ["7:30", "Dinner", "Bistro Saint-Paul"],
] as const;

export function BookingsPanel() {
  return (
    <AppFrame title="Montreal" meta="Everything booked">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_0.9fr] sm:p-5">
        <ul className="space-y-2.5">
          {DOCS.map(({ label, sub, icon: Icon, tone }) => (
            <li
              key={label}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 ${
                tone === "ink" ? "border-primary bg-primary text-primary-foreground" : tone === "coral" ? "border-coral-fill bg-coral-fill text-coral-fill-foreground" : "border-border bg-white"
              }`}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone === "plain" ? "bg-coral-soft text-coral-ink" : "bg-white/15"}`}>
                <Icon className="size-4" strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{label}</span>
                <span className={`block truncate text-xs ${tone === "plain" ? "text-muted-foreground" : "opacity-75"}`}>{sub}</span>
              </span>
              <Check className={`ml-auto size-4 shrink-0 ${tone === "plain" ? "text-leaf" : "opacity-90"}`} strokeWidth={2.2} />
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-coral/60 bg-coral-soft px-3.5 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-coral-ink">
              <Compass className="size-4" strokeWidth={1.8} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">Pottery Workshop</span>
              <span className="block truncate text-xs text-coral-ink">Sat · 2:30 PM</span>
            </span>
          </li>
        </ul>

        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-end justify-between border-b border-border pb-3">
            <div>
              <p className="text-xs text-muted-foreground">Saturday</p>
              <p className="font-display text-xl font-medium tracking-[-0.02em]">Oct 17</p>
            </div>
            <span className="rounded-full bg-coral-soft px-2.5 py-1 text-xs font-semibold text-coral-ink">4 plans</span>
          </div>
          <ol className="mt-3 space-y-3">
            {SATURDAY.map(([time, item, detail]) => (
              <li key={item} className="grid grid-cols-[2.5rem_0.5rem_1fr] items-start gap-1.5">
                <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">{time}</span>
                <span className="mt-1.5 size-1.5 rounded-full bg-coral" />
                <span>
                  <span className="block font-display text-sm font-medium">{item}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-ink-soft">
            <ArrowRight className="size-3.5" aria-hidden="true" /> Share with the group
          </p>
        </div>
      </div>
    </AppFrame>
  );
}
