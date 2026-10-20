// Collapsed context doesn't drop to 0 — it stays a slim rail (mirrors TripShell's sidebar
// collapse) so the re-expand toggle always has somewhere to live, inside the panel it controls.
const RAIL_WIDTH = 48;
// Length tracks, not `minmax(…, 1fr)` strings: a track list that mixes `fr` and `px` cannot be interpolated, so
// the old resize snapped at the end of its animation. Every track is a CSS length the browser resolves itself, in
// the same frame as the width it depends on. That matters while the trip sidebar slides: the panel's tracks used to
// be pixels measured from the shell by a ResizeObserver, which reports one frame late, so with a panel open the
// chat and the panel shook for the whole 420 ms. Now nothing is measured.
const CHAT_WHEN_PANEL = 512; // 32rem
// The panel takes what the chat leaves, up to 720 px: a detail view stretched across 940 px reads worse, and the chat gets the rest on a wide screen.
const PANEL_MAX = 720;
// Sized from the SCREEN, as if the trip sidebar were open (264 px), not from the room beside it. The sidebar collapsing then
// hands its 188 px to the chat column and never to the panel, so nothing inside the panel re-wraps while it slides.
const SIDEBAR_OPEN = 264;
const CONTEXT_WIDTH = 340;

/** The grid's column tracks: one column on a narrow screen, else the conversation and the side pane. */
export function shellColumns({ desktop, hasPanel, showContext }: { desktop: boolean; hasPanel: boolean; showContext: boolean }): string {
  const panelTrack = `min(${PANEL_MAX}px, max(0px, calc(100vw - ${SIDEBAR_OPEN + CHAT_WHEN_PANEL}px)))`;
  const sideTrack = hasPanel ? panelTrack : `${showContext ? CONTEXT_WIDTH : RAIL_WIDTH}px`;
  return !desktop ? "minmax(0, 1fr) 0px" : `calc(100% - ${sideTrack}) ${sideTrack}`;
}

/** What the side pane is showing, which decides whether the column animates when it changes. */
export const layoutModeOf = ({ hasPanel, showContext }: { hasPanel: boolean; showContext: boolean }): "panel" | "context" | "rail" => (hasPanel ? "panel" : showContext ? "context" : "rail");
