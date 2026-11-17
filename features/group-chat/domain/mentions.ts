/** A person a message can point at. `name` is what the chat shows for them (the name they gave, else the start of their email). */
export type Mentionable = { userId: string; name: string };

/** The end of the box: an "@" at the start or after a space, then the letters, digits and few marks a name may carry, in any script. */
const TAIL = /(^|\s)@([\p{L}\p{N}._'’-]*)$/u;

/** The half-typed mention at the very end of the box ("hey @ma"), if there is one: where it starts and what has been typed after the "@". */
export function mentionQuery(input: string): { start: number; query: string } | null {
  const found = TAIL.exec(input);
  if (!found) return null;
  return { start: found.index + found[1].length, query: found[2] };
}

/** Who a half-typed mention could be: anyone one of whose name's words starts with what was typed (an empty query lists everyone). */
export function mentionOptions(people: Mentionable[], query: string, limit = 5): Mentionable[] {
  const wanted = query.toLowerCase();
  return people.filter((person) => person.name.toLowerCase().split(/\s+/).some((word) => word.startsWith(wanted))).slice(0, limit);
}

/** The box with the half-typed mention (from `start`) replaced by the chosen person, followed by a space. */
export function applyMention(input: string, start: number, name: string): string {
  return `${input.slice(0, start)}@${name} `;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Finds "@Name" for any of these people, anywhere in a message: not inside a longer word ("a@maya.com"), whole names only,
 *  the longest name first so "Maya Patel" is not read as "Maya". `null` when there is nobody to find. */
export function mentionPattern(people: Mentionable[]): string | null {
  const names = [...new Set(people.map((person) => person.name.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return null;
  return String.raw`(?<![\p{L}\p{N}])@(?:${names.map(escape).join("|")})(?![\p{L}\p{N}])`;
}

/** Who a finished message points at (each person once), read from its text so it stays right however the box was edited. */
export function mentionedUserIds(content: string, people: Mentionable[]): string[] {
  const pattern = mentionPattern(people);
  if (!pattern) return [];
  const found = new Set((content.match(new RegExp(pattern, "giu")) ?? []).map((text) => text.slice(1).toLowerCase()));
  return [...new Set(people.filter((person) => found.has(person.name.trim().toLowerCase())).map((person) => person.userId))];
}
