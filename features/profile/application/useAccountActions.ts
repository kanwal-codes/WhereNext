import { useState } from "react";
import { useRouter } from "next/navigation";
import { notifyToast } from "@/lib/application/toast";
import { shareUrl } from "../domain/account";

/** The account page's one-off actions: copy or revoke a shared link, export the data, and delete the account. */
export function useAccountActions() {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function copyShareLink(slug: string) {
    const url = shareUrl(window.location.origin, slug);
    try { await navigator.clipboard.writeText(url); notifyToast("Link copied", "success"); } catch { notifyToast("Couldn’t copy the link.", "error"); }
  }

  async function revokeShare(tripId: string) {
    const response = await fetch(`/api/trips/${tripId}/share`, { method: "DELETE" });
    if (!response.ok) { notifyToast("Couldn’t revoke that link.", "error"); return; }
    notifyToast("Link revoked", "success");
    router.refresh();
  }

  async function exportData() {
    window.location.href = "/api/account/export";
  }

  async function deleteAccount() {
    setDeleting(true);
    const response = await fetch("/api/account", { method: "DELETE" });
    if (!response.ok) { setDeleting(false); notifyToast("Account could not be deleted.", "error"); return; }
    window.location.assign("/sign-in");
  }

  return { deleteOpen, setDeleteOpen, deleteConfirm, setDeleteConfirm, deleting, copyShareLink, revokeShare, exportData, deleteAccount };
}
