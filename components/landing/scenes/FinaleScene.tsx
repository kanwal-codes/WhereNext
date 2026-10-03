"use client";

import { Wallet } from "@/components/landing/pass/Wallet";
import { Reveal } from "@/components/landing/story/Reveal";

/**
 * The last screen, and the end of the page: the pass again, packed in a travel wallet, with the
 * question printed on it ("Where next?"). A visitor who has read this far can answer right here
 * without scrolling back up. The legal line is lettered on the wallet, so the page ends on leather.
 */
export function FinaleScene() {
  return (
    <section data-scene="finale" className="bp-hero bp-finale">
      <h2 className="sr-only">Where next?</h2>
      <Reveal offset={40} className="bp-area-wrap">
        <Wallet />
      </Reveal>
    </section>
  );
}
