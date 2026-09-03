import { revalidateTag } from "next/cache";

export const workspaceTag = (tripId: string) => `trip-workspace:${tripId}`;

export function invalidateWorkspace(tripId: string): void {
  revalidateTag(workspaceTag(tripId));
}
