/**
 * The code on the left of the boarding pass: the visitor's nearest big airport, guessed from the
 * time zone their browser reports. It is read on their own device and never sent or stored.
 * When the zone is not one we know, the pass says HOME.
 */
const BY_ZONE: Record<string, string> = {
  "America/Toronto": "YYZ", "America/Vancouver": "YVR", "America/Edmonton": "YYC", "America/Winnipeg": "YWG", "America/Halifax": "YHZ", "America/St_Johns": "YYT", "America/Montreal": "YUL",
  "America/New_York": "NYC", "America/Chicago": "CHI", "America/Denver": "DEN", "America/Los_Angeles": "LAX", "America/Phoenix": "PHX", "America/Anchorage": "ANC", "Pacific/Honolulu": "HNL",
  "America/Mexico_City": "MEX", "America/Bogota": "BOG", "America/Lima": "LIM", "America/Santiago": "SCL", "America/Sao_Paulo": "SAO", "America/Argentina/Buenos_Aires": "BUE",
  "Europe/London": "LON", "Europe/Dublin": "DUB", "Europe/Paris": "PAR", "Europe/Berlin": "BER", "Europe/Madrid": "MAD", "Europe/Lisbon": "LIS", "Europe/Rome": "ROM", "Europe/Amsterdam": "AMS",
  "Europe/Brussels": "BRU", "Europe/Zurich": "ZRH", "Europe/Vienna": "VIE", "Europe/Stockholm": "STO", "Europe/Copenhagen": "CPH", "Europe/Oslo": "OSL", "Europe/Helsinki": "HEL",
  "Europe/Warsaw": "WAW", "Europe/Prague": "PRG", "Europe/Athens": "ATH", "Europe/Istanbul": "IST", "Europe/Moscow": "MOW",
  "Asia/Dubai": "DXB", "Asia/Kolkata": "DEL", "Asia/Calcutta": "DEL", "Asia/Karachi": "KHI", "Asia/Bangkok": "BKK", "Asia/Singapore": "SIN", "Asia/Hong_Kong": "HKG", "Asia/Shanghai": "SHA",
  "Asia/Tokyo": "TYO", "Asia/Seoul": "SEL", "Asia/Manila": "MNL", "Asia/Jakarta": "JKT",
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
