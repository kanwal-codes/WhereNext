"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useAnimateIn } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";

/**
 * Filmic hero: slow Ken Burns drift, scroll parallax, grain + vignette,
 * and the foggy dissolve where the image melts into the page background.
 *
 * `plain` drops the grain / vignette / flat wash (the "film filter"), keeping
 * only the bottom dissolve for text legibility — used on detail pages where the
 * photo should read clean.
 */
export function Hero({
  image,
  fallbackImage,
  alt,
  className,
  plain = false,
  kenBurns = true,
  surface = false,
  ratingBadge,
  coverImages = [],
  coverAlt = "",
  onCoverChange,
  onCoverError,
  dissolve = true,
  children,
}: {
  image: string;
  /** Shown instead of `image` if that photo fails to load (a dead or blocked link), so the hero is never blank. */
  fallbackImage?: string;
  alt: string;
  className?: string;
  plain?: boolean;
  /** false holds the photo still — no Ken Burns zoom — for a hero reached from a chat card that was
   *  itself static, where the sudden drift read as motion the card never promised. Default true. */
  kenBurns?: boolean;
  /** Dissolve into `surface` instead of `background` — for a hero sitting on a card/sheet/panel
   *  whose fill is the surface token, where fading to background would leave a visible seam. */
  surface?: boolean;
  /** A rating label ("4.6 (8,259)", "8.4/10") shown as one frosted pill in the hero's
   *  bottom-right corner, with the dark scrim it needs to stay legible over any photo — the single
   *  rating treatment shared by every detail view (place/stay/event) instead of each hand-rolling
   *  its own scrim+badge markup, which had drifted into two different presentations (an inline
   *  text row on one view, an image-overlay badge with its own bespoke scrim on another). Pass the
   *  icon + value as children (e.g. `<Star .../> 4.6`); omit for a view with no rating to show. */
  ratingBadge?: ReactNode;
  /** Photos to lay over `image`, best first. The first one that loads fades in; one that fails is skipped. */
  coverImages?: string[];
  coverAlt?: string;
  /** Tells the page whether a cover photo is showing, so its text can switch to suit it. */
  onCoverChange?: (shown: boolean) => void;
  /** A cover photo failed to load (it is skipped); lets the page drop it from anywhere else it lists the same photos. */
  onCoverError?: (src: string) => void;
  /** false drops the fade into the page background, leaving a hard bottom edge. Default true. */
  dissolve?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const baseImage = failedImage === image && fallbackImage ? fallbackImage : image;
  const [coverLoaded, setCoverLoaded] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState<string[]>([]);
  const coverSrc = coverImages.find((url) => !coverFailed.includes(url)) ?? null;
  const coverShown = coverSrc !== null && coverLoaded === coverSrc;
  useEffect(() => {
    onCoverChange?.(coverShown);
  }, [coverShown, onCoverChange]);
  const reduce = useReducedMotion();
  const animateIn = useAnimateIn();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  // `plain` keeps only the bottom dissolve (per the docstring above) — the parallax drift is
  // part of the film filter it drops, and left on it can start the image mid-drift (a visible
  // gap at the top) in the short, non-scrolling panels `plain` is used in.
  const y = useTransform(scrollYProgress, [0, 1], ["0%", reduce || plain ? "0%" : "14%"]);
  const fog = useTransform(scrollYProgress, [0, 1], [1, reduce ? 1 : 1.15]);

  return (
    <div ref={ref} className={cn("relative isolate overflow-hidden", className)}>
      <motion.div style={{ y }} className="absolute inset-0 -z-10">
        {/* The fade/scale-in is rAF-driven, so it only plays when the document is live and visible
            (`animateIn`); otherwise the photo starts settled. One element either way: swapping a plain
            img for this one rebuilt the image (and re-decoded it) right after it mounted. */}
        <motion.img
          src={baseImage}
          alt={alt}
          width={1600}
          height={900}
          fetchPriority="high"
          onError={() => setFailedImage(image)}
          className="h-full w-full object-cover object-center"
          initial={animateIn ? { scale: kenBurns ? 1.1 : 1, opacity: 0 } : false}
          animate={{ scale: !kenBurns ? 1 : reduce ? 1.02 : 1.06, opacity: 1 }}
          transition={{
            opacity: { duration: 1, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: !kenBurns || reduce ? 0 : 18, ease: "linear" },
          }}
        />
        {coverSrc && (
          <motion.img
            key={coverSrc}
            src={coverSrc}
            alt={coverShown ? coverAlt : ""}
            aria-hidden={!coverShown}
            decoding="async"
            // A photo that finished loading before the page hydrated never fires onLoad, so check for it too.
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setCoverLoaded(coverSrc);
            }}
            onLoad={() => setCoverLoaded(coverSrc)}
            onError={() => {
              setCoverFailed((current) => [...current, coverSrc]);
              onCoverError?.(coverSrc);
            }}
            className="absolute inset-0 h-full w-full object-cover object-center"
            initial={false}
            animate={{ opacity: coverShown ? 1 : 0 }}
            transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </motion.div>

      {!plain && (
        <>
          <div className="grain pointer-events-none absolute inset-0" />
          <div className="vignette pointer-events-none absolute inset-0" />
          <div className="pointer-events-none absolute inset-0 bg-background/25" />
        </>
      )}

      {/* Rating badge's own legibility scrim goes UNDER the fog dissolve below, not over it —
          it used to render after (on top of) the fog, and its from-ink/65 stop is anchored at
          the very same bottom edge the fog fades to solid surface/background at. Painted on
          top, that 65%-opacity dark tint won by winning the last-paint slot, so the true bottom
          row stayed image-dark instead of resolving to the page's own background color — a hard
          seam right where this hero meets the next block. The fog is the one thing that has to
          have the final say at that exact edge. */}
      {ratingBadge && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/65 via-ink/10 to-transparent" />
      )}

      {dissolve && (
        <>
      <motion.div
        style={{ opacity: fog }}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t to-transparent",
          surface ? "from-surface via-surface/70" : "from-background via-background/70",
        )}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 -bottom-px h-10 [mask-image:linear-gradient(to_top,black,transparent)]",
          surface ? "bg-surface/70" : "bg-background/70",
        )}
      />
        </>
      )}

      {/* The pill itself renders last (on top of the fog) so it stays crisp regardless of the
          wash behind it — it carries its own ink/35 + blur background for contrast. */}
      {ratingBadge && (
        <div className="absolute inset-x-4 bottom-4 flex items-end justify-end gap-3 text-white sm:inset-x-6 sm:bottom-6">
          <div className="flex items-center gap-1.5 rounded-full bg-black/62 px-3 py-1.5 text-xs font-medium text-white">
            {ratingBadge}
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
