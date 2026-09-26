import type { Metadata } from "next";
import { LandingNext } from "@/components/landing/LandingNext";

export const metadata: Metadata = {
  title: "Where next? Plan a trip by talking about it",
  robots: { index: false, follow: false },
};

export default function LandingNextPage() {
  return <LandingNext />;
}
