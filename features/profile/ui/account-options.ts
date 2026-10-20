"use client";

/** What the avatars bucket accepts (it enforces the same list on the server). */
export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"];

export const SECTIONS = [
  { id: "profile", label: "Profile & account" },
  { id: "style", label: "Travel style" },
  { id: "notifications", label: "Notifications & sharing" },
  { id: "danger", label: "Account data" },
] as const;

export const INTERESTS = ["Food & markets", "Hiking", "Museums", "Nightlife", "Architecture", "Beaches", "Wildlife", "Coffee", "Live music", "Photography", "Wine", "Design shops"];

export const DIETARY = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Nut allergy", "Pescatarian"];

export const PACE = [
  { label: "Slow", note: "Two or three things a day, long lunches, room to wander." },
  { label: "Balanced", note: "A morning plan and an evening plan, afternoons left open." },
  { label: "Packed", note: "Full days, early starts, as much as the map allows." },
];

export const BUDGET = [
  { label: "Lean", note: "Hostels, street food and free things worth queueing for." },
  { label: "Considered", note: "Good value stays, one memorable meal per city." },
  { label: "Comfortable", note: "Central rooms, table service, the odd splurge." },
  { label: "Generous", note: "Design hotels, tasting menus, private guides." },
];

export const STAY_TYPES = ["Hotel", "Apartment", "Guesthouse", "Anything"];

export const COMPANIONS = ["Solo", "Partner", "Friends", "Family"];

export const UNSET_NOTE = "Not set. Roam won\u2019t assume one until you choose.";
