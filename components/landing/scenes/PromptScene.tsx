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
  const partRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const parts = partRefs.current.filter((el): el is HTMLElement => Boolean(el));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(parts, { opacity: 1, y: 0 });
      return;
    }
    const ctx = gsap.context(() => {
      gsap.to(parts, { opacity: 1, y: 0, duration: 0.7, ease: "cubic-bezier(.22, 1, .36, 1)", stagger: 0.09, delay: 0.15 });
      // The first screen hands over to the story: it lifts and fades within the first fifth of a
      // screen of scroll, so it is gone before the chat bubbles rise into view.
      gsap.to(contentRef.current, {
        opacity: 0,
        y: -48,
        ease: "none",
        scrollTrigger: { trigger: sectionRef.current, start: "top top", end: () => `+=${window.innerHeight * 0.2}`, scrub: true, invalidateOnRefresh: true },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const part = (index: number) => (el: HTMLElement | null) => {
    partRefs.current[index] = el;
  };

  return (
    <section
      ref={sectionRef}
      data-scene="prompt"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6 pt-28 pb-20 [@media(max-height:760px)]:pt-20 [@media(max-height:760px)]:pb-8"
    >
      <div ref={contentRef} className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <h1
          ref={part(0)}
          className="translate-y-4 font-display text-[clamp(2.75rem,8vw,6rem)] [@media(max-height:760px)]:text-[clamp(2.25rem,6vw,4.25rem)] leading-[0.98] tracking-[-0.04em] text-balance opacity-0"
        >
          Let&rsquo;s plan something.
        </h1>
        <p ref={part(1)} className="mt-5 [@media(max-height:760px)]:mt-3 max-w-xl translate-y-4 text-base leading-relaxed text-balance text-muted-foreground opacity-0 sm:text-lg">
          Dates, budget, who&rsquo;s coming. Share the rough idea and watch the trip take shape.
        </p>
        <div ref={part(2)} className="mt-9 [@media(max-height:760px)]:mt-5 w-full translate-y-4 opacity-0">
          <TripPromptBox />
        </div>
      </div>

    </section>
  );
}
