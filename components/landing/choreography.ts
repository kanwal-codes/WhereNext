export const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const progressBetween = (progress: number, start: number, end: number) =>
  clamp01((progress - start) / (end - start));

export const visibleBetween = (
  progress: number,
  enterStart: number,
  enterEnd: number,
  exitStart = 1,
  exitEnd = 1,
) => progressBetween(progress, enterStart, enterEnd) * (1 - progressBetween(progress, exitStart, exitEnd));

export const advanceNarrative = (distance: number) => {
  window.scrollBy({
    top: distance,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
};
