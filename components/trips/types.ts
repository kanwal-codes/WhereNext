export type TripSummary = {
  id: string;
  name: string;
  destination: string | null;
  origin: string | null;
  duration_days: number | null;
  start_date: string | null;
  end_date: string | null;
  travelers: number | null;
};
