/** A length of time in the largest sensible units: "45 min", "2 h 29 min", "3 h", "1 d 4 h 5 min". */
export function formatDuration(totalMinutes: number): string {
  const total = Math.max(1, Math.round(totalMinutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  return [days ? `${days} d` : "", hours ? `${hours} h` : "", mins || (!days && !hours) ? `${mins} min` : ""].filter(Boolean).join(" ");
}
