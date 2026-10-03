"use client";

import { ScrollExperienceProvider } from "@/components/landing/ScrollExperienceProvider";
import { Nav } from "@/components/landing/Nav";
import { PromptScene } from "@/components/landing/scenes/PromptScene";
import { ProblemScene } from "@/components/landing/scenes/ProblemScene";
import { SayItOnceScene } from "@/components/landing/scenes/SayItOnceScene";
import { ShowcaseScene } from "@/components/landing/scenes/ShowcaseScene";
import { TradeoffScene } from "@/components/landing/scenes/TradeoffScene";
import { FinaleScene } from "@/components/landing/scenes/FinaleScene";

/**
 * The landing page: a shoreline first screen, then five calm scenes (the problem, say it once, the
 * showcase, the promise, the way back to the shore). Only the first screen is scroll-driven.
 */
export function LandingNext() {
  return (
    <ScrollExperienceProvider>
      <div className="landing-cinematic-scope min-h-screen touch-manipulation overflow-x-clip bg-background text-foreground">
        <a
          href="#main-content"
          className="hit-44 fixed top-2 left-2 z-[70] -translate-y-16 rounded bg-primary px-3 py-2.5 text-sm text-primary-foreground focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main-content">
          <PromptScene />
          <ProblemScene />
          <SayItOnceScene />
          <ShowcaseScene />
          <TradeoffScene />
          <FinaleScene />
        </main>
      </div>
    </ScrollExperienceProvider>
  );
}
