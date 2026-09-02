"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Compass, MapPin, MessageCircle, Notebook } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Hero } from "@/components/Hero";
import { Reveal, Stagger, StaggerItem, WordReveal } from "@/components/motion-primitives";

const features = [
  { icon: MessageCircle, title: "Talk it through", body: "Chat naturally about where you want to go, when, and what matters to you." },
  { icon: Compass, title: "Discover together", body: "The assistant suggests places, neighbourhoods and experiences that fit your trip." },
  { icon: MapPin, title: "See it clearly", body: "Open maps, comparisons and itineraries beside the conversation when words aren't enough." },
  { icon: Notebook, title: "Keep the knowledge", body: "Saved places, decisions and notes stay with the trip so nothing gets lost." },
];

export function Landing() {
  return (
    <div className="min-h-screen">
      <Hero image="/design/trip-hero.jpg" alt="Warm rooftops at dusk" className="h-[460px] sm:h-[540px] lg:h-[600px]">
        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 pt-6 sm:px-8">
            <Link href="/" className="inline-flex items-center gap-2">
              <BrandMark variant="compact" />
              <BrandMark variant="text" className="hidden sm:inline" />
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/sign-in" className="link-underline text-sm font-medium">Sign in</Link>
              <Link
                href="/sign-up"
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
              >
                Create account
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-5 pb-10 sm:px-8 lg:pb-14">
            <Reveal delay={0.2}>
              <p className="eyebrow">Plan a trip by talking about it</p>
              <WordReveal
                text="Your next place, one conversation at a time."
                delay={0.3}
                className="mt-3 max-w-3xl font-display text-4xl leading-[1.1] sm:text-5xl lg:text-6xl"
              />
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
                A calm workspace where you chat through ideas, then explore, compare and build the itinerary — all in one place.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
                >
                  Create free account <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-5 py-3 text-sm font-medium backdrop-blur-md transition-transform hover:scale-[1.02]"
                >
                  Sign in
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </Hero>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="mt-3 max-w-xl font-display text-3xl leading-snug sm:text-4xl">Conversation first. Visual when it helps.</h2>
        </Reveal>
        <Stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4" delay={0.1}>
          {features.map((f) => (
            <StaggerItem key={f.title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="h-full rounded-2xl border border-border bg-card p-6 shadow-soft"
              >
                <div className="grid h-10 w-10 place-items-center rounded-full bg-coral-soft">
                  <f.icon className="h-5 w-5 text-coral" />
                </div>
                <h3 className="mt-4 font-display text-lg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </motion.div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8 lg:pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-foreground px-6 py-12 text-background sm:px-10 sm:py-16 lg:py-20">
            <div className="relative z-10 mx-auto max-w-2xl text-center">
              <h2 className="font-display text-3xl leading-snug sm:text-4xl">Start with a place, or just a feeling about one.</h2>
              <p className="mt-4 text-sm leading-relaxed text-background/70 sm:text-base">
                No long forms. No empty itinerary templates. Just a conversation that turns into a trip you actually want to take.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/sign-up"
                  className="inline-flex items-center gap-2 rounded-full bg-background px-5 py-3 text-sm font-medium text-foreground transition-transform hover:scale-[1.02]"
                >
                  Get started free <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex items-center gap-2 rounded-full border border-background/30 px-5 py-3 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
                >
                  I already have an account
                </Link>
              </div>
            </div>
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-coral/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-coral/10 blur-3xl" />
          </div>
        </Reveal>
      </section>
    </div>
  );
}
