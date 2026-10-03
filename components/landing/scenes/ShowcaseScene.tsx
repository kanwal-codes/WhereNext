"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookingsPanel, DiscoverPanel, PlansChangePanel } from "@/components/landing/story/panels";
import { Reveal } from "@/components/landing/story/Reveal";

const STEPS = [
  { id: "fit", title: "Find what fits", body: "Roam shortlists places against your brief, says why each one fits, and shows who in the group hearted it.", Panel: DiscoverPanel },
  { id: "change", title: "Plans change. Roam keeps up.", body: "A workshop sells out and someone says so in the chat. Roam finds another option and reshuffles the day around it.", Panel: PlansChangePanel },
  { id: "booked", title: "Every booking on its day", body: "Tickets, trains, stays and tables sit beside the day they belong to, ready to share with everyone going.", Panel: BookingsPanel },
] as const;

/**
 * Scene three: the product, three ways. On a tall desktop window the list stays put and one
 * panel is swapped as you scroll (the page itself never takes over the scroll); everywhere else
 * the same three moments simply stack. Which layout shows is pure CSS (`tall-lg`).
 */
export function ShowcaseScene() {
  const trackRef = useRef<HTMLDivElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = track.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      if (span <= 0) return;
      const p = Math.min(0.9999, Math.max(0, -rect.top / span)) * STEPS.length;
      const index = Math.floor(p);
      setActive((current) => (current === index ? current : index));
      barRefs.current.forEach((bar, i) => bar?.style.setProperty("--fill", String(i < index ? 1 : i === index ? p - index : 0)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const span = track.offsetHeight - window.innerHeight;
    const top = track.getBoundingClientRect().top + window.scrollY + (span * (index + 0.5)) / STEPS.length;
    window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  return (
    <section data-scene="showcase" className="story-scene !pb-0">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Reveal as="h2" className="story-h2">
          One plan, every decision connected.
        </Reveal>
        <Reveal as="p" offset={30} className="story-lede mx-auto mt-5 max-w-xl">
          Change one thing and Roam shows what it moves: the day, the budget, who’s still in.
        </Reveal>
      </div>

      {/* Tall desktop: a sticky list beside a swapping panel. */}
      <div ref={trackRef} className="relative mt-10 hidden tall-lg:block" style={{ height: `${STEPS.length * 85}dvh` }}>
        <div className="sticky top-0 mx-auto grid h-dvh max-w-6xl grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] items-center gap-14 px-6 pt-10">
          <ul className="space-y-1">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  aria-current={active === i}
                  className="group relative block w-full cursor-pointer py-5 pl-6 text-left"
                >
                  <span className="absolute top-5 bottom-5 left-0 w-0.5 overflow-hidden rounded-full bg-border">
                    <span
                      ref={(el) => {
                        barRefs.current[i] = el;
                      }}
                      className="absolute inset-0 origin-top bg-coral"
                      style={{ transform: "scaleY(var(--fill, 0))" }}
                    />
                  </span>
                  <span className={`block font-display text-2xl font-medium tracking-[-0.02em] transition-colors duration-300 xl:text-[1.75rem] ${active === i ? "text-foreground" : "text-muted-foreground group-hover:text-ink-soft"}`}>
                    {s.title}
                  </span>
                  <span className={`grid transition-[grid-template-rows,opacity] duration-500 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${active === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                    <span className="overflow-hidden">
                      <span className="mt-2 block max-w-sm text-base leading-relaxed text-ink-soft">{s.body}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div aria-hidden="true" className="showcase-stage relative overflow-hidden rounded-[2rem]" style={{ height: "min(42rem, calc(100dvh - 7rem))" }}>
            {STEPS.map(({ id, Panel }, i) => (
              <div
                key={id}
                className={`absolute inset-0 grid place-items-center p-5 transition-[opacity,transform,filter] duration-700 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] xl:p-7 ${
                  active === i ? "translate-y-0 opacity-100 blur-0" : active > i ? "-translate-y-4 opacity-0 blur-[3px]" : "translate-y-4 opacity-0 blur-[3px]"
                }`}
              >
                <div className="w-full max-w-[34rem]">
                  <Panel />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Everywhere else: the three moments in order. */}
      <div className="mx-auto mt-14 max-w-xl space-y-20 px-6 tall-lg:hidden">
        {STEPS.map(({ id, title, body, Panel }) => (
          <Reveal as="article" key={id}>
            <h3 className="font-display text-[1.75rem] leading-tight font-medium tracking-[-0.02em]">{title}</h3>
            <p className="mt-2 text-base leading-relaxed text-ink-soft">{body}</p>
            <div aria-hidden="true" className="showcase-stage mt-6 rounded-[1.75rem] p-3 sm:p-5">
              <Panel />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
