import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Outfit, Figtree } from "next/font/google";
import { ToastHost } from "@/components/ToastHost";

const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-outfit", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Next Place to Be — plan a trip by talking about it",
  description: "A calm travel workspace: talk through your trip, then explore, compare and build the itinerary in one place.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${figtree.variable}`}>
      <body>
        {children}
        <ToastHost />
      </body>
    </html>
  );
}
