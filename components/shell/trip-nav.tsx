import { BedDouble, CalendarDays, Compass, LayoutGrid, Map, Notebook, Ticket, Users } from "lucide-react";
import { RoamIcon } from "@/components/shell/NavRow";

export const NAV = [
  { seg: "", label: "Overview", icon: LayoutGrid, exact: true },
  { seg: "chat", label: "Roam", icon: RoamIcon },
  { seg: "group", label: "Group chat", icon: Users },
  { seg: "discover", label: "Discover", icon: Compass },
  { seg: "map", label: "Getting around", icon: Map },
  { seg: "stay", label: "Stay", icon: BedDouble },
  { seg: "itinerary", label: "Plan", icon: CalendarDays },
  { seg: "knowledge", label: "What Roam remembers", icon: Notebook },
  { seg: "bookings", label: "Bookings", icon: Ticket },
] as const;

/** The phone drawer's grouping (docs/design/phone-redesign-plan.md, decision 10): the trip itself, then planning, then what to keep. */
export const PHONE_NAV_GROUPS: Array<{ title: string; segs: string[] }> = [
  { title: "Trip", segs: ["", "chat", "group"] },
  { title: "Plan", segs: ["itinerary", "discover", "stay", "map"] },
  { title: "Keep", segs: ["knowledge", "bookings"] },
];

/** Kept for the drawer's call site: the phone and the desktop sidebar now share one set of names. */
export const PHONE_LABEL: Record<string, string> = {};
