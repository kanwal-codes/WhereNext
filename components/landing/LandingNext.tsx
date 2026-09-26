"use client";

import { ScrollExperienceProvider } from "@/components/landing/ScrollExperienceProvider";
import { Nav } from "@/components/landing/Nav";
import { HeroScene } from "@/components/landing/scenes/HeroScene";
import { ChaosScene } from "@/components/landing/scenes/ChaosScene";
import { ContextScene } from "@/components/landing/scenes/ContextScene";
import { DiscoverScene } from "@/components/landing/scenes/DiscoverScene";
import { CardJourneyScene } from "@/components/landing/scenes/CardJourneyScene";
import { PlansChangeScene } from "@/components/landing/scenes/PlansChangeScene";
import { GroupPlanningScene } from "@/components/landing/scenes/GroupPlanningScene";
import { BookingsScene } from "@/components/landing/scenes/BookingsScene";
import { CinematicTravelScene } from "@/components/landing/scenes/CinematicTravelScene";
import { FinaleScene } from "@/components/landing/scenes/FinaleScene";

/**
 * Landing page overhaul (docs/LandingPage_Overhaul). Every scene from
 * Build_Plan step 5 / Storyboard order is now built. The live "/" route
 * still renders the current Landing.tsx until cutover (Build_Plan step 8).
 */
export function LandingNext() {
  return (
    <ScrollExperienceProvider>
      <div className="landing-cinematic-scope min-h-screen touch-manipulation overflow-x-hidden bg-background text-foreground">
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-[70] -translate-y-16 rounded bg-primary px-3 py-2 text-sm text-primary-foreground focus-visible:translate-y-0"
        >
          Skip to content
        </a>
        <Nav />
        <main id="main-content">
          <HeroScene />
          <ChaosScene />
          <ContextScene />
          <DiscoverScene />
          <CardJourneyScene />
          <PlansChangeScene />
          <GroupPlanningScene />
          <BookingsScene />
          <CinematicTravelScene />
          <FinaleScene />
        </main>
      </div>
    </ScrollExperienceProvider>
  );
}
