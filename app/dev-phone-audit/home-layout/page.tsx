import { notFound } from "next/navigation";
import { Mic, Plane, BedDouble, Utensils, ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import type { ReactNode } from "react";

// TEMPORARY (Home layout render). A development-only page: it answers 404 in a production build.
export const dynamic = "force-dynamic";

const HERO = "/hero/01-aerial-beach.webp";
const TRIPS = [
  { name: "Portugal", sub: "Mar 20 – Mar 27 · 2 travellers", badge: "In 4 months", photo: "/design/land-coast.jpg" },
  { name: "Ibiza trip", sub: "5 days", badge: "Planning", photo: "/design/land-mountains.jpg" },
  { name: "Toronto trip", sub: "", badge: "Planning", photo: "/design/land-city.jpg" },
];

function Phone({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <figure className="w-[393px] shrink-0">
      <div className="relative h-[852px] overflow-hidden rounded-[2.5rem] bg-background shadow-lift ring-1 ring-border">{children}</div>
      <figcaption className="mt-4 px-1">
        <p className="font-display text-lg font-semibold tracking-[-0.01em]">{label}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{note}</p>
      </figcaption>
    </figure>
  );
}

const Bar = () => (
  <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-6">
    <span className="grid size-11 place-items-center rounded-xl bg-primary font-display text-sm font-bold text-primary-foreground ring-1 ring-white/60">WN</span>
    <span className="grid size-11 place-items-center rounded-full border border-border/60 bg-background/92 text-sm font-semibold">KS</span>
  </div>
);
const Ask = ({ className }: { className?: string }) => (
  <div className={`flex h-[3.5rem] items-center gap-2 rounded-full bg-white pr-2 pl-5 shadow-lift ${className ?? ""}`}>
    <span className="flex-1 text-base text-muted-foreground">Where to next?</span>
    <Mic className="size-5 text-ink-soft" aria-hidden />
    <span className="grid size-11 place-items-center rounded-full bg-muted"><ArrowRight className="size-5" aria-hidden /></span>
  </div>
);
const Photo = ({ src, className }: { src: string; className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- static render
  <img src={src} alt="" className={`object-cover ${className ?? ""}`} />
);
const Chip = ({ children }: { children: ReactNode }) => <span className="inline-flex h-11 shrink-0 items-center rounded-full border border-white/40 px-5 text-body text-white">{children}</span>;
const tools = [{ n: "Flights", I: Plane }, { n: "Stays", I: BedDouble }, { n: "Eat", I: Utensils }];

export default function HomeLayoutPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-dvh bg-[#ece8e1] px-6 py-10">
      <h1 className="font-display text-3xl font-medium tracking-[-0.02em]">Home: the layout, today and proposed</h1>
      <p className="mt-2 max-w-[70ch] text-ink-soft">Phone, 393 wide. The same five trips in A and B; C is a person with no trips yet. For design review: nothing here does anything.</p>
      <div className="mt-8 flex items-start gap-10 overflow-x-auto pb-6">
        {/* A: today */}
        <Phone label="A · Today" note="The photo is 384px, nearly half the screen, with the headline, a line of copy, the box and suggestions; the three tools are large tiles; the first trip starts below the fold, and each trip is a 176px cover.">
          <div className="relative h-[24rem] overflow-hidden rounded-b-3xl bg-ink">
            <Photo src={HERO} className="absolute inset-0 size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
            <Bar />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-6 text-center text-white">
              <h2 className="font-display text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em]">Trips you’re<br />thinking about.</h2>
              <p className="mx-auto mt-3 max-w-[18rem] text-body">Talk it through, and the plan builds itself alongside the conversation.</p>
              <Ask className="mt-5" />
              <div className="mt-4 flex gap-2 overflow-hidden"><Chip>A relaxing weekend</Chip><Chip>Somewhere new</Chip><Chip>Reunite with</Chip></div>
            </div>
          </div>
          <div className="px-4 pt-8">
            <div className="grid grid-cols-3 gap-2.5">
              {tools.map(({ n, I }) => (
                <div key={n} className="flex min-h-32 flex-col justify-between rounded-[1.75rem] bg-card p-3.5 shadow-soft ring-1 ring-border">
                  <span className="grid size-11 place-items-center rounded-full bg-card text-coral-ink ring-1 ring-coral/15"><I className="size-5" aria-hidden /></span>
                  <span className="flex items-center justify-between font-display text-lg font-semibold">{n}<ArrowUpRight className="size-4 text-ink-soft" aria-hidden /></span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex items-center justify-between">
              <h3 className="font-display text-2xl font-medium">Your trips <span className="ml-1 rounded-full bg-muted px-2.5 py-0.5 text-sm text-ink-soft">5</span></h3>
              <span className="btn-primary pointer-events-none"><Plus className="size-4" /> New trip</span>
            </div>
            <div className="relative mt-5 h-44 overflow-hidden rounded-4xl"><Photo src={TRIPS[0]!.photo} className="size-full" /><span className="photo-chip absolute top-3.5 left-3.5"><span className="size-1.5 rounded-full bg-coral" /> {TRIPS[0]!.badge}</span></div>
          </div>
        </Phone>

        {/* B: proposed, someone with trips */}
        <Phone label="B · Proposed, with trips" note="A short photo that is mostly the box: the mark and avatar, a one-line greeting, and the box sitting on the photo's lower edge. The three tools become one quiet row of compact buttons. Trips start at the first screen: the next one as a large cover, the rest as small rows (as the Past section already is).">
          <div className="relative h-[15rem] overflow-hidden rounded-b-[2rem] bg-ink">
            <Photo src={HERO} className="absolute inset-0 size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-black/10" />
            <Bar />
            <h2 className="absolute inset-x-0 top-[5.75rem] px-4 text-center font-display text-[1.875rem] leading-[1.1] font-medium tracking-[-0.025em] text-white">Hi, Kanwal.</h2>
          </div>
          <div className="relative z-10 -mt-7 px-4"><Ask /></div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 px-4">
            {tools.map(({ n, I }) => (
              <div key={n} className="flex h-14 items-center justify-center gap-2 rounded-full bg-card text-body font-medium shadow-soft ring-1 ring-border"><I className="size-[1.125rem] text-coral-ink" aria-hidden />{n}</div>
            ))}
          </div>
          <div className="px-4 pt-7">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-medium">Your trips <span className="ml-1 text-body text-ink-soft tabular-nums">5</span></h3>
              <span className="inline-flex h-10 items-center gap-1.5 rounded-full bg-muted px-4 text-body font-medium"><Plus className="size-4" /> New trip</span>
            </div>
            <div className="relative mt-3 h-40 overflow-hidden rounded-4xl"><Photo src={TRIPS[0]!.photo} className="size-full" /><span className="photo-chip absolute top-3.5 left-3.5"><span className="size-1.5 rounded-full bg-coral" /> {TRIPS[0]!.badge}</span></div>
            <p className="mt-2.5 px-1 font-display text-widget font-medium tracking-[-0.02em]">{TRIPS[0]!.name}</p>
            <p className="px-1 text-body text-ink-soft">{TRIPS[0]!.sub}</p>
            <ul className="mt-3 divide-y divide-border/60">
              {TRIPS.slice(1).map((t) => (
                <li key={t.name} className="flex items-center gap-4 py-3">
                  <Photo src={t.photo} className="size-16 shrink-0 rounded-2xl" />
                  <span className="min-w-0 flex-1"><span className="block font-display text-widget leading-tight font-medium tracking-[-0.02em]">{t.name}</span><span className="mt-0.5 block text-body text-ink-soft">{t.badge}{t.sub && t.sub !== "5 days" ? ` · ${t.sub}` : ""}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </Phone>

        {/* C: proposed, no trips */}
        <Phone label="C · Proposed, no trips yet" note="The first visit keeps the full photo and its words, because that is the pitch. The tools stay as the compact row under the box, and the empty state is one short card instead of fanned postcards.">
          <div className="relative h-[24rem] overflow-hidden rounded-b-3xl bg-ink">
            <Photo src={HERO} className="absolute inset-0 size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
            <Bar />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-6 text-center text-white">
              <h2 className="font-display text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em]">Trips you’re<br />thinking about.</h2>
              <p className="mx-auto mt-3 max-w-[18rem] text-body">Talk it through, and the plan builds itself alongside the conversation.</p>
              <Ask className="mt-5" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2.5 px-4">
            {tools.map(({ n, I }) => (
              <div key={n} className="flex h-14 items-center justify-center gap-2 rounded-full bg-card text-body font-medium shadow-soft ring-1 ring-border"><I className="size-[1.125rem] text-coral-ink" aria-hidden />{n}</div>
            ))}
          </div>
          <div className="mx-4 mt-8 rounded-3xl bg-muted/70 p-6 text-center">
            <p className="font-display text-xl font-medium tracking-[-0.015em]">No trips yet</p>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-body text-ink-soft">Tell Roam where you’re thinking of going, or just a feeling. It takes shape as you talk.</p>
            <span className="btn-primary pointer-events-none mt-5">Create your first trip <ArrowRight className="size-4" /></span>
          </div>
        </Phone>
      </div>
    </main>
  );
}
