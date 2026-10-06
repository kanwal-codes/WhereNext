/**
 * The code on the left of the boarding pass. The page is given the visitor's nearest airport from the platform's
 * location headers (see nearest-airport.ts). When there is none (local development, a private connection), this
 * is the fallback: the main airport of the time zone their browser reports, read on their own device and never sent
 * or stored. When the zone is not one we know either, the pass says HOME. A time zone alone is coarse (all of US
 * Eastern is one zone), which is why it comes second.
 */
const BY_ZONE: Record<string, string> = {
  "America/Toronto": "YYZ", "America/Vancouver": "YVR", "America/Edmonton": "YEG", "America/Winnipeg": "YWG", "America/Halifax": "YHZ", "America/St_Johns": "YYT", "America/Montreal": "YUL",
  "America/New_York": "JFK", "America/Chicago": "ORD", "America/Denver": "DEN", "America/Los_Angeles": "LAX", "America/Phoenix": "PHX", "America/Anchorage": "ANC", "Pacific/Honolulu": "HNL",
  "America/Mexico_City": "MEX", "America/Bogota": "BOG", "America/Lima": "LIM", "America/Santiago": "SCL", "America/Sao_Paulo": "GRU", "America/Argentina/Buenos_Aires": "EZE",
  "Europe/London": "LHR", "Europe/Dublin": "DUB", "Europe/Paris": "CDG", "Europe/Berlin": "BER", "Europe/Madrid": "MAD", "Europe/Lisbon": "LIS", "Europe/Rome": "FCO", "Europe/Amsterdam": "AMS",
  "Europe/Brussels": "BRU", "Europe/Zurich": "ZRH", "Europe/Vienna": "VIE", "Europe/Stockholm": "ARN", "Europe/Copenhagen": "CPH", "Europe/Oslo": "OSL", "Europe/Helsinki": "HEL",
  "Europe/Warsaw": "WAW", "Europe/Prague": "PRG", "Europe/Athens": "ATH", "Europe/Istanbul": "IST", "Europe/Moscow": "SVO",
  "Asia/Dubai": "DXB", "Asia/Kolkata": "DEL", "Asia/Calcutta": "DEL", "Asia/Karachi": "KHI", "Asia/Bangkok": "BKK", "Asia/Singapore": "SIN", "Asia/Hong_Kong": "HKG", "Asia/Shanghai": "PVG",
  "Asia/Tokyo": "HND", "Asia/Seoul": "ICN", "Asia/Manila": "MNL", "Asia/Jakarta": "CGK",
  "Australia/Sydney": "SYD", "Australia/Melbourne": "MEL", "Australia/Perth": "PER", "Pacific/Auckland": "AKL",
  "Africa/Johannesburg": "JNB", "Africa/Cairo": "CAI", "Africa/Lagos": "LOS", "Africa/Nairobi": "NBO",
};

export const HOME_CODE = "HOME";

export function guessHomeCode(): string {
  try {
    return BY_ZONE[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? HOME_CODE;
  } catch {
    return HOME_CODE;
  }
}
