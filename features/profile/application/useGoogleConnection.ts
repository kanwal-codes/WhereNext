import { useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { disconnectGoogle, signInWithGoogle } from "@/features/identity/application/authClient";

/** Whether Google is connected to this account, and connecting or disconnecting it. */
export function useGoogleConnection(providers: string[]) {
  const [hasGoogle, setHasGoogle] = useState(providers.includes("google"));
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  async function toggleGoogle() {
    setConnectingGoogle(true);
    if (hasGoogle) {
      const { error } = await disconnectGoogle();
      setConnectingGoogle(false);
      if (error) { notifyToast("Couldn’t disconnect Google.", "error"); return; }
      setHasGoogle(false);
      notifyToast("Google disconnected", "success");
    } else {
      await signInWithGoogle(window.location.href);
    }
  }

  return { hasGoogle, connectingGoogle, toggleGoogle };
}
