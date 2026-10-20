import { useState } from "react";
import { announceWorkspaceChange } from "@/lib/application/workspace-events";
import { notifyToast } from "@/lib/application/toast";
import type { ProposedCommand } from "@/packages/contracts/assistant";
import { changeKindFor } from "../domain/proposal";

/** A change Roam proposed ("set the budget to 120?"): held until the traveller confirms it, then sent to /api/commands. */
export function useProposal({ guest, openGate }: { guest: boolean; openGate: (reason: string) => void }) {
  const [proposal, setProposal] = useState<ProposedCommand | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function confirmProposal() {
    if (!proposal || confirming) return;
    if (guest) return openGate("save changes to your trip");
    setConfirming(true);
    try {
      const command =
        proposal.type === "record_decision"
          ? { ...proposal, idempotencyKey: proposal.idempotencyKey ?? crypto.randomUUID() }
          : proposal;
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      if (!response.ok) throw new Error("command");
      const body = await response.json().catch(() => ({}));
      setProposal(null);
      notifyToast(typeof body.changeImpact === "string" && body.changeImpact ? body.changeImpact : "Change saved.", "success");
      announceWorkspaceChange(changeKindFor(command));
    } catch {
      notifyToast("That change couldn’t be saved.", "error");
    } finally {
      setConfirming(false);
    }
  }

  return { proposal, setProposal, confirming, confirmProposal };
}
