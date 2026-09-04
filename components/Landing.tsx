"use client";

import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  ChevronDown,
  Columns2,
  Compass,
  DownloadCloud,
  Info,
  Link2,
  Map,
  MessageSquare,
  NotebookPen,
  Share2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { ContentSwap, Reveal, WordReveal, ease, useAnimateIn } from "@/components/motion-primitives";
import { BrandMark } from "@/components/BrandMark";
import { cn } from "@/lib/utils";

const mountainsImg = "/design/land-mountains-right-v2.webp";
const coastImg = "/design/land-coast-v3.webp";

/** Scroll-triggered rise. Editorial pacing: slow, once, never bouncy. */
function InView({ children, className, delay = 0, y = 22 }: { children: ReactNode; className?: string; delay?: number; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px -12% 0px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.85, ease, delay }}
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

/** Eyebrow + heading (+ optional lead paragraph), shared by every section below the hero. */
function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl leading-[1.12] tracking-[-0.02em] sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {lead && <p className="mt-4 text-[0.95rem] leading-relaxed text-ink-soft">{lead}</p>}
    </div>
  );
}

/** One card for both the bento grid (`chip`: icon in a coral square) and the feature band (bare icon). */
function Tile({
  icon: Icon,
  name,
  line,
  chip = false,
  className,
}: {
  icon: LucideIcon;
  name: string;
  line: string;
  chip?: boolean;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={cn("flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-soft", className)}
    >
      {chip ? (
        <span className="inline-flex size-9 items-center justify-center rounded-xl bg-coral-soft text-coral">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
      ) : (
        <Icon className="size-5 text-coral" strokeWidth={1.75} />
      )}
      <h3 className={cn("font-display", chip ? "mt-4 text-lg" : "mt-3 text-base")}>{name}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{line}</p>
    </motion.div>
  );
}

const MOCK_PLACES = [
  { name: "Café Lento", meta: "8 min walk · opens 08:00", base: 82, tags: ["Quiet", "Veg-friendly"], image: "/design/place-cafe.jpg" },
  { name: "Harbour Walk", meta: "12 min walk · free", base: 77, tags: ["Slow", "Outdoors"], image: "/design/land-coast-v3.webp" },
];

// A chip's `matches` is the place tag it rewards when active — "YYZ" (home airport) never
// touches a place's score, same as in the real ranker: not everything you set moves every card.
const MOCK_CHIPS = [
  { label: "Slow pace", matches: "Slow" },
  { label: "Vegetarian", matches: "Veg-friendly" },
  { label: "YYZ", matches: null },
] as const;
const MOCK_MATCH_BONUS = 14;

/** A live-ish Discover ranking: toggle a chip and the two cards actually re-sort. Hand-built
 * from tokens, not a screenshot — nothing here calls the real ranker. */
function DiscoverMock() {
  const [active, setActive] = useState<Set<string>>(() => new Set(MOCK_CHIPS.map((c) => c.label)));
  const toggle = (label: string) =>
    setActive((cur) => {
      const next = new Set(cur);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const ranked = MOCK_PLACES.map((p) => {
    const bonus = MOCK_CHIPS.filter((c) => active.has(c.label) && c.matches && p.tags.includes(c.matches)).length * MOCK_MATCH_BONUS;
    return { ...p, score: Math.min(99, p.base + bonus) };
  }).sort((a, b) => b.score - a.score);

  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border border-border bg-surface p-4 shadow-lift sm:p-5 lg:max-w-none">
      <div className="flex flex-wrap gap-2">
        {MOCK_CHIPS.map((c) => {
          const on = active.has(c.label);
          return (
            <button
              key={c.label}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.label)}
              className={cn(
                "inline-flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors",
                on ? "bg-coral-soft text-coral" : "border border-border text-muted-foreground hover:border-primary/40 hover:text-primary",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Tap a filter — the ranking follows it.</p>

      <p className="mt-3 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">Near your stay</p>

      <div className="mt-2 space-y-2.5">
        {ranked.map((p) => (
          <motion.div
            key={p.name}
            layout
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static demo asset, no next/image sizing needed */}
            <img src={p.image} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-display text-sm">{p.name}</p>
                <span className="shrink-0 text-xs font-medium text-coral">{p.score}% match</span>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.meta}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-ink-soft">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

type Exchange = { user: string; assistant: string };

const EXCHANGES: Exchange[] = [
  {
    user: "We’ve got 5 days in Lisbon in October. Two of us, mid-range budget, love food and walking.",
    assistant: "Got it — 5 days, October, food-and-walking pace. I’m Roam — I’ll keep flights and stays under mid-range and lean the itinerary toward neighbourhoods you can wander. Coastal day trip, or stay in the city the whole time?",
  },
  {
    user: "Stay in the city, but a coastal day trip sounds good.",
    assistant: "Sintra’s the easy call — 40 minutes by train. I found three neighbourhoods that fit your budget near the centre, each walking distance to the food spots you’d like.",
  },
  {
    user: "Show me the neighbourhoods.",
    assistant: "Here’s the top match — quiet, walkable, close to the river.",
  },
];

const TYPE_MS_PER_CHAR = 18;
const PRE_REPLY_PAUSE_MS = 600;
const POST_REPLY_PAUSE_MS = 1400;

/** Static illustration of a Discover-card result, hardcoded — same shell the real
 * conversation's place cards use (`MessageBlocks.tsx`). */
function DemoPlaceCard() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_6%,transparent)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- static demo asset, no next/image sizing needed */}
      <img src="/design/place-neighbourhood.jpg" alt="" className="h-28 w-full rounded-t-2xl object-cover" />
      <div className="p-3.5">
        <h4 className="font-display text-base">Alfama</h4>
        <p className="mt-1 text-xs text-muted-foreground">4.7 · Historic quarter · 6 min walk to the river</p>
      </div>
    </div>
  );
}

/** All three exchanges laid out at once, no typing — the reduced-motion / not-yet-in-view
 * fallback, so the demo never gets stuck mid-conversation. */
function StaticTranscript() {
  return (
    <div className="space-y-3">
      {EXCHANGES.map((e) => (
        <div key={e.user} className="space-y-3">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
              {e.user}
            </p>
          </div>
          <div className="chat-prose">
            <p>{e.assistant}</p>
          </div>
        </div>
      ))}
      <DemoPlaceCard />
    </div>
  );
}

/**
 * A scripted, hardcoded preview of talking to Roam — no live API calls. Autoplays once,
 * typing each reply, when scrolled into view. From then on it's touchable: tap the panel
 * to skip the typing or jump to the next line, or use the dots to jump straight to one.
 * Reduced motion (or a backgrounded tab, via `useAnimateIn`) skips straight to the full
 * static transcript instead of animating.
 */
function ChatDemo() {
  const reduce = useReducedMotion();
  const animateIn = useAnimateIn();
  const [inView, setInView] = useState(false);
  const canPlay = inView && animateIn;

  const [index, setIndex] = useState(0);
  const [replying, setReplying] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const [showCard, setShowCard] = useState(false);
  const [hint, setHint] = useState(true);

  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const preTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimers = () => {
    if (typeTimer.current) clearInterval(typeTimer.current);
    if (preTimer.current) clearTimeout(preTimer.current);
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    typeTimer.current = preTimer.current = advanceTimer.current = null;
  };
  useEffect(() => clearTimers, []);

  /** Show exchange `i`. `typed`: play the pause-then-type-then-advance sequence (autoplay,
   * replay); otherwise show its reply in full immediately (manual navigation). */
  const showExchange = (i: number, typed: boolean) => {
    clearTimers();
    setIndex(i);
    setShowCard(false);
    const text = EXCHANGES[i].assistant;

    if (!typed) {
      setReplying(true);
      setCharCount(text.length);
      if (i === EXCHANGES.length - 1) setShowCard(true);
      return;
    }
    setReplying(false);
    setCharCount(0);
    preTimer.current = setTimeout(() => {
      setReplying(true);
      let count = 0;
      typeTimer.current = setInterval(() => {
        count += 1;
        setCharCount(Math.min(count, text.length));
        if (count >= text.length) {
          if (typeTimer.current) clearInterval(typeTimer.current);
          advanceTimer.current = setTimeout(() => {
            if (i < EXCHANGES.length - 1) showExchange(i + 1, true);
            else setShowCard(true);
          }, POST_REPLY_PAUSE_MS);
        }
      }, TYPE_MS_PER_CHAR);
    }, PRE_REPLY_PAUSE_MS);
  };

  useEffect(() => {
    if (!canPlay) return;
    showExchange(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- autoplay kicks off once, when the section is first in view
  }, [canPlay]);

  const exchange = EXCHANGES[index];
  const replyDone = charCount >= exchange.assistant.length;

  const handleTap = () => {
    setHint(false);
    if (showCard) return showExchange(0, true); // replay, with the typing show
    if (!replying) return; // still in the pre-reply pause — nothing to skip yet
    if (!replyDone) {
      // mid-typing — snap straight to the full line
      clearTimers();
      setCharCount(exchange.assistant.length);
      if (index === EXCHANGES.length - 1) setShowCard(true);
      return;
    }
    // already read — move on, instantly, since the visitor is driving now
    if (index < EXCHANGES.length - 1) showExchange(index + 1, false);
    else setShowCard(true);
  };

  if (reduce) {
    return (
      <div className="mx-auto w-full max-w-lg rounded-[2rem] border border-border bg-surface p-5 shadow-lift sm:p-6">
        <StaticTranscript />
      </div>
    );
  }

  return (
    <motion.div viewport={{ once: true, margin: "-15% 0px -15% 0px" }} onViewportEnter={() => setInView(true)} className="mx-auto w-full max-w-lg">
      <button
        type="button"
        onClick={handleTap}
        className="w-full cursor-pointer rounded-[2rem] border border-border bg-surface p-5 text-left shadow-lift transition-shadow hover:shadow-2xl sm:p-6"
      >
        <motion.div layout transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}>
          <ContentSwap swapKey={String(index)}>
            <div className="space-y-3">
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-lg bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground">
                  {exchange.user}
                </p>
              </div>
              {replying && (
                <div className={cn(!replyDone && "chat-streaming")}>
                  <div className="chat-prose">
                    <p>{exchange.assistant.slice(0, charCount)}</p>
                  </div>
                </div>
              )}
            </div>
          </ContentSwap>
        </motion.div>
        {showCard && (
          <Reveal delay={0.1} className="mt-3">
            <DemoPlaceCard />
          </Reveal>
        )}
      </button>

      <div className="mt-4 flex items-center justify-center gap-3">
        <div className="flex items-center">
          {EXCHANGES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show exchange ${i + 1} of ${EXCHANGES.length}`}
              aria-current={i === index && !showCard}
              onClick={() => {
                setHint(false);
                showExchange(i, false);
              }}
              className="group p-2"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-[width,background-color]",
                  i === index && !showCard ? "w-6 bg-coral" : "w-1.5 bg-border group-hover:bg-muted-foreground/50",
                )}
              />
            </button>
          ))}
        </div>
        {showCard && (
          <button type="button" onClick={handleTap} className="text-xs font-medium text-primary hover:underline">
            Watch again
          </button>
        )}
      </div>
      {hint && !showCard && <p className="mt-2 text-center text-[11px] text-muted-foreground">Tap to skip ahead</p>}
    </motion.div>
  );
}

const STEPS = [
  { n: "01", title: "Talk it through", body: "Tell it what you’re after in plain words. It asks the right follow-ups and keeps every answer." },
  { n: "02", title: "See the evidence", body: "Places, stays, flights, events and weather come from live data — each with a link to its source." },
  { n: "03", title: "Lock in your choices", body: "Wave options off or confirm them. What you keep flows straight into the itinerary." },
];

const TILES: Array<{ name: string; icon: LucideIcon; line: string; span: string }> = [
  { name: "Chat", icon: MessageSquare, line: "Talk the trip through. It asks, remembers your answers and proposes options you confirm.", span: "sm:col-span-2 lg:col-span-4" },
  { name: "Discover", icon: Compass, line: "Places ranked by what you like and where you’re staying, each with a source link.", span: "lg:col-span-2" },
  { name: "Map / getting around", icon: Map, line: "See how the days connect and how you’d move between them.", span: "lg:col-span-2" },
  { name: "Stays", icon: BedDouble, line: "Compare places to stay night by night, close to what you’ve planned.", span: "lg:col-span-2" },
  { name: "Itinerary", icon: CalendarDays, line: "Confirmed choices land in a day-by-day plan you can follow.", span: "lg:col-span-2" },
  { name: "Compare", icon: Columns2, line: "Put a shortlist side by side so the pick is obvious.", span: "lg:col-span-3" },
  { name: "Trip notes", icon: NotebookPen, line: "Decisions, constraints and open questions stay where you left them.", span: "lg:col-span-3" },
];

const FEATURES: Array<{ name: string; icon: LucideIcon; line: string }> = [
  { name: "Import from a link", icon: Link2, line: "Paste a guide or blog URL and it pulls the destination and places into a new trip." },
  { name: "Plan together, live", icon: Users, line: "Invite friends as editors or viewers. Edits and presence sync as they happen." },
  { name: "Comes with you", icon: DownloadCloud, line: "Install it like an app. The day’s plan works offline, and a pre-trip review flags the gaps before you leave." },
  { name: "Share", icon: Share2, line: "Publish a read-only itinerary and map anyone can open." },
];

export function Landing() {
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["0%", "14%"]);
  const heroScale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1.04, 1.12]);

  return (
    <div className="min-h-screen">
      {/* ——— Cover ——— */}
      <header ref={heroRef} className="relative h-[76svh] min-h-[560px] w-full overflow-hidden">
        <motion.img src={mountainsImg} alt="Mist rolling over a mountain pass at sunrise" style={{ y: heroY, scale: heroScale }} className="absolute inset-0 h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 vignette" />
        <div className="pointer-events-none absolute inset-0 grain" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5"
          style={{ background: "linear-gradient(to top, var(--color-background), color-mix(in oklab, var(--color-background) 60%, transparent) 50%, transparent)" }}
        />

        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 pt-5 sm:px-10 sm:pt-7">
            <Link href="/" className="inline-flex items-center gap-2">
              <BrandMark variant="compact" />
              <BrandMark variant="text" textClassName="text-lg sm:text-xl" />
            </Link>
            {/* Utility link only — the real CTA pair lives once, in the hero copy below. */}
            <Link href="/sign-in" className="hero-eyebrow text-sm font-medium whitespace-nowrap transition-opacity hover:opacity-70">
              Sign in
            </Link>
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
            <Reveal delay={1.0} className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/sign-up" className="btn-primary">
                Create free account <ArrowRight className="size-4" />
              </Link>
              <Link href="/sign-in" className="rounded-full bg-white/60 px-4 py-2.5 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/80">
                Sign in
              </Link>
            </Reveal>
          </div>
        </div>

        {/* Scroll cue — hinting there's more below a hero this tall. Decorative only. */}
        <div aria-hidden className="absolute right-6 bottom-6 hidden sm:right-10 sm:bottom-8 sm:block">
          <span className="wx-bob inline-flex size-9 items-center justify-center rounded-full bg-white/30 backdrop-blur-sm">
            <ChevronDown className="size-4 text-foreground/70" />
          </span>
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

      {/* ——— How it works ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 sm:px-10 lg:py-28">
        <InView>
          <SectionHead eyebrow="How it works" title="Talk first. The plan follows." />
        </InView>
        <div className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => (
            <InView key={s.n} delay={i * 0.08} y={18}>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-sm text-coral">{s.n}</span>
                <span className="hairline flex-1" />
              </div>
              <h3 className="mt-4 font-display text-xl">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </InView>
          ))}
        </div>
      </section>

      {/* ——— See it in action ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 sm:px-10 lg:py-28">
        <InView>
          <SectionHead eyebrow="Meet Roam" title="A conversation, not a form." />
        </InView>
        <InView delay={0.1} className="mt-10">
          <ChatDemo />
        </InView>
      </section>

      {/* ——— One workspace, the flagship bento ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 sm:px-10 lg:py-28">
        <InView>
          <SectionHead
            eyebrow="One workspace"
            title="Everything the trip needs, in one place."
            lead="No twelve tabs. Chat, the evidence, the map, stays and the itinerary sit together and stay in sync."
          />
        </InView>
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {TILES.map((t, i) => (
            <InView key={t.name} className={t.span} delay={i * 0.05} y={18}>
              <Tile icon={t.icon} name={t.name} line={t.line} chip />
            </InView>
          ))}
        </div>
      </section>

      {/* ——— Tuned to you ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 sm:px-10 lg:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <InView>
            <SectionHead
              eyebrow="Tuned to you"
              title="Set your travel style once."
              lead="Interests, pace, budget, dietary needs, home airport — set them once and everything after is ranked around them. Change them any time and the trip re-sorts."
            />
          </InView>
          <InView delay={0.1}>
            <DiscoverMock />
          </InView>
        </div>
      </section>

      {/* ——— Feature band ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-20 sm:px-10 lg:py-28">
        <InView>
          <SectionHead eyebrow="Also in the workspace" title="Built for real trips." />
        </InView>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <InView key={f.name} delay={i * 0.06} y={18}>
              <Tile icon={f.icon} name={f.name} line={f.line} />
            </InView>
          ))}
        </div>
      </section>

      {/* ——— A visual breath ——— */}
      <section className="mx-auto max-w-[1200px] px-6 sm:px-10">
        <InView>
          <Plate src={coastImg} alt="A coastal road curving above turquoise water" ratio="aspect-[21/9] sm:aspect-[28/9]" className="rounded-[2rem]" />
        </InView>
      </section>

      {/* ——— Honesty note ——— */}
      <section className="mx-auto max-w-[1200px] px-6 py-8 sm:px-10">
        <InView>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4">
            <Info className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-sm text-ink-soft">Where next? helps you plan and decide. It doesn&rsquo;t book anything or take payment.</p>
          </div>
        </InView>
      </section>

      {/* ——— Close ——— */}
      <section className="mx-auto max-w-[1200px] px-6 pt-8 pb-24 sm:px-10 lg:pb-32">
        <InView>
          <div className="overflow-hidden rounded-[2rem] bg-primary px-6 py-16 text-center text-primary-foreground sm:px-10 lg:py-20">
            <p className="text-[11px] font-medium tracking-[0.14em] text-primary-foreground/70 uppercase">One conversation away</p>
            <h2 className="mx-auto mt-4 max-w-2xl font-display text-4xl leading-[1.05] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
              So — where next?
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-primary-foreground/80">
              A conversation that remembers, and a trip that builds itself around your answers.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex items-center gap-2 rounded-full bg-primary-foreground px-5 py-2.5 text-sm font-medium text-primary transition-transform hover:scale-[1.02]"
              >
                Create free account <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center rounded-full border border-primary-foreground/25 px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
              >
                Sign in
              </Link>
            </div>
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
