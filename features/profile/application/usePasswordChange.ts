import { useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { updatePassword } from "@/features/identity/application/authClient";
import { canChangePassword, passwordsMatch } from "../domain/account";
import { strengthOf } from "../ui/AccountParts";

/** The "Change password" form: the two fields, whether they can be submitted, and saving the new one. */
export function usePasswordChange() {
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function changePassword() {
    if (!canChangePassword(newPw, confirmPw) || savingPw) return;
    setSavingPw(true);
    const { error } = await updatePassword(newPw);
    setSavingPw(false);
    if (error) { notifyToast("Your password couldn’t be changed.", "error"); return; }
    notifyToast("Password changed", "success");
    setNewPw(""); setConfirmPw(""); setPwOpen(false);
  }

  const pwScore = strengthOf(newPw);
  const confirmMatches = passwordsMatch(newPw, confirmPw);

  return { pwOpen, setPwOpen, newPw, setNewPw, confirmPw, setConfirmPw, savingPw, changePassword, pwScore, confirmMatches };
}
