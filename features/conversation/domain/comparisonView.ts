/** A cell that says nothing: empty, "unclear", "unknown", "not stated" and the like (with or without "from the evidence"). */
const GAP = /^(?:unclear|unknown|n\/?a|none|not\s+(?:available|stated|known|clear|specified|covered|enough\s+information)|no\s+(?:data|information|figures?|details?)|—|-)[\s.]*(?:from\s+(?:the\s+)?(?:evidence|sources?|notes?))?[\s.]*$/i;
export const isGap = (cell: string | undefined | null) => !cell || !cell.trim() || GAP.test(cell.trim());

export type ComparisonView = {
  /** Each option and whether it is the pick. */
  options: Array<{ label: string; best: boolean }>;
  /** One entry per thing compared; `values` lines up with `options`. A value of "" means nothing is known for that option. */
  attributes: Array<{ name: string; values: string[] }>;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The comparison card's data shaped for display. The stored block has options as rows and things-compared as columns (the first
 * column repeats the option name). Anything nobody knows anything about ("Hiking access: unclear / unclear") is dropped, and a cell
 * that says nothing becomes "" so the card shows one calm "not enough information" instead of the model's wording of it.
 */
export function comparisonView(block: { columns: string[]; rows: Array<{ label: string; cells: string[] }>; bestForYou?: { label: string } | null }): ComparisonView {
  const names = block.columns.slice(1);
  const attributes = names
    .map((name, i) => ({ name, values: block.rows.map((row) => (isGap(row.cells[i + 1]) ? "" : row.cells[i + 1].trim())) }))
    .filter((attribute) => attribute.values.some(Boolean));
  const best = block.bestForYou?.label ?? null;
  return { options: block.rows.map((row) => ({ label: row.label, best: best !== null && same(row.label, best) })), attributes };
}
