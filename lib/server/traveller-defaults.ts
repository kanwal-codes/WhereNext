import type { SupabaseClient } from "@supabase/supabase-js";
import { currencyForCountry } from "@/lib/currency";
import { countryFromPlace, fromBrowserLocale } from "@/lib/locales";

export type TravellerDefaults = { language?: string; country?: string; currency?: string };

/**
 * What to assume about a traveller who hasn't set it on a trip: their profile first, then what
 * the request itself shows (browser language, Vercel's IP country). This is how a guest, or a
 * trip made before language/country existed, still gets a sensible reply language, currency and
 * distance unit.
 */
export async function loadTravellerDefaults(supabase: SupabaseClient, userId: string, headers?: Headers): Promise<TravellerDefaults> {
  // A nice-to-have: a failed read means no defaults, never a failed chat turn or page.
  const profile = await Promise.resolve()
    .then(() => supabase.from("profiles").select("data").eq("id", userId).maybeSingle())
    .then((r) => (r.data?.data ?? {}) as Record<string, unknown>, () => ({}) as Record<string, unknown>);
  const asked = fromBrowserLocale(headers?.get("accept-language")?.split(",")[0]?.trim());
  const ip = headers?.get("x-vercel-ip-country")?.toUpperCase();
  const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  // Their own country first, then the one their home city names ("Toronto, Canada"), and only then a guess from the request.
  const country = str(profile.country) ?? countryFromPlace(str(profile.homeCity)) ?? (ip && /^[A-Z]{2}$/.test(ip) ? ip : asked.country);
  return { language: str(profile.language) ?? asked.language, country, currency: str(profile.currency) ?? currencyForCountry(country) };
}

/** The trip's own values always win; the defaults only fill what it lacks. Returns a copy — trip preferences are cached and shared. */
export function withTravellerDefaults(preferences: Record<string, unknown>, defaults: TravellerDefaults): Record<string, unknown> {
  const filled = { ...preferences };
  for (const key of ["language", "country", "currency"] as const) {
    if (!filled[key] && defaults[key]) filled[key] = defaults[key];
  }
  return filled;
}
