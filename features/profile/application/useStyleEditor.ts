import { useMemo, useState } from "react";
import type { TravelerProfile } from "@/packages/contracts/profile";
import { saveProfile } from "./saveProfile";
import { styleSummary, stylePatch } from "../domain/account";
import { BUDGET, PACE } from "../ui/account-options";
import { asDietaryArray } from "../ui/AccountParts";

/**
 * The travel-style card: the traveller's interests, diet, pace, budget, stay and company, an edit mode that can be cancelled back to
 * how it was, saving them together, and the one-sentence summary of what they mean for new trips.
 */
export function useStyleEditor({ profile, touch }: { profile: TravelerProfile; touch: () => void }) {
  const [styleSaved, setStyleSaved] = useState(false);
  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [dietary, setDietary] = useState<string[]>(asDietaryArray(profile.dietaryNeeds));
  const [dietNote, setDietNote] = useState(profile.dietaryNote ?? "");
  const [pace, setPace] = useState(() => PACE.findIndex((p) => p.label === profile.pace));
  const [budget, setBudget] = useState(() => BUDGET.findIndex((b) => b.label === String(profile.budget ?? "")));
  const [stay, setStay] = useState(profile.stayType ?? "Anything");
  const [companions, setCompanions] = useState(profile.groupType ?? "");
  const [editingStyle, setEditingStyle] = useState(false);
  const styleSnapshot = useMemo(() => ({ interests, dietary, dietNote, pace, budget, stay, companions }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [snapshot, setSnapshot] = useState(styleSnapshot);

  const startStyleEdit = () => { setSnapshot({ interests, dietary, dietNote, pace, budget, stay, companions }); setStyleSaved(false); setEditingStyle(true); };
  const cancelStyleEdit = () => {
    setInterests(snapshot.interests); setDietary(snapshot.dietary); setDietNote(snapshot.dietNote);
    setPace(snapshot.pace); setBudget(snapshot.budget); setStay(snapshot.stay); setCompanions(snapshot.companions);
    setEditingStyle(false);
  };
  const [savingStyle, setSavingStyle] = useState(false);
  async function finishStyleEdit() {
    setSavingStyle(true);
    const ok = await saveProfile(stylePatch({ interests, dietary, dietNote, pace: PACE[pace]?.label, budget: BUDGET[budget]?.label, stay, companions })); // null clears one that was set
    setSavingStyle(false);
    if (ok) { setStyleSaved(true); setEditingStyle(false); }
  }

  const summary = useMemo(() => styleSummary({ interests, pace: PACE[pace]?.label, budget: BUDGET[budget]?.label, companions }), [interests, pace, budget, companions]);

  return { interests, setInterests, dietary, setDietary, dietNote, setDietNote, pace, setPace, budget, setBudget, stay, setStay, companions, setCompanions, editingStyle, startStyleEdit, cancelStyleEdit, savingStyle, finishStyleEdit, styleSaved, summary };
}
