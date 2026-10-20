import type { TravelerProfile } from "@/packages/contracts/profile";

/** The three-letter code in what was typed or picked: "YYZ", or "Toronto Pearson International Airport (YYZ)". */
export const airportCode = (text: string): string | null => {
  const v = text.trim();
  if (/^[A-Za-z]{3}$/.test(v)) return v.toUpperCase();
  return /\(([A-Za-z]{3})\)\s*$/.exec(v)?.[1]?.toUpperCase() ?? null;
};

/**
 * What typing in the home-airport box does: the text to show (a bare code is capitalised), and what happens to the saved airport —
 * `""` clears it, a code sets it, `null` leaves it as it was (text that is not a code yet).
 */
export function readAirportInput(text: string): { shown: string; airport: string | null } {
  const shown = /^[A-Za-z]{3}$/.test(text.trim()) ? text.trim().toUpperCase() : text;
  if (!text.trim()) return { shown, airport: "" };
  return { shown, airport: airportCode(text) };
}

/** A suggestion picked from the airport list: its code, and the text to show for it ("Name (CODE)"). */
export const pickedAirport = (s: { placeId: string; text: string }): { airport: string; shown: string } => ({
  airport: s.placeId,
  shown: s.text.includes(`(${s.placeId})`) ? s.text : `${s.text} (${s.placeId})`,
});

/** One sentence on what the chosen travel style means for new trips. Only what was actually chosen is mentioned. */
export function styleSummary(input: { interests: string[]; pace: string | undefined; budget: string | undefined; companions: string }): string {
  const top = input.interests.slice(0, 3).join(", ").toLowerCase() || "whatever looks good";
  const { pace, budget, companions } = input;
  const parts = [
    pace && `at a ${pace.toLowerCase()} pace`,
    budget && `on a ${budget.toLowerCase()} budget`,
    companions && `usually travelling ${companions.toLowerCase() === "solo" ? "solo" : `with ${companions.toLowerCase()}`}`,
  ].filter(Boolean);
  return `New trips will lean towards ${top}${parts.length ? `, ${parts.join(", ")}` : ""}.`;
}

/** The travel-style part of the profile as it is saved (`null` clears one that was set). */
export function stylePatch(input: { interests: string[]; dietary: string[]; dietNote: string; pace: string | undefined; budget: string | undefined; stay: string; companions: string }): Partial<TravelerProfile> {
  return { interests: input.interests, dietaryNeeds: input.dietary, dietaryNote: input.dietNote || undefined, pace: input.pace ?? null, budget: input.budget ?? null, stayType: input.stay, groupType: input.companions || null } as Partial<TravelerProfile>;
}

/** The "profile & account" part of the profile as it is saved; an empty field is left out. */
export function formPatch(input: { airport: string; city: string; language: string; country: string; bio: string; notifications: TravelerProfile["notifications"] }): Partial<TravelerProfile> {
  return { homeAirport: input.airport || undefined, homeCity: input.city || undefined, language: input.language || undefined, country: input.country || undefined, bio: input.bio || undefined, notifications: input.notifications };
}

/** The list with `value` added, or taken out if it is already there. */
export const toggled = (list: string[], value: string): string[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

const PASSWORD_MIN = 8;
/** A new password can be saved once it is long enough and typed twice the same way. */
export const canChangePassword = (next: string, confirm: string): boolean => next.length >= PASSWORD_MIN && next === confirm;
/** Show "doesn't match" only once something has been typed in the confirmation. */
export const passwordsMatch = (next: string, confirm: string): boolean => confirm.length === 0 || confirm === next;

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
/** Why a chosen photo cannot be used, or null. */
export function avatarProblem(file: { type: string; size: number }, allowedTypes: string[]): string | null {
  if (!allowedTypes.includes(file.type)) return "Choose a JPEG, PNG, WebP, GIF or HEIC photo.";
  if (file.size > AVATAR_MAX_BYTES) return "Keep it under 5MB.";
  return null;
}

export const shareUrl = (origin: string, slug: string): string => `${origin}/s/${slug}`;
