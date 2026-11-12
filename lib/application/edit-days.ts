const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (text: string) => (/^\d+$/.test(text) ? Number(text) : WORDS[text.toLowerCase()]);
const NUMBER = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)";
const WHOLE_PLAN = /\b(whole|entire|all|every)\s+(plan|trip|itinerary|days)\b|\beverything\b|\bfrom scratch\b|\bstart over\b/i;

/**
 * Which days of an existing plan a message asks to change: "make day 3 more relaxed", "redo days 5-7", "swap days 2 and 4",
 * "change the last two days". Null when it names none (or asks for the whole plan), so the caller treats it as a plan-wide edit.
 */
export function editTargets(message: string, planDays: number): number[] | null {
  if (planDays < 1 || WHOLE_PLAN.test(message)) return null;
  const days = new Set<number>();
  const add = (n: number | undefined) => { if (n && n >= 1 && n <= planDays) days.add(n); };

  // "day 3", "days 2, 3 and 5", "days 5-7", "days 5 to 7"
  for (const match of message.matchAll(new RegExp(`\\bdays?\\s+(${NUMBER}(?:\\s*(?:,|and|&|-|–|to|through)\\s*${NUMBER})*)`, "gi"))) {
    const parts = [...match[1].matchAll(new RegExp(NUMBER, "gi"))].map((part) => num(part[0]));
    if (/(?:-|–|\bto\b|\bthrough\b)/i.test(match[1].replace(/,|and|&/gi, "")) && parts.length === 2 && parts[0] && parts[1] && parts[0] <= parts[1]) for (let n = parts[0]; n <= parts[1]; n++) add(n);
    else parts.forEach(add);
  }
  const last = message.match(new RegExp(`\\blast\\s+(?:${NUMBER}\\s+)?days?\\b`, "i"));
  if (last) { const count = last[1] ? num(last[1]) ?? 1 : 1; for (let n = planDays - count + 1; n <= planDays; n++) add(n); }
  const first = message.match(new RegExp(`\\bfirst\\s+(?:${NUMBER}\\s+)?days?\\b`, "i"));
  if (first) { const count = first[1] ? num(first[1]) ?? 1 : 1; for (let n = 1; n <= count; n++) add(n); }
  return days.size ? [...days].sort((a, b) => a - b) : null;
}
