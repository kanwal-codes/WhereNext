import { useEffect, useState } from "react";
import { notifyToast } from "@/lib/application/toast";
import { accountPhotoUrl } from "@/lib/places-ui";
import type { TravelerProfile } from "@/packages/contracts/profile";
import { saveProfile } from "./saveProfile";

/** The dream destination: its photo is the profile picture and the backdrop of the page. Picking one looks up its photo and saves both. */
export function useDreamDestination({ profile, onOpen }: { profile: TravelerProfile; onOpen: () => void }) {
  // The dream destination: its photo is the profile picture and the backdrop of this page.
  const [dreamText, setDreamText] = useState(profile.dreamDestination ?? "");
  const [dreamDraft, setDreamDraft] = useState(profile.dreamDestination ?? "");
  const [dreamPhoto, setDreamPhoto] = useState<string | null>(profile.dreamPhotoName ?? null);
  const [savingDream, setSavingDream] = useState(false);
  // The picker stays out of the way until asked for: from the profile header's "Add your dream destination" or the one set already.
  const [dreamOpen, setDreamOpen] = useState(false);
  // overflow-hidden is only needed while the card's height is animating open/closed — left on permanently,
  // it also clips the destination combobox's dropdown, which has to float past the card's bottom edge.
  const [dreamSettled, setDreamSettled] = useState(false);
  useEffect(() => { if (!dreamOpen) setDreamSettled(false); }, [dreamOpen]);
  const openDream = () => {
    onOpen();
    setDreamOpen(true);
    window.setTimeout(() => document.getElementById("dream")?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };
  const [heroFailed, setHeroFailed] = useState(false);
  const dreamHero = dreamPhoto && !heroFailed ? accountPhotoUrl(dreamPhoto, 1600) : undefined;

  /** Pick the dream destination: look up its photo once, then save both so the page and profile picture update together. */
  async function chooseDream(text: string) {
    const place = text.trim();
    if (!place || savingDream) return;
    setSavingDream(true);
    try {
      const res = await fetch(`/api/account/places/destination-photo?query=${encodeURIComponent(place)}`);
      const body = res.ok ? ((await res.json()) as { photoName?: string | null }) : { photoName: null };
      const photoName = body.photoName ?? null;
      const ok = await saveProfile({ dreamDestination: place, dreamPhotoName: photoName });
      if (!ok) return;
      setDreamText(place);
      setDreamDraft(place);
      setDreamPhoto(photoName);
      setHeroFailed(false);
      setDreamOpen(false);
      notifyToast(photoName ? "Your dream destination is your backdrop now." : "Saved. We couldn’t find a photo for it, though.", photoName ? "success" : "info");
    } finally {
      setSavingDream(false);
    }
  }

  async function clearDream() {
    if (savingDream) return;
    setSavingDream(true);
    const ok = await saveProfile({ dreamDestination: null, dreamPhotoName: null });
    setSavingDream(false);
    if (!ok) return;
    setDreamText("");
    setDreamDraft("");
    setDreamPhoto(null);
  }

  return { dreamText, dreamDraft, setDreamDraft, dreamPhoto, savingDream, dreamOpen, setDreamOpen, dreamSettled, setDreamSettled, openDream, heroFailed, setHeroFailed, dreamHero, chooseDream, clearDream };
}
