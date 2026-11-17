const SKIP = new Set(["the", "hotel", "and", "hostel", "suites", "inn"]);
const words = (text: string) => new Set(text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !SKIP.has(w)));

type Lodging = { name: string; phone: string | null; websiteUri: string | null };

/**
 * The booking engine carries no phone number or website, so they come from Google's lodging near the hotel. This picks the one whose name
 * shares most of its words with ours; nothing near, or nothing that matches, is no contact, never a wrong one.
 */
export function pickHotelContact(hotelName: string, near: Lodging[]): { phone: string | null; website: string | null } | null {
  const ours = words(hotelName);
  if (ours.size === 0) return null;
  const match = near.find((b) => {
    const theirs = words(b.name);
    const shared = [...ours].filter((w) => theirs.has(w)).length;
    return shared > 0 && shared >= Math.min(ours.size, theirs.size) * 0.6;
  });
  return match && (match.phone || match.websiteUri) ? { phone: match.phone, website: match.websiteUri } : null;
}
