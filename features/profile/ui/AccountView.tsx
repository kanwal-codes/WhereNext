"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { useIsDarkMode } from "@/lib/use-dark-mode";
import { notifyToast } from "@/lib/application/toast";
import { updateName, updateEmail } from "@/features/identity/application/authClient";
import type { TravelerProfile } from "@/packages/contracts/profile";
import { saveProfile } from "../application/saveProfile";
import { useActiveSection } from "../application/useActiveSection";
import { useAccountForm } from "../application/useAccountForm";
import { useAvatarUpload } from "../application/useAvatarUpload";
import { AccountHero } from "./AccountHero";
import { AccountRail } from "./AccountRail";
import { DangerSection } from "./DangerSection";
import { NotificationsSection } from "./NotificationsSection";
import { ProfileSection } from "./ProfileSection";
import { SaveBar } from "./SaveBar";
import { StyleSection } from "./StyleSection";
import { useAccountActions } from "../application/useAccountActions";
import { useDreamDestination } from "../application/useDreamDestination";
import { useGoogleConnection } from "../application/useGoogleConnection";
import { usePasswordChange } from "../application/usePasswordChange";
import { useStyleEditor } from "../application/useStyleEditor";
import { formPatch, toggled } from "../domain/account";

/* ---------------------------------- page --------------------------------- */

export function AccountView({
  userId,
  initialName,
  avatarUrl: initialAvatarUrl,
  email,
  emailVerified,
  tripCount,
  destinationCount,
  providers,
  profile,
  sharedTrips,
}: {
  userId: string;
  initialName: string;
  avatarUrl: string | null;
  email: string;
  emailVerified: boolean;
  tripCount: number;
  destinationCount: number;
  providers: string[];
  profile: TravelerProfile;
  sharedTrips: Array<{ id: string; name: string; slug: string }>;
}) {
  const router = useRouter();
  const { active, setActive, holdRail } = useActiveSection();
  const reduce = useReducedMotion();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Swaps the hero photo live when the Appearance toggle further down this page flips.
  const isDark = useIsDarkMode();
  // Language and country names come from the browser's Intl data, which the server's copy words and orders
  // differently ("Hong Kong" vs "Hong Kong SAR China"), so those lists are built after hydration, not during it.
  const clientReady = useSyncExternalStore(() => () => undefined, () => true, () => false);

  const avatar = useAvatarUpload({ userId, initialUrl: initialAvatarUrl });
  const touch = () => { setDirty(true); setSaved(false); };

  const dream = useDreamDestination({ profile, onOpen: () => setActive("profile") });
  const form = useAccountForm({ initialName, email, profile, touch });
  const { name, emailDraft, airport, city, language, country, bio, notif } = form;
  const password = usePasswordChange();
  const google = useGoogleConnection(providers);
  const styleEditor = useStyleEditor({ profile, touch });
  const actions = useAccountActions();

  const toggleChip = (list: string[], set: (v: string[]) => void, v: string) => { touch(); set(toggled(list, v)); };

  async function saveAll() {
    if (saving) return;
    setSaving(true);
    try {
      if (name.trim() && name !== initialName) {
        const { error } = await updateName(name.trim());
        if (error) throw new Error("name");
      }
      if (emailDraft.trim() && emailDraft !== email) {
        const { error } = await updateEmail(emailDraft.trim());
        if (error) throw new Error("email");
        notifyToast("Check your inbox to confirm the new email.", "success");
      }
      const ok = await saveProfile(formPatch({ airport, city, language, country, bio, notifications: notif }));
      if (!ok) throw new Error("profile");
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch {
      notifyToast("Some changes couldn’t be saved. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-32">
      {/* The opening frame: their dream destination when they have set one, otherwise a coastal road by day and Lisbon at blue hour by night,
       * slowly pushing in, graded dark so the white name and the frosted numbers always read. */}
      <AccountHero
        avatar={avatar}
        name={name}
        city={city}
        bio={bio}
        airport={airport}
        emailVerified={emailVerified}
        tripCount={tripCount}
        destinationCount={destinationCount}
        dream={dream}
        isDark={isDark}
      />

      <div className="mx-auto max-w-6xl px-5 sm:px-8">

        {/* Rail + body */}
        <div className="mt-10 gap-10 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
          <AccountRail active={active} onPick={(id) => { holdRail(); setActive(id); }} />

          <div className="space-y-8">
            <ProfileSection form={form} dream={dream} password={password} google={google} email={email} emailVerified={emailVerified} clientReady={clientReady} touch={touch} />
            <StyleSection editor={styleEditor} toggleChip={toggleChip} touch={touch} />
            <NotificationsSection form={form} actions={actions} sharedTrips={sharedTrips} touch={touch} />
            <DangerSection actions={actions} />
          </div>
        </div>
      </div>

      <SaveBar dirty={dirty} saving={saving} saved={saved} onDiscard={() => router.refresh()} onSave={() => void saveAll()} onSavedShown={() => setSaved(false)} />
    </div>
  );
}
