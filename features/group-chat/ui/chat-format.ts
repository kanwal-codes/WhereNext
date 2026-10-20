import { memberLabel, type TripMember } from "@/lib/client/use-trip-members";

/** Roam, You, a friend's name, or an empty string while the member list is still loading (never a flash of "Someone"). */
export function displayName(userId: string | null, members: TripMember[], meId: string | undefined, membersLoaded: boolean): string {
  if (!userId) return "Roam";
  if (userId === meId) return "You";
  if (!membersLoaded) return "";
  return memberLabel(members.find((m) => m.userId === userId));
}

// Built once: a long chat formats a time per message per render, and `toLocale*String(options)` builds a formatter on every call.
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const fullTimeFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const dayYearFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
export const timeLabel = (iso: string) => timeFormat.format(new Date(iso));
export const fullTime = (iso: string) => fullTimeFormat.format(new Date(iso));

export function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return (date.getFullYear() === today.getFullYear() ? dayFormat : dayYearFormat).format(date);
}
