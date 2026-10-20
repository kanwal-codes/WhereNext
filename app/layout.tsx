import { PHONE_V2 } from "@/lib/phone-v2";
import { KeyboardAssist } from "@/components/KeyboardAssist";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { Outfit, Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ToastHost } from "@/components/ToastHost";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeSync } from "@/components/ThemeSync";
import { MotionProvider } from "@/components/MotionProvider";
import { NavProgress } from "@/components/NavProgress";
import { ViewTransitionGate } from "@/components/ViewTransitionGate";
import { PerfProbeGate } from "@/components/PerfProbeGate";
import { DARK_MODE_ENABLED } from "@/lib/theme-config";

// Runs before hydration so dark mode never flashes light-then-dark. An explicit choice
// (from ThemeToggle, in localStorage) wins; otherwise this falls back to the OS preference
// at load time.
const THEME_INIT = `(function(){try{var enabled=${DARK_MODE_ENABLED ? "true" : "false"};var t=localStorage.getItem("theme");var d=enabled&&(t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches));document.documentElement.classList.toggle("dark",d);if(!enabled)localStorage.setItem("theme","light");}catch(e){}})();`;

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.wherenexts.com"),
  title: "Where next? — plan a trip by talking about it",
  description: "A calm travel workspace: talk through your trip, then explore, compare and build the itinerary in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Where next?", statusBarStyle: "default" },
  // Next only emits the modern unprefixed `mobile-web-app-capable` for `appleWebApp.capable` (Safari
  // 16.4+ / iOS 16.4+). An iPhone on an older iOS only launches a home-screen-added site full-screen
  // (no address bar, no bottom toolbar — the whole reason "feels like an app" vs "feels like a website")
  // if the legacy apple-prefixed tag is present too. Costs nothing on anything that ignores it.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1c20" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Chrome on Android resizes the page itself when the keyboard opens (instead of covering it), so fixed bars and
  // full-height screens ride up with it in step rather than after it. iOS ignores this; use-keyboard-fit.ts covers iOS.
  interactiveWidget: "resizes-content",
};

// overflow-x-hidden lives on <html> only, not <body>. Per the CSS spec, setting only
// overflow-x on an element forces its overflow-y to compute as `auto` — that alone makes the
// element a "scrolling ancestor" for `position: sticky` purposes even though it never actually
// scrolls itself (the real scroll stays on <html>/the viewport). Put it on <body> too and every
// sticky descendant (the trip sidebar included) starts calculating its stuck position against
// the wrong ancestor and drifts off-screen instead of staying pinned.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable} overflow-x-hidden`} data-phone-v2={PHONE_V2 ? "" : undefined} suppressHydrationWarning>
      <body>
        {/* beforeInteractive: Next.js injects this into <head> and runs it before hydration,
            so the `dark` class lands before first paint — no light-then-dark flash. */}
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
        <MotionProvider>
          <NavProgress />
          <ViewTransitionGate />
          <PerfProbeGate />
          {children}
          <ToastHost />
          <KeyboardAssist />
          <ServiceWorkerRegister />
          <ThemeSync />
          <Analytics />
          <SpeedInsights />
        </MotionProvider>
      </body>
    </html>
  );
}
