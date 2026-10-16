/**
 * The photographs behind the trips home hero, in the order they play. The same set for every
 * account and every trip: the hero is the product's front door, not a mirror of the user's data.
 * Credits are in /public/hero/CREDITS.md.
 *
 * Ten scenes, about 70 seconds a loop, chosen to be seen: each one was tested at the real hero strip
 * (a ~3.4:1 band, its lower half under the headline and prompt) and kept only if its interest lives in
 * the upper half or the sides. The order alternates warm and cool, calm and energetic, nature and city.
 *   place  - the caption shown bottom-left. Names a place only when the photograph is of a known one.
 *   focus  - CSS object-position, to keep the subject inside that strip.
 * To add a scene: a wide (>= 1.7:1) WebP in /public/hero, tested at that strip, then listed here, then
 * `bun run scripts/resize-hero-scenes.ts` for the smaller widths HeroCarousel offers beside the master.
 */
export type HeroScene = { src: string; alt: string; place: string; focus?: string; /** object-position below 640px, where the crop is nearly square. */ focusSm?: string; /** Multiplies the hero scrim for a photograph with bright light behind the headline. */ shade?: number };

export const HERO_SCENES: readonly HeroScene[] = [
  { src: "/hero/10-cappadocia.webp", alt: "Hot-air balloons over Cappadocia's rock formations at sunrise", place: "Cappadocia, Türkiye", focus: "50% 55%" },
  { src: "/hero/01-aerial-beach.webp", alt: "An aerial view of a turquoise sea meeting a palm-lined white beach", place: "Turquoise shores", focus: "50% 50%" },
  { src: "/hero/19-burj-khalifa.webp", alt: "The Dubai skyline and the Burj Khalifa under stormy clouds, highways glowing below", place: "Dubai, UAE", focus: "50% 55%" },
  { src: "/hero/16-desert-suv.webp", alt: "A lone SUV crossing rolling desert dunes", place: "Out in the desert", focus: "50% 50%" },
  { src: "/hero/09-northern-lights.webp", alt: "A green aurora over a still lake and snowy mountains", place: "Northern lights", focus: "50% 50%" },
  { src: "/hero/18-cn-tower.webp", alt: "The CN Tower rising above Toronto's skyscrapers against a teal sky", place: "Toronto, Canada", focus: "50% 28%" },
  { src: "/hero/24-cafe-night.webp", alt: "A café glowing warmly at night", place: "A café after dark", focus: "50% 55%", shade: 1.2 },
  { src: "/hero/12-skydive.webp", alt: "Two skydivers in free fall above farmland", place: "Free fall", focus: "50% 50%", focusSm: "86% 50%", shade: 1.15 },
  { src: "/hero/25-concert-lights.webp", alt: "A crowd under bright concert lights", place: "Live, under the lights", focus: "50% 55%" },
  { src: "/hero/27-santorini.webp", alt: "White buildings and blue domes on Santorini lit up at dusk", place: "Santorini, Greece", focus: "50% 50%" },
];
