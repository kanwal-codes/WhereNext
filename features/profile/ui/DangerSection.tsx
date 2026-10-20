"use client";

import { Download, Loader2, Trash2 } from "lucide-react";
import { Sheet } from "@/components/motion-primitives";
import { signOut as signOutUser } from "@/features/identity/application/authClient";
import type { useAccountActions } from "../application/useAccountActions";
import { SettingSection } from "./AccountParts";

/** Account data: sign out, export, and deleting the account (which asks to type DELETE first). */
export function DangerSection({ actions }: { actions: ReturnType<typeof useAccountActions> }) {
  const { deleteOpen, setDeleteOpen, deleteConfirm, setDeleteConfirm, deleting, exportData, deleteAccount } = actions;
  return (
    <>
      <SettingSection id="danger" title="Account data" blurb="Take your planning with you, sign out, or close the account.">
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
          <div className="mr-auto">
            <p className="text-sm font-medium">Sign out</p>
            <p className="text-sm text-ink-soft">Ends this session on this device.</p>
          </div>
          <button type="button" onClick={() => void signOutUser().then(() => window.location.assign("/sign-in"))} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.985]">Sign out</button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
          <Download className="h-4 w-4 text-ink-soft" />
          <div className="mr-auto">
            <p className="text-sm font-medium">Export my data</p>
            <p className="text-sm text-ink-soft">Every trip, itinerary item and saved place as a single file.</p>
          </div>
          <button type="button" onClick={() => void exportData()} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.985]">Export</button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-secondary px-5 py-5">
          <Trash2 className="h-4 w-4 text-destructive" />
          <div className="mr-auto">
            <p className="text-sm font-medium text-destructive">Delete account</p>
            <p className="text-sm text-ink-soft">Your account and your own details go. Trips you share with friends stay with them and pass to the next member; trips only you are on are deleted. This can’t be undone.</p>
          </div>
          <button type="button" onClick={() => setDeleteOpen(true)} className="btn-destructive">Delete</button>
        </div>
      </SettingSection>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} ariaLabel="Delete your account">
        <div className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-xl">Delete your account?</h3>
            <p className="mt-1 text-sm text-ink-soft">Trips you share with friends stay with them (the next member takes over). Trips only you are on, with their itinerary and shared links, are removed. Type DELETE to confirm.</p>
          </div>
          <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="input-field" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary active:scale-[0.985]">Keep my account</button>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={deleteConfirm !== "DELETE" || deleting}
              className="btn-destructive"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete my account
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
