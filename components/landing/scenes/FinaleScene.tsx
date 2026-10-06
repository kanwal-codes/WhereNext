"use client";

import { Plane } from "lucide-react";
import { Wallet } from "@/components/landing/pass/Wallet";
import { Reveal } from "@/components/landing/story/Reveal";

/**
 * The last scene, and the end of the page. It has its own opening so the story above does not run into it:
 * a boarding-pass line (the chapter break), "Ready when you are", and the question "Where next?" as the headline.
 * Under it the pass, packed in a travel wallet, writes its examples the way the first screen does, so a visitor
 * who has read this far can answer right here. The legal line is lettered on the wallet.
 */
export function FinaleScene() {
  return (
    <section data-scene="finale" className="bp-hero bp-finale">
      <div aria-hidden="true">
        <Reveal className="fin-break">
          <span className="fin-line" />
          <Plane className="fin-plane" strokeWidth={1.6} />
          <span className="fin-line" />
        </Reveal>
      </div>
      <div className="fin-head">
        <Reveal as="p" offset={20} className="fin-eyebrow">
          Ready when you are
        </Reveal>
        <Reveal as="h2" className="fin-h2">
          Where next?
        </Reveal>
      </div>
      <Reveal offset={40} className="bp-area-wrap">
        <Wallet />
      </Reveal>
    </section>
  );
}
