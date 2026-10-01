"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TripPromptBox } from "@/components/landing/TripPromptBox";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scene zero: the doorway. Instead of asking a visitor to sign up before they can try the
 * product, this is a nearly empty screen with one invitation and the box — a visitor who came to
 * try Roam does so straight away; everyone else scrolls into the story below.
 */
export function PromptScene() {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      // The first screen hands over to the story: it lifts and fades within the first fifth of a
      // screen of scroll, so it is gone before the chat bubbles rise into view.
      // When the content is taller than the window (big text, browser zoom, a short screen) the
      // fade waits until the rest of the first screen has been scrolled into view, so the box and
      // its button are never faded out before they can be reached. Normally that wait is 0.
      const hiddenBelowFold = () => Math.max(0, (sectionRef.current?.offsetHeight ?? 0) - window.innerHeight);
      gsap.to(contentRef.current, {
        opacity: 0,
        y: -48,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: () => `top+=${hiddenBelowFold()} top`,
          end: () => `+=${window.innerHeight * 0.2}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      data-scene="prompt"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6 pt-28 pb-20 [@media(max-height:760px)]:pt-20 [@media(max-height:760px)]:pb-8 [@media(max-height:640px)]:pt-16! [@media(max-height:640px)]:pb-3!"
    >
      <div ref={contentRef} className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1
          style={{ "--i": 0 } as React.CSSProperties}
          className="landing-rise font-display text-[clamp(2.75rem,8vw,6rem)] [@media(max-height:760px)]:text-[clamp(2.25rem,6vw,4.25rem)] leading-[0.98] tracking-[-0.04em] text-balance"
        >
          Let&rsquo;s plan something.
        </h1>
        <p style={{ "--i": 1 } as React.CSSProperties} className="landing-rise mt-5 [@media(max-height:760px)]:mt-3 max-w-xl text-base leading-relaxed text-balance text-muted-foreground sm:text-lg">
          Dates, budget, who&rsquo;s coming. Share the rough idea and watch the trip take shape.
        </p>
        <div style={{ "--i": 2 } as React.CSSProperties} className="landing-rise mt-9 [@media(max-height:760px)]:mt-5 [@media(max-height:640px)]:mt-4! w-full">
          <TripPromptBox />
        </div>
      </div>

    </section>
  );
}
