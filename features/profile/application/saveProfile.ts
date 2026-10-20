import { notifyToast } from "@/lib/application/toast";
import type { TravelerProfile } from "@/packages/contracts/profile";

/** Saves part of the traveller profile; on a failure says so and returns false. */
export async function saveProfile(patch: Partial<TravelerProfile>): Promise<boolean> {
  try {
    const response = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    if (!response.ok) throw new Error();
    return true;
  } catch {
    notifyToast("That couldn’t be saved. Try again.", "error");
    return false;
  }
}
