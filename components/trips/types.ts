export type TripSummary = {
  id: string;
  name: string;
  destination: string | null;
  origin: string | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
  /** Google Places photo resource name for the destination. null = never looked up, "" = looked up, none found. */
  hero_photo_name?: string | null;
  /** Fallback cover: the photo name of a place saved to this trip. Only filled when there is no destination photo. */
  saved_photo_name?: string | null;
};
