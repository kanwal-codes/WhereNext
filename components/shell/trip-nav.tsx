import { BedDouble, CalendarDays, Compass, LayoutGrid, Map, Notebook, Ticket, Users } from "lucide-react";
import type { ComponentType } from "react";
import { RoamIcon } from "@/components/shell/NavRow";

export const NAV = [
  { seg: "", label: "Overview", icon: LayoutGrid, exact: true },
  { seg: "chat", label: "Roam", icon: RoamIcon },
  { seg: "group", label: "Group chat", icon: Users },
  { seg: "discover", label: "Discover", icon: Compass },
  { seg: "map", label: "Getting around", icon: Map },
  { seg: "stay", label: "Stay", icon: BedDouble },
  { seg: "itinerary", label: "Itinerary", icon: CalendarDays },
  { seg: "knowledge", label: "Trip knowledge", icon: Notebook },
  { seg: "bookings", label: "Bookings & essentials", icon: Ticket },
] as const;

export type NavItem = (typeof NAV)[number];

/** The phone drawer's grouping (docs/design/phone-redesign-plan.md, decision 10): the trip itself, then planning, then what to keep. */
export const PHONE_NAV_GROUPS: Array<{ title: string; segs: string[] }> = [
  { title: "Trip", segs: ["", "chat", "group"] },
  { title: "Plan", segs: ["itinerary", "discover", "stay", "map"] },
  { title: "Keep", segs: ["knowledge", "bookings"] },
];

/** On a phone the drawer uses the names the pages themselves carry ("Plan", "What Roam remembers", "Bookings"); the desktop sidebar keeps its longer labels. */
export const PHONE_LABEL: Record<string, string> = { itinerary: "Plan", knowledge: "What Roam remembers", bookings: "Bookings" };

export type NavIcon = ComponentType<{ className?: string }>;
