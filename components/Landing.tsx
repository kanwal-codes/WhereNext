"use client";

import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Reveal, WordReveal, ease } from "@/components/motion-primitives";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

const mountainsImg = "/design/land-mountains.jpg";
const friendsImg = "/design/land-friends-v3.png";
const cityImg = "/design/land-city-v3.png";
const stayImg = "/design/land-stay.jpg";
const coastImg = "/design/land-coast-v3.png";

/** Scroll-triggered rise. Editorial pacing: slow, once, never bouncy. */
function InView({ children, className, delay = 0, y = 22 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -12% 0px" }}
      transition={{ duration: 0.85, ease, delay }}
    >
      {children}
    </motion.div>
  );
}

/** Image that drifts slowly as the page scrolls, fading into the paper at both ends. */
function Plate({
  src,
  alt,
  className,
  ratio = "aspect-[4/5]",
  fade = "both",
  priority = false,
}: {
  src: string;
  alt: string;
  className?: string;
  ratio?: string;
  fade?: "both" | "bottom" | "none";
  priority?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-6%", "6%"]);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", ratio, className)}>
      <motion.img src={src} alt={alt} style={{ y }} loading={priority ? "eager" : "lazy"} decoding="async" className="absolute inset-0 h-[112%] w-full object-cover" />
      <div className="pointer-events-none absolute inset-0 grain" />
      {fade !== "none" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: "linear-gradient(to top, var(--color-background), color-mix(in oklab, var(--color-background) 55%, transparent) 45%, transparent)" }}
        />
      )}
      {fade === "both" && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1/4"
          style={{ background: "linear-gradient(to bottom, color-mix(in oklab, var(--color-background) 70%, transparent), transparent)" }}
        />
      )}
    </div>
  );
}

function Chapter({ index, label, title, body, note }: { index: string; label: string; title: string; body: string; note?: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-sm text-coral">{index}</span>
        <span className="eyebrow">{label}</span>
      </div>
      <h2 className="mt-4 font-display text-3xl leading-[1.12] sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-ink-soft">{body}</p>
      {note && <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["0%", "14%"]);
  const heroScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1.04, 1.12]);

  return (
    <div className="min-h-screen">
      {/* ——— Cover ——— */}
      <header ref={heroRef} className="relative h-[86svh] min-h-[560px] w-full overflow-hidden">
        <motion.img src={mountainsImg} alt="Mist rolling over a mountain pass at sunrise" style={{ y: heroY, scale: heroScale }} className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 vignette" />
        <div className="pointer-events-none absolute inset-0 grain" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{ background: "linear-gradient(to top, var(--color-background), color-mix(in oklab, var(--color-background) 60%, transparent) 50%, transparent)" }}
        />

        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 pt-7 sm:px-10">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 backdrop-blur-sm">
              <BrandMark variant="text" />
            </Link>
            <div className="flex items-center gap-3 sm:gap-5">
              <Link href="/sign-in" className="link-underline text-sm font-medium">
                Sign in
              </Link>
              <Link href="/sign-up" className="rounded-full bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03] sm:px-4">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create account</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-[1200px] px-6 pb-14 sm:px-10 lg:pb-20">
            <Reveal delay={0.15}>
              <p className="eyebrow hero-eyebrow">A travel workspace</p>
            </Reveal>
            <WordReveal text="Talk about it." delay={0.3} className="mt-4 font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-7xl lg:text-[5.5rem]" />
            <WordReveal text="Then go." as="p" delay={0.5} className="font-display text-5xl leading-[0.98] tracking-[-0.03em] text-ink-soft sm:text-7xl lg:text-[5.5rem]" />
            <Reveal delay={0.8} className="mt-8 max-w-sm">
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">
                No forms, no twelve open tabs. A conversation that remembers, and a trip that quietly builds itself around your answers.
              </p>
            </Reveal>
          </div>
        </div>
      </header>

      {/* ——— Opening statement ——— */}
      <section className="mx-auto max-w-[1200px] px-6 pt-20 pb-24 sm:px-10 lg:pt-28 lg:pb-32">
        <InView>
          <p className="max-w-4xl font-display text-2xl leading-[1.35] tracking-[-0.015em] sm:text-3xl lg:text-[2.5rem] lg:leading-[1.25]">
            Most trips start as a feeling — a photograph, a friend&rsquo;s story, a week off in June.{" "}
            <span className="text-muted-foreground">Where next? starts there too, and turns the talking into somewhere real.</span>
          </p>
        </InView>
      </section>

      {/* ——— 01 Conversation ——— */}
      <section className="mx-auto max-w-[1200px] px-6 sm:px-10">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
          <InView className="lg:col-span-5">
            <Chapter
              index="01"
              label="Conversation"
              title="It asks. You answer. It remembers."
              body="Tell it you have nine days and a soft spot for old harbour towns. It asks the right follow-ups, keeps every answer, and proposes options you either confirm or wave off."
              note="Travel style is set once — interests, pace, budget, dietary needs, home airport — and everything after that is ranked around it."
            />
          </InView>
          <InView className="lg:col-span-7" delay={0.1}>
            <Plate src={friendsImg} alt="Friends laughing around a long dinner table at dusk" ratio="aspect-[4/3] lg:aspect-[5/4]" className="rounded-[2rem]" />
          </InView>
        </div>
      </section>

      {/* ——— 02 Evidence, full bleed ——— */}
      <section className="relative mt-24 lg:mt-36">
        <Plate src={cityImg} alt="An old town street at blue hour, cafés lit along the cobblestones" ratio="aspect-[16/10] sm:aspect-[21/9]" fade="both" className="w-full" />
        <div className="relative z-10 mx-auto -mt-10 max-w-[1200px] px-6 sm:-mt-16 sm:px-10">
          <div className="grid gap-10 lg:grid-cols-12">
            <InView className="lg:col-span-6 lg:col-start-7">
              <Chapter
                index="02"
                label="Evidence"
                title="Everything it shows, it can point to."
                body="Places, stays, flights, events and the weather come from live data — each with a source link. Nothing invented, nothing quietly out of date."
                note="Discover ranks by what you like and where you're staying. Compare puts the shortlist side by side so the choice is obvious."
              />
            </InView>
          </div>
        </div>
      </section>

      {/* ——— 03 The days ——— */}
      <section className="mx-auto mt-24 max-w-[1200px] px-6 sm:px-10 lg:mt-36">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
          <InView className="lg:col-span-7">
            <Plate src={stayImg} alt="Morning light through a balcony door in a quiet room" ratio="aspect-[4/3]" className="rounded-[2rem]" />
          </InView>
          <InView className="lg:col-span-5" delay={0.1}>
            <Chapter
              index="03"
              label="The days"
              title="A plan that holds together."
              body="Confirmed choices land in one place: where you're based night by night, how the days connect on the map, and an itinerary you can actually follow."
              note="Trip notes keep the decisions, the constraints and the still-open questions where you left them."
            />
          </InView>
        </div>
      </section>

      {/* ——— 04 Together, full bleed ——— */}
      <section className="relative mt-24 lg:mt-36">
        <Plate src={coastImg} alt="A coastal road curving above turquoise water" ratio="aspect-[21/9] sm:aspect-[24/9]" fade="both" className="w-full" />
        <div className="relative z-10 mx-auto -mt-10 max-w-[1200px] px-6 sm:-mt-16 sm:px-10">
          <div className="grid gap-10 lg:grid-cols-12">
            <InView className="lg:col-span-6">
              <Chapter
                index="04"
                label="Together, and on the road"
                title="Bring the people coming with you."
                body="Invite friends or family as editors or viewers — edits and presence sync live. Publish a read-only itinerary and map for everyone else."
                note="Install it like an app: the day's plan works offline, and a pre-trip review flags the gaps before you leave. Paste a guide or blog link and it pulls the destination and places into a new trip."
              />
            </InView>
          </div>
        </div>
      </section>

      {/* ——— Close ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-24 sm:px-10 lg:py-36">
        <InView>
          <p className="eyebrow">Start whenever</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">So — where next?</h2>
          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.03]">
              Create free account <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/sign-in" className="link-underline text-sm font-medium">
              Sign in
            </Link>
          </div>
        </InView>
      </section>

      <footer className="mx-auto max-w-[1200px] px-6 pb-12 sm:px-10">
        <div className="hairline" />
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <BrandMark variant="text" />
          <div className="flex flex-wrap items-center gap-5 text-xs text-muted-foreground">
            <Link href="/privacy" className="link-underline">
              Privacy
            </Link>
            <Link href="/terms" className="link-underline">
              Terms
            </Link>
            <span>Plan by talking</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
