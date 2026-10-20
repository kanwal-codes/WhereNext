// `toLocale*String(locale, options)` and `new Intl.*Format(...)` build a formatter on every call, which is slow on a phone when a
// list of fifty flights or a long chat formats a price and a time per row on every render. These hand back one per option set.
const formats = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(kind: "d" | "n", locale: Intl.LocalesArgument, options: object | undefined, make: () => T): T {
  const key = `${kind}|${String(locale)}|${JSON.stringify(options ?? {})}`;
  let hit = formats.get(key);
  if (!hit) formats.set(key, (hit = make()));
  return hit as T;
}

export const dateFormat = (locale: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) => cached("d", locale, options, () => new Intl.DateTimeFormat(locale, options));
export const numberFormat = (locale: Intl.LocalesArgument, options?: Intl.NumberFormatOptions) => cached("n", locale, options, () => new Intl.NumberFormat(locale, options));
