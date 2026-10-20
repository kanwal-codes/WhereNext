/**
 * The phone redesign (docs/design/phone-redesign-plan.md) ships behind one build-time flag, so each step can merge to
 * main while production still shows the current app. Read `process.env.NEXT_PUBLIC_PHONE_V2` literally: Next only
 * inlines a static reference into the browser bundle. Off unless it is exactly "1". Delete this file, and every
 * `PHONE_V2` branch, when the redesign is switched on for good.
 */
export const PHONE_V2 = process.env.NEXT_PUBLIC_PHONE_V2 === "1";
