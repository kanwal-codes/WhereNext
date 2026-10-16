/**
 * A Roam reply stores its cards in message metadata, and a stored place card carried every photo name
 * Google returned (ten, ~200 characters each) though anything that shows one only ever reads the first.
 * That was ~400 KB of a 600 KB group chat history. History is trimmed to the first photo on the way out.
 */
export function slimMessageMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const md = metadata ?? {};
  if (!Array.isArray(md.blocks)) return md;
  return {
    ...md,
    blocks: md.blocks.map((block: { places?: unknown }) =>
      Array.isArray(block?.places)
        ? { ...block, places: block.places.map((p: { photoNames?: unknown }) => (Array.isArray(p?.photoNames) && p.photoNames.length > 1 ? { ...p, photoNames: p.photoNames.slice(0, 1) } : p)) }
        : block,
    ),
  };
}
