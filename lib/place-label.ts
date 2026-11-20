/**
 * The part of a place a person says: "Toronto, ON, Canada" is "Toronto". A name typed in lower case ("paris") is shown capitalised ("Paris");
 * anything with capitals already ("McAllen", "São Paulo") is left as it was written.
 */
export function placeName(label: string): string {
  const first = label.split(",")[0]!.trim();
  return first === first.toLowerCase() ? first.replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase()) : first;
}
