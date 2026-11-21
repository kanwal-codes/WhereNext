/** The buttons at the foot of a sheet: 48px pills. One primary per sheet (the thing it is for), at most one secondary beside it. */
export const sheetPrimary =
  "inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985] disabled:opacity-45";
/** The search button at the foot of a top sheet (Flights, Stays, Eat): the same tall pill on all three, worded "Search …". */
export const searchButton = "btn-primary h-14 w-full rounded-full text-base transition-[opacity,transform] duration-200 ease-out active:scale-[0.985] disabled:opacity-40";
export const sheetSecondary =
  "inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold transition-transform duration-150 active:scale-[0.985]";
