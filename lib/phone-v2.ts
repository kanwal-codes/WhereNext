/**
 * The phone redesign (docs/design/phone-redesign-plan.md) ships behind one build-time flag, so each step can merge to
 * main while production still shows the current app. Read `process.env.NEXT_PUBLIC_PHONE_V2` literally: Next only
 * inlines a static reference into the browser bundle. Off unless it is exactly "1". Delete this file, and every
 * `PHONE_V2` branch, when the redesign is switched on for good.
 */
export const PHONE_V2 = process.env.NEXT_PUBLIC_PHONE_V2 === "1";

/**
 * The one "this is chosen" look on a phone, for every chip, tab and pick: the soft peach fill the chosen flight has, no ink fill,
 * no dark border. Put it on the selected branch; it only takes effect under `max-lg` and only when the redesign is on.
 */
export const PICK_ON = PHONE_V2 ? "max-lg:border-transparent max-lg:bg-coral-soft max-lg:text-foreground max-lg:ring-0 max-lg:hover:border-transparent max-lg:hover:bg-coral-soft max-lg:hover:text-foreground" : "";
/** The matching look for a pick that is not chosen: a hairline outline on white, never a heavy border. */
export const PICK_OFF = PHONE_V2 ? "max-lg:border-hairline max-lg:bg-card" : "";
