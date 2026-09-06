import type { Certainty } from "@/lib/design";
import { stayDecisionSchema } from "@/packages/contracts/stay";

const PREFERRED_KEYS = ["name", "title", "label", "hotelName", "destination", "area", "mode", "summary", "value"];

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

/** One readable line for a trip decision, whatever shape its value has. */
export function decisionSummary(kind: string, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";

  if (kind === "stay") {
    const stay = stayDecisionSchema.safeParse(value);
    if (stay.success) {
      const s = stay.data;
      return `${s.hotelName} · ${s.roomName} · ${fmtDay(s.checkin)} – ${fmtDay(s.checkout)} · ${s.totalAmount} ${s.currency}`;
    }
  }

  const record = value as Record<string, unknown>;
  for (const key of PREFERRED_KEYS) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const scalars = Object.values(record).filter((v): v is string | number => (typeof v === "string" && v.trim() !== "") || typeof v === "number");
  if (scalars.length) return scalars.map(String).join(" · ");
  return JSON.stringify(value);
}

/** Decision kinds that already have their own dedicated UI elsewhere (a stay lock, a
 *  suggestion chip) or are pure internal bookkeeping (review email/dismiss tracking) —
 *  never worth a second, generic "Decisions" row. Shared so the rule can't drift between
 *  the trip-context panel and the overview page's own decisions list. */
const HIDDEN_DECISION_KINDS = new Set(["suggestion", "stay", "stay_area", "transport", "review_notified", "review_dismissed"]);
export function isDisplayableDecision(kind: string): boolean {
  return !HIDDEN_DECISION_KINDS.has(kind);
}

/** Who made the decision decides how firm it reads. */
export function certaintyFor(source: string | undefined | null): Certainty {
  if (source === "user") return "confirmed";
  if (source === "assistant" || source === "provider") return "suggested";
  return "undecided";
}
