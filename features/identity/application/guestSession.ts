/** Set by the landing box just before it opens a guest's chat. A guest chat is disposable: if the
 *  page is loaded without this marker for its trip (a new tab, a returning visit) or is reloaded,
 *  the session is wiped instead of resumed. See `GuestProvider`. */
export const GUEST_LIVE_KEY = "wn:guest-live";
