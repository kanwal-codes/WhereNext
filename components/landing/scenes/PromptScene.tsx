import { ChevronDown } from "lucide-react";
import { BoardingPass } from "@/components/landing/pass/BoardingPass";

/**
 * Scene zero: the doorway. A boarding pass already made out to the visitor, whose TO field is the
 * prompt box: a visitor who came to try Roam does so straight away, everyone else scrolls into the
 * story below. The whole screen is plain text and CSS (no photograph), so the first paint is the
 * headline. See the "Boarding Pass Hero" specification for the reason behind each element.
 */
export function PromptScene() {
  return (
    <section data-scene="prompt" className="bp-hero">
      <h1 className="bp-h1">
        <span className="ln">
          <span style={{ "--d": "120ms" } as React.CSSProperties}>
            Check in to{" "}
          </span>
        </span>
        <span className="ln">
          <span style={{ "--d": "200ms" } as React.CSSProperties}>
            your next trip.
          </span>
        </span>
      </h1>
      <p className="bp-sub">
        Tell Roam where you’re headed, or just how you want it to feel. Roam plans
        the rest.
      </p>
      <BoardingPass />
      {/* A quiet cue for people who came to read: hidden on short windows, still under reduced motion. */}
      <button
        type="button"
        aria-label="See how it works"
        onClick={() =>
          document
            .querySelector("[data-scene=problem]")
            ?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
            })
        }
        className="bp-cue hit-44"
      >
        <ChevronDown className="size-5" aria-hidden="true" />
      </button>
    </section>
  );
}
