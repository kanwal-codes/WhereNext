import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Outfit, Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ToastHost } from "@/components/ToastHost";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { MotionProvider } from "@/components/MotionProvider";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.wherenexts.com"),
  title: "Where next? — plan a trip by talking about it",
  description: "A calm travel workspace: talk through your trip, then explore, compare and build the itinerary in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Where next?", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1b1c20",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body className="overflow-x-hidden">
        <MotionProvider>
          {children}
          <ToastHost />
          <ServiceWorkerRegister />
          <Analytics />
          <SpeedInsights />
        </MotionProvider>
      </body>
    </html>
  );
}
