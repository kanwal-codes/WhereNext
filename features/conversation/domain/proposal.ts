import type { ProposedCommand } from "@/packages/contracts/assistant";

const humanKey = (key: string) => key.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

const humanValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(humanValue).join(", ") || "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  if (value === "" || value == null) return "—";
  return String(value);
};

/** The exact fields a proposed change will write — shown behind an expander so the user can check before confirming.
 *  Exported for `tests/unit/describe-proposal.test.ts` — a pure function, no need to mount the component to test it. */
export function describeProposal(proposal: ProposedCommand): Array<[string, string]> {
  switch (proposal.type) {
    case "update_preferences":
      // `operations` (add/remove/replace/clear on a list field) is the update's own control
      // structure, not a preference — showing it as a raw "Operations: —" row is meaningless to a
      // user, and worse, misleading when the model includes an empty `operations: []` alongside a
      // real field (seen live: a single-field update rendered a phantom "Operations" row). Expand
      // each operation into a proper labeled row instead of hiding it outright, so a pure
      // list-edit (e.g. "remove museums from dislikes") still shows what's actually changing.
      return Object.entries(proposal.preferences).flatMap(([key, value]) => {
        if (key !== "operations") return [[humanKey(key), humanValue(value)] as [string, string]];
        const ops = value as Array<{ action: string; field: string; values?: string[] }> | undefined;
        if (!ops || ops.length === 0) return [];
        return ops.map((op) => [
          humanKey(op.field),
          op.action === "clear" ? "clear" : `${op.action}: ${humanValue(op.values)}`,
        ] as [string, string]);
      });
    case "record_decision":
      return [["Type", proposal.kind.replaceAll("_", " ")], ...Object.entries(proposal.value).map(([key, value]) => [humanKey(key), humanValue(value)] as [string, string])];
    case "add_itinerary_item":
      return [["Title", proposal.title], ["Day", String(proposal.dayIndex)]];
    case "save_place":
      return [
        ["Name", proposal.place.name],
        ["Category", humanValue(proposal.place.category)],
        ["Address", humanValue(proposal.place.address)],
      ];
    default:
      return [];
  }
}
