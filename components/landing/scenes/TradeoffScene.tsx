import { Check, CircleDollarSign, Scale } from "lucide-react";
import { Reveal } from "@/components/landing/story/Reveal";

const ROWS = [
  { icon: Check, label: "Why it fits", text: "It fills the open 2 PM gap, and it’s the one place all four of you hearted." },
  { icon: CircleDollarSign, label: "What it costs", text: "$42 each, $168 for the group. Well inside your $900 each." },
  { icon: Scale, label: "The tradeoff", text: "It takes the afternoon you’d have spent on Mount Royal." },
] as const;

/**
 * Scene four: the promise behind the product. One recommendation, taken apart: every pick Roam
 * makes carries its reasons, its price and its cost to the rest of the trip.
 * Static; it only fades up as it arrives.
 */
export function TradeoffScene() {
  return (
    <section data-scene="tradeoff" className="story-scene">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Reveal as="h2" className="story-h2">
          Roam suggests.
          <br />
          You decide.
        </Reveal>
        <Reveal as="p" offset={30} className="story-lede mx-auto mt-5 max-w-xl">
          Nothing is picked for you. Every suggestion shows its reasoning, its price and what it costs the rest of the trip, so the call stays yours.
        </Reveal>
      </div>

      <Reveal offset={50} className="mx-auto mt-14 max-w-5xl px-6">
        <article className="grid overflow-hidden rounded-[2rem] border border-border bg-white shadow-lift md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="relative min-h-60 md:min-h-full">
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/design/discover-pottery.jpg)", filter: "brightness(1.22) saturate(1.08) contrast(0.96)" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute inset-x-6 bottom-6 text-white">
              <p className="text-[15px] text-white/90">Activity · Saturday, 2 PM</p>
              <p className="mt-1 font-display text-3xl font-medium tracking-[-0.02em]">Pottery Workshop</p>
            </div>
          </div>

          <div className="flex flex-col p-6 sm:p-8">
            <dl className="space-y-5">
              {ROWS.map(({ icon: Icon, label, text }) => (
                <div key={label} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="mt-0.5 grid size-8 place-items-center rounded-full bg-coral-soft text-coral-ink">
                    <Icon className="size-4" strokeWidth={1.8} />
                  </span>
                  <div>
                    <dt className="text-sm font-semibold">{label}</dt>
                    <dd className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{text}</dd>
                  </div>
                </div>
              ))}
            </dl>
            <div aria-hidden="true" className="mt-8 flex gap-3 border-t border-border pt-6">
              <span className="btn-primary h-11 px-6 text-base">Add to trip</span>
              <span className="btn-secondary h-11 px-6 text-base">Not this one</span>
            </div>
          </div>
        </article>
      </Reveal>
    </section>
  );
}
