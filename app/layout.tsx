import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Outfit, Figtree } from "next/font/google";
import { ToastHost } from "@/components/ToastHost";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
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
      <body>
        {children}
        <ToastHost />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
