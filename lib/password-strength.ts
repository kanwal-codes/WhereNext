/** 0-4 for the strength bars. Under 8 characters nothing else counts: "A1!" is not a good password. */
export function strengthOf(pw: string): number {
  if (pw.length < 8) return 0;
  let score = 1;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}
