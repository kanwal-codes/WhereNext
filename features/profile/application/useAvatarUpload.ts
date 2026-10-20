import { useRef, useState, type ChangeEvent } from "react";
import { uploadAvatar } from "@/features/identity/application/authClient";
import { notifyToast } from "@/lib/application/toast";
import { avatarProblem } from "../domain/account";
import { AVATAR_TYPES } from "../ui/account-options";

/** The profile photo: the current one, whether it failed to load, and choosing and uploading a new one. */
export function useAvatarUpload({ userId, initialUrl }: { userId: string; initialUrl: string | null }) {
  const [avatarUrl, setAvatarUrl] = useState(initialUrl);
  const [avatarError, setAvatarError] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function onAvatarChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = avatarProblem(file, AVATAR_TYPES);
    if (problem) { notifyToast(problem, "error"); return; }
    setUploadingAvatar(true);
    const { error, url } = await uploadAvatar(userId, file);
    setUploadingAvatar(false);
    if (error || !url) { notifyToast("That photo couldn’t be uploaded.", "error"); return; }
    setAvatarUrl(url);
    setAvatarError(false);
    notifyToast("Photo updated", "success");
  }

  return { avatarUrl, avatarError, setAvatarError, uploadingAvatar, avatarInputRef, onAvatarChosen };
}
