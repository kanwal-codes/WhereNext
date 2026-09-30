import { stepGlyph, type Glyph } from "./glyphs";

/** "Hôtel X, Montreal, Canada" and "Jean Talon Market, Montreal, Canada" → the two names, and the place both are in. */
export function splitRouteEnds(from: string, to: string) {
  const a = from.split(",").map((part) => part.trim());
  const b = to.split(",").map((part) => part.trim());
  let shared = 0;
  while (shared < Math.min(a.length, b.length) - 1 && a[a.length - 1 - shared].toLowerCase() === b[b.length - 1 - shared].toLowerCase()) shared++;
  // A long address reads slower than the name alone; keep the rest only when it is short or the two names would collide.
  const collide = a[0].toLowerCase() === b[0].toLowerCase();
  const end = (parts: string[]) => {
    const rest = parts.slice(0, parts.length - shared).join(", ");
    return collide || rest.length <= 40 ? rest : parts[0];
  };
  return {
    from: end(a),
    to: end(b),
    where: shared ? a.slice(a.length - shared).join(", ") : null,
  };
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "Walk 6 min", "subway 2 → Jean-Talon (14 min)", "TRANSIT bus 208 → Cais Sodré (35 min)" → icon, readable title, duration. */
export function parseRouteStep(step: string): { glyph: Glyph; title: string; duration?: string } {
  const mode = step.match(/^(WALK|TRANSIT|DRIVE|DRIVING|WALKING|BIKE)\b\s*/i);
  let text = (mode ? step.slice(mode[0].length) : step).trim();
  let duration: string | undefined;
  const parens = text.match(/\s*\((\d+\s*(?:min|h|hr)[^)]*)\)\s*$/i);
  const bare = text.match(/^(\d+\s*(?:min|h|hr)\b.*)$/i);
  if (parens) {
    duration = parens[1];
    text = text.slice(0, parens.index).trim();
  } else if (bare) {
    duration = bare[1];
    text = "";
  }
  const glyph = stepGlyph(step);
  return { glyph, title: sentence(text || (mode && !/^transit$/i.test(mode[1]) ? glyph.label : step)), duration };
}

/** Which lines a transit route uses, as one phrase ("Bus 747 + Subway 1"); the walking legs are left out. */
export function routeLines(steps: string[]): string {
  const lines = steps
    .map(parseRouteStep)
    .filter((step) => step.glyph.label !== "Walk")
    .map((step) => step.title.split("→")[0].trim())
    .filter(Boolean);
  return lines.length ? lines.join(" + ") : "Walking only";
}
