"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, BadgeCheck, Camera, Check, Copy, Download, Eye, Link2, Loader2, Plane, Trash2 } from "lucide-react";
import { Reveal, Sheet, Stagger, StaggerItem, Tactile } from "@/components/motion-primitives";
import { Hero } from "@/components/Hero";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandMark } from "@/components/BrandMark";
import { useIsDarkMode } from "@/lib/use-dark-mode";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";
import { updateName, updateEmail, updatePassword, disconnectGoogle, signInWithGoogle, signOut as signOutUser, uploadAvatar } from "@/features/identity/application/authClient";
import type { TravelerProfile } from "@/packages/contracts/profile";

const initials = (name: string) => name.trim().slice(0, 2).toUpperCase();

const SECTIONS = [
  { id: "profile", label: "Profile & account" },
  { id: "style", label: "Travel style" },
  { id: "notifications", label: "Notifications & sharing" },
  { id: "danger", label: "Account data" },
] as const;

const INTERESTS = ["Food & markets", "Hiking", "Museums", "Nightlife", "Architecture", "Beaches", "Wildlife", "Coffee", "Live music", "Photography", "Wine", "Design shops"];
const DIETARY = ["Vegetarian", "Vegan", "Halal", "Gluten-free", "Nut allergy", "Pescatarian"];
const PACE = [
  { label: "Slow", note: "Two or three things a day, long lunches, room to wander." },
  { label: "Balanced", note: "A morning plan and an evening plan, afternoons left open." },
  { label: "Packed", note: "Full days, early starts, as much as the map allows." },
];
const BUDGET = [
  { label: "Lean", note: "Hostels, street food and free things worth queueing for." },
  { label: "Considered", note: "Good value stays, one memorable meal per city." },
  { label: "Comfortable", note: "Central rooms, table service, the odd splurge." },
  { label: "Generous", note: "Design hotels, tasting menus, private guides." },
];
const STAY_TYPES = ["Hotel", "Apartment", "Guesthouse", "Anything"];
const COMPANIONS = ["Solo", "Partner", "Friends", "Family"];

/* --------------------------------- pieces -------------------------------- */

function SettingSection({ id, title, blurb, action, children }: { id: string; title: string; blurb: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-t border-border pt-12 first:border-t-0 first:pt-0">
      <Reveal y={18}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
        <div className="mt-8 space-y-8">{children}</div>
      </Reveal>
    </section>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-foreground">{children}</span>;
}

function ReadRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium tracking-wide text-ink-soft">{label}</label>
        {hint}
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-transparent bg-coral text-background" : "border-border bg-background text-ink-soft hover:border-ink/25 hover:text-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

function Segmented({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)} className="relative rounded-full px-3.5 py-1.5 text-sm transition-colors">
          {value === o && (
            <motion.span layoutId={`seg-${options.join("")}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
          )}
          <span className={cn("relative", value === o ? "text-primary-foreground" : "text-ink-soft")}>{o}</span>
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors", checked ? "bg-coral" : "bg-border")}
    >
      <motion.span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-soft"
        animate={{ left: checked ? "18px" : "2px" }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

function ToggleRow({ title, note, checked, onChange }: { title: string; note: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{note}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function strengthOf(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const asDietaryArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : []);

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
  const [active, setActive] = useState<string>("profile");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [styleSaved, setStyleSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Swaps the hero photo live when the Appearance toggle further down this page flips.
  const isDark = useIsDarkMode();

  async function onAvatarChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { notifyToast("Choose an image file.", "error"); return; }
    if (file.size > 5 * 1024 * 1024) { notifyToast("Keep it under 5MB.", "error"); return; }
    setUploadingAvatar(true);
    const { error, url } = await uploadAvatar(userId, file);
    setUploadingAvatar(false);
    if (error || !url) { notifyToast("That photo couldn’t be uploaded.", "error"); return; }
    setAvatarUrl(url);
    notifyToast("Photo updated", "success");
  }
  const touch = () => { setDirty(true); setSaved(false); };

  const [name, setName] = useState(initialName);
  const [emailDraft, setEmailDraft] = useState(email);
  const [airport, setAirport] = useState(profile.homeAirport ?? "");
  const [city, setCity] = useState(profile.homeCity ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [hasGoogle, setHasGoogle] = useState(providers.includes("google"));
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  const [interests, setInterests] = useState<string[]>(profile.interests ?? []);
  const [dietary, setDietary] = useState<string[]>(asDietaryArray(profile.dietaryNeeds));
  const [dietNote, setDietNote] = useState(profile.dietaryNote ?? "");
  const [pace, setPace] = useState(() => Math.max(0, PACE.findIndex((p) => p.label === profile.pace)));
  const [budget, setBudget] = useState(() => Math.max(0, BUDGET.findIndex((b) => b.label === String(profile.budget ?? ""))));
  const [stay, setStay] = useState(profile.stayType ?? "Anything");
  const [companions, setCompanions] = useState(profile.groupType ?? "Solo");
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
    const ok = await saveProfile({ interests, dietaryNeeds: dietary, dietaryNote: dietNote || undefined, pace: PACE[pace]!.label, budget: BUDGET[budget]!.label, stayType: stay, groupType: companions });
    setSavingStyle(false);
    if (ok) { setStyleSaved(true); setEditingStyle(false); }
  }

  const [notif, setNotif] = useState({ trips: true, prices: true, collab: true, weekly: false, product: false, ...profile.notifications });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const toggleChip = (list: string[], set: (v: string[]) => void, v: string) => { touch(); set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]); };

  async function saveProfile(patch: Partial<TravelerProfile>): Promise<boolean> {
    try {
      const response = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      if (!response.ok) throw new Error();
      return true;
    } catch {
      notifyToast("That couldn’t be saved. Try again.", "error");
      return false;
    }
  }

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
      const ok = await saveProfile({ homeAirport: airport || undefined, homeCity: city || undefined, bio: bio || undefined, notifications: notif });
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

  async function changePassword() {
    if (newPw.length < 8 || newPw !== confirmPw || savingPw) return;
    setSavingPw(true);
    const { error } = await updatePassword(newPw);
    setSavingPw(false);
    if (error) { notifyToast("Your password couldn’t be changed.", "error"); return; }
    notifyToast("Password changed", "success");
    setNewPw(""); setConfirmPw(""); setPwOpen(false);
  }

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

  async function copyShareLink(slug: string) {
    const url = `${window.location.origin}/s/${slug}`;
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

  const summary = useMemo(() => {
    const top = interests.slice(0, 3).join(", ").toLowerCase() || "whatever looks good";
    return `New trips will lean towards ${top}, at a ${PACE[pace]!.label.toLowerCase()} pace on a ${BUDGET[budget]!.label.toLowerCase()} budget, usually travelling ${companions.toLowerCase() === "solo" ? "solo" : `with ${companions.toLowerCase()}`}.`;
  }, [interests, pace, budget, companions]);

  const pwScore = strengthOf(newPw);
  const confirmMatches = confirmPw.length === 0 || confirmPw === newPw;

  return (
    <div className="min-h-screen pb-32">
      {/* Same filmic hero used on /trips — real photo, grain, vignette and the same
       * foggy dissolve into the page background. Swaps to the night version of the
       * same scene in dark mode instead of just darkening the daylight photo. */}
      <Hero image={isDark ? "/design/trip-hero-night.jpg" : "/design/trip-hero.jpg"} alt="" className="h-[240px] sm:h-[300px]">
        <div className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-7 sm:px-8">
          <Link href="/trips" className="inline-flex items-center gap-2 text-sm font-medium text-foreground transition-opacity hover:opacity-70">
            <ArrowLeft className="h-4 w-4" /> Trips
          </Link>
          <BrandMark variant="compact" />
        </div>
      </Hero>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* Identity block breaking out of the dark band */}
        <div className="relative z-10 -mt-14 flex flex-col gap-6 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <Tactile lift={4} className="relative w-fit">
              <div className="relative rounded-[28px] bg-background p-1.5 shadow-soft">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change photo"
                  className="group relative block h-24 w-24 overflow-hidden rounded-[22px] bg-primary sm:h-32 sm:w-32"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external/user-uploaded, not a static asset
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span aria-hidden className="grid h-full w-full place-items-center font-display text-2xl font-semibold text-primary-foreground">
                      {initials(name || "Traveller")}
                    </span>
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingAvatar ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <span className="flex flex-col items-center gap-1">
                        <Camera className="h-4 w-4" />
                        Change
                      </span>
                    )}
                  </span>
                </button>
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={(e) => void onAvatarChosen(e)} className="hidden" />
              </div>
            </Tactile>

            <Stagger className="pb-2">
              <StaggerItem>
                <h1 className="font-display text-3xl leading-tight tracking-tight sm:text-4xl">{name}</h1>
              </StaggerItem>
              <StaggerItem>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {city && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
                      <Plane className="h-4 w-4 opacity-60" />
                      {city}
                    </span>
                  )}
                </div>
              </StaggerItem>
            </Stagger>
          </div>
        </div>

        {/* At-a-glance meta */}
        <Reveal>
          <div className="mt-12 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-t border-border/70 pt-6">
            {[
              { label: "Trips planned", value: String(tripCount) },
              { label: "Places", value: String(destinationCount) },
              { label: "Home airport", value: airport || "Not set" },
            ].map((m) => (
              <p key={m.label} className="flex items-baseline gap-2">
                <span className="font-display text-lg tracking-tight">{m.value}</span>
                <span className="text-sm text-ink-soft">{m.label.toLowerCase()}</span>
              </p>
            ))}
          </div>
        </Reveal>

        {/* Rail + body */}
        <div className="mt-14 gap-14 lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav className="sticky top-0 z-20 -mx-5 mb-8 overflow-x-auto border-b border-border bg-background/85 px-5 py-3 backdrop-blur-md scrollbar-slim sm:-mx-8 sm:px-8 lg:top-10 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <ul className="flex gap-1 lg:flex-col">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={() => setActive(s.id)}
                    className={cn("relative block whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors", active === s.id ? "text-foreground" : "text-ink-soft hover:text-foreground")}
                  >
                    {active === s.id && <motion.span layoutId="profile-nav-pill" className="absolute inset-0 rounded-full bg-secondary" transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
                    <span className="relative">{s.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-14">
            {/* Profile & account */}
            <SettingSection id="profile" title="Profile & account" blurb="How you appear to the people you plan with.">
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Full name">
                  <input value={name} onChange={(e) => { setName(e.target.value); touch(); }} maxLength={80} className="input-field" />
                </Field>
                <Field label="Email" hint={emailVerified ? <span className="inline-flex items-center gap-1 text-xs text-coral"><BadgeCheck className="h-3.5 w-3.5" /> Verified</span> : undefined}>
                  <input type="email" value={emailDraft} onChange={(e) => { setEmailDraft(e.target.value); touch(); }} className="input-field" />
                </Field>
                <Field label="Home airport">
                  <div className="relative">
                    <Plane className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
                    <input value={airport} onChange={(e) => { setAirport(e.target.value.toUpperCase()); touch(); }} maxLength={8} placeholder="YYZ" className="input-field pl-9 uppercase" />
                  </div>
                </Field>
                <Field label="Home city">
                  <input value={city} onChange={(e) => { setCity(e.target.value); touch(); }} maxLength={120} placeholder="Toronto, Canada" className="input-field" />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Short bio">
                    <textarea rows={3} value={bio} onChange={(e) => { setBio(e.target.value); touch(); }} maxLength={280} className="input-field resize-none" />
                  </Field>
                </div>
              </div>

              {/* Password */}
              <div className="rounded-3xl border border-border">
                <button type="button" onClick={() => setPwOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="flex items-center gap-3">
                    <span className="text-sm font-medium">Change password</span>
                  </span>
                  <span className="text-sm text-ink-soft">{pwOpen ? "Cancel" : "Update"}</span>
                </button>
                <AnimatePresence initial={false}>
                  {pwOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }} className="overflow-hidden">
                      <div className="space-y-4 border-t border-border px-5 py-5">
                        <Field label="New password">
                          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 8 characters" className="input-field" />
                        </Field>
                        <div className="flex gap-1.5">
                          {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < pwScore ? "bg-coral" : "bg-border")} />)}
                        </div>
                        <Field label="Confirm new password">
                          <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Repeat it" className="input-field" />
                          {!confirmMatches && <p className="text-xs text-destructive">Doesn’t match yet.</p>}
                        </Field>
                        <button
                          type="button"
                          onClick={() => void changePassword()}
                          disabled={newPw.length < 8 || newPw !== confirmPw || savingPw}
                          className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          {savingPw && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Update password
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Connected */}
              <div>
                <p className="eyebrow mb-3">Connected accounts</p>
                <div className="border-t border-border">
                  {[{ name: "Google", connected: hasGoogle, action: () => void toggleGoogle(), busy: connectingGoogle }].map((c) => (
                    <div key={c.name} className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-sm text-ink-soft">{c.connected ? `Connected · ${email}` : "Not connected"}</p>
                      </div>
                      <button type="button" onClick={c.action} disabled={c.busy} className="text-sm text-ink-soft transition-colors hover:text-foreground disabled:opacity-50">
                        {c.connected ? "Disconnect" : "Connect"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </SettingSection>

            {/* Travel style */}
            <SettingSection
              id="style"
              title="Travel style"
              blurb="What personalises Discover — new trips start tuned to this."
              action={
                editingStyle ? (
                  <>
                    <button type="button" onClick={cancelStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-ink/25 hover:text-foreground">Cancel</button>
                    <button type="button" onClick={() => void finishStyleEdit()} disabled={savingStyle} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-1.5 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                      {savingStyle && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Done
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={startStyleEdit} className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:border-ink/25">Edit</button>
                )
              }
            >
              <AnimatePresence mode="wait" initial={false}>
                {editingStyle ? (
                  <motion.div key="edit" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }} className="space-y-8">
                    <div>
                      <p className="eyebrow mb-3">Interests</p>
                      <div className="flex flex-wrap gap-2">
                        {INTERESTS.map((i) => <Chip key={i} active={interests.includes(i)} onClick={() => toggleChip(interests, setInterests, i)}>{i}</Chip>)}
                      </div>
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-4">Pace</p>
                        <Segmented options={PACE.map((p) => p.label)} value={PACE[pace]!.label} onChange={(v) => { setPace(PACE.findIndex((p) => p.label === v)); touch(); }} />
                        <p className="mt-3 text-sm text-ink-soft">{PACE[pace]!.note}</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-4">Budget</p>
                        <Segmented options={BUDGET.map((b) => b.label)} value={BUDGET[budget]!.label} onChange={(v) => { setBudget(BUDGET.findIndex((b) => b.label === v)); touch(); }} />
                        <p className="mt-3 text-sm text-ink-soft">{BUDGET[budget]!.note}</p>
                      </div>
                    </div>

                    <div>
                      <p className="eyebrow mb-3">Dietary needs</p>
                      <div className="flex flex-wrap gap-2">
                        {DIETARY.map((d) => <Chip key={d} active={dietary.includes(d)} onClick={() => toggleChip(dietary, setDietary, d)}>{d}</Chip>)}
                      </div>
                      <input className="input-field mt-3 max-w-md" placeholder="Anything else we should know?" value={dietNote} onChange={(e) => { setDietNote(e.target.value); touch(); }} />
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-3">Preferred stay</p>
                        <Segmented options={STAY_TYPES} value={stay} onChange={(v) => { setStay(v); touch(); }} />
                      </div>
                      <div>
                        <p className="eyebrow mb-3">Usually travelling</p>
                        <Segmented options={COMPANIONS} value={companions} onChange={(v) => { setCompanions(v); touch(); }} />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="view" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }} className="space-y-8">
                    <div>
                      <p className="eyebrow mb-3">Interests</p>
                      {interests.length ? (
                        <div className="flex flex-wrap gap-2">{interests.map((i) => <Pill key={i}>{i}</Pill>)}</div>
                      ) : (
                        <p className="text-sm text-ink-soft">No interests picked yet. <button type="button" onClick={startStyleEdit} className="text-coral hover:underline">Add some</button></p>
                      )}
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <ReadRow label="Pace" value={PACE[pace]!.label} note={PACE[pace]!.note} />
                      <ReadRow label="Budget" value={BUDGET[budget]!.label} note={BUDGET[budget]!.note} />
                    </div>

                    <div>
                      <p className="eyebrow mb-3">Dietary needs</p>
                      {dietary.length ? <div className="flex flex-wrap gap-2">{dietary.map((d) => <Pill key={d}>{d}</Pill>)}</div> : <p className="text-sm text-ink-soft">Nothing to avoid.</p>}
                      {dietNote ? <p className="mt-3 text-sm text-ink-soft">{dietNote}</p> : null}
                    </div>

                    <div className="grid gap-8 sm:grid-cols-2">
                      <ReadRow label="Preferred stay" value={stay} />
                      <ReadRow label="Usually travelling" value={companions} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {styleSaved && (
                  <motion.div initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }} className="rounded-2xl border border-coral/25 bg-coral-soft/50 px-5 py-4">
                    <p className="eyebrow mb-1">Travel style saved</p>
                    <p className="text-sm leading-relaxed text-foreground">From now on, {summary}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </SettingSection>

            {/* Notifications & sharing */}
            <SettingSection id="notifications" title="Notifications & sharing" blurb="What we tell you about, and who can see a trip.">
              <div className="border-t border-border">
                <ToggleRow title="Trip updates" note="When something you saved changes — hours, closures, a new review." checked={!!notif.trips} onChange={(v) => { setNotif({ ...notif, trips: v }); touch(); }} />
                <ToggleRow title="Price & weather changes" note="Fare and forecast moves on the dates you're holding." checked={!!notif.prices} onChange={(v) => { setNotif({ ...notif, prices: v }); touch(); }} />
                <ToggleRow title="Collaborator activity" note="When someone you invited edits or comments on a trip." checked={!!notif.collab} onChange={(v) => { setNotif({ ...notif, collab: v }); touch(); }} />
                <ToggleRow title="Weekly ideas" note="A short digest of places that match your travel style." checked={!!notif.weekly} onChange={(v) => { setNotif({ ...notif, weekly: v }); touch(); }} />
                <ToggleRow title="Product news" note="Occasional notes about new things in the workspace." checked={!!notif.product} onChange={(v) => { setNotif({ ...notif, product: v }); touch(); }} />
              </div>

              <div>
                <p className="eyebrow mb-3">Shared links</p>
                {sharedTrips.length ? (
                  <div className="border-t border-border">
                    {sharedTrips.map((s) => (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 last:border-b-0">
                        <div className="flex items-center gap-3">
                          <Link2 className="h-4 w-4 text-ink-soft" />
                          <div>
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="flex items-center gap-1.5 text-sm text-ink-soft"><Eye className="h-3.5 w-3.5" /> Anyone with the link can view</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <button type="button" onClick={() => void copyShareLink(s.slug)} className="inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-foreground">
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </button>
                          <button type="button" onClick={() => void revokeShare(s.id)} className="text-ink-soft transition-colors hover:text-destructive">Revoke</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-ink-soft">No trips are shared publicly right now.</p>
                )}
              </div>
            </SettingSection>

            {/* Danger */}
            <SettingSection id="danger" title="Account data" blurb="Take your planning with you, sign out, or close the account.">
              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
                <div className="mr-auto">
                  <p className="text-sm font-medium">Appearance</p>
                  <p className="text-sm text-ink-soft">Light or dark — follows you to any device you sign into.</p>
                </div>
                <ThemeToggle className="h-10 w-10" />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
                <div className="mr-auto">
                  <p className="text-sm font-medium">Sign out</p>
                  <p className="text-sm text-ink-soft">Ends this session on this device.</p>
                </div>
                <button type="button" onClick={() => void signOutUser().then(() => window.location.assign("/sign-in"))} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">Sign out</button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-b border-border pb-6">
                <Download className="h-4 w-4 text-ink-soft" />
                <div className="mr-auto">
                  <p className="text-sm font-medium">Export my data</p>
                  <p className="text-sm text-ink-soft">Every trip, itinerary item and saved place as a single file.</p>
                </div>
                <button type="button" onClick={() => void exportData()} className="rounded-full border border-border px-4 py-2 text-sm transition-colors hover:bg-secondary">Export</button>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-5">
                <Trash2 className="h-4 w-4 text-destructive" />
                <div className="mr-auto">
                  <p className="text-sm font-medium text-destructive">Delete account</p>
                  <p className="text-sm text-ink-soft">Removes your trips and shared links. This can’t be undone.</p>
                </div>
                <button type="button" onClick={() => setDeleteOpen(true)} className="rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground transition-opacity hover:opacity-90">Delete</button>
              </div>
            </SettingSection>
          </div>
        </div>
      </div>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} ariaLabel="Delete your account">
        <div className="space-y-4 p-6">
          <div>
            <h3 className="font-display text-xl">Delete your account?</h3>
            <p className="mt-1 text-sm text-ink-soft">Your trips, itinerary and shared links will be removed. Type DELETE to confirm.</p>
          </div>
          <input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="DELETE" className="input-field" />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setDeleteOpen(false)} className="rounded-full border border-border px-4 py-2 text-sm">Keep my account</button>
            <button
              type="button"
              onClick={() => void deleteAccount()}
              disabled={deleteConfirm !== "DELETE" || deleting}
              className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm text-destructive-foreground disabled:opacity-50"
            >
              {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Delete everything
            </button>
          </div>
        </div>
      </Sheet>

      {/* Save bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ type: "spring", stiffness: 320, damping: 30 }} className="fixed inset-x-0 bottom-0 z-40 px-5 pb-5 sm:px-8">
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 rounded-full border border-border bg-background/90 px-5 py-3 shadow-lift backdrop-blur-md">
              <p className="text-sm text-ink-soft">You have unsaved changes.</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => router.refresh()} className="text-sm text-ink-soft hover:text-foreground">Discard</button>
                <button type="button" onClick={() => void saveAll()} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-sm text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save changes
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onAnimationComplete={() => setTimeout(() => setSaved(false), 1600)}
            className="fixed inset-x-0 bottom-6 z-40 flex justify-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/90 px-4 py-2 text-sm shadow-soft backdrop-blur-md">
              <Check className="h-4 w-4 text-coral" /> Saved
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
