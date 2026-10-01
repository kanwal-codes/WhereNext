"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { LandingBloom, type BloomVariant } from "@/components/landing/LandingBloom";
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
  const bloomRef = useRef<HTMLDivElement>(null);
  const partRefs = useRef<(HTMLElement | null)[]>([]);
  // Preview switch while choosing a look: /?bloom=dusk|sunrise|horizon|route|trip|rock|shore|photo (default beach).
  const [variant, setVariant] = useState<BloomVariant>("beach");
  const [typedLength, setTypedLength] = useState(0);
  const beach = variant === "beach";
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("bloom");
    if (v === "dusk" || v === "sunrise" || v === "horizon" || v === "route" || v === "trip" || v === "rock" || v === "shore" || v === "photo") setVariant(v);
  }, []);

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
      // The glow lets go a little later and slower than the text, so the story below arrives on a clean page.
      const lift = () => {
        gsap.to(bloomRef.current, {
          opacity: 0,
          y: -24,
          ease: "none",
          scrollTrigger: { trigger: sectionRef.current, start: "top top", end: () => `+=${window.innerHeight * 0.65}`, scrub: true, invalidateOnRefresh: true },
        });
        gsap.to(contentRef.current, {
          opacity: 0,
          y: -48,
          ease: "none",
          scrollTrigger: { trigger: sectionRef.current, start: "top top", end: () => `+=${window.innerHeight * 0.2}`, scrub: true, invalidateOnRefresh: true },
        });
      };

      // Beach on a wide screen: the page stays put while the tide comes in. The water (a second copy
      // of the photograph, cut along the foam) rises over the sand and washes out what is drawn in it;
      // the prompt rides up with its foam, then fades once the water reaches the headline. Last, the water
      // washes out to the page colour so the next scene arrives from a clean page.
      const tide = () => {
        const tideEl = sectionRef.current?.querySelector<HTMLElement>("[data-beach-tide]");
        const [headline, sub, box] = [partRefs.current[0], partRefs.current[1], partRefs.current[2]];
        const veil = sectionRef.current?.querySelector<HTMLElement>("[data-beach-veil]");
        if (!tideEl || !veil || !headline || !sub || !box) return lift();
        const rise = () => Math.max(window.innerWidth, window.innerHeight * 1.7778) * 0.5628 * 0.8;
        const tl = gsap.timeline({
          scrollTrigger: { trigger: sectionRef.current, start: "top top", end: () => `+=${window.innerHeight * 1.7}`, scrub: 0.8, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
        });
        tl.to(tideEl, { y: () => -rise(), ease: "none", duration: 1 }, 0)
          .to(box, { y: () => -rise(), ease: "none", duration: 1 }, 0)
          .to(box, { opacity: 0, ease: "power1.in", duration: 0.3 }, 0.45)
          .to([headline, sub], { opacity: 0, y: -30, ease: "power1.in", duration: 0.3 }, 0.35)
          // The water, now filling the screen, washes out to the page's own colour, and the story begins from there.
          .to(veil, { opacity: 1, ease: "power1.inOut", duration: 0.4 }, 0.62);
      };

      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (min-aspect-ratio: 7/5)", () => (beach ? tide() : lift()));
      mm.add("(max-width: 767px), (max-aspect-ratio: 7/5)", () => lift());
    }, sectionRef);
    return () => ctx.revert();
  }, [beach]);

  const part = (index: number) => (el: HTMLElement | null) => {
    partRefs.current[index] = el;
  };

  return (
    <section
      ref={sectionRef}
      data-scene="prompt"
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background px-6 pt-28 pb-20 [@media(max-height:760px)]:pt-20 [@media(max-height:760px)]:pb-8"
    >
      <div ref={bloomRef} className="absolute inset-0">
        <LandingBloom variant={variant} progress={Math.min(typedLength / 70, 1)} />
      </div>
      <div ref={contentRef} className={`relative mx-auto flex w-full max-w-3xl flex-col items-center text-center ${beach ? "beach-content" : ""}`}>
        <h1
          ref={part(0)}
          className={`${beach ? "beach-h1 " : "translate-y-4 "}font-display text-[clamp(2.5rem,6.6vw,5.25rem)] [@media(max-height:760px)]:text-[clamp(2.1rem,5.4vw,3.9rem)] leading-[0.98] tracking-[-0.04em] text-balance opacity-0`}
        >
          Let&rsquo;s plan something.
        </h1>
        <p ref={part(1)} className={`${beach ? "beach-sub " : "translate-y-4 "}mt-5 [@media(max-height:760px)]:mt-3 max-w-xl text-base leading-relaxed text-balance opacity-0 sm:text-lg ${variant === "photo" ? "font-medium text-foreground/80 [text-shadow:0_1px_14px_rgba(255,255,255,0.65)]" : "text-muted-foreground"}`}>
          Dates, budget, who&rsquo;s coming. Share the rough idea and watch the trip take shape.
        </p>
        <div ref={part(2)} className={`${beach ? "beach-box " : "translate-y-4 "}mt-9 [@media(max-height:760px)]:mt-5 w-full opacity-0`}>
          <TripPromptBox onTyping={setTypedLength} foam={variant === "shore" || variant === "rock" || variant === "photo" || beach} foamSides={variant !== "photo" && !beach} beach={beach} />
        </div>
      </div>

    </section>
  );
}
