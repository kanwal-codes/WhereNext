/**
 * "Start a trip" anywhere on the page goes back to the prompt box on the first screen and puts the
 * cursor in it, so every call to action leads to the same place (and the same no-account promise).
 * The last screen shows the same shoreline as the first, so the jump back reads as a cut, not a trip.
 */
export const startTrip = () => {
  const focusBox = () => document.getElementById("trip-prompt")?.focus({ preventScroll: true });
  if (window.scrollY < 8) return focusBox();
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => requestAnimationFrame(focusBox));
  });
};
